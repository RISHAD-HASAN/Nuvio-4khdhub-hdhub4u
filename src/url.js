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
