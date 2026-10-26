'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { createPreviewServer } = require('./web-preview');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'moreready-tabs-'));
  const server = createPreviewServer(undefined, { aiConfigFile: path.join(temp, 'ai.json') });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1575, height: 884 }, colorScheme: 'light' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForSelector('[data-tab-select="projects"]');
    await page.reload(); await page.waitForSelector('[data-tab-select="projects"]');
    const taskSnapshot = () => page.evaluate(() => JSON.parse(JSON.stringify(window.PMStore.state.tasks)));
    const tasks = await taskSnapshot();
    const projects = await page.evaluate(() => JSON.parse(JSON.stringify(window.PMStore.state.projects)));
    assert.equal(await page.locator('[data-tab-select]').count(), 1);
    const active = () => page.evaluate(() => window.PMStore.state.activeModule);
    const choosePage = async key => {
      await page.click('[data-drop="workspace-tab"]');
      try { await page.click(`.drop-item[data-drop-action="workspace-tab"][data-value="${key}"]`); }
      catch (error) {
        console.error(JSON.stringify(await page.evaluate(() => ({ module: window.PMStore.state.activeModule, roster: window.PMStore.state.settings.workspaceTabs, menu: document.querySelector('.drop-menu')?.outerHTML, trigger: document.querySelector('[data-drop="workspace-tab"]').getBoundingClientRect().toJSON(), focused: document.activeElement?.outerHTML }))));
        await page.screenshot({ path: path.resolve('shots/workspace-tabs-error.png') });
        throw error;
      }
    };
    await page.click('[data-nav="today"]');
    assert.equal(await page.locator('#workspaceTab-today').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#panelHead').isHidden(), true);
    assert.ok((await page.title()).includes('今日概览'));
    await choosePage('board');
    assert.equal(await active(), 'board');
    assert.equal(await page.locator('[data-tab-select]').count(), 3);
    await choosePage('board');
    assert.equal(await page.locator('[data-tab-select]').count(), 3, 'opening an existing page must reuse its tab');
    await page.fill('#boardSearch', '导航');
    const matching = await page.locator('.mini').count();
    await page.click('#workspaceTab-today'); await page.click('#workspaceTab-board');
    assert.equal(await page.inputValue('#boardSearch'), '导航');
    assert.equal(await page.locator('.mini').count(), matching);
    await page.click('.board-new-task'); await page.fill('#f-title', '标签切换保留草稿');
    await page.click('#workspaceTab-today');
    assert.equal(await active(), 'board'); assert.equal(await page.inputValue('#f-title'), '标签切换保留草稿');
    await page.click('[data-tab-close="board"]');
    assert.equal(await active(), 'board'); assert.equal(await page.inputValue('#f-title'), '标签切换保留草稿');
    await page.click('[data-tab-close="projects"]');
    assert.equal(await page.locator('#workspaceTab-projects').count(), 0);
    assert.equal(await page.inputValue('#f-title'), '标签切换保留草稿', 'closing an inactive tab must not discard the current editor');
    await page.keyboard.press('Escape'); await page.click('[data-tab-close="board"]');
    assert.equal(await active(), 'today');
    assert.equal(await page.locator('[data-tab-select]').count(), 1);
    for (const key of ['calendar', 'projects', 'board', 'stats', 'trash', 'extensions', 'about', 'settings']) await choosePage(key);
    assert.equal(await page.locator('[data-tab-select]').count(), 9);
    await page.locator('#workspaceTab-settings').press('ArrowLeft'); assert.equal(await active(), 'about');
    await page.locator('#workspaceTab-about').press('Home'); assert.equal(await active(), 'today');
    await page.locator('#workspaceTab-today').press('End'); assert.equal(await active(), 'settings');
    const roster = await page.evaluate(() => window.PMStore.state.settings.workspaceTabs);
    await page.reload(); await page.waitForSelector('#workspaceTab-settings[aria-selected="true"]');
    assert.deepEqual(await page.evaluate(() => window.PMStore.state.settings.workspaceTabs), roster);
    assert.equal(await page.locator('.desktop-window-controls button:disabled').count(), 3);
    await page.screenshot({ path: path.resolve('shots/workspace-tabs-light.png') });
    for (const width of [1000, 600]) {
      await page.setViewportSize({ width, height: 700 });
      await page.locator('#workspaceTab-settings').press('Home');
      await page.locator('#workspaceTab-today').press('End');
      const geometry = await page.evaluate(() => {
        const bar = document.querySelector('#workspaceTabs'), box = bar.getBoundingClientRect(), selected = bar.querySelector('[aria-selected="true"]').getBoundingClientRect();
        return { overflow: bar.scrollWidth > bar.clientWidth, pageWidth: document.documentElement.scrollWidth, controls: document.querySelector('.desktop-window-controls').getBoundingClientRect().toJSON(), bar: box.toJSON(), selected: selected.toJSON() };
      });
      assert.equal(geometry.pageWidth, width); assert.equal(geometry.overflow, true);
      assert.ok(Math.abs(geometry.controls.right - width) < 1);
      assert.ok(geometry.selected.left >= geometry.bar.left - 1 && geometry.selected.right <= geometry.bar.right + 1);
    }
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: path.resolve('shots/workspace-tabs-dark-narrow.png') });
    await page.setViewportSize({ width: 1575, height: 884 });
    await page.click('#workspaceTab-extensions'); await page.fill('#aiModel', '未保存模型');
    await page.click('#workspaceTab-today');
    assert.equal(await active(), 'extensions'); assert.equal(await page.inputValue('#aiModel'), '未保存模型');
    await page.click('[data-tab-close="extensions"]');
    assert.equal(await active(), 'extensions'); assert.equal(await page.inputValue('#aiModel'), '未保存模型');
    await page.fill('#aiModel', '');
    await page.click('#workspaceTab-settings');
    await page.locator('#workspaceTab-settings').press('Delete');
    assert.equal(await page.locator('#workspaceTab-settings').count(), 0);
    assert.deepEqual(await taskSnapshot(), tasks);
    assert.deepEqual(await page.evaluate(() => window.PMStore.state.projects), projects);
    assert.deepEqual(errors, []);
    console.log('PASS: 页面标题移入顶栏、标签新增/复用/切换/关闭、搜索状态与编辑草稿保留、重载恢复、键盘操作、窄窗口横向滚动和右侧窗口按钮；项目任务未变。使用独立预览数据。');
  } finally {
    await browser?.close(); await server.stop();
    const relative = path.relative(os.tmpdir(), temp);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
