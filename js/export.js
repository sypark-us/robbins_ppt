// Exports: PNG/JPEG/SVG images, PDF (rasterised pages), standalone HTML slide show, print view.
import { slideToSvg } from './svg.js';
import { canvasMeasure } from './textlayout.js';
import { writeZip } from './zip.js';
import { escapeHtml, bytesToBase64 } from './util.js';

export const svgOf = (pres, slide, opts = {}) => slideToSvg(pres, slide, { measure: canvasMeasure, ...opts });

export async function svgToCanvas(svg, w, h, scale = 2, bg = null) {
  const canvas = document.createElement('canvas'); canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('SVG render failed')); i.src = url; });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}
const canvasBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));
export async function slideToImage(pres, slide, type = 'image/png', scale = 2, quality = 0.92) {
  const canvas = await svgToCanvas(svgOf(pres, slide), pres.width, pres.height, scale, type === 'image/jpeg' ? '#ffffff' : null);
  return new Uint8Array(await (await canvasBlob(canvas, type, quality)).arrayBuffer());
}
export async function exportImages(pres, type = 'image/png', scale = 2, onProgress) {
  const ext = type === 'image/jpeg' ? 'jpg' : 'png', entries = [];
  for (let i = 0; i < pres.slides.length; i++) { onProgress?.(i, pres.slides.length); entries.push({ name: `slide${String(i + 1).padStart(2, '0')}.${ext}`, data: await slideToImage(pres, pres.slides[i], type, scale), store: true }); }
  return entries.length === 1 ? { bytes: entries[0].data, name: entries[0].name, mime: type } : { bytes: await writeZip(entries), name: 'slides.zip', mime: 'application/zip' };
}
export async function exportSvgs(pres) {
  const entries = pres.slides.map((s, i) => ({ name: `slide${String(i + 1).padStart(2, '0')}.svg`, data: svgOf(pres, s, { index: i }) }));
  return entries.length === 1 ? { bytes: new TextEncoder().encode(entries[0].data), name: entries[0].name, mime: 'image/svg+xml' } : { bytes: await writeZip(entries), name: 'slides-svg.zip', mime: 'application/zip' };
}

