// Fast checks for tools/qa.js: which issues a pull request names, and that anything but a clear PASS fails.
const test = require('node:test'), assert = require('node:assert');
const { issueNumbers, readVerdict, stage } = require('../tools/qa.js');

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

test('two stages: the required quick check thinks briefly but has room to finish; the review is today\'s prompt and never blocks', () => {
  const q = stage(undefined), r = stage('review');
  assert.deepEqual(q.params, { reasoning_effort: 'low', max_tokens: 64000 });
  assert.equal(q.advisory, false); assert.match(q.system, /at most 3 problems/);
  assert.deepEqual(r.params, {}); assert.equal(r.advisory, true); assert.match(r.system, /^You are the QA engineer/);
  assert.match(r.title, /advisory/);
});
