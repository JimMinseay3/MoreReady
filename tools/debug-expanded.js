/* 展开态几何检查：竖栏是否 206 / 详情区是否 ~644 / 有没有横向裁切 */
'use strict';

const path = require('path');
const fs = require('fs');
const { _electron: electron } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shots');
const STORE = path.join(process.env.APPDATA || '', 'projectdesk-widget', 'store.json');
if (fs.existsSync(STORE)) fs.rmSync(STORE);

(async () => {
  const app = await electron.launch({ args: [ROOT], cwd: ROOT });
  const win = await app.firstWindow();
  await win.waitForLoadState('load');
  await win.waitForTimeout(1200);
  await win.click('[data-nav="board"]');
  await win.waitForTimeout(1000);
  const m = await win.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { w: Math.round(b.width), x: Math.round(b.x), right: Math.round(b.right) }; };
    return {
      win: window.innerWidth,
      app: r('.app'),
      rail: r('.rail'),
      panel: r('.panel'),
      winBtns: r('.win-btns'),
      winBtnsRight: getComputedStyle(document.querySelector('.win-btns')).right,
      winBtnsLeft: getComputedStyle(document.querySelector('.win-btns')).left,
      drawer: r('.drawer'),
      drawerOpen: document.querySelector('.drawer').classList.contains('open'),
      drawerMaskHidden: document.querySelector('.drawerMask, #drawerMask').hidden,
      railOnly: document.getElementById('app').classList.contains('rail-only'),
      scrollX: window.scrollX, scrollY: window.scrollY,
      docScrollLeft: document.documentElement.scrollLeft, bodyScrollLeft: document.body.scrollLeft,
      activeEl: (document.activeElement && (document.activeElement.id || document.activeElement.className)) || '',
      panelStyle: (() => { const cs = getComputedStyle(document.querySelector('.panel')); return { flex: cs.flex, w: cs.width, transform: cs.transform, opacity: cs.opacity, position: cs.position, margin: cs.margin }; })(),
      appChildren: [...document.getElementById('app').children].map((c) => {
        const b = c.getBoundingClientRect();
        const cs = getComputedStyle(c);
        return { cls: c.className, x: Math.round(b.x), w: Math.round(b.width), pos: cs.position, display: cs.display };
      }),
      panelHead: r('.panel-head'),
      scrollW: document.documentElement.scrollWidth,
      railOverflow: (() => { const n = document.querySelector('.rail'); return n.scrollWidth - n.clientWidth; })(),
    };
  });
  console.log(JSON.stringify(m, null, 2));
  await win.screenshot({ path: path.join(OUT, 'dbg-menu-expanded.png') });
  await app.close();
  process.exit(0);
})().catch((e) => { console.error('FAILED', e); process.exit(2); });
