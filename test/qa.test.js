// Fast checks for tools/qa.js: which issues a pull request names, that anything but a clear PASS fails, and how stage 1 reads and judges checks.
const test = require('node:test'), assert = require('node:assert');
const { issueNumbers, readVerdict, parseChecks, unreadable, judge, majority, ask, vote, report, reviewPrompt } = require('../tools/qa.js');

test('issues come from the branch, title, body and commits, without the pull request itself', () => {
  assert.deepEqual(issueNumbers({ branch: 'issue/22-hud', title: 'Fix (#23)', body: 'See #22 and #7', commits: ['x (#61)', 'y #40'], self: 61 }), [7, 22, 23, 40]);
  assert.deepEqual(issueNumbers({ branch: 'docs/x', title: 'Docs', body: '', commits: [], self: 5 }), []);
});

test('only a well-formed PASS passes', () => {
  assert.equal(readVerdict('{"verdict":"PASS","criteria":[],"defects":[]}').verdict, 'PASS'); // no issue named: judged on the description
  assert.equal(readVerdict('{"verdict":"PASS","criteria":[],"defects":[]}', { needCriteria: true }).verdict, 'FAIL');
  assert.equal(readVerdict('{"verdict":"PASS","criteria":[{"criterion":"a","result":"FAIL"}]}').verdict, 'FAIL');
  assert.equal(readVerdict('{"verdict":"PASS","criteria":[{"criterion":"a","result":"PASS"}]}', { needCriteria: true }).verdict, 'PASS');
  assert.equal(readVerdict('{"verdict":"pass"}').verdict, 'FAIL');
  assert.equal(readVerdict('not json').verdict, 'FAIL');
  assert.equal(readVerdict('{}').verdict, 'FAIL');
});

test('stage 1 reads check lines, in a pull request only under "## QA checks"', () => {
  const body = 'Intro\n- [x] done: not a check\n## QA checks\n- [changes] server/sentry.js: Is an all-digit code replaced?\n- [stays] index.html, server/index.js: Does a load: still work?\n## Notes\n- [stays] a.js: ignored?';
  assert.deepEqual(parseChecks(body, { section: true }), [
    { label: 'changes', files: ['server/sentry.js'], question: 'Is an all-digit code replaced?' },
    { label: 'stays', files: ['index.html', 'server/index.js'], question: 'Does a load: still work?' }]);
  assert.deepEqual(parseChecks('no section here\n- [stays] a.js: q?', { section: true }), []);
  assert.equal(parseChecks('- [#9] index.html: Does the card show current / max?\n- [PR #82] server/sentry.js: q?').length, 2); // past failures: the whole file
});

