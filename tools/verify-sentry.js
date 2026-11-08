// Monitoring still works (docs/OPERATIONS.md#follow-one-save). After each deploy to dev or production, CI's "deployed" job runs it:
// one real save on the live API under a trace ID chosen here, then Sentry's own API must return that trace, its log line
// and its metric. Exit 1 if any is missing within the limit, so the run goes red and GitHub emails the owner. It catches the
// silent failure where monitoring stops (a missing SENTRY_DSN, a broken SDK) and Sentry simply shows nothing.
// Env: API (base URL), SENTRY_AUTH_TOKEN (scopes org:read, project:read, event:read), SENTRY_ORG (default myown-76),
// SENTRY_PROJECT (default immune-citadel-api), SENTRY_URL (default https://de.sentry.io, the EU region), MINUTES (default 5). Any coding agent can run it the same way.
const crypto = require('node:crypto');
const CODE = 'CHECKSAVEZZZZZZZ'; // the one save this check overwrites on each deploy, so the database never grows; public on purpose, it guards nothing
const WANT = { // Sentry dataset → the fields that prove one row of it
  spans: ['id', 'span.op', 'trace'],
  logs: ['message', 'trace'],
  tracemetrics: ['metric.name', 'value', 'trace'],
};

async function save(api, trace, publicKey) { // the trace ID travels in Sentry's own headers, so the check knows it in advance;
  // without baggage naming the project's public key, Sentry rejects the spans (invalid: missing_dsc, seen 2026-11-07)
  const r = await fetch(`${api}/api/save/${CODE}`, {
    method: 'PUT', signal: AbortSignal.timeout(90000),
    headers: { 'content-type': 'application/json', 'sentry-trace': `${trace}-${crypto.randomBytes(8).toString('hex')}-1`,
      baggage: `sentry-trace_id=${trace},sentry-public_key=${publicKey},sentry-sampled=true,sentry-sample_rate=1` },
    body: JSON.stringify({ save: { check: new Date().toISOString() } }),
  });
  return r.status;
}

async function verify({ status, query, deadline, wait }) {
  if (status !== 200) return { ok: false, msg: `the save answered ${status}, not 200` };
  const found = {};
  for (;;) {
    for (const d of Object.keys(WANT)) if (!found[d]) found[d] = (await query(d).catch(() => [])).length > 0;
    const missing = Object.keys(WANT).filter(d => !found[d]);
    if (!missing.length) return { ok: true, msg: 'in Sentry: the trace, its log line and its metric' };
    if (Date.now() > deadline) return { ok: false, msg: `not in Sentry: ${missing.join(', ')}` };
    await wait();
  }
}

if (require.main === module) {
  const { API: api, SENTRY_AUTH_TOKEN: token, SENTRY_ORG: org = 'myown-76', SENTRY_PROJECT: project = 'immune-citadel-api', SENTRY_URL: base = 'https://de.sentry.io', MINUTES = 5 } = process.env;
  if (!api || !token) { console.error('Set API and SENTRY_AUTH_TOKEN'); process.exit(1); }
  const trace = crypto.randomBytes(16).toString('hex'), auth = { authorization: `Bearer ${token}` };
  const query = async d => {
    const q = new URLSearchParams({ dataset: d, query: `trace:${trace}`, statsPeriod: '1h', project: '-1', per_page: '5' });
    for (const f of WANT[d]) q.append('field', f);
    const r = await fetch(`${base}/api/0/organizations/${org}/events/?${q}`, { headers: auth });
    if (!r.ok) { console.error(`${d}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); return []; }
    return (await r.json()).data;
  };
  (async () => {
    const keys = await fetch(`${base}/api/0/projects/${org}/${project}/keys/`, { headers: auth }).then(r => r.json()).catch(() => []);
    if (!keys[0]?.public) { console.error(`cannot read the public key of ${org}/${project}`); process.exit(1); }
    const status = await save(api, trace, keys[0].public).catch(e => `error (${e.message})`);
    console.log(`save ${CODE.slice(0, 4)}… on ${api}: ${status}, trace ${trace}`);
    const r = await verify({ status, query, deadline: Date.now() + MINUTES * 60000, wait: () => new Promise(res => setTimeout(res, 10000)) });
    console.log(r.msg); console.log(`Follow this save: https://${org}.sentry.io/explore/traces/trace/${trace}/`);
    process.exit(r.ok ? 0 : 1);
  })();
}
module.exports = { verify, WANT };
