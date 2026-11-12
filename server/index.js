// Cloud saves for Immune Citadel. A save is an opaque JSON object keyed by a 16-character save code the game generates.
// Knowing the code is the only credential, so codes carry 80 random bits. Without DATABASE_URL it keeps saves in memory (local dev, tests).
const http = require('node:http');
const { isIPv6 } = require('node:net');
const { initSentry, Sentry } = require('./sentry');
const span = () => Sentry.getActiveSpan()?.spanContext(); // the request's trace, while Sentry is on
const log = require('pino')({ level: process.env.LOG_LEVEL || 'info', mixin: () => (span() ? { trace_id: span().traceId, span_id: span().spanId } : {}) }); // JSON lines in Render's logs, findable by trace ID
const route = require('./route');
const play = require('./play');

const CODE = /^[A-HJ-NP-Z2-9]{16}$/; // the game's alphabet: no I, O, 0, 1
const MAX_BODY = 8 * 1024; // a full save is about 1 KB
const MAX_DEPTH = 20; // a real save is a few levels deep; thousands of levels overflow the stack in pg on Node 22 (#57)
const tooDeep = (v, d = 0) => d > MAX_DEPTH || (v !== null && typeof v === 'object' && Object.values(v).some(x => tooDeep(x, d + 1))); // stops at the limit, so it cannot overflow itself
const WRITES_PER_MIN = 120; // per client IP; a player saves a few times per level, a classroom shares one IP
const NEW_SAVES_PER_DAY = 2000; // new save codes a day per server; existing codes always save. 2,000 x 395 days x 8 KB at most ~ 6 GB on a 15 GB disk (#53)
const NEW_SAVES_PER_IP = 10; // new save codes per client address (IPv6: per /64) in 2 minutes, the longest the server may keep an address; one address needs about 6.7 hours to use the server's day (#73, #86)
const PLAY_PER_MIN = 60; // gameplay event batches per client IP: one per level end or hidden tab; never counted against saves
const SCHEMA = process.env.DB_SCHEMA || 'public'; // one schema per environment; each environment has its own Postgres (render.yaml)
if (process.env.DATABASE_URL && !process.env.DB_SCHEMA) throw new Error('DB_SCHEMA must be set with DATABASE_URL, or dev would write into prod');
if (!/^[a-z_][a-z0-9_]*$/.test(SCHEMA)) throw new Error('DB_SCHEMA must be a plain lowercase identifier');
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

function memoryStore() {
  const m = new Map();
  return {
    saves: m,
    init: async () => {},
    get: async code => m.get(code) || null,
    put: async (code, data) => { // null: a new code past the daily cap, nothing stored
      const old = m.get(code), today = new Date().toISOString().slice(0, 10);
      if (!old && [...m.values()].filter(r => r.created === today).length >= NEW_SAVES_PER_DAY) return null;
      const row = { data, updatedAt: new Date().toISOString(), created: old ? old.created : today }; m.set(code, row); return row.updatedAt;
    },
    events: [],
    play: async function (page, release, rows) { if (this.events.length + rows.length > play.DAILY_CAP) return 0; this.events.push(...rows.map(r => ({ page, release, ...r }))); return rows.length; },
    prune: async () => { // same rule as Postgres for saves; events in memory carry no day, so they stay
      let saves = 0; const old = Date.now() - play.KEEP_DAYS * 864e5;
      for (const [code, row] of m) if (Date.parse(row.updatedAt) < old) { m.delete(code); saves++; }
      return { events: 0, saves };
    },
  };
}

