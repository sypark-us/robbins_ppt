// Paragraph/word-wrap layout for rich text. `measure(text, style)` returns a width in points for the
// given { font, size, bold, italic }; the browser supplies canvas measureText, tests use an estimate.
import { fontStack } from './util.js';

export const BULLET_INDENT = 22;   // hanging indent per bullet
export const LEVEL_INDENT = 28;    // extra indent per list level
export const LIST_PREFIXES = ['•', '◦', '▪', '•', '◦'];

export const approxMeasure = (text, st) => text.length * st.size * (st.bold ? 0.58 : 0.52);
export const styleKey = (st) => `${st.italic ? 'italic ' : ''}${st.bold ? 'bold ' : ''}${st.size}px ${fontStack(st.font)}`;
let canvasCtx = null;
export function canvasMeasure(text, st) {
  if (!canvasCtx) { if (typeof document === 'undefined') return approxMeasure(text, st); canvasCtx = document.createElement('canvas').getContext('2d'); }
  canvasCtx.font = styleKey(st);
  return canvasCtx.measureText(text).width;
}
export const defaultMeasure = () => (typeof document !== 'undefined' ? canvasMeasure : approxMeasure);

export function runStyle(el, run = {}, scale = 1) {
  return { font: run.font || el.font || 'Calibri', size: (run.size || el.size || 18) * scale, bold: run.bold ?? !!el.bold, italic: run.italic ?? !!el.italic, underline: run.underline ?? !!el.underline, strike: !!run.strike, color: run.color || el.color || '#000000', link: run.link || null, sup: run.sup || null };
}
export function numberLabel(n, style) {
  if (style === 'alpha') return String.fromCharCode(97 + ((n - 1) % 26)) + '.';
  if (style === 'roman') { const map = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]; let s = ''; for (const [v, r] of map) while (n >= v) { s += r; n -= v; } return s + '.'; }
  return n + '.';
}

/**
 * Lay out `text` ({ paragraphs }) inside a box of inner width `w` and height `h` (padding already removed).
 * Returns { lines, height, scale } where each line has { y, height, baseline, x, width, runs: [{ text, style, x, width }], bullet }.
 */
export function layoutText(el, text, w, h, measure = defaultMeasure(), opts = {}) {
  let scale = opts.scale || 1;
  const autofit = el.autofit === 'shrink' && h > 0;
  for (let attempt = 0; attempt < 12; attempt++) {
    const res = layoutOnce(el, text, w, measure, scale);
    if (!autofit || res.height <= h || scale <= 0.4) {
      const avail = h - res.height;
      const off = el.valign === 'middle' ? avail / 2 : el.valign === 'bottom' ? avail : 0;
      if (off) for (const l of res.lines) { l.y += off; l.baseline += off; }
      return { ...res, scale };
    }
    scale = Math.max(0.4, scale * Math.max(0.6, Math.sqrt(h / res.height) * 0.97));
  }
  return { lines: [], height: 0, scale };
}

function layoutOnce(el, text, w, measure, scale) {
  const lines = []; let y = 0; const counters = {};
  const paragraphs = text && text.paragraphs && text.paragraphs.length ? text.paragraphs : [{ runs: [] }];
  let prevNumbered = -1;
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const p = paragraphs[pi];
    const level = p.level || 0, align = p.align || el.align || 'left', lh = p.lineHeight || el.lineHeight || 1.2;
    const bullet = p.bullet || null;
    if (!bullet || bullet === true || !/number|alpha|roman/.test(String(bullet))) { if (prevNumbered !== level) counters[level] = 0; prevNumbered = -1; }
    let bulletText = null;
    if (bullet) {
      if (/number|alpha|roman/.test(String(bullet))) { if (prevNumbered !== level) counters[level] = 0; counters[level] = (counters[level] || 0) + 1; for (const k in counters) if (+k > level) counters[k] = 0; bulletText = numberLabel(counters[level], bullet === 'number' ? 'num' : bullet); prevNumbered = level; }
      else bulletText = bullet === true || bullet === '•' ? LIST_PREFIXES[level % LIST_PREFIXES.length] : String(bullet);
    }
    const indent = level * LEVEL_INDENT * scale + (bulletText ? BULLET_INDENT * scale : 0);
    const avail = Math.max(10, w - indent);
    if (p.spaceBefore) y += p.spaceBefore * scale;
    const firstStyle = runStyle(el, p.runs[0] || {}, scale);
    // tokenise
    const tokens = [];
    for (const r of p.runs) { const st = runStyle(el, r, scale); const parts = String(r.text || '').split(/(\s+)/); for (const part of parts) if (part) tokens.push({ text: part, style: st, space: /^\s+$/.test(part), width: measure(part, st) }); }
    const flush = (toks) => {
      // trim trailing whitespace from width
      let end = toks.length; while (end > 0 && toks[end - 1].space) end--;
      const used = toks.slice(0, end); const width = used.reduce((a, t) => a + t.width, 0);
      const maxSize = Math.max(firstStyle.size, ...used.map((t) => t.style.size));
      const height = maxSize * lh;
      const x0 = indent + (align === 'center' ? (avail - width) / 2 : align === 'right' ? avail - width : 0);
      let x = x0; const runs = [];
      for (const t of used) { if (runs.length && runs[runs.length - 1].style === t.style) { runs[runs.length - 1].text += t.text; runs[runs.length - 1].width += t.width; } else runs.push({ text: t.text, style: t.style, x, width: t.width }); x += t.width; }
      const line = { y, height, baseline: y + (height - maxSize) / 2 + maxSize * 0.78, x: x0, width, runs, align, maxSize, paragraph: pi };
      if (bulletText && lines.every((l) => l.paragraph !== pi)) line.bullet = { text: bulletText, x: level * LEVEL_INDENT * scale, style: { ...firstStyle, size: firstStyle.size * (bullet === true || bullet === '•' || bullet === LIST_PREFIXES[0] ? 1 : 1), bold: false, italic: false } };
      lines.push(line); y += height;
    };
    let cur = [], curW = 0;
    for (const t of tokens) {
      if (!t.space && curW + t.width > avail && cur.length && !(cur.every((c) => c.space))) { flush(cur); cur = []; curW = 0; }
      if (!t.space && t.width > avail) { // break long word by characters
        let chunk = '', chunkW = 0;
        for (const ch of t.text) { const cw = measure(ch, t.style); if (chunkW + cw > avail && chunk) { cur.push({ text: chunk, style: t.style, space: false, width: chunkW }); flush(cur); cur = []; curW = 0; chunk = ''; chunkW = 0; } chunk += ch; chunkW += cw; }
        if (chunk) { cur.push({ text: chunk, style: t.style, space: false, width: chunkW }); curW += chunkW; }
        continue;
      }
      if (t.space && !cur.length) continue; // leading whitespace on a wrapped line is dropped
      cur.push(t); curW += t.width;
    }
    flush(cur);
    if (p.spaceAfter) y += p.spaceAfter * scale;
  }
  return { lines, height: y };
}

export function textWidth(el, text, measure = defaultMeasure()) {
  const res = layoutOnce(el, text, 1e6, measure, 1);
  return res.lines.reduce((m, l) => Math.max(m, l.x + l.width), 0);
}
