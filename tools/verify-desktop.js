'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { _electron: electron } = require('playwright');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shots');
const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'moreready-desktop-'));
const DATA = path.join(TEST_ROOT, 'data');
fs.mkdirSync(DATA); fs.mkdirSync(OUT, { recursive: true });
const pkg = require('../package.json');
fs.writeFileSync(path.join(TEST_ROOT, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, main: 'main.js' }));
fs.writeFileSync(path.join(TEST_ROOT, 'main.js'), `require('electron').app.setPath('userData', ${JSON.stringify(DATA)});\nrequire(${JSON.stringify(path.join(ROOT, 'src/main.js'))});`);
const projects = [{ id: 'p', name: '官网改版', desc: '品牌体验与上线交付', color: '#5b8cff' },
  { id: 'q', name: '移动端 App', desc: '客户端体验迭代', color: '#38d39f' },
  { id: 'r', name: '内部运营', desc: '周期运营任务', color: '#f7b955' }, { id: 'empty', name: '全新项目', color: '#c084fc' }];
const task = (id, title, dependsOn = [], status = 'todo', projectId = 'p') => ({ id, title, dependsOn, status, projectId,
  priority: 'p2', notes: '', tags: [], subtasks: [], due: '', createdAt: Date.now() });
const tasks = [task('a', '确认产品需求', [], 'done'), task('b', '设计页面与交互', ['a']),
  task('c', '搭建服务接口', ['a']), task('d', '开发与联调', ['b', 'c']), task('e', '验收并发布', ['d', 'a']),
  task('f', '整理品牌素材'), task('g', '准备运营文案')];
for (let i = 0; i < 6; i++) tasks.push(task('q' + i, ['登录态重构', '消息中心', '崩溃日志', '商店素材', '启动速度', '深色模式'][i], [], 'todo', 'q'));
// Start with legacy widget data to verify the real migration path.
fs.writeFileSync(path.join(DATA, 'store.json'), JSON.stringify({ schema: 4, projects, tasks,
  activeModule: 'projects', activeProjectId: 'all', settings: { theme: 'daylight', accent: '#c18b38',
    alwaysOnTop: true, closeToTray: true, rememberLast: false, opacity: .92 }, tags: ['设计', '前端'], activity: [], trash: [] }));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
let app; let overviewConfig; let aiInfo; const errors = [];
const settled = (page) => page.waitForTimeout(400);
async function launch() {
  app = await electron.launch({ args: [TEST_ROOT], cwd: ROOT, env });
  const page = await app.firstWindow();
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.waitForFunction(() => window.PMStore?.ready && document.querySelector('.dag-viewport'));
  await settled(page); return page;
}
const windowState = () => app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0];
  return { bounds: win.getBounds(), resizable: win.isResizable(), maximizable: win.isMaximizable(),
    maximized: win.isMaximized(), visible: win.isVisible(), top: win.isAlwaysOnTop() }; });
async function fitCheck(page) {
  assert.ok(await page.evaluate(() => {
    const viewport = document.querySelector('.dag-viewport').getBoundingClientRect();
    const nodes = [...document.querySelectorAll('.graph-node')].map((node) => node.getBoundingClientRect());
    return nodes.every((node) => node.left >= viewport.left && node.right <= viewport.right
      && node.top >= viewport.top && node.bottom <= viewport.bottom)
      && nodes.every((a, i) => nodes.every((b, j) => i === j || a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top));
  }), 'all nodes should fit without overlapping: ' + JSON.stringify(await page.evaluate(() => ({ viewport: document.querySelector('.dag-viewport').getBoundingClientRect().toJSON(), nodes: [...document.querySelectorAll('.graph-node')].map((node) => node.getBoundingClientRect().toJSON()), transform: document.querySelector('.dag-plane').style.transform }))));
}
const port = (page, id, side) => page.locator(`[data-dag-port="${side}"][data-node-id="${id}"]`);
async function choose(page, kind, value) {
  await page.click(`#taskDrawerBody [data-drop="task-${kind}"]`);
  await page.click(`.drop-item[data-drop-action="task-${kind}"][data-value="${value}"]`);
}
async function openProject(page, id) {
  if (await page.evaluate(() => window.PMStore.state.activeModule) !== 'projects') await page.click('[data-nav="projects"]');
  await page.fill('#projectSearch', '');
  await page.click(`[data-open-project="${id}"]`); await settled(page);
}

