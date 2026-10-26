'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'moreready-updates-'));
const data = path.join(temp, 'data'); fs.mkdirSync(data);
fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({ name: 'moreready-update-check', version: '0.2.0', main: 'main.js' }));
fs.writeFileSync(path.join(data, 'store.json'), JSON.stringify({ schema: 6, projects: [], tasks: [], activeModule: 'about', activeProjectId: 'all',
  settings: { theme: 'daylight', rememberLast: true }, tags: [], projectGroups: [], trash: [], activity: [] }));
fs.writeFileSync(path.join(temp, 'main.js'), `
const { app } = require('electron');
app.setPath('userData', ${JSON.stringify(data)});
Object.defineProperty(app, 'isPackaged', { get: () => true });
const { EventEmitter } = require('node:events');
const updater = new EventEmitter(); global.updateScenario = 'available'; global.updateCalls = { check:0, download:0, install:0 };
updater.checkForUpdates = async () => {
  global.updateCalls.check++; updater.emit('checking-for-update');
  if (global.updateScenario === 'error') throw new Error('isolated failed request');
  updater.emit(global.updateScenario === 'current' ? 'update-not-available' : 'update-available', {version:'0.3.0'});
};
updater.downloadUpdate = async () => { global.updateCalls.download++; updater.emit('download-progress', {percent:75}); updater.emit('update-downloaded', {version:'0.3.0'}); };
updater.quitAndInstall = () => { global.updateCalls.install++; };
require.cache[${JSON.stringify(require.resolve('electron-updater'))}] = { exports: {autoUpdater:updater} };
require(${JSON.stringify(path.join(ROOT, 'src/main.js'))});
`);
(async () => {
  let app;
  try {
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ args: [temp], cwd: ROOT, env });
    const page = await app.firstWindow(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('#aboutUpdate');
    assert.equal(await page.locator('.about-page > *').count(), 4);
    const info = await page.evaluate(() => window.PM.updateInfo());
    assert.equal(info.supported, true); assert.equal(info.releaseUrl, 'https://github.com/JimMinseay3/MoreReady/releases/latest');
    assert.equal((await page.evaluate(() => window.PM.info())).storePath, path.join(data, 'store.json'));
    await app.evaluate(() => { global.updateScenario = 'error'; });
    await page.click('[data-action="check-update"]'); await page.waitForFunction(() => document.querySelector('.about-update-status').textContent.includes('更新失败'));
    await app.evaluate(() => { global.updateScenario = 'current'; });
    await page.click('[data-action="check-update"]'); await page.waitForFunction(() => document.querySelector('.about-update-status').textContent === '已是最新版本');
    await app.evaluate(() => { global.updateScenario = 'available'; });
    await page.click('[data-action="check-update"]'); await page.waitForFunction(() => document.querySelector('[data-action="check-update"]').textContent === '下载更新');
    assert.equal((await app.evaluate(() => global.updateCalls)).download, 0);
    await page.click('[data-action="check-update"]'); await page.waitForFunction(() => document.querySelector('[data-action="check-update"]').textContent === '重启安装');
    assert.equal((await app.evaluate(() => global.updateCalls)).install, 0);
    fs.mkdirSync(path.resolve('shots'), { recursive: true });
    await page.screenshot({ path: path.resolve('shots/update-ready-desktop.png') });
    await page.click('[data-action="check-update"]'); assert.equal((await app.evaluate(() => global.updateCalls)).install, 1);
    assert.deepEqual(errors, []);
    console.log('PASS native update UI: real preload/IPC, latest/error/retry/available states, explicit download/restart, four-row about layout and isolated data preserved (mock release transport, no real install).');
  } finally {
    await app?.close();
    const relative = path.relative(os.tmpdir(), temp);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
