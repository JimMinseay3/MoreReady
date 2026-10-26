/* 量 210 宽竖栏里「新建任务」按钮与外壳的真实几何 */
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
  await win.screenshot({ path: path.join(OUT, 'dbg-menu.png') });

  const info = await win.evaluate(() => {
    const b = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1) };
    };
    const cs = (sel, p) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[p] : null; };
    const app = document.querySelector('.app');
    return {
      window: { w: window.innerWidth, h: window.innerHeight },
      app: b('.app'),
      appMargin: cs('.app', 'margin'),
      rail: b('.rail'),
      railPad: cs('.rail', 'padding'),
      railActions: b('.rail-actions'),
      cta: b('.rail-cta'),
      ctaStyle: { w: cs('.rail-cta', 'width'), pad: cs('.rail-cta', 'padding'), box: cs('.rail-cta', 'boxSizing'), minW: cs('.rail-cta', 'minWidth'), flex: cs('.rail-cta', 'flex') },
      navItem: b('.nav-item'),
      head: b('.rail-head'),
      winBtns: b('.win-btns'),
      foot: b('.rail-foot'),
      railScrollW: document.querySelector('.rail').scrollWidth,
      railClientW: document.querySelector('.rail').clientWidth,
      docW: document.documentElement.scrollWidth,
      innW: window.innerWidth,
      bodyW: document.body.getBoundingClientRect().width,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await app.close();
  process.exit(0);
})().catch((e) => { console.error('FAILED', e); process.exit(2); });
