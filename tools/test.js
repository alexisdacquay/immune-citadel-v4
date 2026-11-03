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
  const results = [];
  for (let li = 0; li < 4; li++) {
    const r = await p.evaluate(li => {
      IC.startLevel(li); const S = IC.S; S.screen = 'play';
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
          // a specialist buys its skill ranks before the next core tower specializes, so real runs reach skill ranks;
          // same-type core towers alternate between the two specializations so every branch gets played.
          const specOf = u => { const o = Object.keys(IC.SPECS).filter(k => IC.SPECS[k].base === u.type); return o[S.towers.filter(x => x.type === u.type).indexOf(u) % 2]; };
          const tier = u => u.lvl + (u.spec ? 1 + u.rank : 0), core = S.towers.slice(0, 4), key = u => u.spec ? -1 : tier(u);
          const cost = u => u.lvl < 2 ? IC.TOWERS[u.type].lv[u.lvl + 1].cost : !u.spec ? IC.SPECS[specOf(u)].cost : IC.SPECS[u.spec].sk[u.rank].cost;
          const ups = S.towers.filter(x => tier(x) < (core.includes(x) ? 5 : 2)).sort((a, b) => (core.includes(b) - core.includes(a)) || key(a) - key(b));
          const wantUp = ups.length && (free.length === 0 || S.towers.length >= 6 && bi % 2 === 1);
          if (wantUp) { const u = ups[0], i = S.slots.indexOf(u.slot); if (S.gold >= cost(u)) { u.lvl < 2 ? IC.upgrade(i) : !u.spec ? IC.specialize(i, specOf(u)) : IC.skillUp(i); bi++; continue; } break; }
          if (free.length) { const k = order[bi % order.length]; if (S.gold >= IC.TOWERS[k].lv[0].cost) { IC.build(free[0], k); bi++; continue; } }
          break;
        }
        if (S.wave === 0) IC.sendWave();
        if (S.cds.fever <= 0) { let best = null, bn = 3; for (const e of S.enemies) { const n = S.enemies.filter(o => Math.hypot(o.x - e.x, o.y - e.y) < 80).length; if (n > bn) { bn = n; best = e; } } if (best) { S.ability = 'fever'; IC.castAbility(best.x, best.y); } }
        if (S.cds.swarm <= 0 && S.enemies.length) { const e = S.enemies.filter(e => !e.D.flying).sort((a, b) => (a.path.len - a.d) - (b.path.len - b.d))[0]; if (e) { const q = e.path; S.ability = 'swarm'; IC.castAbility(e.x, e.y); } }
        const H = S.hero;
        if (!H.dead && !H.mv && Math.hypot(H.hx - park.x, H.hy - park.y) > 5) IC.heroMove(park.x, park.y);
        if (!H.dead && S.cds.granzyme <= 0) { const n = S.enemies.filter(e => Math.hypot(e.x - H.x, e.y - H.y) < IC.HERO.gz.r).length; if (n >= 3 || (n && H.hp < H.max * .35)) IC.granzyme(); }
        lowest = Math.min(lowest, S.lives);
      }
      return { level: li, won: S.over && S.lives > 0, lives: S.lives, wave: S.wave, secs: t, towers: S.towers.map(x => x.spec ? x.spec + x.rank : x.type[0] + x.lvl).join(' '), gold: S.gold, leaks: JSON.stringify(leaks), hero: `L${S.hero.lvl} kills ${S.hero.kills} park ${park.x | 0},${park.y | 0}` };
    }, li);
    results.push(r);
  }
  console.log(results);
  // visual: start level 1 for real, build, play 25s with rAF, screenshot
  await p.reload(); await p.waitForTimeout(600); await p.evaluate(() => { IC.startLevel(0); });
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
  for (const li of [1, 2, 3]) { await p.evaluate(li => { IC.startLevel(li); IC.S.gold = 3000; for (let i = 0; i < IC.S.slots.length; i += 2) IC.build(i, ['neutro','macro','bcell','killer'][i/2%4]); IC.S.wave = IC.LEVELS[li].waves.length - 1; IC.sendWave(); IC.S.speed = 2; }, li); await p.waitForTimeout(7000); await p.screenshot({ path: `${out}/${li + 2}-level${li + 1}.png` }); }
  // specialists: one of each, max rank, mid-fight; then a real click on a level-3 tower to show the branch choice
  await p.evaluate(() => { IC.startLevel(3); const S = IC.S; S.gold = 99999; const ids = Object.keys(IC.SPECS);
    ids.forEach((id, i) => { const k = [0, 2, 4, 5, 6, 10, 11, 12][i]; IC.build(k, IC.SPECS[id].base); IC.upgrade(k); IC.upgrade(k); IC.specialize(k, id); IC.skillUp(k); IC.skillUp(k); });
    IC.build(13, 'neutro'); IC.upgrade(13); IC.upgrade(13); S.wave = 9; IC.sendWave(); S.speed = 2; });
  await p.waitForTimeout(8000); await p.screenshot({ path: `${out}/6-specs.png` });
  const sb = await p.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); const s = IC.S.slots[13]; return { x: r.left + s.x / 1000 * r.width, y: r.top + s.y / 620 * r.height, k: r.width / 1000 }; });
  await p.mouse.click(sb.x, sb.y); await p.waitForTimeout(300); await p.mouse.move(sb.x - 66 * sb.k * 1.1, sb.y); await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/7-spec-choice.png` });
  console.log('errors:', errs.length ? errs : 'none'); await b.close();
})();
