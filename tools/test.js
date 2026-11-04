// node tools/test.js [shotsDir] — page errors, slot geometry, bot playthrough of every level, screenshots
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
(async () => {
  const out = process.argv[2] || 'shots'; fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/fonts/.test(m.text()) && errs.push(m.text()));
  await p.goto('file://' + path.resolve('index.html')); await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/0-title.png` });
  // first play (no save): field notes on specimens 01, 02 and 04 with real input, one at a time, beside their target and never over it; then the Field Guide
  const ob = (ok, msg) => { if (!ok) errs.push('onboarding: ' + msg); }, gg = (ok, msg) => { if (!ok) errs.push('guide: ' + msg); };
  const mid = s => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, s);
  const toPage = async i => { const q = `.pg[data-p="${Math.floor(i / 6)}"]`; if (await p.evaluate(q => !document.querySelector(q).classList.contains('on'), q)) { await p.mouse.click(...await mid(q)); await p.waitForTimeout(100); } }; // the tray shows the page of specimen i (6 per page)
  const onMap = (x, y) => p.evaluate(([x, y]) => { const r = document.getElementById('cv').getBoundingClientRect(); return [r.left + x / 1000 * r.width, r.top + y / 620 * r.height]; }, [x, y]);
  const note = () => p.evaluate(() => { // the visible note, and whether it keeps clear of its target ring
    const h = document.getElementById('hint'), g = document.getElementById('hintRing'), s = document.getElementById('stage').getBoundingClientRect(); if (h.hidden) return null;
    const r = h.getBoundingClientRect(), cx = g.offsetLeft + g.offsetWidth / 2 + s.left, cy = g.offsetTop + g.offsetHeight / 2 + s.top;
    const nx = Math.max(r.left, Math.min(cx, r.right)), ny = Math.max(r.top, Math.min(cy, r.bottom));
    return { id: h.dataset.id, clear: Math.hypot(nx - cx, ny - cy) >= g.offsetWidth / 2 - 1, onStage: r.left >= s.left && r.right <= s.right && r.top >= s.top && r.bottom <= s.bottom, ring: [cx, cy] };
  });
  const expectNote = async (id, shot) => { const n = await note(); ob(n && n.id === id, `expected note "${id}", got ${n && n.id}`); if (n) ob(n.clear && n.onStage, `note "${id}" covers its target or leaves the stage`); if (shot) await p.screenshot({ path: `${out}/${shot}.png` }); return n; };
  ob(await p.evaluate(() => IC.save.hints.length === 0), 'a fresh save must start with every note pending');
  ob(await p.evaluate(() => IC.HINTS.map(h => h.id + h.lvl).join() === 'build0,wave0,upgrade1,timer2,hero3'), 'notes must belong to specimens 01 (build, wave), 02 (upgrade), 03 (timer) and 04 (hero)');
  await p.mouse.click(...await mid('.slide[data-i="0"]')); await p.waitForTimeout(2000);
  const n1 = await expectNote('build', '24-note-build');
  if (n1) { await p.mouse.click(...n1.ring); await p.waitForTimeout(250); ob(!(await note()), 'note should step aside while the radial is open'); }
  await p.mouse.click(...await mid('#radial .rb img[alt="Neutrophil"]')); await p.waitForTimeout(300);
  await expectNote('wave', '25-note-wave');
  await p.mouse.click(...await mid('.wcall:not([hidden])')); await p.waitForTimeout(300);
  ob(await p.evaluate(() => IC.S.wave === 1), 'the wave marker click did not call the wave');
  // the first pathogen pauses the game on its intro card; a first-time player has the Neutrophil only: no hero, no abilities
  ob(await p.evaluate(() => IC.S.screen === 'card' && !document.getElementById('cardOv').hidden && /E\. coli/.test(document.getElementById('cardOv').textContent)), 'the first wave should open the E. coli intro card');
  const t0 = await p.evaluate(() => IC.S.time); await p.waitForTimeout(400);
  ob(await p.evaluate(t0 => IC.S.time === t0, t0), 'the game must wait while an intro card is open');
  ob(await p.evaluate(() => ['fever', 'swarm', 'hero', 'gz'].every(k => document.getElementById('ab-' + k).hidden) && !IC.S.hero && IC.S.lines.join() === 'neutro'), 'specimen 01 kit: Neutrophil only, no hero, no abilities');
  await p.screenshot({ path: `${out}/27-card-ecoli.png` });
  await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  ob(await p.evaluate(() => IC.S.screen === 'play' && document.getElementById('cardOv').hidden), 'Enter should close the intro card');
  await p.evaluate(() => { IC.S.gold = 999; }); await p.waitForTimeout(600);
  ob(!(await note()), 'specimen 01 showed a note that belongs to a later specimen');
  // specimen 02: the Macrophage unlock card, then the upgrade note once a wave runs and an upgrade is affordable; the hero plate stays locked
  await p.evaluate(() => IC.startLevel(1)); await p.waitForTimeout(500 /* Enter works once a card was up 400 ms */);
  ob(await p.evaluate(() => IC.S.screen === 'card' && /Macrophage/.test(document.getElementById('cardOv').textContent) && IC.save.rch === 1), 'specimen 02 should open on the Macrophage unlock card');
  await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  ob(await p.evaluate(() => IC.S.screen === 'play' && IC.S.lines.join() === 'neutro,macro' && !IC.S.hero && document.getElementById('ab-hero').hidden), 'specimen 02 kit: Neutrophil and Macrophage, no hero');
  await p.evaluate(() => { IC.S.gold = 999; IC.build(0, 'neutro'); });
  await p.mouse.click(...await mid('.wcall:not([hidden])')); await p.waitForTimeout(300);
  await expectNote('upgrade', '26-note-upgrade');
  await p.mouse.click(...await mid('#hint .x')); await p.waitForTimeout(150);
  ob(await p.evaluate(() => IC.save.hints.includes('upgrade') && IC.S.towers[0].lvl === 0), 'dismiss did not retire the upgrade note');
  await p.keyboard.press('g'); await p.waitForTimeout(200);
  gg(await p.evaluate(() => IC.S.screen === 'guide' && !!document.querySelector('.gt[data-id="hero"].lock') && !!document.querySelector('.gt[data-id="macro"]:not(.lock)') && !!document.querySelector('.gt[data-id="killer"].lock')), 'on specimen 02 the Macrophage plate is open, the hero and Killer T plates locked');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  // specimen 04: the hero unlock card, then the hero note once the first wave runs
  await p.evaluate(() => IC.startLevel(3)); await p.waitForTimeout(500);
  ob(await p.evaluate(() => IC.S.screen === 'card' && /NK Sentinel/.test(document.getElementById('cardOv').textContent) && IC.save.rch === 3), 'specimen 04 should open on the hero unlock card');
  await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  ob(await p.evaluate(() => IC.S.screen === 'play' && !!IC.S.hero && !document.getElementById('ab-hero').hidden && document.getElementById('ab-gz').hidden && document.getElementById('ab-fever').hidden), 'specimen 04 kit: the hero joins, no Granzyme Burst or Fever yet');
  await p.mouse.click(...await mid('.wcall:not([hidden])')); await p.waitForTimeout(300);
  await expectNote('hero', '28-note-hero');
  await p.mouse.click(...await onMap(...await p.evaluate(() => [IC.S.hero.x, IC.S.hero.y]))); await p.waitForTimeout(150);
  ob(await p.evaluate(() => IC.save.hints.length === IC.HINTS.length - 1 && !IC.save.hints.includes('timer') && JSON.parse(localStorage.getItem('immune-citadel-v4')).hints.length === IC.HINTS.length - 1), 'all notes met so far (not the 03 timer note) should be done and saved');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150); ob(!(await note()), 'a note is still showing after all were done');
  // Field Guide: facts are short; cells and the hero locked until their unlock specimen, pathogens until met, specialists until their line
  // reaches level 3; NEW dots clear once viewed
  gg(await p.evaluate(() => [...IC.GUIDE.cells, ...IC.GUIDE.path].every(k => IC.FACTS[k] && IC.FACTS[k].split(/\s+/).length <= 25) && Object.keys(IC.ENEMIES).every(k => IC.GUIDE.path.includes(k))), 'every plate needs a fact of at most 25 words, every pathogen a plate');
  await p.mouse.click(...await mid('#mapBtn')); await p.waitForTimeout(200);
  gg(await p.evaluate(() => !document.querySelector('#guideBtn .ndot').hidden), 'tray button should carry a NEW dot');
  await p.mouse.click(...await mid('#guideBtn')); await p.waitForTimeout(300);
  gg(await p.evaluate(() => IC.S.screen === 'guide' && !document.getElementById('guideOv').hidden && document.querySelectorAll('.gt').length === 13 && document.querySelectorAll('.gt.lock').length === 10 && ['neutro', 'macro', 'hero'].every(k => document.querySelector(`.gt[data-id="${k}"]:not(.lock)`))), 'cells tab after specimen 04: 13 plates, only Neutrophil, Macrophage and the hero open');
  await p.screenshot({ path: `${out}/29-guide-cells.png` });
  await p.mouse.click(...await mid('.gtab[data-tab="path"]')); await p.waitForTimeout(200);
  gg(await p.evaluate(() => document.querySelectorAll('.gt').length === 12 && document.querySelectorAll('.gt:not(.lock)').length === 1 && !!document.querySelector('.gt[data-id="bact"]:not(.lock)')), 'pathogens tab: only E. coli observed');
  await p.mouse.click(...await mid('.gt[data-id="rabies"]')); await p.waitForTimeout(200);
  gg(await p.evaluate(() => /Not yet observed/.test(document.getElementById('gText').textContent) && !IC.save.viewed.includes('rabies')), 'a locked plate must not reveal its pathogen');
  await p.screenshot({ path: `${out}/30-guide-locked.png` });
  for (const id of ['bact']) await p.mouse.click(...await mid(`.gt[data-id="${id}"]`));
  await p.mouse.click(...await mid('.gtab[data-tab="cells"]'));
  await p.mouse.click(...await mid('.gt[data-id="killer"]')); await p.waitForTimeout(100);
  gg(await p.evaluate(() => IC.unlockAt('killer') === 6 && /Specimen 07/.test(document.getElementById('gText').textContent) && !IC.save.viewed.includes('killer')), 'a locked cell plate must name its unlock specimen (07) and stay unviewed');
  for (const id of ['neutro', 'macro', 'bcell', 'killer', 'hero']) { await p.mouse.click(...await mid(`.gt[data-id="${id}"]`)); await p.waitForTimeout(60); }
  gg(await p.evaluate(() => /E\. coli|NK Sentinel/.test(document.getElementById('gText').textContent) && document.querySelectorAll('.ndot:not([hidden])').length === 0), 'NEW dots should clear once every open plate was viewed');
  await p.mouse.click(...await mid('#gBack')); await p.waitForTimeout(200);
  gg(await p.evaluate(() => IC.S.screen === 'title' && document.querySelector('#guideBtn .ndot').hidden), 'back should return to the tray without a NEW dot');
  const geo = await p.evaluate(() => IC.LEVELS.map((L, li) => { const ps = L.paths.map(IC.makePath); return L.slots.map(([x, y], i) => { const d = Math.min(...ps.map(q => IC.nearestOnPath(q, x, y).dd)); const near = Math.min(...L.slots.filter((_, j) => j !== i).map(([a, c]) => Math.hypot(a - x, c - y))); const hud = (x < 320 && y < 92) || (x < 300 && y > 525) || (x > 780 && y < 88); return (d < 50 || d > 115 || near < 62 || hud) ? `L${li} slot${i} [${x},${y}] path=${d|0} neighbour=${near|0}` : null; }).filter(Boolean); }).flat());
  console.log('slot problems:', geo.length ? geo : 'none');
  // routes must not run under the bottom-left ability cluster (enemies would walk under the HUD). Cluster, worst case (HUD scale 1.05 of the map):
  // x < 335, y > 531; a pathogen reaches ~21 below the route centre (lane offset 9 + body), so the centre must stay above y 510
  const route = await p.evaluate(() => IC.LEVELS.map((L, li) => L.paths.map((raw, pi) => { const q = IC.makePath(raw); for (let d = 0; d < q.len; d += 8) { const r = IC.posAt(q, d); if (r.x > -10 && r.x < 335 && r.y > 510) return `L${li + 1} route${pi + 1} under the ability cluster at [${r.x | 0},${r.y | 0}]`; } return null; }).filter(Boolean)).flat());
  // cloud merge: progress only grows (best stars, every challenge won, furthest reach), choices follow the newer save
  const mg = await p.evaluate(() => { const z = () => Array(18).fill(0), A = z(), B = z(), H = z(); A[0] = 3; B[0] = 1; B[1] = 2; H[2] = 1;
    const m = IC.mergeSave({ st: A, seen: ['a'], mem: { x: 1 }, diff: 'hard', at: 2, rch: 4 }, { st: B, seen: ['b', 'a'], mem: {}, diff: 'easy', at: 1, hc: H, rch: 2 }); return JSON.stringify([m.st.slice(0, 3), m.seen, m.mem, m.diff, m.hc.slice(0, 4), m.ic.length, m.rch, m.at]); });
  if (mg !== '[[3,2,0],["a","b"],{"x":1},"hard",[0,0,1,0],18,4,2]') errs.push('cloud merge lost progress or picked the older choices: ' + mg);
  // a 6-specimen save folds onto the full maps (LMARK); its reach 1 becomes specimen 09 (index 8)
  const fo = await p.evaluate(() => { const f = IC.fold({ stars: [3, 2, 0, 0, 0, 0], reach: 1 }), m = IC.mergeSave({}, { stars: [3, 2, 0, 0, 0, 0], reach: 1 }); return [f, m].map(o => [o.st[2], o.st[5], o.rch, o.st.length]).join('|'); });
  if (fo !== '3,2,8,18|3,2,8,18') errs.push('old save did not fold to st[2]=3, st[5]=2, rch=8: ' + fo);
  // a new save merged with a stale 6-specimen copy (newer clock, either order) never loses st / hc / ic / rch
  const stale = await p.evaluate(() => { const z = () => Array(18).fill(0), st = z(), hc = z(), ic = z(); st[2] = 1; st[5] = 3; st[10] = 2; hc[2] = 1; ic[5] = 1; hc[14] = 1;
    const a = { st, hc, ic, rch: 12, at: 1 }, b = { stars: [3, 2, 0, 0, 0, 0], heroic: [0, 0, 0, 0, 0, 0], iron: [0, 0, 0, 0, 0, 0], reach: 1, at: 5 }, bad = [];
    for (const m of [IC.mergeSave(a, b), IC.mergeSave(b, a)]) { for (const k of ['st', 'hc', 'ic']) a[k].forEach((v, i) => m[k][i] < v && bad.push(`${k}[${i}]`)); if (m.st[2] !== 3 || m.rch !== 12) bad.push(`st[2]=${m.st[2]} rch=${m.rch}`); }
    return bad; });
  if (stale.length) errs.push('merging a stale old-format save lowered progress: ' + stale.join(', '));
  console.log('route problems:', route.length ? route : 'none'); errs.push(...route);
  const results = []; let used = {}; // specialists bought by the bot, across all runs
  const nLv = await p.evaluate(() => IC.LEVELS.length), lmark = await p.evaluate(() => IC.LMARK);
  // every specimen twice: no Immune Memory upgrades (that specimen's first-time kit), then all 18 tiers (full kit); then each challenge
  // on the six full maps (LMARK) with all tiers (reported, not required to win)
  for (const [mem, mode] of [['none', 'campaign'], ['all', 'campaign'], ['all', 'heroic'], ['all', 'iron']]) for (let li = 0; li < nLv; li++) {
    if (mode !== 'campaign' && !lmark.includes(li)) continue;
    if (mode === 'heroic' && li === lmark[0]) await p.evaluate(() => { window._camp = JSON.stringify(IC.save.st); });
    const play = (alt, used) => p.evaluate(([li, mem, used, mode, alt]) => {
      // seeded: the same code always plays the same game, so a loss is a real regression, not luck (playtest/balance/bal.js measures the spread)
      const R0 = Math.random; let sd = (li + 1) * (mem === 'all' ? 7919 : 104729) + (mode === 'heroic' ? 17 : mode === 'iron' ? 31 : 0) + alt * 7777 >>> 0;
      Math.random = () => { sd = sd + 0x6D2B79F5 | 0; let t = Math.imul(sd ^ sd >>> 15, 1 | sd); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      IC.save.mem = mem === 'all' ? Object.fromEntries(IC.MEMORY.map(M => [M.id, 3])) : {};
      IC.save.rch = mem === 'none' ? li : IC.LEVELS.length - 1; IC.startLevel(li, mode); const S = IC.S; S.screen = 'play'; // a first-time player has only that specimen's kit
      const memOk = mem === 'none' ? (!S.hero || S.hero.lvl === 1) && IC.AB.fever.cd === 32 : S.hero.lvl === 2 && IC.AB.fever.cd === 26 && IC.AB.swarm.n === 4 && IC.TOWERS.neutro.lv[0].range === 154;
      const order = ['neutro', 'macro', 'killer', 'bcell', 'neutro', 'killer', 'bcell', 'macro'].filter(k => S.lines.includes(k)); // iron: its two lines
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
        for (let k = 0; k < 60; k++) { const before = S.lives, alive = S.enemies.slice(); IC.step(1 / 60); while (S.screen === 'card') IC.cardNext(); if (S.lives < before) for (const e of alive) if (e.dead && e.d >= e.path.len) leaks[e.type] = (leaks[e.type] || 0) + 1; } t++;
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
          const ups = S.towers.filter(x => tier(x) < (core.includes(x) && S.kit.spec.includes(x.type) ? 5 : 2)).sort((a, b) => (core.includes(b) - core.includes(a)) || key(a) - key(b) || (core.includes(a) ? want(a.type) - want(b.type) : 0));
          const wantUp = ups.length && (free.length === 0 || S.towers.length >= 6 && bi % 2 === 1);
          if (wantUp) { const u = ups[0], i = S.slots.indexOf(u.slot); if (S.gold >= cost(u)) { if (u.lvl < 2) IC.upgrade(i); else if (!u.spec) { const id = specOf(u); if (IC.specialize(i, id)) used[id] = (used[id] || 0) + 1; } else IC.skillUp(i); bi++; continue; } break; }
          if (free.length) { const k = order[bi % order.length]; if (S.gold >= IC.TOWERS[k].lv[0].cost) { IC.build(free[0], k); bi++; continue; } }
          break;
        }
        if (S.wave === 0 || S.L.hold && S.mode === 'campaign' && S.wave > 0 && !S.enemies.length && !S.spawnQ.length) IC.sendWave(); // hold: the player calls each wave once the field is clear
        if (S.cds.fever <= 0) { let best = null, bn = 3; for (const e of S.enemies) { const n = S.enemies.filter(o => Math.hypot(o.x - e.x, o.y - e.y) < 80).reduce((s, o) => s + (o.D.stealth && !o.seen ? 3 : 1), 0); /* hidden stealth counts triple: fever reveals it */ if (n > bn) { bn = n; best = e; } } if (best) { S.ability = 'fever'; IC.castAbility(best.x, best.y); } }
        if (S.cds.swarm <= 0 && S.enemies.length) { const e = S.enemies.filter(e => !e.D.flying).sort((a, b) => (a.path.len - a.d) - (b.path.len - b.d))[0]; if (e) { const q = e.path; S.ability = 'swarm'; IC.castAbility(e.x, e.y); } }
        const H = S.hero || { dead: true }; // no hero before specimen 04
        if (!H.dead && !H.mv && Math.hypot(H.hx - park.x, H.hy - park.y) > 5) IC.heroMove(park.x, park.y);
        if (!H.dead && S.cds.granzyme <= 0) { const n = S.enemies.filter(e => Math.hypot(e.x - H.x, e.y - H.y) < IC.HERO.gz.r).length; if (n >= 3 || (n && H.hp < H.max * .35)) IC.granzyme(); }
        lowest = Math.min(lowest, S.lives);
      }
      Math.random = R0;
      return { mem, mode, memOk, level: li, time: S.time | 0, chStar: mode !== 'campaign' && IC.save[mode === 'heroic' ? 'hc' : 'ic'][li], won: S.over && S.lives > 0, lives: S.lives, wave: S.wave, secs: t, towers: S.towers.map(x => x.spec ? x.spec + x.rank : x.type[0] + x.lvl).join(' '), gold: S.gold, leaks: JSON.stringify(leaks), hero: S.hero && `L${S.hero.lvl} kills ${S.hero.kills} park ${park.x | 0},${park.y | 0}`, used };
    }, [li, mem, used, mode, alt]);
    const r = await play(0, used); used = r.used;
    results.push(r);
    // one seeded game can snowball on a small early difference (2026-11-05: Fever's damage type flipped specimen 18 on one seed while
    // 40 unseeded balance runs lost no vitality). A loss replays two more seeds and fails only if most of the three lose; retries are printed.
    if (!r.won && mode === 'campaign') {
      const more = [await play(1, r.used), await play(2, r.used)], wins = more.filter(x => x.won).length;
      console.log(`level ${li + 1} memory ${mem}: seed 0 LOST, seeds 1-2 ${more.map(x => x.won ? 'won ' + x.lives : 'LOST').join(', ')}`);
      if (wins < 2) errs.push(`bot lost level ${li + 1} with memory ${mem} on ${3 - wins} of 3 seeds`);
    }
    if (mode !== 'campaign' && r.won !== !!r.chStar) errs.push(`${mode} ${li + 1}: won=${r.won} but challenge star=${r.chStar}`);
    if (!r.memOk) errs.push(`memory ${mem} not applied on level ${li + 1}`);
  }
  console.log(results);
  const specIds = await p.evaluate(() => Object.keys(IC.SPECS));
  console.log('specialists used by the bot:', specIds.map(k => `${k} ×${used[k] || 0}`).join(', '));
  const unused = specIds.filter(k => !used[k]); if (unused.length) errs.push('bot never bought: ' + unused.join(', '));
  for (const mem of ['none', 'all']) console.log(`bot, memory ${mem}:`, results.filter(r => r.mem === mem && r.mode === 'campaign').map(r => `L${r.level + 1} ${r.won ? 'won' : 'LOST'} lives ${r.lives}`).join(' | '));
  for (const mode of ['heroic', 'iron']) { const rs = results.filter(r => r.mode === mode); console.log(`bot, ${mode} challenge (memory all): ${rs.filter(r => r.won).length}/${rs.length} won ·`, rs.map(r => `L${r.level + 1} ${r.won ? 'won' : `LOST wave ${r.wave} at ${r.time}s ${r.leaks}`}`).join(' | ')); }
  // campaign stars may rise during the campaign runs; the challenge runs must not touch them
  if (await p.evaluate(() => JSON.stringify(IC.save.st) !== window._camp)) errs.push('challenges changed campaign stars');
  await p.evaluate(() => { IC.save.mem = {}; IC.persist(); });
  // Field Guide after the bot met everything: from pause, with real clicks; the specimen waits and resumes paused
  await p.reload(); await p.waitForTimeout(500);
  gg(await p.evaluate(() => !document.querySelector('#guideBtn .ndot').hidden), 'new pathogens and specialists should raise the NEW dot');
  await p.evaluate(() => { IC.startLevel(IC.LMARK[3]); IC.S.gold = 9999; IC.build(0, 'neutro'); IC.sendWave(); }); await p.waitForTimeout(1500);
  await p.keyboard.press('Space'); await p.waitForTimeout(150); await p.mouse.click(...await mid('#pauseGuide')); await p.waitForTimeout(300);
  const tg = await p.evaluate(() => IC.S.time);
  await p.mouse.click(...await mid('.gtab[data-tab="path"]')); await p.mouse.click(...await mid('.gt[data-id="boss"]')); await p.waitForTimeout(1200);
  gg(await p.evaluate(() => document.querySelectorAll('.gt.lock').length === 0 && /MRSA Superbug/.test(document.getElementById('gText').textContent) && /Colossal/.test(document.getElementById('gText').textContent)), 'boss plate missing or locked');
  await p.screenshot({ path: `${out}/31-guide-boss.png` });
  await p.mouse.click(...await mid('.gtab[data-tab="cells"]')); await p.mouse.click(...await mid('.gt[data-id="degran"]')); await p.waitForTimeout(300);
  gg(await p.evaluate(() => document.querySelectorAll('.gt.lock').length === 0 && /Degranulator/.test(document.getElementById('gText').textContent)), 'specialist plate locked after the bot used it');
  await p.screenshot({ path: `${out}/32-guide-specialist.png` });
  await p.mouse.click(...await mid('#gBack')); await p.waitForTimeout(200);
  gg(await p.evaluate(t => IC.S.screen === 'play' && IC.S.paused && IC.S.towers.length === 1 && IC.S.time - t < 1, tg), 'back from pause should return to the same paused specimen');
  await p.keyboard.press('g'); await p.waitForTimeout(150); gg(await p.evaluate(() => IC.S.screen === 'guide'), 'G should open the guide in play');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150); gg(await p.evaluate(() => IC.S.screen === 'play'), 'Esc should close the guide');
  // visual: start level 1 for real, build, play 25s with rAF, screenshot
  await p.reload(); await p.waitForTimeout(600); await p.screenshot({ path: `${out}/0-tray.png` });
  // the last specimen slide must open its level with a real click (unlocked by the bot's wins)
  await toPage(nLv - 1);
  const sl = await p.evaluate(n => { const r = document.querySelector(`.slide[data-i="${n - 1}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, nLv);
  await p.mouse.click(sl.x, sl.y); await p.waitForTimeout(200);
  if (!(await p.evaluate(n => IC.S.lvl === n - 1 && IC.S.screen === 'play', nLv))) errs.push('tray: click on the last slide did not start it');
  await p.evaluate(() => { IC.startLevel(0); });
  await p.waitForTimeout(400);
  await p.evaluate(() => { IC.build(0, 'neutro'); IC.build(2, 'macro'); IC.build(3, 'killer'); IC.build(5, 'bcell'); IC.S.gold = 600; IC.upgrade(0); IC.upgrade(3); IC.sendWave(); IC.S.speed = 2; });
  await p.waitForTimeout(9000); await p.screenshot({ path: `${out}/1-play.png` });
  const box = await p.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); const s = IC.S.slots[IC.S.slots.length - 1]; return { x: r.left + s.x / 1000 * r.width, y: r.top + s.y / 620 * r.height }; });
  await p.mouse.click(box.x, box.y); await p.waitForTimeout(400); await p.mouse.move(box.x + 40, box.y - 40); await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/2-radial.png` });
  // hero: real clicks — portrait selects, a click near the path sends it (marker + dashed line), E bursts, right-click cancels
  const scr = (x, y) => p.evaluate(([x, y]) => { const r = document.getElementById('cv').getBoundingClientRect(); return { x: r.left + x / 1000 * r.width, y: r.top + y / 620 * r.height }; }, [x, y]);
  const must = (ok, msg) => { if (!ok) errs.push('hero: ' + msg); };
  await p.keyboard.press('Escape');
  const hb = await p.evaluate(() => { const r = document.getElementById('ab-hero').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(hb.x, hb.y); await p.waitForTimeout(100);
  must(await p.evaluate(() => !!(IC.S.sel && IC.S.sel.hero) && !document.getElementById('info').hidden), 'portrait click did not select');
  const dest = await p.evaluate(() => { const P = IC.S.paths[0], H = IC.S.hero; for (let d = 300; d < P.len; d += 20) { const q = IC.posAt(P, d); if (Math.hypot(q.x - H.x, q.y - H.y) > 140 && q.y > 130) return [q.x, q.y + 12]; } }), dp = await scr(...dest);
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
  await p.evaluate(() => { IC.startLevel(IC.LMARK[3]); const S = IC.S; S.gold = 99999; const ids = Object.keys(IC.SPECS);
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
  mm(await p.evaluate(a => IC.save.mem.neutro === 2 && IC.save.mem.hero === 2 && IC.memStars().avail === a - 6 * IC.MEMCOST[0] - 2 * IC.MEMCOST[1], avail0), 'purchases not recorded / wrong cost');
  mm(await p.evaluate(() => JSON.parse(localStorage.getItem('immune-citadel-v4')).mem.hero === 2), 'not persisted');
  await p.mouse.move(10, 10); await p.waitForTimeout(600); await p.screenshot({ path: `${out}/13-memory-bought.png` });
  await clickSel('#memClear'); await p.screenshot({ path: `${out}/14-memory-confirm.png` });
  await clickSel('#memNo'); mm(await p.evaluate(() => IC.save.mem.hero === 2), 'cancel refunded');
  await clickSel('#memClear'); await clickSel('#memYes');
  mm(await p.evaluate(a => Object.keys(IC.save.mem).length === 0 && IC.memStars().avail === a, avail0), 'reset did not refund everything');
  for (const [c, t] of [[5, 0], [0, 0]]) await clickSel(`.mnode[data-c="${c}"][data-t="${t}"]`);
  await clickSel('#memBack'); mm(await p.evaluate(() => !document.getElementById('titleOv').hidden), 'back did not return to the tray');
  await toPage(0); await clickSel('.slide[data-i="0"]');
  mm(await p.evaluate(() => IC.S.hero.lvl === 2 && IC.TOWERS.neutro.lv[0].range === 154), 'upgrades not applied on specimen start');
  await p.evaluate(() => IC.endLevel(true)); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/15-report-memory.png` });
  await clickSel('#eMem'); mm(await p.evaluate(() => !document.getElementById('memOv').hidden), 'lab report link did not open the screen');
  await clickSel('#memBack'); mm(await p.evaluate(() => !document.getElementById('endOv').hidden && IC.S.screen === 'end'), 'back did not return to the lab report');
  await p.evaluate(() => { IC.save.mem = {}; IC.persist(); });
  // challenges: real clicks on the slide badges, the rules they impose, the lab report, the star economy
  const cc = (ok, msg) => { if (!ok) errs.push('challenge: ' + msg); };
  cc(await p.evaluate(() => IC.MEMORY.length * IC.MEMCOST.reduce((a, b) => a + b) === 66 && IC.LEVELS.length * 3 + IC.LMARK.length * 2 === 66), 'buying every memory tier must cost exactly the 66 stars there are');
  await p.evaluate(() => IC.showTitle()); await p.waitForTimeout(200);
  // each tray page: chips only on won full-map specimens (LMARK), and only once the kit is complete (KITFULL); before that a note
  const chipPages = async full => { const bad = []; for (let pg = 0; pg < Math.ceil(nLv / 6); pg++) { await toPage(pg * 6); bad.push(...await p.evaluate(full => [...document.querySelectorAll('.slide')].filter(e => {
    const i = +e.dataset.i, won = IC.LMARK.includes(i) && IC.save.st[i] > 0, chn = e.querySelector('.chn');
    return e.querySelectorAll('.chb').length !== (full && won ? 2 : 0) || (!full && won) !== (!!chn && /Challenges open at Specimen 17/.test(chn.textContent)); }).map(e => e.dataset.i), full)); } return bad; };
  const noKit = await (async () => { await p.evaluate(() => { window._rch = IC.save.rch; IC.save.rch = IC.KITFULL - 1; IC.showTitle(); }); const b = await chipPages(false); await p.evaluate(() => { IC.save.rch = window._rch; IC.showTitle(); }); return b; })();
  cc(!noKit.length, 'before Specimen 17 a won full map must show the challenges note and no chips: slides ' + noKit);
  const chipBad = await chipPages(true);
  cc(!chipBad.length, 'every won full-map specimen (and only those) offers Acute and Chronic: slides ' + chipBad);
  const camp = await p.evaluate(() => JSON.stringify(IC.save.st));
  await toPage(lmark[0]); await clickSel(`.slide[data-i="${lmark[0]}"] .chb[data-m="heroic"]`); await p.waitForTimeout(300);
  cc(await p.evaluate(() => IC.S.mode === 'heroic' && IC.S.lives === 3 && IC.S.waves.length === 6 && IC.S.screen === 'play' && /ACUTE/.test(document.getElementById('specId').textContent)), 'heroic badge did not start the heroic challenge');
  await p.screenshot({ path: `${out}/16-heroic-start.png` });
  await p.evaluate(() => { IC.build(2, 'neutro'); IC.build(3, 'killer'); IC.sendWave(); IC.S.speed = 2; }); await p.waitForTimeout(5000);
  await p.screenshot({ path: `${out}/17-heroic-play.png` });
  await clickSel('#mapBtn'); await toPage(lmark[4]); await clickSel(`.slide[data-i="${lmark[4]}"] .chb[data-m="iron"]`); await p.waitForTimeout(300);
  cc(await p.evaluate(() => IC.S.mode === 'iron' && IC.S.lvl === IC.LMARK[4] && IC.S.lives === 1 && IC.S.waves.length === 1 && IC.S.lines.join() === IC.CHAL[IC.LEVELS[IC.LMARK[4]].chal].lines.join()), 'iron badge did not start the iron challenge');
  const sl5 = await p.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); const s = IC.S.slots[5]; return { x: r.left + s.x / 1000 * r.width, y: r.top + s.y / 620 * r.height }; });
  await p.mouse.click(sl5.x, sl5.y); await p.waitForTimeout(300);
  cc(await p.evaluate(() => document.querySelectorAll('#radial .rb').length === 2), 'iron radial must offer exactly its two cell lines');
  await p.keyboard.press('q'); cc(await p.evaluate(() => !IC.S.ability && IC.build(6, IC.TORDER.find(k => !IC.S.lines.includes(k))) === false), 'iron must refuse fever and other cell lines');
  await p.mouse.move(sl5.x + 30, sl5.y - 60); await p.waitForTimeout(300); await p.screenshot({ path: `${out}/18-iron-radial.png` });
  await p.keyboard.press('Escape');
  await p.evaluate(() => { IC.S.gold = 2000; [0, 2, 4, 6, 8, 10].forEach((s, i) => IC.build(s, IC.S.lines[i % 2])); IC.sendWave(); IC.S.speed = 2; }); await p.waitForTimeout(9000);
  await p.screenshot({ path: `${out}/19-iron-play.png` });
  const iron0 = await p.evaluate(() => IC.save.ic[IC.LMARK[4]]);
  await p.evaluate(() => IC.endLevel(true)); await p.waitForTimeout(1200);
  cc(await p.evaluate(() => IC.save.ic[IC.LMARK[4]] === 1 && /CHRONIC/.test(document.getElementById('rep').textContent) && !document.getElementById('eNext')), 'iron win not recorded or report missing the mode');
  cc(await p.evaluate(c => JSON.stringify(IC.save.st) === c, camp), 'a challenge changed campaign stars');
  if (!iron0) await p.screenshot({ path: `${out}/20-report-iron.png` }); else { await p.evaluate(() => { IC.save.ic[IC.LMARK[4]] = 0; IC.startLevel(IC.LMARK[4], 'iron'); IC.endLevel(true); }); await p.waitForTimeout(1200); await p.screenshot({ path: `${out}/20-report-iron.png` }); }
  await clickSel('#eRetry'); cc(await p.evaluate(() => IC.S.mode === 'iron' && IC.S.lvl === IC.LMARK[4]), 'retry left the challenge');
  await p.evaluate(() => { IC.startLevel(IC.LMARK[5], 'heroic'); IC.S.wave = 3; IC.endLevel(false); }); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/21-report-heroic-lost.png` });
  // a save from before challenges whose purchases cost more than its stars: purchases kept, nothing negative, challenge arrays added
  await p.evaluate(() => { localStorage.removeItem('immune-citadel-v4-p18'); localStorage.setItem('immune-citadel-v4', JSON.stringify({ stars: [3, 2, 0, 0, 0, 0], seen: [], mem: { neutro: 3, macro: 3 } })); }); // no mirror: a real 6-specimen player has none
  await p.reload(); await p.waitForTimeout(600);
  cc(await p.evaluate(() => { const m = IC.memStars(); return m.total === 5 && m.spent === 2 * IC.MEMCOST.reduce((a, b) => a + b) && m.avail === 0 && IC.save.mem.neutro === 3 && IC.save.hc.length === 18 && IC.save.ic.length === 18 && IC.save.st[2] === 3 && IC.save.st[5] === 2 && IC.save.rch === 17 && document.getElementById('memBtnN').textContent === '★ 0'; }), 'old save not migrated cleanly');
  await p.screenshot({ path: `${out}/22-tray-oldsave.png` });
  await clickSel('#memBtn'); cc(await p.evaluate(() => document.getElementById('memAvail').textContent === '0 / 5'), 'memory bank shows a negative or wrong balance');
  await p.screenshot({ path: `${out}/23-memory-oldsave.png` });
  // a returning player (save from before the guide): no field notes on specimen 01, specialists already catalogued
  await clickSel('#memBack'); await toPage(0); await clickSel('.slide[data-i="0"]'); await p.waitForTimeout(2500);
  ob(await p.evaluate(() => IC.S.lvl === 0 && IC.S.screen === 'play' && document.getElementById('hint').hidden && IC.save.hints.length === IC.HINTS.length), 'a returning player saw field notes');
  gg(await p.evaluate(() => Object.keys(IC.SPECS).every(k => IC.save.seen.includes(k))), 'an old save with stars should have its specialists catalogued');
  // audio: no context before a gesture (autoplay rules); the score follows the specimen and its waves; the speaker opens a popover
  // whose two switches work with real clicks and persist; an old single mute migrates; an offline render ends with no live sources
  const au = (ok, msg) => { if (!ok) errs.push('audio: ' + msg); };
  await p.reload(); await p.waitForTimeout(500);
  au(await p.evaluate(() => !IC.AU.ctx), 'an AudioContext was made before any user gesture');
  await toPage(lmark[2]); await clickSel(`.slide[data-i="${lmark[2]}"]`); await p.evaluate(() => { const go = () => { while (IC.S.screen === 'card') IC.cardNext(); }; go(); IC.S.gold = 2000; [0, 1, 3, 4, 6].forEach((s, i) => IC.build(s, IC.TORDER[i % 4])); IC.sendWave(); go(); IC.S.speed = 2; }); // intro cards (new pathogens) closed
  await p.waitForTimeout(6000);
  au(await p.evaluate(() => IC.AU.ctx.state === 'running' && IC.M.th === 2 && IC.M.bus.L.perc._v === 1 && IC.AU.live.music < 120 && IC.AU.live.sfx <= 61), 'score not on specimen 09 (the Aorta theme) with its wave layer, or too many live sources ' + await p.evaluate(() => JSON.stringify([IC.AU.ctx.state, IC.M.th, IC.AU.live])));
  await clickSel('#muteBtn'); au(await p.evaluate(() => !document.getElementById('sndPop').hidden), 'speaker did not open the sound popover');
  await clickSel('.tg[data-k="music"]'); await p.waitForTimeout(300);
  au(await p.evaluate(() => !IC.AU.on.music && IC.AU.on.sfx && JSON.parse(localStorage.getItem('immune-citadel-v4')).music === false), 'music switch did not turn music off and save it');
  await p.screenshot({ path: `${out}/24-sound-popover.png` });
  await clickSel('.tg[data-k="music"]'); await clickSel('#hudTL');
  au(await p.evaluate(() => IC.AU.on.music && document.getElementById('sndPop').hidden), 'music back on, and a click elsewhere closes the popover');
  await p.evaluate(() => localStorage.setItem('immune-citadel-v4', JSON.stringify({ ...JSON.parse(localStorage.getItem('immune-citadel-v4')), music: undefined, sfx: undefined, muted: true })));
  await p.reload(); await p.waitForTimeout(400);
  au(await p.evaluate(() => !IC.AU.on.music && !IC.AU.on.sfx && document.getElementById('sndBtn').classList.contains('mute')), 'an old muted save must start with both switches off');
  await p.evaluate(() => { IC.AU.on.music = IC.AU.on.sfx = true; IC.persist(); });
  const off = await p.evaluate(async () => { // 40 s offline: specimen 03, wave + boss, a win, then music off; sources must all end
    const sr = 22050, o = new OfflineAudioContext(2, sr * 40, sr), tick = IC.musicTick; window.musicTick = () => {}; IC.auInit(o); let max = 0;
    for (let t = .1; t < 39.9; t += .1) o.suspend(Math.round(t * sr / 128) * 128 / sr).then(() => { const c = o.currentTime;
      if (c > 30 && IC.AU.on.music) { IC.AU.on.music = false; IC.auApply(); }
      tick({ theme: 2, wave: c > 5 && c < 20, boss: c > 10 && c < 20, duck: false, over: c > 20 ? 'win' : null }); if (c < 20 && Math.round(c * 10) % 3 === 0) IC.sfx('pop', 500, 9);
      max = Math.max(max, IC.AU.live.music + IC.AU.live.sfx); o.resume(); });
    const d = (await o.startRendering()).getChannelData(0); await new Promise(r => setTimeout(r, 200)); let pk = 0; for (const v of d) pk = Math.max(pk, Math.abs(v));
    return { max, live: IC.AU.live.music + IC.AU.live.sfx, pk };
  });
  au(off.live === 0 && off.max < 150 && off.pk < .9, 'offline render: ' + JSON.stringify(off));
  console.log('audio offline 40 s:', JSON.stringify(off));
  await require('./touch.js')(b, out, errs); // phones, tablet and both mouse sizes: taps, two-tap buy, target sizes, layout, rotate card
  console.log('errors:', errs.length ? errs : 'none'); await b.close();
})();
