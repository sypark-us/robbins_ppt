// Chart rendering to SVG markup (inner content for a w×h viewport). Used by the editor, exports and thumbnails.
import { escapeXml, lighten } from './util.js';
import { fontStack } from './util.js';

export const CHART_TYPES = [['column', 'Column'], ['bar', 'Bar'], ['line', 'Line'], ['area', 'Area'], ['pie', 'Pie'], ['doughnut', 'Doughnut'], ['scatter', 'Scatter']];
const DEFAULT_COLORS = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#264478', '#9E480E'];
export const seriesColor = (el, i) => (el.colors && el.colors[i]) || (el.themeColors && el.themeColors[i % el.themeColors.length]) || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
const estWidth = (s, size) => String(s).length * size * 0.55;
const fmt = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

function niceScale(min, max, ticks = 5) {
  if (min > 0) min = 0; if (max < 0) max = 0; if (min === max) max = min + 1;
  const range = max - min, rough = range / ticks, p = 10 ** Math.floor(Math.log10(rough)), f = rough / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
}

export function chartSvg(el, w, h) {
  const font = fontStack(el.font || 'Calibri'), size = el.size || 12, color = el.color || '#404040';
  const text = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-family="${font}" font-size="${o.size || size}" fill="${o.color || color}" text-anchor="${o.anchor || 'start'}" dominant-baseline="${o.baseline || 'middle'}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.transform ? ` transform="${o.transform}"` : ''}>${escapeXml(s)}</text>`;
  const series = (el.series || []).filter((s) => s && s.values);
  const cats = el.categories || [];
  const n = Math.max(cats.length, ...series.map((s) => s.values.length), 0);
  let out = '';
  if (el.fill && el.fill.color) out += `<rect width="${w}" height="${h}" fill="${el.fill.color}"/>`;
  let top = 6, bottom = h - 6, left = 6, right = w - 6;
  if (el.title) { out += text(w / 2, top + size * 0.9, el.title, { anchor: 'middle', size: size * 1.3, weight: 'bold' }); top += size * 2.2; }
  const showLegend = el.legend !== false && series.length > 0 && (series.length > 1 || /pie|doughnut/.test(el.chartType));
  const isPie = /pie|doughnut/.test(el.chartType);
  if (showLegend) {
    const items = isPie ? cats.slice(0, n).map((c, i) => ({ label: c, color: seriesColor(el, i) })) : series.map((s, i) => ({ label: s.name || `Series ${i + 1}`, color: seriesColor(el, i) }));
    const lw = items.reduce((m, it) => Math.max(m, estWidth(it.label, size)), 0) + size * 1.6;
    const vertical = isPie || lw * items.length + 10 > w;
    if (vertical) { right -= lw + 4; let y = top + size; for (const it of items) { out += `<rect x="${right + 6}" y="${y - size * 0.45}" width="${size * 0.9}" height="${size * 0.9}" fill="${it.color}"/>` + text(right + 6 + size * 1.3, y, it.label); y += size * 1.5; } }
    else { let x = w / 2 - (lw * items.length) / 2; const y = bottom - size * 0.6; for (const it of items) { out += `<rect x="${x}" y="${y - size * 0.45}" width="${size * 0.9}" height="${size * 0.9}" fill="${it.color}"/>` + text(x + size * 1.3, y, it.label); x += lw; } bottom -= size * 1.8; }
  }
  if (!series.length || !n) { out += text(w / 2, h / 2, 'No data', { anchor: 'middle', color: '#999' }); return out; }

  if (isPie) {
    const vals = series[0].values.slice(0, n).map((v) => Math.max(0, +v || 0)), total = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = (left + right) / 2, cy = (top + bottom) / 2, r = Math.max(4, Math.min(right - left, bottom - top) / 2 - size), ir = el.chartType === 'doughnut' ? r * 0.55 : 0;
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a1 = a0 + (v / total) * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a, rr) => `${cx + Math.cos(a) * rr} ${cy + Math.sin(a) * rr}`;
      if (v > 0) {
        const d = ir ? `M${p(a0, r)}A${r} ${r} 0 ${large} 1 ${p(a1, r)}L${p(a1, ir)}A${ir} ${ir} 0 ${large} 0 ${p(a0, ir)}Z` : `M${cx} ${cy}L${p(a0, r)}A${r} ${r} 0 ${large} 1 ${p(a1, r)}Z`;
        out += `<path d="${v / total > 0.9999 ? `M${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}Z` : d}" fill="${seriesColor(el, i)}" stroke="#fff" stroke-width="1"/>`;
        if (el.labels) { const am = (a0 + a1) / 2, rr = ir ? (r + ir) / 2 : r * 0.65; out += text(cx + Math.cos(am) * rr, cy + Math.sin(am) * rr, `${Math.round((v / total) * 100)}%`, { anchor: 'middle', color: '#fff', weight: 'bold' }); }
      }
      a0 = a1;
    });
    return out;
  }

  // cartesian charts
  const horizontal = el.chartType === 'bar';
  const all = series.flatMap((s) => s.values.slice(0, n).map((v) => +v || 0));
  const sc = niceScale(Math.min(0, ...all), Math.max(0, ...all));
  const ticks = []; for (let v = sc.min; v <= sc.max + sc.step / 1e6; v += sc.step) ticks.push(Math.round(v * 1e9) / 1e9);
  const tickW = Math.max(...ticks.map((t) => estWidth(fmt(t), size)));
  const catLabelW = Math.max(...cats.map((c) => estWidth(c, size)), 0);
  const plotL = left + (horizontal ? catLabelW : tickW) + 8, plotR = right - 6, plotT = top + 4, plotB = bottom - size * 1.6;
  const pw = Math.max(1, plotR - plotL), ph = Math.max(1, plotB - plotT);
  const vy = (v) => plotB - ((v - sc.min) / (sc.max - sc.min)) * ph, vx = (v) => plotL + ((v - sc.min) / (sc.max - sc.min)) * pw;
  // gridlines & value axis
  for (const t of ticks) {
    if (horizontal) { const x = vx(t); if (el.gridlines !== false) out += `<line x1="${x}" y1="${plotT}" x2="${x}" y2="${plotB}" stroke="${lighten(color, 0.75)}"/>`; out += text(x, plotB + size * 0.8, fmt(t), { anchor: 'middle' }); }
    else { const y = vy(t); if (el.gridlines !== false) out += `<line x1="${plotL}" y1="${y}" x2="${plotR}" y2="${y}" stroke="${lighten(color, 0.75)}"/>`; out += text(plotL - 5, y, fmt(t), { anchor: 'end' }); }
  }
  const scatter = el.chartType === 'scatter';
  if (scatter) {
    // first series = x values, others = y values; or categories numeric
    const xs = cats.map((c) => +c); const useCatsX = xs.every((v) => Number.isFinite(v)) && cats.length;
    const xvals = useCatsX ? xs : series[0].values.map((v) => +v || 0);
    const ys = useCatsX ? series : series.slice(1);
    const xsc = niceScale(Math.min(0, ...xvals), Math.max(0, ...xvals));
    const sx = (v) => plotL + ((v - xsc.min) / (xsc.max - xsc.min)) * pw;
    for (let v = xsc.min; v <= xsc.max + 1e-9; v += xsc.step) out += text(sx(v), plotB + size * 0.8, fmt(v), { anchor: 'middle' });
    ys.forEach((s, si) => { s.values.forEach((v, i) => { if (xvals[i] !== undefined) out += `<circle cx="${sx(xvals[i])}" cy="${vy(+v || 0)}" r="${size * 0.35}" fill="${seriesColor(el, si)}"/>`; }); });
    out += `<line x1="${plotL}" y1="${plotB}" x2="${plotR}" y2="${plotB}" stroke="${color}"/>`;
    return out;
  }
  const band = (horizontal ? ph : pw) / n, group = band * 0.7, barW = /column|bar/.test(el.chartType) ? group / series.length : group;
  cats.slice(0, n).forEach((c, i) => {
    if (horizontal) out += text(plotL - 5, plotT + band * (i + 0.5), c, { anchor: 'end' });
    else out += text(plotL + band * (i + 0.5), plotB + size * 0.8, c, { anchor: 'middle' });
  });
  series.forEach((s, si) => {
    const col = seriesColor(el, si), vals = Array.from({ length: n }, (_, i) => +s.values[i] || 0);
    if (el.chartType === 'column') {
      vals.forEach((v, i) => { const x = plotL + band * i + (band - group) / 2 + barW * si, y0 = vy(0), y1 = vy(v); out += `<rect x="${x}" y="${Math.min(y0, y1)}" width="${Math.max(1, barW - 1)}" height="${Math.abs(y1 - y0)}" fill="${col}"/>`; if (el.labels) out += text(x + barW / 2, Math.min(y0, y1) - size * 0.6, fmt(v), { anchor: 'middle' }); });
    } else if (el.chartType === 'bar') {
      vals.forEach((v, i) => { const y = plotT + band * i + (band - group) / 2 + barW * si, x0 = vx(0), x1 = vx(v); out += `<rect x="${Math.min(x0, x1)}" y="${y}" width="${Math.abs(x1 - x0)}" height="${Math.max(1, barW - 1)}" fill="${col}"/>`; if (el.labels) out += text(Math.max(x0, x1) + 4, y + barW / 2, fmt(v)); });
    } else {
      const pts = vals.map((v, i) => [plotL + band * (i + 0.5), vy(v)]);
      if (el.chartType === 'area') out += `<path d="M${pts[0][0]} ${vy(0)}L${pts.map((p) => p.join(' ')).join('L')}L${pts[pts.length - 1][0]} ${vy(0)}Z" fill="${col}" fill-opacity="0.45"/>`;
      out += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${col}" stroke-width="${Math.max(1.5, size * 0.18)}" stroke-linejoin="round"/>`;
      pts.forEach((p, i) => { out += `<circle cx="${p[0]}" cy="${p[1]}" r="${size * 0.3}" fill="${col}"/>`; if (el.labels) out += text(p[0], p[1] - size * 0.8, fmt(vals[i]), { anchor: 'middle' }); });
    }
  });
  out += horizontal ? `<line x1="${vx(0)}" y1="${plotT}" x2="${vx(0)}" y2="${plotB}" stroke="${color}"/>` : `<line x1="${plotL}" y1="${vy(0)}" x2="${plotR}" y2="${vy(0)}" stroke="${color}"/>`;
  return out;
}

/** Parse a simple spreadsheet-like grid (first row = headers, first column = categories) into chart data. */
export function chartDataFromGrid(rows) {
  const r = rows.filter((x) => x.some((c) => String(c).trim() !== ''));
  if (!r.length) return { categories: [], series: [] };
  const header = r[0], body = r.slice(1);
  const categories = body.map((row) => String(row[0] ?? ''));
  const series = header.slice(1).map((name, j) => ({ name: String(name || `Series ${j + 1}`), values: body.map((row) => parseFloat(String(row[j + 1]).replace(/[,$%\s]/g, '')) || 0) }));
  return { categories, series };
}
export function chartDataToGrid(el) {
  const rows = [['', ...el.series.map((s) => s.name)]];
  el.categories.forEach((c, i) => rows.push([c, ...el.series.map((s) => s.values[i] ?? '')]));
  return rows;
}
