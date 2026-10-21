// Run after copying this update into an existing checkout. No .git or user settings are touched.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
if(m.scrapers.some(x=>['cinefreak','moviedekhun','movielinkbd'].includes(x.id)) || !fs.existsSync(path.join(root,'src/catalog-helpers.js'))) {
 console.error('Copy the complete 2.2.1 update into this checkout first.');process.exit(1);
}
for(const file of ['providers/cinefreak.js','providers/moviedekhun.js','providers/movielinkbd.js','src/upstream/cinefreak.js','src/additional-providers.json','src/catalog-adapters.js','tests/additional-providers.test.cjs']) {
 const p=path.join(root,file);if(fs.existsSync(p)){fs.unlinkSync(p);console.log('Removed '+file);}
}
const upstream=path.join(root,'src/upstream');if(fs.existsSync(upstream)&&!fs.readdirSync(upstream).length)fs.rmdirSync(upstream);
console.log('Cleanup complete. Active providers: '+m.scrapers.map(x=>x.name).join(', '));
