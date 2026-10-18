const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const parser = require('./helpers/nuvio-parser.cjs');
function load(provider, route, promiseBody = false) {
  const log = [];
  const context = {
    module: { exports: {} },
    require: name => name === 'cheerio-without-node-native' ? parser : require(name),
    console: { log: (...args) => log.push(args.join(' ')), error: (...args) => log.push(args.join(' ')) },
    fetch: url => {
      const data = route(String(url));
      const status = data.status || 200;
      const body = typeof data.body === 'string' ? data.body : JSON.stringify(data.body);
      return Promise.resolve({ ok: status >= 200 && status < 300, status, url: String(url), headers: data.headers || {}, text: () => promiseBody ? Promise.resolve(body) : body });
    }
    // Deliberately no URL, timers, AbortController or browser DOM.
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(`providers/${provider}.js`, 'utf8'),context);
  context.logs = log;
  return context;
}
const variants = ['2160p DV HDR H.265','2160p SDR H.265','1080p H.265','1080p H.264','1080p DV HDR H.265','1080p H.265 HQ','1080p AV1'];
function fourKRoute(url) {
  if (url.includes('domains.json')) return { body: { '4khdhub':'https://4khdhub.example' } };
  if (url.includes('themoviedb')) return { body: { name:'Example', first_air_date:'2026-01-01' } };
  if (url.includes('/?s=')) return { body: '<a class="movie-card" href="/example/"><span class="movie-card-format">Series</span><span class="movie-card-meta">2026</span><span class="movie-card-title">Example</span></a>' };
  if (url.includes('4khdhub.example/example')) return { body: variants.map((v,i) => `<div class="episode-item"><div class="episode-header"><h3 class="episode-title">S01 ${v}</h3></div><div class="episode-download-item"><div class="episode-file-title">Episode-02</div><a href="https://hblinks.example/${i}">Download</a></div></div>`).join('') };
  if (url.includes('hblinks.example')) return { body: `<div class="entry-content"><a href="https://cdn.example/${url.split('/').pop()}.mkv">file</a></div>` };
  throw Error('Unexpected route '+url);
}
for (const promiseBody of [false,true]) {
  test(`4KHDHub works without closest, timers or native URL; promise body=${promiseBody}`, async () => {
    const c = load('4khdhub',fourKRoute,promiseBody);
    const result = await c.module.exports.getStreams(123,'series',1,2);
    assert.equal(result.length,7,c.logs.join('\n'));
    assert.equal(result.filter(x => x.name.includes('Dolby Vision / HDR')).length,2);
    assert.equal(result.filter(x => x.name.includes('| SDR')).length,1);
    assert.equal(result.filter(x => x.name.includes('| HQ')).length,1);
    assert.ok(result.every(x => !x.name.includes('unknown')));
  });
  test(`HDHub4u full TV flow with restricted parser; promise body=${promiseBody}`, async () => {
    const c = load('hdhub4u',url => {
      if (url.includes('domains.json')) return { body: { HDHUB4u:'https://hdhub4u.example' } };
      if (url.includes('themoviedb')) return { body: { name:'Example', first_air_date:'2026-01-01' } };
      if (url.includes('/collections/post/documents/search')) return { body: { hits:[{ document: { post_title:'Example Season 1 (2026)', permalink:'https://hdhub4u.example/example' } }] } };
      if (url.includes('hdhub4u.example/example')) return { body:'<h3>Episode 2 <a href="https://hubcloud.example/test">HubCloud</a></h3><hr>' };
      if (url.includes('hubcloud.example')) return { body:'<div class="card-header">Example.S01E02.2160p.SDR.H265.mkv</div><i id="size">3 GB</i><a class="btn" href="https://cdn.example/episode.mkv">FSL Server</a>' };
      throw Error('Unexpected route '+url);
    },promiseBody);
    const result = await c.module.exports.getStreams(123,'tv',1,2);
    assert.equal(result.length,1,c.logs.join('\n'));
    assert.equal(result[0].name,'HDHub4u FSL | SDR | H.265');
    assert.equal(result[0].url,'https://cdn.example/episode.mkv');
  });
}
test('HDHub4u movie heading tags survive without closest()',async () => {
  const c=load('hdhub4u',() => ({body:'<h3>2160p SDR H.265 <a href="https://cdn.example/movie.mkv">2160p download</a></h3>'}));
  c.getCurrentDomain=async () => 'https://hdhub4u.example';
  const result=await c.getDownloadLinks('https://hdhub4u.example/example','movie');
  assert.equal(result.finalLinks.length,1);
  assert.equal(c.getLinkDynamicRange(result.finalLinks[0]),'SDR');
});
test('transient failure retries without timers',async () => {
  let count=0;
  const c=load('4khdhub',() => ({ status: ++count===1 ? 503:200, body:'ok' }));
  assert.equal(await (await c.providerFetch('https://example.com')).text(),'ok');
  assert.equal(count,2);
});
test('plain response headers support case-insensitive get()',async () => {
  const c=load('hdhub4u',() => ({ body:'ok', headers:{ 'HX-Redirect':'https://cdn.example/file' } }));
  const r=await c.providerFetch('https://example.com');
  assert.equal(r.headers.get('hx-redirect'),'https://cdn.example/file');
});
test('HTTP URL helper resolves paths and preserves signed parameters',() => {
  const c=load('4khdhub',fourKRoute);
  const cases=[
    ['../file.mkv?sig=a%2Bb&token=x#part','https://example.com/a/b/index','https://example.com/a/file.mkv?sig=a%2Bb&token=x#part'],
    ['//cdn.example/file','https://example.com','https://cdn.example/file'],
    ['?token=a','https://example.com/a/b?old=x','https://example.com/a/b?token=a'],
    ['#part','https://example.com/a?token=x','https://example.com/a?token=x#part']
  ];
  for(const [input,base,expected] of cases) assert.equal(c.providerHttpUrl(input,base),expected);
  const u=new c.ProviderURL('https://old.example/file?sig=x');u.hostname='new.example';
  assert.equal(u.toString(),'https://new.example/file?sig=x');
});
test('HDHub4u learns the search endpoint from its own page and caches it',async () => {
  let configRequests=0;
  const c=load('hdhub4u',url => {
    if(url.includes('domains.json')) return {body:{HDHUB4u:'https://hdhub4u.example'}};
    if(url.includes('/search.html')) { configRequests++;return {body:'<script>const CONFIG = { proxyUrl: "https://search.example/collections/post/documents/search" };</script>'}; }
    if(url.includes('search.example/collections')) return {body:{hits:[{document:{post_title:'Example (2026)',permalink:'/example'}}]}};
    throw Error('Unexpected request '+url);
  });
  const hits=await c.searchPrimary('Example');
  assert.equal(hits[0].title,'Example (2026)');
  await c.searchPrimary('Example');
  assert.equal(configRequests,1);
});
test('release details do not cause an exact series title to be rejected',() => {
  const c=load('hdhub4u',() => ({body:''}));
  const result={title:'East of Eden (Season 1) WEB-DL [Hindi (DD5.1) & English] 4K 1080p 720p & 480p [x264/10Bit-HEVC] | [ALL Episodes] | NF Series',year:null};
  assert.equal(c.findBestTitleMatch({title:'East of Eden',year:2026},[result],'tv',1),result);
});
test('resolution numbers are not parsed as movie release years',async () => {
  const c=load('hdhub4u',url => {
    if(url.includes('domains.json'))return {body:{HDHUB4u:'https://hdhub4u.example'}};
    if(url.includes('/search.html'))return {body:''};
    return {body:{hits:[{document:{post_title:'Example WEB-DL 1080p 2160p',permalink:'/example'}}]}};
  });
  const hits=await c.searchPrimary('Example');
  assert.equal(hits[0].year,null);
  assert.ok(c.findBestTitleMatch({title:'Example',year:2026},hits,'movie'));
});
test('HDHub4u extracts only the requested episode and stops at native HR wrappers',async () => {
  const html='<h3>Episode 1</h3><p><a href="https://cdn.example/one.mkv">Download</a></p><hr><h3>Episode 2</h3><p><a href="https://cdn.example/two.mkv">Download</a></p><hr>';
  const c=load('hdhub4u',() => ({body:html}));
  c.getCurrentDomain=async () => 'https://hdhub4u.example';
  const result=await c.getDownloadLinks('https://hdhub4u.example/show','tv',1);
  assert.equal(result.finalLinks.length,1);
  assert.equal(result.finalLinks[0].url,'https://cdn.example/one.mkv');
  assert.equal(result.finalLinks[0].episode,1);
});
test('quality subheadings stay attached to their episode',async () => {
  const html='<h3>Episode-02</h3><h4>720p <a href="https://cdn.example/two720.mkv">Drive</a></h4><h4>1080p <a href="https://cdn.example/two1080.mkv">Drive</a></h4><hr><h3>Episode-03</h3><h4><a href="https://cdn.example/three.mkv">Drive</a></h4>';
  const c=load('hdhub4u',() => ({body:html}));c.getCurrentDomain=async () => 'https://hdhub4u.example';
  const result=await c.getDownloadLinks('https://hdhub4u.example/show','tv',2);
  assert.equal(result.finalLinks.length,2);
  assert.ok(result.finalLinks.every(x => x.url.includes('/two')));
});
