// Write a presentation as a PowerPoint .pptx (Office Open XML) package.
import { writeZip } from './zip.js';
import { escapeXml as X, hex6, dataUrlParts, base64ToBytes, mimeExt, parseColor } from './util.js';
import { prstFor } from './shapes.js';
import { isTextEmpty, slideBackground, placeholderStyle } from './model.js';
import { tableGeometry, cellStyle } from './svg.js';
import { seriesColor } from './charts.js';

const EMU = 12700;
const emu = (pt) => Math.round(pt * EMU);
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main', NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main', NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = { slide: `${NS_R}/slide`, layout: `${NS_R}/slideLayout`, master: `${NS_R}/slideMaster`, theme: `${NS_R}/theme`, image: `${NS_R}/image`, chart: `${NS_R}/chart`, notes: `${NS_R}/notesSlide`, notesMaster: `${NS_R}/notesMaster`, hyperlink: `${NS_R}/hyperlink`, presProps: `${NS_R}/presProps`, viewProps: `${NS_R}/viewProps`, tableStyles: `${NS_R}/tableStyles` };
const CT = { pres: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml', slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml', layout: 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml', master: 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml', theme: 'application/vnd.openxmlformats-officedocument.theme+xml', notes: 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml', notesMaster: 'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml', chart: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml', presProps: 'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml', viewProps: 'application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml', tableStyles: 'application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml', core: 'application/vnd.openxmlformats-package.core-properties+xml', app: 'application/vnd.openxmlformats-officedocument.extended-properties+xml' };

const rels = (list) => XMLH + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((r, i) => `<Relationship Id="${r.id || 'rId' + (i + 1)}" Type="${r.type}" Target="${X(r.target)}"${r.mode ? ` TargetMode="${r.mode}"` : ''}/>`).join('')}</Relationships>`;
const srgb = (c, alpha) => { const p = parseColor(c); const a = alpha ?? (p ? p.a : 1); return `<a:srgbClr val="${hex6(c)}">${a < 1 ? `<a:alpha val="${Math.round(a * 100000)}"/>` : ''}</a:srgbClr>`; };
export function fillXml(fill) {
  if (!fill || fill.type === 'none') return '<a:noFill/>';
  if (fill.type === 'gradient') return `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0">${srgb(fill.from)}</a:gs><a:gs pos="100000">${srgb(fill.to)}</a:gs></a:gsLst><a:lin ang="${Math.round(((fill.angle || 0) % 360) * 60000)}" scaled="0"/></a:gradFill>`;
  return `<a:solidFill>${srgb(fill.color, fill.opacity)}</a:solidFill>`;
}
const DASH = { dash: 'dash', dot: 'sysDot', dashDot: 'dashDot', solid: 'solid' };
export function lineXml(st, extra = '') {
  if (!st || !st.width || !st.color) return '<a:ln><a:noFill/></a:ln>';
  return `<a:ln w="${emu(st.width)}" cap="flat">${`<a:solidFill>${srgb(st.color)}</a:solidFill>`}<a:prstDash val="${DASH[st.dash] || 'solid'}"/>${extra}</a:ln>`;
}
const shadowXml = '<a:effectLst><a:outerShdw blurRad="50800" dist="38100" dir="2700000" algn="tl" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr></a:outerShdw></a:effectLst>';
const xfrm = (el, tag = 'a:xfrm') => `<${tag}${el.rotation ? ` rot="${Math.round(el.rotation * 60000)}"` : ''}${el.flipH ? ' flipH="1"' : ''}${el.flipV ? ' flipV="1"' : ''}><a:off x="${emu(el.x)}" y="${emu(el.y)}"/><a:ext cx="${emu(Math.max(0, el.w))}" cy="${emu(Math.max(0, el.h))}"/></${tag}>`;
const ANCHOR = { top: 't', middle: 'ctr', bottom: 'b' }, ALGN = { left: 'l', center: 'ctr', right: 'r', justify: 'just' };
const AUTONUM = { number: 'arabicPeriod', alpha: 'alphaLcPeriod', roman: 'romanLcPeriod' };

