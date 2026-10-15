// Read a PowerPoint .pptx package into the RobbinsPPT document model.
import { readZip } from './zip.js';
import { parseXml, child, children, path, find, findAll, attr, num, textOf, rootEl } from './xml.js';
import { uid, bytesToDataUrl, extMime, toHex, parseColor, clone } from './util.js';
import { shapeForPrst } from './shapes.js';
import { newPresentation, makeSlide, THEMES, normalize, makeCell } from './model.js';

const PT = 1 / 12700;
const dirOf = (p) => p.slice(0, p.lastIndexOf('/') + 1);
function resolvePath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (dirOf(base) + target).split('/'), out = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p); }
  return out.join('/');
}

export async function readPptx(bytes) {
  const zip = await readZip(bytes);
  const cache = new Map();
  const xml = async (name) => { if (cache.has(name)) return cache.get(name); const e = zip.get(name); const doc = e ? parseXml(await e.text()) : null; cache.set(name, doc); return doc; };
  const relsOf = async (partName) => {
    const relName = dirOf(partName) + '_rels/' + partName.slice(partName.lastIndexOf('/') + 1) + '.rels';
    const doc = await xml(relName); const map = new Map();
    if (!doc) return map;
    for (const r of children(rootEl(doc), 'Relationship')) map.set(attr(r, 'Id'), { type: attr(r, 'Type', '').split('/').pop(), target: attr(r, 'TargetMode') === 'External' ? attr(r, 'Target') : resolvePath(partName, attr(r, 'Target')), external: attr(r, 'TargetMode') === 'External' });
    return map;
  };
  const rootRels = await relsOf('/');
  const presPart = [...rootRels.values()].find((r) => r.type === 'officeDocument')?.target || 'ppt/presentation.xml';
  const presDoc = await xml(presPart);
  if (!presDoc) throw new Error('Not a PowerPoint file (no presentation.xml)');
  const presRoot = rootEl(presDoc), presRels = await relsOf(presPart);
  const sz = child(presRoot, 'sldSz');
  const pres = newPresentation();
  pres.slides = [];
  pres.width = sz ? num(sz, 'cx') * PT : 960; pres.height = sz ? num(sz, 'cy') * PT : 540;

  const mediaCache = new Map();
  const loadMedia = async (partName) => {
    if (mediaCache.has(partName)) return mediaCache.get(partName);
    const e = zip.get(partName); if (!e) return null;
    const id = uid('a'); pres.assets[id] = bytesToDataUrl(await e.bytes(), extMime(partName.split('.').pop()));
    mediaCache.set(partName, id); return id;
  };

  // --- theme / master / layout ---------------------------------------------------------------
  const themeOf = async (masterPart) => {
    const rels = await relsOf(masterPart);
    const tp = [...rels.values()].find((r) => r.type === 'theme')?.target; const doc = tp ? await xml(tp) : null;
    const theme = { colors: {}, fonts: { heading: 'Calibri', body: 'Calibri' } };
    if (doc) {
      const cs = find(doc, 'clrScheme');
      for (const c of children(cs)) { const col = child(c, 'srgbClr') ? '#' + attr(child(c, 'srgbClr'), 'val') : child(c, 'sysClr') ? '#' + attr(child(c, 'sysClr'), 'lastClr', '000000') : null; if (col) theme.colors[c.local] = col; }
      const fs = find(doc, 'fontScheme');
      theme.fonts.heading = attr(path(fs, 'majorFont', 'latin'), 'typeface', 'Calibri') || 'Calibri'; theme.fonts.body = attr(path(fs, 'minorFont', 'latin'), 'typeface', 'Calibri') || 'Calibri';
    }
    return theme;
  };
  const partInfo = new Map(); // part → { doc, rels, root, clrMap, theme, master }
  const loadPart = async (part, kind) => {
    if (partInfo.has(part)) return partInfo.get(part);
    const doc = await xml(part), rels = await relsOf(part);
    const info = { part, doc, rels, root: doc ? rootEl(doc) : null, kind };
    partInfo.set(part, info);
    if (kind === 'layout') { const mp = [...rels.values()].find((r) => r.type === 'slideMaster')?.target; info.master = mp ? await loadPart(mp, 'master') : null; info.theme = info.master?.theme; info.clrMap = info.master?.clrMap; }
    if (kind === 'master') { info.theme = await themeOf(part); const cm = child(info.root, 'clrMap'); info.clrMap = cm ? cm.attrs : {}; }
    return info;
  };

  // --- colors --------------------------------------------------------------------------------
  const applyMods = (hex, node) => {
    let c = parseColor(hex); if (!c) return hex;
    let alpha = 1;
    for (const m of children(node)) {
      const v = num(m, 'val') / 100000;
      if (m.local === 'lumMod' || m.local === 'lumOff') {
        const r = c.r / 255, g = c.g / 255, b = c.b / 255, max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0, s = 0, l = (max + min) / 2;
        if (max !== min) { const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min); h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
        l = m.local === 'lumMod' ? l * v : Math.min(1, Math.max(0, l + v));
        const hue = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
        if (s === 0) c = { r: l * 255, g: l * 255, b: l * 255, a: c.a }; else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; c = { r: hue(p, q, h + 1 / 3) * 255, g: hue(p, q, h) * 255, b: hue(p, q, h - 1 / 3) * 255, a: c.a }; }
      } else if (m.local === 'tint') c = { r: c.r * v + 255 * (1 - v), g: c.g * v + 255 * (1 - v), b: c.b * v + 255 * (1 - v), a: c.a };
      else if (m.local === 'shade') c = { r: c.r * v, g: c.g * v, b: c.b * v, a: c.a };
      else if (m.local === 'alpha') alpha = v;
    }
    return { hex: toHex(c), alpha };
  };
  const SYS = { windowText: '#000000', window: '#FFFFFF' };
  const PRST = { black: '#000000', white: '#FFFFFF', red: '#FF0000', green: '#008000', blue: '#0000FF', yellow: '#FFFF00', gray: '#808080', lightGray: '#D3D3D3', darkGray: '#A9A9A9' };
  const colorFrom = (node, ctx) => {
    if (!node) return null;
    const c = children(node).find((k) => /srgbClr|schemeClr|sysClr|prstClr|scrgbClr/.test(k.local)); if (!c) return null;
    let hex = null;
    if (c.local === 'srgbClr') hex = '#' + attr(c, 'val', '000000');
    else if (c.local === 'sysClr') hex = attr(c, 'lastClr') ? '#' + attr(c, 'lastClr') : SYS[attr(c, 'val')] || '#000000';
    else if (c.local === 'prstClr') hex = PRST[attr(c, 'val')] || '#000000';
    else if (c.local === 'scrgbClr') hex = toHex({ r: num(c, 'r') / 100000 * 255, g: num(c, 'g') / 100000 * 255, b: num(c, 'b') / 100000 * 255 });
    else { let v = attr(c, 'val'); const cm = ctx.clrMap || {}; v = cm[v] || v; if (v === 'tx1') v = cm.tx1 || 'dk1'; if (v === 'bg1') v = cm.bg1 || 'lt1'; if (v === 'tx2') v = cm.tx2 || 'dk2'; if (v === 'bg2') v = cm.bg2 || 'lt2'; if (v === 'phClr') hex = ctx.phClr || '#000000'; else hex = (ctx.theme && ctx.theme.colors[v]) || '#000000'; }
    const r = applyMods(hex, c);
    return typeof r === 'string' ? { hex: r, alpha: 1 } : r;
  };
  const fillFrom = (node, ctx) => {
    if (!node) return undefined;
    const f = children(node).find((k) => /^(solidFill|gradFill|noFill|blipFill|grpFill|pattFill)$/.test(k.local)); if (!f) return undefined;
    if (f.local === 'noFill') return null;
    if (f.local === 'solidFill') { const c = colorFrom(f, ctx); return c ? { type: 'solid', color: c.hex, ...(c.alpha < 1 ? { opacity: c.alpha } : {}) } : null; }
    if (f.local === 'gradFill') { const gs = children(child(f, 'gsLst'), 'gs').map((g) => ({ pos: num(g, 'pos'), c: colorFrom(g, ctx) })).filter((g) => g.c).sort((a, b) => a.pos - b.pos); if (!gs.length) return null; const lin = child(f, 'lin'); return { type: 'gradient', from: gs[0].c.hex, to: gs[gs.length - 1].c.hex, angle: lin ? num(lin, 'ang') / 60000 : 90 }; }
    if (f.local === 'pattFill') { const c = colorFrom(child(f, 'fgClr'), ctx); return c ? { type: 'solid', color: c.hex } : null; }
    if (f.local === 'blipFill') return { type: 'blip', node: f };
    return undefined; // grpFill → inherit
  };
  const lineFrom = (ln, ctx) => {
    if (!ln) return undefined;
    const fill = fillFrom(ln, ctx); if (fill === null) return null;
    const w = ln.attrs.w ? num(ln, 'w') * PT : 0.75;
    const dashNode = child(ln, 'prstDash'); const d = dashNode ? attr(dashNode, 'val') : 'solid';
    const dash = /dash/i.test(d) && /dot/i.test(d) ? 'dashDot' : /dash/i.test(d) ? 'dash' : /dot/i.test(d) ? 'dot' : 'solid';
    const head = attr(child(ln, 'headEnd'), 'type', 'none'), tail = attr(child(ln, 'tailEnd'), 'type', 'none');
    if (fill === undefined) return ctx.styleLine ? { ...ctx.styleLine, width: ln.attrs.w ? w : ctx.styleLine.width, dash, head, tail } : undefined;
    return { color: fill.color || '#000000', width: w, dash, head, tail };
  };

  // --- geometry ------------------------------------------------------------------------------
  const xfrmOf = (node, tf) => {
    const x = node && (child(node, 'xfrm') || child(child(node, 'spPr'), 'xfrm')); if (!x) return null;
    const off = child(x, 'off'), ext = child(x, 'ext'); if (!off || !ext) return null;
    let r = { x: num(off, 'x') * PT, y: num(off, 'y') * PT, w: num(ext, 'cx') * PT, h: num(ext, 'cy') * PT, rotation: num(x, 'rot') / 60000, flipH: attr(x, 'flipH') === '1', flipV: attr(x, 'flipV') === '1' };
    if (tf) r = tf(r);
    return r;
  };
  const customGeom = (cg) => {
    const pl = child(cg, 'pathLst'); if (!pl) return null;
    const paths = children(pl, 'path'); if (!paths.length) return null;
    const cmds = []; let W = 0, H = 0;
    for (const p of paths) {
      const pw = num(p, 'w') || 1, ph = num(p, 'h') || 1; W = Math.max(W, pw); H = Math.max(H, ph);
      const sx = 1 / pw, sy = 1 / ph; // normalise to unit square
      const pt = (n) => [num(n, 'x') * sx, num(n, 'y') * sy];
      for (const c of children(p)) {
        const pts = children(c, 'pt').map(pt);
        if (c.local === 'moveTo') cmds.push(['M', ...pts[0]]);
        else if (c.local === 'lnTo') cmds.push(['L', ...pts[0]]);
        else if (c.local === 'cubicBezTo' && pts.length >= 3) cmds.push(['C', ...pts[0], ...pts[1], ...pts[2]]);
        else if (c.local === 'quadBezTo' && pts.length >= 2) cmds.push(['Q', ...pts[0], ...pts[1]]);
        else if (c.local === 'arcTo') { const wr = num(c, 'wR') * sx, hr = num(c, 'hR') * sy, st = num(c, 'stAng') / 60000, sw = num(c, 'swAng') / 60000; cmds.push(['A', wr, hr, st, sw]); }
        else if (c.local === 'close') cmds.push(['Z']);
      }
      if (attr(p, 'fill') === 'none') cmds.push(['NOFILL']);
    }
    return { cmds };
  };

  // --- text -----------------------------------------------------------------------------------
  const runProps = (rPr, ctx) => {
    if (!rPr) return {};
    const p = {};
    if (rPr.attrs.sz) p.size = num(rPr, 'sz') / 100;
    if (rPr.attrs.b) p.bold = rPr.attrs.b === '1' || rPr.attrs.b === 'true';
    if (rPr.attrs.i) p.italic = rPr.attrs.i === '1' || rPr.attrs.i === 'true';
    if (rPr.attrs.u) p.underline = rPr.attrs.u !== 'none';
    if (rPr.attrs.strike) p.strike = rPr.attrs.strike !== 'noStrike';
    if (rPr.attrs.baseline) p.sup = num(rPr, 'baseline') > 0 ? 'sup' : num(rPr, 'baseline') < 0 ? 'sub' : null;
    const c = colorFrom(child(rPr, 'solidFill'), ctx); if (c) p.color = c.hex;
    const lat = child(rPr, 'latin'); if (lat) { const f = attr(lat, 'typeface'); p.font = f === '+mj-lt' ? ctx.theme?.fonts.heading : f === '+mn-lt' ? ctx.theme?.fonts.body : f; }
    const hl = child(rPr, 'hlinkClick'); if (hl && ctx.rels) { const r = ctx.rels.get(attr(hl, 'r:id')); if (r && r.external) p.link = r.target; }
    return p;
  };
  const paraProps = (pPr, ctx) => {
    const p = {};
    if (!pPr) return p;
    if (pPr.attrs.algn) p.align = { l: 'left', ctr: 'center', r: 'right', just: 'justify' }[pPr.attrs.algn] || 'left';
    if (pPr.attrs.lvl) p.level = num(pPr, 'lvl');
    if (child(pPr, 'buNone')) p.bullet = false;
    else if (child(pPr, 'buChar')) p.bullet = attr(child(pPr, 'buChar'), 'char', '•') || '•';
    else if (child(pPr, 'buAutoNum')) { const t = attr(child(pPr, 'buAutoNum'), 'type', 'arabicPeriod'); p.bullet = /alpha/.test(t) ? 'alpha' : /roman/.test(t) ? 'roman' : 'number'; }
    const ls = path(pPr, 'lnSpc', 'spcPct'); if (ls) p.lineHeight = Math.max(0.6, (num(ls, 'val') / 100000) * 1.2);
    const sb = path(pPr, 'spcBef', 'spcPts'); if (sb) p.spaceBefore = num(sb, 'val') / 100;
    const sa = path(pPr, 'spcAft', 'spcPts'); if (sa) p.spaceAfter = num(sa, 'val') / 100;
    const dr = child(pPr, 'defRPr'); if (dr) p.defRPr = runProps(dr, ctx);
    return p;
  };
  // level styles from a lstStyle / txStyles body: { [level]: paraProps }
  const levelStyles = (node, ctx) => { const out = {}; if (!node) return out; for (const c of children(node)) { const m = /^lvl(\d)pPr$/.exec(c.local); if (m) out[+m[1] - 1] = paraProps(c, ctx); else if (c.local === 'defPPr') out.def = paraProps(c, ctx); } return out; };
  const parseTxBody = (txBody, el, ctx, inherited = []) => {
    const bodyPr = child(txBody, 'bodyPr');
    if (bodyPr) {
      el.valign = { t: 'top', ctr: 'middle', b: 'bottom' }[attr(bodyPr, 'anchor')] || el.valign || 'top';
      const ins = ['lIns', 'tIns', 'rIns', 'bIns'].map((k) => (bodyPr.attrs[k] !== undefined ? num(bodyPr, k) * PT : 7.2)); el.padding = Math.round(((ins[0] + ins[2]) / 2) * 10) / 10;
      if (child(bodyPr, 'normAutofit')) el.autofit = 'shrink'; else if (child(bodyPr, 'spAutoFit')) el.autofit = 'grow';
      if (attr(bodyPr, 'vert') === 'vert' || attr(bodyPr, 'vert') === 'vert270') el.rotation = (el.rotation || 0) + (attr(bodyPr, 'vert') === 'vert' ? 90 : -90);
    }
    const chain = [...inherited, levelStyles(child(txBody, 'lstStyle'), ctx)];
    const paragraphs = [];
    for (const p of children(txBody, 'p')) {
      const own = paraProps(child(p, 'pPr'), ctx), level = own.level || 0;
      const merged = {};
      for (const ls of chain) Object.assign(merged, ls.def || {}, ls[level] || {});
      Object.assign(merged, own);
      const pp = { runs: [] };
      if (merged.align && merged.align !== 'left') pp.align = merged.align; if (level) pp.level = level;
      if (merged.bullet) pp.bullet = merged.bullet;
      if (merged.lineHeight) pp.lineHeight = merged.lineHeight; if (merged.spaceBefore) pp.spaceBefore = merged.spaceBefore; if (merged.spaceAfter) pp.spaceAfter = merged.spaceAfter;
      const def = {}; for (const ls of chain) { Object.assign(def, (ls.def && ls.def.defRPr) || {}, (ls[level] && ls[level].defRPr) || {}); } Object.assign(def, own.defRPr || {});
      pp.defaults = def;
      let cur = pp;
      for (const r of children(p)) {
        if (r.local === 'r' || r.local === 'fld') { const rp = runProps(child(r, 'rPr'), ctx); const t = textOf(child(r, 't')); if (t) cur.runs.push({ text: t, ...def, ...rp }); }
        else if (r.local === 'br') { paragraphs.push(cur); cur = { ...pp, runs: [] }; if (cur.bullet) cur.bullet = false; }
      }
      if (!cur.runs.length) { const e = runProps(child(p, 'endParaRPr'), ctx); cur.defaults = { ...def, ...e }; }
      paragraphs.push(cur);
    }
    // element-level defaults: most common run style
    const all = paragraphs.flatMap((p) => (p.runs.length ? p.runs : [p.defaults]));
    const pick = (k, dflt) => { const counts = new Map(); const bool = typeof dflt === 'boolean'; for (const r of all) { const v = bool ? !!r[k] : r[k]; if (v !== undefined && v !== null) counts.set(v, (counts.get(v) || 0) + 1); } let best = dflt, bc = 0; for (const [v, c] of counts) if (c > bc) { best = v; bc = c; } return best; };
    el.size = pick('size', el.size || 18); el.font = pick('font', el.font || (ctx.theme?.fonts.body) || 'Calibri'); el.color = pick('color', el.color || '#000000'); el.bold = !!pick('bold', false); el.italic = !!pick('italic', false); el.underline = !!pick('underline', false);
    const aligns = paragraphs.map((p) => p.align || 'left'); el.align = aligns.length ? aligns.sort((a, b) => aligns.filter((v) => v === a).length - aligns.filter((v) => v === b).length).pop() : 'left';
    for (const p of paragraphs) {
      delete p.defaults;
      if ((p.align || 'left') === el.align) delete p.align;
      for (const r of p.runs) { for (const k of ['size', 'font', 'color', 'bold', 'italic', 'underline']) if (r[k] === el[k]) delete r[k]; for (const k of Object.keys(r)) if (r[k] === undefined || r[k] === null || (r[k] === false && k !== 'text')) delete r[k]; }
      if (p.bullet === false) delete p.bullet;
    }
    el.text = { paragraphs };
  };

  // --- placeholder lookup ----------------------------------------------------------------------
  const phOf = (sp) => { const ph = path(sp, 'nvSpPr', 'nvPr', 'ph'); return ph ? { type: attr(ph, 'type', ph.attrs.idx !== undefined ? 'body' : 'obj'), idx: attr(ph, 'idx') } : null; };
  const findPh = (info, ph) => {
    if (!info || !info.root) return null;
    const sps = findAll(child(info.root, 'cSld'), 'sp').filter((s) => phOf(s));
    const norm = (t) => (t === 'ctrTitle' ? 'title' : t === 'obj' || t === 'subTitle' ? 'body' : t);
    return (ph.idx !== undefined && sps.find((s) => phOf(s).idx === ph.idx && (norm(phOf(s).type) === norm(ph.type) || ph.type === 'body' || ph.type === 'obj'))) || sps.find((s) => phOf(s).idx === ph.idx && ph.idx !== undefined && !ph.type) || sps.find((s) => norm(phOf(s).type) === norm(ph.type) && (ph.type !== 'body' || !ph.idx || phOf(s).idx === ph.idx)) || sps.find((s) => norm(phOf(s).type) === norm(ph.type)) || null;
  };
  const masterTxStyle = (master, phType) => {
    if (!master || !master.root) return {};
    const ts = child(master.root, 'txStyles'); if (!ts) return {};
    const which = phType === 'title' || phType === 'ctrTitle' ? 'titleStyle' : /body|subTitle|obj/.test(phType) ? 'bodyStyle' : 'otherStyle';
    return levelStyles(child(ts, which), master.ctx);
  };

  // --- element parsing -------------------------------------------------------------------------
  const mapPh = (ph) => (!ph ? null : ph.type === 'ctrTitle' ? 'ctitle' : ph.type === 'title' ? 'title' : ph.type === 'subTitle' ? 'subtitle' : ph.type === 'body' || ph.type === 'obj' ? 'body' : null);
  async function parseSp(sp, ctx, tf) {
    const ph = phOf(sp), spPr = child(sp, 'spPr'), style = child(sp, 'style');
    const styleCtx = { ...ctx };
    if (style) { const lr = child(style, 'lnRef'), fr = child(style, 'fillRef'), fnt = child(style, 'fontRef'); styleCtx.styleLine = num(lr, 'idx') > 0 ? { color: colorFrom(lr, ctx)?.hex || '#000000', width: 0.75, dash: 'solid' } : null; styleCtx.styleFill = num(fr, 'idx') > 0 ? { type: 'solid', color: colorFrom(fr, ctx)?.hex || '#4472C4' } : null; styleCtx.styleFont = colorFrom(fnt, ctx)?.hex || null; }
    let geom = xfrmOf(spPr, tf);
    const layoutSp = ph ? findPh(ctx.layout, ph) : null, masterSp = ph ? findPh(ctx.master, ph) : null;
    if (!geom && layoutSp) geom = xfrmOf(child(layoutSp, 'spPr'), tf);
    if (!geom && masterSp) geom = xfrmOf(child(masterSp, 'spPr'), tf);
    if (!geom) geom = { x: pres.width * 0.1, y: pres.height * 0.1, w: pres.width * 0.8, h: pres.height * 0.2, rotation: 0, flipH: false, flipV: false };
    const prstNode = child(spPr, 'prstGeom'), prst = prstNode ? attr(prstNode, 'prst') : null, cust = child(spPr, 'custGeom');
    let fill = fillFrom(spPr, ctx); if (fill === undefined) fill = ph ? (layoutSp ? fillFrom(child(layoutSp, 'spPr'), ctx) : undefined) : undefined; if (fill === undefined) fill = styleCtx.styleFill ?? null;
    if (fill && fill.type === 'blip') { // picture-filled shape → image element
      const blip = child(fill.node, 'blip'); const r = blip && ctx.rels.get(attr(blip, 'r:embed')); const assetId = r && !r.external ? await loadMedia(r.target) : null;
      if (assetId) return { id: uid(), type: 'image', ...geom, assetId, opacity: 1, naturalW: geom.w, naturalH: geom.h, radius: prst === 'roundRect' || prst === 'ellipse' ? Math.min(geom.w, geom.h) / (prst === 'ellipse' ? 2 : 6) : 0 };
      fill = null;
    }
    let stroke = lineFrom(child(spPr, 'ln'), styleCtx); if (stroke === undefined) stroke = styleCtx.styleLine ?? null;
    const shadow = !!path(spPr, 'effectLst', 'outerShdw');
    const txBody = child(sp, 'txBody');
    const isTextBox = attr(path(sp, 'nvSpPr', 'cNvSpPr'), 'txBox') === '1' || (!!ph && !fill && !stroke) || (prst === 'rect' && !fill && !stroke && !cust);
    const el = { id: uid(), type: isTextBox ? 'text' : 'shape', ...geom, opacity: 1, locked: false, anim: null, fill: fill || null, stroke: stroke || null, shadow, text: { paragraphs: [] }, font: ctx.theme?.fonts.body || 'Calibri', size: 18, color: styleCtx.styleFont || (ctx.theme?.colors.dk1) || '#000000', align: 'left', valign: 'top', lineHeight: 1.2, padding: 7.2 };
    if (el.type === 'text') { el.ph = mapPh(ph); el.bold = false; el.italic = false; el.underline = false; } else { el.shape = shapeForPrst(prst) || 'rect'; if (prst && !shapeForPrst(prst)) el.prst = prst; if (cust) { const g = customGeom(cust); if (g) { el.shape = 'custom'; el.geom = g; } } el.align = 'center'; el.valign = 'middle'; if (!el.fill && !el.stroke && !cust) el.stroke = null; }
    const name = attr(path(sp, 'nvSpPr', 'cNvPr'), 'name'); if (name) el.name = name;
    const hl = path(sp, 'nvSpPr', 'cNvPr', 'hlinkClick'); if (hl) { const r = ctx.rels.get(attr(hl, 'r:id')); if (r && r.external) el.link = r.target; }
    if (txBody) {
      const inherited = [];
      if (ph) { inherited.push(masterTxStyle(ctx.master, ph.type)); if (masterSp) inherited.push(levelStyles(path(masterSp, 'txBody', 'lstStyle'), ctx.master.ctx)); if (layoutSp) inherited.push(levelStyles(path(layoutSp, 'txBody', 'lstStyle'), ctx.layout.ctx)); }
      else inherited.push(masterTxStyle(ctx.master, 'other'));
      if (ph && (layoutSp || masterSp) && !child(txBody, 'bodyPr')?.attrs.anchor) { const lb = (layoutSp && path(layoutSp, 'txBody', 'bodyPr')) || (masterSp && path(masterSp, 'txBody', 'bodyPr')); if (lb && lb.attrs.anchor) el.valign = { t: 'top', ctr: 'middle', b: 'bottom' }[lb.attrs.anchor] || 'top'; }
      const defaults = { size: ph && /title/i.test(ph.type) ? 44 : 18 };
      el.size = defaults.size;
      parseTxBody(txBody, el, ctx, inherited);
      if (el.text.paragraphs.every((p) => !p.runs.length) && el.type === 'text' && !ph) return null; // empty text box, nothing visible
    }
    return el;
  }
  async function parsePic(pic, ctx, tf) {
    const blip = path(pic, 'blipFill', 'blip'); const r = blip && ctx.rels.get(attr(blip, 'r:embed') || attr(blip, 'r:link'));
    const geom = xfrmOf(child(pic, 'spPr'), tf) || { x: 0, y: 0, w: 100, h: 100, rotation: 0, flipH: false, flipV: false };
    const assetId = r && !r.external ? await loadMedia(r.target) : null; if (!assetId) return null;
    const el = { id: uid(), type: 'image', ...geom, assetId, naturalW: geom.w, naturalH: geom.h, opacity: 1, stroke: lineFrom(child(child(pic, 'spPr'), 'ln'), ctx) || null, shadow: !!path(pic, 'spPr', 'effectLst', 'outerShdw'), radius: 0 };
    const sr = path(pic, 'blipFill', 'srcRect'); if (sr) el.crop = { l: num(sr, 'l') / 100000, t: num(sr, 't') / 100000, r: num(sr, 'r') / 100000, b: num(sr, 'b') / 100000 };
    const prst = attr(path(pic, 'spPr', 'prstGeom'), 'prst'); if (prst === 'roundRect') el.radius = Math.min(geom.w, geom.h) / 6; if (prst === 'ellipse') el.radius = Math.min(geom.w, geom.h) / 2;
    const alpha = path(pic, 'blipFill', 'blip', 'alphaModFix'); if (alpha) el.opacity = num(alpha, 'amt', 100000) / 100000;
    const hl = path(pic, 'nvPicPr', 'cNvPr', 'hlinkClick'); if (hl) { const rr = ctx.rels.get(attr(hl, 'r:id')); if (rr && rr.external) el.link = rr.target; }
    return el;
  }
  function parseCxn(cx, ctx, tf) {
    const spPr = child(cx, 'spPr'), geom = xfrmOf(spPr, tf); if (!geom) return null;
    const styleCtx = { ...ctx }; const style = child(cx, 'style'); if (style) { const lr = child(style, 'lnRef'); styleCtx.styleLine = num(lr, 'idx') > 0 ? { color: colorFrom(lr, ctx)?.hex || '#000000', width: 0.75, dash: 'solid' } : null; }
    let st = lineFrom(child(spPr, 'ln'), styleCtx); if (st === undefined) st = styleCtx.styleLine || { color: '#000000', width: 1, dash: 'solid' }; if (!st) return null;
    return { id: uid(), type: 'line', x: geom.x, y: geom.y, w: geom.w, h: geom.h, rotation: geom.rotation, flipH: geom.flipH, flipV: geom.flipV, opacity: 1, stroke: { color: st.color, width: st.width, dash: st.dash }, arrowStart: !!st.head && st.head !== 'none', arrowEnd: !!st.tail && st.tail !== 'none', shadow: !!path(spPr, 'effectLst', 'outerShdw') };
  }
  async function parseFrame(gf, ctx, tf) {
    const geom = xfrmOf(gf, tf) || { x: 0, y: 0, w: 200, h: 100, rotation: 0, flipH: false, flipV: false };
    const gd = path(gf, 'graphic', 'graphicData'); if (!gd) return null;
    const tbl = child(gd, 'tbl');
    if (tbl) {
      const el = { id: uid(), type: 'table', ...geom, rotation: 0, opacity: 1, rows: [], colWidths: children(child(tbl, 'tblGrid'), 'gridCol').map((c) => num(c, 'w') * PT), rowHeights: [], font: ctx.theme?.fonts.body || 'Calibri', size: 14, color: ctx.theme?.colors.dk1 || '#000000', headerRow: attr(child(tbl, 'tblPr'), 'firstRow') === '1', bandRows: attr(child(tbl, 'tblPr'), 'bandRow') === '1', style: { headerFill: null, headerColor: null, bandFill: null, fill: null, borderColor: '#BFBFBF', borderWidth: 1 } };
      const styleId = textOf(path(tbl, 'tblPr', 'tableStyleId'));
      if (styleId && el.headerRow) { const acc = ctx.theme?.colors.accent1 || '#4472C4'; el.style = { headerFill: acc, headerColor: '#FFFFFF', bandFill: parseColor(acc) ? toHex({ r: 255 - (255 - parseColor(acc).r) * 0.2, g: 255 - (255 - parseColor(acc).g) * 0.2, b: 255 - (255 - parseColor(acc).b) * 0.2 }) : '#D9E2F3', fill: '#FFFFFF', borderColor: '#FFFFFF', borderWidth: 1 }; }
      const sizes = [];
      for (const tr of children(tbl, 'tr')) {
        el.rowHeights.push(num(tr, 'h') * PT); const row = [];
        for (const tc of children(tr, 'tc')) {
          const cell = makeCell(''); const tcPr = child(tc, 'tcPr');
          const f = fillFrom(tcPr, ctx); if (f && f.type === 'solid') cell.fill = f.color;
          if (tcPr && tcPr.attrs.anchor) cell.valign = { t: 'top', ctr: 'middle', b: 'bottom' }[tcPr.attrs.anchor] || 'middle';
          const lnL = tcPr && child(tcPr, 'lnL'); if (lnL) { const l = lineFrom(lnL, ctx); if (l) { el.style.borderColor = l.color; el.style.borderWidth = l.width; } }
          const body = child(tc, 'txBody');
          if (body) { const tmp = { size: 14, font: el.font, color: el.color, align: 'left' }; parseTxBody(body, tmp, ctx, [masterTxStyle(ctx.master, 'other')]); cell.text = tmp.text; cell.align = tmp.align; cell.bold = tmp.bold; cell.italic = tmp.italic; if (tmp.color !== el.color) cell.color = tmp.color; cell.size = tmp.size; sizes.push(tmp.size); if (tmp.font !== el.font) cell.font = tmp.font; }
          row.push(cell);
        }
        el.rows.push(row);
      }
      if (sizes.length) { const common = sizes.sort((a, b) => sizes.filter((v) => v === a).length - sizes.filter((v) => v === b).length).pop(); el.size = common; for (const row of el.rows) for (const c of row) if (c.size === common) delete c.size; }
      if (!el.rows.length || !el.rows[0].length) return null;
      return el;
    }
    const chart = child(gd, 'chart');
    if (chart) { const r = ctx.rels.get(attr(chart, 'r:id')); const doc = r ? await xml(r.target) : null; if (doc) return parseChart(doc, geom, ctx); }
    // fallback: anything else (SmartArt, OLE) → skip
    return null;
  }
  function parseChart(doc, geom, ctx) {
    const root = rootEl(doc), plot = find(root, 'plotArea'); if (!plot) return null;
    const kinds = ['barChart', 'bar3DChart', 'lineChart', 'line3DChart', 'areaChart', 'area3DChart', 'pieChart', 'pie3DChart', 'doughnutChart', 'scatterChart', 'ofPieChart', 'radarChart', 'bubbleChart'];
    const cn = children(plot).find((c) => kinds.includes(c.local)); if (!cn) return null;
    const k = cn.local;
    const chartType = /bar/.test(k) ? (attr(child(cn, 'barDir'), 'val') === 'bar' ? 'bar' : 'column') : /line|radar/.test(k) ? 'line' : /area/.test(k) ? 'area' : /doughnut/.test(k) ? 'doughnut' : /pie/.test(k) ? 'pie' : /scatter|bubble/.test(k) ? 'scatter' : 'column';
    const pts = (node) => { if (!node) return []; const lit = child(node, 'strLit') || child(node, 'numLit') || path(node, 'strRef', 'strCache') || path(node, 'numRef', 'numCache') || path(node, 'multiLvlStrRef', 'multiLvlStrCache'); if (!lit) return []; const lvl = child(lit, 'lvl'); return children(lvl || lit, 'pt').map((p) => ({ idx: num(p, 'idx'), v: textOf(child(p, 'v')) })); };
    const arr = (list, numeric) => { const n = list.length ? Math.max(...list.map((p) => p.idx)) + 1 : 0; const out = Array.from({ length: n }, () => (numeric ? 0 : '')); for (const p of list) out[p.idx] = numeric ? parseFloat(p.v) || 0 : p.v; return out; };
    const series = [], colors = []; let categories = [];
    children(cn, 'ser').forEach((s, i) => {
      const tx = child(s, 'tx'); const name = tx ? (child(tx, 'v') ? textOf(child(tx, 'v')) : textOf(path(tx, 'strRef', 'strCache'))) || `Series ${i + 1}` : `Series ${i + 1}`;
      const cat = pts(child(s, 'cat') || child(s, 'xVal')), val = pts(child(s, 'val') || child(s, 'yVal'));
      if (cat.length && !categories.length) categories = arr(cat, chartType === 'scatter');
      series.push({ name, values: arr(val, true) });
      const f = fillFrom(child(s, 'spPr'), ctx) || (child(s, 'spPr') && lineFrom(child(child(s, 'spPr'), 'ln'), ctx)); colors[i] = f && (f.color) ? f.color : undefined;
      if (/pie|doughnut/.test(chartType)) children(s, 'dPt').forEach((dp) => { const ff = fillFrom(child(dp, 'spPr'), ctx); if (ff && ff.color) colors[num(child(dp, 'idx'), 'val')] = ff.color; });
    });
    if (!categories.length) categories = (series[0]?.values || []).map((_, i) => `Category ${i + 1}`);
    const titleNode = child(child(root, 'chart'), 'title'); const title = titleNode ? textOf(find(titleNode, 'rich')).trim() : '';
    const el = { id: uid(), type: 'chart', ...geom, rotation: 0, opacity: 1, chartType, title, categories, series, colors: colors.some(Boolean) ? colors.map((c, i) => c || (ctx.theme?.colors[`accent${(i % 6) + 1}`]) || '#4472C4') : [], legend: !!child(child(root, 'chart'), 'legend'), labels: !!findAll(cn, 'dLbls').some((d) => attr(child(d, 'showVal'), 'val') === '1' || attr(child(d, 'showPercent'), 'val') === '1'), gridlines: !!find(plot, 'majorGridlines'), font: ctx.theme?.fonts.body || 'Calibri', size: 12, color: ctx.theme?.colors.dk1 || '#404040', fill: null, stroke: null };
    const txPr = child(root, 'txPr'); const sz = txPr && find(txPr, 'defRPr'); if (sz && sz.attrs.sz) el.size = num(sz, 'sz') / 100;
    const spPr = child(root, 'spPr'); const bg = fillFrom(spPr, ctx); if (bg && bg.type === 'solid') el.fill = { type: 'solid', color: bg.color };
    return el;
  }
  async function parseTree(tree, ctx, tf, out) {
    for (const n of children(tree)) {
      let el = null;
      if (n.local === 'sp') el = await parseSp(n, ctx, tf);
      else if (n.local === 'pic') el = await parsePic(n, ctx, tf);
      else if (n.local === 'cxnSp') el = parseCxn(n, ctx, tf);
      else if (n.local === 'graphicFrame') el = await parseFrame(n, ctx, tf);
      else if (n.local === 'grpSp') {
        const gx = path(n, 'grpSpPr', 'xfrm'); const kids = [];
        let tf2 = tf;
        if (gx) {
          const off = child(gx, 'off'), ext = child(gx, 'ext'), chOff = child(gx, 'chOff'), chExt = child(gx, 'chExt');
          const ox = num(off, 'x') * PT, oy = num(off, 'y') * PT, ex = num(ext, 'cx') * PT, ey = num(ext, 'cy') * PT, cx = num(chOff, 'x') * PT, cy = num(chOff, 'y') * PT, cw = num(chExt, 'cx') * PT || ex || 1, ch = num(chExt, 'cy') * PT || ey || 1;
          const sx = ex / cw, sy = ey / ch, rot = num(gx, 'rot') / 60000, fh = attr(gx, 'flipH') === '1', fv = attr(gx, 'flipV') === '1';
          const local = (r) => { let x = ox + (r.x - cx) * sx, y = oy + (r.y - cy) * sy, w = r.w * sx, h = r.h * sy; if (fh) x = ox + ex - (x - ox) - w; if (fv) y = oy + ey - (y - oy) - h; let rotation = r.rotation + (fh !== fv ? -rot : rot); if (rot) { const gcx = ox + ex / 2, gcy = oy + ey / 2, ecx = x + w / 2, ecy = y + h / 2, a = (rot * Math.PI) / 180, dx = ecx - gcx, dy = ecy - gcy; const nx = gcx + dx * Math.cos(a) - dy * Math.sin(a), ny = gcy + dx * Math.sin(a) + dy * Math.cos(a); x = nx - w / 2; y = ny - h / 2; } return { x, y, w, h, rotation, flipH: r.flipH !== fh, flipV: r.flipV !== fv }; };
          tf2 = tf ? (r) => tf(local(r)) : local;
        }
        await parseTree(n, ctx, tf2, kids);
        if (kids.length === 1) el = kids[0];
        else if (kids.length) { const xs = kids.map((k) => k.x), ys = kids.map((k) => k.y), x2 = kids.map((k) => k.x + k.w), y2 = kids.map((k) => k.y + k.h); const x = Math.min(...xs), y = Math.min(...ys); el = { id: uid(), type: 'group', x, y, w: Math.max(...x2) - x, h: Math.max(...y2) - y, rotation: 0, opacity: 1, children: kids }; }
      } else if (n.local === 'AlternateContent') {
        const choice = child(n, 'Choice'), fb = child(n, 'Fallback'); const before = out.length;
        if (choice) await parseTree(choice, ctx, tf, out);
        if (out.length === before && fb) await parseTree(fb, ctx, tf, out);
      }
      if (el) { const cnv = path(n, n.local === 'pic' ? 'nvPicPr' : n.local === 'cxnSp' ? 'nvCxnSpPr' : n.local === 'graphicFrame' ? 'nvGraphicFramePr' : n.local === 'grpSp' ? 'nvGrpSpPr' : 'nvSpPr', 'cNvPr'); if (attr(cnv, 'hidden') === '1') el.hidden = true; if (cnv) ctx.spids.set(attr(cnv, 'id'), el); out.push(el); }
    }
  }
  const bgOf = async (info, ctx) => {
    if (!info || !info.root) return undefined;
    const bg = path(info.root, 'cSld', 'bg'); if (!bg) return undefined;
    const pr = child(bg, 'bgPr');
    if (pr) { const f = fillFrom(pr, ctx); if (f && f.type === 'blip') { const blip = child(f.node, 'blip'); const r = blip && info.rels.get(attr(blip, 'r:embed')); const id = r && !r.external ? await loadMedia(r.target) : null; return id ? { type: 'image', assetId: id, fit: 'cover' } : undefined; } return f === null ? { type: 'solid', color: '#FFFFFF' } : f; }
    const ref = child(bg, 'bgRef'); if (ref) { const c = colorFrom(ref, ctx); return c ? { type: 'solid', color: c.hex } : undefined; }
    return undefined;
  };
  const transitionOf = (root) => {
    const t = child(root, 'transition') || find(root, 'transition'); if (!t) return { transition: { type: 'none', dir: 'left', duration: 0.7 }, advance: null };
    const kid = children(t)[0]; const spd = attr(t, 'spd', 'med'); const dur = t.attrs['p14:dur'] ? num(t, 'p14:dur') / 1000 : spd === 'fast' ? 0.4 : spd === 'slow' ? 1.2 : 0.7;
    const map = { fade: 'fade', push: 'push', wipe: 'wipe', cover: 'cover', pull: 'cover', zoom: 'zoom', split: 'split', dissolve: 'dissolve', cut: 'cut', random: 'random', wheel: 'wheel', circle: 'circle', newsflash: 'newsflash', blinds: 'wipe', checker: 'dissolve', comb: 'wipe', diamond: 'circle', plus: 'circle', strips: 'wipe', wedge: 'wheel', randomBar: 'dissolve' };
    const dir = kid ? ({ l: 'left', r: 'right', u: 'up', d: 'down' }[attr(kid, 'dir')] || 'left') : 'left';
    const adv = t.attrs.advTm !== undefined ? num(t, 'advTm') / 1000 : null;
    return { transition: { type: kid ? map[kid.local] || 'fade' : 'none', dir, duration: dur }, advance: adv };
  };
  const animationsOf = (root, idToEl) => {
    const timing = child(root, 'timing'); if (!timing) return;
    let order = 0;
    for (const cTn of findAll(timing, 'cTn')) {
      if (attr(cTn, 'presetClass') !== 'entr') continue;
      const tgt = find(cTn, 'spTgt'); const el = tgt && idToEl.get(attr(tgt, 'spid')); if (!el || el.anim) continue;
      const preset = num(cTn, 'presetID'), sub = num(cTn, 'presetSubtype');
      const dir = { 8: 'left', 2: 'right', 1: 'up', 4: 'down' }[sub] || 'left';
      const type = preset === 2 ? 'fly' : preset === 22 ? 'wipe' : preset === 23 || preset === 53 || preset === 15 ? 'zoom' : preset === 1 ? 'appear' : 'fade';
      const durNode = findAll(cTn, 'cTn').find((c) => c.attrs.dur && c.attrs.dur !== 'indefinite' && num(c, 'dur') > 1);
      el.anim = { type, dir, duration: durNode ? num(durNode, 'dur') / 1000 : 0.5, delay: 0, order: ++order };
    }
  };

  // --- slides -----------------------------------------------------------------------------------
  let firstTheme = null, firstMaster = null;
  const sldIds = children(child(presRoot, 'sldIdLst'), 'sldId');
  for (const sid of sldIds) {
    const r = presRels.get(attr(sid, 'r:id')); if (!r) continue;
    const info = await loadPart(r.target, 'slide');
    if (!info.root) continue;
    const lp = [...info.rels.values()].find((x) => x.type === 'slideLayout')?.target;
    const layout = lp ? await loadPart(lp, 'layout') : null, master = layout?.master || null;
    const theme = master?.theme || { colors: {}, fonts: { heading: 'Calibri', body: 'Calibri' } };
    const clrMap = master?.clrMap || {};
    const ovr = path(info.root, 'clrMapOvr', 'overrideClrMapping'); const cm = ovr ? { ...clrMap, ...ovr.attrs } : clrMap;
    const spidMap = new Map();
    const ctx = { theme, clrMap: cm, rels: info.rels, layout, master, spids: spidMap };
    if (layout) layout.ctx = { theme, clrMap: cm, rels: layout.rels };
    if (master) master.ctx = { theme, clrMap: cm, rels: master.rels };
    if (!firstTheme) { firstTheme = theme; firstMaster = master; }
    const slide = makeSlide(pres, 'blank');
    slide.elements = [];
    slide.hidden = attr(info.root, 'show') === '0';
    const tree = path(info.root, 'cSld', 'spTree');
    if (tree) await parseTree(tree, ctx, null, slide.elements);
    let bg = await bgOf(info, ctx); if (bg === undefined && layout) bg = await bgOf(layout, layout.ctx); if (bg === undefined && master) bg = await bgOf(master, master.ctx);
    slide.background = bg && bg.type !== 'blip' ? bg : null;
    Object.assign(slide, transitionOf(info.root));
    animationsOf(info.root, spidMap);
    const np = [...info.rels.values()].find((x) => x.type === 'notesSlide')?.target;
    if (np) { const nd = await xml(np); if (nd) { const sps = findAll(nd, 'sp').filter((s) => { const ph = phOf(s); return ph && /body/.test(ph.type); }); slide.notes = sps.map((s) => children(child(s, 'txBody'), 'p').map((p) => textOf(p)).join('\n')).join('\n').trim(); } }
    // detect layout kind from placeholders
    const phs = slide.elements.filter((e) => e.ph);
    slide.layout = phs.some((e) => e.ph === 'ctitle') ? 'title' : phs.filter((e) => e.ph === 'body').length >= 2 ? 'twoContent' : phs.some((e) => e.ph === 'body') ? 'titleContent' : phs.some((e) => e.ph === 'title') ? 'titleOnly' : 'blank';
    pres.slides.push(slide);
  }
  if (!pres.slides.length) pres.slides.push(makeSlide(pres, 'title'));
  // theme from the first master
  if (firstTheme) {
    const c = firstTheme.colors, bgFill = firstMaster ? await bgOf(firstMaster, firstMaster.ctx) : null;
    const text = c.dk1 || '#000000';
    const bg = bgFill && bgFill.type !== 'blip' && bgFill.type !== 'image' ? bgFill : { type: 'solid', color: c.lt1 || '#FFFFFF' };
    pres.theme = { name: 'Imported', bg, text, heading: c.dk2 || text, accents: [1, 2, 3, 4, 5, 6].map((i) => c[`accent${i}`] || THEMES[0].accents[i - 1]), fonts: { heading: firstTheme.fonts.heading, body: firstTheme.fonts.body } };
    // slides whose background equals the theme background → inherit
    for (const s of pres.slides) if (s.background && JSON.stringify(s.background) === JSON.stringify(bg)) s.background = null;
  }
  const core = await xml('docProps/core.xml'); const title = core && textOf(find(core, 'title')); if (title) pres.title = title;
  return normalize(pres);
}
