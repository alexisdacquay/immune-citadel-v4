// A failed save reaches Sentry, and nothing that identifies the player goes with it.
const test = require('node:test'), assert = require('node:assert');
process.env.LOG_LEVEL = 'silent';
const { createServer } = require('./index.js');
const { initSentry, Sentry } = require('./sentry.js');

// built at runtime: Sentry attaches nearby source lines to each frame, so literals here would match themselves
const CODE = 'ABCDEFGH' + 'JKMNPQRS', IP = [203, 0, 113, 7].join('.'), COOKIE = ['player', 'me'].join('='), SECRET = ['SECRET', 'CONTENT'].join('-');
const sent = [];
initSentry({ dsn: 'https://key@o1.ingest.sentry.io/1', transport: () => ({ send: async e => { sent.push(e); return {}; }, flush: async () => true }) });

test('a failed save is reported to Sentry without the save code, the save, the IP or cookies', async () => {
  const broken = { get: async () => null, put: async code => { throw new Error(`database down while saving ${code}`); } };
  const srv = createServer(broken); await new Promise(r => srv.listen(0, r));
  try {
    const res = await fetch(`http://localhost:${srv.address().port}/api/save/${CODE}?code=${CODE}`, {
      method: 'PUT', headers: { 'content-type': 'application/json', 'x-forwarded-for': IP, 'cf-connecting-ip': IP, cookie: COOKIE },
      body: JSON.stringify({ save: { marker: SECRET } }),
    });
    assert.equal(res.status, 500);
    await Sentry.flush(2000);
    const out = JSON.stringify(sent);
    assert.match(out, /database down while saving :code/, 'the error is reported, with the code replaced');
    assert.match(out, /"route":"\/api\/save\/:code"/, 'tagged with the route');
    assert.doesNotMatch(out, new RegExp(`${CODE}|${SECRET}|${IP.replace(/\./g, '\\.')}|${COOKIE}`), 'nothing that identifies the player');
  } finally { srv.close(); }
});

test('request traces name the route, never the save code', async () => {
  sent.length = 0;
  const store = { get: async () => null, put: async () => new Date().toISOString() };
  const srv = createServer(store); await new Promise(r => srv.listen(0, r));
  try {
    const url = `http://localhost:${srv.address().port}/api/save/${CODE}`;
    await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ save: { marker: SECRET } }) });
    await fetch(url); await fetch(`http://localhost:${srv.address().port}/health`);
    await Sentry.flush(2000);
    const out = JSON.stringify(sent);
    assert.match(out, /\/api\/save\/:code/, 'a trace was sent, named by route');
    assert.doesNotMatch(out, new RegExp(`${CODE}|${SECRET}`), 'no save code or content');
    assert.doesNotMatch(out, /\/health/, 'health checks are not traced');
  } finally { srv.close(); await Sentry.close(); }
});
