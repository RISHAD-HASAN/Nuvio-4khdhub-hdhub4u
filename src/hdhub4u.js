'use strict';

// HDHub4u provider for Nuvio. Searches by TMDB title, matches the best
// result, then resolves each release through its host extractors
// (HubCloud, HubCDN, Hblinks, Hubstream/Vidstack, Pixeldrain,
// StreamTape, HdStream4u, HubDrive).

// ---- Constants ----

const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
let MAIN_URL = 'https://new6.hdhub4u.cl';
const DOMAINS_URL = 'https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json';
const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1e3;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  'Cookie': 'xla=s4t',
  'Referer': `${MAIN_URL}/`,
};

function updateMainUrl(url) {
  MAIN_URL = url;
  HEADERS.Referer = `${url}/`;
}

// ---- Utils ----

let domainCacheTimestamp = 0;

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return 'Unknown';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function extractServerName(source) {
  if (!source) return 'Unknown';
  if (source.startsWith('HubCloud')) {
    const serverMatch = source.match(/HubCloud(?:\s*-\s*([^[\]]+))?/);
    return serverMatch ? (serverMatch[1] || 'Download').trim() : 'HubCloud';
  }
  if (source.startsWith('Pixeldrain')) return 'Pixeldrain';
  if (source.startsWith('StreamTape')) return 'StreamTape';
  if (source.startsWith('HubCdn')) return 'HubCdn';
  if (source.startsWith('HbLinks')) return 'HbLinks';
  if (source.startsWith('Hubstream')) return 'Hubstream';
  return source.split('[')[0].trim().replace(/^www\./, '').split('.')[0];
}

