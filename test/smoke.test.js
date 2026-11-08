// Fast checks for the verdict of tools/smoke.js, on made-up runs.
const test = require('node:test'), assert = require('node:assert');
const { problems } = require('../tools/smoke.js');

const SHA = 'b'.repeat(40), CODE = 'ABCDEFGHJKMNPQRS';
const report = extra => `{"event_id":"1","sdk":{"name":"sentry.javascript.browser","settings":{"infer_ip":"never","infer_user_agent":"never"}}}\n{"type":"event"}\n{"message":":code"${extra || ''}}`;
const spans = '{"sdk":{}}\n{"type":"span","item_count":1}\n{"items":[{"name":"PUT /api/save/:code"}]}';
const run = (over = {}) => problems({ sha: SHA, status: 200, version: SHA, health: { ok: true, commit: SHA }, errors: [], failed: [], sentry: [report(), spans], code: CODE, plays: 2, ...over });
const leak = extra => run({ sentry: [report(extra), spans] });

test('a clean run passes, with Sentry\'s own infer_user_agent setting in the payload', () => assert.deepEqual(run(), []));

for (const [what, extra] of [
  ['save code', `,"url":"/api/save/${CODE}"`],
  ['user agent', ',"ua":"Chrome/140 ICSmokeUA/1"'],
  ['user agent', ',"attributes":{"user_agent.original":"Chrome"}'],
  ['user agent', ',"request":{"User-Agent":"Chrome"}'],
  ['IP', ',"user":{"ip_address":"{{auto}}"}'],
  ['headers', ',"request":{"headers":{}}'],
  ['play data', ',"breadcrumb":"POST https://api/api/play"'],
]) test(`${what} in a Sentry payload fails (${extra})`, () => assert.deepEqual(leak(extra), [`${what} in a Sentry payload`]));

test('a crash report that does not tell Sentry to drop the IP fails: infer_ip missing, or not "never"', () => {
  const ev = settings => `{"event_id":"1","sdk":{"settings":${settings}}}\n{"type":"event"}\n{"message":"x"}`;
  for (const s of ['{}', '{"infer_ip":"auto"}']) assert.deepEqual(run({ sentry: [ev(s), spans] }), ['Sentry is not told to drop the IP address (infer_ip must be "never")']);
});

test('a site or API on another commit fails, and so does a down API', () => {
  assert.match(run({ version: 'a'.repeat(40) })[0], /^site serves a{40}/);
  assert.match(run({ health: { ok: true, commit: 'a'.repeat(40) } })[0], /^API \/health/);
  assert.match(run({ health: { error: 'timeout' } })[0], /^API \/health/);
});

test('a bad status, console or page errors and failed requests fail', () => {
  assert.deepEqual(run({ status: 503 }), ['site HTTP 503']);
  assert.deepEqual(run({ errors: ['page error: x'], failed: ['request failed: GET /a'] }), ['page error: x', 'request failed: GET /a']);
});

test('a run with nothing to inspect fails: no save, no gameplay post, no crash report, no spans', () => {
  assert.deepEqual(run({ code: null }), ['the game made no save']);
  assert.deepEqual(run({ plays: 0 }), ['the game sent no gameplay events']);
  assert.deepEqual(run({ sentry: [spans] }), ['no Sentry event was captured']);
  assert.deepEqual(run({ sentry: [report()] }), ['no Sentry span was captured']);
});
