// Save API unit tests on the in-memory store; Postgres is covered by test/integration.test.js.
process.env.ALLOWED_ORIGINS = 'https://game.example'; process.env.LOG_LEVEL = 'silent';
const test = require('node:test'), assert = require('node:assert'), http = require('node:http');
const { createServer, memoryStore, limiter } = require('./index.js');
const { Sentry } = require('./sentry');

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
  for (const owe of ['not an array', 5, { a: 1 }, null]) assert.equal((await put(code, { save: { owe } })).status, 400, `non-list owe ${JSON.stringify(owe)} is refused`);
  assert.equal((await put(code, { save: { rch: 2 } })).status, 200, 'a save with a reached specimen and no stars list is stored, not a 500 (#142)');
  assert.deepEqual((await (await fetch(`${base}/api/save/${code}`)).json()).save, { rch: 2 });
  assert.equal((await put(code, { save: { owe: ['fever'] } })).status, 200, 'a list of owed cards is kept');
  assert.equal((await put(code, { nope: 1 })).status, 400);
  assert.equal((await put(code, { save: { x: 'y'.repeat(9000) } })).status, 413);
  const deep = '{"save":{"a":' + '['.repeat(4000) + ']'.repeat(4000) + '}}'; // fits in 8 KB; overflowed the stack writing to Postgres on Node 22 (#57)
  assert.equal((await put(code, deep)).status, 400, 'a save nested thousands of levels deep is refused');
  assert.deepEqual((await (await fetch(`${base}/api/save/${code}`)).json()).save, { owe: ['fever'] }, 'and never reaches the store');
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
  const store = memoryStore(), srv = createServer(store), sent = t.mock.method(Sentry, 'captureMessage', () => {}); await new Promise(r => srv.listen(0, r));
  t.after(() => srv.close());
  const base = `http://localhost:${srv.address().port}`, day = d => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
  const put = c => fetch(`${base}/api/save/${c}`, { method: 'PUT', body: JSON.stringify({ save: { st: [1] } }) });
  assert.equal((await put('ABCDEFGHJKMNPQRS')).status, 200);
  for (let i = 1; i < 2000; i++) store.saves.set('FILL' + i, { data: {}, updatedAt: '', created: day(0) }); // 2,000 codes new today
  assert.equal((await put('ABCDEFGHJKMNPQRT')).status, 429, 'a new code past the cap is refused');
  assert.equal(await store.get('ABCDEFGHJKMNPQRT'), null, 'and nothing is stored');
  assert.equal((await put('ABCDEFGHJKMNPQRU')).status, 429);
  assert.deepEqual(sent.mock.calls.map(c => c.arguments), [['new saves daily cap reached', 'warning']], 'reported to Sentry once a day, with no code, IP or save (#73)');
  assert.equal((await put('ABCDEFGHJKMNPQRS')).status, 200, 'an existing save still updates');
  for (const r of store.saves.values()) r.created = day(1);
  assert.equal((await put('ABCDEFGHJKMNPQRT')).status, 200, 'codes created on earlier days do not count');
});

test('one address gets 10 new save codes per 2 minutes; its existing saves still update and other addresses still start new ones (#73, #86)', async t => {
  const store = memoryStore(), srv = createServer(store); await new Promise(r => srv.listen(0, r));
  t.after(() => srv.close());
  const base = `http://localhost:${srv.address().port}`, A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', code = i => 'ABCDEFGHJKMNPQ' + A[i >> 5] + A[i & 31];
  const put = (c, ip) => fetch(`${base}/api/save/${c}`, { method: 'PUT', headers: { 'cf-connecting-ip': ip }, body: JSON.stringify({ save: { st: [1] } }) });
  t.mock.method(store, 'put', async () => null); // the server's cap is full
  for (let i = 0; i < 5; i++) assert.equal((await put(code(0), '7.7.7.7')).status, 429, 'a first save refused by the server cap');
  t.mock.restoreAll();
  for (let i = 0; i < 10; i++) assert.equal((await put(code(i), '7.7.7.7')).status, 200, 'its retries did not use up the budget');
  assert.equal((await put(code(100), '7.7.7.7')).status, 429, 'the 11th new code from one address is refused');
  assert.equal(await store.get(code(100)), null, 'and nothing is stored');
  assert.equal((await put(code(0), '7.7.7.7')).status, 200, 'a save that exists still updates from that address');
  assert.equal((await put(code(100), '8.8.8.8')).status, 200, 'another address still starts a new code');
});