function runXml(el, r, ctx) {
  const size = r.size || el.size || 18, props = [`lang="en-US"`, `sz="${Math.round(size * 100)}"`];
  if (r.bold ?? el.bold) props.push('b="1"'); if (r.italic ?? el.italic) props.push('i="1"'); if (r.underline ?? el.underline) props.push('u="sng"'); if (r.strike) props.push('strike="sngStrike"');
  if (r.sup === 'sup') props.push('baseline="30000"'); if (r.sup === 'sub') props.push('baseline="-25000"');
  props.push('dirty="0"');
  let inner = `<a:solidFill>${srgb(r.color || el.color || '#000000')}</a:solidFill><a:latin typeface="${X(r.font || el.font || 'Calibri')}"/>`;
  if (r.link && ctx) { const id = ctx.addRel({ type: REL.hyperlink, target: r.link, mode: 'External' }); inner += `<a:hlinkClick r:id="${id}"/>`; }
  return `<a:r><a:rPr ${props.join(' ')}>${inner}</a:rPr><a:t>${X(r.text)}</a:t></a:r>`;
}
function paragraphXml(el, p, ctx) {
  const level = p.level || 0, bullet = p.bullet;
  let ppr = `<a:pPr${level ? ` lvl="${level}"` : ''} algn="${ALGN[p.align || el.align] || 'l'}"`;
  if (bullet) ppr += ` marL="${emu(level * 28 + 22)}" indent="${emu(-22)}"`; else if (level) ppr += ` marL="${emu(level * 28)}" indent="0"`;
  ppr += '>';
  const lh = p.lineHeight || el.lineHeight; if (lh && lh !== 1.2) ppr += `<a:lnSpc><a:spcPct val="${Math.round(lh / 1.2 * 100000)}"/></a:lnSpc>`;
  if (p.spaceBefore) ppr += `<a:spcBef><a:spcPts val="${Math.round(p.spaceBefore * 100)}"/></a:spcBef>`;
  if (p.spaceAfter) ppr += `<a:spcAft><a:spcPts val="${Math.round(p.spaceAfter * 100)}"/></a:spcAft>`;
  if (!bullet) ppr += '<a:buNone/>';
  else if (AUTONUM[bullet]) ppr += `<a:buFont typeface="+mj-lt"/><a:buAutoNum type="${AUTONUM[bullet]}"/>`;
  else ppr += `<a:buFont typeface="Arial"/><a:buChar char="${X(bullet === true ? '•' : bullet)}"/>`;
  ppr += '</a:pPr>';
  const runs = p.runs.filter((r) => r.text).map((r) => runXml(el, r, ctx)).join('');
  return `<a:p>${ppr}${runs}<a:endParaRPr lang="en-US" sz="${Math.round((p.runs[0]?.size || el.size || 18) * 100)}" dirty="0"/></a:p>`;
}
export function txBodyXml(el, text, ctx, opts = {}) {
  const pad = emu(el.padding ?? 7.2);
  const fit = el.autofit === 'shrink' ? '<a:normAutofit/>' : el.autofit === 'grow' ? '<a:spAutoFit/>' : '';
  const paras = text && text.paragraphs && text.paragraphs.length ? text.paragraphs : [{ runs: [] }];
  return `<${opts.tag || 'p:txBody'}><a:bodyPr wrap="square" lIns="${pad}" tIns="${pad}" rIns="${pad}" bIns="${pad}" rtlCol="0" anchor="${ANCHOR[el.valign] || 't'}">${fit}</a:bodyPr><a:lstStyle/>${paras.map((p) => paragraphXml(el, p, ctx)).join('')}</${opts.tag || 'p:txBody'}>`;
}

