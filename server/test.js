// node --test server/  (in-memory store; the Postgres store is exercised by the dev deploy)
process.env.ALLOWED_ORIGINS = 'https://game.example'; process.env.LOG_LEVEL = 'silent';
const test = require('node:test'), assert = require('node:assert');
const { createServer, memoryStore } = require('./index.js');

test('save API', async t => {
  const srv = createServer(memoryStore()); await new Promise(r => srv.listen(0, r));
  t.after(() => srv.close());
  const base = `http://localhost:${srv.address().port}`, code = 'ABCDEFGHJKMNPQRS';
  const put = (c, body, h = {}) => fetch(`${base}/api/save/${c}`, { method: 'PUT', headers: { 'content-type': 'application/json', ...h }, body: typeof body === 'string' ? body : JSON.stringify(body) });

  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/save/${code}`)).status, 404, 'unknown code');
  assert.equal((await fetch(`${base}/api/save/abc`)).status, 400, 'malformed code');
  assert.equal((await fetch(`${base}/api/save/ABCDEFGHJKMNPQR0`)).status, 400, 'code outside the alphabet');

  const r = await put(code, { save: { stars: [3, 2, 0, 0, 0, 0] } }, { origin: 'https://game.example' });
  assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), 'https://game.example');
  const g = await (await fetch(`${base}/api/save/${code}`)).json();
  assert.deepEqual(g.save.stars, [3, 2, 0, 0, 0, 0]); assert.ok(g.updatedAt);

  assert.equal((await put(code, { save: { a: 1 } }, { origin: 'https://evil.example' })).headers.get('access-control-allow-origin'), null, 'foreign origin gets no CORS grant');
  assert.equal((await put(code, 'not json')).status, 400);
  assert.equal((await put(code, { save: [1, 2] })).status, 400, 'save must be an object');
  assert.equal((await put(code, { nope: 1 })).status, 400);
  assert.equal((await put(code, { save: { x: 'y'.repeat(9000) } })).status, 413);
  assert.equal((await fetch(`${base}/api/save/${code}`, { method: 'OPTIONS', headers: { origin: 'https://game.example' } })).status, 204);
  assert.equal((await fetch(`${base}/api/save/${code}`, { method: 'DELETE' })).status, 405);

  let last; for (let i = 0; i < 130; i++) last = (await put(code, { save: { i } }, { 'x-forwarded-for': `9.9.9.${i}`, 'cf-connecting-ip': '1.2.3.4' })).status;
  assert.equal(last, 429, 'write rate limit keys on the Cloudflare client address, not X-Forwarded-For');
});

test('gameplay events: only known shapes are stored, nothing else gets in', async t => {
  const store = memoryStore(), srv = createServer(store); await new Promise(r => srv.listen(0, r));
  t.after(() => srv.close());
  const base = `http://localhost:${srv.address().port}`, page = '0123456789abcdef';
  const post = (body, h = {}) => fetch(`${base}/api/play`, { method: 'POST', headers: h, body: typeof body === 'string' ? body : JSON.stringify(body) }); // plain text: no CORS preflight
  const ev = (...events) => ({ page, release: 'abc1234', events });
  const start = { name: 'level_start', t: 5, level: 1, mode: 'campaign', difficulty: 'normal' };
  const won = { name: 'level_end', t: 90, level: 1, mode: 'campaign', difficulty: 'normal', outcome: 'won', first: true, stars: 3, wave: 5 };

  assert.equal((await post(ev({ name: 'open', t: 0, new: true }, start, won, { name: 'card', t: 9, card: 'bact', secs: 7 }, { name: 'hide', t: 95 }), { origin: 'https://game.example' })).status, 204);
  assert.deepEqual(store.events.map(e => e.name), ['open', 'level_start', 'level_end', 'card', 'hide']);
  assert.deepEqual(store.events[2], { page, release: 'abc1234', ...won, card: null, secs: null, is_new: null });
  assert.equal(store.events[0].is_new, true);

  store.events.length = 0;
  await post(ev(
    { ...start, extra: 'free text' }, // unknown key
    { ...start, level: 2, mode: 'heroic' }, // no challenge on level 2
    { ...won, stars: null }, // a campaign win has stars
    { ...won, outcome: 'lost', stars: 2 }, // a loss has none
    { ...won, wave: 15 }, { name: 'card', t: 1, card: 'Alice', secs: 3 }, { name: 'nope', t: 1 }, { name: 'hide', t: -1 }, 'x', null,
    { name: 'constructor', t: 1 }, { name: '__proto__', t: 1 }, { name: 'hide', t: 1, toString: 1 }, // inherited names are no event
    { ...start, level: 3, mode: 'iron' }, // kept: a challenge level
  ));
  assert.deepEqual(store.events.map(e => [e.level, e.mode]), [[3, 'iron']], 'bad events dropped one by one, the good one kept');

  assert.equal((await post({ ...ev(start), page: 'ABCDEFGHJKMNPQRS' })).status, 400, 'page id is 16 hex characters, never a save code');
  assert.equal((await post({ ...ev(start), release: 'my name' })).status, 400, 'release is a commit or empty');
  assert.equal((await post({ ...ev(start), page: [page] })).status, 400, 'page must be a string');
  assert.equal((await post({ ...ev(start), release: ['abc1234'] })).status, 400, 'release must be a string');
  assert.equal((await post({ page, release: '', events: Array(21).fill(start) })).status, 400, 'at most 20 events a request');
  assert.equal((await post('not json')).status, 400);
  assert.equal((await post('x'.repeat(9000))).status, 413);
  assert.equal((await fetch(`${base}/api/play`)).status, 405);

  store.events.length = 0;
  assert.equal((await post(ev(start), { origin: 'https://evil.example' })).status, 204); assert.equal(store.events.length, 0, 'another site cannot post');

  store.events.length = 1998; await post(ev(start, won)); assert.equal(store.events.length, 2000, 'a batch that fits is stored');
  store.events.length = 1999; await post(ev(start, won)); assert.equal(store.events.length, 1999, 'a batch past the daily cap is dropped whole: no start without its end');

  let last; for (let i = 0; i < 61; i++) last = (await post(ev(start), { 'cf-connecting-ip': '5.6.7.8' })).status;
  assert.equal(last, 429, 'events have their own rate limit');
  assert.equal((await fetch(`${base}/api/save/ABCDEFGHJKMNPQRS`, { method: 'PUT', headers: { 'cf-connecting-ip': '5.6.7.8' }, body: JSON.stringify({ save: { a: 1 } }) })).status, 200, 'and never use up the save budget');
});
