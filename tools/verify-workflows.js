'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { createAIService } = require('../src/ai-service');
const { createPreviewServer } = require('./web-preview');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'moreready-workflows-'));
const fixture = { schema: 6, projects: [{ id: 'p', name: '上线项目', desc: '验收与交付', color: '#5b8cff', archived: false }, { id: 'q', name: '其他项目', color: '#38d39f' }],
  tasks: ['a', 'b', 'c'].map((id, index) => ({ id, title: ['需求确认', '页面联调', '接口验证'][index], projectId: 'p', notes: '', due: '', status: index ? 'todo' : 'doing', priority: 'p2', subtasks: [], tags: [], dependsOn: index === 1 ? ['a'] : [], createdAt: 1 })),
  settings: { theme: 'daylight', rememberLast: true }, activeModule: 'projects', activeProjectId: 'p', workspaceProjectId: 'p', tags: [], projectGroups: [], trash: [], activity: [] };
let mode = 'ok', nextPlan = null, browser;
const requests = [];
const empty = () => ({ summary: '建议先明确验收标准，再安排联调。', advice: [{ title: '确认验收范围', detail: '交付前明确可验证的结果。<script>unsafe</script>', severity: 'warning' }], tasks: [], subtasks: [], links: [] });
const ai = createAIService({ configFile: path.join(temp, 'ai.json'), timeout: 2000, fetchImpl: async (url, options) => {
  const body = JSON.parse(options.body); requests.push({ url, body, headers: options.headers });
  if (mode === 'wait') await new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  if (mode === 'unauthorized') return new Response('{}', { status: 401 });
  if (mode === 'invalid') return new Response(JSON.stringify({ choices: [{ message: { content: '{bad json' } }] }));
  if (!body.messages[0].content.includes('只返回一个 JSON')) return new Response(JSON.stringify({ choices: [{ message: { content: '连接成功' } }] }));
  const kind = /工作方式为 ([\w-]+)/.exec(body.messages[0].content)[1];
  let plan = nextPlan; nextPlan = null;
  if (!plan) {
    plan = empty();
    if (kind === 'project-plan') plan.tasks = [
      { key: 'new-1', title: '执行回归测试', notes: '核对主要流程', priority: 'p1', due: '', dependsOn: ['a'] },
      { key: 'new-2', title: '完成上线验收', notes: '记录验收结果', priority: 'p2', due: '', dependsOn: ['new-1'] },
    ];
    if (kind === 'task-breakdown') plan.subtasks = [{ title: '列出验收标准' }, { title: '核对输入输出' }];
    if (kind === 'dependencies') plan.links = [{ from: 'c', to: 'b', reason: '联调先完成接口验证' }];
  }
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) }, finish_reason: 'stop' }] }));
} });
const server = createPreviewServer(undefined, { aiService: ai });
async function verifyFormSelects(page) {
  const selects = await page.locator('#aiWorkForm select').evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node), box = node.getBoundingClientRect();
    const form = node.closest('form').getBoundingClientRect();
    return { repeat: style.backgroundRepeat, image: style.backgroundImage, size: style.backgroundSize,
      rightPadding: parseFloat(style.paddingRight), fits: box.left >= form.left && box.right <= form.right };
  }));
  assert.ok(selects.length > 0);
  for (const select of selects) {
    assert.equal(select.repeat, 'no-repeat', 'AI form arrows must not tile across the select');
    assert.notEqual(select.image, 'none', 'AI form must retain its select arrow in every theme');
    assert.equal(select.size, '12px 12px');
    assert.ok(select.rightPadding >= 24 && select.fits);
  }
}
async function generate(page, kind, taskId) {
  await page.click('#aiDock [data-ai="menu"][aria-label="更多操作"]');
  await page.click(`#aiDock [data-ai-work="${kind}"]`);
  if (taskId) await page.selectOption('#aiWorkTask', taskId);
  await verifyFormSelects(page);
  await page.fill('#aiWorkGoal', '把工作拆成可验证的步骤');
  await page.click('#aiWorkForm [type="submit"]');
  await page.waitForFunction(() => document.getElementById('aiDock').dataset.busy === 'false');
}
const taskData = page => page.evaluate(() => JSON.parse(JSON.stringify(window.PMStore.state.tasks)).sort((a, b) => a.id.localeCompare(b.id)));
(async () => {
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1573, height: 884 } });
    await context.addInitScript(data => { if (!localStorage.getItem('projectdesk.store.v1')) localStorage.setItem('projectdesk.store.v1', JSON.stringify(data)); }, fixture);
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForSelector('.project-card');
    assert.equal(await page.locator('#windowContext, .titlebar-context, .rail-notifications').count(), 0);
    // Record a real keyboard combination, persist it, resolve a conflict, and restore defaults.
    await page.click('[data-nav="settings"]'); await page.click('[data-shortcut="toggleAI"][data-kind="keyboard"]');
    await page.keyboard.press('Control+Shift+j'); assert.match(await page.locator('[data-shortcut-candidate]').innerText(), /Ctrl \+ Shift \+ J/);
    await page.click('[data-shortcut-save]'); await page.keyboard.press('Control+Shift+j'); assert.equal(await page.locator('#aiDock').isVisible(), true);
    await page.click('[data-ai="close"]'); await page.reload(); await page.waitForSelector('#shortcutSettings');
    assert.match(await page.locator('[data-shortcut="toggleAI"][data-kind="keyboard"]').innerText(), /Shift \+ J/);
    await page.click('[data-shortcut="toggleAI"][data-kind="keyboard"]'); await page.keyboard.press('Control+f');
    assert.match(await page.locator('[data-shortcut-warning]').innerText(), /搜索任务/); await page.click('[data-shortcut-save]');
    assert.equal(await page.locator('[data-shortcut="search"][data-kind="keyboard"]').innerText(), '未设置');
    await page.click('[data-shortcut="toggleAI"][data-kind="mouse"]');
    await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 3, bubbles: true, cancelable: true })));
    assert.match(await page.locator('[data-shortcut-warning]').innerText(), /上一个页面/); await page.click('[data-shortcut-save]');
    await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 3, bubbles: true, cancelable: true })));
    assert.equal(await page.locator('#aiDock').isVisible(), true); await page.click('[data-ai="close"]');
    await page.click('[data-shortcut="save"][data-kind="keyboard"]'); await page.keyboard.press('Control+Shift+Space');
    assert.match(await page.locator('[data-shortcut-warning]').innerText(), /保留/); await page.keyboard.press('Escape');
    await page.click('[data-shortcut-reset]');
    await page.waitForFunction(() => !document.querySelector('.toast'));
    await page.locator('#shortcutSettings').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.resolve('shots/shortcut-mapping.png') });
    assert.equal(await page.locator('#systemSettings').count(), 1);
    await page.keyboard.press('Control+n'); await page.fill('#f-title', '快捷键保留草稿');
    await page.keyboard.press('Alt+ArrowLeft'); assert.equal(await page.inputValue('#f-title'), '快捷键保留草稿');
    await page.click('[data-action="sheet-cancel"]'); await page.click('[data-nav="board"]');
    const view = page.locator('[data-action="toggle-board-view"]'); await view.click();
    assert.equal(await view.getAttribute('data-value'), 'detailed'); assert.equal(await page.locator('.drop-menu').count(), 0);
    await page.reload(); await page.waitForSelector('[data-action="toggle-board-view"]'); assert.equal(await view.getAttribute('data-value'), 'detailed');
    // The relocated project action follows the selected project; inspecting the form sends no request.
    await page.click('[data-nav="projects"]'); await page.click('[data-open-project="q"]');
    await page.click('#projectCanvasTools [data-ai-work="review"]');
    assert.equal(await page.inputValue('#aiWorkProject'), 'q'); await verifyFormSelects(page);
    await page.selectOption('#aiWorkProject', 'p');
    assert.equal(await page.inputValue('#aiWorkProject'), 'p'); await verifyFormSelects(page);
    await page.screenshot({ path: path.resolve('shots/ai-workflow-select-light.png') });
    assert.equal(requests.length, 0);
    await page.click('[data-ai="cancel-work"]'); await page.click('[data-ai="close"]');
    await page.click('[data-open-project="p"]');
    await page.click('[data-ai="toggle"]');
    // Connection metadata refresh sees configuration saved after page initialization.
    await generate(page, 'project-plan'); assert.match(await page.locator('#aiStatus').innerText(), /保存 AI 配置/);
    assert.equal(requests.length, 0); assert.equal(await page.inputValue('#aiWorkGoal'), '把工作拆成可验证的步骤');
    ai.save({ providerId: 'deepseek', baseURL: 'https://api.deepseek.com', model: 'fixture-model', apiKey: 'fixture-only-key' });
    const before = await taskData(page);
    await page.click('#aiWorkForm [type="submit"]'); await page.waitForSelector('[data-ai-plan]');
    assert.deepEqual(requests.at(-1).body.response_format, { type: 'json_object' });
    assert.equal(requests.at(-1).url, 'https://api.deepseek.com/chat/completions');
    assert.equal(requests.at(-1).headers.Authorization, 'Bearer fixture-only-key');
    assert.deepEqual(await taskData(page), before, 'generation must not mutate tasks');
    assert.equal(await page.locator('#aiMessages script').count(), 0); assert.match(await page.locator('#aiMessages').innerText(), /<script>unsafe<\/script>/);
    await page.locator('[data-ai-choice][value="task:0"]').uncheck(); await page.click('[data-ai-apply]');
    assert.match(await page.locator('.ai-plan .ai-error').innerText(), /一并勾选/); assert.deepEqual(await taskData(page), before);
    await page.locator('[data-ai-choice][value="task:0"]').check(); await page.click('[data-ai-apply]');
    const after = await taskData(page); assert.equal(after.length, before.length + 2);
    assert.deepEqual(after.find(t => t.title === '完成上线验收').dependsOn, [after.find(t => t.title === '执行回归测试').id]);
    assert.equal(await page.locator('[data-ai-apply]').count(), 0);
    await page.screenshot({ path: path.resolve('shots/ai-workflow-plan.png') });
    await page.click('[data-ai-undo]'); assert.deepEqual(await taskData(page), before);
    await page.click('[data-ai="new-chat"]'); await generate(page, 'dependencies'); await page.click('[data-ai-apply]');
    assert.deepEqual((await taskData(page)).find(t => t.id === 'b').dependsOn, ['a', 'c']);
    await page.click('[data-ai-undo]'); assert.deepEqual(await taskData(page), before);
    // Reject cycles and malformed/unauthorized responses without touching the workspace.
    await page.click('[data-ai="new-chat"]'); nextPlan = { ...empty(), links: [{ from: 'b', to: 'a', reason: '循环关系' }] };
    await generate(page, 'dependencies'); assert.match(await page.locator('#aiStatus').innerText(), /循环/); assert.deepEqual(await taskData(page), before);
    mode = 'invalid'; await generate(page, 'review'); assert.match(await page.locator('#aiStatus').innerText(), /可用方案/);
    mode = 'unauthorized'; await generate(page, 'review'); assert.match(await page.locator('#aiStatus').innerText(), /401/);
    mode = 'ok'; await generate(page, 'project-plan');
    await page.evaluate(() => window.PMStore.updateTask('a', { notes: '生成后修改' }));
    const changed = await taskData(page); await page.click('[data-ai-apply]'); assert.match(await page.locator('.ai-plan .ai-error').innerText(), /内容已变化/); assert.deepEqual(await taskData(page), changed);
    await page.click('[data-ai-discard]'); await page.click('[data-ai="new-chat"]');
    // Task decomposition uses and preserves current editor fields, then saves through the ordinary form.
    await page.click('[data-ai="close"]'); await page.click('[data-nav="projects"]'); await page.click('[data-tree-task="a"]');
    await page.fill('#f-title', '编辑中的需求标题'); await page.fill('#f-notes', '尚未保存的验收背景');
    await page.click('#taskDrawerActions [data-ai-work="task-breakdown"]'); await page.fill('#aiWorkGoal', '拆成两步');
    await page.click('#aiWorkForm [type="submit"]'); await page.waitForSelector('[data-ai-apply]');
    const sent = JSON.parse(requests.at(-1).body.messages[1].content).reference;
    assert.equal(sent.tasks.find(t => t.id === 'a').notes, '尚未保存的验收背景');
    await page.click('[data-ai-apply]'); assert.equal(await page.inputValue('#f-title'), '编辑中的需求标题');
    assert.equal(await page.inputValue('#f-notes'), '尚未保存的验收背景'); assert.equal(await page.locator('#f-subs .sub-item').count(), 2);
    assert.equal((await taskData(page)).find(t => t.id === 'a').subtasks.length, 0);
    await page.screenshot({ path: path.resolve('shots/ai-workflow-draft.png') });
    await page.click('[data-ai-undo]'); assert.equal(await page.locator('#f-subs .sub-item').count(), 0);
    await page.click('[data-ai="new-chat"]'); await generate(page, 'task-breakdown', 'a'); await page.click('[data-ai-apply]');
    await page.click('[data-ai="close"]'); await page.click('[data-action="save-task"]');
    assert.equal((await taskData(page)).find(t => t.id === 'a').subtasks.length, 2);
    assert.equal((await taskData(page)).find(t => t.id === 'a').title, '编辑中的需求标题');
    assert.match(await page.locator('.ai-plan-state').last().textContent(), /随任务保存/);
    await page.click('[data-tree-task="c"]');
    await page.click('#taskDrawerActions [data-ai-work="task-breakdown"]');
    await page.click('#aiWorkForm [type="submit"]'); await page.waitForSelector('[data-ai-apply]');
    await page.click('[data-ai-apply]'); await page.click('[data-ai="close"]'); await page.click('[data-action="sheet-cancel"]');
    assert.equal((await taskData(page)).find(t => t.id === 'c').subtasks.length, 0);
    assert.match(await page.locator('.ai-plan-state').last().textContent(), /编辑已取消/);
    // Cancellation retains the goal; advice-only mode produces no write controls.
    await page.click('[data-ai="toggle"]'); await page.click('[data-ai="new-chat"]'); mode = 'wait';
    await page.click('#aiDock [data-ai="menu"][aria-label="更多操作"]');
    await page.click('#aiDock [data-ai-work="review"]'); await page.fill('#aiWorkGoal', '保留这个分析目标'); await page.click('#aiWorkForm [type="submit"]');
    await page.waitForFunction(() => document.getElementById('aiDock').dataset.busy === 'true'); await page.click('[data-ai="stop"]');
    await page.waitForFunction(() => document.getElementById('aiDock').dataset.busy === 'false'); assert.equal(await page.inputValue('#aiWorkGoal'), '保留这个分析目标');
    mode = 'ok'; await page.click('#aiWorkForm [type="submit"]'); await page.waitForSelector('[data-ai-plan]');
    assert.equal(await page.locator('[data-ai-apply]').count(), 0); assert.match(await page.locator('#aiMessages').innerText(), /确认验收范围/);
    await page.click('[data-ai="new-chat"]'); await page.click('[data-ai="close"]');
    await page.click('[data-nav="settings"]'); await page.click('[data-drop="theme"]'); await page.click('.drop-item[data-value="graphite"]');
    await page.click('[data-nav="projects"]'); await page.click('#projectCanvasTools [data-ai-work="review"]');
    await verifyFormSelects(page); await page.screenshot({ path: path.resolve('shots/ai-workflow-select-dark.png') });
    await page.setViewportSize({ width: 900, height: 680 });
    await verifyFormSelects(page);
    assert.ok(await page.locator('#aiDock').evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && el.scrollWidth <= el.clientWidth + 1; }));
    assert.deepEqual(errors, []);
    console.log('PASS browser workflows: keyboard/mouse binding and persistence, direct view toggle, live configuration refresh, structured generation, selected application/undo, draft preservation, stale/cycle/error rejection, cancellation and narrow layout (isolated mock endpoint)');
  } finally {
    await browser?.close(); await server.stop();
    const relative = path.relative(os.tmpdir(), temp);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
