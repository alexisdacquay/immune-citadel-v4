// touch & viewport checks, run by tools/test.js (or alone: node tools/touch.js [shotsDir]).
// Phones in landscape (844x390 with a simulated notch, 932x430), a touch tablet (1024x768), and mouse at 1440x900 / 800x540:
// real taps or clicks on every control, two-tap buy on touch vs one-click buy with the mouse, >= 40 px touch targets,
// HUD panels apart from each other and covering no more of the map than the 800x540 layout (the HUD's relative size on phones before),
// safe-area insets respected, no page scroll or zoom, and the rotate card in portrait.
const path = require('path'), fs = require('fs');
const VIEWS = [
  { n: 'desk-s', w: 800, h: 540 }, // first: its map coverage is the baseline
  { n: 'desk', w: 1440, h: 900 },
  { n: 'phone', w: 844, h: 390, touch: true, notch: true },
  { n: 'phone-xl', w: 932, h: 430, touch: true },
  { n: 'tablet', w: 1024, h: 768, touch: true },
];
const SAVE = JSON.stringify({ stars: [3, 2, 0, 0, 0, 0], hints: ['build', 'wave', 'upgrade', 'fever', 'hero'], seen: [], viewed: [] });

module.exports = async function touch(browser, out, errs) {
  fs.mkdirSync(out, { recursive: true });
  let base = null; const report = [];
  for (const V of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: V.w, height: V.h }, hasTouch: !!V.touch, isMobile: !!V.touch && V.w < 1000, deviceScaleFactor: V.touch ? 2 : 1 });
    const p = await ctx.newPage(), tag = `${V.n} ${V.w}x${V.h}`;
    const fail = (ok, msg) => { if (!ok) errs.push(`touch ${tag}: ${msg}`); };
    p.on('pageerror', e => errs.push(`touch ${tag}: page error ${e.message}`));
    await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.evaluate(s => localStorage.setItem('immune-citadel-v4', s), SAVE);
    await p.reload(); await p.waitForTimeout(500);
    if (V.notch) { // stand in for an iPhone in landscape: 47 px insets left and right, 21 px home indicator
      await p.evaluate(() => { const d = document.documentElement.style; d.setProperty('--sl', '47px'); d.setProperty('--sr', '47px'); d.setProperty('--sb', '21px'); dispatchEvent(new Event('resize')); });
      await p.waitForTimeout(100);
    }
    const safe = V.notch ? { l: 47, r: V.w - 47, t: 0, b: V.h - 21 } : { l: 0, r: V.w, t: 0, b: V.h };
    const tap = async (x, y) => { if (V.touch) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); await p.waitForTimeout(120); };
    const mid = s => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, s);
    const tapSel = async s => { await p.evaluate(s => { const e = document.querySelector(s); if (e && e.closest('.ov')) e.scrollIntoView({ block: 'nearest' }); }, s); const m = await mid(s); fail(m, `missing ${s}`); if (m) await tap(...m); }; // overlays scroll on a phone
    const onMap = (x, y) => p.evaluate(([x, y]) => { const r = document.getElementById('cv').getBoundingClientRect(); return [r.left + x / 1000 * r.width, r.top + y / 620 * r.height]; }, [x, y]);
    const ev = f => p.evaluate(f);
    // every visible target of these selectors at least 40 px both ways (touch only; the mouse layout is unchanged)
    const sizes = async (sel, what) => {
      if (!V.touch) return;
      const small = await p.evaluate(sel => [...document.querySelectorAll(sel)].map(e => [e, e.getBoundingClientRect()]).filter(([e, r]) => r.width && getComputedStyle(e).visibility !== 'hidden')
        .filter(([, r]) => r.width < 40 || r.height < 40).map(([e, r]) => `${e.id || e.className.baseVal || e.className}:${r.width | 0}x${r.height | 0}`), sel);
      fail(!small.length, `${what} targets under 40 px: ${small.slice(0, 6).join(', ')}`);
    };
    const shot = n => p.screenshot({ path: `${out}/touch-${V.n}-${n}.png` });

    // tray
    await shot('tray');
    await sizes('.slide:not(.locked),.chb,.mbtn', 'tray');
    await tapSel('.slide[data-i="0"]'); await p.waitForTimeout(300);
    fail(await ev(() => IC.S.screen === 'play' && IC.S.lvl === 0), 'tap on the first slide did not start it');

    // layout: inside the safe area, HUD panels apart, map coverage no worse than the baseline
    const lay = await ev(() => {
      const R = e => { const r = e.getBoundingClientRect(); return { id: e.id || e.className, l: r.left, t: r.top, r: r.right, b: r.bottom }; };
      const vis = e => !e.hidden && e.getBoundingClientRect().width && getComputedStyle(e).opacity !== '0';
      const hud = ['#hudTL', '#hudTR', '#ab-hero', '#ab-fever', '#ab-swarm', '#ab-gz', '#spec'].map(s => document.querySelector(s)).filter(vis).map(R);
      const cv = document.getElementById('cv').getBoundingClientRect();
      const cover = [], st = document.getElementById('stage');
      for (let li = 0; li < IC.LEVELS.length; li++) {
        const k = cv.width / 1000, L = IC.LEVELS[li], inHud = (x, y, r) => { const X = cv.left + x * k, Y = cv.top + y * k; return hud.filter(h => h.id !== 'spec').some(h => X > h.l - r * k && X < h.r + r * k && Y > h.t - r * k && Y < h.b + r * k); }; // r: site ring / route half-width, map units
        let ps = 0, pn = 0; for (const raw of L.paths) { const q = IC.makePath(raw); for (let d = 0; d < q.len; d += 6) { const r = IC.posAt(q, d); if (r.x < 0 || r.x > 1000 || r.y < 0 || r.y > 620) continue; pn++; if (inHud(r.x, r.y, 20)) ps++; } }
        cover.push({ slots: L.slots.filter(([x, y]) => inHud(x, y, 26)).length, path: ps / pn });
      }
      return { hud, cover, stage: R(st), gut: st.classList.contains('gut'), cv: R(document.getElementById('cv')) };
    });
    const inside = r => r.l >= safe.l - .5 && r.r <= safe.r + .5 && r.t >= safe.t - .5 && r.b <= safe.b + .5;
    fail(inside(lay.cv), `map outside the safe area ${JSON.stringify(lay.cv)}`);
    for (const h of lay.hud) fail(inside(h), `${h.id} outside the safe area`);
    const ov = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    const pairs = []; lay.hud.forEach((a, i) => lay.hud.slice(i + 1).forEach(b => ov(a, b) && pairs.push(`${a.id}/${b.id}`))); fail(!pairs.length, `HUD panels overlap: ${pairs}`);
    if (!base) base = lay.cover;
    else lay.cover.forEach((c, li) => { fail(c.slots <= base[li].slots, `level ${li + 1}: HUD covers ${c.slots} build sites (baseline ${base[li].slots})`); fail(c.path <= base[li].path + .01, /* 1 point: route samples grazing a panel edge */ `level ${li + 1}: HUD covers ${(c.path * 100).toFixed(1)}% of the routes (baseline ${(base[li].path * 100).toFixed(1)}%)`); });
    if (V.w < 1000 && V.touch) fail(lay.gut, 'phone landscape should move controls and abilities into the side gutters');
    report.push(`${tag}: gutters ${lay.gut ? 'on' : 'off'} · build sites under HUD ${lay.cover.map(c => c.slots).join('/')} · route under HUD ${lay.cover.map(c => (c.path * 100).toFixed(1) + '%').join('/')}`);

    // build: touch = preview + confirm on the first tap, buy on the second; mouse = buy on the click
    await ev(() => { IC.S.gold = 2000; });
    const si = await ev(() => { const S = IC.S, q = IC.posAt(S.paths[0], S.paths[0].len * .45); return S.slots.map((s, i) => [Math.hypot(s.x - q.x, s.y - q.y), i]).sort((a, b) => a[0] - b[0])[0][1]; });
    const slot = await onMap(...await ev(`[IC.S.slots[${si}].x, IC.S.slots[${si}].y]`));
    await tap(...slot); await p.waitForTimeout(250);
    fail(await ev(() => document.querySelectorAll('#radial .rb').length === 4), 'tap on a build site did not open the radial');
    await sizes('#radial .rb', 'radial');
    await tapSel('#radial .rb img[alt="Neutrophil"]');
    if (V.touch) {
      fail(await ev(`!IC.S.slots[${si}].tower && !!document.querySelector('#radial .rb.confirm img[alt="Neutrophil"]') && /Neutrophil/.test(document.getElementById('info').textContent) && !!IC.S.preview`), 'first tap should preview (info + range) and arm the button, not build');
      const io = await ev(() => { const a = document.getElementById('info').getBoundingClientRect(); return ['#hudTL', '#hudTR', '.ab'].flatMap(s => [...document.querySelectorAll(s)]).filter(e => { const b = e.getBoundingClientRect(); return b.width && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; }).map(e => e.id); });
      fail(!io.length, `info bar overlaps ${io}`);
      await shot('confirm');
      await tapSel('#radial .rb img[alt="Neutrophil"]');
    }
    fail(await ev(`IC.S.slots[${si}].tower && IC.S.slots[${si}].tower.type === 'neutro' && !document.querySelector('#radial .rb')`), V.touch ? 'second tap did not build' : 'one click did not build');
    await tap(...slot); await p.waitForTimeout(200); await tapSel('#radial .rb img[alt="Upgrade"]');
    if (V.touch) { fail(await ev(`IC.S.slots[${si}].tower.lvl === 0 && /→/.test(document.getElementById('info').textContent)`), 'first tap on upgrade should preview the next level'); await tapSel('#radial .rb img[alt="Upgrade"]'); }
    fail(await ev(`IC.S.slots[${si}].tower.lvl === 1`), 'upgrade by tap/click failed');
    // wave marker: touch = first tap shows the coming wave, second calls it
    await sizes('.wcall:not([hidden])', 'wave marker');
    await tapSel('.wcall:not([hidden])');
    if (V.touch) {
      await p.waitForTimeout(200);
      fail(await ev(() => IC.S.wave === 0 && !!document.querySelector('.wcall.show') && getComputedStyle(document.querySelector('.wcall.show .tip')).opacity === '1'), 'first tap on the wave marker should show its preview only'); await shot('wave-tip'); await tapSel('.wcall.show');
    }
    fail(await ev(() => IC.S.wave === 1), 'wave marker did not call the wave');
    await p.waitForFunction(() => IC.S.enemies.some(e => e.seen && e.x > 30), null, { timeout: 15000 });
    // fever by tap on the button, then on the map
    await tapSel('#ab-fever'); fail(await ev(() => IC.S.ability === 'fever'), 'ability button did not arm fever');
    if (V.touch) fail(await ev(() => getComputedStyle(document.querySelector('#ab-fever .tip')).opacity !== '0'), 'armed ability should show its description on touch');
    await tap(...await onMap(...await ev(() => { const e = IC.S.enemies.find(e => e.seen); return [e.x, e.y]; })));
    fail(await ev(() => IC.S.cds.fever > 0 && !IC.S.ability), 'tap on the map did not cast fever');
    // enemy info by tap
    await p.waitForTimeout(400);
    // hero: portrait selects, a tap near the path sends it, a tap on the hero itself selects it
    await tapSel('#ab-hero'); fail(await ev(() => !!(IC.S.sel && IC.S.sel.hero)), 'hero button did not select');
    const dest = await ev(() => { const q = IC.posAt(IC.S.paths[0], 300); return [q.x, q.y + 10]; });
    await tap(...await onMap(...dest));
    fail(await p.evaluate(([x, y]) => IC.S.hero.mv && Math.hypot(IC.S.hero.hx - x, IC.S.hero.hy - y) < 3, dest), 'tap near the path did not move the hero');
    await p.waitForFunction(() => !IC.S.hero.mv, null, { timeout: 8000 }).catch(() => {});
    const hs = await onMap(...await ev(() => [IC.S.hero.x, IC.S.hero.y]));
    await tap(hs[0] + (V.touch ? 10 : 0), hs[1] + (V.touch ? 8 : 0)); // a fingertip lands off-centre
    fail(await ev(() => !!(IC.S.sel && IC.S.sel.hero)), 'tap on the hero did not select it');
    await shot('hero');
    await tap(...await onMap(...await ev(() => [IC.S.hero.x, IC.S.hero.y]))); fail(await ev(() => !IC.S.sel), 'second tap on the hero should deselect');
    // pause: button, then (touch) the card itself resumes
    await sizes('#hudTR .ib,.ab', 'HUD');
    await tapSel('#pauseBtn'); fail(await ev(() => IC.S.paused), 'pause button');
    await sizes('#pausePill .btn', 'pause card');
    if (V.touch) { await shot('paused'); await tap(...await mid('#pausePill small')); fail(await ev(() => !IC.S.paused), 'tap on the pause card should resume'); }
    else { await p.keyboard.press('Space'); fail(await ev(() => !IC.S.paused), 'space should resume'); }
    // no page scroll, zoom or text selection after all that tapping (and a quick double tap on the map)
    await tap(...await onMap(600, 300)); await tap(...await onMap(600, 300));
    fail(await ev(() => scrollX === 0 && scrollY === 0 && (!visualViewport || visualViewport.scale === 1) && !getSelection().toString()), 'page scrolled, zoomed or selected text');
    fail(await ev(() => /user-scalable=no/.test(document.querySelector('meta[name=viewport]').content) && getComputedStyle(document.body).touchAction === 'manipulation' && getComputedStyle(document.getElementById('cv')).touchAction === 'none'), 'zoom/delay guards missing');
    await shot('play');
    // Field Guide from play
    await tapSel('#hudGuide'); fail(await ev(() => IC.S.screen === 'guide'), 'guide button');
    await sizes('#guideOv .gt,#guideOv .gtab,#gBack', 'guide');
    await tapSel('.gtab[data-tab="path"]'); await tapSel('.gt[data-id="bact"]');
    fail(await ev(() => /E\. coli/.test(document.getElementById('gText').textContent)), 'guide tile tap');
    await shot('guide'); await tapSel('#gBack'); fail(await ev(() => IC.S.screen === 'play'), 'guide back');
    // tray, Immune Memory
    await tapSel('#mapBtn'); fail(await ev(() => IC.S.screen === 'title'), 'tray button');
    await tapSel('#memBtn'); fail(await ev(() => IC.S.screen === 'memory'), 'memory button');
    await sizes('#memOv .mnode,#memOv .btn', 'memory');
    await tapSel('.mnode[data-c="0"][data-t="0"]'); fail(await ev(() => IC.save.mem.neutro === 1), 'memory node tap did not train');
    await shot('memory'); await tapSel('#memBack'); fail(await ev(() => IC.S.screen === 'title'), 'memory back');
    // lab report
    await tapSel('.slide[data-i="1"]'); await ev(() => IC.endLevel(true)); await p.waitForTimeout(1300);
    await sizes('#endOv .btn,#endOv .mlink', 'lab report'); await shot('report');
    await tapSel('#eRetry'); fail(await ev(() => IC.S.screen === 'play' && IC.S.lvl === 1), 'report retry');
    if (V.touch) { // portrait: rotate card over the paused game; back to landscape keeps it paused until a tap
      await p.setViewportSize({ width: V.h, height: V.w }); await p.waitForTimeout(300);
      fail(await ev(() => !document.getElementById('rotate').hidden && IC.S.paused), 'portrait should show the rotate card and pause');
      await shot('portrait');
      await p.setViewportSize({ width: V.w, height: V.h }); await p.waitForTimeout(300);
      fail(await ev(() => document.getElementById('rotate').hidden && IC.S.paused), 'back in landscape: card gone, still paused');
      await tap(...await mid('#pausePill small')); fail(await ev(() => !IC.S.paused), 'resume after rotating back');
    } else fail(await ev(() => document.getElementById('rotate').hidden), 'no rotate card with a mouse');
    await ctx.close();
  }
  console.log('touch:\n  ' + report.join('\n  '));
};

if (require.main === module) (async () => {
  const { chromium } = require('playwright'); const b = await chromium.launch(), errs = [];
  await module.exports(b, process.argv[2] || 'shots', errs); await b.close();
  console.log('errors:', errs.length ? errs : 'none');
})();
