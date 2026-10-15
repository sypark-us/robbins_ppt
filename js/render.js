// DOM renderer for the editing canvas and the slide show (HTML elements, inline SVG for shapes/charts).
// Also converts an edited contenteditable text box back into the model's paragraphs/runs.
import { escapeHtml, fontStack, parseColor, lighten } from './util.js';
import { pathFor, shapeInset, SHAPES } from './shapes.js';
import { chartSvg } from './charts.js';
import { BULLET_INDENT, LEVEL_INDENT, LIST_PREFIXES, numberLabel } from './textlayout.js';
import { slideBackground, isTextEmpty, placeholderPrompt, makeRun } from './model.js';
import { tableGeometry, cellStyle, fillAttr, fillOpacityAttr, strokeAttrs } from './svg.js';

export function bgStyle(pres, slide) {
  const bg = slideBackground(pres, slide);
  if (bg.type === 'gradient') return `background: linear-gradient(${(bg.angle ?? 90) + 90}deg, ${bg.from}, ${bg.to})`;
  if (bg.type === 'image' && pres.assets[bg.assetId]) return `background: ${bg.color || '#000'} url("${pres.assets[bg.assetId]}") center / ${bg.fit === 'fit' ? 'contain' : bg.fit === 'stretch' ? '100% 100%' : 'cover'} no-repeat`;
  return `background: ${bg.color || '#fff'}`;
}
export const elTransform = (el) => { const t = []; if (el.rotation) t.push(`rotate(${el.rotation}deg)`); if (el.flipH || el.flipV) t.push(`scale(${el.flipH ? -1 : 1}, ${el.flipV ? -1 : 1})`); return t.join(' ') || 'none'; };

const runStyleCss = (el, r) => {
  const s = [];
  if (r.font) s.push(`font-family:${fontStack(r.font)}`); if (r.size) s.push(`font-size:${r.size}px`);
  if (r.bold !== undefined) s.push(`font-weight:${r.bold ? 'bold' : 'normal'}`); if (r.italic !== undefined) s.push(`font-style:${r.italic ? 'italic' : 'normal'}`);
  const deco = []; if (r.underline ?? el.underline) deco.push('underline'); if (r.strike) deco.push('line-through'); if (deco.length || r.underline === false) s.push(`text-decoration:${deco.join(' ') || 'none'}`);
  if (r.color) s.push(`color:${r.color}`);
  if (r.sup) s.push(`vertical-align:${r.sup === 'sup' ? 'super' : 'sub'};font-size:${(r.size || el.size) * 0.65}px`);
  return s.join(';');
};

