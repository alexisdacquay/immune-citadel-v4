// After a push to dev or main, CI's "deployed" job runs this: wait until the API's /health and the site's /version.txt
// both serve the pushed commit. Exit 1 if they do not within the limit, so the run goes red and GitHub emails the owner.
// Passes early when the branch has moved on: Render may skip straight to the newer commit, whose own run checks it.
// Env: SHA, API, SITE (base URLs), GITHUB_REPOSITORY, GITHUB_REF_NAME, GITHUB_TOKEN, GITHUB_API_URL; MINUTES (default 15).
const get = async (url, ms = 90000) => { // a sleeping Free API takes about a minute to wake
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), cache: 'no-store' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
};

async function verify({ sha, api, site, head, deadline, wait }) {
  for (;;) {
    const [a, s] = await Promise.all([
      get(`${api}/health`).then(t => JSON.parse(t).commit, e => `error (${e.message})`),
      get(`${site}/version.txt?t=${Date.now()}`).then(t => t.trim(), e => `error (${e.message})`),
    ]);
    if (a === sha && s === sha) return { ok: true, msg: `live: API and site serve ${sha}` };
    const h = await head().catch(() => sha);
    if (h !== sha) return { ok: true, msg: `superseded: the branch is now at ${h}, its own run checks that commit` };
    if (Date.now() > deadline) return { ok: false, msg: `not live: API serves ${a}, site serves ${s}, expected ${sha}` };
    await wait();
  }
}

if (require.main === module) {
  const { SHA: sha, API: api, SITE: site, GITHUB_REPOSITORY: repo, GITHUB_REF_NAME: branch, GITHUB_TOKEN: token, GITHUB_API_URL: gh = 'https://api.github.com', MINUTES = 15 } = process.env;
  if (!sha || !api || !site || !repo || !branch) { console.error('Set SHA, API, SITE, GITHUB_REPOSITORY and GITHUB_REF_NAME'); process.exit(1); }
  const head = async () => JSON.parse(await (await fetch(`${gh}/repos/${repo}/branches/${branch}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })).text()).commit.sha;
  verify({ sha, api, site, head, deadline: Date.now() + MINUTES * 60000, wait: () => new Promise(r => setTimeout(r, 15000)) })
    .then(r => { console.log(r.msg); process.exit(r.ok ? 0 : 1); });
}
module.exports = { verify };
