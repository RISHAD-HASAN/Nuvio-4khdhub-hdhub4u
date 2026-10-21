const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const parser=require('./helpers/nuvio-parser.cjs');
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
test('manifest has exactly the three configured providers',()=>{
 const m=require('../manifest.json');assert.deepEqual(m.scrapers.map(x=>x.id),['4khdhub','hdhub4u','joya9tv']);
 for(const item of m.scrapers)assert.ok(fs.existsSync(item.filename));
});
test('catalog matching does not use an unrelated first hit',()=>{
 const c=load('joya9tv',()=>({body:''}));
 assert.equal(c.catalogBest([{title:'Other (2026)',url:'https://example.com'}],'Example',2026,null),null);
 assert.equal(c.catalogBest([{title:'Example (1990)',url:'https://example.com'}],'Example',2026,null),null);
});
test('generic encoded download link decoding works without browser atob',()=>{
 const c=load('joya9tv',()=>({body:''}));let state=1234;
 const link='https://cdn.example/movie.mkv';let binary='';
 for(const char of link){state=(Math.imul(state,1103515245)+12345)>>>0;binary+=String.fromCharCode(char.charCodeAt(0)^((state>>>16)&255));}
 const $=parser.load(`<a data-ds="4d2" data-dr="0" data-dl="${Buffer.from(binary,'binary').toString('base64')}">Download</a>`);
 assert.equal(c.catalogAnchor($,$('a').get(0),'https://example.com'),link);
});
test('HTML intermediate pages are not returned as playable streams',async()=>{
 const c=load('joya9tv',()=>({body:'<h1>Not a video</h1><a href="https://ads.example">advertisement</a>'}));
 assert.equal((await c.catalogResolve('https://file.example/page','1080p',0,new Set())).length,0);
});
test('signed media without extension is recognized by HEAD, not downloaded',async()=>{
 let gets=0;
 const c=load('joya9tv',(_,options)=>{if(options.method!=='HEAD')gets++;return {body:'',headers:{'Content-Type':'video/mp4'}};});
 const links=await c.catalogResolve('https://cdn.example/signed?id=1','1080p',0,new Set());
 assert.equal(links.length,1);assert.equal(gets,0);
});
test('unknown range and source are omitted in additional providers too',()=>{
 const c=load('joya9tv',()=>({body:''}));assert.equal(c.providerReleaseLabel('Example 1080p'),null);assert.equal(c.catalogHosts.range('Example 1080p H265'),null);
});
test('repository permits users to enable all three providers',()=>{
 const m=require('../manifest.json');assert.ok(m.scrapers.every(x=>x.enabled===true));
});
test('removed providers and their upstream source are absent',()=>{
 for(const id of ['cinefreak','moviedekhun','movielinkbd'])assert.equal(fs.existsSync('providers/'+id+'.js'),false);
 assert.equal(fs.existsSync('src/upstream/cinefreak.js'),false);
 assert.equal(fs.existsSync('src/additional-providers.json'),false);
});
