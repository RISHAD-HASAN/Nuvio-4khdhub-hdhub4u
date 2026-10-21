const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const parser=require('./helpers/nuvio-parser.cjs');
function load(route=()=>({body:''})) {
 const logs=[],requests=[];
 const c={module:{exports:{}},console:{log:(...x)=>logs.push(x.join(' ')),error:(...x)=>logs.push(x.join(' '))},
  require:n=>n==='cheerio-without-node-native'?parser:require(n),fetch:(url,opts={})=>{
   requests.push({url:String(url),opts});const r=route(String(url),opts);
   const body=typeof r.body==='string'?r.body:JSON.stringify(r.body || {});
   return Promise.resolve({ok:(r.status||200)<400,status:r.status||200,url:r.url || String(url),headers:r.headers || {},text:()=>body});
  }};
 vm.createContext(c);vm.runInContext(fs.readFileSync('providers/joya9tv.js','utf8'),c);c.logs=logs;c.requests=requests;return c;
}
const card=(title='Example',year='2026')=>`<article class="item movies"><div class="data"><h3><a href="/movies/example/">${title}</a></h3><span class="year">${year}</span></div></article>`;
const rows=(url,quality='1080p NF WEBRip SDR H265')=>`<div id="download"><div class="links_table"><table><tbody><tr><td><a href="${url}">Download</a></td><td><strong class="quality">${quality}</strong></td><td></td><td>2 GB</td></tr></tbody></table></div></div>`;
test('Joya search parses original article layout and relative URLs without native URL',()=>{
 const c=load();const hits=c.joyaSearch(card(),'https://joya9tv1.com');
 assert.equal(hits.length,1);assert.equal(hits[0].url,'https://joya9tv1.com/movies/example/');assert.equal(hits[0].title,'Example (2026)');
});
test('Joya search parses result-item title attributes and deduplicates',()=>{
 const c=load(),html='<div class="result-item"><article><a href="/movies/example/" title="Example (2026)"><img alt="Example"></a></article></div>';
 assert.equal(c.joyaSearch(html+html,'https://joya9tv1.com').length,1);
});
test('Joya rows preserve individual metadata rather than page-wide HDR',()=>{
 const c=load(),r=c.joyaRows('<h1>Example HDR</h1>'+rows('https://cdn.example/a.mkv','720p WEBRip SDR H264'),'https://joya9tv1.com/movie','movie');
 assert.equal(r.length,1);assert.match(r[0].title,/720p WEBRip SDR H264/);assert.doesNotMatch(r[0].title,/HDR/);
});
test('Joya exact episode and season selected without parent or closest',()=>{
 const c=load(),html='<h2>Season 1</h2><p class="font-bold">Episode 1 Links</p><div><a href="https://cdn.example/1.mkv">720p</a></div><p class="font-bold">Episode 2 Links</p><div><a href="https://cdn.example/2.mkv">1080p</a></div><h2>Season 2</h2><p class="font-bold">Episode 2 Links</p><a href="https://cdn.example/wrong.mkv">1080p</a>';
 const r=c.joyaEpisodeLinks(html,'https://files.example',1,2);assert.equal(r.length,1);assert.match(r[0].url,/\/2.mkv$/);
});
test('Joya episode packs and ranges are not mistaken for single episodes',()=>{
 const c=load();assert.equal(c.joyaEpisodeLinks('<p class="font-bold">Episode 1-10 Links</p><a href="https://cdn.example/pack.mkv">Pack</a>','https://example.com',1,1).length,0);
});
for(const type of ['movie','tv'])test('Joya '+type+' full mocked flow in restricted runtime',async()=>{
 const media='https://cdn.example/Example.1080p.NF.WEBRip.SDR.H265.mkv';
 const c=load((url,opts)=>{
  if(url.includes('themoviedb'))return {body:{title:'Example',name:'Example',release_date:'2026-01-01',first_air_date:'2026-01-01'}};
  if(url.includes('/?s='))return {body:card()};
  if(url==='https://joya9tv1.com/movies/example/')return {body:rows('https://files.example/release')};
  if(url==='https://files.example/release' && opts.method==='HEAD')return {body:'',headers:{'Content-Type':'text/html'}};
  if(url==='https://files.example/release')return {body:type==='tv'?`<p class="font-bold">Episode 1 Links</p><a href="https://cdn.example/wrong.mkv">720p</a><p class="font-bold">Episode 2 Links</p><a href="${media}">1080p</a>`:`<a class="btn-success" href="${media}">Download</a>`};
  throw Error('Unexpected request '+url);
 });
 const r=await c.module.exports.getStreams(123,type,type==='tv'?1:null,type==='tv'?2:null);
 assert.equal(r.length,1,c.logs.join('\n'));assert.equal(r[0].url,media);assert.equal(r[0].name,'Joya9TV 1080p | NF WEBRip | SDR | H.265');
});
test('Joya logs HTTP 403 at search stage, without claiming success',async()=>{
 const c=load(url=>url.includes('themoviedb')?{body:{title:'Example',release_date:'2026-01-01'}}:{status:403,body:'Forbidden'});
 assert.equal((await c.module.exports.getStreams(123,'movie')).length,0);assert.match(c.logs.join('\n'),/\[Joya9TV\]\[search\] HTTP 403/);
});
test('Joya rejects unrelated search hits',async()=>{
 const c=load(url=>url.includes('themoviedb')?{body:{title:'Example',release_date:'2026-01-01'}}:{body:card('Unrelated')});
 assert.equal((await c.module.exports.getStreams(123,'movie')).length,0);assert.match(c.logs.join('\n'),/No title\/year match/);
});
test('Joya rejects mismatched release years',()=>{
 const c=load();assert.equal(c.catalogBest(c.joyaSearch(card('Example','1999'),'https://joya9tv1.com'),'Example',2026,null),null);
});
test('Joya signed media uses HEAD and does not GET video body',async()=>{
 const c=load((_,opts)=>{assert.equal(opts.method,'HEAD');return {body:'',headers:{'Content-Type':'video/mp4'}};});
 const r=await c.joyaResolve('https://cdn.example/signed?id=1','720p', {requests:0},0,new Set(),'movie',null,null,false);
 assert.equal(r.length,1);assert.equal(c.requests.length,1);
});
test('Joya does not return arbitrary HTML or advertisement anchors as media',async()=>{
 const c=load(()=>({body:'<a href="https://ads.example">Advertisement</a>',headers:{'content-type':'text/html'}}));
 assert.equal((await c.joyaResolve('https://files.example/page','1080p',{requests:0},0,new Set(),'movie',null,null,false)).length,0);
});
test('Joya request budget bounds unknown-host traversal',async()=>{
 const c=load();await assert.rejects(c.joyaPage('https://files.example','test',{requests:36}),/budget exhausted/);assert.equal(c.requests.length,0);
});
test('Joya missing range/source omitted instead of guessed',()=>{
 const c=load();assert.equal(c.providerReleaseLabel('1080p'),null);assert.equal(c.catalogHosts.range('1080p'),null);
});
test('Joya URL loops terminate',async()=>{
 const c=load(()=>({body:'<a class="btn-success" href="https://files.example/loop">Download</a>'}));
 const r=await c.joyaResolve('https://files.example/loop','720p',{requests:0},0,new Set(),'movie',null,null,false);assert.equal(r.length,0);assert.ok(c.requests.length<=2);
});
test('Joya FilePress public button sequence retains playable results',async()=>{
 const media='https://cdn.example/file.720p.mkv';const c=load((url,opts)=>{
  if(opts.method==='HEAD')return {body:'',headers:{'content-type':'text/html'}};
  if(url.endsWith('/api/file/downlaod/')){assert.equal(JSON.parse(opts.body).id,'abc');return {body:{status:true,data:'public-token'}};}
  if(url.endsWith('/api/file/downlaod2/')){assert.equal(JSON.parse(opts.body).id,'public-token');return {body:{data:[media]}};}
  return {body:'<h1>FilePress</h1>'};
 });
 const r=await c.joyaResolve('https://filepress.example/file/abc','720p',{requests:0},0,new Set(),'movie',null,null,false);assert.equal(r.length,1);assert.equal(r[0].url,media);
 assert.ok(c.requests.every(x=>!x.opts.headers || !x.opts.headers.Cookie));
});
test('Joya manifest is enabled and references a standalone provider',()=>{
 const p=require('../manifest.json').scrapers.find(x=>x.id==='joya9tv');assert.equal(p.enabled,true);assert.ok(fs.existsSync(p.filename));
});
test('Joya current MultiCloud premium button resolves via media headers and filename',async()=>{
 const filename='Pressure Cooker (2026) WEBRip H264 AAC 720p.mkv';
 const c=load((url,opts)=>{
  if(url==='https://cdn.example/d/signed')return {body:'',headers:{'Content-Type':'video/matroska','Content-Disposition':'attachment; filename="'+filename+'"'}};
  if(opts.method==='HEAD')return {body:'',headers:{'Content-Type':'text/html'}};
  return {body:'<a href="/login">Login</a><a href="/about.php">About</a><a class="premium-btn" href="https://cdn.example/d/signed">Turbo Download</a>'};
 });
 const r=await c.joyaResolve('https://new3.multicloudlinks.com/view/abc','720p',{requests:0},0,new Set(),'movie',null,null,false);
 assert.equal(r.length,1);assert.equal(r[0].fileName,filename);assert.ok(c.requests.every(x=>!x.url.includes('/login') && !x.url.includes('/about.php')));
});
test('Joya prefers the public MultiCloud route before slower mirror fallbacks',async()=>{
 const c=load((url,opts)=>{
  assert.ok(!url.includes('gdxfiles'),'Should not need mirror after successful extraction');
  if(url==='https://new3.multicloudlinks.com/view/abc' && opts.method==='HEAD')return {body:'',headers:{'content-type':'video/mp4'}};
  if(opts.method==='HEAD')return {body:''};
  return {body:'<a href="https://gdxfiles.com/file/abc">GDx</a><a href="https://new3.multicloudlinks.com/view/abc">MultiCloud</a>'};
 });
 assert.equal((await c.joyaResolve('https://joya9links.com/view/abc','720p',{requests:0},0,new Set(),'movie',null,null,false)).length,1);
});
test('Joya octet-stream video filename is accepted without downloading the file',async()=>{
 const c=load((_,opts)=>{assert.equal(opts.method,'HEAD');return {body:'',headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="movie.1080p.mkv"','Content-Length':'900000000'}};});
 assert.equal((await c.joyaResolve('https://cdn.example/signed','1080p',{requests:0},0,new Set(),'movie',null,null,false)).length,1);
});
test('Joya release labels do not misinterpret SD as an OTT tag',async()=>{
 const c=load((url,opts)=>{
  if(url.includes('themoviedb'))return {body:{title:'Example',release_date:'2026-01-01'}};
  if(url.includes('/?s='))return {body:card()};
  if(url.includes('/movies/'))return {body:rows('https://cdn.example/signed','SD 480p')};
  return {body:'',headers:{'Content-Type':'video/matroska','Content-Disposition':'attachment; filename="Example WEB-DL H264 AAC 480p.mkv"'}};
 });
 const r=await c.module.exports.getStreams(123,'movie');assert.equal(r[0].name,'Joya9TV 480p | WEB-DL | H.264');assert.doesNotMatch(r[0].title.split('\n').slice(1).join('\n'),/AAC 4/);
});
