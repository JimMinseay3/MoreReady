'use strict';
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { createUpdateService, resolveUserDataPath, configureUpdateProxy } = require('../src/update-service');

(async () => {
  const proxyCalls = [];
  const session = { setProxy: async config => proxyCalls.push(config), closeAllConnections: async () => proxyCalls.push('close') };
  await configureUpdateProxy(session, '');
  await configureUpdateProxy(session, 'http://127.0.0.1:7897');
  assert.deepEqual(proxyCalls, [{ mode: 'system' }, 'close', { mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:7897' }, 'close']);
  await assert.rejects(configureUpdateProxy({ setProxy: async () => { throw new Error('proxy unavailable'); } }, ''), /proxy unavailable/);
  const roaming = 'C:\\Users\\Fixture\\AppData\\Roaming';
  assert.equal(resolveUserDataPath({ currentPath: path.win32.join(roaming, 'MoreReady'), appDataPath: roaming, name: 'MoreReady' }, path.win32), path.win32.join(roaming, 'moreready-widget'));
  assert.equal(resolveUserDataPath({ currentPath: 'C:\\Temp\\isolated-profile', appDataPath: roaming, name: 'MoreReady' }, path.win32), 'C:\\Temp\\isolated-profile');
  const app = { isPackaged: true, getVersion: () => '0.2.0' };
  const updater = new EventEmitter(); let checks = 0, downloads = 0, installs = 0, prepared = 0, releaseCheck;
  updater.checkForUpdates = () => { checks++; updater.emit('checking-for-update'); return new Promise(resolve => { releaseCheck = resolve; }); };
  updater.downloadUpdate = async () => { downloads++; updater.emit('download-progress', { percent: 62 }); updater.emit('update-downloaded', { version: '0.3.0' }); };
  updater.quitAndInstall = (silent, restart) => { assert.equal(silent, false); assert.equal(restart, true); installs++; };
  const changes = [];
  const service = createUpdateService({ app, platform: 'win32', getUpdater: () => updater, onChange: state => changes.push(state), beforeInstall: () => prepared++ });
  assert.equal(service.info().status, 'idle');
  service.install(); assert.equal(installs, 0);
  const check = service.check(); assert.equal(service.check(), check);
  await Promise.resolve(); assert.equal(checks, 1); assert.equal(service.info().status, 'checking');
  assert.equal(updater.autoDownload, false); assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowDowngrade, false); assert.equal(updater.allowPrerelease, false);
  updater.emit('update-available', { version: '0.3.0' }); releaseCheck(); await check;
  assert.equal(service.info().status, 'available'); assert.equal(downloads, 0);
  const download = service.download(); assert.equal(service.download(), download); await download;
  assert.equal(downloads, 1); assert.equal(service.info().status, 'downloaded');
  assert.ok(changes.some(state => state.status === 'downloading' && state.percent === 62));
  await service.check(); assert.equal(checks, 1, 'a downloaded update must not be discarded by another check');
  service.install(); service.install(); assert.equal(prepared, 1); assert.equal(installs, 1);
  const errorUpdater = new EventEmitter(); let shouldFail = true;
  errorUpdater.checkForUpdates = async () => {
    if (shouldFail) throw new Error('private internal diagnostic must not reach the UI');
    errorUpdater.emit('update-not-available');
  };
  const failing = createUpdateService({ app, platform: 'win32', getUpdater: () => errorUpdater });
  assert.equal((await failing.check()).status, 'error'); shouldFail = false;
  assert.equal((await failing.check()).status, 'current');
  assert.ok(!JSON.stringify(failing.info()).includes('private internal diagnostic'));
  for (const config of [{ app: { ...app, isPackaged: false }, platform: 'win32' }, { app, platform: 'linux' }]) {
    const disabled = createUpdateService({ ...config, getUpdater: () => { throw new Error('must not instantiate'); } });
    assert.equal((await disabled.check()).status, 'unavailable'); await disabled.download(); disabled.install();
  }
  console.log('PASS updater: public source, manual download/install, duplicate request protection, progress/errors/retry, development mode, and existing/isolated data paths.');
})().catch(error => { console.error(error); process.exitCode = 1; });
