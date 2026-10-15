// Presentation document model: slides, elements, layouts, themes, history. Pure data, no DOM.
// Units are points (1 pt = 12700 EMU); a 16:9 slide is 960 × 540.
import { uid, clone, boundsOf, unionBounds, mixColor, contrastText } from './util.js';

export const SLIDE_SIZES = { '16:9': [960, 540], '4:3': [720, 540], '16:10': [864, 540], A4: [841.9, 595.3], Letter: [792, 612] };

// --- themes -------------------------------------------------------------------------------------
export const THEMES = [
  { name: 'Classic', bg: { type: 'solid', color: '#FFFFFF' }, text: '#000000', heading: '#000000', accents: ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'], fonts: { heading: 'Calibri', body: 'Calibri' } },
  { name: 'Midnight', bg: { type: 'solid', color: '#0F172A' }, text: '#E2E8F0', heading: '#F8FAFC', accents: ['#38BDF8', '#A78BFA', '#F472B6', '#FBBF24', '#34D399', '#FB7185'], fonts: { heading: 'Segoe UI', body: 'Segoe UI' } },
  { name: 'Ocean', bg: { type: 'gradient', from: '#0B3D91', to: '#1E88E5', angle: 135 }, text: '#FFFFFF', heading: '#FFFFFF', accents: ['#FFD166', '#06D6A0', '#EF476F', '#FFFFFF', '#8ECAE6', '#FB8500'], fonts: { heading: 'Trebuchet MS', body: 'Trebuchet MS' } },
  { name: 'Forest', bg: { type: 'solid', color: '#F4F7F2' }, text: '#1F2A1F', heading: '#1B4332', accents: ['#2D6A4F', '#40916C', '#74C69D', '#D8A657', '#B5838D', '#52796F'], fonts: { heading: 'Georgia', body: 'Verdana' } },
  { name: 'Sunset', bg: { type: 'gradient', from: '#FF7E5F', to: '#FEB47B', angle: 160 }, text: '#2B1B17', heading: '#3B0D0C', accents: ['#7A1E1E', '#FFD166', '#2A9D8F', '#264653', '#E76F51', '#8D99AE'], fonts: { heading: 'Georgia', body: 'Calibri' } },
  { name: 'Minimal', bg: { type: 'solid', color: '#FAFAFA' }, text: '#222222', heading: '#111111', accents: ['#111111', '#777777', '#BBBBBB', '#D64545', '#3A7BD5', '#2EA66B'], fonts: { heading: 'Helvetica', body: 'Helvetica' } },
  { name: 'Slate', bg: { type: 'solid', color: '#2F3640' }, text: '#DCDDE1', heading: '#F5F6FA', accents: ['#00A8FF', '#9C88FF', '#FBC531', '#4CD137', '#E84118', '#487EB0'], fonts: { heading: 'Segoe UI', body: 'Segoe UI' } },
  { name: 'Candy', bg: { type: 'solid', color: '#FFF5F7' }, text: '#4A2040', heading: '#C2185B', accents: ['#EC407A', '#AB47BC', '#42A5F5', '#26C6DA', '#FFCA28', '#66BB6A'], fonts: { heading: 'Comic Sans MS', body: 'Trebuchet MS' } },
  { name: 'Corporate', bg: { type: 'solid', color: '#FFFFFF' }, text: '#1F2937', heading: '#0B2545', accents: ['#0B2545', '#13315C', '#8DA9C4', '#EEF4ED', '#F2A541', '#C8553D'], fonts: { heading: 'Cambria', body: 'Calibri' } },
  { name: 'Paper', bg: { type: 'solid', color: '#FBF7EF' }, text: '#3B3024', heading: '#5C4B37', accents: ['#A0522D', '#C19A6B', '#6B8E23', '#4682B4', '#B22222', '#8B7D6B'], fonts: { heading: 'Palatino Linotype', body: 'Book Antiqua' } },
];
export const themeByName = (n) => THEMES.find((t) => t.name === n) || THEMES[0];

// --- text helpers --------------------------------------------------------------------------------
export const makeRun = (text = '', props = {}) => ({ text, ...props });
export const makeParagraph = (runs = [], props = {}) => ({ runs, ...props });
export function textFromString(str = '', para = {}) {
  const lines = String(str).split(/\r?\n/);
  return { paragraphs: lines.map((l) => makeParagraph(l ? [makeRun(l)] : [], { ...para })) };
}
export function textFromLines(lines, para = {}) { return { paragraphs: lines.map((l) => makeParagraph(l ? [makeRun(l)] : [], { ...para })) }; }
export const textToString = (t) => (t && t.paragraphs ? t.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n') : '');
export const isTextEmpty = (t) => !t || !t.paragraphs || t.paragraphs.every((p) => !p.runs.some((r) => r.text));

// --- element factories ---------------------------------------------------------------------------
const base = (type, x, y, w, h) => ({ id: uid(), type, x, y, w, h, rotation: 0, opacity: 1, flipH: false, flipV: false, locked: false, anim: null });
export function makeText(x, y, w, h, opts = {}) {
  const el = { ...base('text', x, y, w, h), text: opts.text && opts.text.paragraphs ? opts.text : textFromString(opts.text || ''), font: 'Calibri', size: 18, color: '#000000', bold: false, italic: false, underline: false, align: 'left', valign: 'top', lineHeight: 1.2, padding: 7.2, fill: null, stroke: null, ph: null, autofit: 'none' };
  delete opts.text;
  return Object.assign(el, opts);
}
export function makeShape(shape, x, y, w, h, opts = {}) {
  const el = { ...base('shape', x, y, w, h), shape, fill: { type: 'solid', color: '#4472C4' }, stroke: { color: '#2F528F', width: 1, dash: 'solid' }, shadow: false, text: textFromString(''), font: 'Calibri', size: 18, color: '#FFFFFF', bold: false, italic: false, underline: false, align: 'center', valign: 'middle', lineHeight: 1.2, padding: 7.2 };
  if (opts.text && !opts.text.paragraphs) opts.text = textFromString(opts.text);
  return Object.assign(el, opts);
}
export function makeLine(x, y, w, h, opts = {}) {
  return Object.assign({ ...base('line', x, y, w, h), stroke: { color: '#2F528F', width: 2, dash: 'solid' }, arrowStart: false, arrowEnd: false }, opts);
}
export function makeImage(assetId, x, y, w, h, opts = {}) {
  return Object.assign({ ...base('image', x, y, w, h), assetId, naturalW: w, naturalH: h, stroke: null, shadow: false, radius: 0 }, opts);
}
export function makeTable(x, y, w, h, rows = 3, cols = 3, opts = {}) {
  const el = { ...base('table', x, y, w, h), rows: [], colWidths: Array.from({ length: cols }, () => w / cols), rowHeights: Array.from({ length: rows }, () => h / rows), font: 'Calibri', size: 14, color: '#000000', headerRow: true, bandRows: true, style: { headerFill: '#4472C4', headerColor: '#FFFFFF', bandFill: '#D9E2F3', fill: '#FFFFFF', borderColor: '#FFFFFF', borderWidth: 1 } };
  for (let r = 0; r < rows; r++) el.rows.push(Array.from({ length: cols }, () => makeCell('')));
  return Object.assign(el, opts);
}
export const makeCell = (text = '', props = {}) => ({ text, bold: false, italic: false, align: 'left', valign: 'middle', fill: null, color: null, ...props });
export function makeChart(x, y, w, h, opts = {}) {
  return Object.assign({ ...base('chart', x, y, w, h), chartType: 'column', title: 'Chart Title', categories: ['Category 1', 'Category 2', 'Category 3', 'Category 4'], series: [{ name: 'Series 1', values: [4.3, 2.5, 3.5, 4.5] }, { name: 'Series 2', values: [2.4, 4.4, 1.8, 2.8] }], colors: [], legend: true, labels: false, gridlines: true, font: 'Calibri', size: 12, color: '#404040', fill: null, stroke: null }, opts);
}
export function makeGroup(children) {
  const b = unionBounds(children.map(boundsOf));
  return { ...base('group', b.x, b.y, b.w, b.h), children };
}

// --- slides & layouts -----------------------------------------------------------------------------
export const LAYOUTS = [
  { id: 'title', name: 'Title Slide' }, { id: 'titleContent', name: 'Title and Content' }, { id: 'sectionHeader', name: 'Section Header' },
  { id: 'twoContent', name: 'Two Content' }, { id: 'comparison', name: 'Comparison' }, { id: 'titleOnly', name: 'Title Only' }, { id: 'blank', name: 'Blank' },
  { id: 'contentCaption', name: 'Content with Caption' }, { id: 'pictureCaption', name: 'Picture with Caption' },
];

export function placeholderStyle(ph, theme) {
  const t = theme || THEMES[0];
  const s = { font: t.fonts.body, color: t.text, align: 'left', valign: 'top', bold: false, size: 20 };
  if (ph === 'title') Object.assign(s, { font: t.fonts.heading, color: t.heading, size: 40, valign: 'middle' });
  if (ph === 'ctitle') Object.assign(s, { font: t.fonts.heading, color: t.heading, size: 54, align: 'center', valign: 'bottom' });
  if (ph === 'subtitle') Object.assign(s, { size: 24, align: 'center', color: mixColor(t.text, t.bg.type === 'solid' ? t.bg.color : t.bg.from, 0.25) });
  if (ph === 'section') Object.assign(s, { font: t.fonts.heading, color: t.heading, size: 48, valign: 'bottom', bold: true });
  if (ph === 'caption') Object.assign(s, { size: 14 });
  if (ph === 'heading') Object.assign(s, { bold: true, size: 22, valign: 'bottom', font: t.fonts.heading, color: t.heading });
  return s;
}
const PROMPTS = { title: 'Click to add title', ctitle: 'Click to add title', subtitle: 'Click to add subtitle', body: 'Click to add text', section: 'Section title', caption: 'Click to add caption', heading: 'Heading' };
export const placeholderPrompt = (ph) => PROMPTS[ph] || 'Click to add text';

function ph(kind, x, y, w, h, theme, extra = {}) {
  const st = placeholderStyle(kind, theme);
  const bullet = kind === 'body' ? '•' : false;
  return makeText(x, y, w, h, { ph: kind, ...st, text: { paragraphs: [makeParagraph([], bullet ? { bullet } : {})] }, ...extra });
}
export function layoutElements(layout, pres) {
  const W = pres.width, H = pres.height, t = pres.theme, m = W * 0.05, cw = W - 2 * m;
  switch (layout) {
    case 'title': return [ph('ctitle', m * 1.4, H * 0.24, W - m * 2.8, H * 0.3, t), ph('subtitle', m * 2, H * 0.57, W - m * 4, H * 0.18, t)];
    case 'titleContent': return [ph('title', m, H * 0.05, cw, H * 0.17, t), ph('body', m, H * 0.25, cw, H * 0.66, t)];
    case 'sectionHeader': return [ph('section', m, H * 0.3, cw, H * 0.3, t), ph('subtitle', m, H * 0.62, cw, H * 0.16, t, { align: 'left', valign: 'top' })];
    case 'twoContent': return [ph('title', m, H * 0.05, cw, H * 0.17, t), ph('body', m, H * 0.25, cw / 2 - m / 2, H * 0.66, t), ph('body', m + cw / 2 + m / 2, H * 0.25, cw / 2 - m / 2, H * 0.66, t)];
    case 'comparison': return [ph('title', m, H * 0.05, cw, H * 0.17, t), ph('heading', m, H * 0.24, cw / 2 - m / 2, H * 0.1, t), ph('heading', m + cw / 2 + m / 2, H * 0.24, cw / 2 - m / 2, H * 0.1, t), ph('body', m, H * 0.35, cw / 2 - m / 2, H * 0.56, t), ph('body', m + cw / 2 + m / 2, H * 0.35, cw / 2 - m / 2, H * 0.56, t)];
    case 'titleOnly': return [ph('title', m, H * 0.05, cw, H * 0.17, t)];
    case 'contentCaption': return [ph('title', m, H * 0.08, cw * 0.32, H * 0.25, t, { size: 28, valign: 'bottom' }), ph('caption', m, H * 0.36, cw * 0.32, H * 0.5, t), ph('body', m + cw * 0.36, H * 0.08, cw * 0.64, H * 0.8, t)];
    case 'pictureCaption': return [ph('title', m, H * 0.08, cw * 0.32, H * 0.25, t, { size: 28, valign: 'bottom' }), ph('caption', m, H * 0.36, cw * 0.32, H * 0.5, t), makeShape('rect', m + cw * 0.36, H * 0.08, cw * 0.64, H * 0.8, { ph: 'picture', fill: { type: 'solid', color: mixColor(t.text, t.bg.type === 'solid' ? t.bg.color : t.bg.from, 0.9) }, stroke: { color: mixColor(t.text, t.bg.type === 'solid' ? t.bg.color : t.bg.from, 0.6), width: 1, dash: 'dash' }, text: textFromString('Picture placeholder'), color: t.text, size: 16 })];
    default: return [];
  }
}
export function makeSlide(pres, layout = 'titleContent') {
  return { id: uid('s'), layout, background: null, elements: layoutElements(layout, pres), notes: '', transition: { type: 'none', dir: 'left', duration: 0.7 }, advance: null, hidden: false };
}
/** Re-apply a layout: keeps text of placeholders that exist in both, keeps non-placeholder elements. */
export function applyLayout(pres, slide, layout) {
  const fresh = layoutElements(layout, pres);
  const old = slide.elements.filter((e) => e.ph && e.ph !== 'picture');
  const usedOld = new Set();
  for (const f of fresh) {
    if (!f.ph || f.ph === 'picture') continue;
    const kind = f.ph === 'ctitle' || f.ph === 'section' ? 'title' : f.ph;
    const match = old.find((o, i) => !usedOld.has(i) && ((o.ph === 'ctitle' || o.ph === 'section' ? 'title' : o.ph) === kind));
    if (match) { usedOld.add(old.indexOf(match)); f.text = clone(match.text); f.id = match.id; }
  }
  const keep = slide.elements.filter((e) => !e.ph || (e.ph !== 'picture' && !isTextEmpty(e.text) && !usedOld.has(old.indexOf(e))));
  slide.layout = layout;
  slide.elements = [...fresh, ...keep.filter((e) => !fresh.some((f) => f.id === e.id))];
}

export function newPresentation(opts = {}) {
  const [width, height] = SLIDE_SIZES[opts.size || '16:9'] || SLIDE_SIZES['16:9'];
  const pres = { app: 'robbinsppt', version: 1, title: opts.title || 'Untitled presentation', width, height, theme: clone(opts.theme || THEMES[0]), footer: { text: '', showNumber: false, showDate: false }, slides: [], assets: {} };
  pres.slides.push(makeSlide(pres, 'title'));
  return pres;
}

export function applyTheme(pres, theme) {
  const oldT = pres.theme, t = clone(theme);
  const swap = (c) => { if (!c) return c; const i = oldT.accents.findIndex((a) => a.toLowerCase() === String(c).toLowerCase()); if (i >= 0) return t.accents[i]; if (c.toLowerCase() === oldT.text.toLowerCase()) return t.text; if (c.toLowerCase() === oldT.heading.toLowerCase()) return t.heading; return c; };
  const swapFont = (f) => (f === oldT.fonts.heading ? t.fonts.heading : f === oldT.fonts.body ? t.fonts.body : f);
  pres.theme = t;
  for (const s of pres.slides) {
    forEachElement(s, (e) => {
      if (e.ph && e.ph !== 'picture') { const st = placeholderStyle(e.ph, t); e.font = st.font; e.color = st.color; for (const p of e.text.paragraphs) for (const r of p.runs) { if (r.color) r.color = swap(r.color); if (r.font) r.font = swapFont(r.font); } }
      else { if (e.font) e.font = swapFont(e.font); if (e.color) e.color = swap(e.color); if (e.text) for (const p of e.text.paragraphs) for (const r of p.runs) { if (r.color) r.color = swap(r.color); } }
      if (e.fill && e.fill.type === 'solid') e.fill.color = swap(e.fill.color);
      if (e.fill && e.fill.type === 'gradient') { e.fill.from = swap(e.fill.from); e.fill.to = swap(e.fill.to); }
      if (e.stroke) e.stroke.color = swap(e.stroke.color);
      if (e.type === 'table' && e.style) { e.style.headerFill = swap(e.style.headerFill); e.style.bandFill = swap(e.style.bandFill); }
      if (e.type === 'chart') { e.color = t.text; e.font = t.fonts.body; }
    });
  }
}
export const slideBackground = (pres, slide) => slide.background || pres.theme.bg;
export const slideBgColor = (pres, slide) => { const b = slideBackground(pres, slide); return b.type === 'solid' ? b.color : b.type === 'gradient' ? mixColor(b.from, b.to, 0.5) : '#FFFFFF'; };

// --- element traversal ---------------------------------------------------------------------------
export function forEachElement(slide, fn) { const walk = (list, parent) => { for (const e of list) { fn(e, parent); if (e.type === 'group') walk(e.children, e); } }; walk(slide.elements, null); }
export function findElement(slide, id) { let found = null; forEachElement(slide, (e) => { if (e.id === id) found = e; }); return found; }
export function flattenElements(slide) { const out = []; forEachElement(slide, (e) => out.push(e)); return out; }
export function moveElement(el, dx, dy) { el.x += dx; el.y += dy; if (el.type === 'group') for (const c of el.children) moveElement(c, dx, dy); }
export function resizeElement(el, x, y, w, h) {
  if (el.type === 'group') {
    const sx = el.w ? w / el.w : 1, sy = el.h ? h / el.h : 1;
    for (const c of el.children) resizeElement(c, x + (c.x - el.x) * sx, y + (c.y - el.y) * sy, c.w * sx, c.h * sy);
  }
  if (el.type === 'table' && el.w && el.h) { const sx = w / el.w, sy = h / el.h; el.colWidths = el.colWidths.map((v) => v * sx); el.rowHeights = el.rowHeights.map((v) => v * sy); }
  el.x = x; el.y = y; el.w = w; el.h = h;
}
export function duplicateElement(el, dx = 20, dy = 20) {
  const c = clone(el); const reid = (e) => { e.id = uid(); if (e.children) e.children.forEach(reid); }; reid(c); moveElement(c, dx, dy); return c;
}
export function ungroup(slide, group) {
  const i = slide.elements.indexOf(group); if (i < 0) return [];
  slide.elements.splice(i, 1, ...group.children); return group.children;
}
export function groupElements(slide, els) {
  const set = new Set(els.map((e) => e.id)); const members = slide.elements.filter((e) => set.has(e.id));
  if (members.length < 2) return null;
  const g = makeGroup(members); const idx = slide.elements.indexOf(members[0]);
  slide.elements = slide.elements.filter((e) => !set.has(e.id)); slide.elements.splice(Math.min(idx, slide.elements.length), 0, g); return g;
}

// --- outline import ---------------------------------------------------------------------------------
/** "# Title\n- bullet" markdown-ish text → slides. Lines starting with # start a new slide; other lines become bullets. */
export function slidesFromOutline(pres, text) {
  const slides = []; let cur = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, ''); if (!line.trim()) continue;
    const h = /^#{1,2}\s*(.*)$/.exec(line);
    if (h || !cur) { cur = makeSlide(pres, 'titleContent'); cur.elements[0].text = textFromString(h ? h[1] : line); cur.elements[1].text.paragraphs = []; slides.push(cur); if (h) continue; }
    const m = /^(\s*)(?:[-*•]|\d+[.)])?\s*(.*)$/.exec(line); const level = Math.min(4, Math.floor((m[1].length) / 2));
    cur.elements[1].text.paragraphs.push(makeParagraph([makeRun(m[2])], { bullet: '•', level }));
  }
  for (const s of slides) if (!s.elements[1].text.paragraphs.length) s.elements[1].text.paragraphs.push(makeParagraph([], { bullet: '•' }));
  return slides;
}

