// Canvas editor: renders the current slide, handles selection, dragging, resizing, rotation,
// snapping guides, marquee selection, in-place text editing and table cell editing.
import { clamp, rotatePoint, boundsOf, unionBounds, clone, uid } from './util.js';
import { renderSlide, elementHtml, parseEditedText, textHtml } from './render.js';
import { findElement, moveElement, resizeElement, duplicateElement, makeText, makeShape, makeLine, isTextEmpty, textFromString, makeRun } from './model.js';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MIN = 4;

export class Editor {
  constructor(app, area) {
    this.app = app; this.area = area;
    this.zoom = 1; this.selection = []; this.editing = null; this.cellEdit = null; this.tableCell = null;
    this.snap = true; this.grid = false; this.gridSize = 10; this.showGrid = false;
    this.pendingInsert = null; this.drag = null;
    area.innerHTML = '<div class="slide-wrap"><div class="slide"></div><div class="overlay"></div><div class="guides"></div></div>';
    this.wrap = area.querySelector('.slide-wrap'); this.slideEl = area.querySelector('.slide'); this.overlay = area.querySelector('.overlay'); this.guidesEl = area.querySelector('.guides');
    this.bind();
  }
  get pres() { return this.app.pres; }
  get slide() { return this.app.slide; }
  get selected() { return this.selection.map((id) => findElement(this.slide, id)).filter(Boolean); }
  get single() { return this.selection.length === 1 ? findElement(this.slide, this.selection[0]) : null; }

  // --- rendering -----------------------------------------------------------------------------
  setZoom(z) { this.zoom = clamp(z, 0.1, 6); this.layout(); this.app.ui?.updateZoom?.(); }
  fitZoom(mode = 'fit') {
    const aw = this.area.clientWidth - 48, ah = this.area.clientHeight - 48;
    const z = mode === 'width' ? aw / this.pres.width : Math.min(aw / this.pres.width, ah / this.pres.height);
    this.fitMode = mode; this.setZoom(z);
  }
  layout() {
    const { width: W, height: H } = this.pres, z = this.zoom;
    this.wrap.style.width = `${W * z}px`; this.wrap.style.height = `${H * z}px`;
    for (const l of [this.slideEl, this.overlay, this.guidesEl]) { l.style.transform = `scale(${z})`; l.style.width = `${W}px`; l.style.height = `${H}px`; }
    this.updateOverlay();
  }
  render() {
    if (this.editing) this.endTextEdit(false);
    if (this.cellEdit) this.endCellEdit(false);
    renderSlide(this.slideEl, this.pres, this.slide, { editing: true, index: this.app.slideIndex });
    this.slideEl.classList.toggle('show-grid', this.showGrid);
    this.selection = this.selection.filter((id) => findElement(this.slide, id));
    this.layout();
  }
  /** Re-render only one element's DOM node (fast path while dragging / editing properties). */
  renderElement(el) {
    const node = this.slideEl.querySelector(`.el[data-id="${el.id}"]`);
    const top = this.slide.elements.find((e) => e.id === el.id);
    if (!node || !top) { this.render(); return; }
    const tmp = document.createElement('div'); tmp.innerHTML = elementHtml(this.pres, top, { editing: true });
    node.replaceWith(tmp.firstElementChild);
    this.updateOverlay();
  }
  updateOverlay() {
    const ov = this.overlay; ov.innerHTML = '';
    const sel = this.selected;
    for (const el of sel) {
      const box = document.createElement('div'); box.className = 'selbox' + (sel.length > 1 ? ' multi' : '') + (el.locked ? ' locked' : '');
      box.dataset.id = el.id;
      box.style.cssText = `left:${el.x}px;top:${el.y}px;width:${Math.max(el.w, 0)}px;height:${Math.max(el.h, 0)}px;transform:rotate(${el.rotation || 0}deg)`;
      if (sel.length === 1 && !el.locked && !this.editing) {
        if (el.type === 'line') {
          const p1 = { x: el.flipH ? el.w : 0, y: el.flipV ? el.h : 0 }, p2 = { x: el.flipH ? 0 : el.w, y: el.flipV ? 0 : el.h };
          box.classList.add('linebox');
          box.innerHTML = `<div class="handle endpoint" data-h="p1" style="left:${p1.x}px;top:${p1.y}px"></div><div class="handle endpoint" data-h="p2" style="left:${p2.x}px;top:${p2.y}px"></div>`;
        } else {
          box.innerHTML = HANDLES.map((h) => `<div class="handle ${h}" data-h="${h}"></div>`).join('') + (el.type !== 'table' ? '<div class="rot-line"></div><div class="handle rotate" data-h="rot"></div>' : '');
        }
      }
      ov.appendChild(box);
    }
    if (this.tableCell && sel.length === 1 && sel[0].type === 'table') {
      const el = sel[0], cellNode = this.slideEl.querySelector(`.el[data-id="${el.id}"] .cell[data-r="${this.tableCell.r}"][data-c="${this.tableCell.c}"]`);
      if (cellNode) { const c = document.createElement('div'); c.className = 'cellsel'; c.style.cssText = `left:${el.x + parseFloat(cellNode.style.left)}px;top:${el.y + parseFloat(cellNode.style.top)}px;width:${cellNode.style.width};height:${cellNode.style.height}`; ov.appendChild(c); }
    }
    const scale = 1 / this.zoom; ov.style.setProperty('--hs', `${8 * scale}px`); ov.style.setProperty('--bw', `${1.5 * scale}px`);
  }
  showGuides(lines) { this.guidesEl.innerHTML = lines.map((g) => `<div class="guide ${g.axis}" style="${g.axis === 'v' ? `left:${g.pos}px` : `top:${g.pos}px`}"></div>`).join(''); }

