// The running API against a fake Sentry: one save is one trace, one log line and one metric under one trace ID, the same ID
// as its Render log line; nothing that identifies the player leaves; play stays home; a closed tab is no error;
// a deploy finishes the saves in flight and delivers buffered telemetry; a Sentry outage never fails a save.
const test = require('node:test'), assert = require('node:assert');
const http = require('node:http'), net = require('node:net'), zlib = require('node:zlib');
const { spawn } = require('node:child_process');

// built at runtime, so the values never appear in this file's text
const CODE = 'ABCDEFGH' + 'JKMNPQRS', IP = [203, 0, 113, 7].join('.'), UA = ['KidTablet', '9.9'].join('/'), SECRET = ['SECRET', 'CONTENT'].join('-');

function fakeSentry() { // a local ingest that keeps every envelope item
  const items = [], srv = http.createServer((req, res) => {
    const chunks = []; req.on('data', c => chunks.push(c)).on('end', () => {
      let body = Buffer.concat(chunks); if (req.headers['content-encoding'] === 'gzip') body = zlib.gunzipSync(body);
      const lines = body.toString().split('\n').filter(Boolean);
      for (let i = 1; i + 1 < lines.length; i += 2) items.push({ type: JSON.parse(lines[i]).type, raw: lines[i + 1], payload: JSON.parse(lines[i + 1]) });
      res.end('{}');
    });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ items, port: srv.address().port, close: () => srv.close() })));
}

async function startApi(dsn) {
  const port = 20000 + Math.floor(Math.random() * 20000), env = { ...process.env, PORT: String(port), LOG_LEVEL: 'info', RENDER: '', SENTRY_DSN: dsn, SENTRY_ENVIRONMENT: 'test' };
  delete env.DATABASE_URL;
  const api = spawn(process.execPath, ['index.js'], { cwd: __dirname, env });
  const out = { text: '' }; api.stdout.on('data', c => out.text += c); api.stderr.on('data', c => out.text += c);
  const exited = new Promise(r => api.on('exit', code => r(code)));
  for (let i = 0; i < 300 && !out.text.includes('save API on'); i++) await new Promise(r => setTimeout(r, 50)); // up to 15 s: a slow CI runner took over 5 s (PR #95)
  if (!out.text.includes('save API on')) { api.kill('SIGKILL'); throw new Error('the API did not start: ' + out.text.slice(-500)); }
  return { api, port, out, exited, base: `http://127.0.0.1:${port}` };
}
const lines = text => text.split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l));

