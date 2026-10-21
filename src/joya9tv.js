// Nuvio adaptation of the Joya9TV layouts documented by StreamX/Vega.
// No browser cookies, clearance tokens or access-control bypasses are imported.
var joyaBase = 'https://joya9tv1.com';
function joyaLog(stage, message) { console.log('[Joya9TV]['+stage+'] '+message); }
function joyaPage(url, stage, budget) {
  if (++budget.requests > 36) return Promise.reject(new Error('Request budget exhausted'));
  return catalogText(url,{headers:Object.assign({},catalogHeaders,{Referer:joyaBase+'/','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36','Accept-Language':'en-US,en;q=0.9'})})
    .catch(error=>{joyaLog(stage,error.message);throw error;});
}
function joyaSearch(html, base) {
  const $=catalogParser.load(html),out=[],seen=new Set();
  $('article.item.movies, article.item.tvshows, .result-item article').each((_,el)=>{
    const card=$(el),a=card.find('div.data h3 a, .title a, h3 a').first();
    const fallback=card.find('a').first();
    const url=providerHttpUrl(a.attr('href') || fallback.attr('href'),base+'/');
    let title=a.text().trim() || fallback.attr('title') || card.find('img').attr('alt') || fallback.text().trim();
    const year=card.find('.year').text().match(/\b(?:19|20)\d{2}\b/);
    if(year && !/\b(?:19|20)\d{2}\b/.test(title)) title+=' ('+year[0]+')';
    if(url && title && !seen.has(url)){seen.add(url);out.push({url,title});}
  });
  return out;
}
function joyaRows(html, base, type, season) {
  const $=catalogParser.load(html),out=[];
  $('#download .links_table table tbody tr').each((_,el)=>{
    const row=$(el),quality=row.find('strong.quality').text().trim(),a=row.find('td a').first();
    const url=providerHttpUrl(a.attr('href'),base);
    // Metadata stays local to this release, not the mixed-quality page title.
    const label=[quality,row.find('td:nth-child(4)').text().trim(),a.text().trim()].filter(Boolean).join(' ');
    const sn=label.match(/\bS(?:eason\s*)?0*(\d+)\b/i);
    if(type==='tv' && sn && Number(sn[1])!==season) return;
    if(url && quality) out.push({url,title:label});
  });
  return out;
}
function joyaEpisodeLinks(html, base, season, episode) {
  const $=catalogParser.load(html),out=[];let current=null,currentSeason=season;
  $('p.font-bold, h2, h3, h4, a[href]').each((_,el)=>{
    const node=$(el),href=node.attr('href'),text=node.text().trim();
    if(!href) {
      const sm=text.match(/\bseason\s*0*(\d+)\b|\bS0*(\d+)\b/i);
      if(sm){currentSeason=Number(sm[1]||sm[2]);current=null;}
      if(/\b(?:episode|ep)\b/i.test(text)) {
        const m=text.match(/\b(?:episode|ep)\s*0*(\d+)\s*(?:links)?\s*$/i);
        current=m?Number(m[1]):null; // Packs/ranges and ambiguous headings aren't episodes.
      }
    } else if(current===episode && currentSeason===season) {
      const url=providerHttpUrl(href,base);if(url)out.push({url,title:text});
    }
  });
  return out;
}
function joyaResolve(url, meta, state, depth, seen, type, season, episode, episodeSelected) {
  return catalogAsync(function* () {
    if(!url || depth>5 || seen.has(url)) return [];
    seen.add(url);
    const host=new ProviderURL(url).hostname;
    if(type==='movie' || episodeSelected) {
      if(catalogPlayable(url) || /(?:hubcloud|hubdrive|hubcdn|hblinks|hubstream|vidstack|pixeldrain|streamtape)/i.test(host)) {
        // Keep resolver recursion/request behavior contained within the existing host implementation.
        const result=yield catalogResolve(url,meta,0,new Set());
        return result.filter(x=>x && providerHttpUrl(x.url));
      }
      // Unknown signed endpoints are media only if their headers identify a video.
      if(++state.requests>36) throw new Error('Request budget exhausted');
      try {
        const r=yield providerFetch(url,{method:'HEAD',headers:catalogHeaders});
        const contentType=r.headers.get('content-type') || '';
        const disposition=r.headers.get('content-disposition') || '';
        const file=disposition.match(/filename\s*=\s*["']?([^"';]+)["']?/i);
        if(/^video\//i.test(contentType) || /application\/vnd\.apple\.mpegurl/i.test(contentType) || /filename[^;]*\.(?:mkv|mp4|m3u8)/i.test(disposition))
          return [{url:r.url || url,fileName:file?file[1]:meta,source:'Direct'}];
        if(Number(r.headers.get('content-length'))>4194304)return [];
      } catch(error) { joyaLog('host-head',error.message); }
    }
    const html=yield joyaPage(url,'host-page',state),$=catalogParser.load(html);
    if(type==='tv' && !episodeSelected) {
      const links=joyaEpisodeLinks(html,url,season,episode);
      joyaLog('episode','S'+season+'E'+episode+': '+links.length+' candidates');
      const result=[];
      for(const item of links.slice(0,8)) {
        try {result.push(...(yield joyaResolve(item.url,meta+' '+item.title,state,depth+1,seen,type,season,episode,true)));}
        catch(error){joyaLog('episode-host',error.message);}
      }
      return result;
    }
    const candidates=[],unique=new Set();
    function add(value) {
      const next=providerHttpUrl(value,url);
      if(next && !unique.has(next)){unique.add(next);candidates.push(next);}
    }
    $('video[src], video source[src]').each((_,el)=>add($(el).attr('src')));
    $('a[href]').each((_,el)=>{
      const a=$(el),href=providerHttpUrl(a.attr('href'),url);if(!href)return;
      const host=new ProviderURL(href).hostname,cls=a.attr('class') || '';
      const path=new ProviderURL(href).pathname;
      const hostRoute=/(?:hubcloud|hubdrive|hubcdn|gdflix|gdxfiles|filepress|pixeldrain|multicloudlinks)/i.test(host) && (/^\/(?:file|view|dl|d|api)\//i.test(path) || new ProviderURL(href).search);
      if(catalogPlayable(href) || hostRoute || /(?:^|\s)(?:btn-success|btn-primary|dlbtn-download|fsl-download|download-btn|premium-btn)(?:\s|$)/.test(cls)) add(href);
    });
    const redirect=html.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/i);
    if(redirect) {
      let target=redirect[1];
      try {const encoded=target.match(/[?&]r=([^&]+)/);if(encoded) target=catalogHosts.decode(decodeURIComponent(encoded[1]));} catch(_) {}
      add(target);
    }
    // FilePress uses two public download-button API calls. No saved session cookies.
    if(/filepress/i.test(host)) {
      try {
        const origin=new ProviderURL(url).origin,id=new ProviderURL(url).pathname.split('/').filter(Boolean).pop();
        const post=function(path,id) {
          if(++state.requests>36)return Promise.reject(new Error('Request budget exhausted'));
          return providerFetch(origin+path,{method:'POST',headers:Object.assign({},catalogHeaders,{'Content-Type':'application/json',Referer:origin}),body:JSON.stringify({id,method:'indexDownlaod',captchaValue:null})}).then(r=>r.json());
        };
        const token=yield post('/api/file/downlaod/',id);
        if(token.status && typeof token.data==='string') {
          const response=yield post('/api/file/downlaod2/',token.data);
          const links=Array.isArray(response.data)?response.data:[response.data];
          links.forEach(link=>{if(typeof link==='string')add(link);});
        }
      } catch(error){joyaLog('filepress',error.message);}
    }
    const result=[];
    // Prefer the current public MultiCloud path before slower mirror fallbacks.
    const priority=link=>/multidownload\.[^/]+\/d\//i.test(link)?3:/multicloudlinks\.[^/]+\/view\//i.test(link)?2:0;
    candidates.sort((a,b)=>priority(b)-priority(a));
    for(const next of candidates.slice(0,8)) {
      try{result.push(...(yield joyaResolve(next,meta,state,depth+1,seen,type,season,episode,true)));}
      catch(error){joyaLog('host-resolve',error.message);}
      if(result.length)break; // One confirmed extraction route per release; avoid slow mirror fan-out.
    }
    if(!result.length)joyaLog('host-resolve','No supported media found on '+host);
    return result;
  });
}
function joyaGetStreams(id,type,season,episode) {
  return catalogAsync(function* () {
    let stage='metadata';const budget={requests:0};
    try {
      const r=yield providerFetch('https://api.themoviedb.org/3/'+type+'/'+id+'?api_key=439c478a771f35c05022f9feabcca01c');
      const data=yield r.json(),title=data.title || data.name;
      if(!title)throw new Error('TMDB title missing');
      const year=Number((data.release_date || data.first_air_date || '').slice(0,4)) || null;
      stage='search';
      const hits=joyaSearch(yield joyaPage(joyaBase+'/?s='+encodeURIComponent(title),stage,budget),joyaBase);
      joyaLog(stage,hits.length+' catalog candidates');
      const match=catalogBest(hits,title,year,type==='tv'?season:null);
      if(!match){joyaLog('match','No title/year match');return [];}
      stage='detail';const rows=joyaRows(yield joyaPage(match.url,stage,budget),match.url,type,season);
      joyaLog(stage,rows.length+' release rows');
      const streams=[],seen=new Set();stage='resolve';
      for(const row of rows.slice(0,12)) {
        let links=[];
        try{links=yield joyaResolve(row.url,row.title,budget,0,new Set(),type,season,episode,false);}
        catch(error){joyaLog(stage,error.message);}
        links.forEach(link=>{
          if(!link.url || seen.has(link.url))return;seen.add(link.url);
          let filename=link.fileName || row.title;
          try{const name=decodeURIComponent(new ProviderURL(link.url).pathname.split('/').pop());if(providerResolution(name) || providerReleaseLabel(name))filename=name;}catch(_){}
          const label=providerReleaseLabel(filename,row.title.replace(/\b(?:SD|HD|FHD|UHD)\b/g,'')),range=catalogHosts.range(filename) || catalogHosts.range(row.title),codec=providerCodec(filename) || providerCodec(row.title);
          const height=providerResolution(filename) || providerResolution(row.title);
          streams.push({name:['Joya9TV'+(height?' '+height+'p':''),label,range,codec].filter(Boolean).join(' | '),title:[filename,providerDetails(filename.replace(/\b(AAC|DDP|DD|AC3)\s+(?=\d{3,4}p\b)/gi,'$1 | '))].filter(Boolean).join('\n'),url:link.url,quality:height?height+'p':undefined,headers:link.headers,subtitles:link.subtitles,behaviorHints:{bingeGroup:'joya9tv-'+(label || '')+'-'+(range || '')+'-'+(codec || '')}});
        });
      }
      joyaLog('complete',streams.length+' stream entries; playback not verified');return streams;
    } catch(error){joyaLog(stage,error.message);return [];}
  });
}
