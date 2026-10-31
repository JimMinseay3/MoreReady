'use strict';
const source = require('./renderer/release-config');

async function configureUpdateProxy(session, proxy = process.env.MOREREADY_UPDATE_PROXY) {
  if (!session) return;
  const config = proxy ? { mode: 'fixed_servers', proxyRules: proxy } : { mode: 'system' };
  await session.setProxy(config);
  // Drop only the updater partition's pooled connections after changing/reloading its route.
  await session.closeAllConnections();
}

function resolveUserDataPath({ currentPath, appDataPath, name }, path = require('node:path')) {
  const normal = value => path.resolve(value).toLowerCase();
  // Packaged branding must not give an existing workspace a new, empty data directory.
  if (['moreready-widget', 'MoreReady'].includes(name) && normal(currentPath) === normal(path.join(appDataPath, name))) {
    return path.join(appDataPath, 'moreready-widget');
  }
  return currentPath; // Includes explicitly isolated test profiles.
}

function createUpdateService({ app, getUpdater, onChange = () => {}, beforeInstall = () => {}, installFailed = () => {}, platform = process.platform }) {
  const supported = app.isPackaged === true && platform === 'win32';
  let state = { status: supported ? 'idle' : 'unavailable', supported,
    currentVersion: app.getVersion(), version: '', percent: 0, releaseUrl: source.releaseUrl, retry: 'check' };
  let updater, pending;
  const info = () => ({ ...state });
  const set = patch => { state = { ...state, ...patch }; onChange(info()); return info(); };
  function prepare() {
    if (updater) return updater;
    updater = getUpdater();
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    // The packaged app-update.yml is generated from the shared GitHub publish configuration.
    updater.on('checking-for-update', () => set({ status: 'checking', retry: 'check' }));
    updater.on('update-available', result => set({ status: 'available', version: result.version, percent: 0, retry: 'download' }));
    updater.on('update-not-available', () => set({ status: 'current', version: '', retry: 'check' }));
    updater.on('download-progress', progress => set({ status: 'downloading', percent: Math.max(0, Math.min(100, Math.round(Number(progress.percent) || 0))) }));
    updater.on('update-downloaded', result => set({ status: 'downloaded', version: result.version, percent: 100 }));
    updater.on('error', () => set({ status: 'error' }));
    return updater;
  }
  function run(operation) {
    if (pending) return pending;
    pending = Promise.resolve().then(operation).catch(() => set({ status: 'error' })).finally(() => { pending = null; });
    return pending;
  }
  return {
    info,
    check() {
      if (!supported || ['downloading', 'downloaded', 'installing'].includes(state.status)) return Promise.resolve(info());
      return run(async () => { set({ status: 'checking', retry: 'check' }); const client = prepare(); if (client.netSession) await configureUpdateProxy(client.netSession); await client.checkForUpdates(); return info(); });
    },
    download() {
      if (!supported || !state.version || !['available', 'error', 'downloading'].includes(state.status)) return Promise.resolve(info());
      return run(async () => { set({ status: 'downloading', percent: 0, retry: 'download' }); const client = prepare(); if (client.netSession) await configureUpdateProxy(client.netSession); await client.downloadUpdate(); return info(); });
    },
    install() {
      if (!supported || state.status !== 'downloaded') return info();
      try {
        beforeInstall(); set({ status: 'installing' });
        prepare().quitAndInstall(false, true);
      } catch { installFailed(); set({ status: 'error', retry: 'download' }); }
      return info();
    },
  };
}
module.exports = { createUpdateService, resolveUserDataPath, configureUpdateProxy };
