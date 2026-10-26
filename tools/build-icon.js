'use strict';
const fs = require('node:fs');
const path = require('node:path');
// ICO supports an embedded PNG: retain the existing application artwork without resampling.
const png = fs.readFileSync(path.resolve(__dirname, '../assets/app-256.png'));
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(header.length, 18);
fs.writeFileSync(path.resolve(__dirname, '../assets/app.ico'), Buffer.concat([header, png]));
