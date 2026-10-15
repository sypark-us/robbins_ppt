// Render a slide (or one element) to standalone SVG markup. Used by thumbnails, PNG/PDF/HTML export.
import { escapeXml, fontStack, uid, lighten, parseColor } from './util.js';
import { pathFor, shapeInset, SHAPES } from './shapes.js';
import { chartSvg } from './charts.js';
import { layoutText, defaultMeasure } from './textlayout.js';
import { slideBackground, isTextEmpty } from './model.js';

const dashArray = (st) => (st.dash === 'dash' ? `${st.width * 4} ${st.width * 3}` : st.dash === 'dot' ? `${st.width} ${st.width * 2}` : st.dash === 'dashDot' ? `${st.width * 4} ${st.width * 2} ${st.width} ${st.width * 2}` : null);
export const strokeAttrs = (st) => (st && st.width > 0 && st.color ? ` stroke="${st.color}" stroke-width="${st.width}"${dashArray(st) ? ` stroke-dasharray="${dashArray(st)}"` : ''}` : ' stroke="none"');
export const elementTransform = (el) => { const t = [`translate(${el.x} ${el.y})`]; if (el.rotation) t.push(`rotate(${el.rotation} ${el.w / 2} ${el.h / 2})`); if (el.flipH || el.flipV) t.push(`translate(${el.flipH ? el.w : 0} ${el.flipV ? el.h : 0}) scale(${el.flipH ? -1 : 1} ${el.flipV ? -1 : 1})`); return t.join(' '); };

export function fillAttr(fill, defs, w, h) {
  if (!fill || fill.type === 'none') return 'none';
  if (fill.type === 'gradient') {
    const id = 'g' + uid(); const a = ((fill.angle || 0) % 360) * Math.PI / 180;
    const x1 = 50 - Math.cos(a) * 50, y1 = 50 - Math.sin(a) * 50, x2 = 50 + Math.cos(a) * 50, y2 = 50 + Math.sin(a) * 50;
    defs.push(`<linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%"><stop offset="0" stop-color="${fill.from}"/><stop offset="1" stop-color="${fill.to}"/></linearGradient>`);
    return `url(#${id})`;
  }
  return fill.color || 'none';
}
export const fillOpacityAttr = (fill) => { const p = fill && fill.type === 'solid' ? parseColor(fill.color) : null; return fill && fill.opacity != null ? ` fill-opacity="${fill.opacity}"` : p && p.a < 1 ? ` fill-opacity="${p.a}"` : ''; };

/** Lines of laid-out text → <text> elements. */
export function textSvg(el, text, box, measure, opts = {}) {
  if (isTextEmpty(text)) return '';
  const pad = el.padding ?? 7.2;
  const lay = layoutText(el, text, box.w - pad * 2, box.h - pad * 2, measure);
  let out = '';
  for (const l of lay.lines) {
    const y = box.y + pad + l.baseline;
    if (l.bullet) out += `<text x="${box.x + pad + l.bullet.x}" y="${y}" font-family="${fontStack(l.bullet.style.font)}" font-size="${l.bullet.style.size}" fill="${l.bullet.style.color}">${escapeXml(l.bullet.text)}</text>`;
    for (const r of l.runs) {
      const s = r.style; const deco = [s.underline ? 'underline' : '', s.strike ? 'line-through' : ''].filter(Boolean).join(' ');
      const t = `<text x="${box.x + pad + r.x}" y="${y}" xml:space="preserve" font-family="${fontStack(s.font)}" font-size="${s.size}"${s.bold ? ' font-weight="bold"' : ''}${s.italic ? ' font-style="italic"' : ''}${deco ? ` text-decoration="${deco}"` : ''} fill="${s.color}">${escapeXml(r.text)}</text>`;
      out += s.link && !opts.noLinks ? `<a href="${escapeXml(s.link)}" target="_blank">${t}</a>` : t;
    }
  }
  return out;
}

function arrowHead(x, y, angle, size) { const a1 = angle + Math.PI * 0.82, a2 = angle - Math.PI * 0.82; return `M${x} ${y}L${x + Math.cos(a1) * size} ${y + Math.sin(a1) * size}L${x + Math.cos(a2) * size} ${y + Math.sin(a2) * size}Z`; }

