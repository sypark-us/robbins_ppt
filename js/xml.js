// Tiny XML parser (enough for OOXML) that works in both browsers and Node, plus tree helpers.
// Node shape: { name: 'p:sp', local: 'sp', attrs: {...}, children: [Node], text: '' } (text nodes are { text })

const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
export const decodeEntities = (s) => (s.includes('&') ? s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e] ?? m))) : s);

export function parseXml(src) {
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const root = { name: '#document', local: '#document', attrs: {}, children: [] };
  const stack = [root];
  let i = 0; const n = src.length;
  const cur = () => stack[stack.length - 1];
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { const t = src.slice(i); if (t.trim()) cur().children.push({ text: decodeEntities(t) }); break; }
    if (lt > i) { const t = src.slice(i, lt); if (t.trim() || (cur() !== root && t)) cur().children.push({ text: decodeEntities(t) }); }
    if (src.startsWith('<!--', lt)) { i = src.indexOf('-->', lt + 4); i = i < 0 ? n : i + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt + 9); cur().children.push({ text: src.slice(lt + 9, e < 0 ? n : e) }); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith('<?', lt)) { const e = src.indexOf('?>', lt + 2); i = e < 0 ? n : e + 2; continue; }
    if (src.startsWith('<!', lt)) { const e = src.indexOf('>', lt + 2); i = e < 0 ? n : e + 1; continue; }
    if (src[lt + 1] === '/') { const e = src.indexOf('>', lt); if (stack.length > 1) stack.pop(); i = e < 0 ? n : e + 1; continue; }
    // start tag
    let j = lt + 1;
    while (j < n && !/[\s/>]/.test(src[j])) j++;
    const name = src.slice(lt + 1, j);
    const node = { name, local: name.includes(':') ? name.slice(name.indexOf(':') + 1) : name, attrs: {}, children: [] };
    let selfClose = false;
    while (j < n) {
      while (j < n && /\s/.test(src[j])) j++;
      if (src[j] === '>') { j++; break; }
      if (src[j] === '/' && src[j + 1] === '>') { selfClose = true; j += 2; break; }
      let k = j;
      while (k < n && !/[\s=/>]/.test(src[k])) k++;
      const an = src.slice(j, k);
      j = k; while (j < n && /\s/.test(src[j])) j++;
      if (src[j] === '=') {
        j++; while (j < n && /\s/.test(src[j])) j++;
        const q = src[j];
        if (q === '"' || q === "'") { const e = src.indexOf(q, j + 1); node.attrs[an] = decodeEntities(src.slice(j + 1, e < 0 ? n : e)); j = e < 0 ? n : e + 1; }
        else { let e = j; while (e < n && !/[\s>]/.test(src[e])) e++; node.attrs[an] = src.slice(j, e); j = e; }
      } else if (an) node.attrs[an] = '';
      else j++;
    }
    cur().children.push(node);
    if (!selfClose) stack.push(node);
    i = j;
  }
  return root;
}

// --- helpers ------------------------------------------------------------------------------------
const matches = (node, name) => node.name === name || node.local === name;
export const children = (node, name) => (node ? node.children.filter((c) => c.name && (!name || matches(c, name))) : []);
export const child = (node, name) => (node ? node.children.find((c) => c.name && matches(c, name)) : undefined);
export function path(node, ...names) { let cur = node; for (const nm of names) { cur = child(cur, nm); if (!cur) return undefined; } return cur; }
export function findAll(node, name, out = []) { if (!node) return out; for (const c of node.children) if (c.name) { if (matches(c, name)) out.push(c); findAll(c, name, out); } return out; }
export const find = (node, name) => findAll(node, name)[0];
export const attr = (node, name, dflt) => (node && node.attrs[name] !== undefined ? node.attrs[name] : dflt);
export const num = (node, name, dflt = 0) => { const v = attr(node, name); const f = parseFloat(v); return Number.isFinite(f) ? f : dflt; };
export function textOf(node) { if (!node) return ''; let s = ''; for (const c of node.children) s += c.name ? textOf(c) : c.text; return s; }
export const rootEl = (doc) => doc.children.find((c) => c.name);
