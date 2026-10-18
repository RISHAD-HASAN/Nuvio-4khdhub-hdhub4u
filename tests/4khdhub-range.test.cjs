const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
// Load the actual standalone provider without requiring its HTML parser for
// pure metadata tests. No network calls or extra runtime exports are needed.
const context = { module: { exports: {} }, require: () => ({}), URL, setTimeout, clearTimeout, AbortController, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync('providers/4khdhub.js', 'utf8'), context);
const { detectDynamicRange, streamFromLink } = context;
const cases = [
  ['Film.1080p.SDR.x264', 'SDR'],
  ['Film_2160p_HDR_HEVC', 'HDR'],
  ['Film.2160p.HDR10.x265', 'HDR10'],
  ['Film.2160p.HDR10+.x265', 'HDR10+'],
  ['Film HDR10Plus', 'HDR10+'],
  ['Film HDR 10 Plus', 'HDR10+'],
  ['Film.DV.HDR10+.mkv', 'Dolby Vision / HDR10+'],
  ['Film.DoVi.HDR.mkv', 'Dolby Vision / HDR'],
  ['Film Dolby-Vision', 'Dolby Vision'],
  ['Film.HLG', 'HLG'],
  ['Film.2160p.10bit.HEVC', null],
  ['Film.1080p', null],
  ['Film.DVDRip', null],
  ['Film.SDR.HDR', 'HDR'],
  ['', null], [null, null]
];
for (const [input, expected] of cases)
  test(`range: ${input}`, () => assert.equal(detectDynamicRange(input), expected));
test('range appears in visible name; resolution quality remains compatible', () => {
  const s = streamFromLink({ source: 'FSL', url: 'https://example.com/video', meta: { title: 'Film HDR10+', height: 2160, bytes: 1024 } }, {});
  assert.equal(s.name, '4KHDHub - FSL 2160p | HDR10+');
  assert.equal(s.quality, '2160p');
  assert.equal(s.url, 'https://example.com/video');
});
test('generic host title retains release range', () => {
  const s = streamFromLink({ source: 'FSL', meta: { title: 'HubCloud' } }, { height: 1080, dynamicRange: 'SDR' });
  assert.equal(s.name, '4KHDHub - FSL 1080p | SDR');
});
test('resolved filename range takes precedence over page hint', () => {
  const s = streamFromLink({ source: 'FSL', meta: { title: 'Film.DV.HDR.mkv', dynamicRange: 'SDR' } }, {});
  assert.match(s.name, /Dolby Vision \/ HDR$/);
});
test('untagged 4K is unknown, never silently SDR or HDR', () => {
  const s = streamFromLink({ source: 'FSL', meta: { title: 'Film 2160p HEVC 10bit' } }, { height: 2160 });
  assert.equal(s.name, '4KHDHub - FSL 2160p | H.265');
});
