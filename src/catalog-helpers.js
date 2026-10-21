// Generic catalog and host helpers used by Joya9TV. Removed provider entry points are not retained.
var catalogParser = require('cheerio-without-node-native');
var catalogHeaders = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8' };

function catalogAsync(generator) {
  return new Promise((resolve,reject) => {
    const iterator = generator();
    function step(method,value) {
      let item;
      try { item=iterator[method](value); } catch(error) { reject(error); return; }
      if(item.done) resolve(item.value);
      else Promise.resolve(item.value).then(v=>step('next',v),e=>step('throw',e));
    }
    step('next');
  });
}

function catalogText(url, options) {
  return providerFetch(url,Object.assign({headers:catalogHeaders},options || {})).then(r=>r.text());
}

function catalogNormalize(text) {
  return String(text || '').replace(/\[[^\]]*\]/g,' ').replace(/\((?:19|20)\d{2}\)/g,' ')
    .replace(/\b(?:season\s*\d+|s\d{1,2})\b/gi,' ').split(/\b(?:WEB[ .-]?DL|WEBRip|BluRay)\b/i)[0]
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

function catalogBest(results, title, year, season) {
  const wanted=catalogNormalize(title);
  let best=null,score=-1;
  results.forEach(item=>{
    const name=catalogNormalize(item.title);
    if(!name || (name!==wanted && !name.startsWith(wanted+' '))) return;
    const y=item.title.match(/\b(19\d{2}|20\d{2})\b/);
    if(!season && year && y && Math.abs(Number(y[1])-year)>1) return;
    const s=item.title.match(/\bseason\s*(\d+)|\bs(\d{1,2})\b/i);
    if(season && s && Number(s[1] || s[2])!==season) return;
    const value=(name===wanted?10:2)+(y && Number(y[1])===year?2:0)+(s?1:0);
    if(value>score) {best=item;score=value;}
  });
  return best;
}

function catalogAnchor($,el,base) {
  const a=$(el);
  let href=a.attr('href') || '';
  const encoded=a.attr('data-dl');
  if(encoded) {
    try {
      let state=parseInt(a.attr('data-ds') || '0',16)>>>0;
      const rounds=Math.min(10000,Math.max(0,Number(a.attr('data-dr') || 0)));
      const next=()=>state=(Math.imul(state,1103515245)+12345)>>>0;
      for(let i=0;i<rounds;i++) next();
      const bytes=catalogHosts.decode(encoded);href='';
      for(let i=0;i<bytes.length;i++) href+=String.fromCharCode(bytes.charCodeAt(i)^((next()>>>16)&255));
    } catch(_) {return null;}
  }
  if(!href || href==='#') return null;
  const id=href.match(/[?&]id=([^&]+)/);
  if(id) {
    try {
      const decoded=catalogHosts.decode(decodeURIComponent(id[1])).replace(/newgo32.*$/i,'').trim();
      if(providerHttpUrl(decoded)) href=decoded;
    } catch(_) {}
  }
  return providerHttpUrl(href,base);
}

function catalogPlayable(url) {
  return !!providerHttpUrl(url) && (/\.(m3u8|mpd|mp4|mkv|avi)(?:$|[?#])/i.test(url) || /\/api\/file\//i.test(url) || /googleusercontent\.com\//i.test(url));
}

function catalogResolve(url,meta,depth,seen) {
  return catalogAsync(function* () {
    if(!url || depth>4 || seen.has(url)) return [];
    seen.add(url);
    if(catalogPlayable(url)) {
      let name=meta;
      try { const filename=decodeURIComponent(new ProviderURL(url).pathname.split('/').pop()); if(providerResolution(filename) || providerReleaseLabel(filename)) name=filename; } catch(_) {}
      return [{url,source:'Direct',fileName:name}];
    }
    const host=new ProviderURL(url).hostname;
    if(/(?:hubcloud|hubdrive|hubcdn|hblinks|hubstream|vidstack|pixeldrain|streamtape)/i.test(host)) {
      return yield catalogHosts.resolve(url);
    }
    // A signed file URL need not have an extension. Inspect headers first so
    // the JavaScript helper doesn't read a video into memory as HTML.
    try {
      const head=yield providerFetch(url,{method:'HEAD',headers:catalogHeaders});
      const contentType=head.headers.get('content-type') || '';
      const disposition=head.headers.get('content-disposition') || '';
      if(/^video\//i.test(contentType) || /filename[^;]*\.(?:mp4|mkv|m3u8)/i.test(disposition)) return [{url:head.url || url,source:'Direct',fileName:meta}];
      if(Number(head.headers.get('content-length'))>4194304) return [];
    } catch(_) {}
    const html=yield catalogText(url),$=catalogParser.load(html);
    const fileName=$('.card-header,h1').first().text().trim() || meta;
    const next=[];
    $('video source, source, video').each((_,el)=>{
      const link=providerHttpUrl($(el).attr('src'),url);if(link) next.push(link);
    });
    $('a.fsl-download,a.dlh-cta,a.gpx-btn,a.dlbtn-download,.gdl-action-wrap a,.mlbd-download-button-wrap a,a[data-host],a.btn-primary').each((_,el)=>{
      const link=catalogAnchor($,el,url);if(link) next.push(link);
    });
    const media=html.match(/(?:file|source|src)\s*[:=]\s*["'](https?:[^"']+\.(?:mp4|m3u8|mkv)(?:\?[^"']*)?)["']/ig) || [];
    media.forEach(chunk=>{const match=chunk.match(/["'](https?:[^"']+)["']/i);if(match) next.push(match[1].replace(/\\\//g,'/'));});
    const token=html.match(/file_token\s*:\s*['"]([a-z0-9]+)['"]/i);
    if(token && /neoxcloud/i.test(host)) {
      // Follow the same public button request as the page, without browser JS.
      for(const service of ['neocloud_instant','neocloud']) {
        try {
          const response=yield providerFetch(new ProviderURL(url).origin+'/panel/get_cloud_token.php',{
            method:'POST',headers:Object.assign({},catalogHeaders,{'Content-Type':'application/json',Referer:url}),
            body:JSON.stringify({file_token:token[1],cloud_service:service,request_type:'download'})
          });
          const data=yield response.json();const target=providerHttpUrl(data.url || data.streaming_url,url);if(target) next.push(target);
        } catch(_) {}
      }
    }
    const result=[];
    for(const target of [...new Set(next)].slice(0,8)) {
      try {const links=yield catalogResolve(target,fileName,depth+1,seen);result.push(...links);} catch(_) {}
    }
    return result;
  });
}
