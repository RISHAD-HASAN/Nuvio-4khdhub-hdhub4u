// Shared helpers. The build copies these into each provider so Nuvio
// can load a single file without importing local modules.
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
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          if (controller) controller.abort();
          reject(new Error('Provider request timed out'));
        }, 15000);
      });
      // Read the body within the same timeout, in case the server stalls
      // after sending its headers.
      const request = Promise.resolve().then(() => fetch(url, requestOptions)).then(res =>
        res.text().then(body => ({
          ok: res.ok, status: res.status, statusText: res.statusText,
          headers: res.headers, url: res.url,
          text: () => Promise.resolve(body),
          json: () => Promise.resolve().then(() => JSON.parse(body))
        }))
      );
      return Promise.race([request, timeout]).then(res => {
        clearTimeout(timer);
        // Preserve manual redirects used by host extractors.
        if (res.ok === false && !(opts.redirect === 'manual' && res.status >= 300 && res.status < 400)) {
          const error = new Error('HTTP ' + res.status);
          error.retryable = res.status === 429 || res.status >= 500;
          throw error;
        }
        return res;
      }, err => { clearTimeout(timer); throw err; });
    }).catch(err => {
      const canRetry = (!opts.method || opts.method.toUpperCase() === 'GET') &&
        err.retryable !== false && count < 1;
      if (!canRetry) throw err;
      return new Promise(r => setTimeout(r, 350)).then(() => attempt(count + 1));
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