test('parallel new codes from one address cannot pass its budget together (#86)', async t => {
  const store = memoryStore(), srv = createServer(store), put0 = store.put; await new Promise(r => srv.listen(0, r));
  t.after(() => srv.close());
  t.mock.method(store, 'put', async (...a) => { await new Promise(r => setTimeout(r, 100)); return put0(...a); }); // every request is checked before any is stored
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', put = i => fetch(`http://localhost:${srv.address().port}/api/save/ABCDEFGHJKMNPQ${A[i]}2`, { method: 'PUT', headers: { 'cf-connecting-ip': '6.6.6.6' }, body: JSON.stringify({ save: { st: [1] } }) });
  const statuses = await Promise.all(Array.from({ length: 15 }, (_, i) => put(i).then(r => r.status)));
  assert.deepEqual([statuses.filter(s => s === 200).length, statuses.filter(s => s === 429).length], [10, 5], '10 stored, 5 refused');
});

test('a new code whose store fails does not use up the budget of its address (#86)', async t => {
  const store = memoryStore(), srv = createServer(store); await new Promise(r => srv.listen(0, r));
  t.after(() => srv.close());
  t.mock.method(Sentry, 'captureException', () => {});
  const down = t.mock.method(store, 'put', async () => { throw new Error('database down'); });
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', put = i => fetch(`http://localhost:${srv.address().port}/api/save/ABCDEFGHJKMNPQ${A[i]}4`, { method: 'PUT', headers: { 'cf-connecting-ip': '8.8.4.4' }, body: JSON.stringify({ save: { st: [1] } }) });
  for (let i = 0; i < 12; i++) assert.equal((await put(i)).status, 500, 'the database is down');
  down.mock.restore();
  assert.equal((await put(12)).status, 200, 'once it is back, the same address still starts a new code');
});

test('two different errors in the save API are two Sentry issues: the fingerprint adds the type and message to the default grouping', async t => {
  const errors = [new Error('database down'), new TypeError('save.owe.filter is not a function')];
  const srv = createServer({ get: async () => null, put: async () => { throw errors.shift(); } }), sent = t.mock.method(Sentry, 'captureException', () => {});
  await new Promise(r => srv.listen(0, r)); t.after(() => srv.close());
  const put = () => fetch(`http://localhost:${srv.address().port}/api/save/ABCDEFGHJKMNPQR5`, { method: 'PUT', body: JSON.stringify({ save: { st: [1] } }) });
  assert.equal((await put()).status, 500); assert.equal((await put()).status, 500);
  assert.deepEqual(sent.mock.calls.map(c => c.arguments[1].fingerprint), [['{{ default }}', 'Error', 'database down'], ['{{ default }}', 'TypeError', 'save.owe.filter is not a function']]);
});

test('IPv6: the new-code budget is per /64, so one host cannot rotate addresses inside it (#86)', async t => {
  const store = memoryStore(), srv = createServer(store); await new Promise(r => srv.listen(0, r));
  t.after(() => srv.close());
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', put = (i, ip) => fetch(`http://localhost:${srv.address().port}/api/save/ABCDEFGHJKMNPQ${A[i]}3`, { method: 'PUT', headers: { 'cf-connecting-ip': ip }, body: JSON.stringify({ save: { st: [1] } }) });
  for (let i = 0; i < 10; i++) assert.equal((await put(i, `2001:db8:1:2::${i + 1}`)).status, 200, 'ten addresses in one /64');
  assert.equal((await put(10, '2001:0DB8:0001:0002:ffff:0:0:b')).status, 429, 'any other address in that /64, however written, is refused');
  assert.equal((await put(11, '2001:db8:1:3::1')).status, 200, 'the next /64 is another network');
});

test('every address is deleted from memory the moment its window ends: 2 minutes for new codes, 1 for writes (#86)', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fresh = limiter(10, 2 * 60000), writes = limiter(120);
  for (let i = 0; i < 10; i++) assert.equal(fresh('7.7.7.7'), false);
  assert.equal(fresh('7.7.7.7'), true, 'the 11th is past the budget');
  fresh('8.8.8.8', true); assert.equal(fresh.hits.has('8.8.8.8'), false, 'giving back never stores an address');
  writes('7.7.7.7');
  t.mock.timers.tick(60000); assert.equal(writes.hits.size, 0, 'the write limit forgets it after 1 minute');
  t.mock.timers.tick(59999); assert.equal(fresh.hits.size, 1, 'kept during its window');
  t.mock.timers.tick(1); assert.equal(fresh.hits.size, 0, 'deleted when the 2 minutes end');
  assert.equal(fresh('7.7.7.7'), false, 'and the next new code starts a fresh budget');
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
