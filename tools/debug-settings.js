/* 定点排查：启动应用 → 进设置 → 展开主题下拉 → 截图 + 量所有可能溢出的地方 */
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
  await win.waitForTimeout(1400);

  // 进设置（点竖栏里的「设置」）
  await win.click('[data-nav="settings"]');
  await win.waitForTimeout(700);

  const before = await win.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), bottom: +b.bottom.toFixed(1) };
    };
    const rail = document.querySelector('.rail');
    return {
      window: { w: window.innerWidth, h: window.innerHeight },
      app: box('.app'),
      rail: box('.rail'),
      railNav: box('.rail-nav'),
      railFoot: box('.rail-foot'),
      footButtons: [...document.querySelectorAll('.rail-foot .icon-btn')].map((el) => {
        const b = el.getBoundingClientRect();
        return { y: +b.y.toFixed(1), h: +b.height.toFixed(1), on: el.dataset.on || '', w: +b.width.toFixed(1) };
      }),
      navItems: [...document.querySelectorAll('.nav-item')].map((el) => +el.getBoundingClientRect().bottom.toFixed(1)),
      panel: box('.panel'),
      bodyScroll: {
        scrollH: document.querySelector('.panel-body').scrollHeight,
        clientH: document.querySelector('.panel-body').clientHeight,
        scrollTop: document.querySelector('.panel-body').scrollTop,
      },
      themeSelect: box('#moduleTheme'),
      docScroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
      bodyScrollbarH: document.body.scrollHeight,
    };
  });
  await win.screenshot({ path: path.join(OUT, 'dbg-1-settings.png') });

  // 展开原生下拉，复现截图里的状态
  await win.click('#moduleTheme');
  await win.waitForTimeout(400);
  await win.screenshot({ path: path.join(OUT, 'dbg-2-select-open.png') });
  await win.keyboard.press('Escape');
  await win.waitForTimeout(200);

  // 滚到底，看底部
  await win.evaluate(() => { document.querySelector('.panel-body').scrollTop = 99999; });
  await win.waitForTimeout(400);
  await win.screenshot({ path: path.join(OUT, 'dbg-3-settings-bottom.png') });

  const after = await win.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), bottom: +b.bottom.toFixed(1) };
    };
    return {
      rail: box('.rail'),
      railFoot: box('.rail-foot'),
      panelBodyBox: box('.panel-body'),
      lastSetRow: box('.set-row:last-of-type'),
      windowH: window.innerHeight,
    };
  });

  const bounds = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return { ...w.getBounds(), contentBounds: w.getContentBounds() };
  });

  console.log(JSON.stringify({ bounds, before, after }, null, 2));
  await app.close();
  process.exit(0);
})().catch((e) => { console.error('FAILED', e); process.exit(2); });