/** Paragraph HTML (used for both display and editing). */
export function textHtml(el, text, opts = {}) {
  const paras = text && text.paragraphs && text.paragraphs.length ? text.paragraphs : [{ runs: [] }];
  const counters = {}; let prevNumbered = -1;
  let html = '';
  paras.forEach((p, pi) => {
    const level = p.level || 0, bullet = p.bullet || null;
    let label = '';
    if (bullet) {
      if (/number|alpha|roman/.test(String(bullet))) { if (prevNumbered !== level) counters[level] = 0; counters[level] = (counters[level] || 0) + 1; for (const k in counters) if (+k > level) counters[k] = 0; label = numberLabel(counters[level], bullet === 'number' ? 'num' : bullet); prevNumbered = level; }
      else { label = bullet === true || bullet === '•' ? LIST_PREFIXES[level % LIST_PREFIXES.length] : String(bullet); prevNumbered = -1; }
    } else prevNumbered = -1;
    const indent = level * LEVEL_INDENT + (label ? BULLET_INDENT : 0);
    const st = [`padding-left:${indent}px`, label ? `text-indent:-${BULLET_INDENT}px` : '', p.align ? `text-align:${p.align}` : '', p.lineHeight ? `line-height:${p.lineHeight}` : '', p.spaceBefore ? `margin-top:${p.spaceBefore}px` : '', p.spaceAfter ? `margin-bottom:${p.spaceAfter}px` : ''].filter(Boolean).join(';');
    const first = p.runs[0] || {};
    const bulletHtml = label ? `<span class="bullet" contenteditable="false" style="display:inline-block;width:${BULLET_INDENT}px;text-indent:0;${first.size ? `font-size:${first.size}px;` : ''}${first.color ? `color:${first.color};` : ''}">${escapeHtml(label)}</span>` : '';
    const runs = p.runs.map((r) => { const css = runStyleCss(el, r); const t = escapeHtml(r.text).replace(/ {2}/g, ' &nbsp;') || ''; const inner = `<span class="run"${css ? ` style="${css}"` : ''}>${t}</span>`; return r.link && !opts.editing ? `<a href="${escapeHtml(r.link)}" target="_blank" rel="noopener" class="run-link">${inner}</a>` : inner; }).join('');
    html += `<div class="para" data-level="${level}" data-bullet="${bullet ? escapeHtml(String(bullet)) : ''}"${p.align ? ` data-align="${p.align}"` : ''}${st ? ` style="${st}"` : ''}>${bulletHtml}${runs || (opts.editing ? '<br>' : '&nbsp;')}</div>`;
    void pi;
  });
  return html;
}
export function textBoxStyle(el, box) {
  const pad = el.padding ?? 7.2;
  const just = el.valign === 'middle' ? 'center' : el.valign === 'bottom' ? 'flex-end' : 'flex-start';
  return `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;padding:${pad}px;font-family:${fontStack(el.font || 'Calibri')};font-size:${el.size || 18}px;color:${el.color || '#000'};font-weight:${el.bold ? 'bold' : 'normal'};font-style:${el.italic ? 'italic' : 'normal'};text-decoration:${el.underline ? 'underline' : 'none'};text-align:${el.align || 'left'};line-height:${el.lineHeight || 1.2};justify-content:${just}`;
}

function shapeSvg(el, defs) {
  const w = Math.max(el.w, 1), h = Math.max(el.h, 1), open = SHAPES[el.shape] && SHAPES[el.shape].open;
  const fill = open ? 'none' : fillAttr(el.fill, defs, w, h);
  const pad = (el.stroke && el.stroke.width ? el.stroke.width : 0) + 2;
  return `<svg class="shape-svg" viewBox="${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}" style="left:${-pad}px;top:${-pad}px;width:${w + pad * 2}px;height:${h + pad * 2}px" xmlns="http://www.w3.org/2000/svg">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}<path d="${pathFor(el, w, h)}" fill="${fill}"${fillOpacityAttr(el.fill)}${strokeAttrs(el.stroke)} stroke-linejoin="round" vector-effect="none"/></svg>`;
}
function lineSvg(el) {
  const st = el.stroke || { color: '#000', width: 1 }, w = Math.max(el.w, 0), h = Math.max(el.h, 0);
  const x1 = el.flipH ? w : 0, y1 = el.flipV ? h : 0, x2 = w - x1, y2 = h - y1, ang = Math.atan2(y2 - y1, x2 - x1), size = st.width * 3 + 4, pad = size + 4;
  const head = (x, y, a) => { const a1 = a + Math.PI * 0.82, a2 = a - Math.PI * 0.82; return `<path d="M${x} ${y}L${x + Math.cos(a1) * size} ${y + Math.sin(a1) * size}L${x + Math.cos(a2) * size} ${y + Math.sin(a2) * size}Z" fill="${st.color}"/>`; };
  const sx = el.arrowStart ? Math.cos(ang) * size * 0.8 : 0, sy = el.arrowStart ? Math.sin(ang) * size * 0.8 : 0, ex = el.arrowEnd ? Math.cos(ang) * size * 0.8 : 0, ey = el.arrowEnd ? Math.sin(ang) * size * 0.8 : 0;
  return `<svg class="shape-svg" viewBox="${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}" style="left:${-pad}px;top:${-pad}px;width:${w + pad * 2}px;height:${h + pad * 2}px" xmlns="http://www.w3.org/2000/svg"><line class="hit" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="${Math.max(12, st.width + 8)}"/><line x1="${x1 + sx}" y1="${y1 + sy}" x2="${x2 - ex}" y2="${y2 - ey}"${strokeAttrs(st)} stroke-linecap="round"/>${el.arrowEnd ? head(x2, y2, ang) : ''}${el.arrowStart ? head(x1, y1, ang + Math.PI) : ''}</svg>`;
}
export function tableHtml(el) {
  const { xs, ys } = tableGeometry(el), st = el.style || {}, bw = st.borderWidth ?? 1;
  let html = '';
  el.rows.forEach((row, r) => row.forEach((cell, c) => {
    const cs = cellStyle(el, r, c), x = xs[c], y = ys[r], w = xs[c + 1] - x, h = ys[r + 1] - y;
    const text = cell.text && cell.text.paragraphs ? cell.text : { paragraphs: String(cell.text || '').split('\n').map((t) => ({ runs: t ? [makeRun(t)] : [] })) };
    const pseudo = { font: cs.font, size: cs.size, color: cs.color, bold: cs.bold, italic: cs.italic, align: cs.align, valign: cs.valign, lineHeight: 1.2, padding: 5 };
    html += `<div class="cell" data-r="${r}" data-c="${c}" style="${textBoxStyle(pseudo, { x, y, w, h })};background:${cs.fill || 'transparent'};border:${bw}px solid ${st.borderColor || 'transparent'}"><div class="txt-inner">${textHtml(pseudo, text)}</div></div>`;
  }));
  return html;
}

