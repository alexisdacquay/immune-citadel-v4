// Fast checks on what the API tells its logs: no save code leaks into logs or routes.
const test = require('node:test'), assert = require('node:assert');
const { spawn } = require('node:child_process');
const route = require('./route.js');

const CODE = 'ABCDEFGHJKMNPQRS';
test('routes hide the save code', () => {
  assert.equal(route(`/api/save/${CODE}`), '/api/save/:code');
  assert.equal(route(`/api/save/${CODE}?x=1`), '/api/save/:code');
  assert.equal(route('/api/save/not-a-code/extra'), '/api/save/:code');
  assert.equal(route('/health'), '/health');
  // #52: a hand-written path must not slip a code past the redaction
  for (const u of [`//api/save/${CODE}`, `/x/../api/save/${CODE}`, `/API/SAVE/${CODE}`, `/api%2Fsave%2F${CODE}`, `/api/save%2F${CODE.toLowerCase()}`, `/%61pi/save/${CODE}`])
    assert.equal(route(u), '/api/save/:code', u);
  assert.equal(route(`/anything/${CODE.toLowerCase()}`), '/anything/:code', 'a code anywhere else in the path');
  assert.equal(route('/%E0%A4%A'), '/%E0%A4%A', 'a malformed encoding is kept, not thrown on');
  assert.equal(route(undefined), '');
});

test('the running API never writes a save code or save content to its logs', async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const api = spawn(process.execPath, ['index.js'], { cwd: __dirname, env: { ...process.env, PORT: String(port), LOG_LEVEL: 'info', RENDER: '' } });
  let logs = ''; api.stdout.on('data', c => logs += c); api.stderr.on('data', c => logs += c);
  try {
    for (let i = 0; i < 50 && !logs.includes('save API on'); i++) await new Promise(r => setTimeout(r, 50));
    const url = `http://localhost:${port}/api/save/${CODE}`;
    await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ save: { marker: 'SECRET-CONTENT' } }) });
    await fetch(url); await fetch(`http://localhost:${port}/api/save/BADCODE`);
    await new Promise(r => setTimeout(r, 100));
    assert.match(logs, /"route":"\/api\/save\/:code"/, 'requests are logged');
    assert.doesNotMatch(logs, new RegExp(`${CODE}|SECRET-CONTENT|BADCODE`), 'no code or save content in logs');
  } finally { api.kill(); }
});
