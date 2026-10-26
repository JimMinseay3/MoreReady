'use strict';
const { app, BrowserWindow, ipcMain, screen, shell, dialog, Tray, Menu, nativeImage, nativeTheme, globalShortcut, safeStorage, Notification, powerMonitor } = require('electron');
const fs = require('fs');
const path = require('path');
const { DEFAULT_SIZE, MIN_SIZE, restoreBounds } = require('./desktop-window');
const { createAIService } = require('./ai-service');
const { createSystemIntegration } = require('./system-integration');
const { createUpdateService, resolveUserDataPath } = require('./update-service');
const releaseSource = require('./renderer/release-config');
// Keep the existing data path while giving Windows notifications a stable app identity.
const existingUserData = resolveUserDataPath({ currentPath: app.getPath('userData'), appDataPath: app.getPath('appData'), name: app.getName() });
if (app.getName() === 'moreready-widget') app.setName('MoreReady');
app.setPath('userData', existingUserData);
const systemAppId = app.getName() === 'MoreReady' ? 'com.moreready.desktop' : app.getName();
if (process.platform === 'win32') {
  app.setAppUserModelId(systemAppId);
  const hash = require('node:crypto').createHash('sha256').update('moreready-toast:' + systemAppId).digest('hex').slice(0, 32);
  app.setToastActivatorCLSID(`{${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}}`);
}
let systemIntegration;
ipcMain.handle('system:info', () => systemIntegration.info());
ipcMain.handle('system:notifications', (_event, patch) => systemIntegration.configure(patch));
ipcMain.handle('system:testNotification', () => systemIntegration.test());
ipcMain.handle('system:startup', (_event, enabled) => systemIntegration.setStartup(enabled));
let aiService;
const aiRequests = new Map();
function getAIService() {
  return aiService ||= createAIService({ configFile: path.join(app.getPath('userData'), 'ai-config.json'),
    secretStorage: { available: () => safeStorage.isEncryptionAvailable(), encrypt: value => safeStorage.encryptString(value).toString('base64'), decrypt: value => safeStorage.decryptString(Buffer.from(value, 'base64')) } });
}
ipcMain.handle('ai:info', () => getAIService().info());
ipcMain.handle('ai:save', (_event, config) => getAIService().save(config));
ipcMain.handle('ai:clear', () => getAIService().clear());
ipcMain.handle('ai:chat', async (_event, { id, messages }) => {
  if (aiRequests.size) throw new Error('请等待当前请求完成');
  const controller = new AbortController(); aiRequests.set(id, controller);
  try { return await getAIService().chat(messages, { signal: controller.signal }); }
  finally { aiRequests.delete(id); }
});
ipcMain.handle('ai:cancel', (_event, id) => { aiRequests.get(id)?.abort(); return true; });
ipcMain.handle('ai:workflow', async (_event, { id, ...request }) => {
  if (aiRequests.size) throw new Error('请等待当前请求完成');
  const controller = new AbortController(); aiRequests.set(id, controller);
  try { return await getAIService().workflow(request, { signal: controller.signal }); }
  finally { aiRequests.delete(id); }
});

