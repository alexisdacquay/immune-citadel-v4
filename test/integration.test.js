// Integration: the running stack (docker compose up) end to end. Game page :8080 -> save API :8787 -> Postgres.
const test = require('node:test'), assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const GAME = 'http://localhost:8080', API = 'http://localhost:8787';
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 16 }, () => ABC[Math.floor(Math.random() * 32)]).join('');
const sql = q => execFileSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-tAc', q], { encoding: 'utf8' }).trim();

test('a save sent to the API is stored in Postgres and read back', async () => {
  const code = newCode();
  const put = await fetch(`${API}/api/save/${code}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ save: { st: [3, 1] } }) });
  assert.equal(put.status, 200);
  assert.deepEqual(JSON.parse(sql(`SELECT data FROM saves WHERE code = '${code}'`)), { st: [3, 1] }, 'row in Postgres');
  assert.deepEqual((await (await fetch(`${API}/api/save/${code}`)).json()).save, { st: [3, 1] });
});

test('gameplay events reach the events table and its views', async () => {
  const page = Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  const r = await fetch(`${API}/api/play`, { method: 'POST', body: JSON.stringify({ page, release: '', events: [{ name: 'level_start', t: 1, level: 18, mode: 'iron', difficulty: 'hard' }, { name: 'hide', t: 2 }] }) });
  assert.equal(r.status, 204);
  assert.equal(sql(`SELECT name || ':' || coalesce(mode, '') FROM events WHERE page = '${page}' ORDER BY t`), 'level_start:iron\nhide:', 'rows in Postgres');
  assert.ok(+sql(`SELECT runs FROM level_stats WHERE level = 18 AND mode = 'iron' AND difficulty = 'hard'`) >= 1, 'counted in level_stats');
});

test('progress saved on one device continues on another through its save code', async () => {
  const browser = await chromium.launch();
  try {
    // device A: earn 3 stars on the first specimen; the game syncs to the cloud on its own
    const a = await (await browser.newContext()).newPage();
    await a.goto(GAME);
    await a.evaluate(() => { IC.save.st[0] = 3; persist(); });
    await a.waitForFunction(() => cloud.st === 'ok', null, { timeout: 15000 });
    const code = await a.evaluate(() => cloud.code);
    assert.equal(JSON.parse(sql(`SELECT data FROM saves WHERE code = '${code}'`)).st[0], 3, 'device A progress in Postgres');

    // device B: a fresh browser types the code into the cloud panel, as a player would
    const b = await (await browser.newContext()).newPage();
    await b.goto(GAME);
    assert.equal(await b.evaluate(() => IC.save.st[0]), 0, 'device B starts empty');
    await b.click('#cloudBtn');
    await b.fill('#cloudIn', code);
    await b.click('#cloudGo');
    await b.waitForFunction(() => IC.save.st[0] === 3 && cloud.st === 'ok', null, { timeout: 15000 });
  } finally { await browser.close(); }
});