function pgStore(url) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url, max: 5 });
  pool.on('error', e => log.error({ err: e.message }, 'postgres idle client')); // a dropped idle connection must not kill the server
  const T = `"${SCHEMA}".saves`, E = `"${SCHEMA}".events`, V = n => `"${SCHEMA}".${n}`;
  let playQ = Promise.resolve(), capDay = null;
  const COLS = ['page', 'release', 'name', 't', 'level', 'mode', 'difficulty', 'outcome', 'first', 'stars', 'wave', 'card', 'secs', 'is_new'];
  return {
    init: async () => {
      await pool.query(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA}"`);
      await pool.query(`CREATE TABLE IF NOT EXISTS ${T} (code text PRIMARY KEY, data json NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
      await pool.query(`ALTER TABLE ${T} ADD COLUMN IF NOT EXISTS created date`); // saves from before the cap keep NULL: they never count as new today
      await pool.query(`ALTER TABLE ${T} ALTER COLUMN created SET DEFAULT current_date`);
      await pool.query(`CREATE INDEX IF NOT EXISTS saves_created ON ${T} (created)`);
      // gameplay events (docs/EVENTS.md): the date only, no time of day, no arrival order, no IP; rows go after KEEP_DAYS
      await pool.query(`CREATE TABLE IF NOT EXISTS ${E} (day date NOT NULL DEFAULT current_date, page text NOT NULL, release text, name text NOT NULL, t integer NOT NULL,
        level smallint, mode text, difficulty text, outcome text, first boolean, stars smallint, wave smallint, card text, secs integer, is_new boolean)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS events_day ON ${E} (day)`);
      // per page load: a start with no end is a level left by closing the tab; an end whose start was lost still counts as a run
      const perPage = `SELECT page, level, mode, difficulty, count(*) FILTER (WHERE name = 'level_start') AS s, count(*) FILTER (WHERE name = 'level_end') AS e,
          count(*) FILTER (WHERE outcome = 'won') AS won, count(*) FILTER (WHERE outcome = 'lost') AS lost, count(*) FILTER (WHERE outcome = 'quit') AS quit,
          count(*) FILTER (WHERE outcome = 'restart') AS restart, count(*) FILTER (WHERE outcome = 'won' AND first) AS first_wins
        FROM ${E} WHERE name IN ('level_start', 'level_end') GROUP BY page, level, mode, difficulty`;
      await pool.query(`CREATE OR REPLACE VIEW ${V('funnel')} AS
        SELECT 0 AS level, 'new browser' AS step, count(*) AS players, NULL::numeric AS abandoned FROM ${E} WHERE name = 'open' AND is_new
        UNION ALL SELECT level, 'first win', sum(first_wins), sum(greatest(s - e, 0)) FROM (${perPage}) p WHERE mode = 'campaign' GROUP BY level
        ORDER BY level`);
      await pool.query(`CREATE OR REPLACE VIEW ${V('level_stats')} AS
        SELECT p.level, p.mode, p.difficulty, sum(greatest(s, e)) AS runs, sum(won) AS won, sum(lost) AS lost, sum(quit) AS quit, sum(restart) AS restart, sum(greatest(s - e, 0)) AS abandoned,
          (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY wave) FROM ${E} l WHERE l.outcome = 'lost' AND l.level = p.level AND l.mode = p.mode AND l.difficulty = p.difficulty) AS median_wave_lost
        FROM (${perPage}) p GROUP BY p.level, p.mode, p.difficulty ORDER BY p.level, p.mode, p.difficulty`);
      await pool.query(`CREATE OR REPLACE VIEW ${V('card_reads')} AS
        SELECT card, count(*) AS closed, percentile_cont(0.5) WITHIN GROUP (ORDER BY secs) AS median_secs, round(avg((secs < 3)::int), 2) AS share_under_3s
        FROM ${E} WHERE name = 'card' GROUP BY card ORDER BY card`);
      await pool.query(`CREATE OR REPLACE VIEW ${V('sittings')} AS
        SELECT day, count(*) AS page_loads, percentile_cont(0.5) WITHIN GROUP (ORDER BY secs) AS median_secs, percentile_cont(0.9) WITHIN GROUP (ORDER BY secs) AS p90_secs
        FROM (SELECT min(day) AS day, max(t) AS secs FROM ${E} GROUP BY page) s GROUP BY day ORDER BY day`);
    },
    play: (page, release, rows) => (playQ = playQ.catch(() => {}).then(async () => { // one at a time, so the count and the insert cannot race (one API process per schema)
      if (!rows.length) return 0;
      const n = (await pool.query(`SELECT count(*)::int AS n FROM ${E} WHERE day = current_date`)).rows[0].n; // counted in the table: a restart does not reset it
      if (n + rows.length > play.DAILY_CAP) { const d = new Date().toDateString(); if (capDay !== d) { capDay = d; log.warn({ rows: n }, 'events daily cap reached'); } return 0; } // a whole batch or nothing: no start without its end
      const vals = rows.flatMap(r => [page, release, ...COLS.slice(2).map(k => r[k])]);
      await pool.query(`INSERT INTO ${E} (${COLS.join(', ')}) VALUES ${rows.map((_, i) => `(${COLS.map((_, j) => '$' + (i * COLS.length + j + 1)).join(', ')})`).join(', ')}`, vals);
      return rows.length;
    })),
    prune: async () => ({ // retention (docs/EVENTS.md, docs/SPEC.md): events and cloud saves untouched for 13 months
      events: (await pool.query(`DELETE FROM ${E} WHERE day < current_date - ${play.KEEP_DAYS}`)).rowCount,
      saves: (await pool.query(`DELETE FROM ${T} WHERE updated_at < now() - interval '${play.KEEP_DAYS} days'`)).rowCount,
    }),
    get: async code => {
      const r = await pool.query(`SELECT data, updated_at FROM ${T} WHERE code = $1`, [code]);
      return r.rows[0] ? { data: r.rows[0].data, updatedAt: r.rows[0].updated_at.toISOString() } : null;
    },
    put: async (code, data) => { // null: a new code past the daily cap, nothing stored; an existing code always updates, counted in the table so a restart does not reset it
      const r = await pool.query(`INSERT INTO ${T} (code, data) SELECT $1::text, $2::json
        WHERE EXISTS (SELECT 1 FROM ${T} WHERE code = $1) OR (SELECT count(*) FROM ${T} WHERE created = current_date) < ${NEW_SAVES_PER_DAY}
        ON CONFLICT (code) DO UPDATE SET data = EXCLUDED.data, updated_at = now() RETURNING updated_at`, [code, data]);
      return r.rows[0] ? r.rows[0].updated_at.toISOString() : null;
    },
  };
}

// shortcut: per-process fixed-window limit, resets on restart; move to the database if the API ever runs on several instances
function limiter(max, ms = 60000) {
  const hits = new Map(); // IPs live here only, never on disk or in logs, and each is deleted the moment its window ends
  const hit = (ip, giveBack = false) => { // true: past max, counted; giveBack returns a count whose action did not happen
    const h = hits.get(ip);
    if (giveBack) { if (h) h.n--; return false; }
    if (h) return ++h.n > max;
    hits.set(ip, { n: 1 }); setTimeout(() => hits.delete(ip), ms).unref(); return false; // one timer per entry: the entry exists until it fires
  };
  return Object.assign(hit, { hits });
}
const limited = limiter(WRITES_PER_MIN), playLimited = limiter(PLAY_PER_MIN);
const newLimited = limiter(NEW_SAVES_PER_IP, 2 * 60000); // never longer than 2 minutes: the in-game notice promises the address is forgotten by then
const net64 = ip => { // IPv6: its /64, which one host can fill with addresses; IPv4 and IPv4-mapped as is
  if (!isIPv6(ip) || ip.includes('.')) return ip;
  const [a, b] = ip.split('::'), head = a ? a.split(':') : [], tail = b ? b.split(':') : [];
  const groups = b === undefined ? head : [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail];
  return groups.slice(0, 4).map(g => parseInt(g, 16).toString(16)).join(':') + '::/64';
};
let capReported = null; // the UTC day the server's cap was last reported to Sentry
const clientIp = req => req.headers['cf-connecting-ip'] || req.socket.remoteAddress; // Render sits behind Cloudflare, which overwrites this header with the real client; X-Forwarded-For starts with whatever the client sent
async function readBody(req) { // the body as text, or null past MAX_BODY
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size <= MAX_BODY) chunks.push(c); } // past the limit, read on and drop: leaving the loop early destroys the socket the proxy reuses (#50)
  return size > MAX_BODY ? null : Buffer.concat(chunks).toString('utf8');
}

// POST /api/play: gameplay events, plain-text JSON so a browser sends it without a CORS preflight. The game never reads the answer.
// A failure here is logged, not sent to Sentry: the save-failure alert stays about saves, and no third party sees play.
async function playRoute(req, res, origin, send, store) {
  try {
    if (req.method !== 'POST') return send(405, { error: 'method not allowed' });
    if (origin && !ORIGINS.includes(origin) && !ORIGINS.includes('*')) return send(204); // another site's page: dropped
    if (playLimited(clientIp(req))) return send(429, { error: 'too many events' });
    const text = await readBody(req); if (text === null) return send(413, { error: 'too large' });
    let body; try { body = play.parse(JSON.parse(text)); } catch { body = null; }
    if (!body) return send(400, { error: 'bad events' });
    await store.play(body.page, body.release, body.rows);
    send(204);
  } catch (e) { log.warn({ err: e.message }, 'events not stored'); if (!res.headersSent) send(204); } // aborted upload, database down: never Sentry
}

function createServer(store) {
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin, t0 = Date.now();
    const send = (status, body) => {
      const h = { 'content-type': 'application/json', 'cache-control': 'no-store', vary: 'Origin' };
      if (origin && (ORIGINS.includes(origin) || ORIGINS.includes('*'))) Object.assign(h, { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, PUT', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' });
      res.writeHead(status, h); res.end(body === undefined ? '' : JSON.stringify(body));
      const line = { method: req.method, route: route(req.url), status, ms: Date.now() - t0 }, level = status >= 500 ? 'error' : 'info';
      if (req.url !== '/health') log[level](line, 'request');
      if (line.route === '/api/save/:code' && req.method !== 'OPTIONS') { // only saves and loads reach Sentry's logs and metrics: play and CORS preflights stay home
        Sentry.logger[level]('request', line);
        Sentry.metrics.distribution('http.server.request.duration', line.ms / 1000, { unit: 'second', attributes: { 'http.request.method': req.method, 'http.route': line.route, 'http.response.status_code': status } }); // OpenTelemetry's name: its count is the rate, its status codes the errors
      }
    };
    try {
      let url; try { url = new URL(req.url, 'http://x'); } catch { return send(400, { error: 'bad request' }); } // a path like // is the caller's error, not a server error
      if (req.method === 'OPTIONS') return send(204);
      if (url.pathname === '/health' && req.method === 'GET') return send(200, { ok: true, commit: process.env.RENDER_GIT_COMMIT || 'local' }); // deploys wait for this commit
      if (url.pathname === '/api/play') return await playRoute(req, res, origin, send, store);
      const m = url.pathname.match(/^\/api\/save\/([^/]+)$/);
      if (!m) return send(404, { error: 'not found' });
      const code = m[1];
      if (!CODE.test(code)) return send(400, { error: 'bad save code' });
      if (req.method === 'GET') {
        const row = await store.get(code);
        return row ? send(200, { save: row.data, updatedAt: row.updatedAt }) : send(404, { error: 'no save for this code' });
      }
      if (req.method === 'PUT') {
        if (limited(clientIp(req))) return send(429, { error: 'too many saves, slow down' });
        const text = await readBody(req); if (text === null) return send(413, { error: 'save too large' });
        let body; try { body = JSON.parse(text); } catch { return send(400, { error: 'body must be JSON' }); }
        const save = body && body.save;
        if (!save || typeof save !== 'object' || Array.isArray(save)) return send(400, { error: 'body must be {"save": {...}}' });
        if (tooDeep(save)) return send(400, { error: 'save nested too deep' });
        if (save.owe !== undefined && !Array.isArray(save.owe)) return send(400, { error: 'owe must be a list' }); // a stored non-list owe broke every sync for its code (#51)
        log.debug({ owed: Array.isArray(save.owe) ? save.owe.filter(Boolean).length : 0 }, 'cards owed'); // how many cards the save still owes the player, at debug level
        log.debug({ difficulty: save.diff, skills: save.diff ? Object.keys(save.mem).length : 0 }, 'immune skills'); // how many immune skills the player has learnt at their difficulty, at debug level
        const fresh = !(await store.get(code)), net = net64(clientIp(req)); // only new codes count: an existing save always updates
        if (fresh && newLimited(net)) return send(429, { error: 'too many new saves from this address, try again in a few minutes' }); // counted now, so parallel new codes cannot all pass
        let updatedAt; try { updatedAt = await store.put(code, save); } catch (e) { if (fresh) newLimited(net, true); throw e; } // a failed store gives the count back too, so retries during a database outage do not use up the address's budget
        if (!updatedAt) { // the player's progress stays on the device and syncs later
          if (fresh) newLimited(net, true); // given back, so a player retrying a refused first save does not use up the address's budget
          log.warn('new saves daily cap reached');
          const day = new Date().toISOString().slice(0, 10);
          if (capReported !== day) { capReported = day; Sentry.captureMessage('new saves daily cap reached', 'warning'); } // once a day, so the Sentry alert emails once; no code, IP or save in it
          return send(429, { error: 'too many new saves today, try again tomorrow' });
        }
        return send(200, { updatedAt });
      }
      send(405, { error: 'method not allowed' });
    } catch (e) {
      if (!req.complete) return log.warn({ method: req.method, route: route(req.url) }, 'client left mid-upload'); // a closed tab is not a server error: no Sentry, no email
      // the fingerprint: every error here shares this one handler's stack, so Sentry's default grouping alone files a new bug under an old Sentry issue, which opens no new incident; sentry.js scrubs save codes from it like the message
      Sentry.captureException(e, { tags: { method: req.method, route: route(req.url) }, fingerprint: ['{{ default }}', String(e.name), String(e.message)] }); // a failed save emails the owner (alert rule in Sentry)
      log.error({ err: e.message }, 'request failed'); send(500, { error: 'server error' });
    }
  });
}

module.exports = { createServer, memoryStore, limiter, net64 };

if (require.main === module) {
  initSentry();
  if (process.env.RENDER && !process.env.DATABASE_URL) { log.fatal('DATABASE_URL is not set: refusing to keep player saves in memory'); process.exit(1); }
  const store = process.env.DATABASE_URL ? pgStore(process.env.DATABASE_URL) : memoryStore();
  store.init().then(async () => {
    const prune = () => store.prune().then(n => (n.events || n.saves) && log.info(n, 'old events and saves deleted')).catch(e => log.warn({ err: e.message }, 'pruning failed'));
    await prune(); setInterval(prune, 864e5).unref(); // daily
    const port = +process.env.PORT || 8787;
    const server = createServer(store).listen(port, () => log.info(`save API on :${port}, ${process.env.DATABASE_URL ? `postgres schema ${SCHEMA}` : 'in-memory store'}, origins ${ORIGINS.join(' ') || 'none'}`));
    process.on('SIGTERM', () => { // on, not once: npm may pass on a second copy of the signal // each deploy stops the old instance: finish the saves in flight, send buffered telemetry, then exit
      log.info('shutting down');
      server.close(() => Sentry.close(2000).finally(() => process.exit(0)));
      setTimeout(() => process.exit(1), 25000).unref(); // before Render's kill at 30 s
    });
  }).catch(e => { log.fatal({ err: e.message }, 'startup failed'); process.exit(1); });
}
