#!/usr/bin/env node
/**
 * 启动器：清掉 ELECTRON_RUN_AS_NODE，避免 Electron 被当成普通 Node 运行。
 * 用法：npm start  或  node tools/launch.js
 */
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
if (process.argv.includes('--devtools')) env.PM_WIDGET_DEVTOOLS = '1';

const child = spawn(electron, [path.join(__dirname, '..')], {
  stdio: 'inherit',
  env,
  windowsHide: false,
});

child.on('close', (code) => process.exit(code === null ? 0 : code));
