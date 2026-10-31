'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { createPreviewServer } = require('./web-preview');
const OUT = path.resolve(__dirname, '../shots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const server = createPreviewServer(); let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1575, height: 884 }, colorScheme: 'light' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForSelector('.graph-node');
    const ids = await page.evaluate(() => window.PMStore.state.tasks.filter(t => t.projectId === 'p-website').map(t => t.id));
    const verifyCanvasFrame = async () => {
      assert.equal(await page.locator('#detailHead').count(), 0);
      assert.equal(await page.locator('.project-toolbar [data-drop="canvas-view"]').isVisible(), true);
      assert.equal(await page.locator('#projectCanvasTools, .project-toolbar [data-ai-work="review"]').count(), 0);
      assert.ok(await page.evaluate(() => {
        const frame = document.querySelector('#detailPanel').getBoundingClientRect();
        const canvas = document.querySelector('.dag-viewport').getBoundingClientRect();
        const controls = document.querySelector('.dag-controls').getBoundingClientRect();
        return ['top', 'right', 'bottom', 'left'].every(side => Math.abs(frame[side] - canvas[side]) < 1)
          && controls.left >= canvas.left && controls.right <= canvas.right
          && controls.top > canvas.top && controls.bottom < canvas.bottom
          && [...document.querySelectorAll('.graph-node')].every(node => node.getBoundingClientRect().bottom < controls.top);
      }), 'the canvas must fill its panel and fitted tasks must stay above its floating tools');
    };
    await verifyCanvasFrame();
    const changeMode = async (kind, value) => {
      if (kind === 'board-view') {
        const button = page.locator('[data-action="toggle-board-view"]');
        if (await button.getAttribute('data-value') !== value) await button.click();
        assert.equal(await button.getAttribute('data-value'), value);
        assert.equal(await page.locator('.drop-menu:visible').count(), 0);
        return;
      }
      await page.click(`[data-drop="${kind}"]`);
      await page.click(`.drop-item[data-drop-action="${kind}"][data-value="${value}"]`);
    };
    const verifyCards = async () => {
      const geometry = await page.locator('.graph-node').evaluateAll(nodes => nodes.map(n => {
        const box = n.getBoundingClientRect(), button = n.querySelector('.dag-node-content');
        return { ...box.toJSON(), clientHeight: button.clientHeight, scrollHeight: button.scrollHeight,
          clientWidth: button.clientWidth, scrollWidth: button.scrollWidth,
          port: n.querySelector('.dag-port-out').getBoundingClientRect().toJSON() };
      }));
      geometry.forEach(a => {
        assert.ok(a.scrollHeight <= a.clientHeight + 1 && a.scrollWidth <= a.clientWidth + 1, JSON.stringify(a));
        assert.ok(Math.abs(a.port.y + a.port.height / 2 - (a.y + a.height / 2)) < 2);
      });
      assert.ok(geometry.every((a, i) => geometry.every((b, j) => i === j || a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y)));
      return geometry;
    };
    const detailed = await verifyCards();
    assert.ok(new Set(detailed.map(n => Math.round(n.height))).size > 1);
    await changeMode('canvas-view', 'simple');
    assert.equal(await page.locator('.tree-node-subs').count(), 0);
    assert.ok((await page.locator(`[data-node-id="${ids[0]}"].graph-node`).boundingBox()).height < detailed[0].height);
    await page.click(`[data-tree-task="${ids[0]}"]`); await page.fill('#f-title', '未保存的标题草稿');
    await changeMode('canvas-view', 'detailed');
    assert.equal(await page.inputValue('#f-title'), '未保存的标题草稿');
    assert.equal(await page.locator('.tree-node-subs .task-sub-preview').count(), 2);
    await page.keyboard.press('Escape');
    await page.evaluate(id => window.PMStore.updateTask(id, { title: '确认完整的品牌视觉、响应式页面与发布验收标准', subtasks: [
      { id: 'sub-1', title: '导出三套配色方案', done: true },
      { id: 'sub-2', title: '和品牌部对齐字体、图标与标题层级', done: false },
      { id: 'sub-3', title: '完成移动端与桌面端的视觉验收', done: false },
    ] }), ids[0]);
    await changeMode('canvas-view', 'simple'); await changeMode('canvas-view', 'detailed');
    const varied = await verifyCards();
    assert.ok(new Set(varied.map(n => Math.round(n.width))).size > 1);
    await page.click(`[data-dag-port="out"][data-node-id="${ids[0]}"]`);
    await page.click(`[data-dag-port="in"][data-node-id="${ids[1]}"]`);
    assert.equal(await page.locator('.tree-edges > path').count(), 1);
    await page.waitForFunction(() => !document.querySelector('.toast'));
    await page.screenshot({ path: path.join(OUT, 'canvas-adaptive-detailed.png') });
    await page.click('[data-nav="board"]');
    assert.ok(await page.locator('[data-drop="scope"]').evaluate(node => {
      const title = document.querySelector('.board-view-title');
      return node.nextElementSibling === title && node.getBoundingClientRect().right <= title.getBoundingClientRect().left;
    }), 'project filter must sit immediately to the left of the board view title');
    assert.equal(await page.locator('.board-subtasks').count(), 0);
    await page.screenshot({ path: path.join(OUT, 'notion-workspace-light.png') });
    await page.click('.board-new-task');
    assert.equal(await page.locator('#taskDrawerTitle').innerText(), '新建任务');
    await page.keyboard.press('Escape');
    await page.click('.board-add-task:first-of-type');
    assert.equal(await page.locator('#taskDrawerTitle').innerText(), '新建任务');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#railNav [data-action="workspace-search"], #railNav [data-ai="toggle"], .rail-quick-links').count(), 0);
    await page.keyboard.press('Control+f');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'boardSearch');
    await changeMode('board-view', 'detailed');
    assert.equal(await page.locator(`[data-task="${ids[0]}"] .task-sub-preview`).count(), 3);
    await page.screenshot({ path: path.join(OUT, 'board-detailed-subtasks.png') });
    await page.reload(); await page.waitForSelector('.board-subtasks');
    assert.equal(await page.evaluate(() => window.PMStore.state.settings.boardView), 'detailed');
    assert.equal(await page.evaluate(() => window.PMStore.state.settings.canvasView), 'detailed');
    await changeMode('board-view', 'simple'); assert.equal(await page.locator('.board-subtasks').count(), 0);
    await page.click('[data-nav="stats"]');
    const heat = await page.locator('.heatmap-summary').evaluate(n => {
      const rect = n.getBoundingClientRect(), body = n.closest('.heatmap-body').getBoundingClientRect();
      const swatches = [...n.querySelectorAll('.heatmap-legend i')].map(el => el.getBoundingClientRect().toJSON());
      return { right: rect.right, bodyRight: body.right, align: getComputedStyle(n).textAlign, swatches };
    });
    assert.ok(Math.abs(heat.right - heat.bodyRight) < 2); assert.equal(heat.align, 'right');
    assert.ok(heat.swatches.every((r, i, all) => i === 0 || (r.y > all[i - 1].y && Math.abs(r.x - all[0].x) < 1)));
    await page.screenshot({ path: path.join(OUT, 'stats-right-vertical-legend.png') });
    await page.click('[data-nav="projects"]');
    const project = page.locator('[data-open-project="p-website"]');
    assert.deepEqual(await project.locator('.project-card-actions button').evaluateAll(nodes => nodes.map(n => n.dataset.action || n.dataset.drop)), ['edit-project', 'project-group', 'archive-project', 'delete-project']);
    await project.locator('[data-action="archive-project"]').click();
    assert.equal(await page.locator('#taskDrawerMask').isHidden(), true);
    assert.equal(await page.evaluate(() => window.PMStore.state.projects.find(p => p.id === 'p-website').archived), true);
    await project.locator('[data-action="edit-project"]').click();
    assert.equal(await page.locator('#p-archived').count(), 0);
    assert.equal(await page.locator('.project-task-item').count(), 6);
    assert.ok(await page.locator('.project-task-section').evaluate(n => n.getBoundingClientRect().y > document.querySelector('#p-desc').getBoundingClientRect().bottom));
    await page.waitForFunction(() => !document.querySelector('.toast'));
    await page.screenshot({ path: path.join(OUT, 'project-actions-task-list.png') });
    await page.click('[data-action="save-project"]');
    assert.equal(await page.evaluate(() => window.PMStore.state.projects.find(p => p.id === 'p-website').archived), true);
    await project.locator('[data-action="archive-project"]').click();
    assert.equal(await page.evaluate(() => window.PMStore.state.projects.find(p => p.id === 'p-website').archived), false);
    await project.locator('[data-action="delete-project"]').click();
    assert.equal(await page.locator('[data-open-project="p-website"]').count(), 0);
    await page.click('[data-nav="trash"]'); await page.click('[data-action="restore"]');
    await page.click('[data-nav="projects"]');
    assert.equal(await page.locator('[data-open-project="p-website"]').count(), 1);
    assert.equal(await page.evaluate(() => window.PMStore.tasksIn('p-website').length), 6);
    await page.click('[data-open-project="p-website"]');
    await page.setViewportSize({ width: 1000, height: 700 }); await verifyCards(); await verifyCanvasFrame();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1000);
    await page.click('[data-nav="settings"]'); await page.click('[data-drop="theme"]'); await page.click('.drop-item[data-value="graphite"]');
    await page.click('[data-nav="projects"]'); await page.click('[data-open-project="p-website"]');
    await verifyCards(); await verifyCanvasFrame(); await page.screenshot({ path: path.join(OUT, 'canvas-adaptive-dark-narrow.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: 看板与画布独立视图、子任务、草稿保留、视图重启保存；看板工具栏与列内创建、搜索快捷键和侧栏入口移除；自适应卡片无溢出/重叠和连线；统计、项目操作、浅深主题与窄窗口。');
  } finally { if (browser) await browser.close(); await server.stop(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
