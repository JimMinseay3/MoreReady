'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('PM', {
  isElectron: true,
  updateInfo: () => ipcRenderer.invoke('update:info'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openRelease: () => ipcRenderer.invoke('update:openRelease'),
  onUpdateState: callback => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('update:changed', handler);
    return () => ipcRenderer.removeListener('update:changed', handler);
  },
  onMouseSideButton: cb => {
    const handler = (_event, button) => cb(button);
    ipcRenderer.on('input:mouseSide', handler);
    return () => ipcRenderer.removeListener('input:mouseSide', handler);
  },
  aiInfo: () => ipcRenderer.invoke('ai:info'),
  aiSave: config => ipcRenderer.invoke('ai:save', config),
  aiClear: () => ipcRenderer.invoke('ai:clear'),
  aiChat: request => ipcRenderer.invoke('ai:chat', request),
  aiWorkflow: request => ipcRenderer.invoke('ai:workflow', request),
  aiCancel: id => ipcRenderer.invoke('ai:cancel', id),

  /* 本机系统通知与启动 */
  systemInfo: () => ipcRenderer.invoke('system:info'),
  setNotifications: patch => ipcRenderer.invoke('system:notifications', patch),
  testNotification: () => ipcRenderer.invoke('system:testNotification'),
  setAutoStart: enabled => ipcRenderer.invoke('system:startup', enabled),
  onSystemSettingsChange: cb => {
    const handler = (_event, state) => cb(state);
    ipcRenderer.on('system:changed', handler);
    return () => ipcRenderer.removeListener('system:changed', handler);
  },
  onNotificationOpen: cb => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('system:notificationOpen', handler);
    return () => ipcRenderer.removeListener('system:notificationOpen', handler);
  },

  /* 窗口 */
  toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
  getWindowState: () => ipcRenderer.invoke('win:getState'),
  onWindowStateChange: (cb) => {
    const handler = (_event, state) => cb(state);
    ipcRenderer.on('window:changed', handler);
    return () => ipcRenderer.removeListener('window:changed', handler);
  },
  minimize: () => ipcRenderer.invoke('win:minimize'),
  hideToTray: () => ipcRenderer.invoke('win:hideToTray'),
  setCloseToTray: (flag) => ipcRenderer.invoke('win:setCloseToTray', flag),
  close: () => ipcRenderer.invoke('win:close'),      // Electron 侧会改成「收进托盘」
  quit: () => ipcRenderer.invoke('win:quit'),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('win:setAlwaysOnTop', flag),
  getAlwaysOnTop: () => ipcRenderer.invoke('win:getAlwaysOnTop'),

  /* 系统主题 */
  getSystemTheme: () => ipcRenderer.invoke('theme:get'),
  onSystemThemeChange: (cb) => {
    const h = (_e, payload) => cb(payload);
    ipcRenderer.on('theme:changed', h);
    return () => ipcRenderer.removeListener('theme:changed', h);
  },

  /* 托盘等外部改动回推 */
  onSettingsPushed: (cb) => {
    const h = (_e, payload) => cb(payload);
    ipcRenderer.on('settings:pushed', h);
    return () => ipcRenderer.removeListener('settings:pushed', h);
  },

  /* 数据 */
  readStore: () => ipcRenderer.invoke('store:read'),
  writeStore: (data) => ipcRenderer.invoke('store:write', data),
  exportJson: (json) => ipcRenderer.invoke('store:export', json),
  openStoreFolder: () => ipcRenderer.invoke('shell:openStore'),
  info: () => ipcRenderer.invoke('app:info'),
});
