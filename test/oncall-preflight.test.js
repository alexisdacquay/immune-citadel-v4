// The on-call wiring check (tools/oncall-preflight.js), with Sentry, GitHub and ssh stubbed.
const test = require('node:test'), assert = require('node:assert');
const { preflight } = require('../tools/oncall-preflight.js');

const REPO = 'alexisdacquay/immune-citadel-v4', S = 'https://de.sentry.io/api/0/';
const ENV = { GITHUB_REPOSITORY: REPO, GITHUB_TOKEN: 'gh-token', SENTRY_AUTH_TOKEN: 'sentry-token', DEEPSEEK_API_KEY: 'ds', ONCALL_DEPLOY_KEY: 'deploy-key' };
// the live alert's shape (Sentry's workflows API, 2026-11-12), trimmed
const alert = () => ({ id: '1464000', enabled: true, detectorIds: ['2612024'], actionFilters: [
  { logicType: 'all', actions: [{ type: 'github', integrationId: '558317', status: 'active', data: { additionalFields: { repo: REPO, labels: ['incident'] } } }, { type: 'email', data: {} }] },
  { logicType: 'all', actions: [{ type: 'email', data: {} }] },
] });
const routes = () => ({
  [`${S}projects/myown-76/immune-citadel-api/`]: { id: '4512386038562896' },
  [`${S}organizations/myown-76/workflows/1464000/`]: alert(),
  [`${S}organizations/myown-76/detectors/2612024/`]: { projectId: '4512386038562896' },
  [`https://api.github.com/repos/${REPO}/labels/incident`]: { name: 'incident' },
});
const run = ({ env = ENV, change = r => r, canPush = () => true } = {}) => {
  const r = change(routes()), calls = [];
  const fetch = async (url, opts) => { calls.push({ url, auth: opts.headers.authorization }); const b = r[url];
    return typeof b === 'object' ? { ok: true, status: 200, json: async () => b } : { ok: false, status: b || 404, json: async () => ({}) }; };
  return preflight(env, { fetch, canPush }).then(results => ({ results, calls, failed: results.filter(x => !x.ok).map(x => x.msg) }));
};

test('a sound wiring passes every check, each token sent only to its own service', async () => {
  const { results, calls, failed } = await run();
  assert.deepEqual(failed, []);
  assert.equal(results.length, 5);
  for (const c of calls) assert.equal(c.auth, c.url.startsWith('https://de.sentry.io/') ? 'Bearer sentry-token' : 'Bearer gh-token', c.url);
});

test('a missing or rejected secret fails with its name and its fix', async () => {
  let { failed } = await run({ env: { ...ENV, SENTRY_AUTH_TOKEN: '', DEEPSEEK_API_KEY: '', ONCALL_DEPLOY_KEY: '' } });
  assert.match(failed[0], /SENTRY_AUTH_TOKEN reads Sentry project myown-76\/immune-citadel-api: not set\. Fix: set the repository secret/);
  assert.match(failed[1], /DEEPSEEK_API_KEY is set: not set/);
  assert.match(failed[2], /ONCALL_DEPLOY_KEY is set and can push to alexisdacquay\/immune-citadel-v4: not set\. Fix: .*on-call-setup-checklist/);
  assert.match(failed[3], /cannot check without a working SENTRY_AUTH_TOKEN/);
  ({ failed } = await run({ change: r => ({ ...r, [`${S}projects/myown-76/immune-citadel-api/`]: 401 }) }));
  assert.match(failed[0], /HTTP 401 from https:\/\/de\.sentry\.io/);
  ({ failed } = await run({ canPush: () => 'git push --dry-run over ssh failed: ERROR: The key you are authenticating with has been marked as read only.' }));
  assert.deepEqual(failed.length, 1);
  assert.match(failed[0], /can push to alexisdacquay\/immune-citadel-v4: .*marked as read only/);
});

test('the alert must be enabled, fire for the save API project and open an incident issue in this repository', async () => {
  const bad = { 'disabled': w => { w.enabled = false; }, 'another project': () => {}, 'another repository': w => { w.actionFilters[0].actions[0].data.additionalFields.repo = 'alexisdacquay/immune-citadel-old'; },
    'no incident label': w => { w.actionFilters[0].actions[0].data.additionalFields.labels = []; }, 'a disabled action': w => { w.actionFilters[0].actions[0].status = 'disabled'; },
    'no GitHub action': w => { w.actionFilters[0].actions.shift(); } };
  for (const [name, edit] of Object.entries(bad)) {
    const { failed } = await run({ change: r => { const w = r[`${S}organizations/myown-76/workflows/1464000/`]; edit(w);
      if (name === 'another project') r[`${S}organizations/myown-76/detectors/2612024/`] = { projectId: '999' }; return r; } });
    assert.equal(failed.length, 1, name);
    assert.match(failed[0], /^Sentry alert 1464000 is enabled, fires for immune-citadel-api and opens an issue labelled incident in alexisdacquay\/immune-citadel-v4: .+Fix: point the alert/, name);
  }
  const { failed } = await run({ change: r => { const a = r[`${S}organizations/myown-76/workflows/1464000/`].actionFilters[0].actions[0]; a.data = { additional_fields: a.data.additionalFields }; return r; } });
  assert.deepEqual(failed, [], 'the snake_case form of the alert file counts too');
});

test('a missing incident label fails with the command that creates it', async () => {
  const { failed } = await run({ change: r => ({ ...r, [`https://api.github.com/repos/${REPO}/labels/incident`]: 404 }) });
  assert.equal(failed.length, 1);
  assert.match(failed[0], /label incident exists in alexisdacquay\/immune-citadel-v4: HTTP 404 .*Fix: gh label create incident -R alexisdacquay\/immune-citadel-v4/);
});