  // --- selection ------------------------------------------------------------------------------
  select(ids, opts = {}) {
    ids = Array.isArray(ids) ? ids : ids ? [ids] : [];
    if (opts.toggle) { for (const id of ids) { const i = this.selection.indexOf(id); if (i >= 0) this.selection.splice(i, 1); else this.selection.push(id); } }
    else if (opts.add) { for (const id of ids) if (!this.selection.includes(id)) this.selection.push(id); }
    else this.selection = ids.slice();
    if (!(this.single && this.single.type === 'table')) this.tableCell = null;
    this.updateOverlay(); this.app.selectionChanged();
  }
  selectAll() { this.select(this.slide.elements.filter((e) => !(e.ph && e.type === 'text' && isTextEmpty(e.text)) || true).map((e) => e.id)); }
  clearSelection() { this.select([]); }

  // --- coordinates ----------------------------------------------------------------------------
  toSlide(ev) { const r = this.slideEl.getBoundingClientRect(); return { x: (ev.clientX - r.left) / this.zoom, y: (ev.clientY - r.top) / this.zoom }; }
  topLevelAt(target) { const node = target.closest && target.closest('.el'); if (!node || !this.slideEl.contains(node)) return null; let n = node; while (n.parentElement && n.parentElement !== this.slideEl) n = n.parentElement.closest('.el') || n.parentElement; const top = n.closest ? n : node; const id = (top.classList && top.classList.contains('el') ? top : node).dataset.id; return this.slide.elements.find((e) => e.id === id) ? id : (() => { let p = node; while (p && p.parentElement !== this.slideEl) p = p.parentElement; return p && p.dataset ? p.dataset.id : null; })(); }

