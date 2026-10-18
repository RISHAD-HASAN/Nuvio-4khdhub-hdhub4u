// Test adapter for Nuvio's lightweight Cheerio bridge. In particular, nodes
// are wrapper objects, children() means find(), and closest() is absent.
const cheerio = require('cheerio-without-node-native');
module.exports = {
  load(html) {
    const real = cheerio.load(html);
    const ids = new WeakMap();
    let nextId = 1;
    function wrap(nodes) {
      const collection = real(nodes);
      const elements = collection.get();
      const wrapper = {
        _elementIds: elements.map(el => { if (!ids.has(el)) ids.set(el, String(nextId++)); return ids.get(el); }),
        _nodes: elements,
        length: elements.length,
        find: selector => wrap(collection.find(selector)),
        text: () => collection.text(),
        html: () => collection.html(),
        attr: name => collection.attr(name),
        first: () => wrap(elements.slice(0,1)),
        last: () => wrap(elements.slice(-1)),
        next: () => wrap(collection.next()),
        prev: () => wrap(collection.prev()),
        eq: i => wrap(i >= 0 && i < elements.length ? [elements[i]] : []),
        get(i) { return typeof i === 'number' ? elements[i] && wrap([elements[i]]) : elements.map(el => wrap([el])); },
        each(fn) { elements.forEach((el,i) => { const w = wrap([el]); fn.call(w,i,w); }); return wrapper; },
        map(fn) {
          const values = elements.map((el,i) => { const w = wrap([el]); return fn.call(w,i,w); }).filter(x => x !== null && x !== undefined);
          return { get: i => typeof i === 'number' ? values[i] : values, toArray: () => values, length: values.length };
        },
        filter(fn) { return typeof fn === 'function' ? wrap(elements.filter((el,i) => { const w=wrap([el]); return fn.call(w,i,w); })) : wrapper; },
        children: selector => wrap(collection.find(selector || '*')),
        parent: () => wrap([]),
        toArray: () => elements.map(el => wrap([el]))
      };
      return wrapper;
    }
    function $(selector, context) {
      if (selector && selector._elementIds) return selector;
      if (context && context._elementIds) return wrap(real(context._nodes).find(selector));
      return wrap(typeof selector === 'string' ? real(selector) : []);
    }
    $.html = el => el && el._nodes ? real.html(el._nodes[0]) : real.html();
    return $;
  }
};