function geomXml(el, isText) {
  if (!isText && el.shape === 'custom' && el.geom && el.geom.cmds) {
    const W = emu(el.w), H = emu(el.h), f = (v, s) => Math.round(v * s);
    let body = '';
    for (const c of el.geom.cmds) {
      if (c[0] === 'M') body += `<a:moveTo><a:pt x="${f(c[1], W)}" y="${f(c[2], H)}"/></a:moveTo>`;
      else if (c[0] === 'L') body += `<a:lnTo><a:pt x="${f(c[1], W)}" y="${f(c[2], H)}"/></a:lnTo>`;
      else if (c[0] === 'C') body += `<a:cubicBezTo><a:pt x="${f(c[1], W)}" y="${f(c[2], H)}"/><a:pt x="${f(c[3], W)}" y="${f(c[4], H)}"/><a:pt x="${f(c[5], W)}" y="${f(c[6], H)}"/></a:cubicBezTo>`;
      else if (c[0] === 'Q') body += `<a:quadBezTo><a:pt x="${f(c[1], W)}" y="${f(c[2], H)}"/><a:pt x="${f(c[3], W)}" y="${f(c[4], H)}"/></a:quadBezTo>`;
      else if (c[0] === 'A') body += `<a:arcTo wR="${f(c[1], W)}" hR="${f(c[2], H)}" stAng="${Math.round(c[3] * 60000)}" swAng="${Math.round(c[4] * 60000)}"/>`;
      else if (c[0] === 'Z') body += '<a:close/>';
    }
    return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${W}" h="${H}">${body}</a:path></a:pathLst></a:custGeom>`;
  }
  return `<a:prstGeom prst="${isText ? 'rect' : el.prst || prstFor(el.shape)}"><a:avLst/></a:prstGeom>`;
}
function spXml(el, ctx) {
  const id = ctx.nextId();
  const isText = el.type === 'text';
  const ph = isText && (el.ph === 'title' || el.ph === 'section') ? '<p:ph type="title"/>' : isText && el.ph === 'ctitle' ? '<p:ph type="ctrTitle"/>' : isText && el.ph === 'subtitle' ? '<p:ph type="subTitle" idx="1"/>' : isText && el.ph === 'body' ? `<p:ph idx="${++ctx.bodyIdx}"/>` : '';
  const name = isText ? (el.ph ? `${el.ph === 'body' ? 'Content Placeholder' : 'Title'} ${id}` : `TextBox ${id}`) : `${el.shape || 'Shape'} ${id}`;
  const fill = isText ? el.fill : el.fill;
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${X(el.name || name)}"${el.hidden ? ' hidden="1"' : ''}>${el.link ? `<a:hlinkClick r:id="${ctx.addRel({ type: REL.hyperlink, target: el.link, mode: 'External' })}"/>` : ''}</p:cNvPr><p:cNvSpPr${isText && !el.ph ? ' txBox="1"' : ''}/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr>${xfrm(el)}${geomXml(el, isText)}${fillXml(fill)}${lineXml(el.stroke)}${el.shadow ? shadowXml : ''}</p:spPr>${txBodyXml(el, el.text, ctx)}</p:sp>`;
}
function lineShapeXml(el, ctx) {
  const id = ctx.nextId();
  const ends = (el.arrowStart ? '<a:headEnd type="triangle" w="med" len="med"/>' : '') + (el.arrowEnd ? '<a:tailEnd type="triangle" w="med" len="med"/>' : '');
  return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="Connector ${id}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrm(el)}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>${lineXml(el.stroke, ends)}${el.shadow ? shadowXml : ''}</p:spPr></p:cxnSp>`;
}
function picXml(el, ctx) {
  const id = ctx.nextId(), src = ctx.assets[el.assetId];
  if (!src) return '';
  const rId = ctx.addMedia(src);
  const c = el.crop && (el.crop.l || el.crop.t || el.crop.r || el.crop.b) ? `<a:srcRect l="${Math.round((el.crop.l || 0) * 100000)}" t="${Math.round((el.crop.t || 0) * 100000)}" r="${Math.round((el.crop.r || 0) * 100000)}" b="${Math.round((el.crop.b || 0) * 100000)}"/>` : '';
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"${el.link ? '' : ''}>${el.link ? `<a:hlinkClick r:id="${ctx.addRel({ type: REL.hyperlink, target: el.link, mode: 'External' })}"/>` : ''}</p:cNvPr><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rId}"/>${c}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(el)}<a:prstGeom prst="${el.radius ? 'roundRect' : 'rect'}"><a:avLst/></a:prstGeom>${el.stroke ? lineXml(el.stroke) : ''}${el.shadow ? shadowXml : ''}</p:spPr></p:pic>`;
}
function tableXml(el, ctx) {
  const id = ctx.nextId(), { xs, ys } = tableGeometry(el), st = el.style || {};
  const bw = emu(st.borderWidth ?? 1), bc = st.borderColor;
  const ln = (side) => (bw > 0 && bc ? `<a:${side} w="${bw}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill>${srgb(bc)}</a:solidFill><a:prstDash val="solid"/></a:${side}>` : `<a:${side}><a:noFill/></a:${side}>`);
  let rows = '';
  el.rows.forEach((row, r) => {
    rows += `<a:tr h="${emu(ys[r + 1] - ys[r])}">`;
    row.forEach((cell, c) => {
      const cs = cellStyle(el, r, c);
      const pseudo = { font: cs.font, size: cs.size, color: cs.color, bold: cs.bold, italic: cs.italic, align: cs.align, valign: cs.valign, lineHeight: 1.2, padding: 5 };
      const text = cell.text && cell.text.paragraphs ? cell.text : { paragraphs: String(cell.text || '').split('\n').map((t) => ({ runs: t ? [{ text: t }] : [] })) };
      const body = `<a:txBody><a:bodyPr/><a:lstStyle/>${text.paragraphs.map((p) => paragraphXml(pseudo, p, ctx)).join('')}</a:txBody>`;
      rows += `<a:tc>${body}<a:tcPr marL="${emu(5)}" marR="${emu(5)}" marT="${emu(5)}" marB="${emu(5)}" anchor="${ANCHOR[cs.valign] || 'ctr'}">${ln('lnL')}${ln('lnR')}${ln('lnT')}${ln('lnB')}${cs.fill ? `<a:solidFill>${srgb(cs.fill)}</a:solidFill>` : '<a:noFill/>'}</a:tcPr></a:tc>`;
    });
    rows += '</a:tr>';
  });
  const grid = xs.slice(1).map((x, i) => `<a:gridCol w="${emu(x - xs[i])}"/>`).join('');
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(el.x)}" y="${emu(el.y)}"/><a:ext cx="${emu(el.w)}" cy="${emu(el.h)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="${el.headerRow ? 1 : 0}" bandRow="${el.bandRows ? 1 : 0}"/><a:tblGrid>${grid}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

export function chartPartXml(el, theme) {
  const t = el.chartType || 'column', isPie = /pie|doughnut/.test(t), scatter = t === 'scatter';
  const cats = el.categories || [], series = (el.series || []).filter((s) => s && s.values);
  const n = Math.max(cats.length, ...series.map((s) => s.values.length), 0);
  const themed = { ...el, themeColors: theme.accents };
  const txPr = `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${Math.round((el.size || 12) * 100)}"><a:solidFill>${srgb(el.color || '#404040')}</a:solidFill><a:latin typeface="${X(el.font || 'Calibri')}"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
  const strLit = (vals) => `<c:strLit><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${X(v)}</c:v></c:pt>`).join('')}</c:strLit>`;
  const numLit = (vals) => `<c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${+v || 0}</c:v></c:pt>`).join('')}</c:numLit>`;
  const dLbls = (pie) => (el.labels ? `<c:dLbls>${pie ? '<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/>' : '<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/>'}<c:showBubbleSize val="0"/></c:dLbls>` : '');
  let plot = '';
  if (isPie) {
    const s = series[0] || { name: 'Series 1', values: [] };
    const vals = Array.from({ length: n }, (_, i) => Math.max(0, +s.values[i] || 0));
    const dPts = vals.map((v, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill>${srgb(seriesColor(themed, i))}</a:solidFill></c:spPr></c:dPt>`).join('');
    plot = `<c:${t === 'doughnut' ? 'doughnutChart' : 'pieChart'}><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${X(s.name || 'Series 1')}</c:v></c:tx>${dPts}${dLbls(true)}<c:cat>${strLit(cats.slice(0, n))}</c:cat><c:val>${numLit(vals)}</c:val></c:ser>${dLbls(true)}${t === 'doughnut' ? '<c:firstSliceAng val="0"/><c:holeSize val="55"/>' : '<c:firstSliceAng val="0"/>'}</c:${t === 'doughnut' ? 'doughnutChart' : 'pieChart'}>`;
  } else if (scatter) {
    const xs = cats.map((c) => +c), useCats = xs.every((v) => Number.isFinite(v)) && cats.length;
    const xvals = useCats ? xs : (series[0] || { values: [] }).values.map((v) => +v || 0), ys = useCats ? series : series.slice(1);
    const sers = ys.map((s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${X(s.name || `Series ${i + 1}`)}</c:v></c:tx><c:spPr><a:ln><a:noFill/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="7"/><c:spPr><a:solidFill>${srgb(seriesColor(themed, i))}</a:solidFill></c:spPr></c:marker><c:xVal>${numLit(xvals.slice(0, s.values.length))}</c:xVal><c:yVal>${numLit(s.values)}</c:yVal><c:smooth val="0"/></c:ser>`).join('');
    plot = `<c:scatterChart><c:scatterStyle val="marker"/><c:varyColors val="0"/>${sers}<c:axId val="10"/><c:axId val="20"/></c:scatterChart><c:valAx><c:axId val="10"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="20"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx><c:valAx><c:axId val="20"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>${el.gridlines !== false ? '<c:majorGridlines/>' : ''}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="10"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`;
  } else {
    const bar = t === 'column' || t === 'bar', tag = bar ? 'barChart' : t === 'area' ? 'areaChart' : 'lineChart';
    const sers = series.map((s, i) => { const col = seriesColor(themed, i); const sp = bar || t === 'area' ? `<c:spPr><a:solidFill>${srgb(col)}</a:solidFill></c:spPr>` : `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill>${srgb(col)}</a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill>${srgb(col)}</a:solidFill></c:spPr></c:marker>`; return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${X(s.name || `Series ${i + 1}`)}</c:v></c:tx>${sp}${bar ? '<c:invertIfNegative val="0"/>' : ''}${dLbls(false)}<c:cat>${strLit(Array.from({ length: n }, (_, k) => cats[k] ?? ''))}</c:cat><c:val>${numLit(Array.from({ length: n }, (_, k) => s.values[k] ?? 0))}</c:val>${tag === 'lineChart' ? '<c:smooth val="0"/>' : ''}</c:ser>`; }).join('');
    plot = `<c:${tag}>${bar ? `<c:barDir val="${t === 'bar' ? 'bar' : 'col'}"/>` : ''}<c:grouping val="${t === 'area' ? 'standard' : bar ? 'clustered' : 'standard'}"/><c:varyColors val="0"/>${sers}${dLbls(false)}${bar ? '<c:gapWidth val="150"/>' : tag === 'lineChart' ? '<c:marker val="1"/>' : ''}<c:axId val="10"/><c:axId val="20"/></c:${tag}>`;
    plot += `<c:catAx><c:axId val="10"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${t === 'bar' ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${txPr}<c:crossAx val="20"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
    plot += `<c:valAx><c:axId val="20"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${t === 'bar' ? 'b' : 'l'}"/>${el.gridlines !== false ? '<c:majorGridlines/>' : ''}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${txPr}<c:crossAx val="10"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
  }
  const title = el.title ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${Math.round((el.size || 12) * 130)}" b="1"><a:solidFill>${srgb(el.color || '#404040')}</a:solidFill><a:latin typeface="${X(el.font || 'Calibri')}"/></a:defRPr></a:pPr><a:r><a:rPr lang="en-US" sz="${Math.round((el.size || 12) * 130)}" b="1"><a:solidFill>${srgb(el.color || '#404040')}</a:solidFill><a:latin typeface="${X(el.font || 'Calibri')}"/></a:rPr><a:t>${X(el.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` : '<c:autoTitleDeleted val="1"/>';
  const legend = el.legend !== false ? `<c:legend><c:legendPos val="${isPie ? 'r' : 'b'}"/><c:overlay val="0"/>${txPr}</c:legend>` : '';
  const bg = el.fill && el.fill.color ? `<c:spPr><a:solidFill>${srgb(el.fill.color)}</a:solidFill></c:spPr>` : '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>';
  return XMLH + `<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>${bg}${txPr}</c:chartSpace>`;
}
function chartFrameXml(el, ctx) {
  const id = ctx.nextId(), rId = ctx.addChart(el);
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Chart ${id}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(el.x)}" y="${emu(el.y)}"/><a:ext cx="${emu(el.w)}" cy="${emu(el.h)}"/></p:xfrm><a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" r:id="${rId}"/></a:graphicData></a:graphic></p:graphicFrame>`;
}
function groupXml(el, ctx) {
  const id = ctx.nextId();
  return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="Group ${id}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${emu(el.x)}" y="${emu(el.y)}"/><a:ext cx="${emu(el.w)}" cy="${emu(el.h)}"/><a:chOff x="${emu(el.x)}" y="${emu(el.y)}"/><a:chExt cx="${emu(el.w)}" cy="${emu(el.h)}"/></a:xfrm></p:grpSpPr>${el.children.map((c) => elementXml(c, ctx)).join('')}</p:grpSp>`;
}
export function elementXml(el, ctx) {
  if (el.ph === 'picture') return '';
  switch (el.type) {
    case 'text': case 'shape': return spXml(el, ctx);
    case 'line': return lineShapeXml(el, ctx);
    case 'image': return picXml(el, ctx);
    case 'table': return tableXml(el, ctx);
    case 'chart': return chartFrameXml(el, ctx);
    case 'group': return groupXml(el, ctx);
    default: return '';
  }
}

