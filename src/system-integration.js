'use strict';
const fs = require('node:fs');
const path = require('node:path');
const R = require('./renderer/reminder-engine');

// System preferences belong to this installation, separately from project backups.
function createSystemIntegration({ app, Notification, shell, appId, readState, onOpen, onChange = () => {}, platform = process.platform }) {
  const prefsFile = path.join(app.getPath('userData'), 'system-settings.json');
  const ledgerFile = path.join(app.getPath('userData'), 'reminder-state.json');
  const taskLedgerFile = path.join(app.getPath('userData'), 'task-reminder-state.json');
  const shortcutRecovery = path.join(app.getPath('userData'), 'notification-shortcut-recovery.json');
  const read = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  const write = (file, data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2)); fs.renameSync(file + '.tmp', file);
  };
  const stored = read(prefsFile);
  let preferences = { enabled: stored.enabled === true, time: R.validTime(stored.time) ? stored.time : '09:00' };
  let lastResult = null, timer = null, startTimer = null;
  let windowsReady = false, windowsPreparing;
  const live = new Set();
  const startupSupported = platform === 'win32' || (platform === 'darwin' && app.isPackaged);
  const launch = { path: process.execPath, args: app.isPackaged ? [] : [`"${app.getAppPath()}"`] };
  function recoverShortcut(shortcut) {
    const recovery = read(shortcutRecovery);
    if (recovery.appId !== appId || !(recovery.previous === null || typeof recovery.previous === 'string')) return;
    let current; try { current = shell.readShortcutLink(shortcut); } catch {}
    if (!current || current.appUserModelId === appId) {
      if (recovery.previous !== null) fs.writeFileSync(shortcut, Buffer.from(recovery.previous, 'base64'));
      else if (fs.existsSync(shortcut)) fs.unlinkSync(shortcut);
    }
    fs.unlinkSync(shortcutRecovery);
  }
  if (platform === 'win32' && !app.isPackaged) recoverShortcut(path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Electron.lnk'));
  function startupInfo() {
    if (!startupSupported) return { supported: false, enabled: false };
    try {
      const state = app.getLoginItemSettings(platform === 'win32' ? launch : undefined);
      const own = state.launchItems?.find(item => item.name === appId && item.scope === 'user');
      return { supported: true, enabled: platform === 'win32' ? !!(state.openAtLogin && own?.enabled) : state.openAtLogin,
        blocked: !!(state.openAtLogin && (platform === 'win32' ? !own?.enabled : state.status === 'requires-approval')) };
    } catch { return { supported: false, enabled: false, error: '无法读取系统的自启动设置' }; }
  }
  function info() {
    return { desktop: true, notifications: { supported: typeof Notification?.isSupported === 'function', ...preferences, lastResult }, startup: startupInfo() };
  }
  function changed() { onChange(info()); }
  async function ensureNotificationIdentity() {
    if (platform !== 'win32') return;
    // Register our own name, activator and development arguments together.
    const programs = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    fs.mkdirSync(programs, { recursive: true });
    const shortcut = path.join(programs, app.getName() + '.lnk');
    let details = {};
    try { details = shell.readShortcutLink(shortcut); } catch {}
    if (details.appUserModelId && details.appUserModelId !== appId) throw new Error('系统通知的应用快捷方式与当前安装冲突');
    const options = { target: process.execPath, args: launch.args.join(' '), cwd: path.dirname(process.execPath),
      description: app.getName(), appUserModelId: appId };
    if (app.toastActivatorCLSID) options.toastActivatorClsid = app.toastActivatorCLSID;
    if (!shell.writeShortcutLink(shortcut, 'create', options)) throw new Error('无法建立系统通知入口，请检查开始菜单权限');
    if (windowsReady || app.isPackaged || !app.toastActivatorCLSID) return;
    if (windowsPreparing) return windowsPreparing;
    // Unpackaged Electron 44 auto-registers using the binary's product name
    // (Electron), independently of app.setName. Preserve that shared shortcut,
    // let registration create a fresh one with our own activator, then restore it.
    const runtimeShortcut = path.join(programs, 'Electron.lnk');
    if (runtimeShortcut === shortcut) return;
    recoverShortcut(runtimeShortcut);
    const preparation = (async () => {
      const previous = fs.existsSync(runtimeShortcut) ? fs.readFileSync(runtimeShortcut) : null;
      write(shortcutRecovery, { appId, previous: previous?.toString('base64') ?? null });
      if (previous) fs.unlinkSync(runtimeShortcut);
      try {
        if (!Notification.isSupported()) throw new Error('当前系统不支持桌面通知');
        const deadline = Date.now() + 8000;
        while (true) {
          let generated;
          try { generated = shell.readShortcutLink(runtimeShortcut); } catch {}
          if (generated?.appUserModelId === appId && generated.toastActivatorClsid?.toLowerCase() === app.toastActivatorCLSID.toLowerCase()) break;
          if (Date.now() >= deadline) throw new Error('系统通知入口初始化失败，请重试');
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        windowsReady = true;
      } finally {
        let generated;
        try { generated = shell.readShortcutLink(runtimeShortcut); } catch {}
        // A concurrently starting application may also update this shared file.
        // Restore only while the file still belongs to this registration.
        if (!generated || generated.appUserModelId === appId) {
          if (previous) fs.writeFileSync(runtimeShortcut, previous);
          else if (fs.existsSync(runtimeShortcut)) fs.unlinkSync(runtimeShortcut);
        }
        if (fs.existsSync(shortcutRecovery)) fs.unlinkSync(shortcutRecovery);
      }
    })();
    windowsPreparing = preparation;
    try { await preparation; } finally { windowsPreparing = null; }
  }
  async function send(payload, test = false) {
    let notification;
    try {
      await ensureNotificationIdentity();
      if (!Notification.isSupported()) throw new Error('当前系统不支持桌面通知');
      const id = test ? 'morereadytest' : payload.kind === 'task' ? 'morereadytaskreminder' : 'morereadyreminder';
      for (const old of live) { if (old.id === id) { old.close(); live.delete(old); } }
      notification = new Notification({ title: payload.title, body: payload.body,
        icon: path.join(__dirname, '..', 'assets', 'app-256.png'), silent: false,
        id, groupId: 'moreready', groupTitle: 'MoreReady' });
      live.add(notification);
      notification.on('click', () => onOpen({ taskIds: payload.taskIds || [], test }));
      notification.on('close', details => { if (details?.reason !== 'timedOut') live.delete(notification); });
      const result = await new Promise(resolve => {
        let finished = false;
        const finish = result => { if (finished) return; finished = true; clearTimeout(timeout); resolve(result); };
        const timeout = setTimeout(() => finish({ ok: false, error: '系统未确认通知已显示，请检查系统通知权限或勿扰模式' }), 8000);
        notification.once('show', () => finish({ ok: true }));
        notification.once('failed', (_event, error) => { live.delete(notification); finish({ ok: false, error: '通知发送失败，请检查系统通知设置', detail: String(error || '') }); });
        try { notification.show(); } catch (error) { live.delete(notification); finish({ ok: false, error: error.message }); }
      });
      lastResult = { ...result, at: Date.now() }; changed(); return result;
    } catch (error) {
      if (notification) live.delete(notification);
      lastResult = { ok: false, error: error.message, at: Date.now() }; changed(); return lastResult;
    }
  }
  const scheduler = R.createScheduler({ readState, readPreferences: () => preferences, readLedger: () => read(ledgerFile),
    writeLedger: ledger => write(ledgerFile, ledger), send, onError: error => { lastResult = { ok: false, error, at: Date.now() }; changed(); } });
  const taskScheduler = R.createTaskScheduler({ readState, readPreferences: () => preferences, readLedger: () => read(taskLedgerFile),
    writeLedger: ledger => write(taskLedgerFile, ledger), send, onError: error => { lastResult = { ok: false, error, at: Date.now() }; changed(); } });
  let checking = false;
  async function check() {
    if (checking) return { skipped: true };
    checking = true;
    try {
      const taskResult = await taskScheduler.check(), dailyResult = await scheduler.check();
      return taskResult.skipped ? dailyResult : taskResult;
    } finally { checking = false; }
  }
  return {
    info,
    configure(patch) {
      if (!patch || (patch.enabled !== undefined && typeof patch.enabled !== 'boolean') || (patch.time !== undefined && !R.validTime(patch.time))) throw new Error('请填写有效的提醒设置');
      const next = { ...preferences, ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}), ...(patch.time !== undefined ? { time: patch.time } : {}) };
      write(prefsFile, next); preferences = next; lastResult = null; changed();
      setTimeout(check, 500); return info();
    },
    setStartup(enabled) {
      if (!startupSupported || typeof enabled !== 'boolean') throw new Error('开机自启动需要使用桌面版');
      app.setLoginItemSettings({ ...(platform === 'win32' ? { ...launch, name: appId, enabled } : {}), openAtLogin: enabled });
      const state = startupInfo();
      if (state.enabled !== enabled) throw new Error('系统未应用自启动设置，请检查系统启动应用列表');
      changed(); return info();
    },
    test: () => send({ title: 'MoreReady · 测试通知', body: '系统通知已接通。到期与逾期任务会按设定时间提醒。', taskIds: [] }, true),
    check,
    start() { startTimer = setTimeout(check, 3000); timer = setInterval(check, 60000); },
    stop() { clearTimeout(startTimer); clearInterval(timer); live.forEach(n => n.close()); live.clear(); },
  };
}
module.exports = { createSystemIntegration };
