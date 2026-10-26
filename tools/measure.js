/* 布局量测：启动静态服务 + Playwright，打印关键元素的真实尺寸
 * 用法: node tools/measure.js
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', 'src', 'renderer');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto('http://127.0.0.1:' + srv.address().port + '/');
  await page.waitForTimeout(1200);

  const m = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { w: +b.width.toFixed(1), h: +b.height.toFixed(1), x: +b.x.toFixed(1), text: (el.textContent || '').trim().slice(0, 14) };
    };
    const cs = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
    return {
      appWidth: cs('.app', 'width'),
      railComputed: cs('.rail', 'width'),
      rail: box('.rail'),
      railNav: box('.rail-nav'),
      itemCount: document.querySelectorAll('.nav-item').length,
      firstItem: box('.nav-item'),
      firstGlyph: box('.nav-item .ni-glyph'),
      brand: box('.brand'),
      brandMark: box('.brand-mark'),
      railCta: box('.rail-cta'),
      panel: box('.panel'),
      railOverflowX: document.querySelector('.rail').scrollWidth + ' / ' + document.querySelector('.rail').clientWidth,
      navScroll: (() => { const n = document.querySelector('.rail-nav'); return { scrollH: n.scrollHeight, clientH: n.clientHeight, scrolling: n.scrollHeight > n.clientHeight + 1 }; })(),
      docOverflowX: document.documentElement.scrollWidth + ' / ' + document.documentElement.clientWidth,
    };
  });

  console.log(JSON.stringify(m, null, 2));
  await browser.close();
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