function rot13(value) {
  return value.replace(/[a-zA-Z]/g, function (c) {
    return String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
  });
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function atob(value) {
  if (!value) return '';
  let input = String(value).replace(/=+$/, '');
  let output = '';
  let bc = 0, bs, buffer, idx = 0;
  while (buffer = input.charAt(idx++)) {
    buffer = BASE64_CHARS.indexOf(buffer);
    if (~buffer) {
      bs = bc % 4 ? bs * 64 + buffer : buffer;
      if (bc++ % 4) {
        output += String.fromCharCode(255 & bs >> (-2 * bc & 6));
      }
    }
  }
  return output;
}

// Release tags are hints, not a probe of the video's colour metadata.
// Never infer SDR from missing HDR tags, resolution, HEVC or 10-bit alone.
function detectDynamicRange(text) {
  const value = String(text || '').replace(/[_\.]+/g, ' ');
  const tags = [];
  if (/\b(?:dolby[\s-]*vision|dovi|dv)\b/i.test(value)) tags.push('Dolby Vision');
  if (/\bhdr[\s-]*10\s*(?:\+|plus\b)/i.test(value)) tags.push('HDR10+');
  else if (/\bhdr[\s-]*10\b/i.test(value)) tags.push('HDR10');
  else if (/\bhdr\b/i.test(value)) tags.push('HDR');
  if (/\bhlg\b/i.test(value)) tags.push('HLG');
  if (tags.length) return tags.join(' / ');
  return /\bsdr\b/i.test(value) ? 'SDR' : null;
}

function getLinkDynamicRange(link) {
  // Use the original filename, before TV display titles replace it.
  // Source labels may retain release tags when an extractor has no filename.
  return detectDynamicRange(link.fileName) || detectDynamicRange(link.releaseTitle) || detectDynamicRange(link.source);
}

function cleanTitle(title) {
  let name = title.replace(/\.[a-zA-Z0-9]{2,4}$/, '');
  const normalized = name
    .replace(/WEB[-_. ]?DL/gi, 'WEB-DL')
    .replace(/WEB[-_. ]?RIP/gi, 'WEBRIP')
    .replace(/H[ .]?265/gi, 'H265')
    .replace(/H[ .]?264/gi, 'H264')
    .replace(/DDP[ .]?([0-9]\.[0-9])/gi, 'DDP$1');
  const parts = normalized.split(/[\s_.]/);
  const sourceTags = new Set(['WEB-DL', 'WEBRIP', 'BLURAY', 'HDRIP', 'DVDRIP', 'HDTV', 'CAM', 'TS', 'BRRIP', 'BDRIP']);
  const codecTags = new Set(['H264', 'H265', 'X264', 'X265', 'HEVC', 'AVC']);
  const audioTags = ['AAC', 'AC3', 'DTS', 'MP3', 'FLAC', 'DD', 'DDP', 'EAC3'];
  const audioExtras = new Set(['ATMOS']);
  const hdrTags = new Set(['SDR', 'HDR', 'HDR10', 'HDR10+', 'DV', 'DOLBYVISION']);
  const filtered = parts.map((part) => {
    const p = part.toUpperCase();
    if (sourceTags.has(p)) return p;
    if (codecTags.has(p)) return p;
    if (audioTags.some(tag => p.startsWith(tag))) return p;
    if (audioExtras.has(p)) return p;
    if (hdrTags.has(p)) return p === 'DOLBYVISION' || p === 'DV' ? 'DOLBYVISION' : p;
    if (p === 'NF' || p === 'CR') return p;
    return null;
  }).filter(Boolean);
  return [...new Set(filtered)].join(' ');
}

async function fetchAndUpdateDomain() {
  const now = Date.now();
  if (now - domainCacheTimestamp < DOMAIN_CACHE_TTL) return;
  console.log('[HDHub4u] Fetching latest domain...');
  try {
    const response = await fetch(DOMAINS_URL, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (response.ok) {
      const data = await response.json();
      if (data && providerHttpUrl(data.HDHUB4u || data.hdhub4u)) {
        const newDomain = data.HDHUB4u || data.hdhub4u;
        domainCacheTimestamp = now;
        if (newDomain !== MAIN_URL) {
          console.log(`[HDHub4u] Updating domain from ${MAIN_URL} to ${newDomain}`);
          updateMainUrl(newDomain);
          domainCacheTimestamp = now;
        }
      }
    }
  } catch (error) {
    console.error(`[HDHub4u] Failed to fetch latest domains: ${error.message}`);
  }
}

async function getCurrentDomain() {
  await fetchAndUpdateDomain();
  return MAIN_URL;
}

function normalizeTitle(title) {
  if (!title) return '';
  return title.toLowerCase()
    .replace(/\b(the|a|an)\b/g, '')
    .replace(/[:_\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
}

function calculateTitleSimilarity(title1, title2) {
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);
  if (norm1 === norm2) return 1;
  const words1 = norm1.split(/\s+/).filter(w => w.length > 0);
  const words2 = norm2.split(/\s+/).filter(w => w.length > 0);
  if (words1.length === 0 || words2.length === 0) return 0;
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = words1.filter(w => set2.has(w));
  const union = new Set([...words1, ...words2]);
  const jaccard = intersection.length / union.size;
  const extraWordsCount = words2.filter(w => !set1.has(w)).length;
  let score = jaccard - extraWordsCount * 0.05;
  if (words1.length > 0 && words1.every(w => set2.has(w))) {
    score += 0.2;
  }
  return score;
}

function mediaTitleForMatch(value) {
  // Search titles often append a full release description. Compare the show
  // name, not codec/audio/language labels, while checking season separately.
  return String(value || '')
    .split('|')[0]
    .replace(/\[[^]]*]/g, ' ')
    .replace(/\b(?:season\s*\d+|s\d{1,2})\b/gi, ' ')
    .replace(/\((?:19|20)\d{2}\)/g, ' ')
    .replace(/\b(?:WEB[. -]?DL|WEB[. -]?RIP|BLU[. -]?RAY|\d{3,4}p)\b[\s\S]*$/i, ' ')
    .replace(/\(\s*\)/g, ' ')
    .trim();
}

function findBestTitleMatch(mediaInfo, searchResults, mediaType, season) {
  if (!searchResults || searchResults.length === 0) return null;
  let bestMatch = null;
  let bestScore = 0;
  for (const result of searchResults) {
    if (mediaType === 'movie' && mediaInfo.year && result.year && Math.abs(mediaInfo.year - result.year) > 1) continue;
    const explicitSeason = result.title.match(/\bseason\s*(\d+)\b|\bs(\d+)\b/i);
    if (mediaType === 'tv' && season && explicitSeason && Number(explicitSeason[1] || explicitSeason[2]) !== Number(season)) continue;
    let score = calculateTitleSimilarity(mediaInfo.title, mediaTitleForMatch(result.title));
    if (mediaInfo.year && result.year) {
      const yearDiff = Math.abs(mediaInfo.year - result.year);
      if (yearDiff === 0) score += 0.2;
      else if (yearDiff <= 1) score += 0.1;
      else if (yearDiff > 5) score -= 0.3;
    }
    if (mediaType === 'tv' && season) {
      const titleLower = result.title.toLowerCase();
      const seasonPatterns = [
        `season ${season}`,
        `s${season}`,
        `season ${String(season).padStart(2, '0')}`,
        `s${String(season).padStart(2, '0')}`,
      ];
      const hasSeason = seasonPatterns.some(p => titleLower.includes(p));
      const otherSeasonMatch = titleLower.match(/season\s*(\d+)|s(\d+)/i);
      if (otherSeasonMatch) {
        const foundSeason = parseInt(otherSeasonMatch[1] || otherSeasonMatch[2]);
        if (foundSeason !== season) score -= 0.8;
      }
      if (hasSeason) score += 0.5;
      else score -= 0.3;
    }
    if (result.title.toLowerCase().includes('2160p') || result.title.toLowerCase().includes('4k')) {
      score += 0.05;
    }
    if (score > bestScore && score > 0.3) {
      bestScore = score;
      bestMatch = result;
    }
  }
  if (bestMatch) {
    console.log(`[HDHub4u] Best title match: "${bestMatch.title}" (score: ${bestScore.toFixed(2)})`);
  }
  return bestMatch;
}

async function getTMDBDetails(tmdbId, mediaType) {
  const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
  const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
  });
  if (!response.ok) throw new Error(`TMDB API error: ${response.status}`);
  const data = await response.json();
  const title = mediaType === 'tv' ? data.name : data.title;
  const releaseDate = mediaType === 'tv' ? data.first_air_date : data.release_date;
  const year = releaseDate ? parseInt(releaseDate.split('-')[0]) : null;
  return { title, year, imdbId: (data.external_ids && data.external_ids.imdb_id) || null };
}

