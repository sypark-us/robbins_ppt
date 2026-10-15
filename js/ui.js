// UI: ribbon toolbar, file menu, properties panel, slide thumbnails, dialogs, menus, shortcuts.
import { escapeHtml, FONTS, clamp, fontStack, normHex, uid } from './util.js';
import * as M from './model.js';
import { SHAPES, SHAPE_GROUPS, shapePath } from './shapes.js';
import { CHART_TYPES, chartDataToGrid } from './charts.js';
import { slideToSvg } from './svg.js';
import { canvasMeasure } from './textlayout.js';

const TRANSITIONS = [['none', 'None'], ['fade', 'Fade'], ['push', 'Push'], ['wipe', 'Wipe'], ['cover', 'Cover'], ['zoom', 'Zoom'], ['split', 'Split'], ['dissolve', 'Dissolve'], ['wheel', 'Wheel'], ['circle', 'Circle'], ['newsflash', 'Newsflash'], ['cut', 'Cut'], ['random', 'Random']];
const ANIMS = [['none', 'None'], ['appear', 'Appear'], ['fade', 'Fade in'], ['fly', 'Fly in'], ['zoom', 'Zoom in'], ['wipe', 'Wipe'], ['bounce', 'Bounce in'], ['spin', 'Spin in'], ['float', 'Float up']];
const DIRS = [['left', 'From left'], ['right', 'From right'], ['up', 'From top'], ['down', 'From bottom']];
const STD_COLORS = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'];
const I = {
  bold: '<b>B</b>', italic: '<i>I</i>', underline: '<u>U</u>', strike: '<s>S</s>',
  alignL: svg('M3 5h18M3 10h12M3 15h18M3 20h12'), alignC: svg('M3 5h18M6 10h12M3 15h18M6 20h12'), alignR: svg('M3 5h18M9 10h12M3 15h18M9 20h12'), alignJ: svg('M3 5h18M3 10h18M3 15h18M3 20h18'),
  bullets: svg('M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01', 3), numbering: '<span class="ico-txt">1.</span>', indent: svg('M3 12h18M3 6h18M3 18h18M8 9l3 3-3 3', 2), outdent: svg('M3 12h18M3 6h18M3 18h18M11 9l-3 3 3 3', 2),
  undo: svg('M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3'), redo: svg('m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3'),
  cut: svg('M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12'), copy: svg('M8 4h10a2 2 0 0 1 2 2v10M4 8h10a2 2 0 0 1 2 2v10H4z'), paste: svg('M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6v4H9z'),
  text: svg('M4 6V4h16v2M12 4v16M8 20h8'), shape: svg('M4 4h16v16H4z'), line: svg('M4 20 20 4'), arrow: svg('M4 20 20 4M12 4h8v8'), image: svg('M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M16 8h.01', 2), table: svg('M3 4h18v16H3zM3 10h18M3 15h18M9 4v16M15 4v16'), chart: svg('M4 20V8M10 20V4M16 20v-8M22 20H2'),
  play: svg('M6 4l14 8-14 8z'), plus: svg('M12 5v14M5 12h14'), trash: svg('M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3'), dup: svg('M8 8h12v12H8zM4 16V4h12'),
  front: svg('M3 3h10v10H3zM11 11h10v10H11z'), back: svg('M11 11h10v10H11zM3 3h10v10H3z'), group: svg('M3 3h8v8H3zM13 13h8v8h-8zM11 7h6v6'), fill: svg('M12 3 4 11l8 8 8-8zM20 15v6'), outline: svg('M4 4h16v16H4z', 2.5), link: svg('M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1'),
  find: svg('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5'), notes: svg('M4 4h16v12H8l-4 4z'), grid: svg('M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18'), zoomIn: svg('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5M11 8v6M8 11h6'), zoomOut: svg('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5M8 11h6'), fit: svg('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'),
  up: svg('M12 19V5M5 12l7-7 7 7'), down: svg('M12 5v14M5 12l7 7 7-7'), more: svg('M5 12h.01M12 12h.01M19 12h.01', 3), shadow: svg('M4 4h12v12H4zM8 8h12v12H8z'), rotate: svg('M21 12a9 9 0 1 1-3-6.7M21 4v5h-5'), lock: svg('M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4'),
};
function svg(d, w = 1.8) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`; }
const btn = (id, html, title, cls = '') => `<button class="rb ${cls}" data-cmd="${id}" title="${escapeHtml(title)}">${html}</button>`;
const shapeIcon = (s) => `<svg viewBox="-2 -2 44 34" width="22" height="16"><path d="${shapePath(s, 40, 30)}" fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width="1.5"/></svg>`;

export class UI {
  constructor(app) {
    this.app = app; this.tab = 'home'; this.thumbSel = new Set();
    this.$ = (s) => document.querySelector(s);
    this.buildRibbon(); this.buildStatusbar();
    this.$('#thumbs').addEventListener('click', (e) => this.thumbClick(e));
    this.$('#thumbs').addEventListener('contextmenu', (e) => { e.preventDefault(); const t = e.target.closest('.thumb'); if (t) { const i = +t.dataset.i; if (!this.thumbSel.has(i)) { this.thumbSel = new Set([i]); this.app.gotoSlide(i); this.renderThumbs(); } this.contextMenu(e, 'thumb'); } else this.contextMenu(e, 'thumbs'); });
    this.$('#thumbs').addEventListener('dblclick', (e) => { if (!e.target.closest('.thumb')) this.app.newSlide(); });
    this.bindThumbDrag();
    this.$('#notes').addEventListener('input', (e) => { this.app.slide.notes = e.target.value; this.app.textChanged(); });
    this.$('#notes').addEventListener('change', () => this.app.commit('Notes'));
    this.$('#docTitle').addEventListener('change', (e) => { this.app.pres.title = e.target.value.trim() || 'Untitled presentation'; this.app.commit('Title'); this.setTitle(); });
    this.$('#presentBtn').addEventListener('click', () => this.app.startShow(0));
    this.$('#propPanel').addEventListener('change', (e) => this.propChange(e));
    this.$('#propPanel').addEventListener('input', (e) => { if (e.target.matches('input[type=range], input[type=color]')) this.propChange(e, true); });
    this.$('#propPanel').addEventListener('click', (e) => { const b = e.target.closest('[data-cmd]'); if (b) this.cmd(b.dataset.cmd, b.dataset.arg); const c = e.target.closest('[data-color-prop]'); if (c) this.colorPopup(c, c.dataset.colorProp, (v) => this.setPath(c.dataset.colorProp, v)); });
  }

  // --- ribbon -----------------------------------------------------------------------------------
  buildRibbon() {
    const tabs = [['file', 'File'], ['home', 'Home'], ['insert', 'Insert'], ['design', 'Design'], ['transitions', 'Transitions'], ['animations', 'Animations'], ['show', 'Slide Show'], ['view', 'View'], ['help', 'Help']];
    this.$('#ribbonTabs').innerHTML = tabs.map(([id, l]) => `<button class="tab${id === 'home' ? ' active' : ''}${id === 'file' ? ' file' : ''}" data-tab="${id}">${l}</button>`).join('');
    this.$('#ribbonTabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (!t) return; if (t.dataset.tab === 'file') { this.fileMenu(t); return; } if (t.dataset.tab === 'help') { this.helpDialog(); return; } this.setTab(t.dataset.tab); });
    const r = this.$('#ribbon');
    r.addEventListener('click', (e) => { const b = e.target.closest('[data-cmd]'); if (b && !b.disabled) { e.preventDefault(); this.cmd(b.dataset.cmd, b.dataset.arg, b); } });
    r.addEventListener('change', (e) => { const el = e.target.closest('[data-cmd]'); if (el && el.matches('select, input')) this.cmd(el.dataset.cmd, el.value, el); });
    r.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) { this.cmd(e.target.dataset.cmd, e.target.value, e.target); e.target.blur(); } });
    r.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); }); // keep text selection while editing
    this.setTab('home');
  }
  setTab(id) { this.tab = id; for (const t of this.$('#ribbonTabs').querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.tab === id); this.$('#ribbon').innerHTML = this.ribbonHtml(id); this.updateToolbar(); }
  group(label, html, cls = '') { return `<div class="rgroup ${cls}"><div class="ritems">${html}</div><div class="rlabel">${label}</div></div>`; }
  ribbonHtml(id) {
    const g = (l, h, c) => this.group(l, h, c);
    switch (id) {
      case 'home': return [
        g('Slides', btn('newSlideMenu', I.plus + '<span>New slide</span>', 'New slide (Ctrl+M)') + btn('layoutMenu', '<span>Layout ▾</span>', 'Slide layout') + btn('duplicateSlide', I.dup, 'Duplicate slide (Ctrl+Shift+D)') + btn('deleteSlide', I.trash, 'Delete slide')),
        g('Clipboard', btn('cut', I.cut, 'Cut (Ctrl+X)') + btn('copy', I.copy, 'Copy (Ctrl+C)') + btn('paste', I.paste, 'Paste (Ctrl+V)') + btn('duplicate', I.dup, 'Duplicate (Ctrl+D)')),
        g('Undo', btn('undo', I.undo, 'Undo (Ctrl+Z)') + btn('redo', I.redo, 'Redo (Ctrl+Y)')),
        g('Font', `<select class="rsel font" data-cmd="font" title="Font">${FONTS.map((f) => `<option style="font-family:${fontStack(f)}">${f}</option>`).join('')}</select><input class="rnum size" data-cmd="size" type="number" min="4" max="400" step="1" value="18" title="Font size">` + btn('sizeUp', 'A<sup>+</sup>', 'Increase font size (Ctrl+])') + btn('sizeDown', 'A<sup>−</sup>', 'Decrease font size (Ctrl+[)') + btn('bold', I.bold, 'Bold (Ctrl+B)', 'tg') + btn('italic', I.italic, 'Italic (Ctrl+I)', 'tg') + btn('underline', I.underline, 'Underline (Ctrl+U)', 'tg') + btn('strike', I.strike, 'Strikethrough', 'tg') + btn('textColor', '<span class="cbtn"><b>A</b><i class="swatch" data-sw="textColor"></i></span>', 'Font color') + btn('clearFormat', '<span class="ico-txt">A<sub>×</sub></span>', 'Clear formatting')),
        g('Paragraph', btn('bullets', I.bullets, 'Bullets', 'tg') + btn('numbering', I.numbering, 'Numbering', 'tg') + btn('outdent', I.outdent, 'Decrease indent (Shift+Tab)') + btn('indent', I.indent, 'Increase indent (Tab)') + btn('alignLeft', I.alignL, 'Align left (Ctrl+L)', 'tg') + btn('alignCenter', I.alignC, 'Center (Ctrl+E)', 'tg') + btn('alignRight', I.alignR, 'Align right (Ctrl+R)', 'tg') + btn('alignJustify', I.alignJ, 'Justify', 'tg') + btn('lineSpacingMenu', '<span class="ico-txt">↕</span>', 'Line spacing') + btn('valignMenu', '<span class="ico-txt">⇅</span>', 'Vertical alignment')),
        g('Drawing', btn('shapesMenu', I.shape + '<span>Shapes ▾</span>', 'Insert shape') + btn('insertText', I.text, 'Text box') + btn('insertLine', I.line, 'Line') + btn('insertArrow', I.arrow, 'Arrow') + btn('fillColor', '<span class="cbtn">' + I.fill + '<i class="swatch" data-sw="fillColor"></i></span>', 'Shape fill') + btn('strokeColor', '<span class="cbtn">' + I.outline + '<i class="swatch" data-sw="strokeColor"></i></span>', 'Shape outline') + btn('arrangeMenu', I.front + '<span>Arrange ▾</span>', 'Order, align, group, rotate')),
        g('Editing', btn('find', I.find + '<span>Find</span>', 'Find & replace (Ctrl+F)')),
      ].join('');
      case 'insert': return [
        g('Slides', btn('newSlideMenu', I.plus + '<span>New slide</span>', 'New slide') + btn('outline', '<span>Slides from outline…</span>', 'Create slides from a text outline') + btn('duplicateSlide', I.dup + '<span>Duplicate</span>', 'Duplicate slide')),
        g('Tables', btn('tableMenu', I.table + '<span>Table ▾</span>', 'Insert table')),
        g('Images', btn('image', I.image + '<span>Picture</span>', 'Insert picture from file') + btn('imageUrl', '<span>From URL…</span>', 'Insert picture from a web address')),
        g('Illustrations', btn('shapesMenu', I.shape + '<span>Shapes ▾</span>', 'Insert shape') + btn('chartMenu', I.chart + '<span>Chart ▾</span>', 'Insert chart') + btn('insertLine', I.line + '<span>Line</span>', 'Line') + btn('insertArrow', I.arrow + '<span>Arrow</span>', 'Arrow')),
        g('Text', btn('insertText', I.text + '<span>Text box</span>', 'Text box') + btn('headerFooter', '<span>Header & footer…</span>', 'Footer, slide number and date') + btn('insertSlideNumber', '<span>Slide number</span>', 'Insert slide number text') + btn('insertDate', '<span>Date</span>', 'Insert date text') + btn('symbolMenu', '<span>Ω Symbol ▾</span>', 'Insert a symbol')),
        g('Links', btn('link', I.link + '<span>Link</span>', 'Insert hyperlink (Ctrl+K)')),
      ].join('');
      case 'design': return [
        g('Themes', `<div class="themes">${M.THEMES.map((t) => `<button class="theme" data-cmd="theme" data-arg="${t.name}" title="${t.name}" style="background:${t.bg.type === 'solid' ? t.bg.color : `linear-gradient(135deg,${t.bg.from},${t.bg.to})`};color:${t.heading};font-family:${fontStack(t.fonts.heading)}"><span>Aa</span><i style="background:${t.accents[0]}"></i><i style="background:${t.accents[1]}"></i><i style="background:${t.accents[2]}"></i></button>`).join('')}</div>`, 'wide'),
        g('Customize', btn('slideSizeMenu', '<span>Slide size ▾</span>', 'Slide size') + btn('background', '<span>Format background…</span>', 'Slide background') + btn('headerFooter', '<span>Header & footer…</span>', 'Footer, slide number and date')),
      ].join('');
      case 'transitions': return [
        g('Transition to this slide', `<div class="trans">${TRANSITIONS.map(([k, l]) => `<button class="rb tg trans-btn" data-cmd="transition" data-arg="${k}">${l}</button>`).join('')}</div>`, 'wide'),
        g('Effect options', `<select class="rsel" data-cmd="transitionDir" title="Direction">${DIRS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><label class="rlab">Duration <input class="rnum" data-cmd="transitionDuration" type="number" min="0.1" max="10" step="0.1" value="0.7" title="Seconds">s</label>` + btn('previewTransition', I.play + '<span>Preview</span>', 'Preview transition') + btn('transitionAll', '<span>Apply to all</span>', 'Apply this transition to all slides')),
        g('Timing', `<label class="rlab"><input type="checkbox" data-cmd="advanceOn" title="Advance automatically"> After <input class="rnum" data-cmd="advance" type="number" min="0" max="3600" step="0.5" value="5" title="Seconds">s</label>`),
      ].join('');
      case 'animations': return [
        g('Entrance animation', `<div class="trans">${ANIMS.map(([k, l]) => `<button class="rb tg anim-btn" data-cmd="anim" data-arg="${k}">${l}</button>`).join('')}</div>`, 'wide'),
        g('Effect options', `<select class="rsel" data-cmd="animDir" title="Direction">${DIRS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><label class="rlab">Duration <input class="rnum" data-cmd="animDuration" type="number" min="0.1" max="10" step="0.1" value="0.5">s</label><label class="rlab">Delay <input class="rnum" data-cmd="animDelay" type="number" min="0" max="60" step="0.1" value="0">s</label><label class="rlab">Order <input class="rnum" data-cmd="animOrder" type="number" min="1" max="99" step="1" value="1"></label>` + btn('previewAnim', I.play + '<span>Preview</span>', 'Preview animations on this slide') + btn('animRemoveAll', '<span>Remove all</span>', 'Remove animations from this slide')),
      ].join('');
      case 'show': return [
        g('Start slide show', btn('showStart', I.play + '<span>From beginning</span>', 'Start from the first slide (F5)') + btn('showCurrent', I.play + '<span>From current slide</span>', 'Start from this slide (Shift+F5)') + btn('showPresenter', '<span>Presenter view</span>', 'Start with the presenter window (notes, timer, next slide)') + btn('showWindowed', '<span>In window</span>', 'Play without full screen')),
        g('Set up', `<label class="rlab"><input type="checkbox" data-cmd="showLoop"> Loop continuously</label>` + btn('hideSlide', '<span>Hide slide</span>', 'Hide/unhide the current slide in the show', 'tg') + btn('rehearse', '<span>Rehearse timings</span>', 'Run the show and record how long each slide takes')),
      ].join('');
      case 'view': return [
        g('Presentation views', btn('viewNormal', '<span>Normal</span>', 'Normal view', 'tg') + btn('viewSorter', '<span>Slide sorter</span>', 'Slide sorter view', 'tg') + btn('toggleNotes', I.notes + '<span>Notes</span>', 'Show/hide the notes pane', 'tg')),
        g('Zoom', btn('zoomOut', I.zoomOut, 'Zoom out (Ctrl+-)') + `<input class="rnum zoom" data-cmd="zoomSet" type="number" min="10" max="600" step="10" value="100" title="Zoom %">%` + btn('zoomIn', I.zoomIn, 'Zoom in (Ctrl+=)') + btn('zoomFit', I.fit + '<span>Fit</span>', 'Fit slide to window (Ctrl+0)') + btn('zoomWidth', '<span>Fit width</span>', 'Fit slide width')),
        g('Show', btn('toggleGrid', I.grid + '<span>Gridlines</span>', 'Show gridlines', 'tg') + btn('toggleSnap', '<span>Smart guides</span>', 'Snap to other objects', 'tg') + btn('toggleGridSnap', '<span>Snap to grid</span>', 'Snap objects to the grid', 'tg') + btn('toggleProps', '<span>Format pane</span>', 'Show/hide the format pane', 'tg')),
      ].join('');
      default: return '';
    }
  }
  updateToolbar() {
    const r = this.$('#ribbon'), ed = this.app.editor, el = ed.single, sel = ed.selected, slide = this.app.slide;
    const q = (c) => r.querySelector(`[data-cmd="${c}"]`);
    const set = (c, on) => { const b = q(c); if (b) b.classList.toggle('active', !!on); };
    const en = (c, on) => { const b = q(c); if (b) b.disabled = !on; };
    const textEl = el && el.text ? el : null;
    let st = textEl ? { font: textEl.font, size: textEl.size, bold: textEl.bold, italic: textEl.italic, underline: textEl.underline, color: textEl.color, align: textEl.align } : {};
    if (ed.editing) { const s = ed.selectedTextStyle(); if (s) { st = { ...st, ...s }; if (s.para) { st.bullet = s.para.bullet; if (s.para.align) st.align = s.para.align; } } }
    else if (textEl) { const ps = textEl.text.paragraphs; st.bullet = ps.length && ps.every((p) => p.bullet === '•' || p.bullet === true) ? '•' : ps.length && ps.every((p) => p.bullet === 'number') ? 'number' : null; }
    else if (el && el.type === 'table') { st = { font: el.font, size: el.size, color: el.color }; const c = ed.tableCell && el.rows[ed.tableCell.r][ed.tableCell.c]; if (c) { st.bold = c.bold || (el.headerRow && ed.tableCell.r === 0); st.italic = c.italic; st.align = c.align; if (c.size) st.size = c.size; if (c.color) st.color = c.color; } }
    else if (el && el.type === 'chart') st = { font: el.font, size: el.size, color: el.color };
    if (this.tab === 'home') {
      const f = q('font'); if (f) { if (st.font && ![...f.options].some((o) => o.value === st.font)) f.add(new Option(st.font, st.font)); f.value = st.font || ''; }
      const s = q('size'); if (s && document.activeElement !== s) s.value = st.size ? Math.round(st.size * 10) / 10 : '';
      set('bold', st.bold); set('italic', st.italic); set('underline', st.underline); set('strike', st.strike);
      set('bullets', st.bullet === '•'); set('numbering', st.bullet === 'number');
      for (const [c, v] of [['alignLeft', 'left'], ['alignCenter', 'center'], ['alignRight', 'right'], ['alignJustify', 'justify']]) set(c, (st.align || 'left') === v);
      const sw = r.querySelector('[data-sw=textColor]'); if (sw) sw.style.background = st.color || '#000';
      const fsw = r.querySelector('[data-sw=fillColor]'); if (fsw) fsw.style.background = el && el.fill && el.fill.type === 'solid' ? el.fill.color : el && el.fill && el.fill.type === 'gradient' ? `linear-gradient(90deg,${el.fill.from},${el.fill.to})` : 'transparent';
      const ssw = r.querySelector('[data-sw=strokeColor]'); if (ssw) ssw.style.background = el && el.stroke ? el.stroke.color : 'transparent';
      en('undo', this.app.history.canUndo); en('redo', this.app.history.canRedo);
      for (const c of ['cut', 'copy', 'duplicate']) en(c, sel.length > 0); en('paste', !!this.app.clipboard);
      for (const c of ['bold', 'italic', 'underline', 'strike', 'textColor', 'bullets', 'numbering', 'indent', 'outdent', 'alignLeft', 'alignCenter', 'alignRight', 'alignJustify', 'lineSpacingMenu', 'valignMenu', 'sizeUp', 'sizeDown', 'clearFormat']) en(c, sel.length > 0);
      en('fillColor', sel.length > 0); en('strokeColor', sel.length > 0); en('arrangeMenu', sel.length > 0);
    }
    if (this.tab === 'transitions') { for (const b of r.querySelectorAll('.trans-btn')) b.classList.toggle('active', (slide.transition?.type || 'none') === b.dataset.arg); const d = q('transitionDir'); if (d) d.value = slide.transition?.dir || 'left'; const du = q('transitionDuration'); if (du) du.value = slide.transition?.duration ?? 0.7; const ao = q('advanceOn'); if (ao) ao.checked = slide.advance != null; const av = q('advance'); if (av && slide.advance != null) av.value = slide.advance; }
    if (this.tab === 'animations') { const a = el && el.anim; for (const b of r.querySelectorAll('.anim-btn')) { b.classList.toggle('active', (a?.type || 'none') === b.dataset.arg); b.disabled = !el; } const d = q('animDir'); if (d) d.value = a?.dir || 'left'; const du = q('animDuration'); if (du) du.value = a?.duration ?? 0.5; const de = q('animDelay'); if (de) de.value = a?.delay ?? 0; const o = q('animOrder'); if (o) o.value = a?.order ?? 1; }
    if (this.tab === 'show') { set('hideSlide', slide.hidden); const l = q('showLoop'); if (l) l.checked = !!this.app.showLoop; }
    if (this.tab === 'view') { set('viewNormal', !document.body.classList.contains('sorter')); set('viewSorter', document.body.classList.contains('sorter')); set('toggleNotes', !document.body.classList.contains('no-notes')); set('toggleGrid', ed.showGrid); set('toggleSnap', ed.snap); set('toggleGridSnap', ed.grid); set('toggleProps', !document.body.classList.contains('no-props')); this.updateZoom(); }
    const ins = this.$('#statusMsg'); if (ins) ins.textContent = ed.pendingInsert ? 'Click or drag on the slide to place the new object (Esc to cancel)' : ed.editing ? 'Editing text — Esc to finish, Tab/Shift+Tab to change list level' : '';
  }
  updateInsertMode() { this.updateToolbar(); }
  updateUndo() { if (this.tab === 'home') this.updateToolbar(); }
  updateZoom() { const z = Math.round(this.app.editor.zoom * 100); const i = this.$('#ribbon [data-cmd=zoomSet]'); if (i) i.value = z; const s = this.$('#zoomRange'); if (s) s.value = clamp(z, 10, 400); const l = this.$('#zoomLabel'); if (l) l.textContent = z + '%'; }

  // --- commands -----------------------------------------------------------------------------------
  cmd(c, arg, node) {
    const a = this.app, ed = a.editor, el = ed.single;
    switch (c) {
      case 'newSlideMenu': this.menu(node, this.layoutItems((l) => a.newSlide(l)), { thumbs: true }); break;
      case 'layoutMenu': this.menu(node, this.layoutItems((l) => a.setLayout(l, this.thumbSel.size ? [...this.thumbSel] : [a.slideIndex])), { thumbs: true }); break;
      case 'newSlide': a.newSlide(arg); break;
      case 'duplicateSlide': a.duplicateSlide(this.thumbSel.size ? [...this.thumbSel] : [a.slideIndex]); break;
      case 'deleteSlide': a.deleteSlides(this.thumbSel.size ? [...this.thumbSel] : [a.slideIndex]); break;
      case 'cut': a.copy(true); break; case 'copy': a.copy(); break; case 'paste': a.paste(); break; case 'duplicate': a.duplicate(); break;
      case 'undo': a.undo(); break; case 'redo': a.redo(); break;
      case 'font': a.format('font', arg); break;
      case 'size': { const v = parseFloat(arg); if (v > 0) a.format('size', v); break; }
      case 'sizeUp': a.format('sizeStep', 1); break; case 'sizeDown': a.format('sizeStep', -1); break;
      case 'bold': case 'italic': case 'underline': case 'strike': a.format(c); break;
      case 'textColor': this.colorPopup(node, 'color', (v) => a.format('color', v || '#000000'), { noNone: true }); break;
      case 'clearFormat': a.clearFormatting(); break;
      case 'bullets': a.format('bullets'); break; case 'numbering': a.format('numbering'); break;
      case 'indent': a.changeIndent(1); break; case 'outdent': a.changeIndent(-1); break;
      case 'alignLeft': a.format('align', 'left'); break; case 'alignCenter': a.format('align', 'center'); break; case 'alignRight': a.format('align', 'right'); break; case 'alignJustify': a.format('align', 'justify'); break;
      case 'lineSpacingMenu': this.menu(node, [[1, 'Single (1.0)'], [1.15, '1.15'], [1.2, '1.2 (default)'], [1.5, '1.5'], [2, 'Double (2.0)'], [2.5, '2.5'], [3, '3.0']].map(([v, l]) => ({ label: l, action: () => a.format('lineSpacing', v) })).concat([{ sep: true }, { label: 'Bullet style ▸', action: () => this.bulletDialog(node) }])); break;
      case 'valignMenu': this.menu(node, [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']].map(([v, l]) => ({ label: l, action: () => a.format('valign', v) }))); break;
      case 'shapesMenu': this.shapesPopup(node); break;
      case 'insertText': a.insertText(); break; case 'insertLine': a.insertLine(false); break; case 'insertArrow': a.insertLine(true); break;
      case 'insertShape': a.insertShape(arg); break;
      case 'fillColor': this.colorPopup(node, 'fill', (v) => this.setPath('fill', v ? { type: 'solid', color: v } : null), { gradient: true }); break;
      case 'strokeColor': this.colorPopup(node, 'stroke', (v) => { for (const e of ed.selected) e.stroke = v ? { ...(e.stroke || { width: 1, dash: 'solid' }), color: v } : null; a.commit('Outline'); ed.render(); this.updateProps(); }); break;
      case 'arrangeMenu': this.menu(node, this.arrangeItems()); break;
      case 'arrange': a.arrange(arg); break;
      case 'find': this.findDialog(); break;
      case 'outline': this.outlineDialog(); break;
      case 'tableMenu': this.tablePicker(node); break;
      case 'insertTable': { const [r, cc] = String(arg).split('x').map(Number); a.insertTable(r, cc); break; }
      case 'image': this.pickFile('image/*', true).then((f) => f && a.insertImageFiles(f)); break;
      case 'imageUrl': this.prompt('Picture URL', 'https://').then(async (u) => { if (!u) return; try { this.busy('Loading…'); const res = await fetch(u); const blob = await res.blob(); await a.insertImageFiles([new File([blob], u.split('/').pop() || 'image', { type: blob.type || 'image/png' })]); } catch (e) { this.alert('Could not load the image (the site may block cross-origin requests): ' + e.message); } finally { this.busy(null); } }); break;
      case 'chartMenu': this.menu(node, CHART_TYPES.map(([k, l]) => ({ label: l, action: () => a.insertChart(k) }))); break;
      case 'headerFooter': this.footerDialog(); break;
      case 'insertSlideNumber': a.addElement(M.makeText(a.pres.width - 120, a.pres.height - 40, 100, 28, { text: M.textFromString(String(a.slideIndex + 1)), align: 'right', size: 12, color: a.pres.theme.text, font: a.pres.theme.fonts.body })); break;
      case 'insertDate': a.addElement(M.makeText(20, a.pres.height - 40, 200, 28, { text: M.textFromString(new Date().toLocaleDateString()), size: 12, color: a.pres.theme.text, font: a.pres.theme.fonts.body })); break;
      case 'symbolMenu': this.symbolPopup(node); break;
      case 'link': this.insertLink(); break;
      case 'theme': a.setTheme(arg); break;
      case 'slideSizeMenu': this.menu(node, Object.keys(M.SLIDE_SIZES).map((k) => ({ label: `${k} (${Math.round(M.SLIDE_SIZES[k][0])}×${Math.round(M.SLIDE_SIZES[k][1])} pt)`, action: () => a.setSlideSize(k), checked: M.SLIDE_SIZES[k][0] === a.pres.width && M.SLIDE_SIZES[k][1] === a.pres.height }))); break;
      case 'background': this.showSlideProps(); break;
      case 'transition': a.setTransition({ type: arg }); break;
      case 'transitionDir': a.setTransition({ dir: arg }); break;
      case 'transitionDuration': a.setTransition({ duration: clamp(parseFloat(arg) || 0.7, 0.1, 10) }); break;
      case 'transitionAll': a.setTransition({ ...a.slide.transition }, true); for (const s of a.pres.slides) s.advance = a.slide.advance; a.commit('Apply to all'); this.toast('Transition applied to all slides'); break;
      case 'advanceOn': { const on = node.checked; const v = parseFloat(this.$('#ribbon [data-cmd=advance]')?.value) || 5; a.slide.advance = on ? v : null; a.commit('Advance'); break; }
      case 'advance': { a.slide.advance = parseFloat(arg) || 0; const cb = this.$('#ribbon [data-cmd=advanceOn]'); if (cb) cb.checked = true; a.commit('Advance'); break; }
      case 'previewTransition': this.previewTransition(); break;
      case 'anim': { if (!el) break; const anims = M.flattenElements(a.slide).filter((e) => e.anim && e.anim.type !== 'none'); for (const e of ed.selected) e.anim = arg === 'none' ? null : { type: arg, dir: e.anim?.dir || 'left', duration: e.anim?.duration || 0.5, delay: e.anim?.delay || 0, order: e.anim?.order || anims.length + 1 }; a.commit('Animation'); ed.render(); this.updateToolbar(); this.updateProps(); break; }
      case 'animDir': case 'animDuration': case 'animDelay': case 'animOrder': { for (const e of ed.selected) if (e.anim) e.anim[{ animDir: 'dir', animDuration: 'duration', animDelay: 'delay', animOrder: 'order' }[c]] = c === 'animDir' ? arg : parseFloat(arg) || 0; a.commit('Animation'); break; }
      case 'previewAnim': this.previewAnimations(); break;
      case 'animRemoveAll': M.forEachElement(a.slide, (e) => { e.anim = null; }); a.commit('Remove animations'); ed.render(); this.updateToolbar(); break;
      case 'showStart': a.startShow(0, { loop: a.showLoop }); break; case 'showCurrent': a.startShow(a.slideIndex, { loop: a.showLoop }); break;
      case 'showPresenter': a.startShow(a.slideIndex, { presenter: true, loop: a.showLoop }); break; case 'showWindowed': a.startShow(a.slideIndex, { windowed: true, loop: a.showLoop }); break;
      case 'showLoop': a.showLoop = node.checked; break;
      case 'hideSlide': a.slide.hidden = !a.slide.hidden; a.commit('Hide slide'); this.renderThumbs(); this.updateToolbar(); break;
      case 'rehearse': this.rehearse(); break;
      case 'viewNormal': document.body.classList.remove('sorter'); ed.fitZoom(); this.updateToolbar(); break;
      case 'viewSorter': document.body.classList.add('sorter'); this.renderThumbs(); this.updateToolbar(); break;
      case 'toggleNotes': document.body.classList.toggle('no-notes'); ed.fitZoom(ed.fitMode || 'fit'); this.updateToolbar(); break;
      case 'toggleProps': document.body.classList.toggle('no-props'); ed.fitZoom(ed.fitMode || 'fit'); this.updateToolbar(); break;
      case 'zoomIn': ed.fitMode = null; ed.setZoom(ed.zoom * 1.2); break; case 'zoomOut': ed.fitMode = null; ed.setZoom(ed.zoom / 1.2); break;
      case 'zoomSet': ed.fitMode = null; ed.setZoom((parseFloat(arg) || 100) / 100); break;
      case 'zoomFit': ed.fitZoom('fit'); break; case 'zoomWidth': ed.fitZoom('width'); break;
      case 'toggleGrid': ed.showGrid = !ed.showGrid; ed.render(); this.updateToolbar(); break;
      case 'toggleSnap': ed.snap = !ed.snap; this.updateToolbar(); break; case 'toggleGridSnap': ed.grid = !ed.grid; this.updateToolbar(); break;
      case 'editChart': if (el && el.type === 'chart') this.editChartData(el); break;
      case 'tableOp': a.tableOp(arg); break;
      case 'replaceImage': if (el) a.replaceImage(el); break;
      case 'resetCrop': if (el) { delete el.crop; a.commit('Crop'); ed.render(); this.updateProps(); } break;
      case 'resetSize': if (el && el.type === 'image' && el.naturalW) { const sc = Math.min(1, (a.pres.width * 0.9) / el.naturalW, (a.pres.height * 0.9) / el.naturalH); el.w = el.naturalW * sc; el.h = el.naturalH * sc; a.commit('Reset size'); ed.render(); this.updateProps(); } break;
      case 'bgImage': this.pickFile('image/*').then(async (f) => { if (!f) return; const { assetId } = await a.addImageAsset(f); a.setBackground({ type: 'image', assetId, fit: 'cover', color: '#000000' }); this.updateProps(); }); break;
      case 'bgReset': a.setBackground(null); this.updateProps(); break;
      case 'bgAll': a.setBackground(a.slide.background, true); this.toast('Background applied to all slides'); break;
      case 'removeAnim': for (const e of ed.selected) e.anim = null; a.commit('Animation'); ed.render(); this.updateProps(); break;
      case 'editText': if (el) ed.startTextEdit(el, null, { selectAll: true }); break;
      case 'slideProps': ed.clearSelection(); break;
      default: console.warn('unknown command', c);
    }
  }
  layoutItems(fn) { return M.LAYOUTS.map((l) => ({ label: l.name, html: this.layoutThumb(l.id) + `<span>${l.name}</span>`, action: () => fn(l.id) })); }
  layoutThumb(id) { const p = this.app.pres, els = M.layoutElements(id, p); const W = p.width, H = p.height; return `<svg class="layout-thumb" viewBox="0 0 ${W} ${H}" width="64" height="${(64 * H) / W}"><rect width="${W}" height="${H}" fill="#fff" stroke="#999" stroke-width="8"/>${els.map((e) => `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" fill="${e.ph === 'title' || e.ph === 'ctitle' || e.ph === 'section' ? '#cbd5e1' : '#e2e8f0'}" stroke="#94a3b8" stroke-width="6" stroke-dasharray="20 14"/>`).join('')}</svg>`; }
  arrangeItems() {
    const sel = this.app.editor.selected, single = sel.length === 1, multi = sel.length > 1, hasGroup = sel.some((e) => e.type === 'group');
    const it = (label, arg, dis = false) => ({ label, action: () => this.app.arrange(arg), disabled: dis });
    return [it('Bring to front', 'front'), it('Bring forward', 'forward'), it('Send backward', 'backward'), it('Send to back', 'back'), { sep: true },
      { label: 'Align', sub: [it('Align left', 'alignLeft'), it('Align center', 'alignCenter'), it('Align right', 'alignRight'), it('Align top', 'alignTop'), it('Align middle', 'alignMiddle'), it('Align bottom', 'alignBottom'), { sep: true }, it('Distribute horizontally', 'distributeH', sel.length < 3), it('Distribute vertically', 'distributeV', sel.length < 3), { sep: true }, it('Center on slide', 'center')] },
      { label: 'Rotate', sub: [it('Rotate right 90°', 'rotateCW'), it('Rotate left 90°', 'rotateCCW'), it('Flip horizontal', 'flipH'), it('Flip vertical', 'flipV')] },
      { sep: true }, it('Group (Ctrl+G)', 'group', !multi), it('Ungroup (Ctrl+Shift+G)', 'ungroup', !hasGroup), { sep: true }, { label: single && sel[0].locked ? 'Unlock' : 'Lock position', action: () => this.app.arrange('lock'), disabled: !sel.length }];
  }

  // --- popups -----------------------------------------------------------------------------------------
  menu(anchor, items, opts = {}) {
    this.closeMenus();
    this.openingMenu = true; setTimeout(() => { this.openingMenu = false; }, 0); // the click that opened us is still bubbling
    const layer = this.$('#menuLayer'); const m = document.createElement('div'); m.className = 'menu' + (opts.thumbs ? ' thumbs-menu' : '');
    const build = (list) => list.map((it) => it.sep ? '<div class="sep"></div>' : `<div class="mi${it.disabled ? ' disabled' : ''}${it.checked ? ' checked' : ''}${it.sub ? ' has-sub' : ''}">${it.html || escapeHtml(it.label)}${it.shortcut ? `<span class="sc">${it.shortcut}</span>` : ''}${it.sub ? `<div class="menu sub">${build(it.sub)}</div>` : ''}</div>`).join('');
    m.innerHTML = build(items);
    const attach = (node, list) => { [...node.children].filter((c) => c.classList.contains('mi')).forEach((mi, i) => { const it = list.filter((x) => !x.sep)[i]; if (it.sub) attach(mi.querySelector('.menu.sub'), it.sub); else mi.addEventListener('click', (e) => { e.stopPropagation(); if (it.disabled) return; this.closeMenus(); it.action?.(); }); }); };
    attach(m, items);
    layer.appendChild(m);
    let x, y;
    if (anchor instanceof Event || (anchor && anchor.clientX !== undefined)) { x = anchor.clientX; y = anchor.clientY; } else { const r = anchor.getBoundingClientRect(); x = r.left; y = r.bottom + 2; }
    m.style.left = `${Math.min(x, innerWidth - m.offsetWidth - 8)}px`; m.style.top = `${Math.min(y, innerHeight - m.offsetHeight - 8)}px`;
    layer.classList.add('on');
    return m;
  }
  closeMenus() { const l = this.$('#menuLayer'); l.innerHTML = ''; l.classList.remove('on'); }
  popup(anchor, html, cls = '') { const m = this.menu(anchor, []); m.className = 'menu popup ' + cls; m.innerHTML = html; const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.clientX, bottom: anchor.clientY }; m.style.left = `${Math.min(r.left, innerWidth - m.offsetWidth - 8)}px`; m.style.top = `${Math.min(r.bottom + 2, innerHeight - m.offsetHeight - 8)}px`; return m; }
  contextMenu(ev, kind) {
    const a = this.app, ed = a.editor, el = ed.single, sel = ed.selected;
    if (kind === 'thumb' || kind === 'thumbs') {
      const items = [{ label: 'New slide', action: () => a.newSlide(), shortcut: 'Ctrl+M' }, { label: 'Duplicate slide', action: () => a.duplicateSlide([...this.thumbSel]) }, { label: 'Delete slide', action: () => a.deleteSlides([...this.thumbSel]) }, { sep: true }, { label: 'Layout', sub: this.layoutItems((l) => a.setLayout(l, [...this.thumbSel])) }, { label: a.slide.hidden ? 'Unhide slide' : 'Hide slide', action: () => this.cmd('hideSlide') }, { label: 'Format background…', action: () => this.showSlideProps() }];
      this.menu(ev, items, { thumbs: true }); return;
    }
    if (kind === 'slide' || !sel.length) { this.menu(ev, [{ label: 'Paste', action: () => a.paste(ed.toSlide(ev)), disabled: !a.clipboard, shortcut: 'Ctrl+V' }, { label: 'New slide', action: () => a.newSlide() }, { sep: true }, { label: 'Format background…', action: () => this.showSlideProps() }, { label: 'Slide layout', sub: this.layoutItems((l) => a.setLayout(l)) }, { label: 'Select all', action: () => ed.selectAll(), shortcut: 'Ctrl+A' }]); return; }
    const items = [{ label: 'Cut', action: () => a.copy(true), shortcut: 'Ctrl+X' }, { label: 'Copy', action: () => a.copy(), shortcut: 'Ctrl+C' }, { label: 'Paste', action: () => a.paste(), disabled: !a.clipboard, shortcut: 'Ctrl+V' }, { label: 'Duplicate', action: () => a.duplicate(), shortcut: 'Ctrl+D' }, { label: 'Delete', action: () => a.deleteSelected(), shortcut: 'Del' }, { sep: true }];
    if (el && (el.type === 'text' || el.type === 'shape')) items.push({ label: 'Edit text', action: () => ed.startTextEdit(el, null, { selectAll: true }), shortcut: 'F2' });
    if (el && el.type === 'chart') items.push({ label: 'Edit chart data…', action: () => this.editChartData(el) });
    if (el && el.type === 'image') items.push({ label: 'Replace picture…', action: () => a.replaceImage(el) }, { label: 'Crop…', action: () => this.cropDialog(el) });
    if (el && el.type === 'table') items.push({ label: 'Table', sub: [{ label: 'Insert row above', action: () => a.tableOp('addRowAbove') }, { label: 'Insert row below', action: () => a.tableOp('addRow') }, { label: 'Insert column left', action: () => a.tableOp('addColLeft') }, { label: 'Insert column right', action: () => a.tableOp('addCol') }, { sep: true }, { label: 'Delete row', action: () => a.tableOp('delRow') }, { label: 'Delete column', action: () => a.tableOp('delCol') }, { sep: true }, { label: 'Distribute columns', action: () => a.tableOp('equalCols') }, { label: 'Distribute rows', action: () => a.tableOp('equalRows') }] });
    items.push({ label: 'Hyperlink…', action: () => this.insertLink(), shortcut: 'Ctrl+K' }, { sep: true }, ...this.arrangeItems(), { sep: true }, { label: 'Format…', action: () => { document.body.classList.remove('no-props'); this.updateProps(); } });
    this.menu(ev, items);
  }
  shapesPopup(anchor) {
    const html = SHAPE_GROUPS.map((g) => `<div class="sg-title">${g.name}</div><div class="sg">${g.items.map((s) => `<button class="shape-btn" data-shape="${s}" title="${SHAPES[s].name}">${shapeIcon(s)}</button>`).join('')}</div>`).join('') + `<div class="sg-title">Lines</div><div class="sg"><button class="shape-btn" data-line="0" title="Line">${I.line}</button><button class="shape-btn" data-line="1" title="Arrow">${I.arrow}</button><button class="shape-btn" data-text="1" title="Text box">${I.text}</button></div>`;
    const m = this.popup(anchor, html, 'shapes');
    m.addEventListener('click', (e) => { const b = e.target.closest('.shape-btn'); if (!b) return; this.closeMenus(); if (b.dataset.shape) this.app.insertShape(b.dataset.shape); else if (b.dataset.line !== undefined) this.app.insertLine(b.dataset.line === '1'); else this.app.insertText(); });
  }
  symbolPopup(anchor) {
    const syms = '©®™°±×÷≠≈≤≥∞∑√∫∆Ωμπ→←↑↓↔⇒⇔•●○■□▲►▼◄★☆✓✗♠♣♥♦€£¥¢§¶†‡…–—“”‘’«»¿¡αβγδεθλσφω½¼¾²³';
    const m = this.popup(anchor, `<div class="sg symbols">${[...syms].map((s) => `<button class="shape-btn sym" data-sym="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}</div>`, 'symbols');
    m.addEventListener('click', (e) => { const b = e.target.closest('.sym'); if (!b) return; const s = b.dataset.sym; this.closeMenus(); const ed = this.app.editor; if (ed.editing) { document.execCommand('insertText', false, s); ed.syncEditing(); } else if (ed.single && ed.single.text) { ed.startTextEdit(ed.single); document.execCommand('insertText', false, s); ed.syncEditing(); } else this.app.addElement(M.makeText(this.app.pres.width / 2 - 40, this.app.pres.height / 2 - 20, 80, 40, { text: M.textFromString(s), size: 24, align: 'center', color: this.app.pres.theme.text })); });
  }
  tablePicker(anchor) {
    let html = '<div class="tpick-grid">'; for (let r = 1; r <= 8; r++) for (let c = 1; c <= 10; c++) html += `<i data-r="${r}" data-c="${c}"></i>`; html += '</div><div class="tpick-label">Insert table</div><div class="tpick-custom"><label>Rows <input type="number" min="1" max="50" value="3"></label><label>Cols <input type="number" min="1" max="20" value="3"></label><button class="primary">Insert</button></div>';
    const m = this.popup(anchor, html, 'tpick'); const label = m.querySelector('.tpick-label');
    m.addEventListener('mouseover', (e) => { const i = e.target.closest('i'); if (!i) return; const r = +i.dataset.r, c = +i.dataset.c; for (const cell of m.querySelectorAll('i')) cell.classList.toggle('on', +cell.dataset.r <= r && +cell.dataset.c <= c); label.textContent = `${c} × ${r} table`; });
    m.addEventListener('click', (e) => { const i = e.target.closest('i'); if (i) { this.closeMenus(); this.app.insertTable(+i.dataset.r, +i.dataset.c); return; } if (e.target.closest('button.primary')) { const [r, c] = [...m.querySelectorAll('input')].map((x) => +x.value); this.closeMenus(); this.app.insertTable(clamp(r, 1, 50), clamp(c, 1, 20)); } });
  }
  colorPopup(anchor, prop, apply, opts = {}) {
    const t = this.app.pres.theme; const theme = [t.bg.type === 'solid' ? t.bg.color : t.bg.from, t.text, t.heading, ...t.accents, '#FFFFFF', '#000000'];
    const recent = this.recentColors || [];
    const sw = (c) => `<i class="csw" data-c="${c}" style="background:${c}" title="${c}"></i>`;
    const html = `<div class="cp-title">Theme colors</div><div class="cp-row">${theme.map(sw).join('')}</div><div class="cp-row">${theme.map((c) => [0.8, 0.6, 0.4, -0.25, -0.5].map((k) => sw(k > 0 ? mix(c, '#ffffff', k) : mix(c, '#000000', -k))).join('')).join('')}</div><div class="cp-title">Standard colors</div><div class="cp-row">${STD_COLORS.map(sw).join('')}</div>${recent.length ? `<div class="cp-title">Recent</div><div class="cp-row">${recent.map(sw).join('')}</div>` : ''}<div class="cp-actions">${opts.noNone ? '' : '<button data-none="1">No fill</button>'}<label class="cp-custom">Custom <input type="color"></label>${opts.gradient ? '<button data-grad="1">Gradient…</button>' : ''}</div>`;
    const m = this.popup(anchor, html, 'colors');
    const pick = (c) => { this.recentColors = [c, ...(this.recentColors || []).filter((x) => x !== c)].slice(0, 10); this.closeMenus(); apply(c); };
    m.addEventListener('click', (e) => { const i = e.target.closest('.csw'); if (i) { pick(i.dataset.c); return; } if (e.target.closest('[data-none]')) { this.closeMenus(); apply(null); } if (e.target.closest('[data-grad]')) { this.closeMenus(); this.gradientDialog(); } });
    const inp = m.querySelector('input[type=color]'); inp.addEventListener('input', () => apply(inp.value)); inp.addEventListener('change', () => pick(inp.value));
  }
  async gradientDialog() {
    const el = this.app.editor.single; if (!el) return; const g = el.fill && el.fill.type === 'gradient' ? el.fill : { from: this.app.pres.theme.accents[0], to: this.app.pres.theme.accents[1], angle: 90 };
    const ok = await this.dialog({ title: 'Gradient fill', html: `<label>From <input type="color" id="gFrom" value="${normHex(g.from)}"></label><label>To <input type="color" id="gTo" value="${normHex(g.to)}"></label><label>Angle <input type="number" id="gAng" min="0" max="360" value="${g.angle || 0}">°</label>` });
    if (!ok) return;
    this.setPath('fill', { type: 'gradient', from: ok.querySelector('#gFrom').value, to: ok.querySelector('#gTo').value, angle: +ok.querySelector('#gAng').value });
  }

  // --- file menu -----------------------------------------------------------------------------------------
  fileMenu(anchor) {
    const a = this.app;
    this.menu(anchor, [
      { label: 'New presentation', action: () => a.newDocument(), shortcut: 'Ctrl+N' }, { label: 'New from theme', sub: M.THEMES.map((t) => ({ label: t.name, action: () => a.newDocument(t.name) })) },
      { label: 'Open… (.pptx, .json)', action: () => a.openFile(), shortcut: 'Ctrl+O' }, { label: 'Open sample presentation', action: async () => { if (!a.dirty || (await this.confirm('Discard unsaved changes?'))) a.load(M.demoPresentation()); } }, { sep: true },
      { label: 'Save (.json)', action: () => a.save(), shortcut: 'Ctrl+S' }, { label: 'Save as…', action: () => a.save(true), shortcut: 'Ctrl+Shift+S' }, { label: 'Save as PowerPoint (.pptx)', action: () => a.exportPptx(), shortcut: 'Ctrl+Shift+E' }, { sep: true },
      { label: 'Export', sub: [{ label: 'PDF', action: () => a.exportAs('pdf') }, { label: 'PNG images (all slides)', action: () => a.exportAs('png') }, { label: 'PNG of current slide', action: () => a.exportAs('pngCurrent') }, { label: 'JPEG images', action: () => a.exportAs('jpg') }, { label: 'SVG (vector)', action: () => a.exportAs('svg') }, { label: 'HTML slide show', action: () => a.exportAs('html') }] },
      { label: 'Print…', action: () => this.printDialog(), shortcut: 'Ctrl+P' }, { sep: true },
      { label: 'Presentation properties…', action: () => this.propsDialog() }, { label: 'Keyboard shortcuts', action: () => this.helpDialog() },
    ]);
  }

  // --- status bar -----------------------------------------------------------------------------------------
  buildStatusbar() {
    const s = this.$('#statusbar');
    s.innerHTML = `<span id="statusSlide"></span><span id="statusMsg" class="dim"></span><span class="spacer"></span><button class="sb" data-cmd="toggleNotes" title="Notes">${I.notes} Notes</button><button class="sb" data-cmd="viewNormal" title="Normal view">▭</button><button class="sb" data-cmd="viewSorter" title="Slide sorter">▦</button><button class="sb" data-cmd="showCurrent" title="Slide show from current slide (Shift+F5)">${I.play}</button><button class="sb" data-cmd="zoomOut">−</button><input id="zoomRange" type="range" min="10" max="400" value="100"><button class="sb" data-cmd="zoomIn">+</button><span id="zoomLabel">100%</span><button class="sb" data-cmd="zoomFit" title="Fit slide to window">${I.fit}</button>`;
    s.addEventListener('click', (e) => { const b = e.target.closest('[data-cmd]'); if (b) this.cmd(b.dataset.cmd); });
    this.$('#zoomRange').addEventListener('input', (e) => { this.app.editor.fitMode = null; this.app.editor.setZoom(e.target.value / 100); });
  }
  refreshAll() {
    const a = this.app;
    this.$('#statusSlide').textContent = `Slide ${a.slideIndex + 1} of ${a.pres.slides.length}`;
    const n = this.$('#notes'); if (document.activeElement !== n) n.value = a.slide.notes || '';
    this.thumbSel = new Set([a.slideIndex]); this.highlightThumbs();
    this.updateToolbar(); this.updateProps();
  }
  setTitle() { const t = this.$('#docTitle'); if (document.activeElement !== t) t.value = this.app.pres.title; document.title = `${this.app.dirty ? '• ' : ''}${this.app.pres.title} — RobbinsPPT`; }
  toast(msg, ms = 2500) { const t = this.$('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove('on'), ms); }
  busy(msg) { const b = this.$('#busy'); if (!msg) { b.classList.remove('on'); return; } b.querySelector('span').textContent = msg; b.classList.add('on'); }

  // --- thumbnails ---------------------------------------------------------------------------------------
  renderThumbs() {
    const a = this.app, c = this.$('#thumbs');
    const scrollTop = c.scrollTop;
    c.innerHTML = a.pres.slides.map((s, i) => `<div class="thumb${s.hidden ? ' hidden-slide' : ''}" data-i="${i}" draggable="false"><span class="n">${i + 1}</span><div class="thumb-img">${slideToSvg(a.pres, s, { measure: canvasMeasure, index: i, width: 240 })}</div>${s.transition && s.transition.type !== 'none' ? '<span class="tr" title="Has transition">★</span>' : ''}${s.hidden ? '<span class="hid" title="Hidden slide">⊘</span>' : ''}</div>`).join('') + '<div class="thumb-add" title="New slide (double-click here or Ctrl+M)">+ New slide</div>';
    c.scrollTop = scrollTop; this.highlightThumbs();
  }
  highlightThumbs() { for (const t of this.$('#thumbs').querySelectorAll('.thumb')) { const i = +t.dataset.i; t.classList.toggle('current', i === this.app.slideIndex); t.classList.toggle('selected', this.thumbSel.has(i)); } const cur = this.$('#thumbs .thumb.current'); if (cur) cur.scrollIntoView({ block: 'nearest' }); }
  thumbClick(e) {
    if (e.target.closest('.thumb-add')) { this.app.newSlide(undefined, this.app.pres.slides.length); return; }
    const t = e.target.closest('.thumb'); if (!t) return; const i = +t.dataset.i;
    if (e.shiftKey) { const lo = Math.min(i, this.app.slideIndex), hi = Math.max(i, this.app.slideIndex); for (let k = lo; k <= hi; k++) this.thumbSel.add(k); }
    else if (e.ctrlKey || e.metaKey) { if (this.thumbSel.has(i) && this.thumbSel.size > 1) this.thumbSel.delete(i); else this.thumbSel.add(i); }
    else { this.app.gotoSlide(i); this.thumbSel = new Set([i]); }
    this.highlightThumbs();
  }
  bindThumbDrag() {
    const c = this.$('#thumbs'); let drag = null;
    c.addEventListener('pointerdown', (e) => { const t = e.target.closest('.thumb'); if (!t || e.button !== 0) return; drag = { i: +t.dataset.i, x: e.clientX, y: e.clientY, active: false }; });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.active) { if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return; drag.active = true; if (!this.thumbSel.has(drag.i)) { this.thumbSel = new Set([drag.i]); this.highlightThumbs(); } c.classList.add('dragging'); }
      const thumbs = [...c.querySelectorAll('.thumb')]; let to = thumbs.length; const sorter = document.body.classList.contains('sorter');
      for (const t of thumbs) { const r = t.getBoundingClientRect(); if (sorter ? (e.clientY < r.top + r.height / 2 && e.clientX < r.left + r.width / 2) || e.clientY < r.top : e.clientY < r.top + r.height / 2) { to = +t.dataset.i; break; } }
      drag.to = to; for (const t of thumbs) t.classList.toggle('drop-before', +t.dataset.i === to); c.querySelector('.thumb-add').classList.toggle('drop-before', to === thumbs.length);
    });
    window.addEventListener('pointerup', () => { if (!drag) return; const d = drag; drag = null; c.classList.remove('dragging'); for (const t of c.querySelectorAll('.drop-before')) t.classList.remove('drop-before'); if (!d.active || d.to === undefined) return; const idx = [...this.thumbSel].sort((a, b) => a - b); if (idx.includes(d.to) || (idx.length === 1 && d.to === idx[0] + 1)) return; this.app.moveSlides(idx, d.to); });
  }

  // --- properties panel --------------------------------------------------------------------------------------
  updateProps() {
    const p = this.$('#propPanel'), a = this.app, ed = a.editor, el = ed.single, sel = ed.selected;
    const f = (label, inner) => `<label class="pf"><span>${label}</span>${inner}</label>`;
    const num = (prop, v, o = {}) => `<input type="number" data-prop="${prop}" value="${v === undefined || v === null ? '' : Math.round(v * 100) / 100}" step="${o.step || 1}"${o.min !== undefined ? ` min="${o.min}"` : ''}${o.max !== undefined ? ` max="${o.max}"` : ''}>`;
    const col = (prop, v) => `<button class="colbtn" data-color-prop="${prop}"><i style="background:${v || 'transparent'}"></i>${v ? v : 'None'}</button>`;
    const chk = (prop, v, label) => `<label class="pchk"><input type="checkbox" data-prop="${prop}"${v ? ' checked' : ''}> ${label}</label>`;
    const selct = (prop, v, opts) => `<select data-prop="${prop}">${opts.map(([k, l]) => `<option value="${k}"${String(k) === String(v) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    const sec = (title, inner) => `<div class="psec"><h4>${title}</h4>${inner}</div>`;
    if (!sel.length) {
      const s = a.slide, bg = s.background, t = a.pres.theme, bgt = bg ? bg.type : 'theme';
      p.innerHTML = `<div class="ptitle">Slide ${a.slideIndex + 1}</div>` +
        sec('Layout', `<select data-slide="layout">${M.LAYOUTS.map((l) => `<option value="${l.id}"${s.layout === l.id ? ' selected' : ''}>${l.name}</option>`).join('')}</select>`) +
        sec('Background', f('Type', `<select data-bg="type">${[['theme', 'Theme default'], ['solid', 'Solid color'], ['gradient', 'Gradient'], ['image', 'Picture']].map(([k, l]) => `<option value="${k}"${bgt === k ? ' selected' : ''}>${l}</option>`).join('')}</select>`) +
          (bgt === 'solid' ? f('Color', `<input type="color" data-bg="color" value="${normHex(bg.color, '#ffffff')}">`) : '') +
          (bgt === 'gradient' ? f('From', `<input type="color" data-bg="from" value="${normHex(bg.from)}">`) + f('To', `<input type="color" data-bg="to" value="${normHex(bg.to)}">`) + f('Angle', `<input type="number" data-bg="angle" value="${bg.angle || 0}" min="0" max="360">`) : '') +
          (bgt === 'image' ? f('Picture', `<button data-cmd="bgImage">Choose…</button>`) + f('Fit', `<select data-bg="fit">${[['cover', 'Fill'], ['fit', 'Fit'], ['stretch', 'Stretch']].map(([k, l]) => `<option value="${k}"${(bg.fit || 'cover') === k ? ' selected' : ''}>${l}</option>`).join('')}</select>`) : '') +
          `<div class="prow"><button data-cmd="bgAll">Apply to all</button><button data-cmd="bgReset">Reset</button></div>`) +
        sec('Transition', f('Effect', `<select data-slide="transition.type">${TRANSITIONS.map(([k, l]) => `<option value="${k}"${(s.transition?.type || 'none') === k ? ' selected' : ''}>${l}</option>`).join('')}</select>`) + f('Direction', `<select data-slide="transition.dir">${DIRS.map(([k, l]) => `<option value="${k}"${(s.transition?.dir || 'left') === k ? ' selected' : ''}>${l}</option>`).join('')}</select>`) + f('Duration (s)', `<input type="number" data-slide="transition.duration" value="${s.transition?.duration ?? 0.7}" min="0.1" max="10" step="0.1">`) + f('Auto-advance (s)', `<input type="number" data-slide="advance" value="${s.advance ?? ''}" min="0" step="0.5" placeholder="off">`)) +
        sec('Theme', `<div class="prow">${M.THEMES.map((th) => `<button class="theme mini${t.name === th.name ? ' active' : ''}" data-cmd="theme" data-arg="${th.name}" title="${th.name}" style="background:${th.bg.type === 'solid' ? th.bg.color : `linear-gradient(135deg,${th.bg.from},${th.bg.to})`};color:${th.heading}">Aa</button>`).join('')}</div>`) +
        sec('Slide', chk('slide.hidden', s.hidden, 'Hidden in slide show') + `<div class="prow"><button data-cmd="duplicateSlide">Duplicate</button><button data-cmd="deleteSlide">Delete</button></div>`);
      return;
    }
    let html = '';
    const multi = sel.length > 1;
    if (!el) html += `<div class="ptitle">${sel.length} objects selected</div>`;
    else html += `<div class="ptitle">${{ text: 'Text box', shape: (SHAPES[el.shape]?.name || 'Shape'), line: 'Line', image: 'Picture', table: 'Table', chart: 'Chart', group: 'Group' }[el.type] || el.type}${el.ph ? ' (placeholder)' : ''}</div>`;
    const e0 = el || sel[0];
    html += sec('Size & position', `<div class="pgrid">${f('X', num('x', e0.x, { step: 1 }))}${f('Y', num('y', e0.y, { step: 1 }))}${f('Width', num('w', e0.w, { min: 1 }))}${f('Height', num('h', e0.h, { min: 1 }))}${f('Rotation', num('rotation', e0.rotation || 0, { step: 1 }))}${f('Opacity', `<input type="range" data-prop="opacity" min="0" max="1" step="0.05" value="${e0.opacity ?? 1}">`)}</div>${chk('locked', e0.locked, 'Lock position & size')}`);
    if (el && (el.type === 'shape' || el.type === 'text')) {
      const fl = el.fill, ft = fl ? fl.type : 'none';
      html += sec('Fill', f('Type', selct('fill.type', ft, [['none', 'No fill'], ['solid', 'Solid'], ['gradient', 'Gradient']])) + (ft === 'solid' ? f('Color', col('fill.color', fl.color)) + f('Transparency', `<input type="range" data-prop="fill.opacity" min="0" max="1" step="0.05" value="${fl.opacity ?? 1}">`) : '') + (ft === 'gradient' ? f('From', col('fill.from', fl.from)) + f('To', col('fill.to', fl.to)) + f('Angle', num('fill.angle', fl.angle || 0, { min: 0, max: 360 })) : ''));
      if (el.type === 'shape') html += sec('Shape', f('Preset', `<select data-prop="shape">${Object.entries(SHAPES).map(([k, s]) => `<option value="${k}"${el.shape === k ? ' selected' : ''}>${s.name}</option>`).join('')}${el.shape === 'custom' ? '<option value="custom" selected>Custom</option>' : ''}</select>`) + chk('shadow', el.shadow, 'Shadow'));
    }
    if (el && el.type !== 'group' && el.type !== 'table' && el.type !== 'chart') {
      const st = el.stroke;
      html += sec(el.type === 'line' ? 'Line' : 'Outline', f('Color', col('stroke.color', st ? st.color : null)) + (st ? f('Width', num('stroke.width', st.width, { min: 0, step: 0.5 })) + f('Style', selct('stroke.dash', st.dash || 'solid', [['solid', 'Solid'], ['dash', 'Dashed'], ['dot', 'Dotted'], ['dashDot', 'Dash-dot']])) : '') + (el.type === 'line' ? chk('arrowStart', el.arrowStart, 'Arrow at start') + chk('arrowEnd', el.arrowEnd, 'Arrow at end') + chk('shadow', el.shadow, 'Shadow') : ''));
    }
    if (el && (el.type === 'text' || el.type === 'shape')) {
      html += sec('Text', `<div class="pgrid">${f('Font', `<select data-prop="font">${FONTS.map((x) => `<option${el.font === x ? ' selected' : ''}>${x}</option>`).join('')}${FONTS.includes(el.font) ? '' : `<option selected>${escapeHtml(el.font)}</option>`}</select>`)}${f('Size', num('size', el.size, { min: 4 }))}${f('Color', col('color', el.color))}${f('Align', selct('align', el.align, [['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['justify', 'Justify']]))}${f('Vertical', selct('valign', el.valign, [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']]))}${f('Line spacing', num('lineHeight', el.lineHeight, { min: 0.5, step: 0.1 }))}${f('Padding', num('padding', el.padding, { min: 0 }))}${f('Autofit', selct('autofit', el.autofit || 'none', [['none', 'Do not autofit'], ['shrink', 'Shrink text on overflow']]))}</div>${chk('bold', el.bold, 'Bold')} ${chk('italic', el.italic, 'Italic')} ${chk('underline', el.underline, 'Underline')}<div class="prow"><button data-cmd="editText">Edit text</button><button data-cmd="link">Hyperlink…</button></div>`);
    }
    if (el && el.type === 'image') html += sec('Picture', f('Corner radius', num('radius', el.radius || 0, { min: 0 })) + chk('shadow', el.shadow, 'Shadow') + `<div class="prow"><button data-cmd="replaceImage">Replace…</button><button data-cmd="resetSize">Original size</button>${el.crop ? '<button data-cmd="resetCrop">Remove crop</button>' : ''}</div>` + f('Link', `<input type="text" data-prop="link" value="${escapeHtml(el.link || '')}" placeholder="https://">`));
    if (el && el.type === 'table') {
      const st = el.style || {}, cell = ed.tableCell ? el.rows[ed.tableCell.r][ed.tableCell.c] : null;
      html += sec('Table', `<div class="pgrid">${f('Font', `<select data-prop="font">${FONTS.map((x) => `<option${el.font === x ? ' selected' : ''}>${x}</option>`).join('')}</select>`)}${f('Size', num('size', el.size, { min: 4 }))}${f('Text color', col('color', el.color))}${f('Header fill', col('style.headerFill', st.headerFill))}${f('Header text', col('style.headerColor', st.headerColor))}${f('Band fill', col('style.bandFill', st.bandFill))}${f('Cell fill', col('style.fill', st.fill))}${f('Borders', col('style.borderColor', st.borderColor))}${f('Border width', num('style.borderWidth', st.borderWidth ?? 1, { min: 0, step: 0.5 }))}</div>${chk('headerRow', el.headerRow, 'Header row')} ${chk('bandRows', el.bandRows, 'Banded rows')}<div class="prow"><button data-cmd="tableOp" data-arg="addRow">+ Row</button><button data-cmd="tableOp" data-arg="addCol">+ Column</button><button data-cmd="tableOp" data-arg="delRow">− Row</button><button data-cmd="tableOp" data-arg="delCol">− Column</button></div>`);
      if (cell) html += sec(`Cell ${ed.tableCell.r + 1},${ed.tableCell.c + 1}`, `<div class="pgrid">${f('Fill', col('cell.fill', cell.fill))}${f('Text color', col('cell.color', cell.color))}${f('Align', selct('cell.align', cell.align || 'left', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']]))}${f('Vertical', selct('cell.valign', cell.valign || 'middle', [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']]))}</div>${chk('cell.bold', cell.bold, 'Bold')} ${chk('cell.italic', cell.italic, 'Italic')}`);
    }
    if (el && el.type === 'chart') html += sec('Chart', `<div class="pgrid">${f('Type', selct('chartType', el.chartType, CHART_TYPES))}${f('Title', `<input type="text" data-prop="title" value="${escapeHtml(el.title || '')}">`)}${f('Font', `<select data-prop="font">${FONTS.map((x) => `<option${el.font === x ? ' selected' : ''}>${x}</option>`).join('')}</select>`)}${f('Font size', num('size', el.size, { min: 4 }))}${f('Text color', col('color', el.color))}${f('Background', col('fill.color', el.fill ? el.fill.color : null))}</div>${chk('legend', el.legend !== false, 'Legend')} ${chk('labels', el.labels, 'Data labels')} ${chk('gridlines', el.gridlines !== false, 'Gridlines')}<div class="prow"><button data-cmd="editChart" class="primary">Edit data…</button></div>`);
    if (el && el.type === 'group') html += sec('Group', `<div class="prow"><button data-cmd="arrange" data-arg="ungroup">Ungroup</button></div>`);
    const an = e0.anim;
    html += sec('Animation', f('Entrance', selct('anim.type', an ? an.type : 'none', ANIMS)) + (an ? f('Direction', selct('anim.dir', an.dir || 'left', DIRS)) + `<div class="pgrid">${f('Duration', num('anim.duration', an.duration ?? 0.5, { min: 0.1, step: 0.1 }))}${f('Delay', num('anim.delay', an.delay ?? 0, { min: 0, step: 0.1 }))}${f('Order', num('anim.order', an.order ?? 1, { min: 1 }))}</div><div class="prow"><button data-cmd="previewAnim">Preview</button><button data-cmd="removeAnim">Remove</button></div>` : ''));
    if (el) html += sec('Arrange', `<div class="prow"><button data-cmd="arrange" data-arg="front" title="Bring to front">${I.front}</button><button data-cmd="arrange" data-arg="back" title="Send to back">${I.back}</button><button data-cmd="arrange" data-arg="alignCenter" title="Center horizontally">${I.alignC}</button><button data-cmd="arrange" data-arg="alignMiddle" title="Center vertically">⇕</button><button data-cmd="arrange" data-arg="rotateCW" title="Rotate 90°">${I.rotate}</button><button data-cmd="arrange" data-arg="flipH" title="Flip horizontal">⇋</button></div>`);
    else html += sec('Arrange', `<div class="prow"><button data-cmd="arrange" data-arg="group">Group</button><button data-cmd="arrange" data-arg="alignLeft">⇤</button><button data-cmd="arrange" data-arg="alignCenter">${I.alignC}</button><button data-cmd="arrange" data-arg="alignRight">⇥</button><button data-cmd="arrange" data-arg="alignTop">⤒</button><button data-cmd="arrange" data-arg="alignMiddle">⇕</button><button data-cmd="arrange" data-arg="alignBottom">⤓</button><button data-cmd="arrange" data-arg="distributeH">⇹ H</button><button data-cmd="arrange" data-arg="distributeV">⇳ V</button></div>`);
    if (multi || el) html += `<div class="prow"><button data-cmd="slideProps">Slide properties</button></div>`;
    p.innerHTML = html;
    p.scrollTop = this.propScroll || 0;
  }
  propChange(e, live = false) {
    const t = e.target, a = this.app, ed = a.editor;
    this.propScroll = this.$('#propPanel').scrollTop;
    const val = t.type === 'checkbox' ? t.checked : t.type === 'number' || t.type === 'range' ? (t.value === '' ? null : parseFloat(t.value)) : t.value;
    if (t.dataset.slide) {
      const key = t.dataset.slide, s = a.slide;
      if (key === 'layout') { a.setLayout(val); return; }
      if (key === 'advance') { s.advance = val; }
      else if (key === 'slide.hidden') s.hidden = val;
      else setPathValue(s, key, val);
      a.commit('Slide'); this.renderThumbs(); this.updateToolbar(); return;
    }
    if (t.dataset.bg) {
      const key = t.dataset.bg, cur = a.slide.background, th = a.pres.theme;
      if (key === 'type') { if (val === 'theme') a.setBackground(null); else if (val === 'solid') a.setBackground({ type: 'solid', color: M.slideBgColor(a.pres, a.slide) }); else if (val === 'gradient') a.setBackground({ type: 'gradient', from: th.accents[0], to: th.accents[4], angle: 135 }); else if (val === 'image') { this.cmd('bgImage'); return; } this.updateProps(); return; }
      if (cur) { cur[key] = val; a.commit('Background'); if (!live) { ed.render(); this.updateProps(); } else ed.render(); }
      return;
    }
    if (t.dataset.prop) { this.setPath(t.dataset.prop, val, live); }
  }
  /** Set a (dotted) property on all selected elements, with special cases, then commit. */
  setPath(path, val, live = false) {
    const a = this.app, ed = a.editor, sel = ed.selected;
    for (const el of sel) {
      if (path.startsWith('cell.')) { if (el.type === 'table' && ed.tableCell) el.rows[ed.tableCell.r][ed.tableCell.c][path.slice(5)] = val; continue; }
      if (path === 'fill' ) { el.fill = val; continue; }
      if (path === 'fill.type') { if (val === 'none') el.fill = null; else if (val === 'solid') el.fill = { type: 'solid', color: el.fill && el.fill.from ? el.fill.from : a.pres.theme.accents[0] }; else el.fill = { type: 'gradient', from: el.fill && el.fill.color ? el.fill.color : a.pres.theme.accents[0], to: a.pres.theme.accents[1], angle: 90 }; continue; }
      if (path === 'fill.color' && val === null) { el.fill = null; continue; }
      if (path.startsWith('fill.') && !el.fill) el.fill = { type: 'solid', color: a.pres.theme.accents[0] };
      if (path === 'stroke.color') { el.stroke = val ? { ...(el.stroke || { width: 1, dash: 'solid' }), color: val } : null; continue; }
      if (path.startsWith('stroke.') && !el.stroke) el.stroke = { color: '#000000', width: 1, dash: 'solid' };
      if (path === 'anim.type') { el.anim = val === 'none' ? null : { type: val, dir: el.anim?.dir || 'left', duration: el.anim?.duration || 0.5, delay: el.anim?.delay || 0, order: el.anim?.order || 1 }; continue; }
      if (path.startsWith('anim.') && !el.anim) continue;
      if (path === 'w' || path === 'h') { const nw = path === 'w' ? val : el.w, nh = path === 'h' ? val : el.h; M.resizeElement(el, el.x, el.y, Math.max(1, nw), Math.max(1, nh)); continue; }
      if (path === 'x' || path === 'y') { M.moveElement(el, path === 'x' ? val - el.x : 0, path === 'y' ? val - el.y : 0); continue; }
      if (path === 'shape' && el.type === 'shape') { el.shape = val; delete el.prst; if (val !== 'custom') delete el.geom; continue; }
      if (path === 'link') { el.link = val || null; continue; }
      if ((path === 'bold' || path === 'italic' || path === 'underline' || path === 'color' || path === 'font' || path === 'size') && el.text) { for (const p of el.text.paragraphs) for (const r of p.runs) delete r[path]; }
      if (path === 'align' && el.text) for (const p of el.text.paragraphs) delete p.align;
      if (path.startsWith('style.') && el.type === 'table') { el.style ||= {}; }
      setPathValue(el, path, val);
    }
    if (live) { ed.render(); return; }
    a.commit('Property'); ed.render(); this.updateProps(); this.updateToolbar();
  }
  showSlideProps() { this.app.editor.clearSelection(); document.body.classList.remove('no-props'); this.updateProps(); }

  // --- dialogs ----------------------------------------------------------------------------------------------
  dialog({ title, html, okLabel = 'OK', cancelLabel = 'Cancel', width = 420, buttons = null, validate = null }) {
    return new Promise((resolve) => {
      const layer = this.$('#dialogLayer');
      const d = document.createElement('div'); d.className = 'dialog'; d.style.width = `${width}px`;
      d.innerHTML = `<div class="dtitle">${escapeHtml(title)}</div><div class="dbody">${html}</div><div class="dbtns">${buttons ? buttons.map((b, i) => `<button data-i="${i}" class="${b.primary ? 'primary' : ''}">${escapeHtml(b.label)}</button>`).join('') : `${cancelLabel ? `<button data-cancel="1">${escapeHtml(cancelLabel)}</button>` : ''}<button class="primary" data-ok="1">${escapeHtml(okLabel)}</button>`}</div>`;
      layer.appendChild(d); layer.classList.add('on');
      const close = (v) => { d.remove(); if (!layer.children.length) layer.classList.remove('on'); resolve(v); };
      d.addEventListener('click', async (e) => { const b = e.target.closest('button'); if (!b || !b.closest('.dbtns')) return; if (b.dataset.cancel) close(null); else if (b.dataset.ok) { if (validate && !(await validate(d))) return; close(d); } else if (b.dataset.i !== undefined) { const r = await buttons[+b.dataset.i].action?.(d); if (r !== false) close(r ?? d); } });
      d.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(null); if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && !buttons) { e.preventDefault(); d.querySelector('[data-ok]')?.click(); } });
      const first = d.querySelector('input, textarea, select'); if (first) { first.focus(); if (first.select) first.select(); } else d.querySelector('.primary')?.focus();
    });
  }
  async alert(msg) { await this.dialog({ title: 'RobbinsPPT', html: `<p>${escapeHtml(msg)}</p>`, cancelLabel: '' }); }
  async confirm(msg) { return !!(await this.dialog({ title: 'Confirm', html: `<p>${escapeHtml(msg)}</p>` })); }
  async prompt(title, value = '') { const d = await this.dialog({ title, html: `<input type="text" id="pv" value="${escapeHtml(value)}" style="width:100%">` }); return d ? d.querySelector('#pv').value : null; }
  pickFile(accept, multiple = false, withHandle = false) {
    return new Promise(async (res) => {
      if (withHandle && window.showOpenFilePicker) { try { const [h] = await window.showOpenFilePicker({ types: [{ description: 'Presentations', accept: { 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'], 'application/json': ['.json'] } }], multiple: false }); res({ file: await h.getFile(), handle: h }); return; } catch (e) { if (e.name === 'AbortError') { res(null); return; } } }
      const i = this.$('#fileInput'); i.accept = accept; i.multiple = multiple; i.value = '';
      i.onchange = () => { const files = [...i.files]; res(withHandle ? (files[0] ? { file: files[0], handle: null } : null) : multiple ? files : files[0] || null); };
      i.click();
    });
  }
  async findDialog() {
    const d = await this.dialog({ title: 'Find and replace', html: `<label>Find <input type="text" id="fTxt" style="width:100%"></label><label>Replace with <input type="text" id="rTxt" style="width:100%"></label><div id="fRes" class="dim"></div>`, buttons: [{ label: 'Find next', action: (dd) => { const t = dd.querySelector('#fTxt').value; dd.querySelector('#fRes').textContent = this.app.findNext(t) ? 'Found on slide ' + (this.app.slideIndex + 1) : 'Not found'; return false; } }, { label: 'Replace all', action: (dd) => { const n = this.app.find(dd.querySelector('#fTxt').value, dd.querySelector('#rTxt').value, true); dd.querySelector('#fRes').textContent = `Replaced ${n} occurrence${n === 1 ? '' : 's'}`; return false; } }, { label: 'Close', primary: true }] });
    void d;
  }
  async outlineDialog() {
    const d = await this.dialog({ title: 'Slides from outline', width: 560, html: `<p class="dim">One slide per heading line starting with <code>#</code>; the lines below become bullets (indent with two spaces for sub-levels).</p><textarea id="ol" rows="12" style="width:100%" placeholder="# First slide title\n- First bullet\n- Second bullet\n  - Sub-bullet\n# Second slide"></textarea>`, okLabel: 'Create slides' });
    if (d) this.app.importOutline(d.querySelector('#ol').value);
  }
  async footerDialog() {
    const f = this.app.pres.footer;
    const d = await this.dialog({ title: 'Header and footer', html: `<label class="pchk"><input type="checkbox" id="hfDate"${f.showDate ? ' checked' : ''}> Date</label><input type="text" id="hfDateText" value="${escapeHtml(f.dateText || '')}" placeholder="Leave empty for today's date" style="width:100%"><label class="pchk"><input type="checkbox" id="hfNum"${f.showNumber ? ' checked' : ''}> Slide number</label><label class="pchk"><input type="checkbox" id="hfFooter"${f.text ? ' checked' : ''}> Footer</label><input type="text" id="hfText" value="${escapeHtml(f.text || '')}" placeholder="Footer text" style="width:100%">`, okLabel: 'Apply to all' });
    if (!d) return;
    this.app.pres.footer = { showDate: d.querySelector('#hfDate').checked, dateText: d.querySelector('#hfDateText').value, showNumber: d.querySelector('#hfNum').checked, text: d.querySelector('#hfFooter').checked ? d.querySelector('#hfText').value : '' };
    this.app.commit('Footer'); this.app.refresh();
  }
  async insertLink() {
    const ed = this.app.editor, el = ed.single; if (!el) return;
    const cur = ed.editing ? (ed.selectedTextStyle()?.link || '') : el.link || '';
    const d = await this.dialog({ title: 'Hyperlink', html: `<label>Address <input type="text" id="lk" value="${escapeHtml(cur)}" placeholder="https://example.com" style="width:100%"></label><p class="dim">${ed.editing ? 'Applies to the selected text.' : 'Applies to the whole object. Links open when clicked during the slide show.'}</p>`, buttons: [{ label: 'Remove link', action: () => 'remove' }, { label: 'Cancel', action: () => null }, { label: 'OK', primary: true, action: (dd) => dd.querySelector('#lk').value.trim() || null }] });
    if (d === null || d === undefined) return;
    const url = d === 'remove' ? null : d;
    if (ed.editing) { const r = ed.editRuns({ link: url }); if (r === 'collapsed') { el.link = url; } this.app.textChanged(); }
    else { el.link = url; this.app.commit('Link'); ed.render(); this.updateProps(); }
  }
  bulletDialog(anchor) {
    const items = [['•', 'Filled circle •'], ['◦', 'Hollow circle ◦'], ['▪', 'Square ▪'], ['–', 'Dash –'], ['✓', 'Check ✓'], ['➤', 'Arrow ➤'], ['★', 'Star ★'], ['number', 'Numbers 1. 2. 3.'], ['alpha', 'Letters a. b. c.'], ['roman', 'Roman i. ii. iii.'], ['', 'None']];
    this.menu(anchor || this.$('#ribbon [data-cmd=lineSpacingMenu]') || this.$('#ribbon'), items.map(([v, l]) => ({ label: l, action: () => this.app.format('bulletStyle', v) })));
  }
  async propsDialog() {
    const p = this.app.pres, d = await this.dialog({ title: 'Presentation properties', html: `<label>Title <input type="text" id="pt" value="${escapeHtml(p.title)}" style="width:100%"></label><p class="dim">Slides: ${p.slides.length} · Size: ${Math.round(p.width)} × ${Math.round(p.height)} pt · Theme: ${escapeHtml(p.theme.name)} · Pictures: ${Object.keys(p.assets).length}</p>` });
    if (d) { p.title = d.querySelector('#pt').value.trim() || p.title; this.app.commit('Title'); this.setTitle(); }
  }
  async printDialog() {
    const d = await this.dialog({ title: 'Print', html: `<label>Layout <select id="pl"><option value="1">One slide per page</option><option value="2">Two slides per page</option><option value="4">Four slides per page (handout)</option><option value="6">Six slides per page (handout)</option><option value="notes">Slide with notes</option></select></label><p class="dim">A print preview opens in a new tab. Choose "Save as PDF" there for a vector PDF, or use File › Export › PDF.</p>`, okLabel: 'Print' });
    if (!d) return; const v = d.querySelector('#pl').value; this.app.print(v === 'notes' ? { perPage: 1, notes: true } : { perPage: +v });
  }
  async cropDialog(el) {
    const c = el.crop || { l: 0, t: 0, r: 0, b: 0 };
    const d = await this.dialog({ title: 'Crop picture (percent from each edge)', html: `<div class="pgrid">${['l', 't', 'r', 'b'].map((k) => `<label class="pf"><span>${{ l: 'Left', t: 'Top', r: 'Right', b: 'Bottom' }[k]}</span><input type="number" id="cr_${k}" min="0" max="90" value="${Math.round((c[k] || 0) * 100)}"></label>`).join('')}</div>` });
    if (!d) return;
    el.crop = Object.fromEntries(['l', 't', 'r', 'b'].map((k) => [k, clamp(+d.querySelector(`#cr_${k}`).value, 0, 90) / 100])); this.app.commit('Crop'); this.app.editor.render(); this.updateProps();
  }
  async editChartData(el) {
    const grid = chartDataToGrid(el); const tsv = grid.map((r) => r.join('\t')).join('\n');
    const d = await this.dialog({ title: 'Chart data', width: 620, html: `<p class="dim">First row: series names. First column: categories. Separate cells with Tab or commas (paste directly from a spreadsheet).</p><textarea id="cd" rows="12" style="width:100%;font-family:Consolas,monospace;white-space:pre">${escapeHtml(tsv)}</textarea><div class="pgrid"><label class="pf"><span>Type</span><select id="ct">${CHART_TYPES.map(([k, l]) => `<option value="${k}"${el.chartType === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label class="pf"><span>Title</span><input type="text" id="ctitle" value="${escapeHtml(el.title || '')}"></label></div>`, okLabel: 'Update chart' });
    if (!d) return;
    const rows = d.querySelector('#cd').value.split(/\r?\n/).filter((l) => l.trim()).map((l) => (l.includes('\t') ? l.split('\t') : l.split(',')).map((x) => x.trim()));
    el.chartType = d.querySelector('#ct').value; el.title = d.querySelector('#ctitle').value;
    this.app.setChartData(el, rows);
  }
  helpDialog() {
    const rows = [['Ctrl+S / Ctrl+Shift+S', 'Save / Save as (.json)'], ['Ctrl+Shift+E', 'Save as PowerPoint (.pptx)'], ['Ctrl+O', 'Open .pptx or .json'], ['Ctrl+M', 'New slide'], ['Ctrl+Shift+D', 'Duplicate slide'], ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'], ['Ctrl+C / X / V / D', 'Copy / Cut / Paste / Duplicate'], ['Ctrl+A', 'Select all'], ['Delete', 'Delete selection'], ['Arrows (+Shift)', 'Nudge 1 pt (10 pt)'], ['Enter / F2', 'Edit text of the selected object'], ['Esc', 'Finish editing / deselect / cancel'], ['Tab / Shift+Tab', 'Next object · in text: change list level'], ['Ctrl+B / I / U', 'Bold / Italic / Underline'], ['Ctrl+L / E / R', 'Align left / center / right'], ['Ctrl+] / Ctrl+[', 'Grow / shrink font'], ['Ctrl+G / Ctrl+Shift+G', 'Group / Ungroup'], ['Ctrl+K', 'Hyperlink'], ['Ctrl+F', 'Find and replace'], ['Ctrl+P', 'Print'], ['Ctrl+= / Ctrl+- / Ctrl+0', 'Zoom in / out / fit'], ['Ctrl+wheel', 'Zoom'], ['PgUp / PgDn', 'Previous / next slide'], ['F5 / Shift+F5', 'Slide show from start / current'], ['Shift+drag', 'Keep proportions / constrain movement'], ['Alt+drag', 'Drag a copy of the selection'], ['Drop files', 'Drop pictures to insert them, or a .pptx/.json to open it']];
    this.dialog({ title: 'RobbinsPPT — keyboard shortcuts', width: 560, html: `<table class="keys">${rows.map(([k, v]) => `<tr><td><kbd>${escapeHtml(k)}</kbd></td><td>${escapeHtml(v)}</td></tr>`).join('')}</table><p class="dim">Everything runs locally in your browser. Files never leave your computer.</p>`, cancelLabel: '', okLabel: 'Close' });
  }

  // --- previews ------------------------------------------------------------------------------------------------
  previewTransition() { const a = this.app; if (a.slide.transition?.type === 'none') { this.toast('No transition on this slide'); return; } a.show.start(Math.max(0, a.slideIndex - 1), { windowed: true, preview: true }); const s = a.show; setTimeout(() => s.next(), 200); setTimeout(() => s.stop(), 200 + (a.slide.transition.duration || 0.7) * 1000 + 600); }
  previewAnimations() { const a = this.app, s = a.show; s.start(a.slideIndex, { windowed: true, preview: true }); let k = 0; const n = s.anims.length; if (!n) { this.toast('No animations on this slide'); s.stop(); return; } const tick = () => { if (!s.active) return; if (k++ < n) { s.next(); setTimeout(tick, 900); } else setTimeout(() => s.stop(), 600); }; setTimeout(tick, 300); }
  rehearse() { const a = this.app; a.rehearseTimes = []; a.startShow(0, { loop: false }); const s = a.show; let last = Date.now(), lastPos = s.pos; const orig = s.showSlide.bind(s); s.showSlide = (pos, dir, imm) => { const now = Date.now(); a.pres.slides[s.order[lastPos].i].advance = Math.round((now - last) / 100) / 10; last = now; lastPos = pos; orig(pos, dir, imm); }; const origStop = s.stop.bind(s); s.stop = () => { a.pres.slides[s.order[lastPos].i].advance = Math.round((Date.now() - last) / 100) / 10; s.showSlide = orig; s.stop = origStop; origStop(); a.commit('Rehearse'); this.toast('Timings saved as auto-advance on each slide'); this.updateToolbar(); }; }

  // --- global events ---------------------------------------------------------------------------------------------
  bindGlobal() {
    const a = this.app, ed = a.editor;
    document.addEventListener('keydown', (e) => this.key(e));
    document.addEventListener('paste', (e) => a.pasteEvent(e));
    document.addEventListener('click', (e) => { if (this.openingMenu) return; if (!e.target.closest('#menuLayer') && !e.target.closest('.menu')) this.closeMenus(); });
    // A click on the empty backdrop (not on a menu) closes the menu and goes through to the ribbon tab/button underneath, so e.g. File ▸ Home works in one click.
    this.$('#menuLayer').addEventListener('click', (e) => { if (e.target !== e.currentTarget) return; this.closeMenus(); const under = document.elementFromPoint(e.clientX, e.clientY); const btn = under && under.closest('#ribbonTabs .tab, #ribbon button'); if (btn) btn.click(); });
    document.addEventListener('contextmenu', (e) => { if (!e.target.closest('#canvasArea') && !e.target.closest('#thumbs') && !e.target.matches('input, textarea')) e.preventDefault(); });
    document.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    document.addEventListener('drop', async (e) => { e.preventDefault(); const files = [...e.dataTransfer.files]; if (!files.length) return; const doc = files.find((f) => /\.(pptx|json|pptjson|txt|md)$/i.test(f.name)); if (doc) { if (!a.dirty || (await this.confirm('Discard unsaved changes and open the dropped file?'))) a.openFile(doc); return; } const at = e.target.closest('#canvasArea') ? ed.toSlide(e) : null; a.insertImageFiles(files, at); });
    document.addEventListener('selectionchange', () => { if (ed.editing) { clearTimeout(this.selT); this.selT = setTimeout(() => this.updateToolbar(), 80); } });
    this.$('#canvasArea').addEventListener('focus', () => this.updateToolbar());
  }
  key(e) {
    const a = this.app, ed = a.editor;
    if (a.show.active) return;
    const inInput = e.target.matches('input, textarea, select') || e.target.isContentEditable;
    const k = e.key, ctrl = e.ctrlKey || e.metaKey, lower = k.toLowerCase();
    // global shortcuts (also in inputs for file ops)
    if (ctrl && lower === 's') { e.preventDefault(); a.save(e.shiftKey); return; }
    if (ctrl && lower === 'o') { e.preventDefault(); a.openFile(); return; }
    if (ctrl && e.shiftKey && lower === 'e') { e.preventDefault(); a.exportPptx(); return; }
    if (ctrl && lower === 'p') { e.preventDefault(); this.printDialog(); return; }
    if (k === 'F5') { e.preventDefault(); a.startShow(e.shiftKey ? a.slideIndex : 0, { loop: a.showLoop }); return; }
    if (k === 'Escape' && this.$('#dialogLayer').classList.contains('on')) return;
    if (k === 'Escape' && this.$('#menuLayer').classList.contains('on')) { this.closeMenus(); return; }
    if (inInput && !(e.target.isContentEditable && ed.editing)) { if (k === 'Escape') e.target.blur(); return; }
    if (ed.editing || ed.cellEdit) return; // editor handles its own keys
    if (ctrl && lower === 'z') { e.preventDefault(); if (e.shiftKey) a.redo(); else a.undo(); return; }
    if (ctrl && lower === 'y') { e.preventDefault(); a.redo(); return; }
    if (ctrl && lower === 'm') { e.preventDefault(); a.newSlide(); return; }
    if (ctrl && e.shiftKey && lower === 'd') { e.preventDefault(); a.duplicateSlide(); return; }
    if (ctrl && lower === 'f' || ctrl && lower === 'h') { e.preventDefault(); this.findDialog(); return; }
    if (ctrl && lower === 'n') { e.preventDefault(); a.newDocument(); return; }
    if (ctrl && (k === '=' || k === '+')) { e.preventDefault(); this.cmd('zoomIn'); return; }
    if (ctrl && k === '-') { e.preventDefault(); this.cmd('zoomOut'); return; }
    if (ctrl && k === '0') { e.preventDefault(); this.cmd('zoomFit'); return; }
    const thumbsFocus = e.target.closest && e.target.closest('#slidePanel');
    if (k === 'PageDown' || (thumbsFocus && k === 'ArrowDown')) { e.preventDefault(); a.gotoSlide(a.slideIndex + 1); return; }
    if (k === 'PageUp' || (thumbsFocus && k === 'ArrowUp')) { e.preventDefault(); a.gotoSlide(a.slideIndex - 1); return; }
    if (thumbsFocus || document.body.classList.contains('sorter')) {
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); a.deleteSlides([...this.thumbSel]); return; }
      if (ctrl && lower === 'd') { e.preventDefault(); a.duplicateSlide([...this.thumbSel]); return; }
      if (ctrl && lower === 'c') { this.slideClip = [...this.thumbSel].map((i) => JSON.parse(JSON.stringify(a.pres.slides[i]))); this.toast('Slides copied'); return; }
      if (ctrl && lower === 'v' && this.slideClip) { const copies = this.slideClip.map((s) => { const c = JSON.parse(JSON.stringify(s)); c.id = uid('s'); M.forEachElement(c, (x) => { x.id = uid(); }); return c; }); a.pres.slides.splice(a.slideIndex + 1, 0, ...copies); a.commit('Paste slides'); a.gotoSlide(a.slideIndex + 1, { force: true }); this.renderThumbs(); return; }
      if (k === 'Home') { a.gotoSlide(0); return; } if (k === 'End') { a.gotoSlide(a.pres.slides.length - 1); return; }
      if (k === 'Enter' && document.body.classList.contains('sorter')) { this.cmd('viewNormal'); return; }
    }
    if (ctrl && lower === 'a') { e.preventDefault(); ed.selectAll(); return; }
    if (ctrl && lower === 'c') { a.copy(); return; } if (ctrl && lower === 'x') { a.copy(true); return; }
    if (ctrl && lower === 'v') { return; /* paste event */ }
    if (ctrl && lower === 'd') { e.preventDefault(); a.duplicate(); return; }
    if (ctrl && lower === 'g') { e.preventDefault(); a.arrange(e.shiftKey ? 'ungroup' : 'group'); return; }
    if (ctrl && lower === 'k') { e.preventDefault(); this.insertLink(); return; }
    if (ctrl && lower === 'b') { e.preventDefault(); a.format('bold'); return; } if (ctrl && lower === 'i') { e.preventDefault(); a.format('italic'); return; } if (ctrl && lower === 'u') { e.preventDefault(); a.format('underline'); return; }
    if (ctrl && lower === 'l') { e.preventDefault(); a.format('align', 'left'); return; } if (ctrl && lower === 'e') { e.preventDefault(); a.format('align', 'center'); return; } if (ctrl && lower === 'r') { e.preventDefault(); a.format('align', 'right'); return; }
    if (ctrl && (k === ']' || k === '>')) { e.preventDefault(); a.format('sizeStep', 1); return; } if (ctrl && (k === '[' || k === '<')) { e.preventDefault(); a.format('sizeStep', -1); return; }
    if (k === 'Escape') { if (ed.pendingInsert) a.cancelInsert(); else ed.clearSelection(); return; }
    if (k === 'Delete' || k === 'Backspace') { if (ed.selection.length) { e.preventDefault(); a.deleteSelected(); } else if (!inInput) { e.preventDefault(); a.deleteSlides(); } return; }
    if (k.startsWith('Arrow') && ed.selection.length) { e.preventDefault(); const d = e.shiftKey ? 10 : 1; a.nudge(k === 'ArrowLeft' ? -d : k === 'ArrowRight' ? d : 0, k === 'ArrowUp' ? -d : k === 'ArrowDown' ? d : 0); return; }
    if (k === 'ArrowDown' || k === 'ArrowRight') { if (!ed.selection.length) { a.gotoSlide(a.slideIndex + 1); } return; } if (k === 'ArrowUp' || k === 'ArrowLeft') { if (!ed.selection.length) a.gotoSlide(a.slideIndex - 1); return; }
    if (k === 'Tab' && !inInput) { e.preventDefault(); const els = a.slide.elements; if (!els.length) return; const i = els.findIndex((x) => x.id === ed.selection[0]); ed.select(els[(i + (e.shiftKey ? -1 : 1) + els.length) % els.length].id); return; }
    if ((k === 'Enter' || k === 'F2') && ed.single && (ed.single.type === 'text' || ed.single.type === 'shape')) { e.preventDefault(); ed.startTextEdit(ed.single, null, { selectAll: k === 'F2' }); return; }
    if (k === 'Enter' && ed.single && ed.single.type === 'table') { e.preventDefault(); const c = ed.tableCell || { r: 0, c: 0 }; ed.startCellEdit(ed.single, c.r, c.c); return; }
    if (k === 'Enter' && ed.single && ed.single.type === 'chart') { this.editChartData(ed.single); return; }
    if (k.length === 1 && !ctrl && !e.altKey && ed.single && (ed.single.type === 'text' || ed.single.type === 'shape') && !ed.single.locked) { e.preventDefault(); ed.startTextEdit(ed.single, null, { selectAll: true, insertText: k }); }
  }
}
function setPathValue(obj, path, val) { const parts = path.split('.'); let o = obj; for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] ||= {}; o = o[parts[i]]; } o[parts[parts.length - 1]] = val; }
function mix(a, b, t) { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const c = (s) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t); return '#' + [16, 8, 0].map((s) => c(s).toString(16).padStart(2, '0')).join(''); }
