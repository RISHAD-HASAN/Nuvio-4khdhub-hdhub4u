const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const parser = require('./helpers/nuvio-parser.cjs');
function load(provider='4khdhub') {
  const c={module:{exports:{}},require:name => name==='cheerio-without-node-native'?parser:require(name),console};
  vm.createContext(c);vm.runInContext(fs.readFileSync(`providers/${provider}.js`,'utf8'),c);return c;
}
const c=load();
for (const [input,expected] of [
  ['Film.2160p.NF.WEB-DL.SDR.H265','NF WEB-DL'],
  ['Film.1080p.AMZN.WEB-DL','AMZN WEB-DL'],
  ['Film.DSNP.WEB-DL','DSNP WEB-DL'],
  ['Film.ATVP.WEB-DL','ATVP WEB-DL'],
  ['Film.HMAX.WEB-DL','HMAX WEB-DL'],
  ['Film.MA.2160p.WEB-DL','MA WEB-DL'],
  ['Film.GB.2160p.WEB-DL','GB WEB-DL'],
  ['Film.2160p.WEB-DL.SDR','WEB-DL'],
  ['Film.2160p.BluRay.REMUX.DV.HDR.H265','BluRay REMUX'],
  ['Film.2160p.BluRay.DV.HDR.H265','BluRay'],
  ['Film.1080p.BluRay.H265','BluRay'],
  ['Film.NF.BluRay.REMUX','BluRay REMUX'],
  ['Film.NF.1080p',null],
  ['Film.1080p.NF.WEBRip','NF WEBRip'],
  ['Film.1080p',null]
]) test(`source label: ${input}`,() => assert.equal(c.providerReleaseLabel(input),expected));
test('a generic host title keeps source and service from the release',() => {
  const m={title:'Film.2160p.NF.WEB-DL.SDR.H265',height:2160};
  const s=c.streamFromLink({source:'FSL',meta:{title:'HubCloud'}},m);
  assert.equal(s.name,'4KHDHub - FSL 2160p | NF WEB-DL | SDR | H.265');
});
test('filename source overrides a conflicting release heading',() => {
  assert.equal(c.providerReleaseLabel('Film.BluRay.H265','Film.NF.WEB-DL.REMUX'),'BluRay');
});
test('explicit REMUX can enrich a BluRay source across local metadata',() => {
  assert.equal(c.providerReleaseLabel('Film.BluRay.H265','REMUX'),'BluRay REMUX');
  assert.equal(c.providerReleaseLabel('Film.REMUX.H265','Film.BluRay'),'BluRay REMUX');
});
for (const [heading,source,range] of [
  ['Obsession (2160p BluRay REMUX DV HDR H265)','BluRay REMUX','Dolby Vision / HDR'],
  ['Obsession (2160p BluRay DV HDR H265)','BluRay','Dolby Vision / HDR'],
  ['Obsession (MA 2160p WEB-DL SDR H265)','MA WEB-DL','SDR'],
  ['Obsession (GB 2160p WEB-DL SDR HEVC)','GB WEB-DL','SDR']
]) test(`screenshot movie heading in restricted parser: ${heading}`,() => {
  const $=parser.load(`<div class="download-item"><div class="download-header">${heading}</div><div class="file-title">Obsession</div></div>`);
  const m=c.extractReleaseMeta($,$('.download-item').get(0),{});
  const stream=c.streamFromLink({source:'HubCloud 10Gbps',meta:{title:'HubCloud'}},m);
  assert.equal(stream.name,`4KHDHub - HubCloud 10Gbps 2160p | ${source} | ${range} | H.265`);
});
test('HDHub4u uses the same source labels',async () => {
  const h=load('hdhub4u');
  h.getTMDBDetails=async () => ({title:'Film',year:2026});
  h.search=async () => [{title:'Film',year:2026,url:'https://example.com'}];
  h.getDownloadLinks=async () => ({finalLinks:[{source:'HubCloud - FSL',fileName:'Film.2160p.AMZN.WEB-DL.H265',quality:2160,url:'https://example.com/video.mkv'}]});
  const streams=await h.module.exports.getStreams(123,'movie');
  assert.equal(streams[0].name,'HDHub4u FSL | AMZN WEB-DL | H.265');
});
for (const tag of ['MA','CRAVE','GB','APT','AN','NF','AMZN','DSNP','NEWOTT','SERVICE9']) {
  test(`raw tag ${tag} is preserved without a service allowlist`,() => {
    assert.equal(c.providerReleaseLabel(`Film.${tag}.2160p.WEB-DL.H265`),`${tag} WEB-DL`);
    assert.equal(c.providerReleaseLabel(`Film.1080p.${tag}.WEB-DL.H265`),`${tag} WEB-DL`);
    assert.equal(c.providerReleaseLabel(`Film.1080p.WEB-DL.${tag}.H265`),`${tag} WEB-DL`);
  });
}
test('technical and language tags are not platform labels',() => {
  assert.equal(c.providerReleaseLabel('Film.1080p.WEB-DL.MULTI.DDP5.1.ATMOS.10BIT.HINDI.H.265-GROUP'),'WEB-DL');
  assert.equal(c.providerReleaseLabel('Film.2160p.WEB-DL.H265 21.87 GB'),'WEB-DL');
});
test('multiple explicitly written raw tags stay raw',() => {
  assert.equal(c.providerReleaseLabel('Film.2160p.MA.AMZN.WEB-DL.H265'),'MA / AMZN WEB-DL');
});
