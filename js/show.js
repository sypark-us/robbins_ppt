// Slide show player: full-screen stage, transitions, click-to-animate, laser pointer, pen,
// blackout, auto-advance and an optional presenter window with notes, timer and next-slide preview.
import { renderSlide } from './render.js';
import { svgOf } from './export.js';
import { escapeHtml, fmtTime } from './util.js';

const TRANS_RANDOM = ['fade', 'push', 'wipe', 'cover', 'zoom', 'split', 'dissolve', 'wheel', 'circle'];

export class Show {
  constructor(app) { this.app = app; this.active = false; this.root = null; this.presenterWin = null; }
  get pres() { return this.app.pres; }
  visibleSlides() { return this.pres.slides.map((s, i) => ({ s, i })).filter((x) => !x.s.hidden); }

  start(fromIndex = 0, opts = {}) {
    if (this.active) this.stop();
    this.opts = opts; this.active = true; this.startTime = Date.now();
    this.order = this.visibleSlides(); if (!this.order.length) { this.active = false; return; }
    let pos = this.order.findIndex((x) => x.i >= fromIndex); if (pos < 0) pos = 0;
    const root = document.createElement('div'); root.id = 'show'; root.tabIndex = -1;
    root.innerHTML = `<div class="stage"></div><canvas class="ink"></canvas><div class="laser"></div><div class="blackout"></div><div class="hud"><button data-act="prev" title="Previous (←)">‹</button><span class="num"></span><button data-act="next" title="Next (→)">›</button><button data-act="pen" title="Pen (P)">✎</button><button data-act="laser" title="Laser pointer (L)">●</button><button data-act="erase" title="Erase ink (E)">⌫</button><button data-act="presenter" title="Presenter view">▣</button><button data-act="end" title="End show (Esc)">✕</button></div><div class="help"><b>Keyboard</b><br>→ Space Enter PgDn: next · ← PgUp Backspace: previous · Home/End: first/last<br>number + Enter: go to slide · B: black · W: white · L: laser · P: pen · E: erase ink · N: notes · H: this help · Esc: end</div>`;
    document.body.appendChild(root); this.root = root;
    this.stage = root.querySelector('.stage'); this.ink = root.querySelector('.ink'); this.laser = root.querySelector('.laser'); this.hud = root.querySelector('.hud');
    this.pos = pos; this.step = 0; this.numBuf = ''; this.pen = false; this.laserOn = false; this.inkPaths = {};
    this.onKey = (ev) => this.key(ev); this.onResize = () => this.fit(); this.onMove = (ev) => this.move(ev);
    document.addEventListener('keydown', this.onKey, true); window.addEventListener('resize', this.onResize); root.addEventListener('pointermove', this.onMove);
    root.addEventListener('pointerdown', (ev) => this.pointerDown(ev)); root.addEventListener('pointerup', (ev) => this.pointerUp(ev));
    root.addEventListener('contextmenu', (ev) => { ev.preventDefault(); if (!this.pen) this.prev(); });
    root.addEventListener('wheel', (ev) => { if (Math.abs(ev.deltaY) > 20) { ev.preventDefault(); if (ev.deltaY > 0) this.next(); else this.prev(); } }, { passive: false });
    this.hud.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b) return; ev.stopPropagation(); this.action(b.dataset.act); });
    root.addEventListener('click', (ev) => { const a = ev.target.closest('[data-link]'); if (a) { ev.stopPropagation(); window.open(a.dataset.link, '_blank', 'noopener'); } });
    document.body.classList.add('showing');
    if (!opts.windowed) root.requestFullscreen?.().catch(() => {});
    this.showSlide(pos, null, true);
    this.fit();
    if (opts.presenter) this.openPresenter();
    root.focus();
    this.app.ui?.toast?.('Slide show started. Press Esc to end, H for help.');
  }
  stop() {
    if (!this.active) return; this.active = false;
    clearTimeout(this.autoTimer);
    document.removeEventListener('keydown', this.onKey, true); window.removeEventListener('resize', this.onResize);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    this.root?.remove(); this.root = null; document.body.classList.remove('showing');
    if (this.presenterWin && !this.presenterWin.closed) this.presenterWin.close(); this.presenterWin = null;
    this.app.onShowEnd?.(this.order[this.pos]?.i ?? 0);
  }
  fit() {
    if (!this.root) return;
    const W = this.pres.width, H = this.pres.height, z = Math.min(this.root.clientWidth / W, this.root.clientHeight / H);
    this.zoom = z;
    this.stage.style.width = `${W * z}px`; this.stage.style.height = `${H * z}px`;
    for (const l of this.stage.querySelectorAll('.layer')) { l.style.transform = `scale(${z})`; }
    const r = this.stage.getBoundingClientRect(); this.ink.width = Math.round(r.width); this.ink.height = Math.round(r.height); this.ink.style.left = `${r.left}px`; this.ink.style.top = `${r.top}px`; this.ink.style.width = `${r.width}px`; this.ink.style.height = `${r.height}px`;
    this.redrawInk();
  }
  currentSlide() { return this.order[this.pos].s; }
  animsOf(layer) { return [...layer.querySelectorAll('.el[data-anim]')].sort((a, b) => (+a.dataset.animOrder || 0) - (+b.dataset.animOrder || 0)); }
  showSlide(pos, dir, immediate = false) {
    clearTimeout(this.autoTimer);
    const { s, i } = this.order[pos];
    const layer = document.createElement('div'); layer.className = 'layer';
    const slideEl = document.createElement('div'); slideEl.className = 'slide'; layer.appendChild(slideEl);
    renderSlide(slideEl, this.pres, s, { hiddenAnim: true, index: i });
    layer.style.transform = `scale(${this.zoom || 1})`;
    const old = this.stage.querySelector('.layer.cur');
    this.stage.appendChild(layer);
    const t = s.transition || { type: 'none' };
    let type = dir === 'back' || immediate || !t.type || t.type === 'none' ? 'none' : t.type;
    if (type === 'random') type = TRANS_RANDOM[Math.floor(Math.random() * TRANS_RANDOM.length)];
    const dur = Math.max(0.1, t.duration || 0.7);
    if (old && type !== 'none' && type !== 'cut') {
      layer.style.setProperty('--dur', `${dur}s`); old.style.setProperty('--dur', `${dur}s`);
      const d = t.dir || 'left';
      layer.classList.add('tin', `t-${type}`, `d-${d}`); old.classList.add('tout', `t-${type}`, `d-${d}`);
      old.classList.remove('cur'); layer.classList.add('cur');
      setTimeout(() => { old.remove(); layer.classList.remove('tin', `t-${type}`, `d-${d}`); }, dur * 1000 + 50);
    } else { if (old) old.remove(); layer.classList.add('cur'); }
    this.pos = pos; this.step = 0; this.anims = this.animsOf(layer); this.layer = layer;
    if (dir === 'back') { for (const el of this.anims) el.classList.remove('anim-hidden'); this.step = this.anims.length; }
    this.updateHud(); this.clearInk(); this.scheduleAuto();
    this.updatePresenter();
  }
  scheduleAuto() {
    const s = this.currentSlide();
    if (s.advance != null && s.advance > 0) this.autoTimer = setTimeout(() => { if (this.step < this.anims.length) { this.next(); this.scheduleAuto(); } else this.next(); }, s.advance * 1000);
  }
  playAnim(el) {
    el.classList.remove('anim-hidden');
    const type = el.dataset.anim, dir = el.dataset.animDir || 'left';
    el.style.setProperty('--adur', `${el.dataset.animDur || 0.5}s`); el.style.setProperty('--adelay', `${el.dataset.animDelay || 0}s`);
    el.classList.add('anim-play', `a-${type}`, `ad-${dir}`);
    setTimeout(() => el.classList.remove('anim-play', `a-${type}`, `ad-${dir}`), ((+el.dataset.animDur || 0.5) + (+el.dataset.animDelay || 0)) * 1000 + 50);
  }
  next() {
    if (!this.active) return;
    if (this.blackout) { this.setBlackout(null); return; }
    if (this.step < this.anims.length) { this.playAnim(this.anims[this.step++]); this.updateHud(); return; }
    if (this.pos < this.order.length - 1) this.showSlide(this.pos + 1, 'fwd');
    else if (this.opts.loop) this.showSlide(0, 'fwd');
    else this.endScreen();
  }
  prev() {
    if (!this.active) return;
    if (this.blackout) { this.setBlackout(null); return; }
    if (this.ended) { this.ended = false; this.root.querySelector('.endscreen')?.remove(); return; }
    if (this.step > 0) { this.step--; const el = this.anims[this.step]; el.classList.add('anim-hidden'); el.classList.remove('anim-play'); this.updateHud(); return; }
    if (this.pos > 0) this.showSlide(this.pos - 1, 'back');
  }
  goto(index) { const pos = this.order.findIndex((x) => x.i === index); if (pos >= 0) this.showSlide(pos, pos > this.pos ? 'fwd' : 'back'); }
  endScreen() { if (this.ended) { this.stop(); return; } this.ended = true; const d = document.createElement('div'); d.className = 'endscreen'; d.textContent = 'End of slide show. Click or press a key to exit.'; this.root.appendChild(d); }
  setBlackout(kind) { this.blackout = kind; const b = this.root.querySelector('.blackout'); b.className = 'blackout' + (kind ? ` on ${kind}` : ''); }
  updateHud() { this.root.querySelector('.hud .num').textContent = `${this.order[this.pos].i + 1} / ${this.pres.slides.length}`; }
  key(ev) {
    if (!this.active) return;
    const k = ev.key;
    if (this.ended && !['Escape'].includes(k)) { ev.preventDefault(); if (k === 'ArrowLeft' || k === 'Backspace' || k === 'PageUp') this.prev(); else this.stop(); return; }
    if (/^\d$/.test(k)) { this.numBuf += k; ev.preventDefault(); return; }
    if (k === 'Enter' && this.numBuf) { ev.preventDefault(); const n = parseInt(this.numBuf, 10) - 1; this.numBuf = ''; this.goto(Math.max(0, Math.min(this.pres.slides.length - 1, n))); return; }
    this.numBuf = '';
    const map = { ArrowRight: 'next', ArrowDown: 'next', PageDown: 'next', ' ': 'next', Enter: 'next', n: 'next', ArrowLeft: 'prev', ArrowUp: 'prev', PageUp: 'prev', Backspace: 'prev', p: 'prev', Home: 'first', End: 'last', Escape: 'end', b: 'black', '.': 'black', w: 'white', ',': 'white', l: 'laser', P: 'pen', e: 'erase', E: 'erase', h: 'help', '?': 'help', N: 'notes', L: 'laser' };
    const act = map[k] ?? map[k.toLowerCase()];
    if (!act) return;
    if (k === 'p' && (ev.ctrlKey || ev.metaKey)) return;
    ev.preventDefault(); ev.stopPropagation();
    if (k === 'p' || k === 'P') { this.action(ev.shiftKey || k === 'P' ? 'pen' : 'prev'); return; }
    this.action(act);
  }
  action(act) {
    switch (act) {
      case 'next': this.next(); break; case 'prev': this.prev(); break;
      case 'first': this.showSlide(0, 'back'); break; case 'last': this.showSlide(this.order.length - 1, 'fwd'); break;
      case 'end': this.stop(); break;
      case 'black': this.setBlackout(this.blackout === 'black' ? null : 'black'); break;
      case 'white': this.setBlackout(this.blackout === 'white' ? null : 'white'); break;
      case 'laser': this.laserOn = !this.laserOn; this.laser.classList.toggle('on', this.laserOn); if (this.laserOn) { this.pen = false; this.root.classList.remove('pen'); } break;
      case 'pen': this.pen = !this.pen; this.root.classList.toggle('pen', this.pen); if (this.pen) { this.laserOn = false; this.laser.classList.remove('on'); } break;
      case 'erase': this.clearInk(); break;
      case 'help': this.root.querySelector('.help').classList.toggle('on'); break;
      case 'notes': this.toggleNotes(); break;
      case 'presenter': this.openPresenter(); break;
      default: break;
    }
    this.hud.querySelector('[data-act=pen]')?.classList.toggle('active', this.pen);
    this.hud.querySelector('[data-act=laser]')?.classList.toggle('active', this.laserOn);
  }
  toggleNotes() {
    let n = this.root.querySelector('.shownotes');
    if (n) { n.remove(); return; }
    n = document.createElement('div'); n.className = 'shownotes'; n.textContent = this.currentSlide().notes || '(no notes)'; this.root.appendChild(n);
  }
  move(ev) {
    if (this.laserOn) { this.laser.style.left = `${ev.clientX}px`; this.laser.style.top = `${ev.clientY}px`; }
    if (this.drawing) { const r = this.ink.getBoundingClientRect(); this.curPath.push([(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height]); this.redrawInk(); }
  }
  pointerDown(ev) {
    if (ev.target.closest('.hud') || ev.target.closest('[data-link]')) return;
    if (this.ended) { this.stop(); return; }
    if (this.pen && ev.button === 0) { const r = this.ink.getBoundingClientRect(); this.drawing = true; this.curPath = [[(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height]]; (this.inkPaths[this.pos] ||= []).push(this.curPath); ev.preventDefault(); return; }
    if (ev.button === 0) this.clickStart = Date.now();
  }
  pointerUp(ev) {
    if (this.drawing) { this.drawing = false; return; }
    if (ev.target.closest('.hud') || ev.target.closest('[data-link]')) return;
    if (ev.button === 0 && !this.pen && this.clickStart) { this.clickStart = 0; this.next(); }
  }
  clearInk() { delete this.inkPaths[this.pos]; this.redrawInk(); }
  redrawInk() {
    const ctx = this.ink.getContext('2d'); ctx.clearRect(0, 0, this.ink.width, this.ink.height);
    ctx.strokeStyle = '#e53935'; ctx.lineWidth = Math.max(2, this.ink.width / 400); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const path of this.inkPaths[this.pos] || []) { ctx.beginPath(); path.forEach(([x, y], i) => (i ? ctx.lineTo(x * this.ink.width, y * this.ink.height) : ctx.moveTo(x * this.ink.width, y * this.ink.height))); ctx.stroke(); }
  }

  // --- presenter window -----------------------------------------------------------------------
  openPresenter() {
    if (this.presenterWin && !this.presenterWin.closed) { this.presenterWin.focus(); return; }
    const w = window.open('', 'robbinsppt-presenter', 'width=1100,height=720'); if (!w) { this.app.ui?.toast?.('Pop-up blocked: allow pop-ups to open the presenter view.'); return; }
    this.presenterWin = w;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Presenter view — ${escapeHtml(this.pres.title)}</title><style>body{margin:0;background:#1b1b1b;color:#eee;font-family:system-ui,sans-serif;display:grid;grid-template-columns:2fr 1fr;grid-template-rows:auto 1fr auto;height:100vh;gap:10px;padding:10px;box-sizing:border-box}header{grid-column:1/3;display:flex;gap:16px;align-items:center;font-size:14px}header .timer{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums}header .clock{color:#aaa}header button{background:#333;color:#eee;border:1px solid #111;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:14px}.cur svg,.next svg{width:100%;height:auto;display:block;background:#000}.cur{align-self:start}.side{display:flex;flex-direction:column;gap:10px;min-height:0}.next{opacity:.9}.label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#888;margin-bottom:4px}.notes{flex:1;overflow:auto;background:#262626;border-radius:6px;padding:12px;font-size:18px;line-height:1.5;white-space:pre-wrap}footer{grid-column:1/3;color:#888;font-size:12px}</style></head><body><header><button data-act="prev">‹ Prev</button><button data-act="next">Next ›</button><span class="num"></span><span class="timer">0:00</span><span class="clock"></span><span style="flex:1"></span><button data-act="black">Black</button><button data-act="end">End show</button></header><div class="cur"><div class="label">Current slide</div><div class="curimg"></div></div><div class="side"><div><div class="label">Next</div><div class="next"></div></div><div class="label">Notes</div><div class="notes"></div></div><footer>Keys work here too: ← → navigate · B black · Esc end</footer></body></html>`);
    w.document.close();
    w.document.addEventListener('keydown', (ev) => this.key(ev));
    w.document.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) this.action(b.dataset.act); });
    w.addEventListener('beforeunload', () => { this.presenterWin = null; });
    this.presenterTimer = setInterval(() => { if (!this.presenterWin || this.presenterWin.closed) { clearInterval(this.presenterTimer); return; } const d = this.presenterWin.document; d.querySelector('.timer').textContent = fmtTime((Date.now() - this.startTime) / 1000); d.querySelector('.clock').textContent = new Date().toLocaleTimeString(); }, 1000);
    this.updatePresenter();
  }
  updatePresenter() {
    const w = this.presenterWin; if (!w || w.closed) return;
    const d = w.document, cur = this.order[this.pos], nxt = this.order[this.pos + 1];
    d.querySelector('.curimg').innerHTML = svgOf(this.pres, cur.s, { index: cur.i });
    d.querySelector('.next').innerHTML = nxt ? svgOf(this.pres, nxt.s, { index: nxt.i }) : '<div style="padding:20px;color:#666">End of show</div>';
    d.querySelector('.notes').textContent = cur.s.notes || '';
    d.querySelector('.num').textContent = `Slide ${cur.i + 1} of ${this.pres.slides.length}`;
  }
}
