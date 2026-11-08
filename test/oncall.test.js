// The on-call agent's own logic (tools/oncall.js), without Sentry, GitHub or a model.
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { sentryRef, incident, localFile, sourceContext, applyEdits } = require('../tools/oncall.js');

test('the Sentry issue is read from the GitHub issue Sentry opened', () => {
  assert.deepEqual(sentryRef('Sentry Issue: [IMMUNE-CITADEL-API-2](https://myown-76.sentry.io/organizations/myown-76/issues/7012345678/?referrer=github_integration)'), { id: '7012345678' });
  assert.deepEqual(sentryRef('see https://myown-76.sentry.io/issues/42/'), { id: '42' });
  assert.deepEqual(sentryRef('RangeError in IMMUNE-CITADEL-API-2'), { shortId: 'IMMUNE-CITADEL-API-2' });
  assert.equal(sentryRef('a stranger asks for help'), null);
});

test('the agent gets the code path of the error, never request, user or device data', () => {
  const event = {
    title: 'RangeError: Maximum call stack size exceeded', tags: [{ key: 'environment', value: 'dev' }, { key: 'route', value: '/api/save/:code' }, { key: 'release', value: 'abc1234' }],
    user: { geo: { city: 'Camden' } }, request: { url: 'https://x/api/save/ABCDEFGHJKMNPQRS', headers: [['User-Agent', 'kid-browser']] }, contexts: { device: { arch: 'arm64' } },
    entries: [{ type: 'request', data: { url: 'secret' } }, { type: 'exception', data: { values: [{ type: 'RangeError', value: 'Maximum call stack size exceeded', stacktrace: { frames: [
      { filename: 'node:internal/process/task_queues', lineNo: 103 },
      { filename: '/opt/render/project/src/server/node_modules/pg/lib/utils.js', lineNo: 50 },
      { filename: '/opt/render/project/src/server/index.js', lineNo: 89, function: 'Server.<anonymous>', context: [[88, 'x'], [89, '  const updatedAt = await store.put(code, save);']] },
    ] } }] } }],
  };
  const inc = incident(event), text = JSON.stringify(inc);
  assert.equal(inc.environment, 'dev'); assert.equal(inc.route, '/api/save/:code');
  assert.deepEqual(inc.exceptions[0].frames, [{ file: '/opt/render/project/src/server/index.js', line: 89, function: 'Server.<anonymous>', code: 'const updatedAt = await store.put(code, save);' }], 'only our own frames');
  for (const s of ['Camden', 'ABCDEFGHJKMNPQRS', 'kid-browser', 'arm64', 'secret']) assert.ok(!text.includes(s), `${s} must not reach the model`);
});

test('frames map to repository files, on Docker, on Render and in the browser', () => {
  assert.equal(localFile('/app/index.js'), 'server/index.js');
  assert.equal(localFile('/opt/render/project/src/server/play.js'), 'server/play.js');
  assert.equal(localFile('https://immune-citadel-v4.onrender.com/'), 'index.html');
  assert.equal(localFile('/app/nowhere.js'), null);
  assert.equal(localFile('https://immune-citadel-v4-dev.onrender.com/'), 'index.html');
  // a crafted event names the files the model may edit: only the game page and the save API's own files ever map (review of #118)
  for (const f of ['./.github/workflows/ci.yml', './package.json', 'tools/verify-deploy.js', '.github/workflows/ci.yml', '/', 'https://browser.sentry-cdn.com/11.9.0/bundle.tracing.min.js', 'https://evil.example/'])
    assert.equal(localFile(f), null, f);
  const ctx = sourceContext({ exceptions: [{ frames: [{ file: '/app/index.js', line: 89 }] }] });
  assert.deepEqual(ctx.files, ['server/index.js', 'server/test.js'], 'a server error also gets the test file a fix must extend');
  assert.match(ctx.text, /### server\/index\.js\n {4}1\| /);
});

test('edits are refused unless exact, small and inside the files shown', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncall-')); fs.mkdirSync(path.join(dir, 'server')); fs.mkdirSync(path.join(dir, '.github'));
  fs.writeFileSync(path.join(dir, 'server/index.js'), 'a\nb\nb\n'); fs.writeFileSync(path.join(dir, '.github/ci.yml'), 'x'); fs.writeFileSync(path.join(dir, 'package.json'), '{}');
  const shown = ['server/index.js', '.github/ci.yml', './package.json'];
  assert.throws(() => applyEdits([{ file: 'server/index.js', find: 'b', replace: 'c' }], shown, dir), /occurs 2 times/);
  assert.throws(() => applyEdits([{ file: 'server/play.js', find: 'a', replace: 'c' }], shown, dir), /not one of the files shown/);
  assert.throws(() => applyEdits([{ file: '.github/ci.yml', find: 'x', replace: 'y' }], shown, dir), /not editable/, 'CI is never the agent\'s to edit');
  assert.throws(() => applyEdits([{ file: './package.json', find: '{}', replace: '{"scripts":{}}' }], shown, dir), /not editable/, 'nor dependencies, however the path is written');
  assert.throws(() => applyEdits([{ file: 'server/index.js', find: 'a', replace: 'z'.repeat(30000) }], shown, dir), /on-call fixes stay small/, 'one huge line counts too');
  assert.throws(() => applyEdits([{ file: 'server/index.js', find: 'a', replace: 'z\n'.repeat(200) }], shown, dir), /on-call fixes stay small/);
  assert.throws(() => applyEdits([{ file: 'server/index.js', find: 'a', replace: 'ok' }, { file: 'server/index.js', find: 'nope', replace: '' }], shown, dir), /occurs 0 times/);
  assert.equal(fs.readFileSync(path.join(dir, 'server/index.js'), 'utf8'), 'a\nb\nb\n', 'a refused set of edits leaves every file untouched');
  assert.throws(() => applyEdits([], shown, dir), /no edits/);
  applyEdits([{ file: 'server/index.js', find: 'a\n', replace: 'a $& $1\n' }], shown, dir);
  assert.equal(fs.readFileSync(path.join(dir, 'server/index.js'), 'utf8'), 'a $& $1\nb\nb\n', 'the replacement is literal text');
});
