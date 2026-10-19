// Readable adapters for the three additional catalog sites. They share the
// existing host resolvers, but never return a catalog/player HTML page as video.
var catalogParser = require('cheerio-without-node-native');
var catalogDomains = { data: {}, time: 0 };
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
function catalogBase(config) {
  // Explicitly pinned current site must not be overwritten by a stale registry.
  if(config.preferBase) return Promise.resolve(config.base.replace(/\/$/,''));
  return catalogAsync(function* () {
    if(Date.now()-catalogDomains.time>3600000) {
      try {
        const r=yield providerFetch('https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json');
        catalogDomains.data=yield r.json();catalogDomains.time=Date.now();
      } catch(_) {}
    }
    const registered=catalogDomains.data[config.id] || (config.id==='movielinkbd' && catalogDomains.data.movielinkdb);
    return (providerHttpUrl(registered) || config.base).replace(/\/$/,'');
  });
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
function catalogSearch(config,base,title) {
  return catalogAsync(function* () {
    if(config.id==='cinefreak') {
      const r=yield providerFetch(base+'/search-api.php?q='+encodeURIComponent(title)+'&pg=1');
      const data=yield r.json();
      return (data.results || []).map(x=>({title:x.t || x.title || '',url:providerHttpUrl(x.l || x.url,base+'/')})).filter(x=>x.url);
    }
    const url=base+(config.id==='movielinkbd'?'/search?q=':'/?s=')+encodeURIComponent(title);
    const $=catalogParser.load(yield catalogText(url));
    const found=[],seen=new Set();
    // MovieDekhun's theme uses anchors rather than standard WP post headings.
    const selector=config.id==='movielinkbd'?'.movie-card a, .ml-card a': 'a[href]';
    $(selector).each((_,el)=>{
      const link=$(el),href=providerHttpUrl(link.attr('href'),base+'/');
      const text=link.attr('title') || link.find('h2,h3,h4,.title').text() || link.text();
      if(href && text.trim() && !seen.has(href)) {seen.add(href);found.push({url:href,title:text.trim()});}
    });
    return found;
  });
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
function catalogEpisode(text) {
  const m=String(text || '').match(/\b(?:episode|epi|ep|e)\s*[-.:]?\s*0*(\d+)\b/i);
  return m?Number(m[1]):null;
}
function catalogLinks($,base,type,season,episode) {
  const found=[],seen=new Set();
  function add(el,label) {
    const url=catalogAnchor($,el,base);
    if(!url || seen.has(url) || /\.(?:zip|rar|7z)(?:$|[?#])/i.test(url)) return;
    seen.add(url);found.push({url,title:label || $(el).text().trim()});
  }
  if(type==='tv') {
    $('.ep-card').each((_,card)=>{
      const node=$(card),text=node.find('.episode-badge,.mlbd-episode-title').text();
      const sn=node.attr('data-season-number') || (node.find('.season-number').text().match(/S(\d+)/i) || [])[1];
      const en=node.attr('data-episode-number') || catalogEpisode(text);
      if(Number(sn || 1)!==season || Number(en)!==episode) return;
      node.find('.download-links a, a.mlbd-episode-download-btn, a[data-dl]').each((_,a)=>add(a,$(a).text()));
    });
    if(!found.length) {
      let current=null,currentSeason=season;
      $('h2,h3,h4,h5,p').each((_,el)=>{
        const node=$(el),text=node.text();
        const sm=text.match(/\bseason\s*(\d+)|\bS(\d{1,2})\b/i);
        if(sm) currentSeason=Number(sm[1] || sm[2]);
        const ep=catalogEpisode(text);
        if(ep!==null) current=ep;
        if(current===episode && currentSeason===season) node.find('a[href],a[data-dl]').each((_,a)=>add(a,text));
      });
    }
  } else {
    // Current CineFreak rows include hidden decoy siblings before the real buttons.
    $('.download-links-div .cf-src-row').each((_,row)=>{
      const node=$(row),text=node.find('h4.movie-title').text();
      node.find('.dlbtn-container a.dlbtn-download, .dlbtn-container a.dlbtn-watch').each((_,a)=>add(a,text+' '+$(a).text()));
    });
    if(!$('.download-links-div .cf-src-row').length) $('.download-links-div h4.movie-title').each((_,heading)=>{
      const text=$(heading).text();
      $(heading).next().find('a.dlbtn-download').each((_,a)=>add(a,text+' '+$(a).text()));
    });
    $('.mlbd-download-button-wrap a, .download-links a, a[data-dl]').each((_,a)=>add(a,$(a).text()));
    // Only explicit download/watch anchors, never a page's general site tags.
    if(!found.length) $('a[href]').each((_,a)=>{
      const text=$(a).text().trim(),href=$(a).attr('href') || '';
      if(/download|watch online/i.test(text) || /\.(mkv|mp4|m3u8)(?:$|[?#])/i.test(href)) add(a,text);
    });
  }
  return found;
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
function catalogGetStreams(config,id,type,season,episode) {
  return catalogAsync(function* () {
    const response=yield providerFetch('https://api.themoviedb.org/3/'+type+'/'+id+'?api_key=439c478a771f35c05022f9feabcca01c');
    const tmdb=yield response.json(),title=tmdb.title || tmdb.name;
    if(!title) return [];
    const date=tmdb.release_date || tmdb.first_air_date || '',year=Number(date.slice(0,4)) || null;
    const base=yield catalogBase(config),hits=yield catalogSearch(config,base,title);
    const match=catalogBest(hits,title,year,type==='tv'?season:null);
    if(!match) {console.log('['+config.name+'] No matching catalog result');return [];}
    const $=catalogParser.load(yield catalogText(match.url));
    const candidates=catalogLinks($,match.url,type,season,episode);
    const groups=yield Promise.all(candidates.slice(0,24).map(item=>
      catalogResolve(item.url,item.title,0,new Set()).then(links=>links.map(link=>{
        const filename=link.fileName || item.title;
        const label=providerReleaseLabel(filename,item.title),range=catalogHosts.range(filename) || catalogHosts.range(item.title);
        const codec=providerCodec(filename) || providerCodec(item.title);
        const height=providerResolution(filename) || providerResolution(item.title) || providerRank(link.quality);
        return {
          name:[config.name+(height?' '+height+'p':''),label,range,codec].filter(Boolean).join(' | '),
          title:[filename,providerDetails(filename)].filter(Boolean).join('\n'),
          url:link.url,quality:height?height+'p':undefined,
          headers:link.headers,subtitles:link.subtitles,
          behaviorHints:{bingeGroup:config.id+'-'+(label || '')+'-'+(range || '')+'-'+(codec || '')}
        };
      })).catch(error=>{console.log('['+config.name+'] '+error.message);return [];})));
    const streams=groups.reduce((all,part)=>all.concat(part),[]);
    console.log("["+config.name+"] "+candidates.length+" candidate links, "+streams.length+" playable entries");
    return streams;
  });
}
