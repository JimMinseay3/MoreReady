/* 开发自检：静态服务 + Playwright 截图 + 控制台错误捕获
 * 用法: node tools/shot.js [--out dir]
 */
'use strict';

const { createPreviewServer } = require('./web-preview');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', 'src', 'renderer');
const OUT = path.join(__dirname, '..', 'shots');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };

fs.mkdirSync(OUT, { recursive: true });

const server = createPreviewServer(ROOT);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(base, { waitUntil: 'load' });
  // 每次自检都用干净状态，避免上一轮 localStorage 残留影响截图
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(900);

  const shots = [];
  const shot = async (name) => {
    const p = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: p });
    shots.push(p);
    console.log('shot ->', p);
  };

  const mods = ['calendar', 'projects', 'board', 'stats', 'trash', 'about', 'settings'];
  await page.click('[data-nav="today"]');        // 默认启动只有竖栏，点一下才向右展开
  await page.waitForTimeout(500);
  await shot('01-today');
  for (let i = 0; i < mods.length; i++) {
    await page.click(`[data-nav="${mods[i]}"]`);
    await page.waitForTimeout(420);
    await shot(`${String(i + 2).padStart(2, '0')}-${mods[i]}`);
  }
  // 回到今日概览（点菜单项切换模块，面板保持展开）
  await page.click('[data-nav="today"]');
  await page.waitForTimeout(420);

  // 主题跟随系统：Playwright 默认 prefers-color-scheme: light → 应走日光浅色
  const checks = {};
  checks.schemeLight = await page.evaluate(() => document.getElementById('app').dataset.theme);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(350);
  checks.schemeDark = await page.evaluate(() => document.getElementById('app').dataset.theme);
  await shot('10-system-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(350);

  // 顶部主按钮打开独立项目表单，Ctrl+N 仍可打开任务表单。
  await page.click('[data-nav="projects"]');
  await page.click('.project-new-button');
  await page.waitForTimeout(500);
  checks.projectPage = await page.evaluate(() => ({
    module: window.PMStore.state.activeModule,
    hasProjectForm: !!document.querySelector('#panelBody #p-name'),
    railOnly: document.getElementById('app').classList.contains('rail-only'),
    projectNavSelected: document.querySelector('[data-nav="projects"]').getAttribute('aria-current'),
  }));
  assert.equal(checks.projectPage.module, 'project');
  assert.equal(checks.projectPage.hasProjectForm, true);
  assert.equal(checks.projectPage.projectNavSelected, 'false');
  await page.click('[data-action="sheet-cancel"]');
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => window.PMStore.state.activeModule), 'projects');
  assert.equal(await page.locator('#p-name').count(), 0);
  await page.click('.project-new-button');
  await page.waitForTimeout(350);
  await shot('09-new-project-page');
  await page.click('[data-action="sheet-cancel"]');
  await page.waitForTimeout(200);

  assert.equal(await page.locator('[data-nav="task"]').count(), 0);
  await page.keyboard.press('Control+n');
  await page.waitForTimeout(450);
  checks.taskPage = await page.evaluate(() => ({
    module: window.PMStore.state.activeModule,
    hasTaskForm: !!document.querySelector('#taskDrawerBody #f-title'),
  }));
  assert.equal(checks.taskPage.module, 'projects');
  assert.equal(checks.taskPage.hasTaskForm, true);
  await page.click('[data-drop="task-reminder"]');
  await page.click('.drop-item[data-drop-action="task-reminder"][data-value="due"]');
  await page.click('[data-drop="task-priority"]');
  await page.click('.drop-item[data-drop-action="task-priority"][data-value="p0"]');
  assert.equal(await page.locator('#f-status').count(), 0);
  assert.equal(await page.locator('#f-reminder').evaluate((el) => el.value), 'due');
  assert.equal(await page.locator('#f-priority').evaluate((el) => el.value), 'p0');
  assert.equal(await page.locator('#f-reminder svg').count(), 1);
  assert.equal(await page.locator('#f-priority svg').count(), 1);
  await shot('task-fields-second');
  await shot('10-new-task-page');

  // 取消后回到概览
  await page.click('[data-action="sheet-cancel"]');
  await page.waitForTimeout(500);
  checks.backToToday = await page.evaluate(() => window.PMStore.state.activeModule);
  assert.equal(checks.backToToday, 'projects');

  // 关于页严格四行；品牌 Logo 随强调色同步变色。
  await page.click('[data-nav="settings"]');
  await page.waitForTimeout(350);
  await page.click('[data-action="accent"][data-color="#38d39f"]');
  await page.waitForTimeout(350);
  await page.click('[data-nav="about"]');
  await page.waitForTimeout(350);
  checks.about = await page.evaluate(() => ({
    rows: document.querySelector('.about-page').children.length,
    colors: [...document.querySelectorAll('.brand-logo')].map((el) => getComputedStyle(el).backgroundColor),
    masks: [...document.querySelectorAll('.brand-logo')].map((el) => getComputedStyle(el).maskImage),
    text: document.querySelector('.about-page').textContent,
  }));
  assert.equal(checks.about.rows, 4);
  assert.deepEqual(checks.about.colors, ['rgb(56, 211, 159)']);
  assert.ok(checks.about.masks.every((value) => value.includes('moreready-logo.png')));
  assert.ok(!/运行方式|数据文件|当前内容|应用信息/.test(checks.about.text));
  const imageLoaded = await page.evaluate(async () => {
    const image = new Image();
    image.src = 'assets/moreready-logo.png';
    await image.decode();
    return image.naturalWidth > 0;
  });
  assert.ok(imageLoaded);
  await shot('11-about-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(350);
  await shot('12-about-dark');
  await page.click('[data-action="check-update"]');
  assert.match(await page.locator('.toast-wrap').innerText(), /发行版下载并安装/);
  assert.equal(await page.locator('.about-page > *').count(), 4);
  await page.click('[data-nav="board"]');
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => document.querySelector('.col .mini .m-title')?.textContent || '');
  await page.click('.col .mini [data-action="advance"]');
  await page.waitForTimeout(300);
  checks.advanceMoved = await page.evaluate((t) => {
    const titles = [...document.querySelectorAll('.col:nth-child(2) .mini .m-title')].map((e) => e.textContent);
    return { moved: titles.includes(t), before: t };
  }, before);
  await page.click('[data-nav="today"]');
  await page.waitForTimeout(250);
  const taskCount = await page.evaluate(() => document.querySelectorAll('.task-row').length);
  checks.taskRowsOnToday = taskCount;

  await page.click('[data-nav="today"]'); // 重复点击当前导航不折叠桌面窗口
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1440);
  await shot('desktop-overview');

  // Verify rendered text colors, including light accents and menus outside the app.
  const appearanceChecks = [];
  for (const theme of ['daylight', 'aurora', 'graphite', 'ocean', 'sakura']) {
    await page.click('[data-nav="settings"]');
    await page.click('[data-drop="theme"]');
    await page.click(`.drop-item[data-value="${theme}"]`);
    for (const accent of ['#c18b38', '#5b8cff', '#38d39f', '#f7b955', '#ff6b81', '#c084fc', '#4dd0e1']) {
      await page.click(`.swatch[data-color="${accent}"]`);
      await page.waitForTimeout(300);
      const samples = await page.evaluate(() => {
        const rgb = (text) => {
          const hex = /^#([\da-f]{6})$/i.exec(text.trim());
          return hex ? [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) : text.match(/[\d.]+/g).slice(0, 3).map(Number);
        };
        const lum = (color) => rgb(color).map((n) => n / 255).map((n) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
          .reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
        const ratio = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
        const root = getComputedStyle(document.documentElement);
        const samples = [];
        for (const selector of ['.nav-item[aria-current="true"]', '.appearance-preview-main h2']) {
          const el = document.querySelector(selector), style = getComputedStyle(el);
          const background = style.backgroundColor === 'rgba(0, 0, 0, 0)' ? root.getPropertyValue('--card') : style.backgroundColor;
          samples.push({ selector, contrast: ratio(style.color, background) });
        }
        for (const name of ['--dim', '--dim2', '--status-todo', '--status-doing', '--status-waiting', '--status-done', '--danger']) {
          samples.push({ selector: name, contrast: ratio(root.getPropertyValue(name), root.getPropertyValue('--card')) });
        }
        return samples;
      });
      assert.ok(samples.every((sample) => sample.contrast >= 4.5), JSON.stringify({ theme, accent, samples }));
      await page.click('[data-drop="theme"]');
      assert.ok(await page.locator('.drop-item[aria-selected="true"]').evaluate((el) => {
        const rgb = (color) => {
          const hex = /^#([\da-f]{6})$/i.exec(color.trim());
          return hex ? [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) : color.match(/[\d.]+/g).slice(0, 3).map(Number);
        };
        const lum = (color) => rgb(color).map((n) => n / 255).map((n) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
          .reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
        const style = getComputedStyle(el), a = lum(style.color), b = lum(style.backgroundColor);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5;
      }), `selected popup text is readable: ${theme}/${accent}`);
      await page.keyboard.press('Escape');
      appearanceChecks.push({ theme, accent, minimum: Math.min(...samples.map((sample) => sample.contrast)) });
    }
  }
  checks.appearance = appearanceChecks;
  for (const [theme, name] of [['daylight', 'theme-morning'], ['aurora', 'theme-night']]) {
    await page.click('[data-drop="theme"]'); await page.click(`.drop-item[data-value="${theme}"]`);
    await page.click('.brand-accent-tools .swatch[data-color="#c18b38"]');
    await shot(`${name}-settings`);
    await page.click('[data-nav="projects"]');
    await page.locator('[data-tree-task]').first().click();
    await page.waitForTimeout(400);
    await shot(`${name}-inspector`);
    await page.keyboard.press('Escape');
    await page.click('[data-nav="settings"]');
  }

  console.log('\n--- checks ---');
  console.log(JSON.stringify(checks, null, 2));
  console.log('\n--- console errors ---');
  console.log(errors.length ? errors.join('\n') : '(none)');
  assert.equal(errors.length, 0);

  await browser.close();
  await server.stop();
  // 渲染层报错一律视为失败：以前只打印，导致页面渲染中断（残留上一页 DOM）被漏掉
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('FAILED', e); process.exit(2); });
