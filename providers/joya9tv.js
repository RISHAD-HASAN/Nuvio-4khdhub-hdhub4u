// Nuvio Joya9TV adaptation 2.2.2. See docs/JOYA9TV.md and NOTICE.md.
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

var catalogHosts = (function() {
/**
 * hdhub4u - Built from src/hdhub4u/
 */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
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
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
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

// src/hdhub4u/index.js
var import_cheerio_without_node_native2 = __toESM(require("cheerio-without-node-native"));

// src/hdhub4u/constants.js
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var TMDB_BASE_URL = "https://api.themoviedb.org/3";
var MAIN_URL = "https://new6.hdhub4u.cl";
var DOMAINS_URL = "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json";
var DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1e3;
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  "Cookie": "xla=s4t",
  "Referer": `${MAIN_URL}/`
};
function updateMainUrl(url) {
  MAIN_URL = url;
  HEADERS.Referer = `${url}/`;
}

// src/hdhub4u/utils.js
var domainCacheTimestamp = 0;
function formatBytes(bytes) {
  if (!bytes || bytes === 0)
    return "Unknown";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
function extractServerName(source) {
  if (!source)
    return "Unknown";
  if (source.startsWith("HubCloud")) {
    const serverMatch = source.match(/HubCloud(?:\s*-\s*([^[\]]+))?/);
    return serverMatch ? (serverMatch[1] || "Download").trim() : "HubCloud";
  }
  if (source.startsWith("Pixeldrain"))
    return "Pixeldrain";
  if (source.startsWith("StreamTape"))
    return "StreamTape";
  if (source.startsWith("HubCdn"))
    return "HubCdn";
  if (source.startsWith("HbLinks"))
    return "HbLinks";
  if (source.startsWith("Hubstream"))
    return "Hubstream";
  return source.split("[")[0].trim().replace(/^www\./, "").split(".")[0];
}
function rot13(value) {
  return value.replace(/[a-zA-Z]/g, function(c) {
    return String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
  });
}
var BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
function atob(value) {
  if (!value)
    return "";
  let input = String(value).replace(/=+$/, "");
  let output = "";
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
function getLinkDynamicRange(link) {
  // Use the original filename, before TV display titles replace it.
  // Source labels may retain release tags when an extractor has no filename.
  return detectDynamicRange(link.fileName) || detectDynamicRange(link.releaseTitle) || detectDynamicRange(link.source);
}
function cleanTitle(title) {
  let name = title.replace(/\.[a-zA-Z0-9]{2,4}$/, "");
  const normalized = name.replace(/WEB[-_. ]?DL/gi, "WEB-DL").replace(/WEB[-_. ]?RIP/gi, "WEBRIP").replace(/H[ .]?265/gi, "H265").replace(/H[ .]?264/gi, "H264").replace(/DDP[ .]?([0-9]\.[0-9])/gi, "DDP$1");
  const parts = normalized.split(/[\s_.]/);
  const sourceTags = /* @__PURE__ */ new Set(["WEB-DL", "WEBRIP", "BLURAY", "HDRIP", "DVDRIP", "HDTV", "CAM", "TS", "BRRIP", "BDRIP"]);
  const codecTags = /* @__PURE__ */ new Set(["H264", "H265", "X264", "X265", "HEVC", "AVC"]);
  const audioTags = ["AAC", "AC3", "DTS", "MP3", "FLAC", "DD", "DDP", "EAC3"];
  const audioExtras = /* @__PURE__ */ new Set(["ATMOS"]);
  const hdrTags = /* @__PURE__ */ new Set(["SDR", "HDR", "HDR10", "HDR10+", "DV", "DOLBYVISION"]);
  const filtered = parts.map((part) => {
    const p = part.toUpperCase();
    if (sourceTags.has(p))
      return p;
    if (codecTags.has(p))
      return p;
    if (audioTags.some((tag) => p.startsWith(tag)))
      return p;
    if (audioExtras.has(p))
      return p;
    if (hdrTags.has(p))
      return p === "DOLBYVISION" || p === "DV" ? "DOLBYVISION" : p;
    if (p === "NF" || p === "CR")
      return p;
    return null;
  }).filter(Boolean);
  return [...new Set(filtered)].join(" ");
}
function fetchAndUpdateDomain() {
  return __async(this, null, function* () {
    const now = Date.now();
    if (now - domainCacheTimestamp < DOMAIN_CACHE_TTL)
      return;
    console.log("[HDHub4u] Fetching latest domain...");
    try {
      const response = yield providerFetch(DOMAINS_URL, {
        method: "GET",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
      });
      if (response.ok) {
        const data = yield response.json();
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
  });
}
function getCurrentDomain() {
  return __async(this, null, function* () {
    yield fetchAndUpdateDomain();
    return MAIN_URL;
  });
}
function normalizeTitle(title) {
  if (!title)
    return "";
  return title.toLowerCase().replace(/\b(the|a|an)\b/g, "").replace(/[:\-_]/g, " ").replace(/\s+/g, " ").replace(/[^\w\s]/g, "").trim();
}
function calculateTitleSimilarity(title1, title2) {
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);
  if (norm1 === norm2)
    return 1;
  const words1 = norm1.split(/\s+/).filter((w) => w.length > 0);
  const words2 = norm2.split(/\s+/).filter((w) => w.length > 0);
  if (words1.length === 0 || words2.length === 0)
    return 0;
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = words1.filter((w) => set2.has(w));
  const union = /* @__PURE__ */ new Set([...words1, ...words2]);
  const jaccard = intersection.length / union.size;
  const extraWordsCount = words2.filter((w) => !set1.has(w)).length;
  let score = jaccard - extraWordsCount * 0.05;
  if (words1.length > 0 && words1.every((w) => set2.has(w))) {
    score += 0.2;
  }
  return score;
}
function mediaTitleForMatch(value) {
  // Search titles often append a full release description. Compare the show
  // name, not codec/audio/language labels, while checking season separately.
  return String(value || "").split("|")[0]
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b(?:season\s*\d+|s\d{1,2})\b/gi, " ")
    .replace(/\((?:19|20)\d{2}\)/g, " ")
    .replace(/\b(?:WEB[. -]?DL|WEB[. -]?RIP|BLU[. -]?RAY|\d{3,4}p)\b[\s\S]*$/i, " ")
    .replace(/\(\s*\)/g, " ").trim();
}
function findBestTitleMatch(mediaInfo, searchResults, mediaType, season) {
  if (!searchResults || searchResults.length === 0)
    return null;
  let bestMatch = null;
  let bestScore = 0;
  for (const result of searchResults) {
    if (mediaType === "movie" && mediaInfo.year && result.year && Math.abs(mediaInfo.year - result.year) > 1) continue;
    const explicitSeason = result.title.match(/\bseason\s*(\d+)\b|\bs(\d+)\b/i);
    if (mediaType === "tv" && season && explicitSeason && Number(explicitSeason[1] || explicitSeason[2]) !== Number(season)) continue;
    let score = calculateTitleSimilarity(mediaInfo.title, mediaTitleForMatch(result.title));
    if (mediaInfo.year && result.year) {
      const yearDiff = Math.abs(mediaInfo.year - result.year);
      if (yearDiff === 0)
        score += 0.2;
      else if (yearDiff <= 1)
        score += 0.1;
      else if (yearDiff > 5)
        score -= 0.3;
    }
    if (mediaType === "tv" && season) {
      const titleLower = result.title.toLowerCase();
      const seasonPatterns = [
        `season ${season}`,
        `s${season}`,
        `season ${season.toString().padStart(2, "0")}`,
        `s${season.toString().padStart(2, "0")}`
      ];
      const hasSeason = seasonPatterns.some((p) => titleLower.includes(p));
      const otherSeasonMatch = titleLower.match(/season\s*(\d+)|s(\d+)/i);
      if (otherSeasonMatch) {
        const foundSeason = parseInt(otherSeasonMatch[1] || otherSeasonMatch[2]);
        if (foundSeason !== season) {
          score -= 0.8;
        }
      }
      if (hasSeason)
        score += 0.5;
      else
        score -= 0.3;
    }
    if (result.title.toLowerCase().includes("2160p") || result.title.toLowerCase().includes("4k")) {
      score += 0.05;
    }
    if (score > bestScore && score > 0.3) {
      bestScore = score;
      bestMatch = result;
    }
  }
  if (bestMatch)
    console.log(`[HDHub4u] Best title match: "${bestMatch.title}" (score: ${bestScore.toFixed(2)})`);
  return bestMatch;
}
function getTMDBDetails(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var _a;
    const endpoint = mediaType === "tv" ? "tv" : "movie";
    const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
    const response = yield providerFetch(url, {
      method: "GET",
      headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" }
    });
    if (!response.ok)
      throw new Error(`TMDB API error: ${response.status}`);
    const data = yield response.json();
    const title = mediaType === "tv" ? data.name : data.title;
    const releaseDate = mediaType === "tv" ? data.first_air_date : data.release_date;
    const year = releaseDate ? parseInt(releaseDate.split("-")[0]) : null;
    return { title, year, imdbId: ((_a = data.external_ids) == null ? void 0 : _a.imdb_id) || null };
  });
}

// src/hdhub4u/extractors.js
var import_cheerio_without_node_native = __toESM(require("cheerio-without-node-native"));
var import_crypto_js = __toESM(require("crypto-js"));
function getRedirectLinks(url, depth = 0) {
  return __async(this, null, function* () {
    try {
      if (depth > 5) return null;
      const response = yield providerFetch(url, { headers: HEADERS });
      if (!response.ok)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const doc = yield response.text();
      const regex = /s\s*\(\s*['"]o['"]\s*,\s*['"]([A-Za-z0-9+/=]+)['"]|ck\s*\(\s*['"]_wp_http_\d+['"]\s*,\s*['"]([^'"]+)['"]/g;
      let combinedString = "";
      let match;
      while ((match = regex.exec(doc)) !== null) {
        const extractedValue = match[1] || match[2];
        if (extractedValue)
          combinedString += extractedValue;
      }
      if (!combinedString) {
        const redirectMatch = doc.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (redirectMatch && redirectMatch[1]) {
          const newUrl = redirectMatch[1];
          if (newUrl !== url && !newUrl.includes(url)) {
            return yield getRedirectLinks(newUrl, depth + 1);
          }
        }
        return null;
      }
      const decodedString = atob(rot13(atob(atob(combinedString))));
      const jsonObject = JSON.parse(decodedString);
      const encodedUrl = atob(jsonObject.o || "").trim();
      if (encodedUrl)
        return encodedUrl;
      const data = atob(jsonObject.data || "").trim();
      const wpHttp = (jsonObject.blog_url || "").trim();
      if (wpHttp && data) {
        const directLinkResponse = yield providerFetch(`${wpHttp}?re=${data}`, { headers: HEADERS });
        const html = yield directLinkResponse.text();
        const $ = import_cheerio_without_node_native.default.load(html);
        return ($("body").text() || html).trim();
      }
      return null;
    } catch (e) {
      return null;
    }
  });
}
function vidStackExtractor(url) {
  return __async(this, null, function* () {
    var _a, _b, _c;
    try {
      const hash = url.split("#").pop().split("/").pop();
      const baseUrl = new ProviderURL(url).origin;
      const apiUrl = `${baseUrl}/api/v1/video?id=${hash}`;
      const response = yield providerFetch(apiUrl, { headers: __spreadProps(__spreadValues({}, HEADERS), { Referer: url }) });
      const encoded = (yield response.text()).trim();
      const key = import_crypto_js.default.enc.Utf8.parse("kiemtienmua911ca");
      const ivs = ["1234567890oiuytr", "0123456789abcdef"];
      for (const ivStr of ivs) {
        try {
          const iv = import_crypto_js.default.enc.Utf8.parse(ivStr);
          const decrypted = import_crypto_js.default.AES.decrypt(
            { ciphertext: import_crypto_js.default.enc.Hex.parse(encoded) },
            key,
            { iv, mode: import_crypto_js.default.mode.CBC, padding: import_crypto_js.default.pad.Pkcs7 }
          );
          const decryptedText = decrypted.toString(import_crypto_js.default.enc.Utf8);
          if (decryptedText && decryptedText.includes("source")) {
            const m3u8 = (_b = (_a = decryptedText.match(/"source":"(.*?)"/)) == null ? void 0 : _a[1]) == null ? void 0 : _b.replace(/\\/g, "");
            const subtitles = [];
            const subtitleSection = (_c = decryptedText.match(/"subtitle":\{(.*?)\}/)) == null ? void 0 : _c[1];
            if (subtitleSection) {
              const subtitlePattern = /"([^"]+)":\s*"([^"]+)"/g;
              let subMatch;
              while ((subMatch = subtitlePattern.exec(subtitleSection)) !== null) {
                const lang = subMatch[1];
                const subPath = subMatch[2].split("#")[0].replace(/\\/g, "");
                if (subPath) {
                  subtitles.push({
                    language: lang,
                    url: subPath.startsWith("http") ? subPath : `${baseUrl}${subPath}`
                  });
                }
              }
            }
            if (m3u8) {
              return [{
                source: "Vidstack Hubstream",
                quality: "M3U8",
                url: m3u8,
                headers: {
                  "Referer": url,
                  "Origin": baseUrl
                },
                subtitles
              }];
            }
          }
        } catch (e) {
        }
      }
      return [];
    } catch (e) {
      return [];
    }
  });
}
function hbLinksExtractor(url, depth = 0) {
  return __async(this, null, function* () {
    try {
      const response = yield providerFetch(url, { headers: __spreadProps(__spreadValues({}, HEADERS), { Referer: url }) });
      const data = yield response.text();
      const $ = import_cheerio_without_node_native.default.load(data);
      const links = [...new Set($("h3 a, h5 a, div.entry-content p a, div.entry-content a").map((i, el) => $(el).attr("href")).get().filter(Boolean))];
      const results = yield Promise.all(links.map((l) => loadExtractor(providerHttpUrl(l, url), url, depth + 1)));
      return results.flat().map((link) => __spreadProps(__spreadValues({}, link), {
        source: `${link.source} Hblinks`
      }));
    } catch (e) {
      return [];
    }
  });
}
function pixelDrainExtractor(link) {
  return __async(this, null, function* () {
    var _a;
    try {
      const urlObj = new ProviderURL(link);
      const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
      const fileId = ((_a = link.match(/(?:file|u)\/([A-Za-z0-9]+)/)) == null ? void 0 : _a[1]) || link.split("/").pop();
      if (!fileId)
        return [{ source: "Pixeldrain", quality: 0, url: link }];
      const finalUrl = link.includes("?download") ? link : `${baseUrl}/api/file/${fileId}?download`;
      return [{ source: "Pixeldrain", quality: 0, url: finalUrl }];
    } catch (e) {
      return [{ source: "Pixeldrain", quality: 0, url: link }];
    }
  });
}
function streamTapeExtractor(link) {
  return __async(this, null, function* () {
    var _a, _b, _c, _d;
    try {
      const url = new ProviderURL(link);
      url.hostname = "streamtape.com";
      const res = yield providerFetch(url.toString(), { headers: HEADERS });
      const data = yield res.text();
      let videoSrc = (_c = (_b = (_a = data.match(/document\.getElementById\('videolink'\)\.innerHTML = (.*?);/)) == null ? void 0 : _a[1]) == null ? void 0 : _b.match(/'(\/\/streamtape\.com\/get_video[^']+)'/)) == null ? void 0 : _c[1];
      if (!videoSrc) {
        videoSrc = (_d = data.match(/'(\/\/streamtape\.com\/get_video[^']+)'/)) == null ? void 0 : _d[1];
      }
      return videoSrc ? [{ source: "StreamTape", quality: providerResolution(videoSrc), url: "https:" + videoSrc }] : [];
    } catch (e) {
      return [];
    }
  });
}
function hubCloudExtractor(url, referer, depth = 0) {
  return __async(this, null, function* () {
    var _a;
    try {
      let currentUrl = url.replace("hubcloud.ink", "hubcloud.dad");
      const pageResponse = yield providerFetch(currentUrl, { headers: __spreadProps(__spreadValues({}, HEADERS), { Referer: referer }) });
      let pageData = yield pageResponse.text();
      let finalUrl = currentUrl;
      if (!currentUrl.includes("hubcloud.php")) {
        let nextHref = "";
        const $first = import_cheerio_without_node_native.default.load(pageData);
        const downloadBtn = $first("#download");
        if (downloadBtn.length) {
          nextHref = downloadBtn.attr("href");
        } else {
          const scriptUrlMatch = pageData.match(/var url = '([^']*)'/);
          if (scriptUrlMatch)
            nextHref = scriptUrlMatch[1];
        }
        if (nextHref) {
          if (!nextHref.startsWith("http")) {
            const urlObj = new ProviderURL(currentUrl);
            nextHref = `${urlObj.protocol}//${urlObj.hostname}/${nextHref.replace(/^\//, "")}`;
          }
          finalUrl = nextHref;
          const secondResponse = yield providerFetch(finalUrl, { headers: __spreadProps(__spreadValues({}, HEADERS), { Referer: currentUrl }) });
          pageData = yield secondResponse.text();
        }
      }
      const $ = import_cheerio_without_node_native.default.load(pageData);
      const size = $("i#size").text().trim();
      const header = $("div.card-header").text().trim();
      const qualityStr = (_a = header.match(/(\d{3,4})[pP]/)) == null ? void 0 : _a[1];
      const quality = qualityStr ? parseInt(qualityStr) : /\b4k\b/i.test(header) ? 2160 : 0;
      const headerDetails = cleanTitle(header);
      const labelExtras = (headerDetails ? `[${headerDetails}]` : "") + (size ? `[${size}]` : "");
      const sizeInBytes = (() => {
        const sizeMatch = size.match(/([\d.]+)\s*(GB|MB|KB)/i);
        if (!sizeMatch)
          return 0;
        const multipliers = { GB: 1024 ** 3, MB: 1024 ** 2, KB: 1024 };
        return parseFloat(sizeMatch[1]) * (multipliers[sizeMatch[2].toUpperCase()] || 0);
      })();
      const links = [];
      const elements = $("a.btn").get();
      for (const element of elements) {
        const link = $(element).attr("href");
        const text = $(element).text().toLowerCase();
        const fileName = header || headerDetails || "Unknown";
        if (text.includes("download file") || text.includes("fsl server") || text.includes("s3 server") || text.includes("fslv2") || text.includes("mega server") || link && link.includes("r2.dev")) {
          let label = "HubCloud";
          if (link && link.includes("r2.dev"))
            label = "Direct R2";
          else if (link && link.includes("workers.dev"))
            label = "ZipDisk Server";
          else if (text.includes("fsl server"))
            label = "HubCloud - FSL";
          else if (text.includes("s3 server"))
            label = "HubCloud - S3";
          else if (text.includes("fslv2"))
            label = "HubCloud - FSLv2";
          else if (text.includes("mega server"))
            label = "HubCloud - Mega";
          links.push({ source: `${label} ${labelExtras}`, quality, url: link, size: sizeInBytes, fileName });
        } else if (text.includes("buzzserver")) {
          try {
            const buzzResp = yield providerFetch(`${link}/download`, { method: "GET", headers: __spreadProps(__spreadValues({}, HEADERS), { Referer: link }), redirect: "manual" });
            let dlink = buzzResp.headers.get("hx-redirect") || buzzResp.headers.get("HX-Redirect");
            if (!dlink && buzzResp.url && buzzResp.url !== `${link}/download`) {
              dlink = buzzResp.url;
            }
            if (dlink) {
              links.push({ source: `HubCloud - BuzzServer ${labelExtras}`, quality, url: dlink, size: sizeInBytes, fileName });
            }
          } catch (e) {
          }
        } else if (text.includes("10gbps") || link && link.includes("hubcloud.cx")) {
          let targetUrl = link;
          if (link && !link.includes("hubcloud.cx")) {
            try {
              const resp = yield providerFetch(link, { method: "GET", redirect: "manual" });
              const loc = resp.headers.get("location");
              if (loc && loc.includes("link=")) {
                targetUrl = loc.substring(loc.indexOf("link=") + 5);
              }
            } catch (e) {
            }
          }
          links.push({ source: `HubCloud - 10Gbps ${labelExtras}`, quality, url: targetUrl, size: sizeInBytes, fileName });
        } else if (text.includes("zipdisk") || link && link.includes("workers.dev")) {
          links.push({ source: `ZipDisk Server ${labelExtras}`, quality, url: link, size: sizeInBytes, fileName });
        } else if (link && link.includes("pixeldra")) {
          const results = yield pixelDrainExtractor(link);
          links.push(...results.map((l) => __spreadProps(__spreadValues({}, l), { source: `${l.source} ${labelExtras}`, size: sizeInBytes, fileName })));
        } else if (link && !link.includes("magnet:") && link.startsWith("http")) {
          const extracted = yield loadExtractor(link, finalUrl, depth + 1);
          links.push(...extracted.map((l) => __spreadProps(__spreadValues({}, l), { quality: l.quality || quality, fileName: l.fileName && l.fileName !== "Unknown" ? l.fileName : fileName })));
        }
      }
      return links;
    } catch (e) {
      return [];
    }
  });
}
function hubCdnExtractor(url, referer) {
  return __async(this, null, function* () {
    try {
      const response = yield providerFetch(url, { headers: __spreadProps(__spreadValues({}, HEADERS), { Referer: referer }) });
      const data = yield response.text();
      const $ = import_cheerio_without_node_native.default.load(data);
      let scriptContent = "";
      $("script").each((i, el) => {
        const html = $(el).html();
        if (html && html.includes("reurl")) {
          scriptContent = html;
        }
      });
      if (scriptContent) {
        const match = scriptContent.match(/reurl\s*=\s*["']([^"']+)["']/);
        if (match && match[1]) {
          const reurlVal = match[1];
          if (reurlVal.includes("?r=")) {
            const queryPart = reurlVal.split("?r=").pop();
            try {
              const decoded = atob(queryPart);
              const m3u8Link = decoded.substring(decoded.lastIndexOf("link=") + 5);
              if (m3u8Link && m3u8Link.startsWith("http")) {
                return [{ source: "HubCdn", quality: providerResolution(m3u8Link), url: m3u8Link }];
              }
            } catch (e) {
            }
          } else if (reurlVal.includes("link=")) {
            const m3u8Link = reurlVal.split("link=").pop();
            if (m3u8Link && m3u8Link.startsWith("http")) {
              return [{ source: "HubCdn", quality: providerResolution(m3u8Link), url: m3u8Link }];
            }
          } else if (reurlVal.startsWith("http")) {
            return [{ source: "HubCdn", quality: providerResolution(reurlVal), url: reurlVal }];
          }
        }
      }
      const encodedMatch = data.match(/r=([A-Za-z0-9+/=]+)/);
      if (encodedMatch && encodedMatch[1]) {
        try {
          const decoded = atob(encodedMatch[1]);
          const m3u8Link = decoded.substring(decoded.lastIndexOf("link=") + 5);
          if (m3u8Link && m3u8Link.startsWith("http")) {
            return [{ source: "HubCdn", quality: providerResolution(m3u8Link), url: m3u8Link }];
          }
        } catch (e) {
        }
      }
      return [];
    } catch (e) {
      return [];
    }
  });
}
function loadExtractor(_0) {
  return __async(this, arguments, function* (url, referer = MAIN_URL, depth = 0) {
    try {
      if (depth > 8 || !providerHttpUrl(url)) return [];
      if (/\.(?:m3u8|mpd|mp4|mkv)(?:$|[?#])/i.test(url)) return [{ source: "Direct", quality: providerResolution(url), url }];
      const hostname = new ProviderURL(url).hostname;
      const isRedirect = url.includes("?id=") || hostname.includes("techyboy4u") || hostname.includes("gadgetsweb.xyz") || hostname.includes("cryptoinsights.site") || hostname.includes("bloggingvector") || hostname.includes("ampproject.org");
      if (isRedirect) {
        const finalLink = yield getRedirectLinks(url);
        if (finalLink && finalLink !== url)
          return yield loadExtractor(finalLink, url, depth + 1);
        return [];
      }
      if (hostname.includes("hubcloud"))
        return yield hubCloudExtractor(url, referer, depth);
      if (hostname.includes("hubcdn"))
        return yield hubCdnExtractor(url, referer);
      if (hostname.includes("hblinks") || hostname.includes("hubstream.dad"))
        return yield hbLinksExtractor(url, depth);
      if (hostname.includes("hubstream") || hostname.includes("vidstack"))
        return yield vidStackExtractor(url);
      if (hostname.includes("pixeldrain"))
        return yield pixelDrainExtractor(url);
      if (hostname.includes("streamtape"))
        return yield streamTapeExtractor(url);
      if (hostname.includes("hdstream4u"))
        return [{ source: "HdStream4u", quality: providerResolution(url), url }];
      if (hostname.includes("hubdrive")) {
        const res = yield providerFetch(url, { headers: __spreadProps(__spreadValues({}, HEADERS), { Referer: referer }) });
        const data = yield res.text();
        const href = import_cheerio_without_node_native.default.load(data)(".btn.btn-primary.btn-user.btn-success1.m-1").attr("href");
        if (href)
          return yield loadExtractor(providerHttpUrl(href, url), url, depth + 1);
      }
      return [];
    } catch (e) {
      return [];
    }
  });
}

// src/hdhub4u/index.js
var searchEndpointCache = { url: "https://search.pingora.fyi/collections/post/documents/search", ts: 0 };
function getSearchEndpoint() {
  return __async(this, null, function* () {
    if (Date.now() - searchEndpointCache.ts < 36e5) return searchEndpointCache.url;
    const domain = yield getCurrentDomain();
    try {
      const response = yield providerFetch(`${domain}/search.html`, { headers: HEADERS });
      const html = yield response.text();
      // Read the public search-page config; never execute its scripts.
      const match = html.match(/proxyUrl\s*:\s*["'](https:\/\/[^"']+\/collections\/post\/documents\/search)["']/i);
      if (match && providerHttpUrl(match[1])) searchEndpointCache.url = match[1];
      searchEndpointCache.ts = Date.now();
    } catch (error) {
      console.log(`[HDHub4u] Search config unavailable: ${error.message}`);
    }
    return searchEndpointCache.url;
  });
}
function searchPrimary(query) {
  return __async(this, null, function* () {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const endpoint = yield getSearchEndpoint();
    const searchUrl = `${endpoint}?q=${encodeURIComponent(query)}&query_by=post_title,category,stars,director,imdb_id&query_by_weights=4,2,2,2,4&sort_by=sort_by_date:desc&limit=15&highlight_fields=none&use_cache=true&page=1&analytics_tag=${today}`;
    const response = yield providerFetch(searchUrl, { headers: HEADERS });
    const data = yield response.json();
    if (!data || !data.hits)
      return [];
    return data.hits.map((hit) => {
      const doc = hit.document;
      const title = doc.post_title;
      const yearMatch = title.match(/\((19\d{2}|20\d{2})\)|\b(19\d{2}|20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1] || yearMatch[2]) : null;
      let url = doc.permalink;
      if (url && url.startsWith("/")) {
        url = `${MAIN_URL}${url}`;
      }
      return {
        title,
        url,
        poster: doc.post_thumbnail,
        year
      };
    });
  });
}
// Native site search fallback; no guessed Typesense keys or extra providers.
function search(query) {
  return __async(this, null, function* () {
    try {
      const hits = yield searchPrimary(query);
      if (hits.length) return hits;
    } catch (error) { console.log(`[HDHub4u] Primary search failed: ${error.message}`); }
    const domain = yield getCurrentDomain();
    const response = yield providerFetch(`${domain}/?s=${encodeURIComponent(query)}`, { headers: HEADERS });
    const $ = import_cheerio_without_node_native2.default.load(yield response.text());
    const hits = [];
    $("article h2 a, .recent-movies a, .movie-card a, li.thumb a").each((_, el) => {
      const title = $(el).attr("title") || $(el).text().trim();
      const url = providerHttpUrl($(el).attr("href") || "", domain);
      const year = title.match(/\b(19\d{2}|20\d{2})\b/);
      if (url && title) hits.push({ title, url, year: year ? Number(year[1]) : null });
    });
    return hits;
  });
}
function getDownloadLinks(mediaUrl, mediaType, targetEpisode) {
  return __async(this, null, function* () {
    const domain = yield getCurrentDomain();
    if (mediaUrl.includes("hdhub4u.")) {
      try {
        const urlObj = new ProviderURL(mediaUrl);
        const domainObj = new ProviderURL(domain);
        urlObj.hostname = domainObj.hostname;
        mediaUrl = urlObj.toString();
      } catch (e) {
      }
    }
    const response = yield providerFetch(mediaUrl, { headers: __spreadProps(__spreadValues({}, HEADERS), { Referer: `${domain}/` }) });
    const data = yield response.text();
    const $ = import_cheerio_without_node_native2.default.load(data);
    const releaseTitles = new Map();
    $("h3, h4, h5").each((_, heading) => {
      const title = $(heading).text().trim();
      $(heading).find("a").each((_, link) => {
        const href = $(link).attr("href");
        if (href) releaseTitles.set(href, title);
      });
    });
    const typeRaw = $("h1.page-title span").text();
    const isMovie = mediaType ? mediaType === "movie" : typeRaw.toLowerCase().includes("movie");
    if (isMovie) {
      const qualityLinks = $("h3 a, h4 a").filter((i, el) => $(el).text().match(/480|720|1080|2160|4K/i));
      const bodyLinks = $(".page-body > div a").filter((i, el) => {
        const href = $(el).attr("href");
        return href && (href.includes("hdstream4u") || href.includes("hubstream"));
      });
      const initialLinks = [.../* @__PURE__ */ new Set([
        ...qualityLinks.map((i, el) => $(el).attr("href")).get(),
        ...bodyLinks.map((i, el) => $(el).attr("href")).get()
      ])];
      const results = yield Promise.all(initialLinks.map((url) => loadExtractor(url, mediaUrl).then(links => links.map(link => Object.assign({}, link, { releaseTitle: releaseTitles.get(url) || "" })))));
      const allFinalLinks = results.flat();
      const seenUrls = /* @__PURE__ */ new Set();
      const uniqueFinalLinks = allFinalLinks.filter((link) => {
        var _a;
        if (!link.url || link.url.includes(".zip") || ((_a = link.name) == null ? void 0 : _a.toLowerCase().includes(".zip")))
          return false;
        if (seenUrls.has(link.url))
          return false;
        seenUrls.add(link.url);
        return true;
      });
      return { finalLinks: uniqueFinalLinks, isMovie };
    } else {
      const episodeLinksMap = /* @__PURE__ */ new Map();
      const directLinkBlocks = [];
      $("h3, h4").each((i, element) => {
        const $el = $(element);
        const text = $el.text();
        const anchors = $el.find("a");
        const links = anchors.map((i2, a) => $(a).attr("href")).get();
        const isDirectLinkBlock = anchors.get().some((a) => $(a).text().match(/1080|720|4K|2160/i));
        if (isDirectLinkBlock) {
          directLinkBlocks.push(...links);
          return;
        }
        const episodeMatch = text.match(/(?:EPiSODE\s*[-:]?\s*(\d+)|\bE(\d+)\b)/i);
        if (episodeMatch) {
          const epNum = parseInt(episodeMatch[1] || episodeMatch[2]);
          if (!episodeLinksMap.has(epNum))
            episodeLinksMap.set(epNum, []);
          episodeLinksMap.get(epNum).push(...links);
          let nextElement = $el.next();
          while (nextElement.length) {
            // Native wrappers don't expose tagName. Use the outer HTML to
            // stop at a separator or the next episode's heading.
            const outer = $.html(nextElement.get(0)) || "";
            if (/^\s*<hr\b/i.test(outer)) break;
            if (/^\s*<h[1-6]\b/i.test(outer) && /\b(?:episode\s*[-:]?\s*\d+|E\d+)\b/i.test(nextElement.text())) break;
            const siblingLinks = nextElement.find("a[href]").map((i2, a) => $(a).attr("href")).get();
            episodeLinksMap.get(epNum).push(...siblingLinks);
            nextElement = nextElement.next();
          }
        }
      });
      if (directLinkBlocks.length > 0 && !episodeLinksMap.has(Number(targetEpisode))) {
        yield Promise.all(directLinkBlocks.map((blockUrl) => __async(this, null, function* () {
          try {
            const resolvedUrl = yield getRedirectLinks(blockUrl);
            if (!resolvedUrl)
              return;
            const blockRes = yield providerFetch(resolvedUrl, { headers: HEADERS });
            const blockData = yield blockRes.text();
            const $$ = import_cheerio_without_node_native2.default.load(blockData);
            $$("h5 a, h4 a, h3 a").each((i, el) => {
              const linkText = $$(el).text();
              const linkHref = $$(el).attr("href");
              const epMatch = linkText.match(/Episode\s*[-:]?\s*(\d+)/i);
              if (epMatch && linkHref) {
                const epNum = parseInt(epMatch[1]);
                if (!episodeLinksMap.has(epNum))
                  episodeLinksMap.set(epNum, []);
                episodeLinksMap.get(epNum).push(linkHref);
              }
            });
          } catch (e) {
          }
        })));
      }
      const initialLinks = [];
      episodeLinksMap.forEach((links, epNum) => {
        if (targetEpisode && Number(epNum) !== Number(targetEpisode)) return;
        const uniqueLinks = [...new Set(links)];
        initialLinks.push(...uniqueLinks.map((link) => ({ url: link, episode: epNum })));
      });
      const results = yield Promise.all(initialLinks.map((linkInfo) => __async(this, null, function* () {
        try {
          const extracted = yield loadExtractor(linkInfo.url, mediaUrl);
          return extracted.map((ext) => __spreadProps(__spreadValues({}, ext), { episode: linkInfo.episode, releaseTitle: releaseTitles.get(linkInfo.url) || "" }));
        } catch (e) {
          return [];
        }
      })));
      const allFinalLinks = results.flat();
      const seenUrls = /* @__PURE__ */ new Set();
      const uniqueFinalLinks = allFinalLinks.filter((link) => {
        if (!link.url || link.url.includes(".zip"))
          return false;
        if (seenUrls.has(link.url))
          return false;
        seenUrls.add(link.url);
        return true;
      });
      return { finalLinks: uniqueFinalLinks, isMovie };
    }
  });
}
function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
  return __async(this, null, function* () {
    console.log(`[HDHub4u] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);
    try {
      const mediaInfo = yield getTMDBDetails(tmdbId, mediaType);
      console.log(`[HDHub4u] TMDB Info: "${mediaInfo.title}" (${mediaInfo.year || "N/A"})`);
      const searchQuery = mediaType === "tv" && season ? `${mediaInfo.title} Season ${season}` : mediaInfo.title;
      const searchResults = yield search(searchQuery);
      if (searchResults.length === 0) {
        console.log("[HDHub4u] Search returned no results; the search service may be blocked or unavailable");
        return [];
      }
      const bestMatch = findBestTitleMatch(mediaInfo, searchResults, mediaType, season);
      if (!bestMatch) { console.log("[HDHub4u] No search result matched the requested title/season"); return []; }
      const selectedMedia = bestMatch;
      console.log(`[HDHub4u] Selected: "${selectedMedia.title}" (${selectedMedia.url})`);
      const result = yield getDownloadLinks(selectedMedia.url, mediaType, episode);
      const finalLinks = result.finalLinks;
      let filteredLinks = finalLinks;
      if (mediaType === "tv" && episode !== null) {
        filteredLinks = finalLinks.filter((link) => link.episode === episode);
      }
      const streams = filteredLinks.map((link) => {
        let mediaTitle = link.fileName && link.fileName !== "Unknown" ? link.fileName : mediaInfo.title;
        if (mediaType === "tv" && season && episode) {
          mediaTitle = `${mediaInfo.title} S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
        }
        const serverName = extractServerName(link.source);
        const dynamicRange = getLinkDynamicRange(link);
        let qualityStr = "Unknown";
        if (typeof link.quality === "number" && link.quality > 0) {
          if (link.quality >= 2160)
            qualityStr = "4K";
          else if (link.quality >= 1080)
            qualityStr = "1080p";
          else if (link.quality >= 720)
            qualityStr = "720p";
          else if (link.quality >= 480)
            qualityStr = "480p";
        } else if (typeof link.quality === "string") {
          qualityStr = link.quality;
        }
        return {
          name: [`HDHub4u ${serverName}`, providerReleaseLabel(link.fileName, link.releaseTitle, link.source), dynamicRange, providerCodec(link.fileName) || providerCodec(link.releaseTitle) || providerCodec(link.source)].filter(Boolean).join(" | "),
          title: [mediaTitle, providerDetails(link.fileName || "", link.fileName || "")].filter(Boolean).join("\n"),
          url: link.url,
          quality: qualityStr,
          size: link.size ? formatBytes(link.size) : void 0,
          subtitles: link.subtitles || void 0,
          behaviorHints: { bingeGroup: `hdhub4u-${providerReleaseLabel(link.fileName, link.releaseTitle, link.source) || "untagged"}-${dynamicRange || "untagged"}-${providerCodec(link.fileName) || "untagged"}-${qualityStr}-${serverName}` },
          headers: link.headers || void 0,
          provider: "hdhub4u"
        };
      });
      const qualityOrder = { "4K": 4, "1080p": 2, "720p": 1, "480p": 0, "Unknown": -2 };
      return streams.sort((a, b) => providerRank(b.quality) - providerRank(a.quality));
    } catch (error) {
      console.error(`[HDHub4u] Scraping error: ${error.message}`);
      return [];
    }
  });
}
return { resolve: loadExtractor, decode: atob, range: detectDynamicRange };

})();
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

