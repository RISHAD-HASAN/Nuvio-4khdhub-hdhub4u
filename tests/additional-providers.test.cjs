const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const parser=require('./helpers/nuvio-parser.cjs');
const configs=require('../src/additional-providers.json');
function load(id,route) {
 const logs=[];
 const c={module:{exports:{}},console:{log:(...args)=>logs.push(args.join(' ')),error:(...args)=>logs.push(args.join(' '))},
 require:n=>n==='cheerio-without-node-native'?parser:require(n),
 fetch:(url,opts={})=>{
  const item=route(String(url),opts);
  const body=typeof item.body==='string'?item.body:JSON.stringify(item.body || {});
  return Promise.resolve({ok:(item.status || 200)<400,status:item.status || 200,url:String(url),headers:item.headers || {},text:()=>body});
 }};
 vm.createContext(c);vm.runInContext(fs.readFileSync(`providers/${id}.js`,'utf8'),c);c.logs=logs;return c;
}
for(const cfg of configs.filter(x=>x.id!=='cinefreak')) for(const type of ['movie','tv']) test(`${cfg.name}: ${type} pipeline without URL, timers or closest()`,async()=>{
 const media='https://cdn.example/Example.1080p.MA.WEB-DL.SDR.H265.mkv';
 const c=load(cfg.id,url=>{
  if(url.includes('themoviedb'))return {body:{title:'Example',name:'Example',release_date:'2026-01-01',first_air_date:'2026-01-01'}};
  if(url.includes('domains.json'))return {body:{[cfg.id]:'https://catalog.example'}};
  if(url.includes('search-api.php'))return {body:{results:[{t:'Example (2026)',l:'https://catalog.example/example'}]}};
  if(url.includes('/search?q=')||url.includes('/?s='))return {body:'<div class="movie-card"><a class="title" href="https://catalog.example/example">Example (2026)</a></div>'};
  if(url==='https://catalog.example/example') {
   if(type==='tv')return {body:`<div class="ep-card" data-season-number="1" data-episode-number="2"><div class="download-links"><a href="${media}">1080p</a></div><a class="mlbd-episode-download-btn" href="${media}">1080p</a></div><div class="ep-card" data-season-number="1" data-episode-number="3"><div class="download-links"><a href="https://cdn.example/wrong.mkv">wrong episode</a></div></div>`};
   return {body:`<div class="download-links-div"><h4 class="movie-title">1080p</h4><div><a class="dlbtn-download" href="${media}">Download</a></div></div><div class="mlbd-download-button-wrap"><a href="${media}">Download 1080p</a></div><p><a href="${media}">Download Now [1080p]</a></p>`};
  }
  throw Error('Unexpected network '+url);
 });
 const streams=await c.module.exports.getStreams(123,type,type==='tv'?1:null,type==='tv'?2:null);
 assert.equal(streams.length,1,c.logs.join('\n'));
 assert.equal(streams[0].url,media);
 assert.equal(streams[0].name,`${cfg.name} 1080p | MA WEB-DL | SDR | H.265`);
});
test('manifest has exactly the five requested providers',()=>{
 const m=require('../manifest.json');assert.deepEqual(m.scrapers.map(x=>x.id),['4khdhub','hdhub4u','cinefreak','moviedekhun','movielinkbd']);
 for(const item of m.scrapers)assert.ok(fs.existsSync(item.filename));
});
test('catalog matching does not use an unrelated first hit',()=>{
 const c=load('moviedekhun',()=>({body:''}));
 assert.equal(c.catalogBest([{title:'Other (2026)',url:'https://example.com'}],'Example',2026,null),null);
 assert.equal(c.catalogBest([{title:'Example (1990)',url:'https://example.com'}],'Example',2026,null),null);
});
test('MovieLinkBD data-dl link decoding works without browser atob',()=>{
 const c=load('movielinkbd',()=>({body:''}));let state=1234;
 const link='https://cdn.example/movie.mkv';let binary='';
 for(const char of link){state=(Math.imul(state,1103515245)+12345)>>>0;binary+=String.fromCharCode(char.charCodeAt(0)^((state>>>16)&255));}
 const $=parser.load(`<a data-ds="4d2" data-dr="0" data-dl="${Buffer.from(binary,'binary').toString('base64')}">Download</a>`);
 assert.equal(c.catalogAnchor($,$('a').get(0),'https://example.com'),link);
});
test('HTML intermediate pages are not returned as playable streams',async()=>{
 const c=load('moviedekhun',()=>({body:'<h1>Not a video</h1><a href="https://ads.example">advertisement</a>'}));
 assert.equal((await c.catalogResolve('https://file.example/page','1080p',0,new Set())).length,0);
});
test('signed media without extension is recognized by HEAD, not downloaded',async()=>{
 let gets=0;
 const c=load('moviedekhun',(_,options)=>{if(options.method!=='HEAD')gets++;return {body:'',headers:{'Content-Type':'video/mp4'}};});
 const links=await c.catalogResolve('https://cdn.example/signed?id=1','1080p',0,new Set());
 assert.equal(links.length,1);assert.equal(gets,0);
});
test('unknown range and source are omitted in additional providers too',()=>{
 const c=load('moviedekhun',()=>({body:''}));assert.equal(c.providerReleaseLabel('Example 1080p'),null);assert.equal(c.catalogHosts.range('Example 1080p H265'),null);
});
test('episode selection never uses a season-pack link for another episode',()=>{
 const c=load('moviedekhun',()=>({body:''}));
 const $=parser.load('<div class="ep-card"><span class="season-number">S01</span><span class="episode-badge">Episode 1-10</span><div class="download-links"><a href="https://cdn.example/pack.zip">Pack</a></div></div>');
 assert.equal(c.catalogLinks($,'https://example.com','tv',1,2).length,0);
});
test('repository permits users to enable all five providers',()=>{
 const m=require('../manifest.json');assert.ok(m.scrapers.every(x=>x.enabled===true));
});
test('MovieLinkBD pins user-provided domain despite stale registry',async()=>{
 const c=load('movielinkbd',()=>{throw Error('Must not fetch stale registry');});
 c.catalogDomains.data={movielinkbd:'https://movielinkbd.tv'};c.catalogDomains.time=Date.now();
 assert.equal(await c.catalogBase(configs.find(x=>x.id==='movielinkbd')),'https://fpthzj.movielinkbd.at');
});
test('CineFreak is byte-for-byte the pinned upstream source',()=>{
 const crypto=require('node:crypto');
 const data=fs.readFileSync('providers/cinefreak.js');
 assert.deepEqual(data,fs.readFileSync('src/upstream/cinefreak.js'));
 assert.equal(crypto.createHash('sha256').update(data).digest('hex'),'422d7f2fc6c51ea3d4f77596382cd817b1d482997c46ff7509b6ce11b205404d');
});
