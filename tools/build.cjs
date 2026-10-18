const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const common = (fs.readFileSync(path.join(root, 'src/url.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/common.js'), 'utf8')).replace(/new URL\(/g, 'new ProviderURL(');
for (const provider of ['4khdhub', 'hdhub4u']) {
  const text = fs.readFileSync(path.join(root, 'src', provider + '.js'), 'utf8')
    .replace(/\bfetch\(/g, 'providerFetch(')
    .replace(/new URL\(/g, 'new ProviderURL(')
    .replace('module.exports = { getStreams };', 'module.exports = { getStreams: providerGetStreams };');
  fs.writeFileSync(path.join(root, 'providers', provider + '.js'), `// Nuvio Dual Providers ${version}. Edit src/ and run npm run build. See NOTICE.md.\n` + common + '\n' + text);
}
