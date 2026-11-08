// After a deploy, CI's "deployed" job runs this: load the live site in Chromium, save, crash on purpose, and check that the game
// works and that no player data would reach Sentry; then, with play stats off and with Global Privacy Control, that a crash report
// still would, but no trace. Read-only, on production too: Sentry and every /api/ call from the page are answered here, so nothing is sent or saved. Usage: node tools/smoke.js <site> <api> <sha>; exit 1 on any failure.
const UA_MARK = 'ICSmokeUA/1', CRASH = 'smoke-test crash';
const missing = sentry => ['event', 'span'].filter(t => !sentry.some(b => b.includes(`"type":"${t}"`))); // a crash report and the page-load spans
const OFF = { // the two ways play stats are off, set before the page loads; each gets its own fresh browser profile
  'play stats off': () => localStorage.setItem('immune-citadel-v4-stats', 'off'),
  'Global Privacy Control': () => Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true }),
};

// Every reason the run failed (none = pass). sentry: the bodies the page tried to send to Sentry; code: its save code; plays: its gameplay posts;
// off: for each way play stats are off, the bodies that page tried to send to Sentry.
function problems({ sha, status, version, health, errors, failed, sentry, code, plays, off }) {
  const sent = sentry.join('\n'), bad = [...errors, ...failed];
  if (status !== 200) bad.push(`site HTTP ${status}`);
  if (version !== sha) bad.push(`site serves ${version}, expected ${sha}`);
  if (health.ok !== true || health.commit !== sha) bad.push(`API /health says ${JSON.stringify(health)}, expected ${sha}`);
  // Without these the leak checks below would pass with nothing to inspect.
  if (!code) bad.push('the game made no save');
  if (!plays) bad.push('the game sent no gameplay events');
  for (const t of missing(sentry)) bad.push(`no Sentry ${t} was captured`);
  for (const [why, bodies] of Object.entries(off)) {
    if (!bodies.some(b => b.includes('"type":"event"'))) bad.push(`${why}: no Sentry crash report was captured`);
    if (bodies.some(b => /"type":"(transaction|span)"/.test(b))) bad.push(`${why}: a trace was sent to Sentry`);
  }
  const leaks = {
    'save code': code && sent.includes(code),
    'user agent': sent.includes(UA_MARK) || /(?<![a-z_])user[-_ ]?agent/i.test(sent), // the lookbehind spares Sentry's own setting infer_user_agent
    IP: /\bip_address\b/.test(sent),
    headers: /"headers"/.test(sent),
    'play data': /\/api\/play/.test(sent),
  };
  for (const [what, hit] of Object.entries(leaks)) if (hit) bad.push(`${what} in a Sentry payload`);
  // The IP never appears in the payload: Sentry takes it from the connection unless the report says infer_ip "never" (userInfo: false).
  if (sentry.some(b => (b.includes('"type":"event"') && !b.includes('"infer_ip":"never"')) || /"infer_ip":"(?!never")/.test(b))) bad.push('Sentry is not told to drop the IP address (infer_ip must be "never")');
  return bad;
}

async function main([site, api, sha]) {
  if (!sha) throw new Error('usage: node tools/smoke.js <site> <api> <sha>');
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const seen = { status: null, errors: [], failed: [], sentry: [], code: null, plays: 0, off: {} };
  const open = async (sentry, init, tag = '') => { // a fresh profile on the site; init runs before the page's own scripts
    const ctx = await browser.newContext({ userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 ${UA_MARK}` });
    if (init) await ctx.addInitScript(init);
    await ctx.route(/\/api\/|\.sentry\.io\//, route => { // the CORS header lets the page read these cross-origin answers
      const q = route.request();
      if (q.url().includes('.sentry.io/')) sentry.push(q.postData() || '');
      else if (q.url().includes('/api/play')) seen.plays++;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true,"save":{}}' });
    });
    const page = await ctx.newPage();
    page.on('console', m => m.type() === 'error' && seen.errors.push(`${tag}console error: ${m.text()}`));
    page.on('pageerror', e => e.message.includes(CRASH) || seen.errors.push(`${tag}page error: ${e.message}`));
    page.on('requestfailed', q => seen.failed.push(`${tag}request failed: ${q.method()} ${q.url()} ${q.failure()?.errorText}`));
    const status = (await page.goto(site, { waitUntil: 'load', timeout: 60000 })).status();
    await page.waitForFunction(() => window.IC && window.Sentry?.getClient?.(), null, { timeout: 30000 });
    return { page, status };
  };
  const hideThenCrash = async (page, m) => { // a hidden tab makes the game flush its gameplay events and Sentry end its page-load span
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true }); document.dispatchEvent(new Event('visibilitychange', { bubbles: true })); });
    await page.evaluate(m => { setTimeout(() => { throw new Error(m); }); Promise.reject(new Error(m)); }, m);
  };
  try {
    const { page, status } = await open(seen.sentry);
    seen.status = status;
    const saved = page.waitForResponse(r => r.request().method() === 'PUT', { timeout: 30000 });
    await page.evaluate(() => { IC.startLevel(0); IC.build(0, 'neutro'); IC.sendWave(); }); // sendWave saves, so the game mints a code
    await saved;
    seen.code = await page.evaluate(() => localStorage.getItem('immune-citadel-v4-code'));
    await hideThenCrash(page, `${CRASH}, save code ${seen.code}`);
    for (let i = 0; i < 60 && missing(seen.sentry).length; i++) await page.waitForTimeout(500);
  } catch (e) { seen.errors.push(`stopped early: ${e.message}`); }
  await Promise.all(Object.entries(OFF).map(async ([why, init]) => {
    const sentry = seen.off[why] = [];
    try {
      const { page } = await open(sentry, init, `${why}: `);
      await hideThenCrash(page, CRASH);
      for (let i = 0; i < 60 && missing(sentry).includes('event'); i++) await page.waitForTimeout(500);
      await page.waitForTimeout(5000); // with stats on, the page-load spans follow the crash report within 2 s
    } catch (e) { seen.errors.push(`${why}: stopped early: ${e.message}`); }
  }));
  const get = (url, read) => fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30000) }).then(read);
  const version = await get(`${site}/version.txt?t=${Date.now()}`, r => r.text()).then(t => t.trim(), e => `error (${e.message})`);
  const health = await get(`${api}/health`, r => r.json()).catch(e => ({ error: e.message }));
  const bad = problems({ sha, version, health, ...seen }); // before close, which aborts whatever is still in flight
  await browser.close();
  console.log(bad.length ? `SMOKE FAIL ${site}\n- ${bad.join('\n- ')}` : `SMOKE PASS ${site} at ${sha}: ${seen.sentry.length} Sentry requests held back, no player data in them; with play stats off or GPC, crash reports and no traces`);
  process.exitCode = bad.length ? 1 : 0;
}

if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error('SMOKE FAIL', e.message); process.exitCode = 1; });
module.exports = { problems };