test('one save: trace, log line and metric share one trace ID with the Render log line, and nothing identifies the player', async () => {
  const sentry = await fakeSentry(), a = await startApi(`http://key@127.0.0.1:${sentry.port}/1`);
  try {
    const res = await fetch(`${a.base}/api/save/${CODE}?note=${SECRET}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'user-agent': UA, 'cf-connecting-ip': IP, 'x-forwarded-for': IP }, body: JSON.stringify({ save: { marker: SECRET } }) });
    assert.equal(res.status, 200);
    assert.equal((await fetch(`${a.base}/api/save/${CODE}`)).status, 200, 'a load');
    assert.equal((await fetch(`${a.base}/api/save/${CODE}`, { method: 'OPTIONS', headers: { origin: 'https://example.org', 'access-control-request-method': 'PUT' } })).status, 204, 'a CORS preflight');
    await fetch(`${a.base}/api/play`, { method: 'POST', body: JSON.stringify({ page: '0123456789abcdef', release: '', events: [{ name: 'hide', t: 1 }] }) });
    await new Promise(r => { const s = net.connect(a.port, '127.0.0.1', () => { // a child closes the tab mid-save
      s.write(`PUT /api/save/${CODE} HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 500\r\n\r\n{"save":`); setTimeout(() => { s.destroy(); setTimeout(r, 200); }, 100); }); });
    a.api.kill('SIGTERM'); assert.equal(await a.exited, 0, 'a deploy stops the API cleanly');

    const render = lines(a.out.text).find(l => l.msg === 'request' && l.method === 'PUT' && l.status === 200);
    assert.match(render?.trace_id || '', /^[0-9a-f]{32}$/, 'the Render log line carries the trace ID');
    const of = type => sentry.items.filter(i => i.type === type).flatMap(i => i.payload.items || [i.payload]);
    const logs = of('log').filter(l => l.trace_id === render.trace_id), metrics = of('trace_metric').filter(m => m.trace_id === render.trace_id);
    assert.equal(logs.length, 1, 'one Sentry log line for the save, delivered before exit');
    assert.equal(logs[0].attributes.status.value, 200);
    assert.equal(metrics.length, 1, 'one metric point for the save, delivered before exit');
    assert.equal(metrics[0].name, 'http.server.request.duration');
    assert.equal(metrics[0].attributes['http.response.status_code'].value, 200);
    assert.equal(metrics[0].attributes['http.request.method'].value, 'PUT'); assert.equal(metrics[0].attributes['http.route'].value, '/api/save/:code');
    const load = lines(a.out.text).find(l => l.msg === 'request' && l.method === 'GET' && l.status === 200);
    assert.equal(of('log').filter(l => l.trace_id === load?.trace_id).length, 1, 'one Sentry log line for the load');
    assert.deepEqual(of('trace_metric').filter(m => m.trace_id === load?.trace_id).map(m => m.attributes['http.request.method'].value), ['GET'], 'one metric point for the load');
    assert.equal(metrics[0].unit, 'second'); assert.ok(metrics[0].value > 0 && metrics[0].value < 5, 'the duration, in seconds');
    assert.ok(sentry.items.some(i => i.type === 'span' && i.raw.includes(render.trace_id)), 'the trace itself');

    const all = sentry.items.map(i => i.raw).join('\n');
    assert.doesNotMatch(all, new RegExp(`${CODE}|${SECRET}|${IP.replace(/\./g, '\\.')}|${UA.replace('.', '\\.')}`), 'no save code, save, IP or browser identifier');
    assert.doesNotMatch(all, /user_agent|\/api\/play/, 'no user agent field at all, and play never leaves');
    assert.ok(!sentry.items.some(i => i.type === 'client_report'), 'not even a count of the gameplay requests left out');
    assert.deepEqual([...of('log'), ...of('trace_metric')].map(x => (x.attributes.method || x.attributes['http.request.method']).value).sort(), ['GET', 'GET', 'PUT', 'PUT'], 'one log line and one metric per save and load; none for the preflight');
    assert.equal(of('event').length, 0, 'a closed tab is not reported as an error');
    assert.ok(lines(a.out.text).some(l => l.msg === 'client left mid-upload'), 'but it is logged in Render');
  } finally { a.api.kill('SIGKILL'); sentry.close(); }
});

test('a deploy finishes a save in flight', async () => {
  const a = await startApi('');
  try {
    const reply = new Promise(r => { const s = net.connect(a.port, '127.0.0.1', () => {
      const body = JSON.stringify({ save: { a: 1 } });
      s.write(`PUT /api/save/${CODE} HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n${body.slice(0, 5)}`);
      setTimeout(() => { a.api.kill('SIGTERM'); a.api.kill('SIGTERM'); setTimeout(() => s.write(body.slice(5)), 200); }, 100); // the stop arrives mid-upload, twice (npm passes on a copy)
      let got = ''; s.on('data', c => { got += c; s.end(); }).on('close', () => r(got)).on('error', () => r(got));
    }); });
    assert.match(await reply, /^HTTP\/1\.1 200/, 'the save completes');
    assert.equal(await a.exited, 0);
  } finally { a.api.kill('SIGKILL'); }
});

test('a Sentry outage never fails a save', async () => {
  const a = await startApi('http://key@127.0.0.1:1/1'); // nothing listens on port 1
  try {
    const res = await fetch(`${a.base}/api/save/${CODE}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ save: { a: 1 } }) });
    assert.equal(res.status, 200);
    assert.equal((await fetch(`${a.base}/api/save/${CODE}`)).status, 200);
    a.api.kill('SIGTERM'); assert.equal(await a.exited, 0);
  } finally { a.api.kill('SIGKILL'); }
});
