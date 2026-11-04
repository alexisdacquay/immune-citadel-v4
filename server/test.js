// node --test server/  (in-memory store; the Postgres store is exercised by the dev deploy)
process.env.ALLOWED_ORIGINS = 'https://game.example';
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
  assert.equal((await put(code, { save: { x: 'y'.repeat(70000) } })).status, 413);
  assert.equal((await fetch(`${base}/api/save/${code}`, { method: 'OPTIONS', headers: { origin: 'https://game.example' } })).status, 204);
  assert.equal((await fetch(`${base}/api/save/${code}`, { method: 'DELETE' })).status, 405);

  let last; for (let i = 0; i < 40; i++) last = (await put(code, { save: { i } })).status;
  assert.equal(last, 429, 'write rate limit');
});
