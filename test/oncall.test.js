// The on-call agent's own logic (tools/oncall.js), without Sentry, GitHub or a model.
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { sentryRef, incident, localFile, sourceContext, applyEdits, failure, qaChecks, fallbackCheck } = require('../tools/oncall.js');

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
  assert.match(ctx.text, /### server\/index\.js\n {4}1\|\/\/ Cloud saves/, 'the line follows the "|" with no space, so a quote of it keeps its own indentation');
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

test('a find text quoted one space too deep applies at the file\'s own indentation; any other miss names the closest line (#164)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncall-')); fs.mkdirSync(path.join(dir, 'server'));
  const line = "  assert.deepEqual((await (await fetch(`${base}/api/save/${code}`)).json()).save, { owe: ['fever'] }, 'and never reaches the store');";
  const added = "  assert.equal((await put(code, { save: { rch: 1 } })).status, 200, 'a save with rch but no hc is kept');";
  const file = `test('save API', async () => {\n${line}\n  assert.equal(1, 1);\n});\n`, deeper = s => s.replace(/^/gm, ' ');
  fs.writeFileSync(path.join(dir, 'server/test.js'), file);
  // a model that keeps the space after the "|" quotes each line with 3 spaces for the file's 2, in find and replace alike
  applyEdits([{ file: 'server/test.js', find: deeper(line), replace: deeper(`${line}\n${added}`) }], ['server/test.js'], dir);
  assert.equal(fs.readFileSync(path.join(dir, 'server/test.js'), 'utf8'), file.replace(line, `${line}\n${added}`));
  fs.writeFileSync(path.join(dir, 'server/test.js'), file);
  assert.throws(() => applyEdits([{ file: 'server/test.js', find: deeper(line.replace('never', 'not')), replace: 'x' }], ['server/test.js'], dir),
    e => e.message.includes('occurs 0 times') && e.message.includes(`the closest line is 2: ${JSON.stringify(line)}`), 'a miss the shift cannot fix names the line to copy');
  assert.throws(() => applyEdits([{ file: 'server/test.js', find: `${line}\n});`, replace: 'x' }], ['server/test.js'], dir), /not one after the other/);
  fs.writeFileSync(path.join(dir, 'server/test.js'), ' a\n a\n');
  assert.throws(() => applyEdits([{ file: 'server/test.js', find: '  a', replace: 'b' }], ['server/test.js'], dir), /occurs 0 times/, 'the shift applies only when it gives exactly one match');
});

test('after red tests the model gets the failing tests, even 15,000 characters before the end of the output (#164)', () => {
  const name = n => `passing test ${n}: ${'a long name, as the real tests have, '.repeat(4)}`;
  const ok = n => `# Subtest: ${name(n)}\nok ${n} - ${name(n)}\n  ---\n  duration_ms: 1.5\n  type: 'test'\n  ...`;
  const notOk = ['# Subtest: save API', 'not ok 11 - save API', '  ---', '  duration_ms: 49.79', "  type: 'test'", "  location: '/w/server/test.js:7:1'", "  failureType: 'testCodeFailure'",
    "  error: 'and never reaches the store'", "  code: 'ERR_ASSERTION'", '  expected:', '    owe:', "      0: 'fever'", '  actual:', '    rch: true', "  operator: 'deepEqual'",
    '  stack: |-', '    TestContext.<anonymous> (/w/server/test.js:33:10)', '  ...'].join('\n');
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const out = ['Command failed: docker run --rm --network none -v /w:/w:ro -w /w node:22 npm run test:unit', 'TAP version 13', ...range(1, 10).map(ok), notOk, ...range(12, 71).map(ok),
    '1..71', '# tests 71', '# suites 0', '# pass 70', '# fail 1', '# cancelled 0', '# skipped 0', '# todo 0', '# duration_ms 2677.6'].join('\n');
  assert.ok(out.length > 18000 && out.length - out.indexOf('not ok') > 15000 && !out.slice(-4000).includes('not ok'), 'a tail of the output holds only passing tests');
  const f = failure(out);
  assert.equal(f, `${notOk.split('\n').slice(1).join('\n')}\n# tests 71\n# pass 70\n# fail 1\n# cancelled 0`, 'every not ok block with its diagnostics, then the counts');
  const nested = 'TAP version 13\n# Subtest: parent\n    # Subtest: child\n    not ok 1 - child\n      ---\n      error: \'boom\'\n      ...\n    1..1\nnot ok 1 - parent\n  ---\n  error: \'1 subtest failed\'\n  ...\n# fail 1';
  assert.equal(failure(nested), "    not ok 1 - child\n      ---\n      error: 'boom'\n      ...\nnot ok 1 - parent\n  ---\n  error: '1 subtest failed'\n  ...\n# fail 1", 'a failing subtest keeps its own indentation');
  const many = failure(range(1, 200).map(n => `not ok ${n} - ${name(n)}`).concat('# fail 200').join('\n'));
  assert.ok(many.length <= 6000 && many.startsWith('not ok 1 - ') && many.endsWith('\n# fail 200'), 'capped, failures first, the counts kept');
  assert.equal(failure('edit refused: the text to replace occurs 0 times in server/test.js'), 'edit refused: the text to replace occurs 0 times in server/test.js', 'no not ok: the tail');
});

test('QA checks are kept only when stage 1 can answer them', () => {
  const asked149 = '- [stays] server/index.js: Are all existing validations and rate limits unchanged?';
  const good = ['- [changes] server/index.js: Does a PUT with save {rch:2} (no st) return 200 instead of 500?', '- [stays] server/index.js, server/test.js: Does a PUT whose body is not JSON still get a 400?'];
  assert.deepEqual(qaChecks([asked149, ...good]), good, 'the [stays] check of #149 compares with the old code, which stage 1 never sees: dropped');
  for (const l of ['- [stays] server/index.js: Does the save route stay the same?', '- [stays] server/index.js: Is the validation not modified?', '- [stays] server/index.js: Does a load work as before?',
    '- [stays] server/index.js: Does it match the previous behaviour?', '- [changes] server/nowhere.js: Is it fixed?', '- [changes] ../server/index.js: Is it fixed?', '- [changes] /etc/hosts: Is it fixed?',
    '- [changes] server/index.js: Is it fixed', '- [review] server/index.js: Is it fixed?', '[changes] server/index.js: Is it fixed?', '- [changes] server/index.js: Is it\n- [stays] server/index.js: fixed?'])
    assert.deepEqual(qaChecks([l]), [], l);
  assert.deepEqual(qaChecks(undefined), []);
  assert.deepEqual(qaChecks(['  - [changes] server/index.js: Is it fixed?\n']), ['- [changes] server/index.js: Is it fixed?']);
});

test('with no valid [changes] check, the agent adds one: the failing request now gets an answer', () => {
  const inc = { title: "TypeError: Cannot read properties of undefined (reading '2')", method: 'PUT', route: '/api/save/:code',
    exceptions: [{ frames: [{ file: '/app/index.js', line: 186, code: "log.debug({ reached: save.rch, stars: save.rch ? save.st[save.rch] : 0 }, 'furthest specimen');" }] }] };
  const c = fallbackCheck(inc);
  assert.equal(c, '- [changes] server/index.js: Does the request PUT /api/save/:code that threw "TypeError: Cannot read properties of undefined (reading \'2\')" at `log.debug({ reached: save.rch, stars: save.rch ? save.st[save.rch] : 0 }, \'furthest specimen\');` now get an answer instead of that error?');
  assert.deepEqual(qaChecks([c]), [c], 'the generated check passes the same validation');
});
