// Fast checks for tools/verify-sentry.js, with Sentry's answers given by the test.
const test = require('node:test'), assert = require('node:assert');
const { verify } = require('../tools/verify-sentry.js');

const run = (status, rows, ms = 2000) => {
  let polls = 0;
  return verify({ status, query: async d => rows(d, polls), deadline: Date.now() + ms, wait: async () => { polls++; await new Promise(r => setTimeout(r, 5)); } });
};

test('passes once Sentry returns the trace, its log line and its metric, even if they arrive at different times', async () => {
  const r = await run(200, (d, polls) => (d === 'tracemetrics' && polls < 3 ? [] : [{ trace: 'x' }]));
  assert.ok(r.ok, r.msg);
});

test('fails at the deadline and names what never arrived', async () => {
  const r = await run(200, d => (d === 'logs' ? [] : [{ trace: 'x' }]), 50);
  assert.equal(r.ok, false); assert.match(r.msg, /not in Sentry: logs$/);
});

test('a failed save fails at once, and a Sentry API error counts as missing, not as found', async () => {
  assert.match((await run(500, () => [{}])).msg, /answered 500/);
  const r = await run(200, () => { throw new Error('HTTP 401'); }, 50);
  assert.equal(r.ok, false); assert.match(r.msg, /spans, logs, tracemetrics/);
});
