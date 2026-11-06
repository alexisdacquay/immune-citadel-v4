// Cloud saves for Immune Citadel. A save is an opaque JSON object keyed by a 16-character save code the game generates.
// Knowing the code is the only credential, so codes carry 80 random bits. Without DATABASE_URL it keeps saves in memory (local dev, tests).
const http = require('node:http');
const log = require('pino')({ level: process.env.LOG_LEVEL || 'info' }); // JSON lines, read in Render's logs
const route = require('./route');
const { initSentry, Sentry } = require('./sentry');

const CODE = /^[A-HJ-NP-Z2-9]{16}$/; // the game's alphabet: no I, O, 0, 1
const MAX_BODY = 8 * 1024; // a full save is about 1 KB
const WRITES_PER_MIN = 120; // per client IP; a player saves a few times per level, a classroom shares one IP
const SCHEMA = process.env.DB_SCHEMA || 'public'; // prod and dev share one Postgres instance, one schema each
if (process.env.DATABASE_URL && !process.env.DB_SCHEMA) throw new Error('DB_SCHEMA must be set with DATABASE_URL, or dev would write into prod');
if (!/^[a-z_][a-z0-9_]*$/.test(SCHEMA)) throw new Error('DB_SCHEMA must be a plain lowercase identifier');
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

function memoryStore() {
  const m = new Map();
  return {
    init: async () => {},
    get: async code => m.get(code) || null,
    put: async (code, data) => { const row = { data, updatedAt: new Date().toISOString() }; m.set(code, row); return row.updatedAt; },
  };
}

function pgStore(url) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url, max: 5 });
  pool.on('error', e => log.error({ err: e.message }, 'postgres idle client')); // a dropped idle connection must not kill the server
  const T = `"${SCHEMA}".saves`;
  return {
    init: async () => {
      await pool.query(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA}"`);
      await pool.query(`CREATE TABLE IF NOT EXISTS ${T} (code text PRIMARY KEY, data json NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
    },
    get: async code => {
      const r = await pool.query(`SELECT data, updated_at FROM ${T} WHERE code = $1`, [code]);
      return r.rows[0] ? { data: r.rows[0].data, updatedAt: r.rows[0].updated_at.toISOString() } : null;
    },
    put: async (code, data) => {
      const r = await pool.query(`INSERT INTO ${T} (code, data) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET data = EXCLUDED.data, updated_at = now() RETURNING updated_at`, [code, data]);
      return r.rows[0].updated_at.toISOString();
    },
  };
}

// shortcut: per-process fixed-window limit, resets on restart; move to the database if the API ever runs on several instances
const hits = new Map();
function limited(ip) {
  const now = Date.now(), h = hits.get(ip);
  if (!h || now - h.t > 60000) {
    if (hits.size > 10000) for (const [k, v] of hits) if (now - v.t > 60000) hits.delete(k); // drop expired windows, never live ones
    hits.set(ip, { t: now, n: 1 }); return false;
  }
  return ++h.n > WRITES_PER_MIN;
}

function createServer(store) {
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin, t0 = Date.now();
    const send = (status, body) => {
      const h = { 'content-type': 'application/json', 'cache-control': 'no-store', vary: 'Origin' };
      if (origin && (ORIGINS.includes(origin) || ORIGINS.includes('*'))) Object.assign(h, { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, PUT', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' });
      res.writeHead(status, h); res.end(body === undefined ? '' : JSON.stringify(body));
      if (req.url !== '/health') log[status >= 500 ? 'error' : 'info']({ method: req.method, route: route(req.url), status, ms: Date.now() - t0 }, 'request');
    };
    try {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'OPTIONS') return send(204);
      if (url.pathname === '/health' && req.method === 'GET') return send(200, { ok: true, commit: process.env.RENDER_GIT_COMMIT || 'local' }); // deploys wait for this commit
      const m = url.pathname.match(/^\/api\/save\/([^/]+)$/);
      if (!m) return send(404, { error: 'not found' });
      const code = m[1];
      if (!CODE.test(code)) return send(400, { error: 'bad save code' });
      if (req.method === 'GET') {
        const row = await store.get(code);
        return row ? send(200, { save: row.data, updatedAt: row.updatedAt }) : send(404, { error: 'no save for this code' });
      }
      if (req.method === 'PUT') {
        const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress; // Render sits behind Cloudflare, which overwrites this header with the real client; X-Forwarded-For starts with whatever the client sent
        if (limited(ip)) return send(429, { error: 'too many saves, slow down' });
        let size = 0; const chunks = [];
        for await (const c of req) { size += c.length; if (size > MAX_BODY) return send(413, { error: 'save too large' }); chunks.push(c); }
        let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: 'body must be JSON' }); }
        const save = body && body.save;
        if (!save || typeof save !== 'object' || Array.isArray(save)) return send(400, { error: 'body must be {"save": {...}}' });
        const updatedAt = await store.put(code, save);
        return send(200, { updatedAt });
      }
      send(405, { error: 'method not allowed' });
    } catch (e) {
      Sentry.captureException(e, { tags: { method: req.method, route: route(req.url) } }); // a failed save emails the owner (alert rule in Sentry)
      log.error({ err: e.message }, 'request failed'); send(500, { error: 'server error' });
    }
  });
}

module.exports = { createServer, memoryStore };

if (require.main === module) {
  initSentry();
  if (process.env.RENDER && !process.env.DATABASE_URL) { log.fatal('DATABASE_URL is not set: refusing to keep player saves in memory'); process.exit(1); }
  const store = process.env.DATABASE_URL ? pgStore(process.env.DATABASE_URL) : memoryStore();
  store.init().then(() => {
    const port = +process.env.PORT || 8787;
    createServer(store).listen(port, () => log.info(`save API on :${port}, ${process.env.DATABASE_URL ? `postgres schema ${SCHEMA}` : 'in-memory store'}, origins ${ORIGINS.join(' ') || 'none'}`));
  }).catch(e => { log.fatal({ err: e.message }, 'startup failed'); process.exit(1); });
}
