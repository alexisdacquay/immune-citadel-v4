// node tools/balance.js RUNS [levels comma] [mem none|all|both] — bot only, prints per-level lives across runs; env MODE=heroic|iron plays challenges, H='{"hp":1.1}' overrides MODES[MODE],
// INF=1 starts with 999 vitality so a challenge never ends early: W999-n = n vitality leaked (the margin measure)
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const runs = +(process.argv[2] || 3), lvls = process.argv[3] ? process.argv[3].split(',').map(Number) : null, mems = process.argv[4] && process.argv[4] !== 'both' ? [process.argv[4]] : ['none', 'all'];
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + path.resolve(process.env.FILE || path.resolve(__dirname, '../index.html'))); // FILE = another build to compare await p.waitForTimeout(500);
  const nLv = await p.evaluate(() => IC.LEVELS.length);
  if (process.env.C) await p.evaluate(c => c.split(',').forEach(kv => { const [l, v] = kv.split(':'); IC.CAMPHP[l - 1] = +v; }), process.env.C); // C='9:.85' = campaign pathogen health per specimen
  if (process.env.M) await p.evaluate(m => m.split(',').forEach(kv => { const [l, v] = kv.split(':'); IC.LVLMULT[l - 1] = +v; }), process.env.M);
  let used = {}; // specialists bought so far: the bot rotates through all 8
  for (const mem of mems) for (let li = 0; li < nLv; li++) { if (lvls && !lvls.includes(li + 1)) continue; const res = [];
    for (let k = 0; k < runs; k++) {
    const r = await p.evaluate(([li, mem, used, mode, H, INF, POL, PAT]) => {
      IC.save.mem = mem === 'all' ? Object.fromEntries(IC.MEMORY.map(M => [M.id, 3])) : mem === 'none' ? {} : JSON.parse(mem); // or a JSON memory, e.g. '{"hero":3}'
      if (H) Object.assign(IC.MODES[mode], JSON.parse(H));
      IC.save.rch = mem === 'none' ? li : IC.LEVELS.length - 1; IC.startLevel(li, mode); const S = IC.S; S.screen = 'play'; // a first-time player has only that specimen's kit if (INF) S.lives = 999;
      const memOk = mem[0] === '{' ? true : mem === 'none' ? (!S.hero || S.hero.lvl === 1) && IC.AB.fever.cd === 32 : S.hero.lvl === 2 && IC.AB.fever.cd === 26 && IC.AB.swarm.n === 4 && IC.TOWERS.neutro.lv[0].range === 154;
      const order = ['neutro', 'macro', 'killer', 'bcell', 'neutro', 'killer', 'bcell', 'macro'].filter(k => S.lines.includes(k));
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
      let bi = 0, t = 0, lowest = 20, leakP = null; const leaks = {}, lw = {}, lt = []; const ol = S.lives; const origStep = IC.step; let prev = new Set();
      while (!S.over && t < 1500) {
        for (let k = 0; k < 60; k++) { const before = S.lives, alive = S.enemies.slice(); IC.step(1 / 60); while (S.screen === 'card') IC.cardNext(); if (S.lives < before) { lw[S.wave] = (lw[S.wave] || 0) + before - S.lives; for (const e of alive) if (e.dead && e.d >= e.path.len) { leakP = e.p; leaks[e.type] = (leaks[e.type] || 0) + 1; if (lt.length < 12) lt.push(e.type + '@' + (S.time | 0)); } } } t++;
        // spend
        if (POL === 'focus') { // playtest/fun/human.js decision block: 3 cells, then the top damage dealers go deep, then widen; one purchase per s
          const T = IC.TOWERS, P = IC.SPECS, free = S.slots.map((sl, i) => sl.tower ? null : i).filter(i => i != null);
          const target = Math.min(free.length + S.towers.length, 4 + li), has = k => S.towers.filter(x => x.type === k).length;
          const upcoming = [...(S.wave < S.waves.length ? S.waves[S.wave].map(g => g.t) : []), ...(S.wave > 0 ? S.waves[S.wave - 1].map(g => g.t) : [])];
          const armored = upcoming.some(k => ['staph', 'worm', 'boss', 'rabies'].includes(k)), flyers = upcoming.includes('flu');
          let want;
          if (!has('neutro')) want = 'neutro'; else if (armored && has('killer') < 1 + (li > 2)) want = 'killer';
          else if (flyers && has('neutro') + has('killer') < 3) want = has('killer') <= has('neutro') ? 'killer' : 'neutro';
          else if (!has('macro') && S.towers.length >= 2) want = 'macro'; else if (!has('bcell') && S.towers.length >= 3) want = 'bcell';
          else want = ['neutro', 'killer', 'bcell', 'macro'][S.towers.length % 4];
          if (!S.lines.includes(want)) want = S.lines[S.towers.length % S.lines.length];
          const site = () => { const c = free.map(i => { const sl = S.slots[i]; let n = 0; for (const q of S.paths) for (let d = 0; d < q.len; d += 20) { const r = IC.posAt(q, d); if (Math.hypot(r.x - sl.x, r.y - sl.y) < 140) n++; } return [n, i]; }).sort((a, b) => b[0] - a[0]).slice(0, 2); return c[Math.random() * c.length | 0][1]; };
          const ups = S.towers.filter(x => x.lvl < 2 || S.kit.spec.includes(x.type) && (!x.spec || x.rank < 2)).sort((a, b) => (b.dealt || 0) - (a.dealt || 0));
          const opts = b => Object.keys(P).filter(k => P[k].base === b), specOf = u => opts(u.type).sort((a, c) => (used[a] || 0) - (used[c] || 0))[0];
          const costOf = x => x.lvl < 2 ? T[x.type].lv[x.lvl + 1].cost : !x.spec ? P[specOf(x)].cost : P[x.spec].sk[x.rank].cost;
          let act = null;
          if ((S.towers.length < 3 || (S.towers.length < target && (S.towers.length % 2 === 0 || !ups.length || S.gold > 260))) && free.length && S.gold >= T[want].lv[0].cost) act = 'build';
          else if (ups.length && S.gold >= costOf(ups[0])) act = 'up';
          else if (S.towers.length < target && free.length && S.gold >= T[want].lv[0].cost && S.wave > 0) act = 'build';
          if (act === 'build') IC.build(site(), want);
          else if (act === 'up') { const u = ups[0], i = S.slots.indexOf(u.slot); if (u.lvl < 2) IC.upgrade(i); else if (!u.spec) { const id = specOf(u); if (IC.specialize(i, id)) used[id] = (used[id] || 0) + 1; } else IC.skillUp(i); }
          if (S.wave === 0 && S.towers.length >= 3) IC.sendWave();
          if (S.wave > 0 && !S.enemies.length && !S.spawnQ.length && !PAT) IC.sendWave();
        }
        for (let guard = 0; guard < 5 && POL !== 'focus'; guard++) {
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
        if (S.wave === 0 && POL !== 'focus' || S.L.hold && S.mode === 'campaign' && S.wave > 0 && !S.enemies.length && !S.spawnQ.length) IC.sendWave(); // hold: the player calls each wave once the field is clear
        if (S.cds.fever <= 0) { let best = null, bn = 3; for (const e of S.enemies) { if (POL === 'focus' && !e.seen) continue; const n = S.enemies.filter(o => Math.hypot(o.x - e.x, o.y - e.y) < 80 && (POL !== 'focus' || o.seen)).reduce((s, o) => s + (o.D.stealth && !o.seen ? 3 : 1), 0); /* hidden stealth counts triple: fever reveals it */ if (n > bn) { bn = n; best = e; } } if (best) { S.ability = 'fever'; IC.castAbility(best.x, best.y); } }
        if (S.cds.swarm <= 0 && S.enemies.length) { const e = S.enemies.filter(e => !e.D.flying && (POL !== 'focus' || e.seen && e.d / e.path.len > .7)).sort((a, b) => (a.path.len - a.d) - (b.path.len - b.d))[0]; if (e) { const q = e.path; S.ability = 'swarm'; IC.castAbility(e.x, e.y); } }
        const H = S.hero || { dead: true }; // no hero before specimen 04
        if (POL === 'focus') { if (leakP != null && !H.dead) { const q = IC.posAt(S.paths[leakP], S.paths[leakP].len * .75); if (Math.hypot(H.hx - q.x, H.hy - q.y) > 30) IC.heroMove(q.x, q.y); leakP = null; } }
        else if (!H.dead && !H.mv && Math.hypot(H.hx - park.x, H.hy - park.y) > 5) IC.heroMove(park.x, park.y);
        if (!H.dead && S.cds.granzyme <= 0) { const n = S.enemies.filter(e => Math.hypot(e.x - H.x, e.y - H.y) < IC.HERO.gz.r).length; if (n >= 3 || (n && H.hp < H.max * .35)) IC.granzyme(); }
        lowest = Math.min(lowest, S.lives);
      }
      return { mem, memOk, level: li, won: S.over && S.lives > 0, lives: S.lives, wave: S.wave, secs: t, towers: S.towers.map(x => x.spec ? x.spec + x.rank : x.type[0] + x.lvl).join(' '), gold: S.gold, leaks: JSON.stringify(leaks), lw: JSON.stringify(lw), lt: lt.join(' '), hero: S.hero && `L${S.hero.lvl} kills ${S.hero.kills} park ${park.x | 0},${park.y | 0}`, used, t: S.time | 0, leftQ: S.spawnQ.length };
    }, [li, mem, used, process.env.MODE || 'campaign', process.env.H || '', !!process.env.INF, process.env.POL || 'wide', process.env.CALL === 'patient']);
    used = r.used;
      res.push(r.won ? 'W' + r.lives : `L${r.wave}@${r.t}s:${r.leftQ}q:${r.leaks}`); if (process.env.V) console.log(JSON.stringify(r));
    }
    const ws = res.filter(x => x[0] === 'W').map(x => +x.slice(1)).sort((a, b) => a - b);
    console.log(`mem ${mem} L${li + 1}: ${res.join(' ')}  | won ${ws.length}/${res.length} median ${ws.length ? ws[ws.length >> 1] : '-'} min ${ws.length ? ws[0] : '-'}`);
  }
  console.log('specialists used:', JSON.stringify(used));
  await b.close();
})();