export function elementSvg(pres, el, ctx) {
  const { defs, measure, assets } = ctx;
  let inner = '';
  const w = el.w, h = el.h;
  const shadow = el.shadow ? ` filter="url(#${ctx.shadowId()})"` : '';
  switch (el.type) {
    case 'text': {
      if (el.fill || el.stroke) inner += `<rect width="${w}" height="${h}" fill="${fillAttr(el.fill, defs, w, h)}"${fillOpacityAttr(el.fill)}${strokeAttrs(el.stroke)}/>`;
      inner += textSvg(el, el.text, { x: 0, y: 0, w, h }, measure, ctx);
      break;
    }
    case 'shape': {
      const open = SHAPES[el.shape] && SHAPES[el.shape].open;
      inner += `<path d="${pathFor(el, w, h)}" fill="${open ? 'none' : fillAttr(el.fill, defs, w, h)}"${fillOpacityAttr(el.fill)}${strokeAttrs(el.stroke)} stroke-linejoin="round"${shadow}/>`;
      inner += textSvg(el, el.text, shapeInset(el.shape, w, h), measure, ctx);
      break;
    }
    case 'line': {
      const st = el.stroke || { color: '#000', width: 1 }, x1 = el.flipH ? w : 0, y1 = el.flipV ? h : 0, x2 = w - x1, y2 = h - y1;
      const ang = Math.atan2(y2 - y1, x2 - x1), size = st.width * 3 + 4;
      const sx = el.arrowStart ? Math.cos(ang) * size * 0.8 : 0, sy = el.arrowStart ? Math.sin(ang) * size * 0.8 : 0, ex = el.arrowEnd ? Math.cos(ang) * size * 0.8 : 0, ey = el.arrowEnd ? Math.sin(ang) * size * 0.8 : 0;
      inner += `<line x1="${x1 + sx}" y1="${y1 + sy}" x2="${x2 - ex}" y2="${y2 - ey}"${strokeAttrs(st)} stroke-linecap="round"${shadow}/>`;
      if (el.arrowEnd) inner += `<path d="${arrowHead(x2, y2, ang, size)}" fill="${st.color}"/>`;
      if (el.arrowStart) inner += `<path d="${arrowHead(x1, y1, ang + Math.PI, size)}" fill="${st.color}"/>`;
      return wrap(el, inner, { noFlip: true });
    }
    case 'image': {
      const src = assets[el.assetId]; if (!src) { inner += `<rect width="${w}" height="${h}" fill="#ddd"/>`; break; }
      let clip = '';
      if (el.radius) { const id = 'c' + uid(); defs.push(`<clipPath id="${id}"><rect width="${w}" height="${h}" rx="${el.radius}"/></clipPath>`); clip = ` clip-path="url(#${id})"`; }
      const crop = el.crop; // { l, t, r, b } as fractions
      if (crop && (crop.l || crop.t || crop.r || crop.b)) {
        const id = 'c' + uid(); defs.push(`<clipPath id="${id}"><rect width="${w}" height="${h}"${el.radius ? ` rx="${el.radius}"` : ''}/></clipPath>`);
        const fw = w / (1 - (crop.l || 0) - (crop.r || 0)), fh = h / (1 - (crop.t || 0) - (crop.b || 0));
        inner += `<g clip-path="url(#${id})"><image href="${src}" x="${-fw * (crop.l || 0)}" y="${-fh * (crop.t || 0)}" width="${fw}" height="${fh}" preserveAspectRatio="none"${shadow}/></g>`;
      } else inner += `<image href="${src}" width="${w}" height="${h}" preserveAspectRatio="none"${clip}${shadow}/>`;
      if (el.stroke) inner += `<rect width="${w}" height="${h}" fill="none"${strokeAttrs(el.stroke)}${el.radius ? ` rx="${el.radius}"` : ''}/>`;
      break;
    }
    case 'table': inner += tableSvg(el, measure); break;
    case 'chart': inner += chartSvg({ ...el, themeColors: pres.theme.accents }, w, h); break;
    case 'group': { for (const c of el.children) inner += elementSvg(pres, { ...c, x: c.x - el.x, y: c.y - el.y }, ctx); break; }
    default: break;
  }
  return wrap(el, inner);
}
function wrap(el, inner, o = {}) {
  const t = o.noFlip ? [`translate(${el.x} ${el.y})`, el.rotation ? `rotate(${el.rotation} ${el.w / 2} ${el.h / 2})` : ''].filter(Boolean).join(' ') : elementTransform(el);
  return `<g transform="${t}"${el.opacity != null && el.opacity < 1 ? ` opacity="${el.opacity}"` : ''}${el.link ? ` data-link="${escapeXml(el.link)}"` : ''}>${inner}</g>`;
}