/** Build the HTML for one element (absolute positioned .el). */
export function elementHtml(pres, el, opts = {}) {
  const w = Math.max(el.w, 0), h = Math.max(el.h, 0);
  const cls = ['el', `el-${el.type}`]; if (el.locked) cls.push('locked'); if (el.ph) cls.push('ph'); if (el.shadow) cls.push('shadow');
  if (opts.hiddenAnim && el.anim && el.anim.type && el.anim.type !== 'none') cls.push('anim-hidden');
  if (el.hidden && !opts.editing) return '';
  let inner = '', extra = '';
  const defs = [];
  switch (el.type) {
    case 'text': {
      const empty = isTextEmpty(el.text);
      if (el.fill || el.stroke) inner += `<svg class="shape-svg" viewBox="0 0 ${w} ${h}" style="left:0;top:0;width:${w}px;height:${h}px"><rect width="${w}" height="${h}" fill="${fillAttr(el.fill, defs, w, h)}"${fillOpacityAttr(el.fill)}${strokeAttrs(el.stroke)}/></svg>`;
      if (empty && el.ph && opts.editing) { inner += `<div class="txt prompt" style="${textBoxStyle(el, { x: 0, y: 0, w, h })}"><div class="para" style="color:${lighten(el.color, 0.4)}">${escapeHtml(placeholderPrompt(el.ph))}</div></div>`; cls.push('empty-ph'); }
      else inner += `<div class="txt" style="${textBoxStyle(el, { x: 0, y: 0, w, h })}">${textHtml(el, el.text)}</div>`;
      break;
    }
    case 'shape': {
      inner += shapeSvg(el, defs);
      const box = shapeInset(el.shape, w, h);
      if (!isTextEmpty(el.text) || opts.editing) inner += `<div class="txt" style="${textBoxStyle(el, box)}">${textHtml(el, el.text)}</div>`;
      if (el.ph === 'picture') cls.push('ph-picture');
      break;
    }
    case 'line': inner += lineSvg(el); cls.push('line'); break;
    case 'image': {
      const src = pres.assets[el.assetId];
      const crop = el.crop && (el.crop.l || el.crop.t || el.crop.r || el.crop.b) ? el.crop : null;
      if (!src) inner += `<div class="img-missing">Missing image</div>`;
      else if (crop) { const fw = 100 / (1 - (crop.l || 0) - (crop.r || 0)), fh = 100 / (1 - (crop.t || 0) - (crop.b || 0)); inner += `<div class="img-wrap" style="border-radius:${el.radius || 0}px"><img src="${src}" draggable="false" style="position:absolute;left:${-fw * (crop.l || 0)}%;top:${-fh * (crop.t || 0)}%;width:${fw}%;height:${fh}%"></div>`; }
      else inner += `<img src="${src}" draggable="false" style="width:100%;height:100%;border-radius:${el.radius || 0}px">`;
      if (el.stroke) extra += `border:${el.stroke.width}px ${el.stroke.dash === 'dash' ? 'dashed' : el.stroke.dash === 'dot' ? 'dotted' : 'solid'} ${el.stroke.color};border-radius:${el.radius || 0}px;`;
      break;
    }
    case 'table': inner += tableHtml(el); break;
    case 'chart': inner += `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${chartSvg({ ...el, themeColors: pres.theme.accents }, w, h)}</svg>`; break;
    case 'group': for (const c of el.children) inner += elementHtml(pres, { ...c, x: c.x - el.x, y: c.y - el.y }, opts); cls.push('group'); break;
    default: break;
  }
  const anim = el.anim && el.anim.type && el.anim.type !== 'none' ? ` data-anim="${el.anim.type}" data-anim-dir="${el.anim.dir || 'left'}" data-anim-dur="${el.anim.duration || 0.5}" data-anim-delay="${el.anim.delay || 0}" data-anim-order="${el.anim.order || 0}"` : '';
  const link = el.link && !opts.editing ? ` data-link="${escapeHtml(el.link)}"` : '';
  return `<div class="${cls.join(' ')}" data-id="${el.id}" data-type="${el.type}"${anim}${link} style="left:${el.x}px;top:${el.y}px;width:${w}px;height:${h}px;transform:${elTransform(el)};opacity:${el.opacity ?? 1};${extra}">${inner}</div>`;
}

