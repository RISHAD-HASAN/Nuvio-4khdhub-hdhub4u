// Read-only site/metadata smoke check: does NOT resolve or download videos.
const fs = require('node:fs');
const vm = require('node:vm');
const cheerio = require('cheerio-without-node-native');
async function main() {
  const output = { checkedAt: new Date().toISOString(), mode: 'metadata/pages only; no playback validation', checks: [] };
  async function get(url) {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    return { status: r.status, url: r.url, body: await r.text() };
  }
  let domains = {};
  try {
    const d = await get('https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json');
    domains = JSON.parse(d.body);
    output.checks.push({ resource: 'domain registry', status: d.status });
  } catch (e) { output.checks.push({ resource: 'domain registry', error: e.message }); }
  const c = { module: { exports: {} }, require, URL, setTimeout, clearTimeout, AbortController, console };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync('providers/4khdhub.js','utf8'),c);
  try {
    const url = new URL('/east-of-eden-series-8250/', domains['4khdhub'] || 'https://4khdhub.one').toString();
    const page = await get(url); const $ = cheerio.load(page.body); const names = [];
    $('.episode-item').each((_, release) => {
      const item = $(release).find('.episode-download-item').first();
      if (item.length) { const meta = c.extractReleaseMeta($, item[0]); names.push(c.streamFromLink({ source: 'FSL (display example)', meta }, meta).name); }
    });
    output.checks.push({ resource: '4KHDHub East of Eden release markup', url: page.url, status: page.status, releases: names.length, displayExamples: names });
  } catch (e) { output.checks.push({ resource: '4KHDHub release markup', error: e.message }); }
  try {
    const page = await get(domains.HDHUB4u || domains.hdhub4u || 'https://new6.hdhub4u.cl');
    output.checks.push({ resource: 'HDHub4u homepage', url: page.url, status: page.status });
  } catch (e) { output.checks.push({ resource: 'HDHub4u homepage', error: e.message }); }
  fs.mkdirSync('.reports', { recursive: true });
  fs.writeFileSync('.reports/live-smoke.json', JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify(output,null,2));
}
main().catch(e => { console.error(e); process.exitCode=1; });
