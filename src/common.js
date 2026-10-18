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
    const u = base ? new URL(value, base) : new URL(value);
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
