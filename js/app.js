// Application controller: document state, history, commands, file I/O, clipboard, autosave.
import { uid, clone, clamp, boundsOf, unionBounds, downloadBytes, readFileAsBytes, readFileAsDataUrl, loadImage, debounce, dataUrlParts, FONTS } from './util.js';
import * as M from './model.js';
import { Editor } from './editor.js';
import { UI } from './ui.js';
import { Show } from './show.js';
import { writePptx } from './pptx-write.js';
import { readPptx } from './pptx-read.js';
import { exportPdf, exportImages, exportSvgs, exportHtml, printSlides } from './export.js';
import { shapeInset } from './shapes.js';
import { chartDataFromGrid } from './charts.js';

const DB = 'robbinsppt', STORE = 'docs';
function idb() { return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbGet(key) { try { const db = await idb(); return await new Promise((res, rej) => { const t = db.transaction(STORE).objectStore(STORE).get(key); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); } catch { return null; } }
async function idbSet(key, val) { try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite').objectStore(STORE).put(val, key); t.onsuccess = res; t.onerror = () => rej(t.error); }); } catch { /* ignore */ } }

export class App {
  constructor() {
    this.pres = M.newPresentation(); this.history = new M.History(); this.history.reset(this.pres);
    this.slideIndex = 0; this.clipboard = null; this.fileHandle = null; this.fileName = null; this.dirty = false;
    this.editor = new Editor(this, document.getElementById('canvasArea'));
    this.ui = new UI(this);
    this.show = new Show(this);
    this.autosave = debounce(() => idbSet('autosave', { json: M.serialize(this.pres), index: this.slideIndex, name: this.fileName, t: Date.now() }), 800);
    this.thumbRefresh = debounce(() => this.ui.renderThumbs(), 150);
    this.M = M;
  }
  get slide() { return this.pres.slides[this.slideIndex]; }
  async init() {
    const params = new URLSearchParams(location.search);
    if (params.has('demo')) this.load(M.demoPresentation(), { name: null });
    else {
      const saved = await idbGet('autosave');
      if (saved && saved.json) { try { this.load(M.deserialize(saved.json), { name: saved.name, index: saved.index, silent: true }); this.ui.toast('Restored your last session'); } catch { this.load(M.newPresentation()); } }
      else this.load(M.newPresentation());
    }
    this.editor.fitZoom();
    this.ui.bindGlobal();
    window.addEventListener('beforeunload', (e) => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } });
    return this;
  }
  load(pres, opts = {}) {
    this.pres = pres; this.history.reset(pres); this.slideIndex = clamp(opts.index || 0, 0, pres.slides.length - 1);
    this.fileName = opts.name ?? null; if (!opts.keepHandle) this.fileHandle = null; this.dirty = false;
    this.editor.selection = []; this.editor.render(); this.editor.fitZoom();
    this.ui.renderThumbs(); this.ui.refreshAll(); this.ui.setTitle();
    if (!opts.silent) this.autosave();
  }
  commit(label = '') {
    void label;
    if (this.history.commit(this.pres)) { this.dirty = true; this.ui.setTitle(); }
    this.autosave(); this.thumbRefresh(); this.ui.updateUndo();
  }
  /** Call after changing the model without going through commit (e.g. live typing). */
  textChanged() { this.thumbRefresh(); this.autosave(); this.dirty = true; }
  undo() { const p = this.history.undo(); if (!p) return; this.pres = p; this.afterHistory(); }
  redo() { const p = this.history.redo(); if (!p) return; this.pres = p; this.afterHistory(); }
  afterHistory() { this.slideIndex = clamp(this.slideIndex, 0, this.pres.slides.length - 1); this.editor.render(); this.ui.renderThumbs(); this.ui.refreshAll(); this.autosave(); this.ui.updateUndo(); this.dirty = true; }
  refresh() { this.editor.render(); this.ui.renderThumbs(); this.ui.refreshAll(); }
  selectionChanged() { this.ui.updateToolbar(); this.ui.updateProps(); }
  gotoSlide(i, opts = {}) {
    i = clamp(i, 0, this.pres.slides.length - 1);
    if (i === this.slideIndex && !opts.force) return;
    if (this.editor.editing) this.editor.endTextEdit(true);
    this.slideIndex = i; this.editor.selection = []; this.editor.render(); this.ui.refreshAll();
  }

  // --- slides ---------------------------------------------------------------------------------
  newSlide(layout, at) {
    const cur = this.slide;
    if (!layout) layout = cur.layout === 'title' ? 'titleContent' : cur.layout === 'blank' ? 'blank' : cur.layout === 'sectionHeader' ? 'titleContent' : cur.layout || 'titleContent';
    const s = M.makeSlide(this.pres, layout); s.transition = clone(cur.transition);
    const idx = at ?? this.slideIndex + 1; this.pres.slides.splice(idx, 0, s); this.commit('New slide'); this.gotoSlide(idx, { force: true }); this.ui.renderThumbs();
    return s;
  }
  duplicateSlide(indices = [this.slideIndex]) {
    const copies = indices.sort((a, b) => a - b).map((i) => { const c = clone(this.pres.slides[i]); c.id = uid('s'); M.forEachElement(c, (e) => { e.id = uid(); }); return c; });
    const at = Math.max(...indices) + 1; this.pres.slides.splice(at, 0, ...copies); this.commit('Duplicate slide'); this.gotoSlide(at, { force: true }); this.ui.renderThumbs();
  }
  deleteSlides(indices = [this.slideIndex]) {
    const set = new Set(indices); if (set.size >= this.pres.slides.length) { this.pres.slides = [M.makeSlide(this.pres, 'title')]; }
    else this.pres.slides = this.pres.slides.filter((_, i) => !set.has(i));
    this.commit('Delete slide'); this.gotoSlide(Math.min(Math.min(...indices), this.pres.slides.length - 1), { force: true }); this.ui.renderThumbs();
  }
  moveSlides(indices, to) {
    const moving = indices.map((i) => this.pres.slides[i]); const rest = this.pres.slides.filter((_, i) => !indices.includes(i));
    const before = indices.filter((i) => i < to).length; rest.splice(to - before, 0, ...moving); this.pres.slides = rest;
    this.commit('Move slide'); this.gotoSlide(this.pres.slides.indexOf(moving[0]), { force: true }); this.ui.renderThumbs();
  }
  setLayout(layout, indices = [this.slideIndex]) { for (const i of indices) M.applyLayout(this.pres, this.pres.slides[i], layout); this.commit('Layout'); this.refresh(); }
  setBackground(bg, all = false) { for (const s of all ? this.pres.slides : [this.slide]) s.background = bg ? clone(bg) : null; this.commit('Background'); this.refresh(); }
  setTheme(name) { M.applyTheme(this.pres, M.themeByName(name)); this.commit('Theme'); this.refresh(); }
  setSlideSize(key) {
    const [w, h] = M.SLIDE_SIZES[key] || M.SLIDE_SIZES['16:9']; const sx = w / this.pres.width, sy = h / this.pres.height;
    for (const s of this.pres.slides) M.forEachElement(s, (e) => { if (e.type === 'group') return; M.resizeElement(e, e.x * sx, e.y * sy, e.w * sx, e.h * sy); });
    for (const s of this.pres.slides) for (const g of s.elements) if (g.type === 'group') { const b = unionBounds(g.children.map(boundsOf)); Object.assign(g, b); }
    this.pres.width = w; this.pres.height = h; this.commit('Slide size'); this.editor.fitZoom(); this.refresh();
  }
  setTransition(t, all = false) { for (const s of all ? this.pres.slides : [this.slide]) s.transition = { ...s.transition, ...t }; this.commit('Transition'); this.ui.refreshAll(); this.ui.renderThumbs(); }

  // --- elements ---------------------------------------------------------------------------------
  addElement(el, opts = {}) { this.slide.elements.push(el); this.commit('Insert'); this.editor.render(); this.editor.select(el.id); if (opts.edit && (el.type === 'text')) this.editor.startTextEdit(el, null, { selectAll: true }); return el; }
  deleteSelected() {
    const ids = new Set(this.editor.selection); if (!ids.size) return;
    this.slide.elements = this.slide.elements.filter((e) => !ids.has(e.id) || e.locked); this.editor.selection = []; this.commit('Delete'); this.editor.render(); this.selectionChanged();
  }
  /** Set props on all selected (or given) elements and commit. */
  setProps(props, els = this.editor.selected, label = 'Format') {
    for (const el of els) for (const [k, v] of Object.entries(props)) { if (typeof v === 'function') el[k] = v(el[k], el); else el[k] = v; }
    this.commit(label); this.editor.render(); this.selectionChanged();
  }
  insertShape(shape) { this.editor.pendingInsert = { type: 'shape', shape, w: 160, h: shape === 'ellipse' || /star|smiley|sun|donut|noSmoking|flowConnector/.test(shape) ? 160 : 90 }; this.editor.area.classList.add('inserting'); this.ui.updateInsertMode(); }
  insertText() { this.editor.pendingInsert = { type: 'text' }; this.editor.area.classList.add('inserting'); this.ui.updateInsertMode(); }
  insertLine(arrow = false) { this.editor.pendingInsert = { type: 'line', arrow }; this.editor.area.classList.add('inserting'); this.ui.updateInsertMode(); }
  cancelInsert() { this.editor.pendingInsert = null; this.editor.area.classList.remove('inserting'); this.ui.updateInsertMode(); }
  insertTable(rows = 3, cols = 3) { const W = this.pres.width, H = this.pres.height, w = W * 0.8, h = Math.min(H * 0.6, rows * 32); const t = this.pres.theme; this.addElement(M.makeTable(W * 0.1, H * 0.25, w, h, rows, cols, { font: t.fonts.body, color: t.text, style: { headerFill: t.accents[0], headerColor: '#FFFFFF', bandFill: M.contrastText(t.accents[0]) === '#ffffff' ? lightenHex(t.accents[0], 0.8) : lightenHex(t.accents[0], 0.6), fill: '#FFFFFF', borderColor: '#FFFFFF', borderWidth: 1 } })); }
  insertChart(type = 'column') { const W = this.pres.width, H = this.pres.height, t = this.pres.theme; this.addElement(M.makeChart(W * 0.15, H * 0.2, W * 0.7, H * 0.65, { chartType: type, font: t.fonts.body, color: t.text })); }
  async insertImageFiles(files, at = null) {
    const list = [...files].filter((f) => /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(f.name)); if (!list.length) return;
    let k = 0;
    for (const f of list) { const { assetId, w, h } = await this.addImageAsset(f); const W = this.pres.width, H = this.pres.height; const sc = Math.min(1, (W * 0.6) / w, (H * 0.6) / h); const ew = w * sc, eh = h * sc; const el = M.makeImage(assetId, (at ? at.x : W / 2) - ew / 2 + k * 16, (at ? at.y : H / 2) - eh / 2 + k * 16, ew, eh, { naturalW: w, naturalH: h }); this.slide.elements.push(el); this.editor.select(el.id); k++; }
    this.commit('Insert picture'); this.editor.render();
  }
  async addImageAsset(fileOrUrl) {
    let url = typeof fileOrUrl === 'string' ? fileOrUrl : await readFileAsDataUrl(fileOrUrl);
    const img = await loadImage(url);
    let w = img.naturalWidth || img.width || 100, h = img.naturalHeight || img.height || 100;
    const parts = dataUrlParts(url); const mime = parts ? parts.mime : '';
    const tooBig = Math.max(w, h) > 2400, convert = !/image\/(png|jpeg)/.test(mime);
    if (tooBig || convert) { const sc = tooBig ? 2400 / Math.max(w, h) : 1; const c = document.createElement('canvas'); c.width = Math.round(w * sc); c.height = Math.round(h * sc); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); url = c.toDataURL(mime === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9); w = c.width; h = c.height; }
    // dedupe identical assets
    for (const [id, u] of Object.entries(this.pres.assets)) if (u === url) return { assetId: id, w, h };
    const assetId = uid('a'); this.pres.assets[assetId] = url; return { assetId, w, h };
  }
  async replaceImage(el) { const f = await this.ui.pickFile('image/*'); if (!f) return; const { assetId, w, h } = await this.addImageAsset(f); el.assetId = assetId; el.naturalW = w; el.naturalH = h; delete el.crop; this.commit('Replace picture'); this.editor.render(); }
  shapeBox(el) { return shapeInset(el.shape, el.w, el.h); }
  pruneAssets() { const used = new Set(); for (const s of this.pres.slides) { if (s.background && s.background.assetId) used.add(s.background.assetId); M.forEachElement(s, (e) => { if (e.assetId) used.add(e.assetId); }); } for (const k of Object.keys(this.pres.assets)) if (!used.has(k)) delete this.pres.assets[k]; }

  // --- formatting --------------------------------------------------------------------------------
  /** Toggle/set a run-level property (bold/italic/underline/strike/size/font/color/link). */
  format(kind, value) {
    const ed = this.editor;
    const runProp = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strike', font: 'font', size: 'size', color: 'color', link: 'link', sup: 'sup' }[kind];
    if (runProp) {
      const toggle = ['bold', 'italic', 'underline', 'strike'].includes(kind);
      if (ed.editing) {
        const cur = ed.selectedTextStyle() || {};
        const el = ed.editing.el; const curVal = cur[runProp] ?? el[runProp];
        const nv = toggle ? !curVal : value;
        const r = ed.editRuns({ [runProp]: nv });
        if (r === 'collapsed') { // no selection → whole element
          if (toggle || kind === 'font' || kind === 'size' || kind === 'color') { el[runProp] = nv; for (const p of el.text.paragraphs) for (const run of p.runs) delete run[runProp]; ed.refreshEditing(ed.getCaret()); }
        }
        this.textChanged(); this.ui.updateToolbar(); return;
      }
      if (ed.cellEdit || (ed.tableCell && ed.single && ed.single.type === 'table')) {
        const el = ed.single, cell = el.rows[ed.tableCell.r][ed.tableCell.c];
        if (toggle) cell[runProp] = !(cell[runProp] ?? (runProp === 'bold' && el.headerRow && ed.tableCell.r === 0)); else cell[runProp] = value;
        if (ed.cellEdit) { ed.endCellEdit(false); }
        this.commit('Format cell'); ed.render(); this.selectionChanged(); return;
      }
      const els = ed.selected.filter((e) => e.text || e.type === 'table' || e.type === 'chart' || e.type === 'group');
      if (!els.length) return;
      const apply = (el) => {
        if (el.type === 'group') { el.children.forEach(apply); return; }
        if (el.type === 'table') { if (kind === 'font' || kind === 'size' || kind === 'color') { el[runProp] = value; for (const row of el.rows) for (const c of row) delete c[runProp]; } else if (toggle) { const on = !el.rows.flat().every((c) => c[runProp]); for (const row of el.rows) for (const c of row) c[runProp] = on; } return; }
        if (el.type === 'chart') { if (kind === 'font' || kind === 'size' || kind === 'color') el[runProp] = value; return; }
        if (!el.text) return;
        if (toggle) el[runProp] = !el[runProp]; else el[runProp] = value;
        for (const p of el.text.paragraphs) for (const run of p.runs) delete run[runProp];
      };
      els.forEach(apply); this.commit('Format'); ed.render(); this.selectionChanged(); return;
    }
    if (kind === 'sizeStep') { const step = value > 0 ? 1 : -1; const bump = (s) => { const steps = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96]; if (step > 0) return steps.find((x) => x > s) || s + 8; return [...steps].reverse().find((x) => x < s) || Math.max(4, s - 1); };
      if (ed.editing) { const r = ed.editRuns({ size: (v) => bump(v || ed.editing.el.size) }); if (r === 'collapsed') { const el = ed.editing.el; el.size = bump(el.size); for (const p of el.text.paragraphs) for (const run of p.runs) if (run.size) run.size = bump(run.size); ed.refreshEditing(ed.getCaret()); } this.textChanged(); return; }
      const apply = (el) => { if (el.type === 'group') return el.children.forEach(apply); if (el.size) el.size = bump(el.size); if (el.text) for (const p of el.text.paragraphs) for (const run of p.runs) if (run.size) run.size = bump(run.size); if (el.type === 'table') for (const row of el.rows) for (const c of row) if (c.size) c.size = bump(c.size); };
      ed.selected.forEach(apply); this.commit('Font size'); ed.render(); this.selectionChanged(); return;
    }
    // paragraph-level
    const paraFn = { align: (p) => { p.align = value; }, bullets: (p) => { p.bullet = p.bullet === '•' || p.bullet === true ? false : '•'; }, numbering: (p) => { p.bullet = p.bullet === 'number' ? false : 'number'; }, bulletStyle: (p) => { p.bullet = value || false; }, lineSpacing: (p) => { p.lineHeight = value; }, spaceBefore: (p) => { p.spaceBefore = value; }, spaceAfter: (p) => { p.spaceAfter = value; } }[kind];
    if (paraFn) {
      if (ed.editing) { ed.editParagraphs((p) => { paraFn(p); if (kind === 'align' && p.align === ed.editing.el.align) delete p.align; }); this.textChanged(); this.ui.updateToolbar(); return; }
      if (ed.tableCell && ed.single && ed.single.type === 'table' && kind === 'align') { ed.single.rows[ed.tableCell.r][ed.tableCell.c].align = value; this.commit('Align'); ed.render(); this.selectionChanged(); return; }
      const apply = (el) => { if (el.type === 'group') return el.children.forEach(apply); if (el.type === 'table') { if (kind === 'align') for (const row of el.rows) for (const c of row) c.align = value; return; } if (!el.text) return; if (kind === 'align') { el.align = value; for (const p of el.text.paragraphs) delete p.align; } else if (kind === 'lineSpacing') { el.lineHeight = value; for (const p of el.text.paragraphs) delete p.lineHeight; } else el.text.paragraphs.forEach(paraFn); };
      ed.selected.forEach(apply); this.commit('Paragraph'); ed.render(); this.selectionChanged(); return;
    }
    if (kind === 'valign') { if (ed.tableCell && ed.single && ed.single.type === 'table') { ed.single.rows[ed.tableCell.r][ed.tableCell.c].valign = value; this.commit('Align'); ed.render(); return; } this.setProps({ valign: value }, ed.selected.filter((e) => e.text || e.type === 'table')); for (const el of ed.selected) if (el.type === 'table') for (const row of el.rows) for (const c of row) c.valign = value; ed.render(); }
  }
  changeIndent(delta) {
    const ed = this.editor;
    const fn = (p) => { p.level = clamp((p.level || 0) + delta, 0, 4); if (!p.level) delete p.level; };
    if (ed.editing) { ed.editParagraphs(fn); this.textChanged(); return; }
    for (const el of ed.selected) if (el.text) el.text.paragraphs.forEach(fn); this.commit('Indent'); ed.render();
  }
  clearFormatting() {
    for (const el of this.editor.selected) if (el.text) { for (const p of el.text.paragraphs) { p.runs = p.runs.map((r) => ({ text: r.text, ...(r.link ? { link: r.link } : {}) })); } if (el.ph) Object.assign(el, M.placeholderStyle(el.ph, this.pres.theme)); else { el.bold = el.italic = el.underline = false; } }
    this.commit('Clear formatting'); this.editor.render(); this.selectionChanged();
  }

  // --- arrange ---------------------------------------------------------------------------------------
  arrange(cmd) {
    const sel = this.editor.selected; if (!sel.length) return;
    const els = this.slide.elements, ids = new Set(sel.map((e) => e.id));
    if (cmd === 'front') { this.slide.elements = [...els.filter((e) => !ids.has(e.id)), ...els.filter((e) => ids.has(e.id))]; }
    else if (cmd === 'back') { this.slide.elements = [...els.filter((e) => ids.has(e.id)), ...els.filter((e) => !ids.has(e.id))]; }
    else if (cmd === 'forward') { for (let i = els.length - 2; i >= 0; i--) if (ids.has(els[i].id) && !ids.has(els[i + 1].id)) [els[i], els[i + 1]] = [els[i + 1], els[i]]; }
    else if (cmd === 'backward') { for (let i = 1; i < els.length; i++) if (ids.has(els[i].id) && !ids.has(els[i - 1].id)) [els[i], els[i - 1]] = [els[i - 1], els[i]]; }
    else if (cmd === 'group') { const g = M.groupElements(this.slide, sel); if (g) this.editor.selection = [g.id]; }
    else if (cmd === 'ungroup') { const out = []; for (const g of sel) if (g.type === 'group') out.push(...M.ungroup(this.slide, g)); else out.push(g); this.editor.selection = out.map((e) => e.id); }
    else if (/^align/.test(cmd)) {
      const ref = sel.length > 1 ? unionBounds(sel.map(boundsOf)) : { x: 0, y: 0, w: this.pres.width, h: this.pres.height };
      for (const el of sel) { const b = boundsOf(el); let dx = 0, dy = 0; if (cmd === 'alignLeft') dx = ref.x - b.x; if (cmd === 'alignCenter') dx = ref.x + ref.w / 2 - (b.x + b.w / 2); if (cmd === 'alignRight') dx = ref.x + ref.w - (b.x + b.w); if (cmd === 'alignTop') dy = ref.y - b.y; if (cmd === 'alignMiddle') dy = ref.y + ref.h / 2 - (b.y + b.h / 2); if (cmd === 'alignBottom') dy = ref.y + ref.h - (b.y + b.h); M.moveElement(el, dx, dy); }
    } else if (cmd === 'distributeH' || cmd === 'distributeV') {
      if (sel.length < 3) return; const h = cmd === 'distributeH';
      const sorted = [...sel].sort((a, b) => (h ? boundsOf(a).x - boundsOf(b).x : boundsOf(a).y - boundsOf(b).y));
      const first = boundsOf(sorted[0]), last = boundsOf(sorted[sorted.length - 1]);
      const total = h ? last.x + last.w - first.x : last.y + last.h - first.y, sizes = sorted.reduce((a, e) => a + (h ? boundsOf(e).w : boundsOf(e).h), 0), gap = (total - sizes) / (sorted.length - 1);
      let pos = h ? first.x : first.y; for (const el of sorted) { const b = boundsOf(el); M.moveElement(el, h ? pos - b.x : 0, h ? 0 : pos - b.y); pos += (h ? b.w : b.h) + gap; }
    } else if (cmd === 'rotateCW' || cmd === 'rotateCCW') { for (const el of sel) el.rotation = (((el.rotation || 0) + (cmd === 'rotateCW' ? 90 : -90)) % 360 + 360) % 360; }
    else if (cmd === 'flipH' || cmd === 'flipV') { for (const el of sel) { if (el.type === 'group') el.children.forEach((c) => { c[cmd] = !c[cmd]; }); else el[cmd] = !el[cmd]; } }
    else if (cmd === 'lock') { for (const el of sel) el.locked = !el.locked; }
    else if (cmd === 'center') { for (const el of sel) { const b = boundsOf(el); M.moveElement(el, this.pres.width / 2 - (b.x + b.w / 2), this.pres.height / 2 - (b.y + b.h / 2)); } }
    this.commit(cmd); this.editor.render(); this.selectionChanged();
  }
  nudge(dx, dy) { const sel = this.editor.selected.filter((e) => !e.locked); if (!sel.length) return; for (const el of sel) M.moveElement(el, dx, dy); this.commit('Nudge'); this.editor.render(); }

  // --- tables -----------------------------------------------------------------------------------------
  tableOp(op) {
    const el = this.editor.single; if (!el || el.type !== 'table') return;
    const cell = this.editor.tableCell || { r: el.rows.length - 1, c: el.rows[0].length - 1 };
    const cols = el.rows[0].length;
    if (op === 'addRow' || op === 'addRowAbove') { const at = op === 'addRow' ? cell.r + 1 : cell.r; el.rows.splice(at, 0, Array.from({ length: cols }, () => M.makeCell(''))); const rh = el.rowHeights[cell.r] || el.h / el.rows.length; el.rowHeights.splice(at, 0, rh); el.h += rh; }
    else if (op === 'addCol' || op === 'addColLeft') { const at = op === 'addCol' ? cell.c + 1 : cell.c; for (const row of el.rows) row.splice(at, 0, M.makeCell('')); const cw = el.colWidths[cell.c] || el.w / cols; el.colWidths.splice(at, 0, cw); el.w += cw; }
    else if (op === 'delRow') { if (el.rows.length <= 1) { this.deleteSelected(); return; } el.h -= el.rowHeights[cell.r] || el.h / el.rows.length; el.rows.splice(cell.r, 1); el.rowHeights.splice(cell.r, 1); this.editor.tableCell = null; }
    else if (op === 'delCol') { if (cols <= 1) { this.deleteSelected(); return; } el.w -= el.colWidths[cell.c] || el.w / cols; for (const row of el.rows) row.splice(cell.c, 1); el.colWidths.splice(cell.c, 1); this.editor.tableCell = null; }
    else if (op === 'equalCols') { el.colWidths = el.colWidths.map(() => el.w / cols); }
    else if (op === 'equalRows') { el.rowHeights = el.rowHeights.map(() => el.h / el.rows.length); }
    this.commit('Table'); this.editor.render(); this.selectionChanged();
  }
  setChartData(el, grid) { Object.assign(el, chartDataFromGrid(grid)); this.commit('Chart data'); this.editor.render(); this.selectionChanged(); }

  // --- clipboard ---------------------------------------------------------------------------------------
  copy(cut = false) {
    const sel = this.editor.selected; if (!sel.length) return;
    const assets = {}; const collect = (e) => { if (e.assetId && this.pres.assets[e.assetId]) assets[e.assetId] = this.pres.assets[e.assetId]; if (e.children) e.children.forEach(collect); };
    sel.forEach(collect);
    this.clipboard = { elements: clone(sel), assets, slideSize: [this.pres.width, this.pres.height] }; this.pasteCount = 0;
    try { navigator.clipboard?.writeText('robbinsppt:' + JSON.stringify(this.clipboard)).catch(() => {}); } catch { /* ignore */ }
    if (cut) this.deleteSelected();
  }
  paste(data = this.clipboard, at = null) {
    if (!data || !data.elements) return;
    this.pasteCount = (this.pasteCount || 0) + 1;
    Object.assign(this.pres.assets, data.assets || {});
    const copies = data.elements.map((e) => M.duplicateElement(e, at ? 0 : 20 * this.pasteCount, at ? 0 : 20 * this.pasteCount));
    if (at) { const b = unionBounds(copies.map(boundsOf)); for (const c of copies) M.moveElement(c, at.x - b.x - b.w / 2, at.y - b.y - b.h / 2); }
    this.slide.elements.push(...copies); this.commit('Paste'); this.editor.render(); this.editor.select(copies.map((c) => c.id));
  }
  duplicate() { const sel = this.editor.selected; if (!sel.length) return; const copies = sel.map((e) => M.duplicateElement(e)); this.slide.elements.push(...copies); this.commit('Duplicate'); this.editor.render(); this.editor.select(copies.map((c) => c.id)); }
  async pasteEvent(ev) {
    if (this.editor.editing || this.editor.cellEdit || ev.target.matches('input, textarea, [contenteditable=true]')) return;
    const items = [...(ev.clipboardData?.items || [])];
    const imgs = items.filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean);
    if (imgs.length) { ev.preventDefault(); await this.insertImageFiles(imgs); return; }
    const text = ev.clipboardData?.getData('text/plain') || '';
    if (text.startsWith('robbinsppt:')) { ev.preventDefault(); try { this.paste(JSON.parse(text.slice(11))); } catch { this.paste(); } return; }
    if (text.trim()) { ev.preventDefault(); const t = this.pres.theme; const lines = text.split(/\r?\n/); const el = M.makeText(this.pres.width * 0.1, this.pres.height * 0.3, this.pres.width * 0.8, Math.min(this.pres.height * 0.6, 30 + lines.length * 24), { text: M.textFromString(text), font: t.fonts.body, color: t.text }); this.addElement(el); return; }
    if (this.clipboard) { ev.preventDefault(); this.paste(); }
  }

  // --- files -------------------------------------------------------------------------------------------
  async newDocument(theme) {
    if (this.dirty && !(await this.ui.confirm('Discard unsaved changes and start a new presentation?'))) return;
    this.load(M.newPresentation({ theme: theme ? M.themeByName(theme) : undefined }));
  }
  async openFile(file) {
    if (!file) { const picked = await this.ui.pickFile('.pptx,.json,.pptjson,application/vnd.openxmlformats-officedocument.presentationml.presentation', false, true); if (!picked) return; file = picked.file; if (picked.handle) this.fileHandle = picked.handle; }
    const name = file.name || 'presentation';
    this.ui.busy(`Opening ${name}…`);
    try {
      let pres;
      if (/\.pptx$/i.test(name) || file.type.includes('presentationml')) pres = await readPptx(await readFileAsBytes(file));
      else if (/\.(json|pptjson)$/i.test(name)) pres = M.deserialize(await file.text());
      else if (/\.(txt|md)$/i.test(name)) { pres = M.newPresentation(); pres.slides = M.slidesFromOutline(pres, await file.text()); }
      else throw new Error('Unsupported file type. Open a .pptx or .json presentation.');
      if (!pres.title || pres.title === 'Untitled presentation') pres.title = name.replace(/\.[^.]+$/, '');
      this.load(pres, { name: name.replace(/\.[^.]+$/, ''), keepHandle: /\.(json|pptjson)$/i.test(name) });
      this.ui.toast(`Opened ${name}`);
    } catch (e) { console.error(e); this.ui.alert('Could not open file: ' + e.message); }
    finally { this.ui.busy(null); }
  }
  async save(as = false) {
    this.pruneAssets();
    const json = M.serialize(this.pres), name = (this.fileName || this.pres.title || 'presentation') + '.json';
    if (window.showSaveFilePicker) {
      try {
        if (as || !this.fileHandle) this.fileHandle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'RobbinsPPT presentation', accept: { 'application/json': ['.json'] } }] });
        const w = await this.fileHandle.createWritable(); await w.write(json); await w.close();
        this.fileName = this.fileHandle.name.replace(/\.[^.]+$/, ''); this.dirty = false; this.ui.setTitle(); this.ui.toast('Saved ' + this.fileHandle.name); return;
      } catch (e) { if (e.name === 'AbortError') return; console.warn(e); }
    }
    downloadBytes(new TextEncoder().encode(json), name, 'application/json'); this.dirty = false; this.ui.setTitle();
  }
  async exportPptx() {
    this.pruneAssets(); this.ui.busy('Building PowerPoint file…');
    try { const bytes = await writePptx(this.pres); await this.saveBytes(bytes, (this.fileName || this.pres.title || 'presentation') + '.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'PowerPoint presentation'); this.dirty = false; this.ui.setTitle(); }
    catch (e) { console.error(e); this.ui.alert('Export failed: ' + e.message); } finally { this.ui.busy(null); }
  }
  async exportAs(kind) {
    const base = this.fileName || this.pres.title || 'presentation';
    this.ui.busy('Exporting…');
    try {
      if (this.editor.editing) this.editor.endTextEdit(true);
      if (kind === 'pdf') { const bytes = await exportPdf(this.pres, { onProgress: (i, n) => this.ui.busy(`Rendering page ${i + 1} of ${n}…`) }); await this.saveBytes(bytes, base + '.pdf', 'application/pdf', 'PDF document'); }
      else if (kind === 'png' || kind === 'jpg') { const r = await exportImages(this.pres, kind === 'jpg' ? 'image/jpeg' : 'image/png', 2, (i, n) => this.ui.busy(`Rendering slide ${i + 1} of ${n}…`)); await this.saveBytes(r.bytes, r.name === 'slides.zip' ? base + '-slides.zip' : base + '.' + kind, r.mime, 'Images'); }
      else if (kind === 'pngCurrent') { const r = await exportImages({ ...this.pres, slides: [this.slide] }, 'image/png', 2); await this.saveBytes(r.bytes, `${base}-slide${this.slideIndex + 1}.png`, 'image/png', 'PNG image'); }
      else if (kind === 'svg') { const r = await exportSvgs(this.pres); await this.saveBytes(r.bytes, r.name === 'slides-svg.zip' ? base + '-svg.zip' : base + '.svg', r.mime, 'SVG'); }
      else if (kind === 'html') { await this.saveBytes(new TextEncoder().encode(exportHtml(this.pres)), base + '.html', 'text/html', 'HTML slide show'); }
      else if (kind === 'json') { await this.save(true); }
    } catch (e) { console.error(e); this.ui.alert('Export failed: ' + e.message); } finally { this.ui.busy(null); }
  }
  async saveBytes(bytes, name, mime, desc) {
    if (window.showSaveFilePicker) {
      try { const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: desc, accept: { [mime]: ['.' + name.split('.').pop()] } }] }); const w = await h.createWritable(); await w.write(bytes); await w.close(); this.ui.toast('Saved ' + h.name); return; }
      catch (e) { if (e.name === 'AbortError') return; console.warn(e); }
    }
    downloadBytes(bytes, name, mime); this.ui.toast('Downloaded ' + name);
  }
  print(opts) { try { printSlides(this.pres, opts); } catch (e) { this.ui.alert(e.message); } }
  importOutline(text) { const slides = M.slidesFromOutline(this.pres, text); if (!slides.length) return; this.pres.slides.splice(this.slideIndex + 1, 0, ...slides); this.commit('Outline'); this.gotoSlide(this.slideIndex + 1, { force: true }); this.ui.renderThumbs(); }
  startShow(from = 0, opts = {}) { if (this.editor.editing) this.editor.endTextEdit(true); this.show.start(from, opts); }
  onShowEnd(index) { this.gotoSlide(index, { force: true }); this.ui.renderThumbs(); }
  find(text, replace = null, all = false) {
    if (!text) return 0; let count = 0; const lower = text.toLowerCase();
    for (let si = 0; si < this.pres.slides.length; si++) {
      const s = this.pres.slides[si];
      M.forEachElement(s, (e) => {
        if (e.text) for (const p of e.text.paragraphs) for (const r of p.runs) { const idx = r.text.toLowerCase().indexOf(lower); if (idx >= 0) { count++; if (replace !== null) r.text = r.text.replace(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), all ? 'gi' : 'i'), replace); } }
        if (e.type === 'table') for (const row of e.rows) for (const c of row) { const t = typeof c.text === 'string' ? c.text : M.textToString(c.text); if (t.toLowerCase().includes(lower)) { count++; if (replace !== null) c.text = t.replace(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), all ? 'gi' : 'i'), replace); } }
      });
    }
    if (replace !== null && count) { this.commit('Replace'); this.refresh(); }
    return count;
  }
  findNext(text) {
    if (!text) return false; const lower = text.toLowerCase(); const n = this.pres.slides.length;
    for (let k = 1; k <= n; k++) { const si = (this.slideIndex + k) % n; const hit = M.flattenElements(this.pres.slides[si]).find((e) => (e.text && M.textToString(e.text).toLowerCase().includes(lower)) || (e.type === 'table' && e.rows.flat().some((c) => (typeof c.text === 'string' ? c.text : M.textToString(c.text)).toLowerCase().includes(lower)))); if (hit) { this.gotoSlide(si, { force: true }); this.editor.select(this.pres.slides[si].elements.find((e) => e.id === hit.id || (e.children && e.children.includes(hit)))?.id || hit.id); return true; } }
    return false;
  }
}
function lightenHex(hex, t) { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; const f = (v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0'); return `#${f(r)}${f(g)}${f(b)}`; }

export const app = new App();
window.app = app;
app.init();
export { FONTS };
