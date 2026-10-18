const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function load(provider = '4khdhub', fetchImpl = async () => { throw Error('Unexpected network'); }, timers = {}) {
  const c = { require, module: { exports: {} }, URL, AbortController, setTimeout, clearTimeout, console: { log() {}, error() {} }, fetch: fetchImpl, ...timers };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(`providers/${provider}.js`, 'utf8'), c);
  return c;
}
function response(body, status = 200, url = 'https://example.com') {
  return { ok: status >= 200 && status < 300, status, headers: { get() { return null; } }, url,
    text: async () => typeof body === 'string' ? body : JSON.stringify(body) };
}
test('unknown labels are omitted from both names', () => {
  const a = load(); const b = load('hdhub4u');
  assert.equal(a.streamFromLink({ source: 'FSL', url: 'https://example.com', meta: { height: 1080, title: 'Example.H265' } }, {}).name, '4KHDHub - FSL 1080p | H.265');
  assert.equal(b.getLinkDynamicRange({ fileName: 'Example 1080p' }), null);
});
test('dedupe keeps SDR/HDR, codecs and signed URLs; removes exact duplicates', () => {
  const c = load();
  const streams = ['a?sig=1','a?sig=2','b','c'].map((u,i) => ({ url: 'https://example.com/' + u, quality: i === 0 ? '480p' : '2160p' }));
  const out = c.providerFinalize([...streams, streams[0], { url: 'javascript:alert(1)' }, { url: 'https://example.com/pack.zip' }]);
  assert.equal(out.length, 4);
  assert.equal(out[0].quality, '2160p');
  assert.equal(out[3].quality, '480p');
});
test('different playback headers do not collapse', () => {
  const c = load();
  assert.equal(c.providerFinalize([{ url: 'https://example.com', headers: { Referer: 'a' } },{ url: 'https://example.com', headers: { Referer: 'b' } }]).length, 2);
});
test('empty and non-http URLs rejected', () => {
  const c = load();
  for (const value of ['', null, 'javascript:alert(1)', 'file:///etc/passwd', 'https://u:p@example.com']) assert.equal(c.providerHttpUrl(value), null);
  assert.equal(c.providerHttpUrl('/path', 'https://example.com'), 'https://example.com/path');
});
test('network concurrency capped at six', async () => {
  let active = 0, peak = 0;
  const c = load('4khdhub', async () => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 3)); active--; return response('ok'); });
  await Promise.all(Array.from({ length: 20 }, () => c.providerFetch('https://example.com')));
  assert.equal(peak, 6);
});
test('503 retries once and succeeds', async () => {
  let calls = 0;
  const c = load('4khdhub', async () => response('ok', ++calls === 1 ? 503 : 200));
  assert.equal(await (await c.providerFetch('https://example.com')).text(), 'ok');
  assert.equal(calls, 2);
});
test('404 does not retry', async () => {
  let calls = 0;
  const c = load('4khdhub', async () => { calls++; return response('',404); });
  await assert.rejects(c.providerFetch('https://example.com'), /HTTP 404/);
  assert.equal(calls, 1);
});
test('manual redirects preserved', async () => {
  const c = load('4khdhub', async () => response('',302));
  assert.equal((await c.providerFetch('https://example.com', { redirect: 'manual' })).status,302);
});
test('stalled body hits deadline and releases slot', async () => {
  const c = load('4khdhub', async () => ({ text: () => new Promise(() => {}) }), { setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)) });
  await assert.rejects(c.providerFetch('https://example.com'), /timed out/);
  await new Promise(r => setTimeout(r, 5));
  assert.equal(c.providerActive, 0);
});
test('same request shares in-flight work, next request is fresh', async () => {
  const c = load(); let calls = 0;
  c.getStreams = async () => { calls++; await new Promise(r => setTimeout(r, 3)); return [{ url: 'https://example.com', quality: '1080p' }]; };
  await Promise.all([c.providerGetStreams(1,'series',1,2), c.providerGetStreams(1,'tv',1,2)]);
  assert.equal(calls,1);
  await c.providerGetStreams(1,'tv',1,2); assert.equal(calls,2);
});
test('invalid TV requests do not fetch', async () => {
  const c = load(); let calls=0; c.getStreams = async () => { calls++; return []; };
  assert.equal((await c.providerGetStreams(1, 'tv', 1, null)).length,0); assert.equal(calls,0);
});
test('HDHub4u correct year and season matching', () => {
  const c = load('hdhub4u');
  assert.equal(c.findBestTitleMatch({ title:'Example', year:2026 }, [{ title:'Example', year:1990 }], 'movie', null), null);
  assert.equal(c.findBestTitleMatch({ title:'Example' }, [{ title:'Example Season 2' }], 'tv', 1), null);
});
test('HDHub4u redirect cycles bounded', async () => {
  let calls = 0;
  const c = load('hdhub4u', async () => { calls++; return response('<div class="entry-content"><a href="https://hblinks.example/loop">loop</a></div>'); });
  const links = await c.loadExtractor('https://hblinks.example/loop');
  assert.equal(links.length,0); assert.ok(calls<=9);
});
test('direct media does not get downloaded as an HTML page', async () => {
  const c = load('hdhub4u');
  const links = await c.loadExtractor('https://example.com/video.mkv?sig=x');
  assert.equal(links[0].url,'https://example.com/video.mkv?sig=x');
});
test('HDHub4u native search fallback when primary fails', async () => {
  const c = load('hdhub4u', async url => {
    if (url.includes('/collections/post/documents/search')) return response('',404);
    if (url.includes('domains.json')) return response({ HDHUB4u: 'https://hdhub4u.example' });
    return response('<article><h2><a href="/example-2026/">Example (2026)</a></h2></article>');
  });
  const hits = await c.search('Example');
  assert.equal(hits[0].url,'https://hdhub4u.example/example-2026/');
});
test('HDHub4u unchanged domain uses TTL rather than fetching repeatedly', async () => {
  let calls=0; const c = load('hdhub4u', async () => { calls++; return response({ HDHUB4u: 'https://new6.hdhub4u.cl' }); });
  await c.getCurrentDomain(); await c.getCurrentDomain(); assert.equal(calls,1);
});
test('movie extraction preserves release labels and subtitles', async () => {
  const c = load('hdhub4u', async () => response('<h3><a href="https://hubcloud.example/one">2160p SDR H.265</a></h3>'));
  c.getCurrentDomain = async () => 'https://hdhub4u.example';
  c.loadExtractor = async () => [{ source:'FSL', url:'https://example.com/movie.mkv', quality:2160, subtitles:[{ language:'en',url:'https://example.com/en.vtt' }] }];
  const result = await c.getDownloadLinks('https://hdhub4u.example/example', 'movie');
  assert.equal(result.finalLinks[0].releaseTitle,'2160p SDR H.265');
  assert.equal(c.getLinkDynamicRange(result.finalLinks[0]),'SDR');
  assert.equal(result.finalLinks[0].subtitles.length,1);
});
test('4KHDHub complete mocked TMDB → search → release → Hblinks pipeline', async () => {
  const variants = ['2160p DV HDR H.265','2160p SDR H.265','1080p H.265','1080p H.264','1080p DV HDR H.265','1080p H.265','1080p AV1'];
  const html = variants.map((v,i) => `<div class="episode-item"><div class="episode-header"><h3 class="episode-title">S01 ${v}</h3></div><div class="episode-download-item"><div class="episode-file-title">Episode-02</div><a href="https://hblinks.example/${i}">Download</a></div></div>`).join('');
  const c = load('4khdhub', async url => {
    if (url.includes('domains.json')) return response({ '4khdhub':'https://4khdhub.example' });
    if (url.includes('themoviedb')) return response({ name:'Example', first_air_date:'2026-01-01' });
    if (url.includes('/?s=')) return response('<a class="movie-card" href="/example/"><span class="movie-card-format">Series</span><span class="movie-card-meta">2026</span><span class="movie-card-title">Example</span></a>');
    if (url.includes('4khdhub.example/example')) return response(html);
    if (url.includes('hblinks.example')) return response(`<div class="entry-content"><a href="https://cdn.example/${url.split('/').pop()}.mkv">file</a></div>`);
    throw Error('Unexpected route: '+url);
  });
  const result = await c.module.exports.getStreams(123,'series',1,2);
  assert.equal(result.length,7);
  assert.equal(result.filter(s => s.name.includes('Dolby Vision / HDR')).length,2);
  assert.equal(result.filter(s => s.name.includes('| SDR')).length,1);
  assert.ok(result.every(s => !s.name.includes('unknown')));
  assert.ok(result.some(s => s.name.endsWith('| AV1')));
});
test('4KHDHub movie headings and HQ variants remain visible', () => {
  const c = load(); const $ = require('cheerio-without-node-native').load('<div class="download-item"><div class="download-header">2160p SDR HQ HEVC WEB-DL</div><div class="file-title">Example</div></div>');
  const meta = c.extractReleaseMeta($, $('.download-item')[0]);
  assert.equal(meta.dynamicRange,'SDR'); assert.equal(meta.height,2160);
  assert.equal(meta.codec,'H.265'); assert.equal(meta.edition,'HQ');
  assert.match(c.streamFromLink({ source:'FSL', meta },meta).name,/2160p \| SDR \| H\.265 \| HQ$/);
});
test('HDHub4u no synthetic audio channels', () => {
  const c = load('hdhub4u');
  assert.equal(c.providerDetails('Example DDP', 'English'),'DDP | English');
  assert.equal(c.providerDetails('Example DDP5.1 Atmos', 'Hindi'),'DDP5.1 | Atmos | Hindi');
});
test('resolution must be explicit, not a host default', async () => {
  const c = load('hdhub4u');
  assert.equal(c.providerResolution('video.mkv'),0);
  assert.equal(c.providerResolution('video.2160p.mkv'),2160);
  assert.equal((await c.loadExtractor('https://hdstream4u.example/video'))[0].quality,0);
});