// --- normalisation (loading older / foreign JSON) --------------------------------------------------
export function normalize(pres) {
  pres.app = 'robbinsppt'; pres.version = 1; pres.title ||= 'Untitled presentation'; pres.width ||= 960; pres.height ||= 540;
  pres.theme = pres.theme && pres.theme.accents ? pres.theme : clone(THEMES[0]);
  pres.footer ||= { text: '', showNumber: false, showDate: false }; pres.assets ||= {}; pres.slides ||= [];
  if (!pres.slides.length) pres.slides.push(makeSlide(pres, 'title'));
  for (const s of pres.slides) {
    s.id ||= uid('s'); s.layout ||= 'blank'; s.elements ||= []; s.notes ||= ''; s.transition ||= { type: 'none', dir: 'left', duration: 0.7 }; s.hidden = !!s.hidden; s.advance ??= null;
    forEachElement(s, (e) => {
      e.id ||= uid(); e.rotation ||= 0; e.opacity ??= 1; e.flipH = !!e.flipH; e.flipV = !!e.flipV; e.locked = !!e.locked; e.anim ??= null;
      if ((e.type === 'text' || e.type === 'shape') && (!e.text || !e.text.paragraphs)) e.text = textFromString(typeof e.text === 'string' ? e.text : '');
      if (e.type === 'text' || e.type === 'shape') { e.font ||= pres.theme.fonts.body; e.size ||= 18; e.color ||= '#000000'; e.align ||= 'left'; e.valign ||= 'top'; e.lineHeight ||= 1.2; e.padding ??= 7.2; }
      if (e.type === 'table') { e.rows ||= []; e.colWidths ||= []; e.rowHeights ||= []; e.style ||= makeTable(0, 0, 1, 1).style; }
      if (e.type === 'chart') { e.series ||= []; e.categories ||= []; e.colors ||= []; }
      if (e.type === 'group') e.children ||= [];
    });
  }
  return pres;
}
export const serialize = (pres) => JSON.stringify(pres);
export const deserialize = (json) => normalize(typeof json === 'string' ? JSON.parse(json) : clone(json));

