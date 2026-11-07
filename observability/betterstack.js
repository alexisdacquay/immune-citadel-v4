// Better Stack uptime checks for the game sites (docs/OBSERVABILITY-PLAN.md, step 4): creates or updates them, by URL.
// node observability/betterstack.js   (BETTERSTACK_API_TOKEN: Better Stack -> Settings -> API tokens, Uptime)
// Every 5 min. Sites: HEAD, proves the site answers without downloading the game. Save APIs (Starter plan since 2026-11-06,
// always on): GET /health, which also proves the API reached its database at startup.
const COMMON = { monitor_type: 'status', http_method: 'head', check_frequency: 300, email: true, recovery_period: 0, confirmation_period: 60 };
const MONITORS = [
  { pronounceable_name: 'Immune Citadel game (production)', url: 'https://immune-citadel-v4.onrender.com/' },
  { pronounceable_name: 'Immune Citadel game (dev)', url: 'https://immune-citadel-v4-dev.onrender.com/' },
  { pronounceable_name: 'Immune Citadel save API (production)', url: 'https://immune-citadel-v4-api.onrender.com/health', http_method: 'get' },
  { pronounceable_name: 'Immune Citadel save API (dev)', url: 'https://immune-citadel-v4-api-dev.onrender.com/health', http_method: 'get' },
];

const API = 'https://uptime.betterstack.com/api/v2/monitors', TOKEN = (process.env.BETTERSTACK_API_TOKEN || '').trim();
if (!TOKEN) { console.error('Set BETTERSTACK_API_TOKEN'); process.exit(1); }
const call = async (url, method = 'GET', body) => {
  const r = await fetch(url, { method, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${url}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
};
(async () => {
  const existing = (await call(`${API}?per_page=50`)).data;
  for (const m of MONITORS) {
    const found = existing.find(e => e.attributes.url === m.url), body = { ...COMMON, ...m };
    const res = found ? await call(`${API}/${found.id}`, 'PATCH', body) : await call(API, 'POST', body);
    console.log(`${found ? 'updated' : 'created'} ${res.data.id} ${m.url} (${res.data.attributes.status})`);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
