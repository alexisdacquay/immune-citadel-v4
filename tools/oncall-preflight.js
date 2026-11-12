// On-call wiring check (docs/OPERATIONS.md#on-call-setup-checklist). CI's "deployed" job runs it on every push to dev and main, so a broken
// on-call setup (a repository moved or re-created loses its secrets, keys, labels and app access) turns the run red, instead of the
// on-call agent failing silently at the next alert. It checks what CI's tokens can see; "Actions may open pull requests" needs
// administration access, which GITHUB_TOKEN lacks, so that item stays manual in the checklist.
// Env: GITHUB_REPOSITORY, GITHUB_TOKEN (issues: read), SENTRY_AUTH_TOKEN, DEEPSEEK_API_KEY, ONCALL_DEPLOY_KEY; SENTRY_ORG (default myown-76),
// SENTRY_PROJECT (default immune-citadel-api), SENTRY_URL (default https://de.sentry.io), SENTRY_ALERT (default 1464000, observability/sentry-alert.json).
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawnSync } = require('node:child_process');
const CHECKLIST = 'docs/OPERATIONS.md#on-call-setup-checklist';

// The deploy key can push here: the agent's own ssh push (tools/oncall.js), but --dry-run, so nothing is sent. GitHub checks the key's
// write access to this repository when the push connects, so an unknown, read-only or other repository's key fails. Runs in a git checkout.
// -F /dev/null: no ssh config, so a developer's own GitHub key cannot stand in for the deploy key on a local run.
function sshPushDryRun(key, repo) {
  const dir = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'preflight-')), f = path.join(dir, 'key');
  try {
    fs.writeFileSync(f, key.endsWith('\n') ? key : `${key}\n`, { mode: 0o600 });
    const r = spawnSync('git', ['push', '--dry-run', `git@github.com:${repo}.git`, 'HEAD:refs/heads/oncall-preflight-dry-run'], { encoding: 'utf8', timeout: 60000,
      env: { ...process.env, GIT_SSH_COMMAND: `ssh -F /dev/null -i ${f} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes` } });
    if (r.status === 0) return true;
    const why = (r.stderr || r.error?.message || '').split('\n').filter(l => l.trim() && !l.startsWith('Warning: Permanently added'));
    return `git push --dry-run over ssh failed: ${why.slice(0, 2).join(' ')}`;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// Each check returns true or the reason it failed; every failure names its fix.
async function preflight(env, { fetch = globalThis.fetch, canPush = sshPushDryRun } = {}) {
  const { GITHUB_REPOSITORY: repo, GITHUB_TOKEN: github, SENTRY_AUTH_TOKEN: sentry, DEEPSEEK_API_KEY: deepseek, ONCALL_DEPLOY_KEY: key,
    SENTRY_ORG: org = 'myown-76', SENTRY_PROJECT: project = 'immune-citadel-api', SENTRY_URL: base = 'https://de.sentry.io', SENTRY_ALERT: alert = '1464000' } = env;
  const get = async (url, token) => {
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
    return r.json();
  };
  const results = [];
  const check = async (what, fix, fn) => {
    let r; try { r = await fn(); } catch (e) { r = e.message; }
    results.push(r === true ? { ok: true, msg: what } : { ok: false, msg: `${what}: ${r}. Fix: ${fix}` });
  };
  let projectId;

  await check(`SENTRY_AUTH_TOKEN reads Sentry project ${org}/${project}`, 'set the repository secret SENTRY_AUTH_TOKEN to a Sentry token with org:read, project:read, event:read', async () => {
    if (!sentry) return 'not set';
    projectId = String((await get(`${base}/api/0/projects/${org}/${project}/`, sentry)).id);
    return true;
  });
  await check('DEEPSEEK_API_KEY is set', 'set the repository secret DEEPSEEK_API_KEY', () => !!deepseek || 'not set');
  await check(`ONCALL_DEPLOY_KEY is set and can push to ${repo}`, `create the write deploy key and its secret (${CHECKLIST})`, () => (key ? canPush(key, repo) : 'not set'));
  await check(`Sentry alert ${alert} is enabled, fires for ${project} and opens an issue labelled incident in ${repo}`,
    `point the alert's GitHub action at ${repo} with the label incident (observability/sentry-alert.json, applied through the Sentry MCP), and check Sentry's GitHub app can reach the repository`, async () => {
      if (!projectId) return 'cannot check without a working SENTRY_AUTH_TOKEN';
      const w = await get(`${base}/api/0/organizations/${org}/workflows/${alert}/`, sentry);
      if (!w.enabled) return 'the alert is disabled';
      const projects = await Promise.all((w.detectorIds || []).map(async d => String((await get(`${base}/api/0/organizations/${org}/detectors/${d}/`, sentry)).projectId)));
      if (!projects.includes(projectId)) return `it fires for Sentry project ids [${projects}], not ${project} (${projectId})`;
      const targets = (w.actionFilters || []).flatMap(f => f.actions || []).filter(a => a.type === 'github' && (a.status ?? 'active') === 'active')
        .map(a => a.data?.additionalFields || a.data?.additional_fields || {}); // Sentry's API answers camelCase; the alert file is written snake_case
      if (!targets.some(t => t.repo === repo && (t.labels || []).includes('incident'))) return `no active GitHub action opens an issue labelled incident in ${repo} (its GitHub actions: ${JSON.stringify(targets)})`;
      return true;
    });
  await check(`label incident exists in ${repo}`, `gh label create incident -R ${repo} --color B60205 --description "An incident: the owner's label wakes the on-call agent"`,
    async () => (await get(`https://api.github.com/repos/${repo}/labels/incident`, github)).name === 'incident' || 'GitHub answered another label');
  return results;
}

if (require.main === module) {
  if (!process.env.GITHUB_REPOSITORY || !process.env.GITHUB_TOKEN) { console.error('Set GITHUB_REPOSITORY and GITHUB_TOKEN'); process.exit(1); }
  preflight(process.env).then(results => {
    for (const r of results) console.log(r.ok ? `ok: ${r.msg}` : `::error::${r.msg}`);
    console.log(`Not checked here (GITHUB_TOKEN cannot read it): GitHub Actions may open pull requests. Manual items: ${CHECKLIST}`);
    process.exit(results.every(r => r.ok) ? 0 : 1);
  });
}
module.exports = { preflight };