export function tableGeometry(el) {
  const cw = el.colWidths.length ? el.colWidths : el.rows[0].map(() => el.w / el.rows[0].length);
  const rh = el.rowHeights.length ? el.rowHeights : el.rows.map(() => el.h / el.rows.length);
  const sw = cw.reduce((a, b) => a + b, 0) || 1, sh = rh.reduce((a, b) => a + b, 0) || 1;
  const xs = [0], ys = [0];
  for (const c of cw) xs.push(xs[xs.length - 1] + (c / sw) * el.w);
  for (const r of rh) ys.push(ys[ys.length - 1] + (r / sh) * el.h);
  return { xs, ys };
}
export function cellStyle(el, r, c) {
  const cell = el.rows[r][c], st = el.style || {};
  const header = el.headerRow && r === 0;
  const fill = cell.fill || (header ? st.headerFill : el.bandRows && (el.headerRow ? r % 2 === 0 : r % 2 === 1) ? st.bandFill : st.fill) || null;
  const color = cell.color || (header ? st.headerColor : el.color) || '#000000';
  return { fill, color, bold: cell.bold || header, italic: !!cell.italic, align: cell.align || 'left', valign: cell.valign || 'middle', size: cell.size || el.size || 14, font: cell.font || el.font || 'Calibri' };
}
export function tableSvg(el, measure) {
  const { xs, ys } = tableGeometry(el); let out = '';
  const st = el.style || {}; const bw = st.borderWidth ?? 1;
  el.rows.forEach((row, r) => row.forEach((cell, c) => {
    const cs = cellStyle(el, r, c), x = xs[c], y = ys[r], w = xs[c + 1] - x, h = ys[r + 1] - y;
    if (cs.fill) out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${cs.fill}"/>`;
    const pseudo = { font: cs.font, size: cs.size, color: cs.color, bold: cs.bold, italic: cs.italic, align: cs.align, valign: cs.valign, lineHeight: 1.2, padding: 5 };
    out += textSvg(pseudo, cell.text && cell.text.paragraphs ? cell.text : { paragraphs: String(cell.text || '').split('\n').map((t) => ({ runs: t ? [{ text: t }] : [] })) }, { x, y, w, h }, measure);
  }));
  if (bw > 0 && st.borderColor) { for (const x of xs) out += `<line x1="${x}" y1="0" x2="${x}" y2="${el.h}" stroke="${st.borderColor}" stroke-width="${bw}"/>`; for (const y of ys) out += `<line x1="0" y1="${y}" x2="${el.w}" y2="${y}" stroke="${st.borderColor}" stroke-width="${bw}"/>`; }
  return out;
}

export function backgroundSvg(pres, slide, defs) {
  const bg = slideBackground(pres, slide), W = pres.width, H = pres.height;
  if (bg.type === 'image' && pres.assets[bg.assetId]) return `<rect width="${W}" height="${H}" fill="${bg.color || '#000'}"/><image href="${pres.assets[bg.assetId]}" width="${W}" height="${H}" preserveAspectRatio="${bg.fit === 'fit' ? 'xMidYMid meet' : bg.fit === 'stretch' ? 'none' : 'xMidYMid slice'}"/>`;
  return `<rect width="${W}" height="${H}" fill="${fillAttr(bg.type === 'image' ? { type: 'solid', color: '#ffffff' } : bg, defs, W, H)}"/>`;
}
export function footerSvg(pres, slide, index) {
  const f = pres.footer; if (!f || (!f.text && !f.showNumber && !f.showDate)) return '';
  const c = lighten(pres.theme.text, 0.35), size = 10, y = pres.height - 14, font = fontStack(pres.theme.fonts.body);
  let out = '';
  if (f.showDate) out += `<text x="24" y="${y}" font-family="${font}" font-size="${size}" fill="${c}">${escapeXml(f.dateText || new Date().toLocaleDateString())}</text>`;
  if (f.text) out += `<text x="${pres.width / 2}" y="${y}" text-anchor="middle" font-family="${font}" font-size="${size}" fill="${c}">${escapeXml(f.text)}</text>`;
  if (f.showNumber) out += `<text x="${pres.width - 24}" y="${y}" text-anchor="end" font-family="${font}" font-size="${size}" fill="${c}">${index + 1}</text>`;
  return out;
}

export function slideToSvg(pres, slide, opts = {}) {
  const defs = [], measure = opts.measure || defaultMeasure();
  let shadowId = null;
  const ctx = { defs, measure, assets: pres.assets, noLinks: opts.noLinks, shadowId: () => { if (!shadowId) { shadowId = 'sh' + uid(); defs.push(`<filter id="${shadowId}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="3" dy="3" stdDeviation="3" flood-opacity="0.35"/></filter>`); } return shadowId; } };
  let body = backgroundSvg(pres, slide, defs);
  for (const el of slide.elements) { if (el.hidden) continue; if (el.ph && (el.type === 'text' ? isTextEmpty(el.text) : el.ph === 'picture')) continue; body += elementSvg(pres, el, ctx); }
  body += footerSvg(pres, slide, opts.index ?? pres.slides.indexOf(slide));
  const W = pres.width, H = pres.height;
  const size = opts.width ? ` width="${opts.width}" height="${(opts.width * H) / W}"` : ` width="${W}" height="${H}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}"${size}>${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${body}</svg>`;
}
