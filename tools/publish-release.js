'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { verifyRelease } = require('./verify-release');
const source = require('../src/renderer/release-config');
const result = verifyRelease();
const tag = process.env.RELEASE_TAG || `v${result.version}`;
if (tag !== `v${result.version}`) throw new Error('The release tag must match package.json version');
const repo = `${source.owner}/${source.repo}`;
const gh = args => execFileSync('gh', [...args, '--repo', repo], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const existing = spawnSync('gh', ['release', 'view', tag, '--repo', repo, '--json', 'isDraft'], { encoding: 'utf8', windowsHide: true });
if (existing.status === 0) {
  if (!JSON.parse(existing.stdout).isDraft) throw new Error('This version is already public; publish a new version instead');
} else {
  gh(['release', 'create', tag, '--verify-tag', '--draft', '--title', `MoreReady ${tag}`, '--notes-file', path.resolve(__dirname, '../RELEASE_NOTES.md')]);
}
// Publish only after every asset is uploaded, so update clients never see an incomplete release.
for (const asset of result.assets) gh(['release', 'upload', tag, path.resolve(__dirname, '../release', asset), '--clobber']);
const sums = result.assets.map(file => {
  const bytes = fs.readFileSync(path.resolve(__dirname, '../release', file));
  return require('node:crypto').createHash('sha256').update(bytes).digest('hex') + '  ' + file;
}).join('\n') + '\n';
const checksumFile = path.resolve(__dirname, '../release/SHA256SUMS.txt'); fs.writeFileSync(checksumFile, sums);
gh(['release', 'upload', tag, checksumFile, '--clobber']);
console.log(gh(['release', 'edit', tag, '--draft=false', '--latest']));
console.log(`Published https://github.com/${repo}/releases/tag/${tag}`);
