// Save API unit tests on the in-memory store; Postgres is covered by test/integration.test.js.
process.env.ALLOWED_ORIGINS = 'https://game.example'; process.env.LOG_LEVEL = 'silent';
const test = require('node:test'), assert = require('node:assert'), http = require('node:http');
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
  assert.equal((await put(code, { save: { owe: 'not an array' } })).status, 200, 'non-array owe is not a server error');
  assert.equal((await put(code, { nope: 1 })).status, 400);
  assert.equal((await put(code, { save: { x: 'y'.repeat(9000) } })).status, 413);
  const deep = '{"save":{"a":' + '['.repeat(4000) + ']'.repeat(4000) + '}}'; // fits in 8 KB; overflowed the stack writing to Postgres on Node 22 (#57)
  assert.equal((await put(code, deep)).status, 400, 'a save nested thousands of levels deep is refused');
  assert.deepEqual((await (await fetch(`${base}/api/save/${code}`)).json()).save, { owe: 'not an array' }, 'and never reaches the store');
  assert.equal((await fetch(`${base}/api/save/${code}`, { method: 'OPTIONS', headers: { origin: 'https://game.example' } })).status, 204);
  assert.equal((await fetch(`${base}/api/save/${code}`, { method: 'DELETE' })).status, 405);

  let last; for (let i = 0; i < 130; i++) last = (await put(code, { save: { i } }, { 'x-forwarded-for': `9.9.9.${i}`, 'cf-connecting-ip': '1.2.3.4' })).status;
  assert.equal(last, 429, 'write rate limit keys on the Cloudflare client address, not X-Forwarded-For');
});

test('an upload over 8 KB gets 413 and leaves the connection usable for the next request (#50)', async t => {
  const srv = createServer(memoryStore()), agent = new http.Agent({ keepAlive: true, maxSockets: 1 }); // one kept-alive connection, as a proxy reuses it
  await new Promise(r => srv.listen(0, r)); t.after(() => { agent.destroy(); srv.close(); });
  const send = (method, body) => new Promise((resolve, reject) => {
    const r = http.request({ port: srv.address().port, method, path: '/api/save/ABCDEFGHJKMNPQRS', agent }, res => { res.resume(); res.on('end', () => resolve({ status: res.statusCode, reused: r.reusedSocket })); });
    r.on('error', reject); r.end(body);
  });
  assert.equal((await send('PUT', JSON.stringify({ save: { x: 'y'.repeat(200000) } }))).status, 413);
  assert.deepEqual(await send('GET'), { status: 404, reused: true }, 'answered on the same connection, not reset');
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

test('past the daily cap of new save codes, a new code gets 429 and is not stored, an existing save still updates (#53)', async t => {
  const store = memoryStore(), srv = createServer(store); await new Promise(r => srv.listen(0, r));
  t.after(() => srv.close());
  const base = `http://localhost:${srv.address().port}`, day = d => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
  const put = c => fetch(`${base}/api/save/${c}`, { method: 'PUT', body: JSON.stringify({ save: { st: [1] } }) });
  assert.equal((await put('ABCDEFGHJKMNPQRS')).status, 200);
  for (let i = 1; i < 2000; i++) store.saves.set('FILL' + i, { data: {}, updatedAt: '', created: day(0) }); // 2,000 codes new today
  assert.equal((await put('ABCDEFGHJKMNPQRT')).status, 429, 'a new code past the cap is refused');
  assert.equal(await store.get('ABCDEFGHJKMNPQRT'), null, 'and nothing is stored');
  assert.equal((await put('ABCDEFGHJKMNPQRS')).status, 200, 'an existing save still updates');
  for (const r of store.saves.values()) r.created = day(1);
  assert.equal((await put('ABCDEFGHJKMNPQRT')).status, 200, 'codes created on earlier days do not count');
});

test('cloud saves untouched for 13 months are pruned, newer ones stay', async () => {
  const store = memoryStore(), day = 864e5, at = d => new Date(Date.now() - d * day).toISOString();
  store.saves.set('ABCDEFGHJKMNPQRS', { data: { a: 1 }, updatedAt: at(396) });
  store.saves.set('ABCDEFGHJKMNPQRT', { data: { a: 2 }, updatedAt: at(394) });
  await store.put('ABCDEFGHJKMNPQRU', { a: 3 });
  assert.deepEqual(await store.prune(), { events: 0, saves: 1 });
  assert.equal(await store.get('ABCDEFGHJKMNPQRS'), null, 'older than 395 days: deleted');
  assert.ok(await store.get('ABCDEFGHJKMNPQRT') && await store.get('ABCDEFGHJKMNPQRU'), 'newer saves kept');
});
