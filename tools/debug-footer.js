/* 定点排查：切到浅色主题，量底部三个按钮的真实可见性 */
'use strict';

const path = require('path');
const fs = require('fs');
const { _electron: electron } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shots');
const STORE = path.join(process.env.APPDATA || '', 'projectdesk-widget', 'store.json');
fs.mkdirSync(OUT, { recursive: true });
if (fs.existsSync(STORE)) fs.rmSync(STORE);

(async () => {
  const app = await electron.launch({ args: [ROOT], cwd: ROOT });
  const win = await app.firstWindow();
  await win.waitForLoadState('load');
  await win.waitForTimeout(1200);

  // 强制浅色主题
  await win.evaluate(() => {
    window.PMStore.state.settings.theme = 'daylight';
    window.PMStore.save();
  });
  await win.reload();
  await win.waitForTimeout(1400);
  await win.screenshot({ path: path.join(OUT, 'dbg-light-collapsed.png') });

  const info = await win.evaluate(() => {
    const app = document.getElementById('app');
    const rail = document.querySelector('.rail');
    const foot = document.querySelector('.rail-foot');
    const btns = [...document.querySelectorAll('.rail-foot .icon-btn')];
    const rb = rail.getBoundingClientRect();
    const fb = foot.getBoundingClientRect();
    const cs = (el, p) => getComputedStyle(el)[p];
    return {
      theme: app.dataset.theme,
      railBox: { y: rb.y, h: rb.height, bottom: rb.bottom },
      footBox: { y: fb.y, h: fb.height, bottom: fb.bottom },
      railBottomVsFoot: rb.bottom - fb.bottom,
      winH: window.innerHeight,
      navBox: (() => { const b = document.querySelector('.rail-nav').getBoundingClientRect(); return { y: b.y, h: b.height, bottom: b.bottom }; })(),
      buttons: btns.map((el) => {
        const b = el.getBoundingClientRect();
        const svg = el.querySelector('svg');
        const sb = svg ? svg.getBoundingClientRect() : null;
        return {
          action: el.dataset.action,
          box: { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) },
          visible: b.width > 0 && b.height > 0 && b.bottom <= window.innerHeight + 1 && b.top >= -1,
          color: cs(el, 'color'),
          svgClass: svg ? svg.getAttribute('class') : null,
          svgFill: svg ? cs(svg, 'fill') : null,
          svgStroke: svg ? cs(svg, 'stroke') : null,
          svgStrokeWidth: svg ? cs(svg, 'strokeWidth') : null,
          pathFill: svg ? cs(svg.querySelector('path'), 'fill') : null,
          pathStroke: svg ? cs(svg.querySelector('path'), 'stroke') : null,
          svgBox: sb ? { w: +sb.width.toFixed(1), h: +sb.height.toFixed(1) } : null,
        };
      }),
      // 对照：面板里带 class="ico" 的图标
      refIcon: (() => {
        const svg = document.querySelector('#panelHead svg, .panel svg');
        if (!svg) return null;
        return { cls: svg.getAttribute('class'), fill: cs(svg, 'fill'), stroke: cs(svg, 'stroke'), sw: cs(svg, 'strokeWidth') };
      })(),
      bodyBg: cs(document.body, 'backgroundColor'),
    };
  });

  console.log(JSON.stringify(info, null, 2));
  await app.close();
  process.exit(0);
})().catch((e) => { console.error('FAILED', e); process.exit(2); });
