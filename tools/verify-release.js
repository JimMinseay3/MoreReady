'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const pkg = require('../package.json');
const source = require('../src/renderer/release-config');
const directory = path.resolve(__dirname, '../release');

function verifyRelease(folder = directory) {
  const installer = `MoreReady-Setup-${pkg.version}-x64.exe`;
  const bytes = fs.readFileSync(path.join(folder, installer));
  assert.equal(bytes.subarray(0, 2).toString(), 'MZ');
  assert.ok(bytes.length > 1024 * 1024, 'installer must contain the application');
  const manifest = fs.readFileSync(path.join(folder, 'latest.yml'), 'utf8');
  assert.equal(/^version: (.+)$/m.exec(manifest)?.[1], pkg.version);
  assert.equal(/^path: (.+)$/m.exec(manifest)?.[1], installer);
  assert.equal(/^sha512: (.+)$/m.exec(manifest)?.[1], crypto.createHash('sha512').update(bytes).digest('base64'));
  assert.ok(fs.statSync(path.join(folder, installer + '.blockmap')).size > 0);
  const configFile = path.join(folder, 'win-unpacked/resources/app-update.yml');
  if (fs.existsSync(configFile)) {
    const config = fs.readFileSync(configFile, 'utf8');
    for (const [key, value] of Object.entries({ provider: 'github', owner: source.owner, repo: source.repo })) assert.match(config, new RegExp(`^${key}: ${value}$`, 'm'));
    assert.ok(!/^token:/m.test(config), 'no publishing credential may be bundled');
    const asar = require('@electron/asar');
    const entries = asar.listPackage(path.join(folder, 'win-unpacked/resources/app.asar'));
    assert.ok(entries.some(file => /src[\\/]update-service\.js$/.test(file)));
    assert.ok(entries.some(file => /node_modules[\\/]electron-updater[\\/]package\.json$/.test(file)));
    assert.ok(entries.every(file => !/(^|[\\/])(\.local-ai|backups|shots|tools|\.git|\.github)([\\/]|$)/.test(file)), 'workspace data and development artifacts must not be packaged');
  }
  const assets = [installer, installer + '.blockmap', 'latest.yml'];
  return { version: pkg.version, installer, bytes: bytes.length, assets, releaseUrl: source.releaseUrl };
}
if (require.main === module) console.log(JSON.stringify(verifyRelease(), null, 2));
module.exports = { verifyRelease };
