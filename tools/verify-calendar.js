'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { createPreviewServer } = require('./web-preview');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'moreready-calendar-'));
  const server = createPreviewServer(undefined, { aiConfigFile: path.join(temp, 'ai.json') });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1575, height: 884 }, colorScheme: 'light' });
    const date = await page.evaluate(() => ({ year: new Date().getFullYear(), month: new Date().getMonth(), today: new Date().getDate() }));
    const day = number => `${date.year}-${String(date.month + 1).padStart(2, '0')}-${String(number).padStart(2, '0')}`;
    const busyDate = day(date.today === 15 || date.today === 16 ? 12 : 15);
    const doneDate = day(date.today === 15 || date.today === 16 ? 13 : 16);
    const task = (id, title, due, priority, notes = '', projectId = 'p', status = 'todo') => ({
      id, title, due, priority, notes, projectId, status, tags: [], subtasks: [], dependsOn: [], createdAt: 1,
    });
    const fixture = {
      schema: 6, projects: [{ id: 'p', name: '官网改版', color: '#5b8cff' }, { id: 'q', name: '移动端 App', color: '#38d39f' }],
      tasks: [
        task('a', '首页视觉走查 <验收>', busyDate, 'p0', '检查 CTA 对齐与屏幕适配。\n核对完整清单。', 'p', 'doing'),
        task('b', '登录态刷新逻辑重构', busyDate, 'p1', '', 'q'),
        task('c', '核对接口文档', busyDate, 'p2'),
        task('d', '准备上线说明', busyDate, 'p3'),
        task('e', '域名与证书迁移', doneDate, 'p1', '证书验证完成', 'p', 'done'),
        task('f', '今天的验收任务', day(date.today), 'p1', '核对交付范围'),
      ],
      settings: { theme: 'daylight', weekStart: 1, rememberLast: true }, activeModule: 'calendar', activeProjectId: 'all',
      projectGroups: [], trash: [], activity: [], tags: [],
    };
    await page.addInitScript(data => {
      if (!localStorage.getItem('projectdesk.store.v1')) localStorage.setItem('projectdesk.store.v1', JSON.stringify(data));
    }, fixture);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForSelector('.cal-cell');
    await page.reload(); await page.waitForSelector('.cal-cell');
    const originalData = await page.evaluate(() => JSON.stringify({ tasks: window.PMStore.state.tasks, projects: window.PMStore.state.projects }));
    const chooseMode = value => page.click(`[data-action="calendar-view"][data-value="${value}"]`);
    const busyCell = () => page.locator(`.cal-cell[data-day="${busyDate}"]`);
    const checkGeometry = async () => {
      const geometry = await page.evaluate(() => {
        const grid = document.querySelector('.cal-grid').getBoundingClientRect();
        return { pageWidth: document.documentElement.scrollWidth, windowWidth: innerWidth, problems: [...document.querySelectorAll('.cal-cell')].flatMap(cell => {
          const bounds = cell.getBoundingClientRect();
          const fits = cell.scrollHeight <= cell.clientHeight + 1 && bounds.left >= grid.left && bounds.right <= grid.right + 1
            && [...cell.querySelectorAll('.cal-event')].every(event => event.getBoundingClientRect().right <= bounds.right);
          return fits ? [] : [{ day: cell.dataset.day, height: cell.clientHeight, scroll: cell.scrollHeight, bounds: bounds.toJSON(), grid: grid.toJSON() }];
        }) };
      });
      if (geometry.problems.length || geometry.pageWidth !== geometry.windowWidth) await page.screenshot({ path: path.resolve('shots/calendar-layout-error.png') });
      assert.equal(geometry.pageWidth, geometry.windowWidth);
      assert.deepEqual(geometry.problems, [], 'calendar cells and task previews must fit: ' + JSON.stringify(geometry));
    };
    assert.equal(await page.locator('#railNav [data-ai], #railNav [data-action="workspace-search"], .rail-quick-links').count(), 0);
    assert.equal(await page.locator('#aiFab').isVisible(), true);
    assert.equal(await page.locator('.cal-cell').count(), 42);
    assert.equal(await page.locator('.cal-grid-detailed, .cal-event').count(), 0);
    assert.equal(await page.evaluate(() => window.PMStore.state.settings.calendarView), 'simple');
    assert.ok(await page.locator('.calendar-view-switch').evaluate(node => node.getBoundingClientRect().right <= document.querySelector('.cal-nav').getBoundingClientRect().left));
    await busyCell().click();
    assert.equal(await busyCell().getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#calendarDayTasks > .task-row[data-task]').count(), 4);
    fs.mkdirSync(path.resolve('shots'), { recursive: true });
    await page.screenshot({ path: path.resolve('shots/calendar-simple-light.png') });
    const month = await page.locator('.mon').innerText();
    await chooseMode('detailed');
    assert.equal(await page.locator('.mon').innerText(), month);
    assert.equal(await page.locator('.cal-cell.sel').getAttribute('data-day'), busyDate);
    assert.equal(await busyCell().locator('.cal-event').count(), 2);
    assert.match(await busyCell().locator('.cal-event-title').first().innerText(), /首页视觉走查 <验收>/);
    assert.match(await busyCell().locator('.cal-event-note').first().innerText(), /检查 CTA/);
    assert.equal(await busyCell().locator('.cal-event-note').nth(1).innerText(), '移动端 App');
    assert.equal(await busyCell().locator('.cal-more').innerText(), '还有 2 项');
    assert.equal(await page.locator('.cal-event.done').count(), 1);
    await busyCell().locator('.cal-more').click();
    assert.equal(await page.locator('#calendarDayTasks > .task-row[data-task]').count(), 4);
    await busyCell().locator('[data-task="a"]').click();
    assert.equal(await page.inputValue('#f-title'), '首页视觉走查 <验收>');
    assert.equal(await page.locator('#taskDrawerHead [data-ai-work="task-breakdown"]').count(), 0);
    assert.equal(await page.locator('#taskDrawerActions [data-ai-work="task-breakdown"]').getAttribute('data-task-id'), 'a');
    const checkFooter = async () => assert.ok(await page.locator('#taskDrawerActions').evaluate(footer => {
      const buttons = [...footer.querySelectorAll('button')].map(node => node.getBoundingClientRect());
      const bounds = footer.getBoundingClientRect();
      return buttons.every(box => Math.abs(box.top - buttons[0].top) < 1 && box.left >= bounds.left && box.right <= bounds.right);
    }), 'task footer actions must fit on one row');
    await checkFooter();
    await page.fill('#f-notes', '未保存的日历编辑草稿');
    await chooseMode('simple'); assert.equal(await page.inputValue('#f-notes'), '未保存的日历编辑草稿');
    await chooseMode('detailed'); assert.equal(await page.inputValue('#f-notes'), '未保存的日历编辑草稿');
    await page.keyboard.press('Escape');
    await page.locator(`.cal-cell[data-day="${doneDate}"] .cal-day-select`).press('Enter');
    assert.equal(await page.locator('.cal-cell.sel').getAttribute('data-day'), doneDate);
    await busyCell().locator('.cal-day-select').click();
    await checkGeometry(); await page.screenshot({ path: path.resolve('shots/calendar-detailed-light.png') });

    // Real pointer double-clicks must survive the first click and create one dated draft.
    const emptyDate = day(date.today === 25 ? 26 : 25);
    const otherDate = day(date.today === 20 ? 21 : 20);
    const cellFor = key => page.locator(`.cal-cell[data-day="${key}"]`);
    for (const mode of ['simple', 'detailed']) {
      await chooseMode(mode);
      await cellFor(emptyDate).click();
      assert.equal(await page.locator('.cal-cell.sel').getAttribute('data-day'), emptyDate);
      assert.equal(await page.locator('#taskDrawerMask').isHidden(), true, 'one click only selects the date');
      const target = mode === 'simple' ? cellFor(emptyDate) : cellFor(emptyDate).locator('.cal-day-select');
      await target.dblclick();
      assert.equal(await page.locator('#taskDrawerTitle').innerText(), '新建任务');
      assert.equal(await page.inputValue('#f-due'), emptyDate);
      assert.equal(await page.locator('#taskDrawerMask').count(), 1);
      assert.equal(await page.locator('#taskDrawerBody [data-drop="task-project"]').count(), 1);
      assert.equal(await page.locator('#taskDrawerActions [data-ai-work="task-breakdown"]').count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'f-title');
      await page.click('#taskDrawerActions [data-action="sheet-cancel"]');
    }
    await busyCell().locator('[data-task="a"]').dblclick();
    assert.equal(await page.locator('#taskDrawerTitle').innerText(), '编辑任务', 'double-clicking a task must keep its editor');
    assert.equal(await page.inputValue('#f-title'), '首页视觉走查 <验收>');
    await checkFooter();
    await cellFor(emptyDate).locator('.cal-day-select').dblclick();
    assert.equal(await page.locator('#taskDrawerTitle').innerText(), '新建任务', 'an unchanged editor can give way to calendar creation');
    await page.fill('#f-title', '日历双击创建验证');
    await page.fill('#f-notes', '从日期格创建并填写完整任务');
    await page.click('[data-drop="task-project"]'); await page.click('.drop-item[data-drop-action="task-project"][data-value="q"]');
    assert.equal(await page.locator('#taskDrawerHead .ph-title p').innerText(), '移动端 App');
    await page.click('[data-drop="task-priority"]'); await page.click('.drop-item[data-drop-action="task-priority"][data-value="p1"]');
    await page.click('[data-drop="task-reminder"]'); await page.click('.drop-item[data-drop-action="task-reminder"][data-value="due"]');
    await page.fill('#f-sub-input', '确认验收标准'); await page.locator('#f-sub-input').press('Enter');
    await cellFor(otherDate).locator('.cal-day-select').dblclick();
    assert.equal(await page.inputValue('#f-title'), '日历双击创建验证', 'a changed draft must survive another calendar double-click');
    assert.equal(await page.inputValue('#f-due'), emptyDate);
    assert.equal(await page.locator('#f-subs .sub-item').count(), 1);
    await page.click('#taskDrawerActions [data-action="save-task"]');
    assert.equal(await page.locator('#taskDrawerMask').isHidden(), true);
    const created = await page.evaluate(() => window.PMStore.state.tasks.find(task => task.title === '日历双击创建验证'));
    assert.equal(created.projectId, 'q'); assert.equal(created.due, emptyDate); assert.equal(created.priority, 'p1');
    assert.equal(created.reminder.mode, 'due'); assert.equal(created.subtasks[0].title, '确认验收标准');
    assert.equal(created.notes, '从日期格创建并填写完整任务');
    assert.equal(await page.evaluate(() => window.PMStore.state.tasks.length), fixture.tasks.length + 1);
    await page.reload(); await page.waitForSelector('.cal-grid-detailed');
    await cellFor(emptyDate).locator(`[data-task="${created.id}"]`).click();
    assert.equal(await page.inputValue('#f-project'), '移动端 App');
    await checkFooter(); await page.screenshot({ path: path.resolve('shots/calendar-created-task-editor.png') });
    page.once('dialog', dialog => dialog.accept());
    await page.click('#taskDrawerActions [data-action="delete-task"]');
    assert.equal(await page.evaluate(() => window.PMStore.state.tasks.length), fixture.tasks.length);
    const adjacent = await page.locator('.cal-cell.out').first().getAttribute('data-day');
    await cellFor(adjacent).locator('.cal-day-select').dblclick(); assert.equal(await page.inputValue('#f-due'), adjacent);
    await page.click('#taskDrawerActions [data-action="sheet-cancel"]');
    await page.click('[data-action="cal-move"][data-dir="1"]');
    assert.notEqual(await page.locator('.mon').innerText(), month);
    const nextMonth = await page.locator('.mon').innerText();
    await chooseMode('simple'); assert.equal(await page.locator('.mon').innerText(), nextMonth);
    await page.click('[data-action="cal-today"]'); assert.equal(await page.locator('.mon').innerText(), month);
    assert.equal(await page.locator('.cal-cell.sel').getAttribute('data-day'), day(date.today));
    await page.keyboard.press('Control+Shift+v'); assert.equal(await page.locator('.cal-grid-detailed').count(), 1);
    await page.reload(); await page.waitForSelector('.cal-grid-detailed');
    assert.equal(await page.locator('[data-value="detailed"][data-action="calendar-view"]').getAttribute('aria-pressed'), 'true');
    await page.click('[data-nav="settings"]'); await page.click('[data-drop="weekstart"]'); await page.click('.drop-item[data-value="0"]');
    await page.click('[data-drop="theme"]'); await page.click('.drop-item[data-value="graphite"]');
    await page.click('[data-nav="calendar"]'); assert.equal(await page.locator('.cal-dow').first().innerText(), '日');
    await busyCell().locator('.cal-day-select').click();
    await checkGeometry(); await page.screenshot({ path: path.resolve('shots/calendar-detailed-dark.png') });
    for (const width of [1000, 600]) {
      await page.setViewportSize({ width, height: 800 }); await checkGeometry();
      for (const mode of ['simple', 'detailed']) { await chooseMode(mode); await checkGeometry(); }
    }
    await page.screenshot({ path: path.resolve('shots/calendar-detailed-narrow.png') });
    assert.equal(await page.evaluate(() => JSON.stringify({ tasks: window.PMStore.state.tasks, projects: window.PMStore.state.projects })), originalData);
    assert.deepEqual(errors, []);
    console.log('PASS: calendar selection and real double-click creation in both modes, chosen/adjacent dates, editable project and full task fields, save/reload/cancel, draft protection, bottom AI action; views, month navigation, light/dark/narrow layouts; original project/task data preserved.');
  } finally {
    await browser?.close(); await server.stop();
    const relative = path.relative(os.tmpdir(), temp);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