// Retain the existing application identity and user data during the migration.
const storeFile = () => path.join(app.getPath('userData'), 'store.json');
const windowFile = () => path.join(app.getPath('userData'), 'window-state.json');
const readJSON = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(file + '.tmp', file);
}
let win = null, tray = null, quitting = false;
let updates;
function getUpdates() {
  return updates ||= createUpdateService({ app, getUpdater: () => require('electron-updater').autoUpdater,
    onChange: state => { if (win && !win.isDestroyed()) win.webContents.send('update:changed', state); },
    beforeInstall: () => { saveWindow(); quitting = true; }, installFailed: () => { quitting = false; },
  });
}
ipcMain.handle('update:info', () => getUpdates().info());
ipcMain.handle('update:check', () => getUpdates().check());
ipcMain.handle('update:download', () => getUpdates().download());
ipcMain.handle('update:install', () => getUpdates().install());
ipcMain.handle('update:openRelease', () => shell.openExternal(releaseSource.releaseUrl));
let closeToTray = false, alwaysOnTop = false, windowTimer = null;
const ownsLock = app.requestSingleInstanceLock();
if (!ownsLock) app.quit();
else app.on('second-instance', () => showWindow());
function saveWindow() {
  if (!win || win.isDestroyed()) return;
  writeJSON(windowFile(), { bounds: win.getNormalBounds(), maximized: win.isMaximized() });
}
function pushWindowState() {
  if (win && !win.isDestroyed()) win.webContents.send('window:changed', { maximized: win.isMaximized() });
}
function createWindow() {
  const saved = readJSON(windowFile());
  const validBounds = saved?.bounds && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(saved.bounds[key]));
  const area = validBounds ? screen.getDisplayMatching(saved.bounds).workArea : screen.getPrimaryDisplay().workArea;
  const settings = readJSON(storeFile())?.settings;
  alwaysOnTop = settings?.desktopMigrated === true && settings.alwaysOnTop === true;
  closeToTray = settings?.desktopMigrated === true && settings.closeToTray === true;
  win = new BrowserWindow({
    ...restoreBounds(saved?.bounds, area),
    minWidth: Math.min(MIN_SIZE.width, area.width), minHeight: Math.min(MIN_SIZE.height, area.height),
    frame: false, transparent: false, resizable: true, maximizable: true, fullscreenable: true,
    hasShadow: true, show: false, backgroundColor: '#101728', alwaysOnTop,
    title: 'MoreReady', icon: path.join(__dirname, '..', 'assets', 'app-256.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true,
      nodeIntegration: false, sandbox: false, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  win.on('app-command', (_event, command) => {
    const button = command === 'browser-backward' ? 3 : command === 'browser-forward' ? 4 : null;
    if (button !== null && win.isFocused()) win.webContents.send('input:mouseSide', button);
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (saved?.maximized) win.maximize(); win.show(); });
  const queueSave = () => { clearTimeout(windowTimer); windowTimer = setTimeout(saveWindow, 250); };
  win.on('resize', queueSave); win.on('move', queueSave);
  for (const event of ['maximize', 'unmaximize']) win.on(event, () => { pushWindowState(); queueSave(); });
  win.on('close', (event) => {
    saveWindow();
    if (closeToTray && !quitting) { event.preventDefault(); win.hide(); refreshTray(); }
  });
  win.on('closed', () => { clearTimeout(windowTimer); win = null; });
  win.on('show', refreshTray); win.on('hide', refreshTray);
  if (process.env.PM_WIDGET_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' });
}
function showWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus(); refreshTray();
}
function toggleWindow() { if (win?.isVisible() && !win.isMinimized()) win.hide(); else showWindow(); }
function quitApp() { quitting = true; app.quit(); }
function setTop(flag) {
  alwaysOnTop = !!flag;
  if (win && !win.isDestroyed()) {
    win.setAlwaysOnTop(alwaysOnTop);
    win.webContents.send('settings:pushed', { alwaysOnTop });
  }
  refreshTray(); return alwaysOnTop;
}
function refreshTray() {
  if (!tray) return;
  tray.setToolTip('MoreReady');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: win?.isVisible() ? '隐藏窗口' : '打开 MoreReady', click: toggleWindow },
    { label: '窗口置顶', type: 'checkbox', checked: alwaysOnTop, click: (item) => setTop(item.checked) },
    { type: 'separator' },
    { label: '数据文件位置', click: () => shell.showItemInFolder(storeFile()) },
    { label: '退出 MoreReady', click: quitApp },
  ]));
}
ipcMain.handle('win:minimize', () => win?.minimize());
ipcMain.handle('win:toggleMaximize', () => {
  if (!win || win.isDestroyed()) return false;
  if (win.isMaximized()) win.unmaximize(); else win.maximize();
  return win.isMaximized();
});
ipcMain.handle('win:getState', () => ({ maximized: !!win?.isMaximized() }));
ipcMain.handle('win:hideToTray', () => { win?.hide(); refreshTray(); });
ipcMain.handle('win:setCloseToTray', (_event, flag) => (closeToTray = flag === true));
ipcMain.handle('win:close', () => win?.close());
ipcMain.handle('win:quit', quitApp);
ipcMain.handle('win:setAlwaysOnTop', (_event, flag) => setTop(flag));
ipcMain.handle('win:getAlwaysOnTop', () => alwaysOnTop);
ipcMain.handle('theme:get', () => ({ system: nativeTheme.shouldUseDarkColors ? 'dark' : 'light' }));
ipcMain.handle('store:read', () => readJSON(storeFile()));
ipcMain.handle('store:write', (_event, data) => {
  const previous = readJSON(storeFile());
  const backup = path.join(app.getPath('userData'), 'store.before-desktop.json');
  if (previous && previous.schema < 5 && data.schema >= 5 && !fs.existsSync(backup)) fs.copyFileSync(storeFile(), backup);
  writeJSON(storeFile(), data);
  systemIntegration?.check(); return true;
});
ipcMain.handle('app:info', () => ({ version: app.getVersion(), storePath: storeFile(),
  defaultSize: DEFAULT_SIZE, platform: process.platform, mode: 'desktop' }));
ipcMain.handle('store:export', async (_event, json) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '导出数据', defaultPath: `moreready-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return false;
  fs.writeFileSync(filePath, json, 'utf8'); return true;
});
ipcMain.handle('shell:openStore', () => shell.showItemInFolder(storeFile()));
if (ownsLock) app.whenReady().then(() => {
  systemIntegration = createSystemIntegration({ app, Notification, shell, appId: systemAppId,
    readState: () => readJSON(storeFile()),
    onOpen: payload => { showWindow(); if (win && !win.isDestroyed()) win.webContents.send('system:notificationOpen', payload); },
    onChange: state => { if (win && !win.isDestroyed()) win.webContents.send('system:changed', state); },
  });
  createWindow();
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray-32.png')));
  tray.on('click', showWindow); tray.on('double-click', showWindow); refreshTray();
  globalShortcut.register('CommandOrControl+Shift+Space', toggleWindow);
  systemIntegration.start();
  powerMonitor.on('resume', () => systemIntegration.check());
  nativeTheme.on('updated', () => {
    if (win && !win.isDestroyed()) win.webContents.send('theme:changed', { system: nativeTheme.shouldUseDarkColors ? 'dark' : 'light' });
  });
});
app.on('window-all-closed', () => { if (!closeToTray && process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { quitting = true; saveWindow(); });
app.on('will-quit', () => { systemIntegration?.stop(); globalShortcut.unregisterAll(); if (tray) { tray.destroy(); tray = null; } });
app.on('activate', () => { if (!win && ownsLock) createWindow(); else showWindow(); });
