// Fast checks for tools/qa.js: which issues a pull request names, and that anything but a clear PASS fails.
const test = require('node:test'), assert = require('node:assert');
const { issueNumbers, readVerdict } = require('../tools/qa.js');

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
