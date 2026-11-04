// node tools/test.js [shotsDir] — page errors, slot geometry, bot playthrough of every level, screenshots
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
(async () => {
  const out = process.argv[2] || 'shots'; fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/fonts/.test(m.text()) && errs.push(m.text()));
  await p.goto('file://' + path.resolve('index.html')); await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/0-title.png` });
  const geo = await p.evaluate(() => IC.LEVELS.map((L, li) => { const ps = L.paths.map(IC.makePath); return L.slots.map(([x, y], i) => { const d = Math.min(...ps.map(q => IC.nearestOnPath(q, x, y).dd)); const near = Math.min(...L.slots.filter((_, j) => j !== i).map(([a, c]) => Math.hypot(a - x, c - y))); const hud = (x < 320 && y < 92) || (x < 300 && y > 525) || (x > 780 && y < 88); return (d < 50 || d > 115 || near < 62 || hud) ? `L${li} slot${i} [${x},${y}] path=${d|0} neighbour=${near|0}` : null; }).filter(Boolean); }).flat());
  console.log('slot problems:', geo.length ? geo : 'none');
  // routes must not run under the bottom-left ability cluster (enemies would walk under the HUD). Cluster, worst case (HUD scale 1.05 of the map):
  // x < 335, y > 531; a pathogen reaches ~21 below the route centre (lane offset 9 + body), so the centre must stay above y 510
  const route = await p.evaluate(() => IC.LEVELS.map((L, li) => L.paths.map((raw, pi) => { const q = IC.makePath(raw); for (let d = 0; d < q.len; d += 8) { const r = IC.posAt(q, d); if (r.x > -10 && r.x < 335 && r.y > 510) return `L${li + 1} route${pi + 1} under the ability cluster at [${r.x | 0},${r.y | 0}]`; } return null; }).filter(Boolean)).flat());
  console.log('route problems:', route.length ? route : 'none'); errs.push(...route);
  const results = []; let used = {}; // specialists bought by the bot, across all runs
  const nLv = await p.evaluate(() => IC.LEVELS.length);
  // every level twice: no Immune Memory upgrades, then all 18 tiers
  for (const mem of ['none', 'all']) for (let li = 0; li < nLv; li++) {
    const r = await p.evaluate(([li, mem, used]) => {
      // seeded: the same code always plays the same game, so a loss is a real regression, not luck (playtest/balance/bal.js measures the spread)
      const R0 = Math.random; let sd = (li + 1) * (mem === 'all' ? 7919 : 104729) >>> 0;
      Math.random = () => { sd = sd + 0x6D2B79F5 | 0; let t = Math.imul(sd ^ sd >>> 15, 1 | sd); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      IC.save.mem = mem === 'all' ? Object.fromEntries(IC.MEMORY.map(M => [M.id, 3])) : {};
      IC.startLevel(li); const S = IC.S; S.screen = 'play';
      const memOk = mem === 'none' ? S.hero.lvl === 1 && IC.AB.fever.cd === 32 : S.hero.lvl === 2 && IC.AB.fever.cd === 26 && IC.AB.swarm.n === 4 && IC.TOWERS.neutro.lv[0].range === 154;
      const order = ['neutro', 'macro', 'killer', 'bcell', 'neutro', 'killer', 'bcell', 'macro'];
      // rank slots by path coverage
      const cover = s => { let c = 0; for (const p of S.paths) for (let d = 0; d < p.len; d += 10) { const q = (function(){ return null })(); } return 0; };
      const ranked = S.slots.map((s, i) => { let c = 0; for (const p of S.paths) for (const [x, y] of p.pts) if (Math.hypot(x - s.x, y - s.y) < 140) c++; return [c, i]; }).sort((a, b) => b[0] - a[0]).map(x => x[1]);
      // hero post: in the front-middle of a route (where pathogens still arrive alive), the point with the most path (all routes)
      // within 90 and the most build sites within 150 = busiest choke
      let park = null, ps = -1;
      for (const p of S.paths) for (let d = p.len * .25; d < p.len * .6; d += 15) {
        const q = IC.posAt(p, d); if (q.x < 300 && q.y > 525) continue; // not under the bottom-left HUD
        let sc = 0; for (const o of S.paths) for (const [x, y] of o.pts) if (Math.hypot(x - q.x, y - q.y) < 90) sc++;
        sc += 3 * S.slots.filter(s => Math.hypot(s.x - q.x, s.y - q.y) < 150).length; if (sc > ps) { ps = sc; park = q; }
      }
      let bi = 0, t = 0, lowest = 20; const leaks = {}; const ol = S.lives; const origStep = IC.step; let prev = new Set();
      while (!S.over && t < 1500) {
        for (let k = 0; k < 60; k++) { const before = S.lives, alive = S.enemies.slice(); IC.step(1 / 60); if (S.lives < before) for (const e of alive) if (e.dead && e.d >= e.path.len) leaks[e.type] = (leaks[e.type] || 0) + 1; } t++;
        // spend
        for (let guard = 0; guard < 5; guard++) {
          const free = ranked.filter(i => !S.slots[i].tower);
          // tier 0-2 = levels, 3 = specialist, 4-5 = skill ranks. The first 4 towers are the core and go all the way;
          // a specialist buys its skill ranks before the next core tower specializes, so real runs reach skill ranks.
          // Rotation across runs (used = how often each specialist was bought so far): among core towers at the same tier the line
          // whose specialists were bought least goes first, and it takes its less-used specialist, so all 8 get played.
          const opts = b => Object.keys(IC.SPECS).filter(k => IC.SPECS[k].base === b), want = b => opts(b).reduce((s, k) => s + (used[k] || 0), 0);
          const specOf = u => opts(u.type).sort((a, c) => (used[a] || 0) - (used[c] || 0))[0];
          const tier = u => u.lvl + (u.spec ? 1 + u.rank : 0), core = S.towers.slice(0, 4), key = u => u.spec ? -1 : tier(u);
          const cost = u => u.lvl < 2 ? IC.TOWERS[u.type].lv[u.lvl + 1].cost : !u.spec ? IC.SPECS[specOf(u)].cost : IC.SPECS[u.spec].sk[u.rank].cost;
          const ups = S.towers.filter(x => tier(x) < (core.includes(x) ? 5 : 2)).sort((a, b) => (core.includes(b) - core.includes(a)) || key(a) - key(b) || (core.includes(a) ? want(a.type) - want(b.type) : 0));
          const wantUp = ups.length && (free.length === 0 || S.towers.length >= 6 && bi % 2 === 1);
          if (wantUp) { const u = ups[0], i = S.slots.indexOf(u.slot); if (S.gold >= cost(u)) { if (u.lvl < 2) IC.upgrade(i); else if (!u.spec) { const id = specOf(u); if (IC.specialize(i, id)) used[id] = (used[id] || 0) + 1; } else IC.skillUp(i); bi++; continue; } break; }
          if (free.length) { const k = order[bi % order.length]; if (S.gold >= IC.TOWERS[k].lv[0].cost) { IC.build(free[0], k); bi++; continue; } }
          break;
        }
        if (S.wave === 0) IC.sendWave();
        if (S.cds.fever <= 0) { let best = null, bn = 3; for (const e of S.enemies) { const n = S.enemies.filter(o => Math.hypot(o.x - e.x, o.y - e.y) < 80).reduce((s, o) => s + (o.D.stealth && !o.seen ? 3 : 1), 0); /* hidden stealth counts triple: fever reveals it */ if (n > bn) { bn = n; best = e; } } if (best) { S.ability = 'fever'; IC.castAbility(best.x, best.y); } }
        if (S.cds.swarm <= 0 && S.enemies.length) { const e = S.enemies.filter(e => !e.D.flying).sort((a, b) => (a.path.len - a.d) - (b.path.len - b.d))[0]; if (e) { const q = e.path; S.ability = 'swarm'; IC.castAbility(e.x, e.y); } }
        const H = S.hero;
        if (!H.dead && !H.mv && Math.hypot(H.hx - park.x, H.hy - park.y) > 5) IC.heroMove(park.x, park.y);
        if (!H.dead && S.cds.granzyme <= 0) { const n = S.enemies.filter(e => Math.hypot(e.x - H.x, e.y - H.y) < IC.HERO.gz.r).length; if (n >= 3 || (n && H.hp < H.max * .35)) IC.granzyme(); }
        lowest = Math.min(lowest, S.lives);
      }
      Math.random = R0;
      return { mem, memOk, level: li, won: S.over && S.lives > 0, lives: S.lives, wave: S.wave, secs: t, towers: S.towers.map(x => x.spec ? x.spec + x.rank : x.type[0] + x.lvl).join(' '), gold: S.gold, leaks: JSON.stringify(leaks), hero: `L${S.hero.lvl} kills ${S.hero.kills} park ${park.x | 0},${park.y | 0}`, used };
    }, [li, mem, used]);
    used = r.used;
    results.push(r);
    if (!r.won) errs.push(`bot lost level ${li + 1} with memory ${mem}`);
    if (!r.memOk) errs.push(`memory ${mem} not applied on level ${li + 1}`);
  }
  console.log(results);
  const specIds = await p.evaluate(() => Object.keys(IC.SPECS));
  console.log('specialists used by the bot:', specIds.map(k => `${k} ×${used[k] || 0}`).join(', '));
  const unused = specIds.filter(k => !used[k]); if (unused.length) errs.push('bot never bought: ' + unused.join(', '));
  for (const mem of ['none', 'all']) console.log(`bot, memory ${mem}:`, results.filter(r => r.mem === mem).map(r => `L${r.level + 1} ${r.won ? 'won' : 'LOST'} lives ${r.lives}`).join(' | '));
  await p.evaluate(() => { IC.save.mem = {}; IC.persist(); });
  // visual: start level 1 for real, build, play 25s with rAF, screenshot
  await p.reload(); await p.waitForTimeout(600); await p.screenshot({ path: `${out}/0-tray.png` });
  // the last specimen slide must open its level with a real click (unlocked by the bot's wins)
  const sl = await p.evaluate(n => { const r = document.querySelector(`.slide[data-i="${n - 1}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, nLv);
  await p.mouse.click(sl.x, sl.y); await p.waitForTimeout(200);
  if (!(await p.evaluate(n => IC.S.lvl === n - 1 && IC.S.screen === 'play', nLv))) errs.push('tray: click on the last slide did not start it');
  await p.evaluate(() => { IC.startLevel(0); });
  await p.waitForTimeout(400);
  await p.evaluate(() => { IC.build(0, 'neutro'); IC.build(2, 'macro'); IC.build(3, 'killer'); IC.build(5, 'bcell'); IC.S.gold = 600; IC.upgrade(0); IC.upgrade(3); IC.sendWave(); IC.S.speed = 2; });
  await p.waitForTimeout(9000); await p.screenshot({ path: `${out}/1-play.png` });
  const box = await p.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); const s = IC.S.slots[7]; return { x: r.left + s.x / 1000 * r.width, y: r.top + s.y / 620 * r.height }; });
  await p.mouse.click(box.x, box.y); await p.waitForTimeout(400); await p.mouse.move(box.x + 40, box.y - 40); await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/2-radial.png` });
  // hero: real clicks — portrait selects, a click near the path sends it (marker + dashed line), E bursts, right-click cancels
  const scr = (x, y) => p.evaluate(([x, y]) => { const r = document.getElementById('cv').getBoundingClientRect(); return { x: r.left + x / 1000 * r.width, y: r.top + y / 620 * r.height }; }, [x, y]);
  const must = (ok, msg) => { if (!ok) errs.push('hero: ' + msg); };
  await p.keyboard.press('Escape');
  const hb = await p.evaluate(() => { const r = document.getElementById('ab-hero').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(hb.x, hb.y); await p.waitForTimeout(100);
  must(await p.evaluate(() => !!(IC.S.sel && IC.S.sel.hero) && !document.getElementById('info').hidden), 'portrait click did not select');
  const dest = await p.evaluate(() => { const q = IC.posAt(IC.S.paths[0], 420); return [q.x, q.y + 12]; }), dp = await scr(...dest);
  const far = await scr(500, 30); await p.mouse.move(far.x, far.y); await p.waitForTimeout(150);
  await p.mouse.click(far.x, far.y); await p.waitForTimeout(100);
  must(await p.evaluate(() => !IC.S.hero.mv && !!IC.S.sel), 'click far from the path should be refused and keep selection');
  await p.mouse.move(dp.x, dp.y); await p.waitForTimeout(200); await p.screenshot({ path: `${out}/8-hero-aim.png` });
  await p.mouse.click(dp.x, dp.y); await p.waitForTimeout(250);
  must(await p.evaluate(([x, y]) => IC.S.hero.mv && Math.hypot(IC.S.hero.hx - x, IC.S.hero.hy - y) < 3 && !IC.S.sel, dest), 'move order not taken');
  await p.screenshot({ path: `${out}/9-hero-move.png` });
  await p.waitForTimeout(2500);
  const hp = await p.evaluate(() => [IC.S.hero.x, IC.S.hero.y]), hs = await scr(...hp);
  await p.mouse.click(hs.x, hs.y); await p.waitForTimeout(100);
  must(await p.evaluate(() => !!(IC.S.sel && IC.S.sel.hero)), 'click on the hero did not select');
  await p.mouse.click(hs.x + 200, hs.y, { button: 'right' }); await p.waitForTimeout(100);
  must(await p.evaluate(() => !IC.S.sel && !IC.S.hero.mv), 'right-click did not cancel');
  await p.evaluate(() => IC.heroXp(50)); // level 2: glow burst + LEVEL 2
  await p.keyboard.press('h'); await p.keyboard.press('e'); await p.waitForTimeout(250);
  must(await p.evaluate(() => IC.S.cds.granzyme > 0), 'E did not cast Granzyme Burst');
  await p.screenshot({ path: `${out}/10-hero-burst.png` });
  await p.evaluate(() => IC.hurt(IC.S.hero, 1e4)); await p.waitForTimeout(1200);
  must(await p.evaluate(() => IC.S.hero.dead && document.querySelector('#ab-hero .cd').textContent !== ''), 'respawn countdown missing');
  await p.screenshot({ path: `${out}/11-hero-dead.png` });
  for (let li = 1; li < nLv; li++) { await p.evaluate(li => { IC.startLevel(li); IC.S.gold = 3000; for (let i = 0; i < IC.S.slots.length; i += 2) IC.build(i, ['neutro','macro','bcell','killer'][i/2%4]); IC.S.wave = IC.LEVELS[li].waves.length - 1; IC.sendWave(); IC.S.speed = 2; }, li); await p.waitForTimeout(7000); await p.screenshot({ path: `${out}/${li + 2}-level${li + 1}.png` }); }
  // specialists: one of each, max rank, mid-fight; then a real click on a level-3 tower to show the branch choice
  await p.evaluate(() => { IC.startLevel(3); const S = IC.S; S.gold = 99999; const ids = Object.keys(IC.SPECS);
    ids.forEach((id, i) => { const k = [0, 2, 4, 5, 6, 10, 11, 12][i]; IC.build(k, IC.SPECS[id].base); IC.upgrade(k); IC.upgrade(k); IC.specialize(k, id); IC.skillUp(k); IC.skillUp(k); });
    IC.build(13, 'neutro'); IC.upgrade(13); IC.upgrade(13); S.wave = 9; IC.sendWave(); S.speed = 2; });
  await p.waitForTimeout(8000); await p.screenshot({ path: `${out}/6-specs.png` });
  const sb = await p.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); const s = IC.S.slots[13]; return { x: r.left + s.x / 1000 * r.width, y: r.top + s.y / 620 * r.height, k: r.width / 1000 }; });
  await p.mouse.click(sb.x, sb.y); await p.waitForTimeout(300); await p.mouse.move(sb.x - 66 * sb.k * 1.1, sb.y); await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/7-spec-choice.png` });
  // buying the specialization with a real click closes the radial and flashes the card
  await p.mouse.click(sb.x - 66 * sb.k * 1.1, sb.y); await p.waitForTimeout(150);
  if (!(await p.evaluate(() => !!IC.S.slots[13].tower.spec && !document.querySelector('#radial .rb') && document.getElementById('info').classList.contains('flash')))) errs.push('spec: click did not specialize, close the radial and flash the card');
  // Immune Memory: real clicks — tray button, buy tiers in order, refused out-of-order, reset with built-in confirm, effect on start, lab-report route
  const mm = (ok, msg) => { if (!ok) errs.push('memory: ' + msg); };
  const at = sel => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  const clickSel = async sel => { const q = await at(sel); await p.mouse.click(q.x, q.y); await p.waitForTimeout(120); };
  await p.evaluate(() => { IC.save.mem = {}; IC.persist(); }); await p.reload(); await p.waitForTimeout(600);
  await clickSel('#memBtn');
  mm(await p.evaluate(() => !document.getElementById('memOv').hidden && IC.S.screen === 'memory'), 'tray button did not open the screen');
  const avail0 = await p.evaluate(() => IC.memStars().avail);
  await p.screenshot({ path: `${out}/12-memory-empty.png` });
  await clickSel('.mnode[data-c="0"][data-t="1"]'); // tier II before tier I: refused
  mm(await p.evaluate(() => !IC.save.mem.neutro), 'tier II bought before tier I');
  for (const [c, t] of [[0, 0], [0, 1], [5, 0], [4, 0], [1, 0], [3, 0], [2, 0], [5, 1]]) await clickSel(`.mnode[data-c="${c}"][data-t="${t}"]`);
  mm(await p.evaluate(a => IC.save.mem.neutro === 2 && IC.save.mem.hero === 2 && IC.memStars().avail === a - 10, avail0), 'purchases not recorded / wrong cost');
  mm(await p.evaluate(() => JSON.parse(localStorage.getItem('immune-citadel-v4')).mem.hero === 2), 'not persisted');
  await p.mouse.move(10, 10); await p.waitForTimeout(600); await p.screenshot({ path: `${out}/13-memory-bought.png` });
  await clickSel('#memClear'); await p.screenshot({ path: `${out}/14-memory-confirm.png` });
  await clickSel('#memNo'); mm(await p.evaluate(() => IC.save.mem.hero === 2), 'cancel refunded');
  await clickSel('#memClear'); await clickSel('#memYes');
  mm(await p.evaluate(a => Object.keys(IC.save.mem).length === 0 && IC.memStars().avail === a, avail0), 'reset did not refund everything');
  for (const [c, t] of [[5, 0], [0, 0]]) await clickSel(`.mnode[data-c="${c}"][data-t="${t}"]`);
  await clickSel('#memBack'); mm(await p.evaluate(() => !document.getElementById('titleOv').hidden), 'back did not return to the tray');
  await clickSel('.slide[data-i="0"]');
  mm(await p.evaluate(() => IC.S.hero.lvl === 2 && IC.TOWERS.neutro.lv[0].range === 154), 'upgrades not applied on specimen start');
  await p.evaluate(() => IC.endLevel(true)); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/15-report-memory.png` });
  await clickSel('#eMem'); mm(await p.evaluate(() => !document.getElementById('memOv').hidden), 'lab report link did not open the screen');
  await clickSel('#memBack'); mm(await p.evaluate(() => !document.getElementById('endOv').hidden && IC.S.screen === 'end'), 'back did not return to the lab report');
  await p.evaluate(() => { IC.save.mem = {}; IC.persist(); });
  console.log('errors:', errs.length ? errs : 'none'); await b.close();
})();
