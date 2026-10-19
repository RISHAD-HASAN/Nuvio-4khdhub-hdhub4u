// Nuvio Dual Providers 2.1.2. Edit src/ and run npm run build. See NOTICE.md.
// Only the HTTP URL features these providers need. Some Nuvio runtimes don't
// expose URL; others provide a partial version whose hostname isn't writable.
function ProviderURL(value, base) {
  let input = String(value || '').trim().replace(/ /g, '%20');
  const baseUrl = base ? new ProviderURL(String(base)) : null;
  if (/^\/\//.test(input)) {
    if (!baseUrl) throw new Error('A protocol-relative URL needs a base');
    input = baseUrl.protocol + input;
  } else if (!/^[a-z][a-z0-9+.-]*:/i.test(input)) {
    if (!baseUrl) throw new Error('A relative URL needs a base');
    if (!input) input = baseUrl.toString();
    else if (input.charAt(0) === '#') input = baseUrl.origin + baseUrl.pathname + baseUrl.search + input;
    else if (input.charAt(0) === '?') input = baseUrl.origin + baseUrl.pathname + input;
    else if (input.charAt(0) === '/') input = baseUrl.origin + input;
    else input = baseUrl.origin + baseUrl.pathname.replace(/[^/]*$/, '') + input;
  }
  const match = input.match(/^(https?):\/\/([^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$/i);
  if (!match || /[@\s\\]/.test(match[2])) throw new Error('Invalid HTTP URL');
  const authority = match[2].match(/^(\[[0-9a-f:.]+\]|[^:\[\]]+)(?::(\d+))?$/i);
  if (!authority) throw new Error('Invalid HTTP host');
  this.protocol = match[1].toLowerCase() + ':';
  this.hostname = authority[1].toLowerCase();
  this.port = authority[2] || '';
  this.username = '';
  this.password = '';
  const path = [];
  const segments = (match[3] || '/').split('/');
  for (let i = 0; i < segments.length; i++) {
    const part = segments[i];
    if (part === '.') {
      if (i === segments.length - 1) path.push('');
    } else if (part === '..') {
      if (path.length > 1) path.pop();
      if (i === segments.length - 1) path.push('');
    } else path.push(part);
  }
  this.pathname = path.join('/') || '/';
  this.search = match[4] || '';
  this.hash = match[5] || '';
}
Object.defineProperty(ProviderURL.prototype, 'host', {
  get: function() { return this.hostname + (this.port ? ':' + this.port : ''); }
});
Object.defineProperty(ProviderURL.prototype, 'origin', {
  get: function() { return this.protocol + '//' + this.host; }
});
ProviderURL.prototype.toString = function() {
  return this.origin + this.pathname + this.search + this.hash;
};

// Shared helpers. The build copies these into each provider so Nuvio
// can load a single file without importing local modules.
function providerDelay(ms) {
  // The native host handles request deadlines when timers aren't available.
  return typeof setTimeout === 'function' ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
}
function providerClearTimer(timer) {
  if (timer !== undefined && typeof clearTimeout === 'function') clearTimeout(timer);
}
function providerHeaders(headers) {
  return { get: function(name) {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name);
    const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
    return key === undefined ? null : headers[key];
  } };
}
var providerActive = 0;
var providerQueue = [];
var providerInflight = Object.create(null);
function providerHttpUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const u = base ? new ProviderURL(value, base) : new ProviderURL(value);
    return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.toString() : null;
  } catch (_) { return null; }
}
function providerSlot(task) {
  return new Promise((resolve, reject) => {
    const run = () => {
      providerActive++;
      Promise.resolve().then(task).then(resolve, reject).then(() => {
        providerActive--;
        const next = providerQueue.shift();
        if (next) next();
      });
    };
    if (providerActive < 6) run(); else providerQueue.push(run);
  });
}
function providerFetch(url, options) {
  if (!providerHttpUrl(String(url))) return Promise.reject(new Error('Invalid HTTP URL'));
  const opts = options || {};
  function attempt(count) {
    return providerSlot(() => {
      let timer;
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const requestOptions = Object.assign({}, opts);
      if (controller && !requestOptions.signal) requestOptions.signal = controller.signal;
      const timeout = typeof setTimeout === 'function' ? new Promise((_, reject) => {
        timer = setTimeout(() => {
          if (controller) controller.abort();
          reject(new Error('Provider request timed out'));
        }, 15000);
      }) : null;
      // Read the body within the same timeout, in case the server stalls
      // after sending its headers.
      const request = Promise.resolve().then(() => fetch(url, requestOptions)).then(res =>
        Promise.resolve().then(() => res.text()).then(body => ({
          ok: res.ok, status: res.status, statusText: res.statusText,
          headers: providerHeaders(res.headers), url: res.url,
          text: () => Promise.resolve(body),
          json: () => Promise.resolve().then(() => JSON.parse(body))
        }))
      );
      return (timeout ? Promise.race([request, timeout]) : request).then(res => {
        providerClearTimer(timer);
        // Preserve manual redirects used by host extractors.
        if (res.ok === false && !(opts.redirect === 'manual' && res.status >= 300 && res.status < 400)) {
          const error = new Error('HTTP ' + res.status);
          error.retryable = res.status === 429 || res.status >= 500;
          throw error;
        }
        return res;
      }, err => { providerClearTimer(timer); throw err; });
    }).catch(err => {
      const canRetry = (!opts.method || opts.method.toUpperCase() === 'GET') &&
        err.retryable !== false && count < 1;
      if (!canRetry) throw err;
      return providerDelay(350).then(() => attempt(count + 1));
    });
  }
  return attempt(0);
}
function providerCodec(text) {
  const t = String(text || '');
  if (/\bAV1\b/i.test(t)) return 'AV1';
  if (/\b(?:H[.\s-]?265|X265|HEVC)\b/i.test(t)) return 'H.265';
  if (/\b(?:H[.\s-]?264|X264|AVC)\b/i.test(t)) return 'H.264';
  return null;
}
function providerDetails(text, languageText) {
  const t = String(text || '');
  const languages = ['English','Hindi','Tamil','Telugu','Bengali','Malayalam','Kannada','Punjabi','Japanese','Korean','Chinese','Spanish','French','German','Arabic','Portuguese','Russian','Turkish'];
  const langs = languages.filter(l => new RegExp('\\b' + l + '\\b', 'i').test(languageText || t));
  if (!langs.length && /\bmulti(?:[. -]?audio)?\b/i.test(t)) langs.push('Multi-Audio');
  const source = /\b(?:WEB[. -]?DL|WEB[. -]?RIP|BLU[. -]?RAY|REMUX)\b/i.exec(t);
  const audio = /\b(?:DDP|E[. -]?AC[. -]?3|TRUEHD|DTS(?:[. -]?HD(?:[. -]?MA)?)?|AAC|AC3|FLAC)(?:[. -]?\d(?:\.\d)?)?/i.exec(t);
  const parts = [];
  if (source) parts.push(source[0].toUpperCase().replace(/WEB[. -]?DL/i, 'WEB-DL'));
  if (audio) parts.push(audio[0].toUpperCase());
  if (/\bATMOS\b/i.test(t)) parts.push('Atmos');
  if (langs.length) parts.push(langs.join(' / '));
  return parts.join(' | ');
}
function providerResolution(text) {
  const t = String(text || "").replace(/_/g, " ");
  const m = t.match(/\b(2160|1440|1080|720|576|480|360)p\b/i);
  return m ? Number(m[1]) : /\b4k\b/i.test(t) ? 2160 : 0;
}
function providerRank(value) {
  if (/^(?:4k|2160p)$/i.test(String(value))) return 2160;
  const m = String(value || '').match(/^(\d{3,4})p?$/i);
  return m ? parseInt(m[1], 10) : 0;
}
function providerFinalize(streams) {
  const seen = new Set();
  return (streams || []).filter(s => {
    if (!s || !providerHttpUrl(s.url) || /\.(?:zip|rar|7z)(?:$|[?#])/i.test(s.url)) return false;
    // Do not remove signed query parameters or collapse by resolution.
    const headers = Object.keys(s.headers || {}).sort().map(k => [k, s.headers[k]]);
    const key = JSON.stringify([s.url, headers]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a,b) => providerRank(b.quality) - providerRank(a.quality));
}
function providerGetStreams(id, type, season, episode) {
  const normalizedType = type === 'series' ? 'tv' : type || 'movie';
  if (normalizedType !== 'tv' && normalizedType !== 'movie') return Promise.resolve([]);
  if (normalizedType === 'tv' && (!(Number(season) > 0) || !(Number(episode) > 0))) return Promise.resolve([]);
  const key = JSON.stringify([String(id), normalizedType, Number(season), Number(episode)]);
  if (providerInflight[key]) return providerInflight[key];
  const pending = Promise.resolve().then(() => getStreams(id, normalizedType, Number(season) || null, Number(episode) || null))
    .then(providerFinalize).catch(err => { console.log('[Dual providers] ' + err.message); return []; });
  providerInflight[key] = pending.then(value => { delete providerInflight[key]; return value; }, err => { delete providerInflight[key]; throw err; });
  // Share ongoing work only. The next request gets fresh playback links.
  return providerInflight[key];
}

function providerReleaseLabel() {
  const texts = Array.prototype.slice.call(arguments).map(value => String(value || '').replace(/_/g, ' '));
  function sourceOf(text) {
    if (/\bblu[ .-]?ray\b/i.test(text)) return 'BluRay';
    if (/\bweb[ .-]?dl\b/i.test(text)) return 'WEB-DL';
    if (/\bweb[ .-]?rip\b/i.test(text)) return 'WEBRip';
    if (/\bremux\b/i.test(text)) return 'REMUX';
    return null;
  }
  let source = null;
  for (const text of texts) { source = sourceOf(text); if (source) break; }
  if (!source) return null;
  if (source === 'REMUX' && texts.some(text => sourceOf(text) === 'BluRay')) source = 'BluRay';
  const relevant = texts.filter(text => !sourceOf(text) || sourceOf(text) === source || (source === 'BluRay' && sourceOf(text) === 'REMUX'));
  if (source === 'BluRay') {
    return relevant.some(text => /\bremux\b/i.test(text)) ? 'BluRay REMUX' : 'BluRay';
  }
  if (source !== 'WEB-DL' && source !== 'WEBRip') return source;
  // Keep source tags as written. Read the technical part of a release rather
  // than maintaining a list of OTT services or expanding ambiguous names.
  function rawTags(text) {
    const normalized = text.replace(/((?:H[ .-]?26[45]|X26[45]|HEVC|AV1))-[A-Za-z0-9][\s\S]*$/i, '$1').replace(/WEB[ .-]?DL/gi, 'WEB-DL').replace(/WEB[ .-]?RIP/gi, 'WEBRip');
    const tokens = normalized.split(/[\s.()[\]{}|,:]+/).filter(Boolean);
    const technical = token => /^(?:\d{3,4}p|4k|web-dl|webrip)$/i.test(token);
    const ignored = /^(?:WEB-DL|WEBRIP|BLURAY|REMUX|SDR|HDR|HDR10|HDR10\+|DV|DOVI|HLG|HEVC|AVC|AV1|H264|H265|X264|X265|AAC|DDP|DD|DTS|TRUEHD|FLAC|ATMOS|MULTI|DUAL|AUDIO|HQ|HD|UHD|FHD|NFHD|GBPS|MB|TB|HINDI|ENGLISH|TAMIL|TELUGU|BENGALI|JAPANESE|KOREAN|EN|HI|ALL|THE|OF|IT|S[0-9]+|E[0-9]+|S[0-9]+E[0-9]+|EPISODES|COMPLETE|PACK|MOVIE|SERIES)$/i;
    const skip = (token, i) => ignored.test(token) || /^(?:(?:DDP|DD|AAC|AC3|EAC3|DTS)\d*|\d+BIT)$/i.test(token) || (token === 'GB' && /^\d+$/.test(tokens[i - 1] || ''));
    let start = tokens.findIndex(technical);
    if (start < 0) return [];
    // Tags often precede the resolution: "MA 2160p WEB-DL".
    let first = start;
    while (first > 0 && /^[A-Z][A-Z0-9+]{1,11}$/.test(tokens[first - 1]) && !skip(tokens[first - 1], first - 1)) first--;
    const result = [];
    for (let i = first; i < tokens.length; i++) {
      const token = tokens[i];
      if (/^[A-Z][A-Z0-9+]{1,11}$/.test(token) && !skip(token, i) && result.indexOf(token) === -1) result.push(token);
      // A dash following the codec usually begins the release group. Don't
      // mistake names after it for a platform.
      if (/^(?:H[ -]?26[45]|X26[45]|HEVC|AV1)-/i.test(token)) break;
    }
    return result;
  }
  for (const text of relevant) {
    const tags = rawTags(text);
    if (tags.length) return tags.join(' / ') + ' ' + source;
  }
  return source;
}

"use strict";
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
var BASE_URL = "https://4khdhub.one";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
var DOMAINS_URL = "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json";
var domainCache = { url: BASE_URL, ts: 0 };
function fetchLatestDomain() {
  return __async(this, null, function* () {
    const now = Date.now();
    if (now - domainCache.ts < 36e5)
      return domainCache.url;
    try {
      const response = yield providerFetch(DOMAINS_URL);
      const data = yield response.json();
      if (data && providerHttpUrl(data["4khdhub"] || data.n4khdhub)) {
        domainCache.url = data["4khdhub"] || data.n4khdhub;
        BASE_URL = domainCache.url;
        domainCache.ts = now;
      }
    } catch (e) {
    }
    return domainCache.url;
  });
}
function fetchText(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    const retries = options.retries !== void 0 ? options.retries : 0;
    const delay = options.delay !== void 0 ? options.delay : 1e3;
    for (let i = 0; i <= retries; i++) {
      try {
        const response = yield providerFetch(url, {
          headers: __spreadValues({
            "User-Agent": USER_AGENT
          }, options.headers)
        });
        return yield response.text();
      } catch (err) {
        console.log(`[4KHDHub] Request failed for ${url}: ${err.message}${i < retries ? `, retrying (${i + 1}/${retries})...` : ""}`);
      }
      if (i < retries) {
        yield providerDelay(delay * Math.pow(2, i));
      }
    }
    return null;
  });
}
function getTmdbDetails(tmdbId, type) {
  return __async(this, null, function* () {
    const isSeries = type === "series" || type === "tv";
    const endpoint = isSeries ? "tv" : "movie";
    const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    console.log(`[4KHDHub] Fetching TMDB details from: ${url}`);
    try {
      const response = yield providerFetch(url);
      const data = yield response.json();
      if (isSeries) {
        return {
          title: data.name,
          year: data.first_air_date ? parseInt(data.first_air_date.split("-")[0]) : 0
        };
      } else {
        return {
          title: data.title,
          year: data.release_date ? parseInt(data.release_date.split("-")[0]) : 0
        };
      }
    } catch (error) {
      console.log(`[4KHDHub] TMDB request failed: ${error.message}`);
      return null;
    }
  });
}
function atob(input) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let str = String(input).replace(/=+$/, "");
  if (str.length % 4 === 1) {
    throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
  }
  let output = "";
  for (let bc = 0, bs, buffer, i = 0; buffer = str.charAt(i++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
    buffer = chars.indexOf(buffer);
  }
  return output;
}
function rot13Cipher(str) {
  return str.replace(/[a-zA-Z]/g, function(c) {
    return String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
  });
}
function levenshteinDistance(s, t) {
  if (s === t)
    return 0;
  const n = s.length;
  const m = t.length;
  if (n === 0)
    return m;
  if (m === 0)
    return n;
  const d = [];
  for (let i = 0; i <= n; i++) {
    d[i] = [];
    d[i][0] = i;
  }
  for (let j = 0; j <= m; j++) {
    d[0][j] = j;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = s.charAt(i - 1) === t.charAt(j - 1) ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[n][m];
}
function parseBytes(val) {
  if (typeof val === "number")
    return val;
  if (!val)
    return 0;
  const match = val.match(/^([0-9.]+)\s*([a-zA-Z]+)$/);
  if (!match)
    return 0;
  const num = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  let multiplier = 1;
  if (unit.indexOf("k") === 0)
    multiplier = 1024;
  else if (unit.indexOf("m") === 0)
    multiplier = 1024 * 1024;
  else if (unit.indexOf("g") === 0)
    multiplier = 1024 * 1024 * 1024;
  else if (unit.indexOf("t") === 0)
    multiplier = 1024 * 1024 * 1024 * 1024;
  return num * multiplier;
}
function formatBytes(val) {
  if (val === 0)
    return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  let i = Math.floor(Math.log(val) / Math.log(k));
  if (i < 0)
    i = 0;
  return parseFloat((val / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
var cheerio = require("cheerio-without-node-native");
function fetchPageUrl(name, year, isSeries) {
  return __async(this, null, function* () {
    const domain = yield fetchLatestDomain();
    const searchUrl = `${domain}/?s=${encodeURIComponent(name + " " + year)}`;
    console.log(`[4KHDHub] Search Request URL: ${searchUrl}`);
    const html = yield fetchText(searchUrl);
    if (!html) {
      console.log("[4KHDHub] Search failed: No HTML response");
      return null;
    }
    const $ = cheerio.load(html);
    const targetType = isSeries ? "Series" : "Movies";
    console.log(`[4KHDHub] Parsing search results for type: ${targetType}`);
    const matchingCards = $(".movie-card").filter((_, el) => {
      const hasFormat = $(el).find(`.movie-card-format:contains("${targetType}")`).length > 0;
      if (!hasFormat) {
      }
      return hasFormat;
    }).filter((_, el) => {
      const metaText = $(el).find(".movie-card-meta").text();
      const movieCardYear = parseInt(metaText);
      const yearMatch = !year || isNaN(movieCardYear) || Math.abs(movieCardYear - year) <= 1;
      if (!yearMatch) {
        console.log(`[4KHDHub] Skip: Year mismatch (${movieCardYear} vs ${year}) - ${$(el).find(".movie-card-title").text().trim()}`);
      }
      return yearMatch;
    }).filter((_, el) => {
      const movieCardTitle = $(el).find(".movie-card-title").text().replace(/\[.*?]/g, "").trim();
      const distance = levenshteinDistance(movieCardTitle.toLowerCase(), name.toLowerCase());
      const norm = value => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const match = norm(movieCardTitle) === norm(name) || distance / Math.max(movieCardTitle.length, name.length, 1) < 0.2;
      console.log(`[4KHDHub] Checking: "${movieCardTitle}" (Dist: ${distance}) vs "${name}"`);
      return match;
    }).map((_, el) => {
      let href = $(el).attr("href");
      if (href && !href.startsWith("http")) {
        href = domain + (href.startsWith("/") ? "" : "/") + href;
      }
      return href;
    }).get();
    if (matchingCards.length === 0) {
      console.log("[4KHDHub] No matching cards found after filtering");
    } else {
      console.log(`[4KHDHub] Found ${matchingCards.length} matching cards`);
    }
    return matchingCards.length > 0 ? matchingCards[0] : null;
  });
}
var cheerio2 = require("cheerio-without-node-native");
function resolveRedirectUrl(redirectUrl) {
  return __async(this, null, function* () {
    if (/\.(m3u8|mpd|mp4|mkv)(?:$|[?#])/i.test(redirectUrl) || redirectUrl.includes("hubcloud.") || redirectUrl.includes("hubdrive.")) {
      return redirectUrl;
    }
    const redirectHtml = yield fetchText(redirectUrl);
    if (!redirectHtml)
      return redirectUrl;
    try {
      const redirectDataMatch = redirectHtml.match(/'o','(.*?)'/);
      if (!redirectDataMatch)
        return redirectUrl;
      const step1 = atob(redirectDataMatch[1]);
      const step2 = atob(step1);
      const step3 = rot13Cipher(step2);
      const step4 = atob(step3);
      const redirectData = JSON.parse(step4);
      if (redirectData && redirectData.o) {
        return atob(redirectData.o);
      }
    } catch (e) {
      console.log(`[4KHDHub] Error resolving redirect: ${e.message}`);
    }
    return redirectUrl;
  });
}
// Release tags are hints, not a probe of the video's colour metadata.
// Never infer SDR from missing HDR tags, resolution, HEVC or 10-bit alone.
function detectDynamicRange(text) {
  const value = String(text || "").replace(/[_\.]+/g, " ");
  const tags = [];
  if (/\b(?:dolby[\s-]*vision|dovi|dv)\b/i.test(value))
    tags.push("Dolby Vision");
  if (/\bhdr[\s-]*10\s*(?:\+|plus\b)/i.test(value))
    tags.push("HDR10+");
  else if (/\bhdr[\s-]*10\b/i.test(value))
    tags.push("HDR10");
  else if (/\bhdr\b/i.test(value))
    tags.push("HDR");
  if (/\bhlg\b/i.test(value))
    tags.push("HLG");
  if (tags.length)
    return tags.join(" / ");
  return /\bsdr\b/i.test(value) ? "SDR" : null;
}
function detectVideoCodec(text) {
  const value = String(text || "").replace(/_/g, " ");
  if (/\bav1\b/i.test(value)) return "AV1";
  if (/\b(?:h[.\s-]?265|x265|hevc)\b/i.test(value)) return "H.265";
  if (/\b(?:h[.\s-]?264|x264|avc)\b/i.test(value)) return "H.264";
  return null;
}
function extractReleaseMeta($, el, context) {
  const item = $(el);
  const title = item.find(".file-title, .episode-file-title").text().trim();
  let heading = context && context.title || "";
  let languages = context && context.languages || "";
  // Nuvio's parser has no closest(). The main extraction loop passes the
  // release heading down while it already has the parent in hand.
  if (!context) {
    $(".episode-item").each((_, release) => {
      let found = false;
      $(release).find(".episode-download-item").each((_, candidate) => {
        // DOM identity in Cheerio; wrapper IDs in Nuvio's native parser.
        if (candidate === el || (candidate._elementIds && el._elementIds &&
            candidate._elementIds.join(",") === el._elementIds.join(","))) found = true;
      });
      if (found) {
        heading = $(release).find(".episode-title").first().text().trim();
        languages = $(release).find(".episode-meta").first().text();
      }
    });
  }
  heading = heading || item.find(".download-header").first().text().trim();
  const resolution = (title + " " + heading).match(/\b(\d{3,4})p\b/i);
  const size = item.text().match(/([\d.]+ ?[GM]B)/i);
  return {
    title: title || heading,
    releaseTitle: heading,
    edition: /\bHQ\b/i.test(title + " " + heading) ? "HQ" : null,
    height: resolution ? parseInt(resolution[1]) : /\b4k\b/i.test(title + " " + heading) ? 2160 : 0,
    bytes: size ? parseBytes(size[1]) : 0,
    dynamicRange: detectDynamicRange(title) || detectDynamicRange(heading),
    details: providerDetails(title + " " + heading, languages || item.find(".download-header").text()),
    codec: detectVideoCodec(title) || detectVideoCodec(heading)
  };
}
function streamFromLink(link, sourceMeta) {
  const meta = link.meta || sourceMeta;
  const height = meta.height || sourceMeta.height;
  // Prefer the resolved filename, retaining per-release page tags as fallback.
  const range = detectDynamicRange(meta.title) || meta.dynamicRange ||
    sourceMeta.dynamicRange || detectDynamicRange(sourceMeta.title);
  const codec = detectVideoCodec(meta.title) || meta.codec || sourceMeta.codec || detectVideoCodec(sourceMeta.title) || detectVideoCodec(sourceMeta.releaseTitle);
  const release = providerReleaseLabel(meta.title, sourceMeta.title, sourceMeta.releaseTitle);
  return {
    name: `4KHDHub - ${link.source}${height ? ` ${height}p` : ""}${release ? ` | ${release}` : ""}${range ? ` | ${range}` : ""}${codec ? ` | ${codec}` : ""}${sourceMeta.edition ? ` | ${sourceMeta.edition}` : ""}`,
    title: [meta.title || sourceMeta.title, sourceMeta.details, (meta.bytes || sourceMeta.bytes) ? formatBytes(meta.bytes || sourceMeta.bytes) : null].filter(Boolean).join("\n"),
    url: link.url,
    // Keep resolution-only quality for compatibility with Nuvio's sorting.
    quality: height ? `${height}p` : void 0,
    behaviorHints: { bingeGroup: `4khdhub-${release || "untagged"}-${range || "untagged"}-${codec || "untagged"}-${height || 0}-${link.source}` }
  };
}
function extractSourceResults($, el, context) {
  return __async(this, null, function* () {
    const meta = extractReleaseMeta($, el, context);
    const hblinksLink = $(el).find("a").filter((_, a) => {
      const href = $(a).attr("href") || "";
      return href.includes("hblinks") || href.includes("hubstream.dad");
    }).attr("href");
    if (hblinksLink) {
      return { url: new ProviderURL(hblinksLink, BASE_URL).toString(), meta, extractor: "hblinks" };
    }
    const hubCloudLink = $(el).find("a").filter((_, a) => {
      const text = $(a).text();
      const href = $(a).attr("href") || "";
      return text.includes("HubCloud") || href.includes("hubcloud.") || href.includes("hubcloud/");
    }).attr("href");
    if (hubCloudLink) {
      const resolved = yield resolveRedirectUrl(hubCloudLink);
      return { url: resolved, meta };
    }
    const hubDriveLink = $(el).find("a").filter((_, a) => {
      const text = $(a).text();
      const href = $(a).attr("href") || "";
      return text.includes("HubDrive") || href.includes("hubdrive.") || href.includes("hubdrive/");
    }).attr("href");
    if (hubDriveLink) {
      const resolvedDrive = yield resolveRedirectUrl(hubDriveLink);
      if (resolvedDrive) {
        const hubDriveHtml = yield fetchText(resolvedDrive);
        if (hubDriveHtml) {
          const $2 = cheerio2.load(hubDriveHtml);
          const innerCloudLink = $2('a:contains("HubCloud")').attr("href") || $2("a").filter((_, a) => {
            const text = $2(a).text();
            const href = $2(a).attr("href") || "";
            return text.includes("HubCloud") || href.includes("hubcloud.") || href.includes("hubcloud/");
          }).attr("href");
          if (innerCloudLink) {
            return { url: innerCloudLink, meta };
          }
        }
      }
    }
    return null;
  });
}
function extractHubCloud(hubCloudUrl, baseMeta) {
  return __async(this, null, function* () {
    if (!hubCloudUrl)
      return [];
    const redirectHtml = yield fetchText(hubCloudUrl, { headers: { Referer: hubCloudUrl } });
    if (!redirectHtml)
      return [];
    const $redirect = cheerio2.load(redirectHtml);
    const redirectUrlMatch = redirectHtml.match(/var\s+url\s*=\s*["']([^"']+)["']/);
    const redirectTarget = $redirect("#download").attr("href") || (redirectUrlMatch && redirectUrlMatch[1]);
    const finalLinksUrl = providerHttpUrl(redirectTarget || hubCloudUrl, hubCloudUrl);
    if (!finalLinksUrl) return [];
    const linksHtml = yield fetchText(finalLinksUrl, { headers: { Referer: hubCloudUrl } });
    if (!linksHtml)
      return [];
    const $ = cheerio2.load(linksHtml);
    const results = [];
    const sizeText = $("#size").text();
    const titleText = $(".card-header").first().text().trim() || $("title").text().trim();
    const currentMeta = __spreadProps(__spreadValues({}, baseMeta), {
      bytes: parseBytes(sizeText) || baseMeta.bytes,
      title: titleText || baseMeta.title
    });
    $("a").each((_, el) => {
      const text = $(el).text().trim();
      const href = providerHttpUrl($(el).attr("href") || "", finalLinksUrl);
      if (!href)
        return;
      if (text.includes("PixelServer") && /pixeldrain\.[^/]+\/u\//i.test(href)) {
        results.push({ source: "Pixeldrain", url: href.replace("/u/", "/api/file/"), meta: currentMeta });
      } else if (text.includes("10Gbps") || text.includes("PixelServer") || href.includes("hubcloud.cx")) {
        results.push({
          source: "HubCloud 10Gbps",
          url: href,
          meta: currentMeta
        });
      } else if (text.includes("Download File") || href.includes("r2.dev")) {
        results.push({
          source: "Direct R2",
          url: href,
          meta: currentMeta
        });
      } else if (text.includes("ZipDisk") || href.includes("workers.dev")) {
        results.push({
          source: "ZipDisk Server",
          url: href,
          meta: currentMeta
        });
      } else if (text.includes("FSL")) {
        results.push({
          source: "FSL",
          url: href,
          meta: currentMeta
        });
      }
    });
    return results;
  });
}
function extractHblinks(hblinksUrl, baseMeta, depth = 0) {
  return __async(this, null, function* () {
    if (!hblinksUrl || depth > 2)
      return [];
    try {
      const html = yield fetchText(hblinksUrl, { headers: { Referer: hblinksUrl } });
      if (!html)
        return [];
      const $ = cheerio2.load(html);
      const links = [...new Set($("h3 a, h5 a, div.entry-content p a, div.entry-content a").map((_, el) => $(el).attr("href")).get().filter(Boolean))];
      const results = [];
      for (const rawLink of links) {
        try {
          const absoluteLink = new ProviderURL(rawLink, hblinksUrl).toString();
          const resolvedLink = yield resolveRedirectUrl(absoluteLink);
          const link = resolvedLink || absoluteLink;
          const hostname = new ProviderURL(link).hostname.toLowerCase();
          if (hostname.includes("hblinks") || hostname.includes("hubstream.dad")) {
            const nestedResults = yield extractHblinks(link, baseMeta, depth + 1);
            results.push(...nestedResults);
          } else if (hostname.includes("hubcloud")) {
            const cloudResults = yield extractHubCloud(link, baseMeta);
            results.push(...cloudResults);
          } else if (hostname.includes("hubdrive")) {
            const driveHtml = yield fetchText(link, { headers: { Referer: hblinksUrl } });
            if (driveHtml) {
              const $drive = cheerio2.load(driveHtml);
              const cloudLink = $drive("a").filter((_, a) => {
                const text = $drive(a).text();
                const href = $drive(a).attr("href") || "";
                return text.includes("HubCloud") || href.includes("hubcloud.") || href.includes("hubcloud/");
              }).attr("href");
              if (cloudLink) {
                const absoluteCloudLink = new ProviderURL(cloudLink, link).toString();
                const cloudResults = yield extractHubCloud(absoluteCloudLink, baseMeta);
                results.push(...cloudResults);
              }
            }
          } else if (/\.(m3u8|mpd|mp4|mkv)(?:$|\?)/i.test(link)) {
            results.push({ source: "Hblinks Direct", url: link, meta: baseMeta });
          }
        } catch (e) {
        }
      }
      return results;
    } catch (e) {
      return [];
    }
  });
}
var cheerio3 = require("cheerio-without-node-native");
function getStreams(tmdbId, type, season, episode) {
  return __async(this, null, function* () {
    const tmdbDetails = yield getTmdbDetails(tmdbId, type);
    if (!tmdbDetails)
      return [];
    const { title, year } = tmdbDetails;
    console.log(`[4KHDHub] Search: ${title} (${year})`);
    const isSeries = type === "series" || type === "tv";
    const pageUrl = yield fetchPageUrl(title, year, isSeries);
    if (!pageUrl) {
      console.log("[4KHDHub] Page not found");
      return [];
    }
    console.log(`[4KHDHub] Found page: ${pageUrl}`);
    const html = yield fetchText(pageUrl);
    if (!html)
      return [];
    const $ = cheerio3.load(html);
    const itemsToProcess = [];
    if (isSeries && season && episode) {
      const seasonStr = "S" + String(season).padStart(2, "0");
      const episodeStr = "Episode-" + String(episode).padStart(2, "0");
      $(".episode-item").each((_, el) => {
        if ($(".episode-title", el).text().includes(seasonStr)) {
          const downloadItems = $(".episode-download-item", el).filter((_2, item) => $(item).text().includes(episodeStr));
          downloadItems.each((_2, item) => {
            itemsToProcess.push({ item, context: {
              title: $(el).find(".episode-title").first().text().trim(),
              languages: $(el).find(".episode-meta").first().text()
            } });
          });
        }
      });
    } else {
      $(".download-item").each((_, el) => {
        itemsToProcess.push({ item: el, context: {} });
      });
    }
    console.log(`[4KHDHub] Processing ${itemsToProcess.length} items`);
    const streamPromises = itemsToProcess.map((entry) => __async(this, null, function* () {
      try {
        const sourceResult = yield extractSourceResults($, entry.item, entry.context);
        if (sourceResult && sourceResult.url) {
          console.log(`[4KHDHub] Extracting from ${sourceResult.extractor === "hblinks" ? "Hblinks" : "HubCloud"}: ${sourceResult.url}`);
          let extractedLinks;
          if (sourceResult.extractor === "hblinks") {
            extractedLinks = yield extractHblinks(sourceResult.url, sourceResult.meta);
          } else {
            extractedLinks = yield extractHubCloud(sourceResult.url, sourceResult.meta);
          }
          return extractedLinks.map((link) => streamFromLink(link, sourceResult.meta));
        }
        return [];
      } catch (err) {
        console.log(`[4KHDHub] Item processing error: ${err.message}`);
        return [];
      }
    }));
    const results = yield Promise.all(streamPromises);
    return results.reduce((acc, val) => acc.concat(val), []);
  });
}
module.exports = { getStreams: providerGetStreams };