const TRANS = { fade: '<p:fade/>', push: (d) => `<p:push dir="${d}"/>`, wipe: (d) => `<p:wipe dir="${d}"/>`, cover: (d) => `<p:cover dir="${d}"/>`, zoom: '<p:zoom/>', split: '<p:split orient="horz" dir="out"/>', dissolve: '<p:dissolve/>', cut: '<p:cut/>', random: '<p:random/>', wheel: '<p:wheel spokes="4"/>', circle: '<p:circle/>', newsflash: '<p:newsflash/>' };
const DIR = { left: 'l', right: 'r', up: 'u', down: 'd' };
function transitionXml(slide) {
  const t = slide.transition || {}, adv = slide.advance != null && slide.advance > 0 ? ` advTm="${Math.round(slide.advance * 1000)}"` : '';
  if ((!t.type || t.type === 'none') && !adv) return '';
  const spd = (t.duration || 0.7) < 0.5 ? 'fast' : (t.duration || 0.7) > 1 ? 'slow' : 'med';
  let inner = TRANS[t.type] || '';
  if (typeof inner === 'function') inner = inner(DIR[t.dir] || 'l');
  return `<p:transition spd="${spd}"${adv}>${inner}</p:transition>`;
}
function timingXml(slide, idMap) {
  const anims = [];
  const walk = (list) => { for (const e of list) { if (e.anim && e.anim.type && e.anim.type !== 'none' && idMap.has(e.id)) anims.push(e); if (e.type === 'group') walk(e.children); } };
  walk(slide.elements);
  if (!anims.length) return '';
  anims.sort((a, b) => (a.anim.order || 0) - (b.anim.order || 0));
  let id = 3; const steps = [];
  for (const e of anims) {
    const a = e.anim, spid = idMap.get(e.id), dur = Math.round((a.duration || 0.5) * 1000), delay = Math.round((a.delay || 0) * 1000);
    const tgt = `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>`;
    const set = `<p:set><p:cBhvr><p:cTn id="${id++}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>${tgt}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`;
    const num = (attr, from, to) => `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${id++}" dur="${dur}" fill="hold"/>${tgt}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="${from}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${to}"/></p:val></p:tav></p:tavLst></p:anim>`;
    let preset = 10, sub = 0, body = '';
    if (a.type === 'fade') body = `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${id++}" dur="${dur}"/>${tgt}</p:cBhvr></p:animEffect>`;
    else if (a.type === 'fly') { preset = 2; sub = { left: 8, right: 2, up: 1, down: 4 }[a.dir] || 8; const d = a.dir || 'left'; body = num('ppt_x', d === 'left' ? '0-#ppt_w/2' : d === 'right' ? '1+#ppt_w/2' : '#ppt_x', '#ppt_x') + num('ppt_y', d === 'up' ? '0-#ppt_h/2' : d === 'down' ? '1+#ppt_h/2' : '#ppt_y', '#ppt_y'); }
    else if (a.type === 'zoom') { preset = 23; sub = 16; body = num('ppt_w', '0', '#ppt_w') + num('ppt_h', '0', '#ppt_h') + `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${id++}" dur="${dur}"/>${tgt}</p:cBhvr></p:animEffect>`; }
    else if (a.type === 'wipe') { preset = 22; sub = { left: 8, right: 2, up: 1, down: 4 }[a.dir] || 8; body = `<p:animEffect transition="in" filter="wipe(${a.dir || 'left'})"><p:cBhvr><p:cTn id="${id++}" dur="${dur}"/>${tgt}</p:cBhvr></p:animEffect>`; }
    else { preset = 1; body = ''; }
    const eff = `<p:par><p:cTn id="${id++}" presetID="${preset}" presetClass="entr" presetSubtype="${sub}" fill="hold" nodeType="clickEffect"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst>${set}${body}</p:childTnLst></p:cTn></p:par>`;
    steps.push(`<p:par><p:cTn id="${id++}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${id++}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${eff}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`);
  }
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${steps.join('')}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst><p:bldLst>${anims.map((e) => `<p:bldP spid="${idMap.get(e.id)}" grpId="0"/>`).join('')}</p:bldLst></p:timing>`;
}

function bgXml(pres, slide) {
  const bg = slideBackground(pres, slide);
  if (bg.type === 'image' && pres.assets[bg.assetId]) return null; // handled by caller (needs rel)
  return `<p:bg><p:bgPr>${fillXml(bg)}<a:effectLst/></p:bgPr></p:bg>`;
}

function themeXml(theme, name = 'OfficePPT') {
  const bgc = theme.bg.type === 'solid' ? theme.bg.color : theme.bg.from;
  const acc = theme.accents;
  const c = (v) => `<a:srgbClr val="${hex6(v)}"/>`;
  return XMLH + `<a:theme xmlns:a="${NS_A}" name="${X(name)}"><a:themeElements><a:clrScheme name="${X(name)}"><a:dk1>${c(theme.text)}</a:dk1><a:lt1>${c(bgc)}</a:lt1><a:dk2>${c(theme.heading)}</a:dk2><a:lt2>${c('#E7E6E6')}</a:lt2><a:accent1>${c(acc[0])}</a:accent1><a:accent2>${c(acc[1])}</a:accent2><a:accent3>${c(acc[2])}</a:accent3><a:accent4>${c(acc[3])}</a:accent4><a:accent5>${c(acc[4])}</a:accent5><a:accent6>${c(acc[5])}</a:accent6><a:hlink>${c('#0563C1')}</a:hlink><a:folHlink>${c('#954F72')}</a:folHlink></a:clrScheme><a:fontScheme name="${X(name)}"><a:majorFont><a:latin typeface="${X(theme.fonts.heading)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${X(theme.fonts.body)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
}
const spTreeHead = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const NSDECL = `xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"`;
function masterXml(pres) {
  const t = pres.theme, W = pres.width, H = pres.height, m = W * 0.05;
  const ts = placeholderStyle('title', t), bs = placeholderStyle('body', t);
  const phSp = (id, name, ph, x, y, w, h, st) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US" sz="${st.size * 100}"/></a:p></p:txBody></p:sp>`;
  const tree = spTreeHead + phSp(2, 'Title Placeholder 1', '<p:ph type="title"/>', m, H * 0.05, W - 2 * m, H * 0.17, ts) + phSp(3, 'Text Placeholder 2', '<p:ph type="body" idx="1"/>', m, H * 0.25, W - 2 * m, H * 0.66, bs);
  const lvl = (i, size, bullet) => `<a:lvl${i}pPr marL="${emu((i - 1) * 28 + 22)}" indent="${emu(-22)}" algn="l">${bullet ? '<a:buFont typeface="Arial"/><a:buChar char="•"/>' : '<a:buNone/>'}<a:defRPr sz="${size * 100}"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl${i}pPr>`;
  return XMLH + `<p:sldMaster ${NSDECL}><p:cSld><p:bg><p:bgPr>${fillXml(t.bg.type === 'image' ? { type: 'solid', color: '#FFFFFF' } : t.bg)}<a:effectLst/></p:bgPr></p:bg><p:spTree>${tree}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:buNone/><a:defRPr sz="${ts.size * 100}"><a:solidFill><a:schemeClr val="dk2"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle>${[1, 2, 3, 4, 5].map((i) => lvl(i, Math.max(12, bs.size - (i - 1) * 2), true)).join('')}</p:bodyStyle><p:otherStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr><a:lvl1pPr><a:defRPr sz="1800"><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;
}
function layoutXml(pres) {
  const W = pres.width, H = pres.height, m = W * 0.05;
  const phSp = (id, name, ph, x, y, w, h) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`;
  return XMLH + `<p:sldLayout ${NSDECL} type="obj" preserve="1"><p:cSld name="Title and Content"><p:spTree>${spTreeHead}${phSp(2, 'Title 1', '<p:ph type="title"/>', m, H * 0.05, W - 2 * m, H * 0.17)}${phSp(3, 'Content Placeholder 2', '<p:ph idx="1"/>', m, H * 0.25, W - 2 * m, H * 0.66)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}
function notesMasterXml() {
  return XMLH + `<p:notesMaster ${NSDECL}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${spTreeHead}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:notesStyle><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>`;
}
function notesSlideXml(notes) {
  const paras = String(notes || '').split(/\r?\n/).map((l) => `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${X(l)}</a:t></a:r></a:p>`).join('');
  return XMLH + `<p:notes ${NSDECL}><p:cSld><p:spTree>${spTreeHead}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}