(async () => {
  let page = await launch();
  const initial = await windowState();
  assert.ok(initial.bounds.width >= 960 && initial.bounds.height >= 620 && initial.resizable && initial.maximizable);
  assert.equal(initial.top, false);
  const duplicate = spawn(require('electron'), [TEST_ROOT], { env, cwd: ROOT, windowsHide: true, stdio: 'ignore' });
  const duplicateCode = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { duplicate.kill(); reject(new Error('duplicate launch did not exit')); }, 15000);
    duplicate.once('error', (error) => { clearTimeout(timeout); reject(error); });
    duplicate.once('close', (code) => { clearTimeout(timeout); resolve(code); });
  });
  assert.equal(duplicateCode, 0);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  assert.equal(await page.evaluate(() => window.PMStore.state.schema), 6);
  const legacyBackup = JSON.parse(fs.readFileSync(path.join(DATA, 'store.before-desktop.json'), 'utf8'));
  assert.equal(legacyBackup.schema, 4);
  assert.deepEqual(legacyBackup.tasks, tasks);
  assert.deepEqual(legacyBackup.projects, projects);
  assert.equal(await page.evaluate(() => window.PMStore.state.settings.closeToTray), false);
  assert.equal(await page.locator('.graph-node').count(), 7);
  assert.equal(await page.locator('.tree-edges > path').count(), 6);
  assert.ok(Number(await page.locator('.dag-viewport').getAttribute('data-scale')) > .55);
  await fitCheck(page);
  assert.ok(await page.evaluate(() => {
    const list = document.querySelector('#panel').getBoundingClientRect(), canvas = document.querySelector('.dag-viewport').getBoundingClientRect();
    const controls = document.querySelector('.dag-controls').getBoundingClientRect();
    const groups = [...document.querySelector('.dag-controls').children].map((el) => el.getBoundingClientRect());
    const middle = (Math.min(...groups.map((el) => el.left)) + Math.max(...groups.map((el) => el.right))) / 2;
    const panel = document.querySelector('#detailPanel').getBoundingClientRect();
    return list.width <= 300 && canvas.width > list.width * 2
      && Math.abs(canvas.top - panel.top) < 1 && Math.abs(canvas.bottom - panel.bottom) < 1
      && Math.abs(canvas.left - panel.left) < 1 && Math.abs(canvas.right - panel.right) < 1
      && controls.top > canvas.top && controls.bottom < canvas.bottom
      && controls.left >= canvas.left && controls.right <= canvas.right
      && Math.abs(middle - (controls.left + controls.right) / 2) < 1;
  }));
  await page.screenshot({ path: path.join(OUT, 'desktop-projects-light.png') });
  await page.click('[data-nav="projects"]');
  assert.deepEqual((await windowState()).bounds, initial.bounds);
  await page.fill('#projectSearch', '不存在'); assert.equal(await page.locator('.project-card').count(), 0);
  assert.equal(await page.locator('.graph-node').count(), 7);
  await page.fill('#projectSearch', '客户端体验'); assert.equal(await page.locator('.project-card').count(), 1);
  await page.fill('#projectSearch', '');
  await page.click('[data-drop="project-status"]');
  assert.equal(await page.locator('.drop-item[data-drop-action="project-layout"]').count(), 0);
  await page.click('.drop-item[data-drop-action="project-filter"][data-value="done"]');
  assert.equal(await page.locator('.project-card').count(), 0);
  assert.equal(await page.locator('.graph-node').count(), 7);
  await page.click('[data-drop="project-layout"]');
  assert.equal(await page.locator('.drop-item[data-drop-action="project-filter"]').count(), 0);
  await page.click('.drop-item[data-drop-action="project-layout"][data-value="compact"]');
  assert.ok(await page.locator('#projectResults').evaluate((element) => element.classList.contains('compact')));
  assert.match(await page.locator('[data-drop="project-status"]').innerText(), /已完成/);
  await page.click('[data-drop="project-status"]');
  await page.click('.drop-item[data-drop-action="project-filter"][data-value="all"]');
  assert.ok(await page.locator('#projectResults').evaluate((element) => element.classList.contains('compact')));
  assert.equal(await page.locator('.project-card').count(), 4);
  await page.click('[data-drop="project-layout"]');
  await page.click('.drop-item[data-drop-action="project-layout"][data-value="cards"]');

  const canvasBefore = await page.locator('.dag-viewport').boundingBox();
  await page.click('[data-tree-task="d"]');
  assert.equal(await page.locator('#taskDrawerMask').isVisible(), true);
  assert.equal(await page.locator('#taskDrawerBody #f-title').count(), 1);
  await page.waitForFunction(() => { const v = document.querySelector('.dag-viewport').getBoundingClientRect(); return [...document.querySelectorAll('.graph-node')].every((el) => { const n = el.getBoundingClientRect(); return n.left >= v.left && n.right <= v.right; }); });
  const dockCheck = async () => assert.ok(await page.evaluate(() => {
    const canvas = document.querySelector('.dag-viewport').getBoundingClientRect();
    const card = document.querySelector('#taskDrawer').getBoundingClientRect();
    const titlebar = document.querySelector('.desktop-titlebar').getBoundingClientRect();
    const cardStyle = getComputedStyle(document.querySelector('#taskDrawer'));
    return canvas.right <= card.left && canvas.width > 200 && card.right <= innerWidth
      && document.documentElement.scrollWidth === innerWidth
      && document.querySelector('#taskDrawerHead').parentElement.id === 'taskDrawer'
      && document.querySelector('#taskDrawerActions').parentElement.id === 'taskDrawer'
      && Math.abs(card.top - titlebar.bottom) < 1 && Math.abs(card.bottom - innerHeight) < 1
      && Math.abs(card.right - innerWidth) < 1 && cardStyle.borderRadius === '0px'
      && cardStyle.borderTopWidth === '0px' && cardStyle.borderBottomWidth === '0px';
  }), 'task inspector must fill its own right column below the titlebar without overlapping the canvas');
  await dockCheck();
  assert.ok((await page.locator('.dag-viewport').boundingBox()).width < canvasBefore.width);
  await fitCheck(page);
  assert.equal(await page.locator('.graph-node.selected[data-node-id="d"]').count(), 1);
  assert.deepEqual(await page.locator('.graph-node.related').evaluateAll((nodes) => nodes.map((n) => n.dataset.nodeId).sort()), ['a', 'b', 'c', 'e']);
  assert.equal(await page.locator('.graph-node.muted').count(), 2);
  assert.equal(await page.locator('.tree-edges > path.related').count(), 6);
  await page.click('[data-tree-task="b"]'); await settled(page);
  assert.equal(await page.locator('#f-title').inputValue(), '设计页面与交互');
  assert.equal(await page.locator('.graph-node.muted[data-node-id="c"]').count(), 1);
  await page.click('[data-tree-task="d"]'); await settled(page);
  assert.equal(await page.locator('.drawer-body .grid2 .select').evaluateAll((els) => els.every((el) => getComputedStyle(el).textAlign === 'center')), true);
  assert.equal(await page.locator('#f-due').evaluate((el) => getComputedStyle(el).textAlign), 'center');
  assert.equal(await page.locator('#f-status, [data-drop="task-status"]').count(), 0);
  assert.equal(await page.locator('#f-reminder svg').count(), 1);
  assert.equal(await page.locator('#f-priority svg').count(), 1);
  assert.equal(await page.locator('.dependency-field').count(), 0);
  assert.equal(await page.locator('.desktop-workspace').evaluate((el) => el.inert), false);
  await page.fill('#f-due', '2026-11-01');
  await choose(page, 'reminder', 'before-1d'); await choose(page, 'priority', 'p0');
  await page.fill('#f-title', '开发联调与验收');
  assert.ok(await page.locator('.subtask-field').evaluate((el) => el.getBoundingClientRect().top >= [...document.querySelectorAll('.task-meta')].at(-1).getBoundingClientRect().bottom));
  assert.ok(await page.locator('.task-parents-field').evaluate(el => el.getBoundingClientRect().top >= document.querySelector('.subtask-field').getBoundingClientRect().bottom));
  await page.fill('#f-sub-input', '接口验收'); await page.keyboard.press('Enter');
  await page.fill('#f-sub-input', '回归测试'); await page.keyboard.press('Enter');
  await page.fill('#f-sub-input', '临时子项'); await page.keyboard.press('Enter');
  await page.locator('[data-sub-del]').last().click();
  await page.locator('[data-sub-toggle]').first().click();
  assert.equal(await page.locator('#f-subs .sub-item').count(), 2);
  await page.click('#f-newtag'); await page.fill('#f-tag-input', '验收'); await page.keyboard.press('Enter');
  await page.click('#f-newtag'); await page.fill('#f-tag-input', '验收'); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#f-tags [data-tag="验收"]').count(), 1);
  assert.equal(await page.locator('#f-tags [data-tag="验收"].on').count(), 1);
  await page.click('#f-newtag'); await page.fill('#f-tag-input', '取消标签'); await page.keyboard.press('Escape');
  assert.equal(await page.locator('#f-tag-input').isHidden(), true);
  assert.equal(await page.locator('#f-newtag').isVisible(), true);
  await page.click('#f-newtag'); await page.fill('#f-tag-input', '点击取消标签'); await page.click('#f-notes');
  assert.equal(await page.locator('#f-tag-input').isHidden(), true);
  assert.equal(await page.locator('#f-notes').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('#f-tags [data-tag="点击取消标签"]').count(), 0);
  const metadataSizes = await page.locator('.task-meta .input, .task-meta .select').evaluateAll(els => els.map(el => {
    const box = el.getBoundingClientRect(); return [box.width, box.height];
  }));
  assert.equal(metadataSizes.length, 4);
  metadataSizes.forEach(size => assert.deepEqual(size, metadataSizes[0]));
  assert.equal(await page.locator('#f-project').evaluate(el => el.readOnly), true);
  assert.equal(await page.inputValue('#f-project'), '官网改版');
  assert.equal(await page.locator('#taskDrawerBody [data-drop="task-project"]').count(), 0);
  assert.equal(await page.locator('#taskDrawerMask').isVisible(), true);
  // Connecting while editing must remain available and survive detail saving.
  await port(page, 'f', 'out').click(); await port(page, 'g', 'in').click(); await settled(page);
  assert.equal(await page.locator('#f-title').inputValue(), '开发联调与验收');
  assert.equal(await page.locator('.tree-edges > path').count(), 7);
  await port(page, 'a', 'out').click(); await port(page, 'd', 'in').click(); await settled(page);
  assert.ok(await page.locator('#taskDrawerActions').evaluate((footer) => {
    const body = document.querySelector('#taskDrawerBody').getBoundingClientRect();
    return footer.getBoundingClientRect().top >= body.bottom;
  }), 'the inspector owns a separate footer outside its scrolling body');
  await page.screenshot({ path: path.join(OUT, 'desktop-task-drawer.png') });
  await page.keyboard.press('Control+Enter'); await settled(page);
  assert.equal(await page.locator('#taskDrawerMask').isHidden(), true);
  assert.equal(await page.locator('.desktop-workspace').evaluate((el) => el.inert), false);
  assert.match(await page.locator('[data-tree-task="d"]').innerText(), /开发联调与验收/);
  assert.equal(await page.locator('[data-tree-task="d"] .task-sub-preview').count(), 2);
  assert.deepEqual(await page.evaluate(() => window.PMStore.state.tasks.find((t) => t.id === 'd').dependsOn), ['b', 'c', 'a']);
  assert.equal(await page.locator('.graph-node.selected, .graph-node.related, .graph-node.muted').count(), 0);
  await openProject(page, 'q');
  await port(page, 'q0', 'in').click(); assert.equal(await page.locator('#taskDrawerMask').isHidden(), true);
  await port(page, 'q0', 'out').click(); await page.keyboard.press('Escape');
  assert.equal(await page.locator('.dag-viewport.connecting').count(), 0);
  await port(page, 'q0', 'out').click(); await port(page, 'q1', 'in').click(); await settled(page);
  assert.equal(await page.locator('.tree-edges > path').count(), 1);
  assert.equal(await page.locator('#taskDrawerMask').isHidden(), true);
  assert.ok(Number(await page.locator('.dag-viewport').getAttribute('data-scale')) > .75, 'one edge should not shrink unrelated tasks');
  const a = await port(page, 'q1', 'out').boundingBox(), b = await port(page, 'q2', 'in').boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 }); await page.mouse.up(); await settled(page);
  assert.equal(await page.locator('.tree-edges > path').count(), 2);
  await port(page, 'q2', 'out').click(); await port(page, 'q0', 'in').click();
  assert.equal(await page.locator('.tree-edges > path').count(), 2);
  assert.match(await page.locator('.toast').last().innerText(), /循环依赖/);
  await page.click('[data-dag-action="reset"]'); assert.equal(Number(await page.locator('.dag-viewport').getAttribute('data-scale')), 1);
  await page.click('[data-dag-action="in"]'); assert.ok(Number(await page.locator('.dag-viewport').getAttribute('data-scale')) > 1);
  await page.click('[data-dag-action="fit"]'); await fitCheck(page);
  const v = await page.locator('.dag-viewport').boundingBox();
  const transform = await page.locator('.dag-plane').evaluate((el) => el.style.transform);
  await page.mouse.move(v.x + 8, v.y + 8); await page.mouse.down();
  await page.mouse.move(v.x + 48, v.y + 28); await page.mouse.up();
  assert.notEqual(await page.locator('.dag-plane').evaluate((el) => el.style.transform), transform);
  await page.click('[data-dag-action="fit"]');
  await page.mouse.click(v.x + 8, v.y + 8, { button: 'right' });
  assert.equal(await page.locator('.dag-context-menu').isVisible(), true);
  await page.click('[data-dag-new]');
  assert.equal(await page.locator('[data-drop="task-project"]').getAttribute('data-value'), 'q');
  await page.fill('#f-title', '右键规划新任务');
  await page.fill('#f-sub-input', '准备需求'); await page.keyboard.press('Enter');
  await page.keyboard.press('Control+Enter'); await settled(page);
  assert.equal(await page.locator('.graph-node').count(), 7);
  await openProject(page, 'empty');
  assert.equal(await page.locator('.dag-empty').count(), 1);
  await page.click('[data-action="tree-new-task"]'); await page.fill('#f-title', '项目启动');
  await page.keyboard.press('Control+Enter'); await settled(page);
  assert.equal(await page.locator('.graph-node').count(), 1);

  for (const module of ['today', 'calendar', 'board', 'stats', 'trash', 'extensions', 'about', 'settings']) {
    await page.click(`[data-nav="${module}"]`); await settled(page);
    assert.equal(await page.evaluate(() => window.PMStore.state.activeModule), module);
    assert.equal(await page.locator('#panelHead').isHidden(), true);
    assert.equal(await page.locator(`.workspace-tab [data-tab-select="${module}"]`).getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('.desktop-window-controls button:enabled').count(), 3);
    assert.equal(await page.locator('#detailPanel').isHidden(), true);
    assert.deepEqual((await windowState()).bounds, initial.bounds);
    if (module === 'today') {
      assert.ok(await page.locator('.overview-grid > .overview-section').count() >= 5);
      assert.ok(await page.locator('.overview-progress .proj-line').count() >= 4);
      assert.equal(await page.locator('.ring .val').evaluate((el) => getComputedStyle(el).display), 'flex');
      assert.ok(await page.locator('.ring .val small').evaluate((el) => {
        const unit = el.getBoundingClientRect(), ring = el.closest('.ring').getBoundingClientRect();
        return Math.abs((unit.top + unit.bottom) / 2 - (ring.top + ring.bottom) / 2) < 1;
      }));
      await page.screenshot({ path: path.join(OUT, 'desktop-overview-cards.png') });
      await page.click('[data-overview-reset]');
      const dueCard = page.locator('[data-overview-card="due"]');
      const beforeSize = await dueCard.boundingBox();
      const resize = await dueCard.locator('[data-overview-resize]').boundingBox();
      await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2); await page.mouse.down();
      await page.mouse.move(resize.x + resize.width / 2 + 180, resize.y + resize.height / 2 + 100, { steps: 8 }); await page.mouse.up();
      const afterSize = await dueCard.boundingBox();
      assert.ok(afterSize.width > beforeSize.width + 100 && afterSize.height > beforeSize.height + 80);
      const drag = await dueCard.locator('[data-overview-drag]').boundingBox();
      const destination = await page.locator('[data-overview-card="next"] [data-overview-drag]').boundingBox();
      await page.mouse.move(drag.x + drag.width / 2, drag.y + drag.height / 2); await page.mouse.down();
      await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2, { steps: 10 }); await page.mouse.up();
      const customOrder = await page.locator('[data-overview-card]').evaluateAll((cards) => cards.map((card) => card.dataset.overviewCard));
      assert.ok(customOrder.indexOf('due') > customOrder.indexOf('next'));
      overviewConfig = await page.evaluate(() => JSON.parse(JSON.stringify(window.PMStore.state.settings.overviewLayout)));
      // Cancelling a resize restores both the live size and persisted configuration.
      const cancelSize = await dueCard.boundingBox();
      const corner = await dueCard.locator('[data-overview-resize]').boundingBox();
      await page.mouse.move(corner.x + 10, corner.y + 10); await page.mouse.down();
      await page.mouse.move(corner.x + 100, corner.y + 90); await page.keyboard.press('Escape'); await page.mouse.up();
      assert.deepEqual(await dueCard.boundingBox(), cancelSize);
      assert.deepEqual(await page.evaluate(() => window.PMStore.state.settings.overviewLayout), overviewConfig);
      await page.screenshot({ path: path.join(OUT, 'desktop-overview-customized.png') });
      await page.click('[data-nav="board"]'); await page.click('[data-nav="today"]');
      assert.deepEqual(await page.locator('[data-overview-card]').evaluateAll((cards) => cards.map((card) => card.dataset.overviewCard)), customOrder);
      assert.equal(Math.round((await dueCard.boundingBox()).height), overviewConfig.sizes.due.height);
    }
    if (module === 'board') {
      const triggers = await page.locator('.board-tools [data-drop]').evaluateAll((els) => els.map((el) => el.dataset.drop));
      assert.deepEqual(triggers, ['scope', 'board-sort']);
      assert.equal(await page.locator('[data-action="toggle-board-view"]').count(), 1);
      await page.click('.board-tools [data-drop="scope"]'); await page.click('.drop-item[data-drop-action="scope"][data-value="q"]');
      assert.equal(await page.evaluate(() => window.PMStore.state.activeProjectId), 'q');
      assert.equal(await page.locator('#boardGrid .col-head .n').evaluateAll((els) => els.reduce((sum, el) => sum + Number(el.textContent), 0)), 7);
      await page.click('.board-tools [data-drop="scope"]'); await page.click('.drop-item[data-drop-action="scope"][data-value="all"]');
      assert.equal(await page.locator('[data-drop="board-filter"]').count(), 0);
      await page.screenshot({ path: path.join(OUT, 'desktop-board-filters.png') });
    }
    if (module === 'extensions') {
      await page.click('[data-ai-provider="openai"]');
      assert.equal(await page.inputValue('#aiBaseURL'), 'https://api.openai.com/v1');
      await page.fill('#aiBaseURL', 'https://ai.example.test/v1');
      await page.fill('#aiModel', 'test-model'); await page.fill('#aiKey', 'desktop-test-only-secret');
      await page.click('#aiConfig [type="submit"]');
      await page.waitForFunction(() => document.querySelector('#aiConfigStatus').textContent.includes('已保存'));
      aiInfo = await page.evaluate(() => window.PM.aiInfo());
      assert.equal(aiInfo.providerId, 'openai');
      assert.equal(aiInfo.hasKey, true); assert.equal(await page.inputValue('#aiKey'), '');
      const config = fs.readFileSync(path.join(DATA, 'ai-config.json'), 'utf8');
      assert.ok(!config.includes('desktop-test-only-secret'));
      if (aiInfo.keyPersisted) assert.ok(JSON.parse(config).encryptedKey);
      await page.click('#aiFab'); assert.equal(await page.locator('#aiDock').isVisible(), true);
      await page.keyboard.press('Escape'); assert.equal(await page.locator('#aiDock').isHidden(), true);
    }
    if (module === 'about') assert.equal(await page.locator('.about-page > *').count(), 4);
    if (module === 'settings') {
      const original = await page.evaluate(() => window.PMStore.state.settings.accent);
      await page.click('[data-action="accent-custom"]');
      await page.fill('#accentHex', '#2468AC');
      assert.equal(await page.evaluate(() => window.PMStore.state.settings.accent), original);
      await page.click('[data-palette-apply]');
      assert.equal(await page.evaluate(() => window.PMStore.state.settings.accent), '#2468ac');
      await page.click('[data-action="accent-custom"]');
      await page.fill('#accentHex', '#abc');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => window.PMStore.state.settings.accent), '#2468ac');
      await page.click('.swatch[data-color="#c18b38"]');
    }
  }
  await page.click('[data-drop="theme"]'); await page.click('.drop-item[data-value="graphite"]');
  await openProject(page, 'p'); await page.waitForFunction(() => !document.querySelector('.toast'));
  await page.screenshot({ path: path.join(OUT, 'desktop-projects-dark.png') });
  await page.click('[data-tree-task="d"]');
  assert.match(await page.locator('#f-reminder').innerText(), /提前 1 天/);
  assert.equal(await page.evaluate(() => window.PMStore.state.tasks.find(task => task.id === 'd').status), 'todo');
  assert.match(await page.locator('#f-priority').innerText(), /P0 紧急/);
  await page.keyboard.press('Escape');
  await page.click('[data-action="new-project-page"]'); await page.fill('#p-name', '桌面端新建项目');
  await page.click('[data-action="save-project"]'); await settled(page);
  assert.equal(await page.locator('.project-card').count(), 5);
  await page.click('[data-action="maximize"]'); await settled(page);
  assert.equal((await windowState()).maximized, true);
  assert.equal(await page.locator('#maximizeBtn').getAttribute('aria-label'), '还原');
  await page.click('[data-action="maximize"]'); await settled(page);
  assert.equal((await windowState()).maximized, false);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1920, 1032)); await settled(page);
  await openProject(page, 'p'); await page.click('[data-tree-task="d"]'); await settled(page); await dockCheck();
  await page.screenshot({ path: path.join(OUT, 'desktop-inspector-aligned-wide.png') });
  await page.keyboard.press('Escape');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 700)); await settled(page);
  await openProject(page, 'p');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1000);
  await fitCheck(page);
  await page.screenshot({ path: path.join(OUT, 'desktop-narrow.png') });
  await page.click('[data-tree-task="d"]'); await settled(page); await dockCheck(); await fitCheck(page);
  await page.screenshot({ path: path.join(OUT, 'desktop-narrow-card.png') });
  // Long editors scroll inside their own sidebar and keep the canvas available.
  for (let i = 0; i < 12; i++) {
    await page.fill('#f-sub-input', '长表单子任务 ' + i); await page.keyboard.press('Enter');
  }
  await page.click('#f-newtag'); await page.fill('#f-tag-input', '窄窗口标签'); await page.keyboard.press('Enter');
  await dockCheck();
  await page.locator('#taskDrawerBody').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  assert.ok(await page.locator('[data-action="save-task"]').evaluate((el) => {
    const button = el.getBoundingClientRect(); return button.bottom < innerHeight && button.top > 116;
  }));
  await page.screenshot({ path: path.join(OUT, 'desktop-narrow-card-scroll.png') });
  await page.keyboard.press('Escape');
  await page.click('[data-action="minimize"]'); await settled(page);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()), true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore()); await settled(page);
  await page.click('[data-nav="settings"]'); await page.click('[data-action="close-to-tray"]');
  await page.click('[data-action="close"]'); await settled(page);
  assert.equal((await windowState()).visible, false);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await page.click('[data-action="close-to-tray"]');
  await openProject(page, 'q'); await settled(page);
  await app.close(); app = null;
  const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'store.json'), 'utf8'));
  assert.deepEqual(saved.tasks.find((item) => item.id === 'q2').dependsOn, ['q1']);
  assert.equal(saved.tasks.find((item) => item.id === 'd').priority, 'p0');
  assert.equal(saved.tasks.find((item) => item.id === 'd').status, 'todo');
  assert.deepEqual(saved.tasks.find((item) => item.id === 'd').reminder, { mode: 'before-1d', at: '' });
  assert.deepEqual(saved.tasks.find((item) => item.id === 'd').dependsOn, ['b', 'c', 'a']);
  assert.deepEqual(saved.tasks.find((item) => item.id === 'd').subtasks.map((sub) => [sub.title, sub.done]), [['接口验收', true], ['回归测试', false]]);
  assert.deepEqual(saved.tasks.find((item) => item.id === 'd').tags, ['验收']);
  assert.deepEqual(saved.tasks.find((item) => item.title === '右键规划新任务').subtasks.map((sub) => sub.title), ['准备需求']);
  assert.deepEqual(saved.settings.overviewLayout, overviewConfig);
  assert.equal(saved.tags.filter((tag) => tag === '验收').length, 1);
  assert.ok(!saved.tags.includes('取消标签'));
  page = await launch();
  const restoredAI = await page.evaluate(() => window.PM.aiInfo());
  assert.equal(restoredAI.hasKey, aiInfo.keyPersisted);
  assert.equal(restoredAI.model, 'test-model');
  assert.equal(restoredAI.providerId, 'openai');
  assert.equal((await windowState()).bounds.width, 1000);
  assert.equal((await windowState()).bounds.height, 700);
  assert.equal(await page.locator('.tree-edges > path').count(), 2);
  assert.equal(await page.locator('.graph-node').count(), 7);
  assert.deepEqual(await page.evaluate(() => window.PMStore.state.settings.overviewLayout), overviewConfig);
  await page.click('[data-nav="today"]');
  assert.equal(Math.round((await page.locator('[data-overview-card="due"]').boundingBox()).height), overviewConfig.sizes.due.height);
  await settled(page);
  await page.screenshot({ path: path.join(OUT, 'desktop-overview-narrow-restored.png') });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1000, JSON.stringify(await page.evaluate(() => ({ width: innerWidth, grid: getComputedStyle(document.querySelector('.overview-grid')).gridTemplateColumns, cards: [...document.querySelectorAll('[data-overview-card]')].map(el=>({key:el.dataset.overviewCard,rect:el.getBoundingClientRect().toJSON(),columns:getComputedStyle(el).gridColumn})) }))));
  await page.locator('[data-overview-card="due"] [data-overview-resize]').scrollIntoViewIfNeeded();
  const narrowCorner = await page.locator('[data-overview-card="due"] [data-overview-resize]').boundingBox();
  await page.mouse.move(narrowCorner.x + 10, narrowCorner.y + 10); await page.mouse.down();
  await page.mouse.move(narrowCorner.x + 30, narrowCorner.y + 60); await page.mouse.up();
  assert.equal(await page.evaluate(() => window.PMStore.state.settings.overviewLayout.sizes.due.span), overviewConfig.sizes.due.span);
  await page.click('[data-overview-reset]');
  assert.equal(await page.evaluate(() => window.PMStore.state.settings.overviewLayout), undefined);
  assert.equal(await page.locator('[data-overview-card="due"]').evaluate((el) => el.style.getPropertyValue('--overview-height')), '');
  assert.equal(errors.length, 0, errors.join('\n'));
  const closed = app.waitForEvent('close'); await page.click('[data-action="close"]'); await closed; app = null;
  console.log(JSON.stringify({ pass: true, isolatedData: DATA, checks: ['legacy data migration', 'single instance', 'desktop sizing/navigation',
    'compact project list and large canvas', 'readable disconnected components', 'left-to-right branches and merges',
    'independent sidebar with its own header, scroll region and footer', 'centered canvas controls', 'overview pointer resizing and reordering with restart persistence', 'non-overlapping inspector at desktop and narrow widths', 'transitive dependency highlighting', 'subtasks and inline tags persisted', 'board project filter and sorting', 'overview cards and centered percentage', 'task drawer with persisted priority/reminder and preserved status', 'port clicks and dragged links', 'cycle rejection', 'pan/zoom/fit',
    'right-click creation and empty projects', 'all pages', 'native AI configuration and encrypted key restart persistence', 'light/dark themes', 'maximize/minimize/resize',
    'opt-in tray and normal close', 'restored window size and saved dependencies'], errors }, null, 2));
})().catch((err) => { console.error(err); process.exitCode = 1; }).finally(async () => { if (app) await app.close(); });