  // --- events ---------------------------------------------------------------------------------
  bind() {
    const area = this.area;
    area.addEventListener('pointerdown', (ev) => this.onPointerDown(ev));
    window.addEventListener('pointermove', (ev) => this.onPointerMove(ev));
    window.addEventListener('pointerup', (ev) => this.onPointerUp(ev));
    area.addEventListener('dblclick', (ev) => this.onDblClick(ev));
    area.addEventListener('contextmenu', (ev) => { const id = this.topLevelAt(ev.target); if (id && !this.selection.includes(id)) this.select(id); if (this.editing && ev.target.closest('.txt.editing')) return; ev.preventDefault(); this.app.ui.contextMenu(ev, id ? 'element' : 'slide'); });
    area.addEventListener('wheel', (ev) => { if (ev.ctrlKey) { ev.preventDefault(); this.fitMode = null; this.setZoom(this.zoom * (ev.deltaY < 0 ? 1.1 : 0.9)); } }, { passive: false });
    this.slideEl.addEventListener('input', (ev) => { if (this.editing && ev.target.closest('.txt')) this.syncEditing(); if (this.cellEdit && ev.target.closest('.cell')) this.syncCell(); });
    this.slideEl.addEventListener('paste', (ev) => { if (!this.editing && !this.cellEdit) return; ev.preventDefault(); const t = ev.clipboardData.getData('text/plain'); if (t) document.execCommand('insertText', false, t); });
    this.slideEl.addEventListener('keydown', (ev) => { if (this.editing) this.onEditKey(ev); else if (this.cellEdit) this.onCellKey(ev); });
    this.slideEl.addEventListener('click', (ev) => { const a = ev.target.closest('a.run-link'); if (a && !this.editing) ev.preventDefault(); });
    new ResizeObserver(() => { if (this.fitMode) this.fitZoom(this.fitMode); }).observe(area);
  }
  onPointerDown(ev) {
    if (ev.button === 1) return;
    const inOverlay = ev.target.closest('.overlay'), handle = ev.target.closest('.handle');
    const pt = this.toSlide(ev);
    if (this.editing) {
      const txt = ev.target.closest('.txt.editing'); if (txt) return; // let the browser place the caret
      this.endTextEdit(true);
    }
    if (this.cellEdit) { const c = ev.target.closest('.cell'); if (c && this.cellEdit.node === c) return; this.endCellEdit(true); }
    if (ev.button === 2) return;
    this.area.focus({ preventScroll: true });
    if (this.pendingInsert) { this.beginInsert(ev, pt); return; }
    if (handle && inOverlay) { this.beginHandle(ev, handle.dataset.h, pt); return; }
    const id = this.topLevelAt(ev.target);
    if (id) {
      const el = findElement(this.slide, id);
      if (ev.shiftKey || ev.ctrlKey) this.select(id, { toggle: true });
      else if (!this.selection.includes(id)) this.select(id);
      if (el.type === 'table') { const c = ev.target.closest('.cell'); this.tableCell = c ? { r: +c.dataset.r, c: +c.dataset.c } : null; this.updateOverlay(); this.app.selectionChanged(); }
      if (!ev.shiftKey && !ev.ctrlKey) this.beginMove(ev, pt);
      return;
    }
    if (ev.target === this.slideEl || ev.target.closest('.slide') === this.slideEl || ev.target.closest('.slide-wrap')) {
      if (!ev.shiftKey) this.clearSelection();
      this.drag = { kind: 'marquee', start: pt, add: ev.shiftKey, box: null };
      this.area.setPointerCapture?.(ev.pointerId);
    }
  }
  beginMove(ev, pt) {
    const els = this.selected.filter((e) => !e.locked); if (!els.length) return;
    this.drag = { kind: 'move', start: pt, orig: els.map((e) => clone(e)), els, moved: false, pointerId: ev.pointerId, alt: ev.altKey };
    ev.preventDefault();
  }
  beginHandle(ev, h, pt) {
    const el = this.single; if (!el || el.locked) return;
    this.drag = { kind: h === 'rot' ? 'rotate' : h === 'p1' || h === 'p2' ? 'endpoint' : 'resize', h, start: pt, el, orig: clone(el), moved: false };
    ev.preventDefault();
  }
  beginInsert(ev, pt) {
    const ins = this.pendingInsert; this.drag = { kind: 'insert', ins, start: pt, el: null, moved: false }; ev.preventDefault();
  }
  onPointerMove(ev) {
    const d = this.drag; if (!d) return;
    const pt = this.toSlide(ev), dx = pt.x - d.start.x, dy = pt.y - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) * this.zoom < 3) return;
    d.moved = true;
    if (d.kind === 'move') {
      if (d.alt && !d.dupDone) { d.dupDone = true; const copies = d.els.map((e) => duplicateElement(e, 0, 0)); this.slide.elements.push(...copies); d.els = copies; d.orig = copies.map((e) => clone(e)); this.select(copies.map((c) => c.id)); this.render(); }
      let mx = dx, my = dy;
      if (!ev.altKey || d.alt) { const snapped = this.snapMove(d.orig, mx, my); mx = snapped.dx; my = snapped.dy; this.showGuides(snapped.guides); }
      if (ev.shiftKey) { if (Math.abs(mx) > Math.abs(my)) my = 0; else mx = 0; }
      d.els.forEach((el, i) => { const o = d.orig[i]; const ndx = o.x + mx - el.x, ndy = o.y + my - el.y; moveElement(el, ndx, ndy); this.moveNode(el); });
      this.updateOverlay();
    } else if (d.kind === 'resize') { this.applyResize(d, pt, ev); }
    else if (d.kind === 'rotate') {
      const el = d.el, cx = el.x + el.w / 2, cy = el.y + el.h / 2;
      let ang = (Math.atan2(pt.y - cy, pt.x - cx) * 180) / Math.PI + 90;
      if (ev.shiftKey) ang = Math.round(ang / 15) * 15; else if (Math.abs(((ang % 360) + 360) % 360) < 3 || Math.abs((((ang % 360) + 360) % 360) - 360) < 3) ang = 0;
      el.rotation = Math.round(((ang % 360) + 360) % 360 * 10) / 10; this.moveNode(el); this.updateOverlay(); this.app.ui.updateProps?.();
    } else if (d.kind === 'endpoint') {
      const el = d.el, o = d.orig;
      const p1 = { x: o.flipH ? o.x + o.w : o.x, y: o.flipV ? o.y + o.h : o.y }, p2 = { x: o.flipH ? o.x : o.x + o.w, y: o.flipV ? o.y : o.y + o.h };
      const moving = d.h === 'p1' ? p1 : p2, fixed = d.h === 'p1' ? p2 : p1;
      let nx = moving.x + dx, ny = moving.y + dy;
      if (ev.shiftKey) { const a = Math.atan2(ny - fixed.y, nx - fixed.x), snapA = Math.round(a / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(nx - fixed.x, ny - fixed.y); nx = fixed.x + Math.cos(snapA) * len; ny = fixed.y + Math.sin(snapA) * len; }
      const s = d.h === 'p1' ? { x: nx, y: ny } : fixed, e = d.h === 'p1' ? fixed : { x: nx, y: ny };
      this.setLineEndpoints(el, s, e); this.renderElement(el);
    } else if (d.kind === 'marquee') {
      const x = Math.min(pt.x, d.start.x), y = Math.min(pt.y, d.start.y), w = Math.abs(dx), h = Math.abs(dy);
      if (!d.box) { d.box = document.createElement('div'); d.box.className = 'marquee'; this.overlay.appendChild(d.box); }
      d.box.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
      const ids = this.slide.elements.filter((e) => { const b = boundsOf(e); return b.x >= x && b.y >= y && b.x + b.w <= x + w && b.y + b.h <= y + h; }).map((e) => e.id);
      this.selection = d.add ? [...new Set([...this.selection, ...ids])] : ids; this.updateOverlay(); this.overlay.appendChild(d.box);
    } else if (d.kind === 'insert') {
      if (!d.el) { d.el = this.createInsert(d.ins, d.start); if (!d.el) { this.drag = null; return; } this.slide.elements.push(d.el); this.select(d.el.id); }
      const el = d.el;
      if (el.type === 'line') this.setLineEndpoints(el, d.start, ev.shiftKey ? this.constrain45(d.start, pt) : pt);
      else { let w = dx, h = dy; if (ev.shiftKey || d.ins.square) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; } el.x = Math.min(d.start.x, d.start.x + w); el.y = Math.min(d.start.y, d.start.y + h); el.w = Math.max(MIN, Math.abs(w)); el.h = Math.max(MIN, Math.abs(h)); }
      this.renderElement(el);
    }
  }
  constrain45(a, b) { const ang = Math.atan2(b.y - a.y, b.x - a.x), s = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(b.x - a.x, b.y - a.y); return { x: a.x + Math.cos(s) * len, y: a.y + Math.sin(s) * len }; }
  setLineEndpoints(el, s, e) { el.x = Math.min(s.x, e.x); el.y = Math.min(s.y, e.y); el.w = Math.abs(e.x - s.x); el.h = Math.abs(e.y - s.y); el.flipH = e.x < s.x; el.flipV = e.y < s.y; }
  applyResize(d, pt, ev) {
    const el = d.el, o = d.orig, h = d.h, rot = (o.rotation || 0) * Math.PI / 180;
    const dx = pt.x - d.start.x, dy = pt.y - d.start.y;
    // pointer delta in the element's local frame
    let ldx = dx * Math.cos(-rot) - dy * Math.sin(-rot), ldy = dx * Math.sin(-rot) + dy * Math.cos(-rot);
    if (o.flipH) ldx = ldx; if (o.flipV) ldy = ldy;
    let w = o.w, hh = o.h, lx = 0, ly = 0;
    if (h.includes('e')) w = o.w + ldx; if (h.includes('w')) { w = o.w - ldx; lx = ldx; }
    if (h.includes('s')) hh = o.h + ldy; if (h.includes('n')) { hh = o.h - ldy; ly = ldy; }
    const keepAspect = ev.shiftKey || (el.type === 'image' && h.length === 2) || (el.type === 'group' && h.length === 2 && !ev.altKey);
    if (keepAspect && o.w > 0 && o.h > 0) {
      const ar = o.w / o.h;
      if (h.length === 2) { if (Math.abs(w / o.w) > Math.abs(hh / o.h)) hh = w / ar; else w = hh * ar; }
      else if (h === 'e' || h === 'w') hh = w / ar; else w = hh * ar;
      if (h.includes('w')) lx = o.w - w; if (h.includes('n')) ly = o.h - hh;
      if (h === 'n' || h === 's') lx = (o.w - w) / 2; if (h === 'e' || h === 'w') ly = (o.h - hh) / 2;
    }
    if (w < MIN) { if (h.includes('w')) lx = o.w - MIN; w = MIN; } if (hh < MIN) { if (h.includes('n')) ly = o.h - MIN; hh = MIN; }
    // snapping of the moving edge (unrotated elements only)
    let guides = [];
    if (!o.rotation && this.snap && !ev.altKey) {
      const edgesX = this.snapTargets('x', el.id), edgesY = this.snapTargets('y', el.id), t = 6 / this.zoom;
      if (h.includes('e')) { const s = nearest(o.x + w, edgesX, t); if (s) { w = s.v - o.x; guides.push({ axis: 'v', pos: s.v }); } }
      if (h.includes('w')) { const s = nearest(o.x + lx, edgesX, t); if (s) { lx = s.v - o.x; w = o.w - lx; guides.push({ axis: 'v', pos: s.v }); } }
      if (h.includes('s')) { const s = nearest(o.y + hh, edgesY, t); if (s) { hh = s.v - o.y; guides.push({ axis: 'h', pos: s.v }); } }
      if (h.includes('n')) { const s = nearest(o.y + ly, edgesY, t); if (s) { ly = s.v - o.y; hh = o.h - ly; guides.push({ axis: 'h', pos: s.v }); } }
    }
    this.showGuides(guides);
    // new centre: shift of local centre rotated back to world
    const sx = lx + w / 2 - o.w / 2, sy = ly + hh / 2 - o.h / 2;
    const cx = o.x + o.w / 2 + sx * Math.cos(rot) - sy * Math.sin(rot), cy = o.y + o.h / 2 + sx * Math.sin(rot) + sy * Math.cos(rot);
    resizeElement(el, cx - w / 2, cy - hh / 2, w, hh);
    if (el.type === 'group') this.renderElement(el); else { this.moveNode(el); if (el.type !== 'text' || el.fill || el.stroke) this.renderElement(el); }
    this.app.ui.updateProps?.();
  }
  moveNode(el) {
    const node = this.slideEl.querySelector(`.el[data-id="${el.id}"]`); if (!node) return;
    node.style.left = `${el.x}px`; node.style.top = `${el.y}px`; node.style.width = `${Math.max(el.w, 0)}px`; node.style.height = `${Math.max(el.h, 0)}px`;
    node.style.transform = `${el.rotation ? `rotate(${el.rotation}deg)` : ''} ${el.flipH || el.flipV ? `scale(${el.flipH ? -1 : 1},${el.flipV ? -1 : 1})` : ''}`.trim() || 'none';
    if (el.type === 'text' || el.type === 'shape') { const txt = node.querySelector(':scope > .txt'); if (txt && el.type === 'text') { txt.style.width = `${el.w}px`; txt.style.height = `${el.h}px`; } }
    if (el.type === 'group' || el.type === 'table' || el.type === 'chart' || el.type === 'line' || el.type === 'shape') this.renderElement(el);
  }
  onPointerUp(ev) {
    const d = this.drag; if (!d) return; this.drag = null; this.showGuides([]);
    if (d.kind === 'marquee') { if (d.box) d.box.remove(); this.updateOverlay(); this.app.selectionChanged(); return; }
    if (d.kind === 'insert') {
      if (!d.el) { // simple click: default size
        const el = this.createInsert(d.ins, d.start, true); if (el) { this.slide.elements.push(el); this.select(el.id); }
      } else if (d.el.type !== 'line' && (d.el.w < 8 || d.el.h < 8)) { d.el.w = d.ins.w || 160; d.el.h = d.ins.h || 90; }
      const el = this.single; this.pendingInsert = null; this.area.classList.remove('inserting'); this.app.ui.updateInsertMode?.();
      this.app.commit('Insert'); this.render(); this.select(el ? el.id : []);
      if (el && el.type === 'text') this.startTextEdit(el);
      return;
    }
    if (d.moved) { if (d.kind === 'move' || d.kind === 'resize' || d.kind === 'rotate' || d.kind === 'endpoint') { this.app.commit(d.kind); this.render(); } }
    else if (d.kind === 'move' && this.selection.length > 1 && !ev.shiftKey && !ev.ctrlKey) { const id = this.topLevelAt(ev.target); if (id) this.select(id); }
    this.app.selectionChanged();
  }
  createInsert(ins, pt, defaultSize = false) {
    const w = ins.w || 160, h = ins.h || 90;
    const x = defaultSize ? pt.x - w / 2 : pt.x, y = defaultSize ? pt.y - h / 2 : pt.y;
    const t = this.pres.theme;
    if (ins.type === 'text') return makeText(x, y, defaultSize ? 200 : MIN, defaultSize ? 40 : MIN, { font: t.fonts.body, color: t.text, size: 18 });
    if (ins.type === 'line') { const el = makeLine(pt.x, pt.y, defaultSize ? 160 : 0, 0, { arrowEnd: !!ins.arrow, stroke: { color: t.accents[0], width: 2, dash: 'solid' } }); return el; }
    if (ins.type === 'shape') return makeShape(ins.shape, x, y, defaultSize ? w : MIN, defaultSize ? h : MIN, { fill: { type: 'solid', color: t.accents[0] }, stroke: { color: t.accents[0], width: 1, dash: 'solid' }, color: '#ffffff', font: t.fonts.body });
    return null;
  }
  onDblClick(ev) {
    if (this.editing || this.cellEdit) return;
    const id = this.topLevelAt(ev.target); if (!id) { this.app.ui.showSlideProps?.(); return; }
    const el = findElement(this.slide, id);
    if (el.locked) return;
    if (el.type === 'text' || el.type === 'shape') { this.startTextEdit(el, ev); }
    else if (el.type === 'table') { const c = ev.target.closest('.cell'); if (c) this.startCellEdit(el, +c.dataset.r, +c.dataset.c, ev); }
    else if (el.type === 'chart') this.app.ui.editChartData?.(el);
    else if (el.type === 'image') this.app.replaceImage?.(el);
    else if (el.type === 'group') { /* nothing */ }
  }

  // --- snapping --------------------------------------------------------------------------------
  snapTargets(axis, excludeIds) {
    const ex = new Set(Array.isArray(excludeIds) ? excludeIds : [excludeIds]);
    const W = this.pres.width, H = this.pres.height, t = axis === 'x' ? [0, W / 2, W] : [0, H / 2, H];
    for (const e of this.slide.elements) { if (ex.has(e.id)) continue; const b = boundsOf(e); if (axis === 'x') t.push(b.x, b.x + b.w / 2, b.x + b.w); else t.push(b.y, b.y + b.h / 2, b.y + b.h); }
    return t;
  }
  snapMove(orig, dx, dy) {
    const guides = [];
    if (this.grid) { const g = this.gridSize; const b = unionBounds(orig.map(boundsOf)); dx = Math.round((b.x + dx) / g) * g - b.x; dy = Math.round((b.y + dy) / g) * g - b.y; return { dx, dy, guides }; }
    if (!this.snap) return { dx, dy, guides };
    const b = unionBounds(orig.map(boundsOf)), t = 6 / this.zoom, ids = orig.map((o) => o.id);
    const xs = this.snapTargets('x', ids), ys = this.snapTargets('y', ids);
    let best = null;
    for (const cand of [b.x + dx, b.x + b.w / 2 + dx, b.x + b.w + dx]) { const s = nearest(cand, xs, t); if (s && (!best || Math.abs(s.d) < Math.abs(best.d))) best = s; }
    if (best) { dx += best.d; guides.push({ axis: 'v', pos: best.v }); }
    best = null;
    for (const cand of [b.y + dy, b.y + b.h / 2 + dy, b.y + b.h + dy]) { const s = nearest(cand, ys, t); if (s && (!best || Math.abs(s.d) < Math.abs(best.d))) best = s; }
    if (best) { dy += best.d; guides.push({ axis: 'h', pos: best.v }); }
    return { dx, dy, guides };
  }

  // --- text editing ----------------------------------------------------------------------------
  startTextEdit(el, ev = null, opts = {}) {
    if (this.editing) this.endTextEdit(true);
    const node = this.slideEl.querySelector(`.el[data-id="${el.id}"]`); if (!node) return;
    let txt = node.querySelector(':scope > .txt');
    if (!txt || txt.classList.contains('prompt')) { if (txt) txt.remove(); const tmp = document.createElement('div'); tmp.innerHTML = `<div class="txt"></div>`; txt = tmp.firstElementChild; node.appendChild(txt); }
    txt.innerHTML = textHtml(el, el.text, { editing: true });
    const box = el.type === 'shape' ? this.app.shapeBox?.(el) : null;
    txt.setAttribute('style', node.querySelector(':scope > .txt')?.getAttribute('style') || '');
    if (!txt.getAttribute('style')) txt.setAttribute('style', `left:0;top:0;width:${el.w}px;height:${el.h}px`);
    void box;
    txt.contentEditable = 'true'; txt.classList.add('editing'); node.classList.add('editing'); node.classList.remove('empty-ph');
    txt.spellcheck = true;
    this.editing = { id: el.id, el, txt, node, orig: clone(el.text) };
    this.select(el.id);
    txt.focus();
    const sel = window.getSelection();
    if (ev && document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(ev.clientX, ev.clientY); if (r && txt.contains(r.startContainer)) { sel.removeAllRanges(); sel.addRange(r); } else this.placeCaretEnd(txt); }
    else if (opts.selectAll) { const r = document.createRange(); r.selectNodeContents(txt); sel.removeAllRanges(); sel.addRange(r); }
    else this.placeCaretEnd(txt);
    if (opts.insertText) document.execCommand('insertText', false, opts.insertText);
    this.app.selectionChanged();
  }
  placeCaretEnd(node) { const r = document.createRange(); r.selectNodeContents(node); r.collapse(false); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
  syncEditing() { const e = this.editing; if (!e) return; e.el.text = parseEditedText(e.el, e.txt); this.app.textChanged?.(e.el); }
  endTextEdit(commit = true) {
    const e = this.editing; if (!e) return; this.editing = null;
    e.el.text = parseEditedText(e.el, e.txt);
    e.txt.contentEditable = 'false'; e.txt.classList.remove('editing'); e.node.classList.remove('editing');
    const changed = JSON.stringify(e.el.text) !== JSON.stringify(e.orig);
    if (e.el.type === 'text' && !e.el.ph && isTextEmpty(e.el.text)) { this.slide.elements = this.slide.elements.filter((x) => x.id !== e.el.id); this.selection = this.selection.filter((x) => x !== e.el.id); this.app.commit('Delete empty text'); this.render(); this.app.selectionChanged(); return; }
    if (commit && changed) this.app.commit('Edit text');
    this.render(); this.app.selectionChanged();
  }
  /** Caret as { para, offset } pairs (character offsets within the paragraph, ignoring bullets). */
  getCaret() {
    const e = this.editing; if (!e) return null;
    const sel = window.getSelection(); if (!sel.rangeCount) return null;
    const r = sel.getRangeAt(0); if (!e.txt.contains(r.startContainer)) return null;
    const paras = [...e.txt.querySelectorAll(':scope > .para, :scope > div, :scope > p')];
    const pos = (container, offset) => {
      let block = container.nodeType === 1 && paras.includes(container) ? container : (container.nodeType === 1 ? container : container.parentElement).closest('.para, div, p');
      while (block && !paras.includes(block)) block = block.parentElement && block.parentElement.closest('.para, div, p');
      if (!block) return { para: 0, offset: 0 };
      let off = 0, found = false;
      const walk = (n) => { if (found) return; if (n === container) { if (n.nodeType === 3) off += offset; else { let k = 0; for (const c of n.childNodes) { if (k++ >= offset) break; off += textLen(c); } } found = true; return; } if (n.nodeType === 3) { off += n.textContent.length; return; } if (n.classList && n.classList.contains('bullet')) return; for (const c of n.childNodes) walk(c); };
      const textLen = (n) => (n.nodeType === 3 ? n.textContent.length : n.classList && n.classList.contains('bullet') ? 0 : [...n.childNodes].reduce((a, c) => a + textLen(c), 0));
      walk(block);
      return { para: paras.indexOf(block), offset: off };
    };
    return { start: pos(r.startContainer, r.startOffset), end: pos(r.endContainer, r.endOffset), collapsed: r.collapsed };
  }
  setCaret(c) {
    const e = this.editing; if (!e || !c) return;
    const paras = [...e.txt.querySelectorAll(':scope > .para')];
    const locate = (p) => { const block = paras[Math.min(p.para, paras.length - 1)]; if (!block) return null; let remaining = p.offset; let result = null; const walk = (n) => { if (result) return; if (n.nodeType === 3) { if (remaining <= n.textContent.length) { result = [n, remaining]; return; } remaining -= n.textContent.length; return; } if (n.classList && n.classList.contains('bullet')) return; for (const ch of n.childNodes) walk(ch); }; walk(block); if (!result) { result = [block, block.childNodes.length]; } return result; };
    const s = locate(c.start), en = locate(c.end); if (!s) return;
    const r = document.createRange(); r.setStart(s[0], s[1]); r.setEnd(en ? en[0] : s[0], en ? en[1] : s[1]);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  /** Re-render the editing box from the model and restore the caret. */
  refreshEditing(caret) { const e = this.editing; if (!e) return; e.txt.innerHTML = textHtml(e.el, e.el.text, { editing: true }); this.setCaret(caret); this.app.textChanged?.(e.el); }
  onEditKey(ev) {
    const e = this.editing;
    if (ev.key === 'Escape') { ev.preventDefault(); this.endTextEdit(true); return; }
    if (ev.key === 'Tab') { ev.preventDefault(); this.app.changeIndent(ev.shiftKey ? -1 : 1); return; }
    if (ev.ctrlKey || ev.metaKey) {
      const k = ev.key.toLowerCase();
      if (k === 'b') { ev.preventDefault(); this.app.format('bold'); } else if (k === 'i') { ev.preventDefault(); this.app.format('italic'); } else if (k === 'u') { ev.preventDefault(); this.app.format('underline'); }
      else if (k === 'a') { ev.preventDefault(); const r = document.createRange(); r.selectNodeContents(e.txt); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
      else if (k === 'enter') { ev.preventDefault(); this.endTextEdit(true); }
      else if (k === 'z' || k === 'y') { ev.preventDefault(); this.endTextEdit(true); if (k === 'z' && !ev.shiftKey) this.app.undo(); else this.app.redo(); }
      else if (k === 'e') { ev.preventDefault(); this.app.format('align', 'center'); } else if (k === 'l') { ev.preventDefault(); this.app.format('align', 'left'); } else if (k === 'r') { ev.preventDefault(); this.app.format('align', 'right'); }
      else if (k === 'k') { ev.preventDefault(); this.app.ui.insertLink?.(); }
      return;
    }
    if (ev.key === 'Enter' && !ev.shiftKey) {
      // split paragraph in the model so attributes (bullets, level) carry over cleanly
      ev.preventDefault();
      const c = this.getCaret(); if (!c) return;
      this.syncEditing();
      const paras = e.el.text.paragraphs; const p = paras[c.start.para]; if (!p) return;
      // delete selection first (simple case: within one paragraph)
      if (!c.collapsed && c.start.para === c.end.para) { spliceRuns(p, c.start.offset, c.end.offset); }
      const [a, b] = splitParagraph(p, c.start.offset);
      paras.splice(c.start.para, 1, a, b);
      this.refreshEditing({ start: { para: c.start.para + 1, offset: 0 }, end: { para: c.start.para + 1, offset: 0 } });
      return;
    }
    if (ev.key === 'Backspace') {
      const c = this.getCaret();
      if (c && c.collapsed && c.start.offset === 0 && c.start.para > 0) {
        ev.preventDefault(); this.syncEditing();
        const paras = e.el.text.paragraphs, prev = paras[c.start.para - 1], cur = paras[c.start.para];
        const off = prev.runs.reduce((a, r) => a + r.text.length, 0);
        prev.runs.push(...cur.runs); paras.splice(c.start.para, 1);
        this.refreshEditing({ start: { para: c.start.para - 1, offset: off }, end: { para: c.start.para - 1, offset: off } });
        return;
      }
      if (c && c.collapsed && c.start.offset === 0 && c.start.para === 0) { const p = e.el.text.paragraphs[0]; if (p && (p.bullet || p.level)) { ev.preventDefault(); this.syncEditing(); const q = e.el.text.paragraphs[0]; if (q.level) q.level--; else delete q.bullet; this.refreshEditing(c); } }
    }
    if (ev.key === 'Delete') {
      const c = this.getCaret(); if (!c || !c.collapsed) return;
      this.syncEditing(); const paras = e.el.text.paragraphs, cur = paras[c.start.para]; const len = cur ? cur.runs.reduce((a, r) => a + r.text.length, 0) : 0;
      if (cur && c.start.offset >= len && c.start.para < paras.length - 1) { ev.preventDefault(); cur.runs.push(...paras[c.start.para + 1].runs); paras.splice(c.start.para + 1, 1); this.refreshEditing(c); }
    }
  }
  /** Apply a function to the paragraphs covered by the caret (or all when not editing). */
  editParagraphs(fn) {
    const e = this.editing;
    if (!e) return false;
    const c = this.getCaret(); this.syncEditing();
    const paras = e.el.text.paragraphs;
    const from = c ? Math.min(c.start.para, c.end.para) : 0, to = c ? Math.max(c.start.para, c.end.para) : paras.length - 1;
    for (let i = from; i <= to; i++) if (paras[i]) fn(paras[i], i);
    this.refreshEditing(c); return true;
  }
  /** Apply run props to the selected text while editing. Returns false when no selection. */
  editRuns(props) {
    const e = this.editing; if (!e) return false;
    const c = this.getCaret(); if (!c) return false;
    this.syncEditing();
    const paras = e.el.text.paragraphs;
    if (c.collapsed) return 'collapsed';
    const s = c.start, en = c.end;
    const first = s.para < en.para || (s.para === en.para && s.offset <= en.offset) ? s : en, last = first === s ? en : s;
    for (let i = first.para; i <= last.para; i++) {
      const p = paras[i]; if (!p) continue;
      const a = i === first.para ? first.offset : 0, b = i === last.para ? last.offset : Infinity;
      applyToRange(p, a, b, props, e.el);
    }
    this.refreshEditing(c); return true;
  }
  selectedTextStyle() {
    const e = this.editing; if (!e) return null;
    const c = this.getCaret(); if (!c) return null;
    const p = e.el.text.paragraphs[c.start.para]; if (!p) return null;
    let off = 0; const target = Math.max(0, c.collapsed ? c.start.offset - 1 : Math.min(c.start.offset, c.end.offset));
    for (const r of p.runs) { if (target < off + r.text.length || r === p.runs[p.runs.length - 1]) return { ...r, para: p }; off += r.text.length; }
    return { para: p };
  }

  // --- table cell editing ----------------------------------------------------------------------
  startCellEdit(el, r, c, ev) {
    if (this.cellEdit) this.endCellEdit(true);
    const node = this.slideEl.querySelector(`.el[data-id="${el.id}"] .cell[data-r="${r}"][data-c="${c}"]`); if (!node) return;
    const inner = node.querySelector('.txt-inner'); const cell = el.rows[r][c];
    const plain = cell.text && cell.text.paragraphs ? cell.text.paragraphs.map((p) => p.runs.map((x) => x.text).join('')).join('\n') : String(cell.text || '');
    inner.innerHTML = plain.split('\n').map((l) => `<div class="para">${l ? l.replace(/&/g, '&amp;').replace(/</g, '&lt;') : '<br>'}</div>`).join('');
    inner.contentEditable = 'true'; inner.classList.add('editing'); node.classList.add('editing');
    this.cellEdit = { el, r, c, node, inner, orig: plain };
    this.tableCell = { r, c }; this.select(el.id);
    inner.focus();
    if (ev && document.caretRangeFromPoint) { const rg = document.caretRangeFromPoint(ev.clientX, ev.clientY); const s = window.getSelection(); if (rg && inner.contains(rg.startContainer)) { s.removeAllRanges(); s.addRange(rg); } else this.placeCaretEnd(inner); } else this.placeCaretEnd(inner);
  }
  syncCell() { const ce = this.cellEdit; if (!ce) return; ce.el.rows[ce.r][ce.c].text = cellPlain(ce.inner); this.app.textChanged?.(ce.el); }
  endCellEdit(commit = true) {
    const ce = this.cellEdit; if (!ce) return; this.cellEdit = null;
    const text = cellPlain(ce.inner); ce.el.rows[ce.r][ce.c].text = text;
    ce.inner.contentEditable = 'false'; ce.inner.classList.remove('editing'); ce.node.classList.remove('editing');
    if (commit && text !== ce.orig) this.app.commit('Edit cell');
    this.render(); this.app.selectionChanged();
  }
  onCellKey(ev) {
    const ce = this.cellEdit;
    if (ev.key === 'Escape') { ev.preventDefault(); this.endCellEdit(true); return; }
    if (ev.key === 'Tab') {
      ev.preventDefault(); const el = ce.el; let r = ce.r, c = ce.c + (ev.shiftKey ? -1 : 1);
      if (c >= el.rows[0].length) { c = 0; r++; } if (c < 0) { c = el.rows[0].length - 1; r--; }
      if (r >= el.rows.length) { this.app.tableOp('addRow'); r = el.rows.length - 1; this.render(); }
      if (r < 0) return;
      this.endCellEdit(true); this.startCellEdit(el, r, c);
      const inner = this.cellEdit && this.cellEdit.inner; if (inner) { const rg = document.createRange(); rg.selectNodeContents(inner); const s = window.getSelection(); s.removeAllRanges(); s.addRange(rg); }
      return;
    }
    if (ev.key === 'Enter' && ev.ctrlKey) { ev.preventDefault(); this.endCellEdit(true); }
    if ((ev.ctrlKey || ev.metaKey) && /^[biu]$/i.test(ev.key)) { ev.preventDefault(); this.app.format(ev.key.toLowerCase() === 'b' ? 'bold' : ev.key.toLowerCase() === 'i' ? 'italic' : 'underline'); }
  }
}

function nearest(v, targets, t) { let best = null; for (const x of targets) { const d = x - v; if (Math.abs(d) <= t && (!best || Math.abs(d) < Math.abs(best.d))) best = { v: x, d }; } return best; }
const cellPlain = (inner) => [...inner.childNodes].map((n) => (n.nodeType === 3 ? n.textContent : n.tagName === 'BR' ? '' : n.innerText.replace(/\n$/, ''))).join('\n').replace(/ /g, ' ').replace(/\n+$/, '');
export function splitParagraph(p, offset) {
  const a = { ...p, runs: [] }, b = { ...p, runs: [] }; let off = 0;
  for (const r of p.runs) { const len = r.text.length; if (off + len <= offset) a.runs.push({ ...r }); else if (off >= offset) b.runs.push({ ...r }); else { a.runs.push({ ...r, text: r.text.slice(0, offset - off) }); b.runs.push({ ...r, text: r.text.slice(offset - off) }); } off += len; }
  if (!b.runs.length && a.runs.length) { const last = a.runs[a.runs.length - 1]; b.runs.push({ ...last, text: '' }); }
  b.runs = b.runs.filter((r) => r.text !== '' || b.runs.length === 1);
  if (b.runs.length === 1 && b.runs[0].text === '') b.runs = [];
  return [a, b];
}
export function spliceRuns(p, a, b) { const out = []; let off = 0; for (const r of p.runs) { const len = r.text.length, s = off, e = off + len; off = e; if (e <= a || s >= b) { out.push(r); continue; } const keep = r.text.slice(0, Math.max(0, a - s)) + r.text.slice(Math.min(len, b - s)); if (keep) out.push({ ...r, text: keep }); } p.runs = out; }
export function applyToRange(p, a, b, props, el) {
  const out = []; let off = 0;
  for (const r of p.runs) {
    const len = r.text.length, s = off, e = off + len; off = e;
    if (e <= a || s >= b || len === 0) { out.push(r); continue; }
    const pre = r.text.slice(0, Math.max(0, a - s)), mid = r.text.slice(Math.max(0, a - s), Math.min(len, b - s)), post = r.text.slice(Math.min(len, b - s));
    if (pre) out.push({ ...r, text: pre });
    const nr = { ...r, text: mid };
    for (const [k, v] of Object.entries(props)) { if (typeof v === 'function') nr[k] = v(nr[k] ?? el[k]); else nr[k] = v; if (nr[k] === null || nr[k] === undefined) delete nr[k]; }
    out.push(nr);
    if (post) out.push({ ...r, text: post });
  }
  p.runs = out;
}
export { makeRun, textFromString, uid, rotatePoint };