export function footerHtml(pres, slide, index) {
  const f = pres.footer; if (!f || (!f.text && !f.showNumber && !f.showDate)) return '';
  const c = lighten(pres.theme.text, 0.35);
  const st = `position:absolute;bottom:6px;font:10px ${fontStack(pres.theme.fonts.body)};color:${c};pointer-events:none`;
  return `${f.showDate ? `<div class="footer" style="${st};left:24px">${escapeHtml(f.dateText || new Date().toLocaleDateString())}</div>` : ''}${f.text ? `<div class="footer" style="${st};left:0;right:0;text-align:center">${escapeHtml(f.text)}</div>` : ''}${f.showNumber ? `<div class="footer" style="${st};right:24px">${index + 1}</div>` : ''}`;
}
/** Render a whole slide into `container` (a .slide element sized W×H). */
export function renderSlide(container, pres, slide, opts = {}) {
  container.style.cssText = `width:${pres.width}px;height:${pres.height}px;${bgStyle(pres, slide)}`;
  let html = '';
  for (const el of slide.elements) { if (!opts.editing && el.ph && (el.type === 'text' ? isTextEmpty(el.text) : el.ph === 'picture')) continue; html += elementHtml(pres, el, opts); }
  html += footerHtml(pres, slide, opts.index ?? pres.slides.indexOf(slide));
  container.innerHTML = html;
  return container;
}