/** Build the PPTX package. Returns Uint8Array. */
export async function writePptx(pres) {
  const files = [], overrides = [], media = new Map(); // dataUrl → {name}
  let mediaN = 0, chartN = 0;
  const add = (name, data) => files.push({ name, data });
  const addMediaFile = (src) => {
    if (media.has(src)) return media.get(src);
    const p = dataUrlParts(src); if (!p) return null;
    const name = `image${++mediaN}.${mimeExt(p.mime)}`;
    const bytes = p.base64 ? base64ToBytes(p.data) : new TextEncoder().encode(decodeURIComponent(p.data));
    files.push({ name: `ppt/media/${name}`, data: bytes, store: /jpe?g|png|gif/.test(p.mime) });
    const rec = { name, mime: p.mime }; media.set(src, rec); return rec;
  };
  const slideXmls = [];
  pres.slides.forEach((slide, si) => {
    const n = si + 1, slideRels = [{ type: REL.layout, target: '../slideLayouts/slideLayout1.xml' }];
    let idc = 1; const idMap = new Map();
    const ctx = {
      assets: pres.assets, bodyIdx: 0,
      nextId: () => ++idc,
      addRel: (r) => { slideRels.push(r); return 'rId' + slideRels.length; },
      addMedia: (src) => { const rec = addMediaFile(src); if (!rec) return ''; return ctx.addRel({ type: REL.image, target: `../media/${rec.name}` }); },
      addChart: (el) => { const cn = ++chartN; add(`ppt/charts/chart${cn}.xml`, chartPartXml(el, pres.theme)); overrides.push([`/ppt/charts/chart${cn}.xml`, CT.chart]); return ctx.addRel({ type: REL.chart, target: `../charts/chart${cn}.xml` }); },
    };
    let tree = '';
    for (const el of slide.elements) {
      if (el.ph === 'picture') continue;
      if (el.ph && el.type === 'text' && isTextEmpty(el.text)) continue;
      const before = idc + 1; tree += elementXml(el, ctx); idMap.set(el.id, before);
    }
    let bg = bgXml(pres, slide);
    if (bg === null) { const b = slideBackground(pres, slide); const rId = ctx.addMedia(pres.assets[b.assetId]); bg = `<p:bg><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>`; }
    let footer = '';
    const f = pres.footer;
    if (f && (f.text || f.showNumber || f.showDate)) {
      const mk = (text, x, align) => { const el = { type: 'text', x, y: pres.height - 24, w: pres.width / 3 - 24, h: 20, rotation: 0, text: { paragraphs: [{ runs: [{ text }] }] }, font: pres.theme.fonts.body, size: 10, color: pres.theme.text, align, valign: 'middle', padding: 2, lineHeight: 1.2 }; return spXml(el, ctx); };
      if (f.showDate) footer += mk(f.dateText || new Date().toLocaleDateString(), 12, 'left');
      if (f.text) footer += mk(f.text, pres.width / 3 + 12, 'center');
      if (f.showNumber) footer += mk(String(n), (pres.width * 2) / 3 + 12, 'right');
    }
    if (slide.notes && slide.notes.trim()) {
      add(`ppt/notesSlides/notesSlide${n}.xml`, notesSlideXml(slide.notes));
      add(`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`, rels([{ type: REL.notesMaster, target: '../notesMasters/notesMaster1.xml' }, { type: REL.slide, target: `../slides/slide${n}.xml` }]));
      overrides.push([`/ppt/notesSlides/notesSlide${n}.xml`, CT.notes]);
      slideRels.push({ type: REL.notes, target: `../notesSlides/notesSlide${n}.xml` });
    }
    const xml = XMLH + `<p:sld ${NSDECL}${slide.hidden ? ' show="0"' : ''}><p:cSld>${bg}<p:spTree>${spTreeHead}${tree}${footer}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${transitionXml(slide)}${timingXml(slide, idMap)}</p:sld>`;
    add(`ppt/slides/slide${n}.xml`, xml);
    add(`ppt/slides/_rels/slide${n}.xml.rels`, rels(slideRels));
    overrides.push([`/ppt/slides/slide${n}.xml`, CT.slide]);
    slideXmls.push(n);
  });

  const sw = emu(pres.width), sh = emu(pres.height);
  const presRels = [{ type: REL.master, target: 'slideMasters/slideMaster1.xml' }, { type: REL.notesMaster, target: 'notesMasters/notesMaster1.xml' }, ...slideXmls.map((n) => ({ type: REL.slide, target: `slides/slide${n}.xml` })), { type: REL.presProps, target: 'presProps.xml' }, { type: REL.viewProps, target: 'viewProps.xml' }, { type: REL.theme, target: 'theme/theme1.xml' }, { type: REL.tableStyles, target: 'tableStyles.xml' }];
  add('ppt/presentation.xml', XMLH + `<p:presentation ${NSDECL} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst><p:sldIdLst>${slideXmls.map((n, i) => `<p:sldId id="${256 + i}" r:id="rId${3 + i}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${sw}" cy="${sh}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr></p:defaultTextStyle></p:presentation>`);
  add('ppt/_rels/presentation.xml.rels', rels(presRels));
  add('ppt/presProps.xml', XMLH + `<p:presentationPr ${NSDECL}/>`);
  add('ppt/viewProps.xml', XMLH + `<p:viewPr ${NSDECL}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:slideViewPr><p:cSldViewPr><p:cViewPr varScale="1"><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr></p:cSldViewPr></p:slideViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`);
  add('ppt/tableStyles.xml', XMLH + `<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`);
  add('ppt/theme/theme1.xml', themeXml(pres.theme));
  add('ppt/theme/theme2.xml', themeXml(pres.theme, 'OfficePPT Notes'));
  add('ppt/slideMasters/slideMaster1.xml', masterXml(pres));
  add('ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([{ type: REL.layout, target: '../slideLayouts/slideLayout1.xml' }, { type: REL.theme, target: '../theme/theme1.xml' }]));
  add('ppt/slideLayouts/slideLayout1.xml', layoutXml(pres));
  add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([{ type: REL.master, target: '../slideMasters/slideMaster1.xml' }]));
  add('ppt/notesMasters/notesMaster1.xml', notesMasterXml());
  add('ppt/notesMasters/_rels/notesMaster1.xml.rels', rels([{ type: REL.theme, target: '../theme/theme2.xml' }]));
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  add('docProps/core.xml', XMLH + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${X(pres.title)}</dc:title><dc:creator>OfficePPT</dc:creator><cp:lastModifiedBy>OfficePPT</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  add('docProps/app.xml', XMLH + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>OfficePPT</Application><Slides>${pres.slides.length}</Slides><PresentationFormat>Custom</PresentationFormat><AppVersion>1.0000</AppVersion></Properties>`);
  add('_rels/.rels', rels([{ type: `${NS_R}/officeDocument`, target: 'ppt/presentation.xml' }, { type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', target: 'docProps/core.xml' }, { type: `${NS_R}/extended-properties`, target: 'docProps/app.xml' }]));
  const exts = new Set(['png', 'jpeg', 'jpg', 'gif', 'svg', 'webp', 'bmp', 'tiff', 'emf', 'wmf']);
  const defaults = [['rels', 'application/vnd.openxmlformats-package.relationships+xml'], ['xml', 'application/xml'], ...[...exts].map((e) => [e, e === 'svg' ? 'image/svg+xml' : e === 'jpg' ? 'image/jpeg' : e === 'emf' ? 'image/x-emf' : e === 'wmf' ? 'image/x-wmf' : `image/${e}`])];
  const ov = [['/ppt/presentation.xml', CT.pres], ['/ppt/presProps.xml', CT.presProps], ['/ppt/viewProps.xml', CT.viewProps], ['/ppt/tableStyles.xml', CT.tableStyles], ['/ppt/theme/theme1.xml', CT.theme], ['/ppt/theme/theme2.xml', CT.theme], ['/ppt/slideMasters/slideMaster1.xml', CT.master], ['/ppt/slideLayouts/slideLayout1.xml', CT.layout], ['/ppt/notesMasters/notesMaster1.xml', CT.notesMaster], ['/docProps/core.xml', CT.core], ['/docProps/app.xml', CT.app], ...overrides];
  files.unshift({ name: '[Content_Types].xml', data: XMLH + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaults.map(([e, t]) => `<Default Extension="${e}" ContentType="${t}"/>`).join('')}${ov.map(([p, t]) => `<Override PartName="${p}" ContentType="${t}"/>`).join('')}</Types>` });
  return writeZip(files);
}
