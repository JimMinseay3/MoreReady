'use strict';
const source = require('./src/renderer/release-config');
module.exports = {
  appId: 'com.moreready.desktop', productName: 'MoreReady', asar: true,
  directories: { output: 'release' },
  files: ['src/**/*', 'assets/**/*', 'package.json'],
  win: {
    icon: 'assets/app.ico', target: [{ target: 'nsis', arch: ['x64'] }],
    artifactName: 'MoreReady-Setup-${version}-${arch}.${ext}',
  },
  nsis: {
    oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false, createDesktopShortcut: true,
    createStartMenuShortcut: true, shortcutName: 'MoreReady',
  },
  publish: [{ provider: source.provider, owner: source.owner, repo: source.repo, releaseType: 'release' }],
};
