const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cheerio = require('cheerio-without-node-native');
const c = { module: { exports: {} }, require, URL, setTimeout, clearTimeout, AbortController, console };
vm.createContext(c);
vm.runInContext(fs.readFileSync('providers/4khdhub.js', 'utf8'), c);
for (const [heading, range, codec] of [
  ['East of Eden S01 (NF 2160p DV HDR H.265)', 'Dolby Vision / HDR', 'H.265'],
  ['East of Eden S01 (NF 2160p SDR H.265)', 'SDR', 'H.265'],
  ['East of Eden S01 (NF 1080p H.265)', null, 'H.265'],
  ['East of Eden S01 (NF 1080p H.264)', null, 'H.264'],
  ['East of Eden S01 (NF 1080p DV HDR H.265)', 'Dolby Vision / HDR', 'H.265'],
  ['East of Eden S01 (NF 1080p AV1)', null, 'AV1']
]) test(`inherit exact screenshot heading: ${heading}`, () => {
  const $ = cheerio.load(`<main><div>DV HDR SDR</div><div class="episode-item"><div class="episode-header"><h3 class="episode-title">${heading}</h3></div><div class="episode-content"><div class="episode-download-item"><div class="episode-file-title">Episode-02</div></div></div></div></main>`);
  const meta = c.extractReleaseMeta($, $('.episode-download-item')[0]);
  assert.equal(meta.dynamicRange, range);
  assert.equal(meta.codec, codec);
  assert.equal(meta.height, heading.includes('2160p') ? 2160 : 1080);
  const stream = c.streamFromLink({ source: 'FSL', meta: { ...meta, title: 'HubCloud' } }, meta);
  assert.ok(stream.name.endsWith(`${range ? `| ${range} ` : ''}| ${codec}`));
});
test('captured page: all episodes stay within their own release', () => {
  const $ = cheerio.load(fs.readFileSync('tests/fixtures/east-of-eden-releases.html', 'utf8'));
  let count = 0;
  $('.episode-item').each((_, release) => {
    const heading = $(release).children('.episode-header').find('.episode-title').text();
    $(release).find('.episode-download-item').each((_, el) => {
      const meta = c.extractReleaseMeta($, el);
      assert.equal(meta.releaseTitle, heading);
      assert.equal(meta.dynamicRange, c.detectDynamicRange($(el).find(".episode-file-title").text()) || c.detectDynamicRange(heading));
      count++;
    });
  });
  assert.ok(count >= 7);
});
test('filename SDR takes precedence over parent HDR', () => {
  const $ = cheerio.load('<div class="episode-item"><div class="episode-header"><h3 class="episode-title">S01 2160p DV HDR</h3></div><div class="episode-download-item"><div class="episode-file-title">Film.1080p.SDR.H264.mkv</div></div></div>');
  const m = c.extractReleaseMeta($, $('.episode-download-item')[0]);
  assert.equal(m.dynamicRange, 'SDR');
  assert.equal(m.height, 1080);
});
