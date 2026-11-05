// Fast checks on what the API tells telemetry: the alert's counter, and that no save code leaks into logs or routes.
const test = require('node:test'), assert = require('node:assert');
const { spawn } = require('node:child_process');
const { metrics } = require('@opentelemetry/api');
const { MeterProvider, MetricReader } = require('@opentelemetry/sdk-metrics');

class Reader extends MetricReader { onForceFlush() {} onShutdown() {} }
const reader = new Reader();
metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] })); // before index.js creates its counter
process.env.LOG_LEVEL = 'silent';
const { createServer, memoryStore } = require('./index.js');
const route = require('./route.js');

const CODE = 'ABCDEFGHJKMNPQRS';
async function saves() { // { ok: n, failed: n } as the alert sees it
  const { resourceMetrics } = await reader.collect(), out = {};
  for (const sm of resourceMetrics.scopeMetrics) for (const m of sm.metrics) if (m.descriptor.name === 'saves')
    for (const p of m.dataPoints) out[p.attributes.outcome] = p.value;
  return out;
}
async function serve(store) {
  const srv = createServer(store); await new Promise(r => srv.listen(0, r));
  return { srv, put: body => fetch(`http://localhost:${srv.address().port}/api/save/${CODE}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) };
}

test('both saves_total series exist at 0 before any save, so the first failure fires the alert', async () => {
  assert.deepEqual(await saves(), { ok: 0, failed: 0 });
});

test('a save counts as ok; a save the database rejects counts as failed', async t => {
  const good = await serve(memoryStore()); t.after(() => good.srv.close());
  assert.equal((await good.put({ save: { a: 1 } })).status, 200);
  const broken = await serve({ ...memoryStore(), put: async () => { throw new Error('column "updated" does not exist'); } }); t.after(() => broken.srv.close());
  assert.equal((await broken.put({ save: { a: 1 } })).status, 500);
  assert.deepEqual(await saves(), { ok: 1, failed: 1 });
});

test('routes hide the save code', () => {
  assert.equal(route(`/api/save/${CODE}`), '/api/save/:code');
  assert.equal(route(`/api/save/${CODE}?x=1`), '/api/save/:code');
  assert.equal(route('/api/save/not-a-code/extra'), '/api/save/:code');
  assert.equal(route('/health'), '/health');
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
