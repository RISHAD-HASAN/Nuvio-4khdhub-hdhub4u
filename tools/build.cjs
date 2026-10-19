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

// Each extra provider is still a single Nuvio file. Keep host-resolution code
// in a closure so its HDHub4u catalog entry point cannot replace this adapter.
const extraProviders = require('../src/additional-providers.json');
const hostSource = fs.readFileSync(path.join(root, 'src/hdhub4u.js'), 'utf8')
  .replace(/\bfetch\(/g, 'providerFetch(')
  .replace(/new URL\(/g, 'new ProviderURL(')
  .replace('module.exports = { getStreams };', 'return { resolve: loadExtractor, decode: atob, range: detectDynamicRange };');
const adapterSource = fs.readFileSync(path.join(root, 'src/catalog-adapters.js'), 'utf8');
for (const config of extraProviders) {
  const entry = `\nfunction getStreams(id,type,season,episode) { return catalogGetStreams(${JSON.stringify(config)},id,type,season,episode); }\nmodule.exports = { getStreams: providerGetStreams };\n`;
  fs.writeFileSync(path.join(root, 'providers', config.id + '.js'),
    `// Nuvio custom adapter ${version}. See docs/ADDITIONAL-PROVIDERS.md and NOTICE.md.\n` +
    common + '\nvar catalogHosts = (function() {\n' + hostSource + '\n})();\n' + adapterSource + entry);
}
