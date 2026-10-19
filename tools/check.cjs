const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const manifest = require('../manifest.json');
let failed = false;
for (const provider of manifest.scrapers) {
  if (!fs.existsSync(provider.filename)) { console.error('Missing provider: ' + provider.filename); failed = true; continue; }
  const result = spawnSync(process.execPath, ['--check', provider.filename], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