// --- contenteditable → model -------------------------------------------------------------------
const cssColor = (c) => { const p = parseColor(c); return p ? '#' + [p.r, p.g, p.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') : null; };
export function parseEditedText(el, txtDiv) {
  const paragraphs = [];
  const blocks = [...txtDiv.childNodes].filter((n) => n.nodeType === 1 && /^(DIV|P)$/.test(n.tagName) || n.nodeType === 3 && n.textContent.trim());
  if (!blocks.length) return { paragraphs: [{ runs: [] }] };
  for (const b of blocks) {
    const p = { runs: [] };
    if (b.nodeType === 1) {
      const lvl = parseInt(b.dataset.level || '0', 10); if (lvl) p.level = lvl;
      const bul = b.dataset.bullet; if (bul) p.bullet = bul === 'true' ? '•' : bul;
      const al = b.dataset.align || (b.style.textAlign && b.style.textAlign !== el.align ? b.style.textAlign : ''); if (al && al !== (el.align || 'left')) p.align = al;
      if (b.style.lineHeight) { const lh = parseFloat(b.style.lineHeight); if (lh && lh !== (el.lineHeight || 1.2)) p.lineHeight = lh; }
    }
    const walk = (node, st) => {
      if (node.nodeType === 3) { const t = node.textContent.replace(/ /g, ' '); if (t) p.runs.push({ text: t, ...st }); return; }
      if (node.nodeType !== 1) return;
      if (node.classList && node.classList.contains('bullet')) return;
      if (node.tagName === 'BR') return;
      const s = { ...st }, tag = node.tagName, cs = node.style;
      if (tag === 'B' || tag === 'STRONG' || cs.fontWeight === 'bold' || +cs.fontWeight >= 600) s.bold = true; else if (cs.fontWeight === 'normal') s.bold = false;
      if (tag === 'I' || tag === 'EM' || cs.fontStyle === 'italic') s.italic = true; else if (cs.fontStyle === 'normal') s.italic = false;
      if (tag === 'U' || /underline/.test(cs.textDecoration || cs.textDecorationLine)) s.underline = true; else if (/none/.test(cs.textDecoration) && !/line-through/.test(cs.textDecoration)) s.underline = false;
      if (tag === 'S' || tag === 'STRIKE' || /line-through/.test(cs.textDecoration || cs.textDecorationLine)) s.strike = true;
      if (tag === 'SUP') s.sup = 'sup'; if (tag === 'SUB') s.sup = 'sub';
      if (cs.color) { const c = cssColor(cs.color); if (c) s.color = c; }
      if (cs.fontSize) { const v = parseFloat(cs.fontSize); if (v) s.size = /pt$/.test(cs.fontSize) ? Math.round(v * 4 / 3) : v; }
      if (cs.fontFamily) s.font = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      if (tag === 'A' && node.getAttribute('href')) s.link = node.getAttribute('href');
      if (tag === 'FONT') { if (node.getAttribute('color')) s.color = cssColor(node.getAttribute('color')) || s.color; if (node.getAttribute('face')) s.font = node.getAttribute('face'); if (node.getAttribute('size')) s.size = [0, 10, 13, 16, 18, 24, 32, 48][+node.getAttribute('size')] || s.size; }
      for (const c of node.childNodes) walk(c, s);
    };
    if (b.nodeType === 3) p.runs.push({ text: b.textContent.replace(/ /g, ' ') });
    else for (const c of b.childNodes) walk(c, {});
    // merge runs with identical style and drop element-default values
    const merged = [];
    for (const r of p.runs) {
      for (const k of ['bold', 'italic', 'underline']) if (r[k] === !!el[k]) delete r[k];
      if (r.color && r.color.toLowerCase() === (el.color || '').toLowerCase()) delete r.color;
      if (r.size === el.size) delete r.size; if (r.font === el.font) delete r.font;
      const last = merged[merged.length - 1];
      if (last && JSON.stringify({ ...last, text: '' }) === JSON.stringify({ ...r, text: '' })) last.text += r.text; else merged.push(r);
    }
    p.runs = merged.filter((r) => r.text !== '');
    paragraphs.push(p);
  }
  return { paragraphs };
}
export { pathFor, shapeInset };
