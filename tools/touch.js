// touch & viewport checks, run by tools/test.js (or alone: node tools/touch.js [shotsDir]).
// Phones in landscape (844x390 with a simulated notch, 932x430), a touch tablet (1024x768), and mouse at 1440x900 / 800x540:
// real taps or clicks on every control, two-tap buy on touch vs one-click buy with the mouse, >= 40 px touch targets,
// HUD panels apart from each other and covering no more of the map than the 800x540 layout (the HUD's relative size on phones before),
// safe-area insets respected, no page scroll or zoom, and the rotate card in portrait.
// On every view, and on extra title-only views (laptop windows that letterbox the stage, a 667x375 phone): the title bar fits with nothing
// drawn over anything else, the cloud button takes a real tap, the Field Guide's Back shows without scrolling, and "Your data" fits.
const path = require('path'), fs = require('fs');
const VIEWS = [
  { n: 'desk-s', w: 800, h: 540 }, // first: its map coverage is the baseline
  { n: 'desk', w: 1440, h: 900 },
  { n: 'phone', w: 844, h: 390, touch: true, notch: true },
  { n: 'phone-xl', w: 932, h: 430, touch: true },
  { n: 'tablet', w: 1024, h: 768, touch: true },
  // title only (launch audit, 2026-11-08): the name ran over the counters at these laptop sizes, and at 667x375 the cloud button ran off the screen
  { n: 'laptop', w: 1280, h: 720, title: true }, { n: 'laptop-s', w: 1366, h: 657, title: true }, { n: 'laptop-l', w: 1536, h: 730, title: true },
  { n: 'phone-se', w: 667, h: 375, touch: true, title: true },
];
const z18 = () => Array(18).fill(0), ST = z18(); ST[0] = 3; ST[1] = 2;
const SAVE = JSON.stringify({ st: ST, hc: z18(), ic: z18(), rch: 17, hints: ['build', 'wave', 'upgrade', 'hero'], seen: ['bact', 'virus', 'staph', 'candida', 'spore', 'flu', 'worm', 'boss', 'salmon', 'toxo', 'rabies', 'virion'], viewed: [] }); // full kit (rch 17), every pathogen met: no intro or unlock card covers the layout checks

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
    // after any input, wait for the short fades and pop-ins it started (under 1 s; not endless pulses, not the 2.6 s description flash),
    // so checks see the settled screen on a slow CI runner too
    const settle = () => p.evaluate(() => Promise.all(document.getAnimations().filter(a => { const t = a.effect.getTiming(); return t.iterations !== Infinity && (+t.duration || 0) + (+t.delay || 0) <= 1000; }).map(a => a.finished.catch(() => {}))));
    const tap = async (x, y) => { if (V.touch) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); await p.waitForTimeout(120); await settle(); };
    const mid = s => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, s);
    const tapSel = async s => { await p.evaluate(s => { const e = document.querySelector(s); if (e && e.closest('.ov')) e.scrollIntoView({ block: 'nearest' }); }, s); const m = await mid(s); fail(m, `missing ${s}`); if (m) await tap(...m); }; // overlays scroll on a phone
    const onMap = (x, y) => p.evaluate(([x, y]) => { const r = document.getElementById('cv').getBoundingClientRect(); return [r.left + x / 1000 * r.width, r.top + y / 620 * r.height]; }, [x, y]);
    const ev = f => p.evaluate(f);
    // every visible target of these selectors at least 40 px both ways (touch only; the mouse layout is unchanged)
    // the body map shows one level's card: select level i on the map (unless it already is), then tap its card
    const openLevel = async i => { if (!(await ev(`document.querySelector('.lnode[data-i="${i}"]').classList.contains('sel')`))) await tapSel(`.lnode[data-i="${i}"]`); await tapSel(`.slide[data-i="${i}"]`); };
    const sizes = async (sel, what) => {
      if (!V.touch) return;
      await settle(); // measure the settled size, not a pop-in frame (slow CI caught 38 of 44 px)
      const small = await p.evaluate(sel => [...document.querySelectorAll(sel)].map(e => [e, e.getBoundingClientRect()]).filter(([e, r]) => r.width && getComputedStyle(e).visibility !== 'hidden')
        .filter(([, r]) => r.width < 40 || r.height < 40).map(([e, r]) => `${e.id || e.className.baseVal || e.className}:${r.width | 0}x${r.height | 0}`), sel);
      fail(!small.length, `${what} targets under 40 px: ${small.slice(0, 6).join(', ')}`);
    };
    const shot = n => p.screenshot({ path: `${out}/touch-${V.n}-${n}.png` });

    // title bar: every control on screen, none drawn over the next (the name over the counters at 1280x720, the cloud button cut at 667x375)
    const bar = await ev(() => {
      document.getElementById('cloudBtn').hidden = false; // shown only where a cloud API answers (not on file://); laid out the same
      const B = document.querySelector('#titleOv .mbar'), b = B.getBoundingClientRect(), out = [];
      const kids = [...B.children].filter(e => e.getBoundingClientRect().width);
      if (B.scrollWidth > B.clientWidth + .5) out.push(`bar content ${B.scrollWidth} px wide in ${B.clientWidth} px`);
      kids.forEach((e, i) => { const r = e.getBoundingClientRect(), g = document.createRange(); g.selectNodeContents(e);
        const right = getComputedStyle(e).overflowX === 'visible' ? Math.max(r.right, g.getBoundingClientRect().right) : r.right; // what is painted, not just the box
        if (r.left < Math.max(0, b.left) - .5 || right > Math.min(innerWidth, b.right) + .5) out.push(`${e.id || e.className} off the bar (${r.left | 0} to ${right | 0})`);
        const n = kids[i + 1]; if (n && right > n.getBoundingClientRect().left + .5) out.push(`${e.id || e.className} drawn over ${n.id || n.className} (to ${right | 0}, next at ${n.getBoundingClientRect().left | 0})`); });
      const c = document.getElementById('cloudBtn').getBoundingClientRect(), hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
      if (!hit || !hit.closest('#cloudBtn')) out.push('the cloud button is covered or clipped');
      return out;
    });
    fail(!bar.length, `title bar: ${bar.join('; ')}`);
    await tap(...await mid('#cloudBtn'));
    fail(await ev(() => !document.getElementById('cloudPop').hidden), 'a tap on the cloud button did not open the cloud panel');
    await ev(() => { document.getElementById('cloudPop').hidden = true; });
    // Field Guide from the title: Back on screen and uncovered as it opens, before any scroll (on landscape phones it was below the fold)
    await tapSel('#guideBtn'); fail(await ev(() => IC.S.screen === 'guide'), 'guide button on the title');
    const gb = await ev(() => { const r = document.getElementById('gBack').getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { t: r.top, b: r.bottom, l: r.left, r: r.right, hit: !!(h && h.closest('#gBack')) }; });
    const gok = gb.t >= safe.t && gb.b <= safe.b && gb.l >= safe.l && gb.r <= safe.r && gb.hit;
    fail(gok, `Field Guide Back not on screen when it opens: ${gb.t | 0} to ${gb.b | 0} of ${V.h}${gb.hit ? '' : ', covered'}`);
    if (gok) await tap(...await mid('#gBack')); else await tapSel('#gBack'); // scroll to it, so one failure does not cascade
    fail(await ev(() => IC.S.screen === 'title'), 'guide back to the title');

    // "Your data" fits the screen and its Play stats switch (the opt-out the DPIA relies on) takes a real tap: on a landscape
    // phone it used to run off the bottom, out of reach. The popover scrolls inside itself; a swipe there sets its scrollTop.
    await tapSel('#dataBtn');
    const dp = await ev(() => { const P = document.querySelector('#dataPop'), r = P.getBoundingClientRect(); document.querySelector('#statsTg').scrollIntoView({ block: 'nearest' }); return { top: r.top, bottom: r.bottom, on: document.querySelector('#statsTg').getAttribute('aria-checked') }; });
    fail(dp.top >= 0 && dp.bottom <= V.h, `"Your data" runs off the screen: ${dp.top | 0} to ${dp.bottom | 0}`);
    await tapSel('#statsTg');
    fail(await ev(() => document.querySelector('#statsTg').getAttribute('aria-checked')) !== dp.on, 'a tap on the Play stats switch did not turn it');
    await tapSel('#statsTg'); await tapSel('#dataBtn'); // back as it was, popover closed
    fail(await ev(() => document.querySelector('#dataPop').hidden), '"Your data" did not close');
    if (V.title) { await ctx.close(); continue; }

    // tray
    await shot('tray');
    await sizes('.slide:not(.locked),.chb,.mbtn,.seg button,.lnode:not(.locked) .hit,.lch:not(.locked) .hit', 'tray');
    await openLevel(0); await p.waitForTimeout(300);
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
    // wave marker tips (#23): every marker of every specimen, first wave and a later early-call tip, stays on screen and off the ability buttons
    const tipBad = await p.evaluate(async () => {
      const out = [], frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const check = (li, tag) => { const st = document.getElementById('stage').getBoundingClientRect();
        const abs = [...document.querySelectorAll('.ab')].filter(e => !e.hidden && e.getBoundingClientRect().width).map(e => e.getBoundingClientRect());
        document.querySelectorAll('.wcall').forEach((b, bi) => { if (b.hidden) return; const r = b.querySelector('.tip').getBoundingClientRect();
          const on = r.left >= st.left - .5 && r.right <= st.right + .5 && r.top >= st.top - .5 && r.bottom <= st.bottom + .5, hit = abs.some(a => r.left < a.right && a.left < r.right && r.top < a.bottom && a.top < r.bottom);
          if (!on || hit) out.push(`specimen ${li + 1} ${tag} marker ${bi + 1}:${on ? '' : ' off-screen'}${hit ? ' over an ability button' : ''}`); }); };
      for (let li = 0; li < IC.LEVELS.length; li++) {
        IC.startLevel(li); await frame(); check(li, 'first wave');
        IC.sendWave(); IC.S.spawnQ.length = 0; await frame(); check(li, 'early call');
      }
      IC.startLevel(0); await frame(); return out;
    });
    fail(!tipBad.length, `wave marker tips: ${tipBad.join('; ')}`);
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
    await openLevel(1); await ev(() => IC.endLevel(true)); await p.waitForTimeout(1300);
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
  process.exitCode = errs.length ? 1 : 0;
})();