// ---- Extractors ----

const cheerioModule = require('cheerio-without-node-native');
const cryptoJs = require('crypto-js');

async function getRedirectLinks(url, depth = 0) {
  try {
    if (depth > 5) return null;
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const doc = await response.text();
    const regex = /s\s*\(\s*['"]o['"]\s*,\s*['"]([A-Za-z0-9+/=]+)['"]|ck\s*\(\s*['"]_wp_http_\d+['"]\s*,\s*['"]([^'"]+)['"]/g;
    let combinedString = '';
    let match;
    while ((match = regex.exec(doc)) !== null) {
      const extractedValue = match[1] || match[2];
      if (extractedValue) combinedString += extractedValue;
    }
    if (!combinedString) {
      const redirectMatch = doc.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
      if (redirectMatch && redirectMatch[1]) {
        const newUrl = redirectMatch[1];
        if (newUrl !== url && !newUrl.includes(url)) {
          return await getRedirectLinks(newUrl, depth + 1);
        }
      }
      return null;
    }
    const decodedString = atob(rot13(atob(atob(combinedString))));
    const jsonObject = JSON.parse(decodedString);
    const encodedUrl = atob(jsonObject.o || '').trim();
    if (encodedUrl) return encodedUrl;
    const data = atob(jsonObject.data || '').trim();
    const wpHttp = (jsonObject.blog_url || '').trim();
    if (wpHttp && data) {
      const directLinkResponse = await fetch(`${wpHttp}?re=${data}`, { headers: HEADERS });
      const html = await directLinkResponse.text();
      const $ = cheerioModule.load(html);
      return ($('body').text() || html).trim();
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function vidStackExtractor(url) {
  try {
    const hash = url.split('#').pop().split('/').pop();
    const baseUrl = new ProviderURL(url).origin;
    const apiUrl = `${baseUrl}/api/v1/video?id=${hash}`;
    const response = await fetch(apiUrl, { headers: Object.assign({}, HEADERS, { Referer: url }) });
    const encoded = (await response.text()).trim();
    const key = cryptoJs.default.enc.Utf8.parse('kiemtienmua911ca');
    const ivs = ['1234567890oiuytr', '0123456789abcdef'];
    for (const ivStr of ivs) {
      try {
        const iv = cryptoJs.default.enc.Utf8.parse(ivStr);
        const decrypted = cryptoJs.default.AES.decrypt(
          { ciphertext: cryptoJs.default.enc.Hex.parse(encoded) },
          key,
          { iv, mode: cryptoJs.default.mode.CBC, padding: cryptoJs.default.pad.Pkcs7 }
        );
        const decryptedText = decrypted.toString(cryptoJs.default.enc.Utf8);
        if (decryptedText && decryptedText.includes('source')) {
          const m3u8Match = decryptedText.match(/"source":"(.*?)"/);
          const m3u8 = m3u8Match ? m3u8Match[1].replace(/\\/g, '') : undefined;
          const subtitles = [];
          const subtitleSectionMatch = decryptedText.match(/"subtitle":\{(.*?)\}/);
          const subtitleSection = subtitleSectionMatch ? subtitleSectionMatch[1] : undefined;
          if (subtitleSection) {
            const subtitlePattern = /"([^"]+)":\s*"([^"]+)"/g;
            let subMatch;
            while ((subMatch = subtitlePattern.exec(subtitleSection)) !== null) {
              const lang = subMatch[1];
              const subPath = subMatch[2].split('#')[0].replace(/\\/g, '');
              if (subPath) {
                subtitles.push({
                  language: lang,
                  url: subPath.startsWith('http') ? subPath : `${baseUrl}${subPath}`,
                });
              }
            }
          }
          if (m3u8) {
            return [{
              source: 'Vidstack Hubstream',
              quality: 'M3U8',
              url: m3u8,
              headers: { 'Referer': url, 'Origin': baseUrl },
              subtitles,
            }];
          }
        }
      } catch (e) {
        // Try the next IV.
      }
    }
    return [];
  } catch (e) {
    return [];
  }
}

async function hbLinksExtractor(url, depth = 0) {
  try {
    const response = await fetch(url, { headers: Object.assign({}, HEADERS, { Referer: url }) });
    const data = await response.text();
    const $ = cheerioModule.load(data);
    const links = [...new Set($('h3 a, h5 a, div.entry-content p a, div.entry-content a').map((i, el) => $(el).attr('href')).get().filter(Boolean))];
    const results = await Promise.all(links.map(l => loadExtractor(providerHttpUrl(l, url), url, depth + 1)));
    return results.flat().map(link => Object.assign({}, link, { source: `${link.source} Hblinks` }));
  } catch (e) {
    return [];
  }
}

async function pixelDrainExtractor(link) {
  try {
    const urlObj = new ProviderURL(link);
    const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
    const fileIdMatch = link.match(/(?:file|u)\/([A-Za-z0-9]+)/);
    const fileId = fileIdMatch ? fileIdMatch[1] : link.split("/").pop();
    if (!fileId) return [{ source: 'Pixeldrain', quality: 0, url: link }];
    const finalUrl = link.includes('?download') ? link : `${baseUrl}/api/file/${fileId}?download`;
    return [{ source: 'Pixeldrain', quality: 0, url: finalUrl }];
  } catch (e) {
    return [{ source: 'Pixeldrain', quality: 0, url: link }];
  }
}

async function streamTapeExtractor(link) {
  try {
    const url = new ProviderURL(link);
    url.hostname = 'streamtape.com';
    const res = await fetch(url.toString(), { headers: HEADERS });
    const data = await res.text();
    let videoSrcMatch = data.match(/document.getElementById('videolink')\.innerHTML = (.*?);/);
    let videoSrc = videoSrcMatch ? videoSrcMatch[1].match(/(\/\/streamtape\.com\/get_video[^']+)'/) : null;
    videoSrc = videoSrc ? videoSrc[1] : null;
    if (!videoSrc) {
      const streamTapeMatch = data.match(/(\/\/streamtape\.com\/get_video[^']+)'/);
      videoSrc = streamTapeMatch ? streamTapeMatch[1] : null;
    }
    return videoSrc ? [{ source: 'StreamTape', quality: providerResolution(videoSrc), url: 'https:' + videoSrc }] : [];
  } catch (e) {
    return [];
  }
}

async function hubCloudExtractor(url, referer, depth = 0) {
  try {
    let currentUrl = url.replace('hubcloud.ink', 'hubcloud.dad');
    const pageResponse = await fetch(currentUrl, { headers: Object.assign({}, HEADERS, { Referer: referer }) });
    let pageData = await pageResponse.text();
    let finalUrl = currentUrl;
    if (!currentUrl.includes('hubcloud.php')) {
      let nextHref = '';
      const $first = cheerioModule.load(pageData);
      const downloadBtn = $first('#download');
      if (downloadBtn.length) {
        nextHref = downloadBtn.attr('href');
      } else {
        const scriptUrlMatch = pageData.match(/var url = '([^']*)'/);
        if (scriptUrlMatch) nextHref = scriptUrlMatch[1];
      }
      if (nextHref) {
        if (!nextHref.startsWith('http')) {
          const urlObj = new ProviderURL(currentUrl);
          nextHref = `${urlObj.protocol}//${urlObj.hostname}/${nextHref.replace(/^\//, '')}`;
        }
        finalUrl = nextHref;
        const secondResponse = await fetch(finalUrl, { headers: Object.assign({}, HEADERS, { Referer: currentUrl }) });
        pageData = await secondResponse.text();
      }
    }
    const $ = cheerioModule.load(pageData);
    const size = $('i#size').text().trim();
    const header = $('div.card-header').text().trim();
    const qualityMatch = header.match(/(\d{3,4})[pP]/);
    const qualityStr = qualityMatch ? qualityMatch[1] : undefined;
    const quality = qualityStr ? parseInt(qualityStr) : /\b4k\b/i.test(header) ? 2160 : 0;
    const headerDetails = cleanTitle(header);
    const labelExtras = (headerDetails ? `[${headerDetails}]` : '') + (size ? `[${size}]` : '');
    const sizeMatch = size.match(/([\d.]+)\s*(GB|MB|KB)/i);
    const sizeInBytes = sizeMatch
      ? parseFloat(sizeMatch[1]) * ({ GB: 1024 ** 3, MB: 1024 ** 2, KB: 1024 }[sizeMatch[2].toUpperCase()] || 0)
      : 0;
    const links = [];
    const elements = $('a.btn').get();
    for (const element of elements) {
      const link = $(element).attr('href');
      const text = $(element).text().toLowerCase();
      const fileName = header || headerDetails || 'Unknown';
      if (text.includes('download file') || text.includes('fsl server') || text.includes('s3 server') || text.includes('fslv2') || text.includes('mega server') || (link && link.includes('r2.dev'))) {
        let label = 'HubCloud';
        if (link && link.includes('r2.dev')) label = 'Direct R2';
        else if (link && link.includes('workers.dev')) label = 'ZipDisk Server';
        else if (text.includes('fsl server')) label = 'HubCloud - FSL';
        else if (text.includes('s3 server')) label = 'HubCloud - S3';
        else if (text.includes('fslv2')) label = 'HubCloud - FSLv2';
        else if (text.includes('mega server')) label = 'HubCloud - Mega';
        links.push({ source: `${label} ${labelExtras}`, quality, url: link, size: sizeInBytes, fileName });
      } else if (text.includes('buzzserver')) {
        try {
          const buzzResp = await fetch(`${link}/download`, { method: 'GET', headers: Object.assign({}, HEADERS, { Referer: link }), redirect: 'manual' });
          let dlink = buzzResp.headers.get('hx-redirect') || buzzResp.headers.get('HX-Redirect');
          if (!dlink && buzzResp.url && buzzResp.url !== `${link}/download`) {
            dlink = buzzResp.url;
          }
          if (dlink) {
            links.push({ source: `HubCloud - BuzzServer ${labelExtras}`, quality, url: dlink, size: sizeInBytes, fileName });
          }
        } catch (e) {
          // BuzzServer extraction failed; skip.
        }
      } else if (text.includes('10gbps') || (link && link.includes('hubcloud.cx'))) {
        let targetUrl = link;
        if (link && !link.includes('hubcloud.cx')) {
          try {
            const resp = await fetch(link, { method: 'GET', redirect: 'manual' });
            const loc = resp.headers.get('location');
            if (loc && loc.includes('link=')) {
              targetUrl = loc.substring(loc.indexOf('link=') + 5);
            }
          } catch (e) {
            // Fall back to the raw link.
          }
        }
        links.push({ source: `HubCloud - 10Gbps ${labelExtras}`, quality, url: targetUrl, size: sizeInBytes, fileName });
      } else if (text.includes('zipdisk') || (link && link.includes('workers.dev'))) {
        links.push({ source: `ZipDisk Server ${labelExtras}`, quality, url: link, size: sizeInBytes, fileName });
      } else if (link && link.includes('pixeldra')) {
        const results = await pixelDrainExtractor(link);
        links.push(...results.map(l => Object.assign({}, l, { source: `${l.source} ${labelExtras}`, size: sizeInBytes, fileName })));
      } else if (link && !link.includes('magnet:') && link.startsWith('http')) {
        const extracted = await loadExtractor(link, finalUrl, depth + 1);
        links.push(...extracted.map(l => Object.assign({}, l, { quality: l.quality || quality, fileName: l.fileName && l.fileName !== 'Unknown' ? l.fileName : fileName })));
      }
    }
    return links;
  } catch (e) {
    return [];
  }
}

async function hubCdnExtractor(url, referer) {
  try {
    const response = await fetch(url, { headers: Object.assign({}, HEADERS, { Referer: referer }) });
    const data = await response.text();
    const $ = cheerioModule.load(data);
    let scriptContent = '';
    $('script').each((i, el) => {
      const html = $(el).html();
      if (html && html.includes('reurl')) {
        scriptContent = html;
      }
    });
    if (scriptContent) {
      const match = scriptContent.match(/reurl\s*=\s*['"]([^'"]+)['"]/);
      if (match && match[1]) {
        const reurlVal = match[1];
        if (reurlVal.includes('?r=')) {
          const queryPart = reurlVal.split('?r=').pop();
          try {
            const decoded = atob(queryPart);
            const m3u8Link = decoded.substring(decoded.lastIndexOf('link=') + 5);
            if (m3u8Link && m3u8Link.startsWith('http')) {
              return [{ source: 'HubCdn', quality: providerResolution(m3u8Link), url: m3u8Link }];
            }
          } catch (e) {
            // Ignore decode failures.
          }
        } else if (reurlVal.includes('link=')) {
          const m3u8Link = reurlVal.split('link=').pop();
          if (m3u8Link && m3u8Link.startsWith('http')) {
            return [{ source: 'HubCdn', quality: providerResolution(m3u8Link), url: m3u8Link }];
          }
        } else if (reurlVal.startsWith('http')) {
          return [{ source: 'HubCdn', quality: providerResolution(reurlVal), url: reurlVal }];
        }
      }
    }
    const encodedMatch = data.match(/r=([A-Za-z0-9+/=]+)/);
    if (encodedMatch && encodedMatch[1]) {
      try {
        const decoded = atob(encodedMatch[1]);
        const m3u8Link = decoded.substring(decoded.lastIndexOf('link=') + 5);
        if (m3u8Link && m3u8Link.startsWith('http')) {
          return [{ source: 'HubCdn', quality: providerResolution(m3u8Link), url: m3u8Link }];
        }
      } catch (e) {
        // Ignore decode failures.
      }
    }
    return [];
  } catch (e) {
    return [];
  }
}

async function loadExtractor(url, referer = MAIN_URL, depth = 0) {
  try {
    if (depth > 8 || !providerHttpUrl(url)) return [];
    if (/\.(?:m3u8|mpd|mp4|mkv)(?:$|[?#])/i.test(url)) return [{ source: 'Direct', quality: providerResolution(url), url }];
    const hostname = new ProviderURL(url).hostname;
    const isRedirect = url.includes('?id=') || hostname.includes('techyboy4u') || hostname.includes('gadgetsweb.xyz') || hostname.includes('cryptoinsights.site') || hostname.includes('bloggingvector') || hostname.includes('ampproject.org');
    if (isRedirect) {
      const finalLink = await getRedirectLinks(url);
      if (finalLink && finalLink !== url) {
        return await loadExtractor(finalLink, url, depth + 1);
      }
      return [];
    }
    if (hostname.includes('hubcloud')) return await hubCloudExtractor(url, referer, depth);
    if (hostname.includes('hubcdn')) return await hubCdnExtractor(url, referer);
    if (hostname.includes('hblinks') || hostname.includes('hubstream.dad')) return await hbLinksExtractor(url, depth);
    if (hostname.includes('hubstream') || hostname.includes('vidstack')) return await vidStackExtractor(url);
    if (hostname.includes('pixeldrain')) return await pixelDrainExtractor(url);
    if (hostname.includes('streamtape')) return await streamTapeExtractor(url);
    if (hostname.includes('hdstream4u')) return [{ source: 'HdStream4u', quality: providerResolution(url), url }];
    if (hostname.includes('hubdrive')) {
      const res = await fetch(url, { headers: Object.assign({}, HEADERS, { Referer: referer }) });
      const data = await res.text();
      const href = cheerioModule.load(data)('.btn.btn-primary.btn-user.btn-success1.m-1').attr('href');
      if (href) {
        return await loadExtractor(providerHttpUrl(href, url), url, depth + 1);
      }
    }
    return [];
  } catch (e) {
    return [];
  }
}

// ---- Search ----

const searchEndpointCache = { url: 'https://search.pingora.fyi/collections/post/documents/search', ts: 0 };

async function getSearchEndpoint() {
  if (Date.now() - searchEndpointCache.ts < 36e5) return searchEndpointCache.url;
  const domain = await getCurrentDomain();
  try {
    const response = await fetch(`${domain}/search.html`, { headers: HEADERS });
    const html = await response.text();
    // Read the public search-page config; never execute its scripts.
    const match = html.match(/proxyUrl\s*:\s*['"](https:\/\/[^"']+?\/collections\/post\/documents\/search)["']/i);
    if (match && providerHttpUrl(match[1])) searchEndpointCache.url = match[1];
    searchEndpointCache.ts = Date.now();
  } catch (error) {
    console.log(`[HDHub4u] Search config unavailable: ${error.message}`);
  }
  return searchEndpointCache.url;
}

async function searchPrimary(query) {
  const today = new Date().toISOString().split('T')[0];
  const endpoint = await getSearchEndpoint();
  const searchUrl = `${endpoint}?q=${encodeURIComponent(query)}&query_by=post_title,category,stars,director,imdb_id&query_by_weights=4,2,2,2,4&sort_by=sort_by_date:desc&limit=15&highlight_fields=none&use_cache=true&page=1&analytics_tag=${today}`;
  const response = await fetch(searchUrl, { headers: HEADERS });
  const data = await response.json();
  if (!data || !data.hits) return [];
  return data.hits.map(hit => {
    const doc = hit.document;
    const title = doc.post_title;
    const yearMatch = title.match(/\((19\d{2}|20\d{2})\)|\b(19\d{2}|20\d{2})\b/);
    const year = yearMatch ? parseInt(yearMatch[1] || yearMatch[2]) : null;
    let url = doc.permalink;
    if (url && url.startsWith('/')) {
      url = `${MAIN_URL}${url}`;
    }
    return { title, url, poster: doc.post_thumbnail, year };
  });
}

// Native site search fallback; no guessed Typesense keys or extra providers.
async function search(query) {
  try {
    const hits = await searchPrimary(query);
    if (hits.length) return hits;
  } catch (error) {
    console.log(`[HDHub4u] Primary search failed: ${error.message}`);
  }
  const domain = await getCurrentDomain();
  const response = await fetch(`${domain}/?s=${encodeURIComponent(query)}`, { headers: HEADERS });
  const $ = cheerioModule.load(await response.text());
  const hits = [];
  $('article h2 a, .recent-movies a, .movie-card a, li.thumb a').each((_, el) => {
    const title = $(el).attr('title') || $(el).text().trim();
    const url = providerHttpUrl($(el).attr('href') || '', domain);
    const year = title.match(/\b(19\d{2}|20\d{2})\b/);
    if (url && title) hits.push({ title, url, year: year ? Number(year[1]) : null });
  });
  return hits;
}

async function getDownloadLinks(mediaUrl, mediaType, targetEpisode) {
  const domain = await getCurrentDomain();
  if (mediaUrl.includes('hdhub4u.')) {
    try {
      const urlObj = new ProviderURL(mediaUrl);
      const domainObj = new ProviderURL(domain);
      urlObj.hostname = domainObj.hostname;
      mediaUrl = urlObj.toString();
    } catch (e) {
      // Keep the original URL if hostname replacement fails.
    }
  }
  const response = await fetch(mediaUrl, { headers: Object.assign({}, HEADERS, { Referer: `${domain}/` }) });
  const data = await response.text();
  const $ = cheerioModule.load(data);
  const releaseTitles = new Map();
  $('h3, h4, h5').each((_, heading) => {
    const title = $(heading).text().trim();
    $(heading).find('a').each((_, link) => {
      const href = $(link).attr('href');
      if (href) releaseTitles.set(href, title);
    });
  });
  const typeRaw = $('h1.page-title span').text();
  const isMovie = mediaType ? mediaType === 'movie' : typeRaw.toLowerCase().includes('movie');
  if (isMovie) {
    const qualityLinks = $('h3 a, h4 a').filter((i, el) => $(el).text().match(/480|720|1080|2160|4K/i));
    const bodyLinks = $('.page-body > div a').filter((i, el) => {
      const href = $(el).attr('href');
      return href && (href.includes('hdstream4u') || href.includes('hubstream'));
    });
    const initialLinks = [...new Set([
      ...qualityLinks.map((i, el) => $(el).attr('href')).get(),
      ...bodyLinks.map((i, el) => $(el).attr('href')).get(),
    ])];
    const results = await Promise.all(initialLinks.map(url =>
      loadExtractor(url, mediaUrl).then(links => links.map(link => Object.assign({}, link, { releaseTitle: releaseTitles.get(url) || '' })))
    ));
    const allFinalLinks = results.flat();
    const seenUrls = new Set();
    const uniqueFinalLinks = allFinalLinks.filter(link => {
      if (!link.url || link.url.includes('.zip') || (link.name && link.name.toLowerCase().includes('.zip'))) return false;
      if (seenUrls.has(link.url)) return false;
      seenUrls.add(link.url);
      return true;
    });
    return { finalLinks: uniqueFinalLinks, isMovie };
  } else {
    const episodeLinksMap = new Map();
    const directLinkBlocks = [];
    $('h3, h4').each((i, element) => {
      const $el = $(element);
      const text = $el.text();
      const anchors = $el.find('a');
      const links = anchors.map((i2, a) => $(a).attr('href')).get();
      const isDirectLinkBlock = anchors.get().some(a => $(a).text().match(/1080|720|4K|2160/i));
      if (isDirectLinkBlock) {
        directLinkBlocks.push(...links);
        return;
      }
      const episodeMatch = text.match(/(?:EPiSODE\s*[-:]?\s*(\d+)|E(\d+))/i);
      if (episodeMatch) {
        const epNum = parseInt(episodeMatch[1] || episodeMatch[2]);
        if (!episodeLinksMap.has(epNum)) episodeLinksMap.set(epNum, []);
        episodeLinksMap.get(epNum).push(...links);
        let nextElement = $el.next();
        while (nextElement.length) {
          const outer = $.html(nextElement.get(0)) || '';
          if (/^\s*<hr\b/i.test(outer)) break;
          if (/^\s*<h[1-6]\b/i.test(outer) && /\b(?:episode\s*[-:]?\s*\d+|E\d+)\b/i.test(nextElement.text())) break;
          const siblingLinks = nextElement.find('a[href]').map((i2, a) => $(a).attr('href')).get();
          episodeLinksMap.get(epNum).push(...siblingLinks);
          nextElement = nextElement.next();
        }
      }
    });
    if (directLinkBlocks.length > 0 && !episodeLinksMap.has(Number(targetEpisode))) {
      await Promise.all(directLinkBlocks.map(async (blockUrl) => {
        try {
          const resolvedUrl = await getRedirectLinks(blockUrl);
          if (!resolvedUrl) return;
          const blockRes = await fetch(resolvedUrl, { headers: HEADERS });
          const blockData = await blockRes.text();
          const $$ = cheerioModule.load(blockData);
          $$('h5 a, h4 a, h3 a').each((i, el) => {
            const linkText = $$(el).text();
            const linkHref = $$(el).attr('href');
            const epMatch = linkText.match(/Episode\s*[-:]?\s*(\d+)/i);
            if (epMatch && linkHref) {
              const epNum = parseInt(epMatch[1]);
              if (!episodeLinksMap.has(epNum)) episodeLinksMap.set(epNum, []);
              episodeLinksMap.get(epNum).push(linkHref);
            }
          });
        } catch (e) {
          // Ignore per-block failures.
        }
      }));
    }
    const initialLinks = [];
    episodeLinksMap.forEach((links, epNum) => {
      if (targetEpisode && Number(epNum) !== Number(targetEpisode)) return;
      const uniqueLinks = [...new Set(links)];
      initialLinks.push(...uniqueLinks.map(link => ({ url: link, episode: epNum })));
    });
    const results = await Promise.all(initialLinks.map(async (linkInfo) => {
      try {
        const extracted = await loadExtractor(linkInfo.url, mediaUrl);
        return extracted.map(ext => Object.assign({}, ext, { episode: linkInfo.episode, releaseTitle: releaseTitles.get(linkInfo.url) || '' }));
      } catch (e) {
        return [];
      }
    }));
    const allFinalLinks = results.flat();
    const seenUrls = new Set();
    const uniqueFinalLinks = allFinalLinks.filter(link => {
      if (!link.url || link.url.includes('.zip')) return false;
      if (seenUrls.has(link.url)) return false;
      seenUrls.add(link.url);
      return true;
    });
    return { finalLinks: uniqueFinalLinks, isMovie };
  }
}

async function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
  console.log(`[HDHub4u] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);
  try {
    const mediaInfo = await getTMDBDetails(tmdbId, mediaType);
    console.log(`[HDHub4u] TMDB Info: "${mediaInfo.title}" (${mediaInfo.year || 'N/A'})`);
    const searchQuery = mediaType === 'tv' && season ? `${mediaInfo.title} Season ${season}` : mediaInfo.title;
    const searchResults = await search(searchQuery);
    if (searchResults.length === 0) {
      console.log('[HDHub4u] Search returned no results; the search service may be blocked or unavailable');
      return [];
    }
    const bestMatch = findBestTitleMatch(mediaInfo, searchResults, mediaType, season);
    if (!bestMatch) {
      console.log('[HDHub4u] No search result matched the requested title/season');
      return [];
    }
    const selectedMedia = bestMatch;
    console.log(`[HDHub4u] Selected: "${selectedMedia.title}" (${selectedMedia.url})`);
    const result = await getDownloadLinks(selectedMedia.url, mediaType, episode);
    const finalLinks = result.finalLinks;
    let filteredLinks = finalLinks;
    if (mediaType === 'tv' && episode !== null) {
      filteredLinks = finalLinks.filter(link => link.episode === episode);
    }
    const streams = filteredLinks.map(link => {
      let mediaTitle = link.fileName && link.fileName !== 'Unknown' ? link.fileName : mediaInfo.title;
      if (mediaType === 'tv' && season && episode) {
        mediaTitle = `${mediaInfo.title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
      }
      const serverName = extractServerName(link.source);
      const dynamicRange = getLinkDynamicRange(link);
      let qualityStr = 'Unknown';
      if (typeof link.quality === 'number' && link.quality > 0) {
        if (link.quality >= 2160) qualityStr = '4K';
        else if (link.quality >= 1080) qualityStr = '1080p';
        else if (link.quality >= 720) qualityStr = '720p';
        else if (link.quality >= 480) qualityStr = '480p';
      } else if (typeof link.quality === 'string') {
        qualityStr = link.quality;
      }
      return {
        name: [`HDHub4u ${serverName}`, providerReleaseLabel(link.fileName, link.releaseTitle, link.source), dynamicRange, providerCodec(link.fileName) || providerCodec(link.releaseTitle) || providerCodec(link.source)].filter(Boolean).join(' | '),
        title: [mediaTitle, providerDetails(link.fileName || '', link.fileName || '')].filter(Boolean).join('\n'),
        url: link.url,
        quality: qualityStr,
        size: link.size ? formatBytes(link.size) : void 0,
        subtitles: link.subtitles || void 0,
        behaviorHints: { bingeGroup: `hdhub4u-${providerReleaseLabel(link.fileName, link.releaseTitle, link.source) || 'untagged'}-${dynamicRange || 'untagged'}-${providerCodec(link.fileName) || 'untagged'}-${qualityStr}-${serverName}` },
        headers: link.headers || void 0,
        provider: 'hdhub4u',
      };
    });
    return streams.sort((a, b) => providerRank(b.quality) - providerRank(a.quality));
  } catch (error) {
    console.error(`[HDHub4u] Scraping error: ${error.message}`);
    return [];
  }
}

module.exports = { getStreams };
