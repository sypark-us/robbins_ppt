// Small shared helpers (no DOM dependencies except where noted).

let counter = 0;
export const uid = (prefix = 'e') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round = (v, d = 2) => { const m = 10 ** d; return Math.round(v * m) / m; };
export const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
export const deg2rad = (d) => (d * Math.PI) / 180;

export const escapeXml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
export const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --- colors -----------------------------------------------------------------------------------
export function parseColor(c) {
  if (!c) return null;
  c = String(c).trim();
  let m = c.match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) { const n = parseInt(m[1], 16); return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 }; }
  m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 };
  m = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  return null;
}
export const toHex = (c) => '#' + [c.r, c.g, c.b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
export const hex6 = (c) => { const p = parseColor(c); return p ? toHex(p).slice(1).toUpperCase() : '000000'; };
export const normHex = (c, fallback = '#000000') => { const p = parseColor(c); return p ? toHex(p) : fallback; };
export function mixColor(a, b, t) {
  const A = parseColor(a) || { r: 0, g: 0, b: 0 }, B = parseColor(b) || { r: 255, g: 255, b: 255 };
  return toHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t });
}
export const lighten = (c, t) => mixColor(c, '#ffffff', t);
export const darken = (c, t) => mixColor(c, '#000000', t);
export function luminance(c) { const p = parseColor(c); if (!p) return 0; const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(p.r) + 0.7152 * f(p.g) + 0.0722 * f(p.b); }
export const contrastText = (bg) => (luminance(bg) > 0.4 ? '#000000' : '#ffffff');
export function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex({ r: 255 * f(0), g: 255 * f(8), b: 255 * f(4) });
}

// --- geometry ----------------------------------------------------------------------------------
export function rotatePoint(px, py, cx, cy, deg) {
  const a = deg2rad(deg), c = Math.cos(a), s = Math.sin(a), dx = px - cx, dy = py - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}
export function boundsOf(el) {
  // axis-aligned bounds of a possibly rotated element
  if (!el.rotation) return { x: el.x, y: el.y, w: el.w, h: el.h };
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
  const pts = [[el.x, el.y], [el.x + el.w, el.y], [el.x, el.y + el.h], [el.x + el.w, el.y + el.h]].map(([x, y]) => rotatePoint(x, y, cx, cy, el.rotation));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
export function unionBounds(list) {
  if (!list.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const b of list) { x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// --- misc ---------------------------------------------------------------------------------------
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' : '') + String(m).padStart(h ? 2 : 1, '0') + ':' + String(x).padStart(2, '0'); };

export function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function base64ToBytes(b64) { const s = atob(b64); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
export function dataUrlParts(url) { const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url || ''); if (!m) return null; return { mime: m[1] || 'application/octet-stream', base64: !!m[2], data: m[3] }; }
export function dataUrlToBytes(url) { const p = dataUrlParts(url); if (!p) return null; return p.base64 ? base64ToBytes(p.data) : new TextEncoder().encode(decodeURIComponent(p.data)); }
export const bytesToDataUrl = (bytes, mime) => `data:${mime};base64,${bytesToBase64(bytes)}`;
export const mimeExt = (mime) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/tiff': 'tiff', 'image/x-emf': 'emf', 'image/x-wmf': 'wmf' }[mime] || 'bin');
export const extMime = (ext) => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/x-emf', wmf: 'image/x-wmf' }[String(ext).toLowerCase()] || 'application/octet-stream');

export function downloadBytes(bytes, name, mime = 'application/octet-stream') {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
export const readFileAsBytes = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result)); r.onerror = rej; r.readAsArrayBuffer(file); });
export const readFileAsDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
export const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image failed to load')); i.src = src; });

export const FONTS = ['Arial', 'Calibri', 'Cambria', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Segoe UI', 'Helvetica', 'Garamond', 'Century Gothic', 'Courier New', 'Consolas', 'Impact', 'Comic Sans MS', 'Palatino Linotype', 'Book Antiqua'];
export const fontStack = (f) => { const generic = /courier|consolas|mono/i.test(f) ? 'monospace' : /georgia|times|garamond|cambria|palatino|antiqua|serif/i.test(f) ? 'serif' : 'sans-serif'; return `'${f}', ${f === 'Calibri' ? 'Carlito, ' : ''}${generic}`; };
