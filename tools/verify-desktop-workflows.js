'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'moreready-native-workflows-'));
const data = path.join(temp, 'data'); fs.mkdirSync(data);
fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({ name: 'moreready-native-workflow-check', main: 'main.js' }));
fs.writeFileSync(path.join(data, 'store.json'), JSON.stringify({ schema: 6, projects: [{ id: 'p', name: '桌面工作验证', desc: '独立示例项目', color: '#5b8cff' }], tasks: [],
  settings: { theme: 'daylight', rememberLast: true }, activeModule: 'settings', activeProjectId: 'p', workspaceProjectId: 'p', tags: [], activity: [], trash: [] }));
fs.writeFileSync(path.join(temp, 'main.js'), `
const { app } = require('electron');
app.setPath('userData', ${JSON.stringify(data)});
global.fetch = async (_url, options) => {
  const body = JSON.parse(options.body); global.lastAIRequest = body;
  const plan = { summary: '先建立验收任务，再核对结果。', advice: [{title:'确认范围',detail:'先检查验收标准。',severity:'info'}], tasks:[{key:'new-1',title:'桌面验收步骤',notes:'检查交付内容',priority:'p2',due:'',dependsOn:[]}], subtasks:[],links:[] };
  return new Response(JSON.stringify({ choices:[{message:{content:JSON.stringify(plan)},finish_reason:'stop'}] }));
};
require(${JSON.stringify(path.join(root, 'src/main.js'))});
`);
let app;
(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  try {
    app = await electron.launch({ args: [temp], cwd: root, env });
    const page = await app.firstWindow(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('#shortcutSettings');
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.show(); win.focus(); });
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFocused()), true);
    assert.equal(await page.locator('#windowContext, .rail-notifications').count(), 0);
    await page.click('[data-shortcut="toggleAI"][data-kind="mouse"]');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit('app-command', {}, 'browser-backward'));
    await page.waitForFunction(() => document.querySelector('[data-shortcut-candidate]').textContent.includes('侧键 4'));
    await page.click('[data-shortcut-save]');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit('app-command', {}, 'browser-backward'));
    await page.waitForSelector('#aiDock:not([hidden])');
    const keyInfo = await page.evaluate(() => window.PM.aiSave({ providerId: 'deepseek', baseURL: 'https://api.deepseek.com', model: 'fixture-desktop', apiKey: 'fixture-only-native-key' }));
    assert.equal(keyInfo.configured, true);
    await page.click('#aiDock [data-ai="menu"][aria-label="更多操作"]');
    await page.click('#aiDock [data-ai-work="project-plan"]'); await page.fill('#aiWorkGoal', '建立一个验收步骤');
    await page.click('#aiWorkForm [type="submit"]'); await page.waitForSelector('[data-ai-apply]');
    assert.equal(await page.evaluate(() => window.PMStore.state.tasks.length), 0);
    assert.deepEqual(await app.evaluate(() => global.lastAIRequest.response_format), { type: 'json_object' });
    await page.click('[data-ai-apply]'); assert.equal(await page.evaluate(() => window.PMStore.state.tasks[0].title), '桌面验收步骤');
    await page.click('[data-ai-undo]'); assert.equal(await page.evaluate(() => window.PMStore.state.tasks.length), 0);
    await page.click('[data-ai="close"]');
    const stored = JSON.parse(fs.readFileSync(path.join(data, 'store.json'), 'utf8'));
    assert.equal(stored.settings.keybindings.toggleAI.mouse, 3); assert.equal(stored.settings.keybindings.previousPage.mouse, null);
    assert.deepEqual(errors, []);
    await app.close(); app = null;
    app = await electron.launch({ args: [temp], cwd: root, env });
    const restored = await app.firstWindow(); await restored.waitForSelector('#shortcutSettings');
    assert.match(await restored.locator('[data-shortcut="toggleAI"][data-kind="mouse"]').innerText(), /侧键 4/);
    const persisted = await restored.evaluate(() => window.PM.aiInfo());
    assert.equal(persisted.hasKey, keyInfo.keyPersisted); assert.equal(persisted.providerId, 'deepseek');
    console.log('PASS native workflow: Windows app-command to side-button IPC, capture/remap, persisted mapping, real preload workflow route with isolated mock provider, selected application/undo, JSON mode, encrypted configuration and restart');
  } finally {
    await app?.close();
    const relative = path.relative(os.tmpdir(), temp);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