test('stage 1: YES on the new code passes; a [changes] check must also be NO on the old code', () => {
  const yes = { answer: 'YES' }, no = { answer: 'NO' }, unsure = { answer: 'UNSURE' };
  assert.equal(judge({ label: 'changes' }, yes, no).pass, true);
  assert.equal(judge({ label: 'changes' }, yes, unsure).pass, true); // the old code cannot show it: still not a YES
  assert.match(judge({ label: 'changes' }, yes, yes).why, /does not test the change/);
  const failed = { answer: 'UNSURE', why: 'no answer: DeepSeek: HTTP 503; backup google/gemini-3.5-flash: HTTP 401' };
  assert.equal(judge({ label: 'changes' }, yes, failed).pass, false); // both models failed on the old code: never judged
  assert.match(judge({ label: 'changes' }, yes, failed).why, /old code was never judged \(no answer: DeepSeek: HTTP 503/);
  assert.equal(judge({ label: 'stays' }, yes, null).pass, true);
  assert.equal(judge({ label: '#9' }, no, null).pass, false);
  assert.equal(judge({ label: 'stays' }, unsure, null).pass, false);
});

test('stage 1: each question is asked 3 times; the answer 2 agree on counts, else UNSURE', () => {
  const v = a => ({ answer: a, quote: a, why: '' });
  assert.equal(majority([v('NO'), v('YES'), v('NO')]).answer, 'NO');
  assert.deepEqual(majority([v('YES'), v('YES'), v('UNSURE')]).votes, ['YES', 'YES', 'UNSURE']);
  assert.equal(majority([v('YES'), v('NO'), v('UNSURE')]).answer, 'UNSURE');
});

test('stage 1: a check line it cannot read fails the job instead of being skipped; CRLF from the GitHub editor is fine', () => {
  const body = '## QA checks\r\n- [changes] a.js: Is it fixed?\r\n- [Changes] a.js: wrong label?\r\n  - [stays] a.js: indented?\r\n* [stays] a.js: star?\r\n- [stays] a.js:5: line number?\r\n## Notes\r\n- [x] not in the section';
  assert.deepEqual(parseChecks(body, { section: true })[0], { label: 'changes', files: ['a.js'], question: 'Is it fixed?' });
  assert.deepEqual(unreadable(body), ['- [Changes] a.js: wrong label?', '  - [stays] a.js: indented?', '* [stays] a.js: star?', '- [stays] a.js:5: line number?']);
});

test('every check line in test/past-failures.md can be read, so no past failure is skipped unseen', () => {
  const text = require('node:fs').readFileSync(require('node:path').join(__dirname, 'past-failures.md'), 'utf8');
  const lines = text.split('\n').filter(l => /^\s*[-*+]\s*\[/.test(l));
  assert.equal(parseChecks(text).length, lines.length);
  assert.ok(lines.length >= 17);
});

// The backup model: DeepSeek is stubbed to fail, the gateway to answer; no network, no key.
const env = { DEEPSEEK_API_KEY: 'k', KILO_API_KEY: 'b', KILO_BASE_URL: 'https://gateway.test/api/v1/' }, check = { files: ['package.json'], question: 'q?' };
const answer = content => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] }));

test('a DeepSeek timeout, after its 3 tries, goes once to the backup model, and the answer says which model gave it', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => { calls.push(url); if (url.includes('deepseek')) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); return answer('{"answer":"YES","quote":"x","why":"y"}'); });
  const a = await ask(check, 'HEAD', { env, wait: 0 });
  assert.deepEqual([a.answer, a.model], ['YES', 'google/gemini-3.5-flash']);
  assert.deepEqual(calls, [...Array(3).fill('https://api.deepseek.com/chat/completions'), 'https://gateway.test/api/v1/chat/completions']);
  assert.deepEqual((await vote(check, 'HEAD', { env, wait: 0 })).models, Array(3).fill('google/gemini-3.5-flash'));
});

test('both models failing fails closed, with both errors in the answer; without the backup secrets DeepSeek alone decides', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => { calls.push(url); return new Response('', { status: url.includes('deepseek') ? 503 : 401 }); });
  const v = await vote(check, 'HEAD', { env, wait: 0 });
  assert.equal(v.answer, 'UNSURE');
  assert.match(v.why, /DeepSeek: HTTP 503; backup google\/gemini-3\.5-flash: HTTP 401/);
  assert.equal(judge({ label: 'stays' }, v, null).pass, false);
  calls.length = 0;
  await assert.rejects(ask(check, 'HEAD', { env: { DEEPSEEK_API_KEY: 'k' }, wait: 0 }), /^Error: DeepSeek: HTTP 503$/);
  assert.equal(calls.filter(u => !u.includes('deepseek')).length, 0);
});

test('stage 2 names the changed files left out of its diff, in the prompt and in the report', () => {
  const left = ['docs/diagrams/observability.svg', 'package-lock.json'];
  assert.match(reviewPrompt(9, { title: 't', body: '' }, [], 'diff', left), /## Diff\ndiff\n\n## Changed files left out of the diff\n.*\n- docs\/diagrams\/observability\.svg\n- package-lock\.json$/);
  assert.doesNotMatch(reviewPrompt(9, { title: 't', body: '' }, [], 'diff', []), /left out/);
  const md = report(readVerdict('{"verdict":"PASS"}'), [], 'QA review', { model: 'google/gemini-3.5-flash', left });
  assert.match(md, /left out of the diff \(generated, not reviewed\): docs\/diagrams\/observability\.svg, package-lock\.json/);
  assert.match(md, /model google\/gemini-3\.5-flash_$/);
});