// Nuvio adaptation of the Joya9TV layouts documented by StreamX/Vega.
// No browser cookies, clearance tokens or access-control bypasses are imported.
var joyaBase = 'https://joya9tv1.com';
function joyaLog(stage, message) { console.log('[Joya9TV]['+stage+'] '+message); }
function joyaSpend(state) {
  if (++state.requests > (state.limit || 36)) throw new Error('Request budget exhausted');
  if(state.total && ++state.total.requests > 64) throw new Error('Total request budget exhausted');
}
function joyaPage(url, stage, budget) {
  try { joyaSpend(budget); } catch(error) { return Promise.reject(error); }
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
      const knownHtml=/(?:^|\.)(?:joya9tv1\.com|joya9links\.com)$/.test(host) || (/multicloudlinks\./i.test(host) && /^\/view\//i.test(new ProviderURL(url).pathname));
      if(!knownHtml) {
      joyaSpend(state);
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
          try { joyaSpend(state); } catch(error) {return Promise.reject(error);}
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
      const selected=rows.slice().sort((a,b)=>providerResolution(b.title)-providerResolution(a.title)).slice(0,12);
      function resolveRow(row) { return catalogAsync(function* () {
        const releaseBudget={requests:0,limit:12,total:budget};
        joyaLog('release','Starting '+(providerResolution(row.title) || 'unknown')+'p');
        let links=[];
        try{links=yield joyaResolve(row.url,row.title,releaseBudget,0,new Set(),type,season,episode,false);}
        catch(error){joyaLog(stage,error.message);}
        links.forEach(link=>{
          if(!link.url || seen.has(link.url))return;seen.add(link.url);
          let filename=link.fileName || row.title;
          try{const name=decodeURIComponent(new ProviderURL(link.url).pathname.split('/').pop());if(providerResolution(name) || providerReleaseLabel(name))filename=name;}catch(_){}
          const label=providerReleaseLabel(filename,row.title.replace(/\b(?:SD|HD|FHD|UHD)\b/g,'')),range=catalogHosts.range(filename) || catalogHosts.range(row.title),codec=providerCodec(filename) || providerCodec(row.title);
          const height=providerResolution(filename) || providerResolution(row.title);
          streams.push({name:['Joya9TV'+(height?' '+height+'p':''),label,range,codec].filter(Boolean).join(' | '),title:[filename,providerDetails(filename.replace(/\b(AAC|DDP|DD|AC3)\s+(?=\d{3,4}p\b)/gi,'$1 | '))].filter(Boolean).join('\n'),url:link.url,quality:height?height+'p':undefined,headers:link.headers,subtitles:link.subtitles,behaviorHints:{bingeGroup:'joya9tv-'+(label || '')+'-'+(range || '')+'-'+(codec || '')}});
        });
        joyaLog('release',(providerResolution(row.title) || 'unknown')+'p: '+links.length+' extracted entries');
      }); }
      let nextRow=0;
      const worker=()=>catalogAsync(function* () {
        while(nextRow<selected.length) {const row=selected[nextRow++];yield resolveRow(row);}
      });
      yield Promise.all([worker(),worker()]);
      joyaLog('complete',streams.length+' stream entries; playback not verified');return streams;
    } catch(error){joyaLog(stage,error.message);return [];}
  });
}

function getStreams(id,type,season,episode) { return joyaGetStreams(id,type,season,episode); }
module.exports = { getStreams: providerGetStreams };
