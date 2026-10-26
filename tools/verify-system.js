'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium, _electron: electron } = require('playwright');
const { createPreviewServer } = require('./web-preview');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'shots');
const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'moreready system test '));
fs.mkdirSync(OUT, { recursive: true });
const day = offset => { const date = new Date(); date.setDate(date.getDate() + offset); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const fixture = { schema: 6, projects: [{ id: 'p', name: '通知验证项目', color: '#5b8cff' }, { id: 'archived', name: '已归档项目', archived: true }],
  tasks: [
    { id: 'late', title: '需要处理的逾期任务', status: 'doing', priority: 'p1', due: day(-1), projectId: 'p' },
    { id: 'today', title: '今天到期的任务', status: 'todo', priority: 'p2', due: day(0), projectId: 'p' },
    { id: 'done', title: '完成的任务不提醒', status: 'done', priority: 'p1', due: day(-1), projectId: 'p' },
    { id: 'hidden', title: '归档的项目不提醒', status: 'todo', priority: 'p1', due: day(-1), projectId: 'archived' },
  ], settings: { theme: 'daylight', accent: '#0679cd', rememberLast: true }, activeModule: 'settings',
  activeProjectId: 'all', tags: [], activity: [], trash: [], projectGroups: [] };
const waitIdle = page => page.waitForFunction(() => !document.querySelector('[data-system-action="test"]').disabled);
async function web() {
  const server = createPreviewServer(path.join(ROOT, 'src/renderer'));
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(data => {
      if (!localStorage.getItem('projectdesk.store.v1')) localStorage.setItem('projectdesk.store.v1', JSON.stringify(data));
      window.testNotices = []; window.testPermission = 'default'; window.requestedPermission = 'default'; window.permissionRequests = 0;
      window.failNotice = false;
      class TestNotification {
        static get permission() { return window.testPermission; }
        static async requestPermission() { window.permissionRequests++; return window.testPermission = window.requestedPermission; }
        constructor(title, options) { this.title = title; this.body = options.body; this.tag = options.tag; window.testNotices.push(this);
          setTimeout(() => window.failNotice ? this.onerror?.() : this.onshow?.(), 30); }
        close() { this.onclose?.(); }
      }
      window.Notification = TestNotification;
    }, fixture);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base); await page.waitForSelector('#systemSettings');
    const toggle = page.locator('[data-system-action="notifications"]');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('[data-system-action="startup"]').isDisabled(), true);
    assert.match(await page.locator('#systemSettings').innerText(), /桌面版/);
    assert.equal(await page.evaluate(() => permissionRequests), 0, 'no permission prompt at startup');
    await toggle.click(); await waitIdle(page);
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => testNotices.length), 0);
    await page.evaluate(() => { testPermission = 'denied'; });
    await toggle.click(); await waitIdle(page);
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => permissionRequests), 1, 'denied permissions must not be requested repeatedly');
    await page.evaluate(() => { testPermission = 'default'; requestedPermission = 'granted'; });
    await page.fill('#notificationTime', '23:59'); await page.locator('#notificationTime').press('Tab'); await waitIdle(page);
    await page.click('[data-system-action="test"]'); await waitIdle(page);
    assert.equal(await page.evaluate(() => testNotices.length), 1);
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false', 'test notification leaves daily reminders off');
    await toggle.click(); await waitIdle(page);
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.rail-notifications, .notification-dot').count(), 0);
    assert.equal(await page.evaluate(() => window.PMSystemSettings.state().notifications.enabled), true);
    await page.fill('#notificationTime', '00:00'); await page.locator('#notificationTime').press('Tab'); await waitIdle(page);
    await page.waitForFunction(() => testNotices.some(n => n.tag === 'moreready-reminder'));
    const summary = await page.evaluate(() => testNotices.find(n => n.tag === 'moreready-reminder').body);
    assert.match(summary, /已逾期 1 项 · 今日到期 1 项/); assert.doesNotMatch(summary, /完成的任务|归档的项目/);
    await page.waitForTimeout(3500);
    assert.equal(await page.evaluate(() => testNotices.filter(n => n.tag === 'moreready-reminder').length), 1);
    const second = await context.newPage(); await second.goto(base); await second.waitForSelector('#systemSettings');
    await second.waitForTimeout(3200);
    assert.equal(await second.evaluate(() => testNotices.length), 0, 'same origin second tab must not duplicate reminders');
    await page.evaluate(() => testNotices.find(n => n.tag === 'moreready-reminder').onclick());
    await page.waitForSelector('#f-title'); assert.equal(await page.inputValue('#f-title'), '需要处理的逾期任务');
    await page.fill('#f-title', '编辑中的通知草稿');
    await page.evaluate(() => testNotices.find(n => n.tag === 'moreready-reminder').onclick());
    assert.equal(await page.inputValue('#f-title'), '编辑中的通知草稿');
    await page.click('[data-action="sheet-cancel"]');
    await second.close();
    const openLate = () => page.evaluate(() => testNotices.find(n => n.tag === 'moreready-reminder').onclick());
    const reminder = value => page.click('[data-drop="task-reminder"]').then(() => page.click(`.drop-item[data-drop-action="task-reminder"][data-value="${value}"]`));
    await openLate(); await page.waitForSelector('#f-reminder');
    assert.equal(await page.locator('#f-status, [data-drop="task-status"]').count(), 0);
    assert.deepEqual(await page.locator('.task-meta label').allTextContents(), ['所属项目', '截止日期', '优先级', '提醒']);
    assert.equal(await page.locator('#f-reminder').getAttribute('data-value'), 'none');
    await reminder('custom'); assert.equal(await page.locator('#f-reminder-at').isVisible(), true);
    await page.click('[data-action="save-task"]');
    assert.equal(await page.locator('#taskDrawerMask').isVisible(), true, 'an empty custom reminder must block saving');
    assert.deepEqual(await page.evaluate(() => window.PMStore.state.tasks.find(t => t.id === 'late').reminder), { mode: 'none', at: '' });
    const future = day(2) + 'T11:45';
    await page.fill('#f-reminder-at', future);
    await page.click('[data-drop="task-priority"]'); await page.click('.drop-item[data-drop-action="task-priority"][data-value="p0"]');
    await page.screenshot({ path: path.join(OUT, 'task-reminder-custom-web.png') });
    await page.keyboard.press('Control+Enter');
    await page.waitForSelector('#taskDrawerMask', { state: 'hidden' });
    let stored = await page.evaluate(() => window.PMStore.state.tasks.find(t => t.id === 'late'));
    assert.equal(stored.status, 'doing'); assert.equal(stored.priority, 'p0'); assert.equal(stored.due, day(-1));
    assert.deepEqual(stored.reminder, { mode: 'custom', at: future });
    await openLate(); assert.equal(await page.inputValue('#f-reminder-at'), future);
    await reminder('none'); assert.equal(await page.locator('#f-reminder-custom').isHidden(), true);
    await page.click('[data-action="sheet-cancel"]');
    assert.deepEqual(await page.evaluate(() => window.PMStore.state.tasks.find(t => t.id === 'late').reminder), { mode: 'custom', at: future }, 'cancel does not disable a stored reminder');
    await openLate(); await reminder('before-1d'); await page.fill('#f-due', '');
    await page.click('[data-action="save-task"]'); assert.equal(await page.locator('#taskDrawerMask').isVisible(), true);
    await page.fill('#f-due', day(2)); await page.click('[data-action="save-task"]');
    await page.waitForSelector('#taskDrawerMask', { state: 'hidden' });
    await openLate(); assert.equal(await page.locator('#f-reminder').getAttribute('data-value'), 'before-1d');
    assert.match(await page.locator('#f-reminder-hint').innerText(), new RegExp(day(1)));
    await reminder('custom'); await page.fill('#f-reminder-at', day(0) + 'T00:00');
    await page.click('[data-action="save-task"]');
    await page.waitForFunction(() => testNotices.some(n => n.tag === 'moreready-task-reminder'));
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('moreready.task-reminder-state.v1') || '{}').delivered?.length === 1);
    const taskNotice = await page.evaluate(() => testNotices.find(n => n.tag === 'moreready-task-reminder').body);
    assert.match(taskNotice, /1 项任务到了提醒时间/); assert.match(taskNotice, /需要处理的逾期任务/);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('moreready.task-reminder-state.v1')).delivered.length), 1);
    await page.evaluate(() => testNotices.find(n => n.tag === 'moreready-task-reminder').onclick());
    await page.waitForSelector('#f-title'); assert.equal(await page.inputValue('#f-title'), '需要处理的逾期任务');
    assert.equal(await page.evaluate(() => window.PMStore.state.tasks.find(t => t.id === 'late').status), 'doing');
    await page.click('[data-action="sheet-cancel"]');
    const other = await context.newPage(); await other.goto(base); await other.waitForSelector('#systemSettings');
    await other.waitForTimeout(3200); assert.equal(await other.evaluate(() => testNotices.length), 0, 'a second tab must not duplicate task reminders');
    await other.close();
    await page.click('[data-nav="settings"]');
    await page.locator('#systemSettings').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('#systemSettings').isVisible());
    assert.ok(await page.evaluate(() => {
      const section = document.getElementById('systemSettings').getBoundingClientRect(), body = document.getElementById('panelBody').getBoundingClientRect();
      return section.top >= body.top && section.bottom <= body.bottom;
    }), 'notification settings should remain accessible after removing the sidebar shortcut');
    await page.reload(); await page.waitForSelector('#systemSettings');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true'); assert.equal(await page.inputValue('#notificationTime'), '00:00');
    await page.waitForTimeout(3200); assert.equal(await page.evaluate(() => testNotices.length), 0);
    await page.evaluate(() => { testPermission = 'granted'; failNotice = true; });
    await page.click('[data-system-action="test"]'); await waitIdle(page);
    assert.match(await page.locator('#systemSettings').innerText(), /通知发送失败/);
    await toggle.click(); await waitIdle(page); assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    await page.evaluate(() => { window.PMStore.state.settings.theme = 'aurora'; window.PMStore.save(); });
    await page.reload(); await page.waitForSelector('#systemSettings');
    await page.setViewportSize({ width: 960, height: 680 });
    await page.locator('[data-system-action="startup"]').scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth));
    await page.screenshot({ path: path.join(OUT, 'system-settings-web-dark.png') });
    assert.deepEqual(errors, []);
    console.log('PASS web system settings: permission denial/grant, task reminder fields and validation, status preservation, cancel/save/reopen, custom and relative schedules, task/daily reload and multi-tab deduplication, click/draft preservation, disabled startup, narrow dark layout');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