// --- history ---------------------------------------------------------------------------------------
export class History {
  constructor(limit = 100) { this.limit = limit; this.stack = []; this.index = -1; }
  reset(pres) { this.stack = [serialize(pres)]; this.index = 0; }
  commit(pres) { const s = serialize(pres); if (this.stack[this.index] === s) return false; this.stack.length = this.index + 1; this.stack.push(s); if (this.stack.length > this.limit) this.stack.shift(); this.index = this.stack.length - 1; return true; }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.stack.length - 1; }
  undo() { if (!this.canUndo) return null; this.index--; return deserialize(this.stack[this.index]); }
  redo() { if (!this.canRedo) return null; this.index++; return deserialize(this.stack[this.index]); }
}

// --- demo content --------------------------------------------------------------------------------------
export function demoPresentation() {
  const pres = newPresentation({ title: 'RobbinsPPT demo', theme: THEMES[2] });
  const t = pres.theme;
  const s1 = pres.slides[0];
  s1.elements[0].text = textFromString('RobbinsPPT'); s1.elements[1].text = textFromString('A presentation editor that runs in your browser');
  s1.transition = { type: 'fade', dir: 'left', duration: 0.8 };
  const s2 = makeSlide(pres, 'titleContent');
  s2.elements[0].text = textFromString('What you can do');
  s2.elements[1].text = textFromLines(['Write slides with rich text, bullets and layouts', 'Draw shapes, lines, tables, charts and pictures', 'Pick a theme, transitions and animations', 'Present full screen with speaker notes', 'Save as PowerPoint (.pptx), PDF, images or HTML'], { bullet: '•' });
  s2.elements[1].anim = { type: 'fly', dir: 'left', duration: 0.5, delay: 0, order: 1 };
  s2.notes = 'Mention that everything stays on the local machine.';
  s2.transition = { type: 'push', dir: 'left', duration: 0.6 };
  const s3 = makeSlide(pres, 'titleOnly');
  s3.elements[0].text = textFromString('Shapes and a chart');
  s3.elements.push(makeShape('roundRect', 60, 140, 200, 110, { text: 'Rounded', fill: { type: 'solid', color: t.accents[0] }, color: '#1b2a4a', stroke: null, shadow: true }));
  s3.elements.push(makeShape('ellipse', 290, 140, 160, 110, { text: 'Ellipse', fill: { type: 'gradient', from: t.accents[1], to: t.accents[2], angle: 45 }, stroke: null }));
  s3.elements.push(makeShape('star5', 480, 130, 130, 130, { fill: { type: 'solid', color: t.accents[3] }, stroke: { color: '#ffffff', width: 2, dash: 'solid' } }));
  s3.elements.push(makeLine(60, 290, 400, 0, { arrowEnd: true, stroke: { color: '#ffffff', width: 3, dash: 'dash' } }));
  s3.elements.push(makeChart(500, 280, 420, 230, { title: 'Quarterly revenue', chartType: 'column', categories: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: '2025', values: [12, 19, 14, 22] }, { name: '2026', values: [15, 21, 18, 27] }], color: '#ffffff' }));
  s3.elements.push(makeTable(60, 330, 400, 150, 3, 3, { color: '#102040' }));
  const tbl = s3.elements[s3.elements.length - 1];
  [['Region', 'Units', 'Growth'], ['North', '1,240', '+8%'], ['South', '980', '+3%']].forEach((r, i) => r.forEach((v, j) => { tbl.rows[i][j].text = v; }));
  s3.transition = { type: 'zoom', dir: 'left', duration: 0.6 };
  const s4 = makeSlide(pres, 'sectionHeader');
  s4.elements[0].text = textFromString('Thank you'); s4.elements[1].text = textFromString('Press F5 to start the slide show');
  pres.slides.push(s2, s3, s4);
  return pres;
}

export { contrastText };