/** Minimal PDF writer: one JPEG image per page, page size = slide size in points. */
export async function exportPdf(pres, opts = {}) {
  const scale = opts.scale || 2, quality = opts.quality || 0.9, W = pres.width, H = pres.height;
  const objects = []; const add = (s) => { objects.push(s); return objects.length; };
  const enc = new TextEncoder();
  const pageIds = [], imgs = [];
  const skip = opts.skipHidden !== false;
  const slides = pres.slides.filter((s) => !(skip && s.hidden));
  for (let i = 0; i < slides.length; i++) {
    opts.onProgress?.(i, slides.length);
    const canvas = await svgToCanvas(svgOf(pres, slides[i], { index: pres.slides.indexOf(slides[i]), noLinks: true }), W, H, scale, '#ffffff');
    const jpg = new Uint8Array(await (await canvasBlob(canvas, 'image/jpeg', quality)).arrayBuffer());
    imgs.push({ jpg, w: canvas.width, h: canvas.height });
  }
  const catalogId = 1, pagesId = 2; objects.push(null, null); // placeholders
  let infoNotes = '';
  imgs.forEach((im, i) => {
    const imgId = add({ head: `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpg.length} >>`, stream: im.jpg });
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    const contentId = add({ head: `<< /Length ${content.length} >>`, stream: enc.encode(content) });
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const infoId = add(`<< /Title (${pdfString(pres.title)}) /Producer (RobbinsPPT) /Creator (RobbinsPPT) >>`);
  void infoNotes;
  const parts = [enc.encode('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')]; let offset = parts[0].length; const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(offset);
    const head = enc.encode(`${i + 1} 0 obj\n${typeof o === 'string' ? o : o.head}\n`); parts.push(head); offset += head.length;
    if (typeof o !== 'string') { const s1 = enc.encode('stream\n'); parts.push(s1, o.stream); const s2 = enc.encode('\nendstream\n'); parts.push(s2); offset += s1.length + o.stream.length + s2.length; }
    const tail = enc.encode('endobj\n'); parts.push(tail); offset += tail.length;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  parts.push(enc.encode(xref));
  const total = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(total); let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}
const pdfString = (s) => String(s || '').replace(/[\\()]/g, (m) => '\\' + m).replace(/[^\x20-\x7e]/g, '?');

/** Standalone HTML slide show: inline SVG per slide, keyboard/click navigation, notes toggle. */
export function exportHtml(pres) {
  const slides = pres.slides.filter((s) => !s.hidden).map((s, i) => ({ svg: svgOf(pres, s, { index: pres.slides.indexOf(s) }), notes: s.notes || '', transition: s.transition || { type: 'none' } }));
  const W = pres.width, H = pres.height;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(pres.title)}</title>
<style>html,body{margin:0;height:100%;background:#111;color:#eee;font-family:system-ui,sans-serif;overflow:hidden}#stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}.slide{position:absolute;width:${W}px;height:${H}px;transform-origin:center;transition:opacity .5s,transform .5s;opacity:0;pointer-events:none}.slide.cur{opacity:1;pointer-events:auto}.slide svg{display:block;width:100%;height:100%}#notes{position:fixed;left:0;right:0;bottom:0;max-height:30%;overflow:auto;background:#222;padding:10px 16px;font-size:15px;white-space:pre-wrap;display:none;border-top:1px solid #444}#notes.on{display:block}#num{position:fixed;right:12px;bottom:8px;font-size:12px;color:#888}#help{position:fixed;left:12px;bottom:8px;font-size:12px;color:#666}@media print{html,body{background:#fff;overflow:visible;height:auto}#stage{position:static;display:block}.slide{position:static;opacity:1;transform:none!important;page-break-after:always;width:100%;height:auto}#notes,#num,#help{display:none!important}}</style></head>
<body><div id="stage">${slides.map((s, i) => `<div class="slide${i === 0 ? ' cur' : ''}" data-i="${i}">${s.svg}</div>`).join('')}</div><div id="notes"></div><div id="num"></div><div id="help">← → navigate · N notes · F fullscreen</div>
<script>const notes=${JSON.stringify(slides.map((s) => s.notes))};const W=${W},H=${H};let i=0;const S=[...document.querySelectorAll('.slide')];function fit(){const z=Math.min(innerWidth/W,innerHeight/H);S.forEach(s=>{s.style.transform='scale('+z+')';});}function go(n){n=Math.max(0,Math.min(S.length-1,n));S[i].classList.remove('cur');i=n;S[i].classList.add('cur');document.getElementById('num').textContent=(i+1)+' / '+S.length;document.getElementById('notes').textContent=notes[i]||'';}addEventListener('resize',fit);fit();go(0);addEventListener('keydown',e=>{if(['ArrowRight','ArrowDown','PageDown',' ','Enter'].includes(e.key))go(i+1);else if(['ArrowLeft','ArrowUp','PageUp','Backspace'].includes(e.key))go(i-1);else if(e.key==='Home')go(0);else if(e.key==='End')go(S.length-1);else if(e.key.toLowerCase()==='n')document.getElementById('notes').classList.toggle('on');else if(e.key.toLowerCase()==='f')document.documentElement.requestFullscreen?.();});document.getElementById('stage').addEventListener('click',e=>{if(e.target.closest('a'))return;go(e.clientX<innerWidth/4?i-1:i+1);});</script></body></html>`;
}

export function printSlides(pres, opts = {}) {
  const w = window.open('', '_blank'); if (!w) throw new Error('Pop-up blocked');
  const slides = pres.slides.filter((s) => !s.hidden);
  const perPage = opts.perPage || 1, withNotes = !!opts.notes;
  const cells = slides.map((s, i) => `<div class="cell"><div class="img">${svgOf(pres, s, { index: pres.slides.indexOf(s) })}</div>${withNotes ? `<div class="notes">${escapeHtml(s.notes || '')}</div>` : ''}<div class="n">${pres.slides.indexOf(s) + 1}</div></div>`);
  const pages = []; for (let i = 0; i < cells.length; i += perPage) pages.push(`<div class="page">${cells.slice(i, i + perPage).join('')}</div>`);
  const land = perPage === 1 && !withNotes;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(pres.title)}</title><style>@page{size:${land ? 'landscape' : 'portrait'};margin:12mm}body{margin:0;font-family:system-ui,sans-serif}.page{page-break-after:always;display:grid;gap:8mm;grid-template-columns:${perPage >= 4 ? '1fr 1fr' : '1fr'};align-content:start}.cell{position:relative}.img svg{width:100%;height:auto;border:1px solid #ccc;display:block}.notes{white-space:pre-wrap;font-size:11pt;margin-top:4mm;min-height:${withNotes ? '40mm' : '0'}}.n{position:absolute;right:0;top:-5mm;font-size:9pt;color:#888}</style></head><body>${pages.join('')}<script>setTimeout(()=>{print();},300)</script></body></html>`);
  w.document.close();
}
export { bytesToBase64 };