async function desktop() {
  if (process.platform !== 'win32') { console.log('SKIP native Windows startup/notifications on this platform'); return; }
  const data = path.join(TEMP, 'data'), appId = `MoreReady-System-Test-${Date.now()}`;
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, 'store.json'), JSON.stringify(fixture));
  fs.writeFileSync(path.join(TEMP, 'package.json'), JSON.stringify({ name: appId, version: '0.2.0', main: 'main.js' }));
  fs.writeFileSync(path.join(TEMP, 'main.js'), `const app = require('electron').app; app.setName(${JSON.stringify(appId)}); app.setPath('userData', ${JSON.stringify(data)}); require(${JSON.stringify(path.join(ROOT, 'src/main.js'))});`);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  let app, shortcut, clsid; const errors = [];
  const genericShortcut = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Electron.lnk');
  const genericBefore = fs.existsSync(genericShortcut) ? fs.readFileSync(genericShortcut) : null;
  const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  try {
    app = await electron.launch({ args: [TEMP], cwd: ROOT, env });
    const page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('#systemSettings'); await waitIdle(page);
    assert.equal(await page.locator('[data-system-action="notifications"]').getAttribute('aria-pressed'), 'false');
    const toggle = page.locator('[data-system-action="startup"]'); assert.equal(await toggle.isEnabled(), true);
    await toggle.click(); await waitIdle(page);
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    const registered = execFileSync('reg.exe', ['query', runKey, '/v', appId], { encoding: 'utf8', windowsHide: true });
    assert.ok(registered.includes(TEMP), 'startup registry must include the app argument including its space');
    await page.reload(); await page.waitForSelector('#systemSettings');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true', 'startup state is read from the OS');
    await page.click('[data-system-action="test"]'); await waitIdle(page);
    const nativeInfo = await page.evaluate(() => window.PM.systemInfo());
    console.log('Native notification delivery:', JSON.stringify(nativeInfo.notifications.lastResult));
    assert.equal(nativeInfo.notifications.lastResult?.ok, true, 'Windows must confirm the real notification');
    assert.equal(nativeInfo.notifications.enabled, false);
    const details = await app.evaluate(({ app, shell }) => {
      const shortcut = app.getPath('appData') + '\\Microsoft\\Windows\\Start Menu\\Programs\\' + app.getName() + '.lnk';
      return { shortcut, details: shell.readShortcutLink(shortcut) };
    });
    shortcut = details.shortcut; clsid = details.details.toastActivatorClsid;
    assert.equal(details.details.appUserModelId, appId); assert.ok(details.details.args.includes(TEMP));
    assert.match(clsid, /^\{[\da-f-]{36}\}$/i, 'private shortcut must have a toast activator');
    assert.equal(await app.evaluate(({ app }) => app.toastActivatorCLSID.toLowerCase()), clsid.toLowerCase());
    assert.deepEqual(fs.existsSync(genericShortcut) ? fs.readFileSync(genericShortcut) : null, genericBefore, 'notification setup must preserve any existing Electron shortcut');
    await page.fill('#notificationTime', '00:00'); await page.locator('#notificationTime').press('Tab'); await waitIdle(page);
    await page.click('[data-system-action="notifications"]'); await waitIdle(page);
    await page.waitForFunction(() => window.PMSystemSettings.state().notifications.lastResult?.ok === true);
    await page.waitForTimeout(300);
    const ledger = JSON.parse(fs.readFileSync(path.join(data, 'reminder-state.json'), 'utf8')); assert.equal(ledger.lastDay, day(0));
    await page.evaluate(() => window.PM.setCloseToTray(true));
    await page.evaluate(() => window.PM.close());
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
    // The per-task scheduler must run in the background process while the window is hidden.
    await page.evaluate(at => window.PMStore.updateTask('today', { reminder: { mode: 'custom', at } }), day(0) + 'T00:00');
    const taskLedgerFile = path.join(data, 'task-reminder-state.json'), deadline = Date.now() + 12000;
    while (!fs.existsSync(taskLedgerFile) && Date.now() < deadline) await page.waitForTimeout(100);
    assert.equal(fs.existsSync(taskLedgerFile), true, 'Windows must confirm and record the real task reminder');
    const taskLedger = JSON.parse(fs.readFileSync(taskLedgerFile, 'utf8'));
    assert.deepEqual(taskLedger.delivered.map(item => item.taskId), ['today']);
    assert.equal((await page.evaluate(() => window.PM.systemInfo())).notifications.lastResult?.ok, true);
    await page.evaluate(() => window.PMStore.save()); await page.waitForTimeout(300);
    assert.deepEqual(JSON.parse(fs.readFileSync(taskLedgerFile, 'utf8')), taskLedger, 'saving again must not repeat a native task reminder');
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.show(); win.webContents.send('system:notificationOpen', { taskIds: ['late'] }); });
    await page.waitForSelector('#f-title'); assert.equal(await page.inputValue('#f-title'), '需要处理的逾期任务');
    await page.fill('#f-title', '桌面提醒保留草稿');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('system:notificationOpen', { taskIds: ['today'] }));
    assert.equal(await page.inputValue('#f-title'), '桌面提醒保留草稿');
    await page.click('[data-action="sheet-cancel"]'); await page.click('[data-nav="settings"]');
    await page.locator('#systemSettings').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, 'system-settings-desktop.png') });
    await page.click('[data-system-action="notifications"]'); await waitIdle(page);
    await toggle.click(); await waitIdle(page); assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    assert.throws(() => execFileSync('reg.exe', ['query', runKey, '/v', appId], { encoding: 'utf8', windowsHide: true, stdio: 'pipe' }));
    assert.deepEqual(errors, []);
    console.log('PASS Windows integration: isolated real startup registration/removal, OS state after reload, native notification show event, task/daily background reminders and delivery ledgers, notification routing and draft preservation');
  } catch (error) {
    console.error('Native verification failure:', error.message); throw error;
  } finally {
    if (app) {
      try {
        const remaining = await app.evaluate(({ app, shell }) => {
          const shortcut = app.getPath('appData') + '\\Microsoft\\Windows\\Start Menu\\Programs\\' + app.getName() + '.lnk';
          let clsid; try { clsid = shell.readShortcutLink(shortcut).toastActivatorClsid; } catch {}
          return { shortcut, clsid };
        });
        shortcut ||= remaining.shortcut; clsid ||= remaining.clsid;
      } catch {}
      try { await app.evaluate(({ app }) => app.setLoginItemSettings({ openAtLogin: false, enabled: false, name: app.getName(), path: process.execPath, args: [`"${app.getAppPath()}"`] })); } catch {}
      await app.close();
    }
    // Remove only the uniquely named test entry/shortcut, never production settings.
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Remove-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name '${appId}' -ErrorAction SilentlyContinue; Remove-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run' -Name '${appId}' -ErrorAction SilentlyContinue; exit 0`], { windowsHide: true, stdio: 'pipe' });
    const expectedShortcut = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', appId + '.lnk');
    if (shortcut === expectedShortcut && fs.existsSync(shortcut)) fs.unlinkSync(shortcut);
    // Toast COM registration is unique to this app ID; clean the generated test activator too.
    if (clsid && /^\{[\da-f-]{36}\}$/i.test(clsid)) { try { execFileSync('reg.exe', ['delete', `HKCU\\Software\\Classes\\CLSID\\${clsid}`, '/f'], { windowsHide: true, stdio: 'pipe' }); } catch {} }
  }
}
(async () => { if (!process.argv.includes('--desktop-only')) await web(); await desktop(); })().catch(error => { console.error(error); process.exitCode = 1; });
