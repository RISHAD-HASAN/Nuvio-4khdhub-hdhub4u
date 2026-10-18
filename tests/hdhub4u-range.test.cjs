const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function load() {
  const c = { module: { exports: {} }, require: () => ({}), URL, setTimeout, clearTimeout, AbortController, console: { log() {}, error() {} } };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync('providers/hdhub4u.js', 'utf8'), c);
  return c;
}
const c = load();
for (const [fileName, expected] of [
  ['Film.1080p.SDR.mkv', 'SDR'], ['Film.2160p.HDR.mkv', 'HDR'],
  ['Film.HDR10.mkv', 'HDR10'], ['Film.HDR10+.mkv', 'HDR10+'],
  ['Film.HDR10Plus.mkv', 'HDR10+'], ['Film.DoVi.HDR10+.mkv', 'Dolby Vision / HDR10+'],
  ['Film.Dolby-Vision.mkv', 'Dolby Vision'], ['Film.HLG.mkv', 'HLG'],
  ['Film.2160p.HEVC.10bit.mkv', null], ['Film.DVDRip.mkv', null],
  ['Unknown', null]
]) test(`filename: ${fileName}`, () => assert.equal(c.getLinkDynamicRange({ fileName }), expected));
test('source release tags provide a fallback', () => {
  assert.equal(c.getLinkDynamicRange({ source: 'HubCloud - FSL [WEB-DL HDR10+]' }), 'HDR10+');
});
test('explicit filename SDR overrides source HDR', () => {
  assert.equal(c.getLinkDynamicRange({ fileName: 'Film SDR', source: 'HubCloud [HDR]' }), 'SDR');
});
for (const mediaType of ['movie', 'tv']) test(`getStreams labels ${mediaType} without changing quality or URL`, async () => {
  const ctx = load();
  ctx.getTMDBDetails = async () => ({ title: 'Example', year: 2026 });
  ctx.search = async () => [{ title: 'Example', url: 'https://example.com' }];
  ctx.findBestTitleMatch = (_, results) => results[0];
  ctx.getDownloadLinks = async () => ({ finalLinks: [
    { source: 'HubCloud - FSL [WEB-DL]', fileName: 'Example.S01E02.2160p.DV.HDR.mkv', quality: 2160, episode: 2, url: 'https://example.com/video' },
    { source: 'Pixeldrain', quality: 1080, episode: 2, url: 'https://example.com/other' }
  ] });
  const result = await ctx.module.exports.getStreams('123', mediaType, 1, 2);
  assert.match(result[0].name, /\| Dolby Vision \/ HDR/);
  assert.equal(result[0].quality, '4K');
  assert.equal(result[0].url, 'https://example.com/video');
  assert.equal(result[1].name, 'HDHub4u Pixeldrain');
  if (mediaType === 'tv') assert.equal(result[0].title, 'Example S01E02');
});
