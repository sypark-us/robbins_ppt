// Node tests for the pure modules: zip, xml, model, text layout, shapes, charts, svg renderer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeZip, readZip, crc32 } from '../js/zip.js';
import { parseXml, find, findAll, attr, textOf, child, children } from '../js/xml.js';
import * as M from '../js/model.js';
import { layoutText, approxMeasure, textWidth } from '../js/textlayout.js';
import { shapePath, SHAPES, shapeForPrst, geomPath } from '../js/shapes.js';
import { chartSvg, chartDataFromGrid, chartDataToGrid } from '../js/charts.js';
import { slideToSvg } from '../js/svg.js';
import { parseColor, toHex, mixColor, boundsOf, unionBounds, rotatePoint } from '../js/util.js';
import { splitParagraph, applyToRange, spliceRuns } from '../js/editor.js';

test('crc32 and zip round trip (deflate + stored, utf-8 names)', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const big = 'The quick brown fox jumps over the lazy dog. '.repeat(500);
  const zip = await writeZip([{ name: 'dir/텍스트.txt', data: big }, { name: 'raw.bin', data: new Uint8Array([0, 255, 1, 2]), store: true }, { name: 'empty.txt', data: '' }]);
  assert.equal(zip[0], 0x50); assert.equal(zip[1], 0x4b);
  const m = await readZip(zip);
  assert.deepEqual([...m.keys()], ['dir/텍스트.txt', 'raw.bin', 'empty.txt']);
  assert.equal(await m.get('dir/텍스트.txt').text(), big);
  assert.equal(m.get('dir/텍스트.txt').method, 8);
  assert.deepEqual([...await m.get('raw.bin').bytes()], [0, 255, 1, 2]);
  assert.equal((await m.get('empty.txt').bytes()).length, 0);
  assert.ok(zip.length < big.length / 5, 'compressed');
});

test('xml parser handles namespaces, entities, cdata, comments, self-closing, attributes without quotes', () => {
  const d = parseXml(`<?xml version="1.0"?><!-- c --><p:sld xmlns:p="x"><p:a sz=12 b="1" c='x'>A&amp;B&#169;&#xA9;</p:a><p:b/><![CDATA[<raw>]]><p:c><p:d>deep</p:d></p:c></p:sld>`);
  const sld = d.children[0];
  assert.equal(sld.name, 'p:sld'); assert.equal(sld.local, 'sld');
  const a = find(d, 'a'); assert.equal(attr(a, 'sz'), '12'); assert.equal(attr(a, 'b'), '1'); assert.equal(attr(a, 'c'), 'x');
  assert.equal(textOf(a), 'A&B©©');
  assert.equal(children(sld).length, 3);
  assert.equal(textOf(find(d, 'p:d')), 'deep');
  assert.equal(findAll(d, 'd').length, 1);
  assert.ok(sld.children.some((c) => c.text === '<raw>'));
  assert.equal(child(sld, 'b').children.length, 0);
});

test('model: new presentation, layouts, applyLayout keeps text, slide sizes', () => {
  const p = M.newPresentation();
  assert.equal(p.width, 960); assert.equal(p.slides.length, 1); assert.equal(p.slides[0].layout, 'title');
  const s = M.makeSlide(p, 'twoContent');
  assert.equal(s.elements.filter((e) => e.ph === 'body').length, 2);
  s.elements[0].text = M.textFromString('Keep me'); s.elements[1].text = M.textFromString('Body A');
  M.applyLayout(p, s, 'titleContent');
  assert.equal(M.textToString(s.elements.find((e) => e.ph === 'title').text), 'Keep me');
  assert.equal(M.textToString(s.elements.find((e) => e.ph === 'body').text), 'Body A');
  M.applyLayout(p, s, 'blank');
  assert.ok(s.elements.length >= 2, 'non-empty placeholders survive as plain text');
  for (const l of M.LAYOUTS) assert.ok(Array.isArray(M.layoutElements(l.id, p)));
  assert.deepEqual(M.SLIDE_SIZES['4:3'], [720, 540]);
});

test('model: history undo/redo and serialization', () => {
  const p = M.newPresentation(); const h = new M.History(5); h.reset(p);
  assert.equal(h.commit(p), false, 'no change');
  p.title = 'A'; assert.equal(h.commit(p), true); p.title = 'B'; h.commit(p);
  assert.equal(h.undo().title, 'A'); assert.equal(h.undo().title, 'Untitled presentation'); assert.equal(h.undo(), null);
  assert.equal(h.redo().title, 'A');
  for (let i = 0; i < 10; i++) { p.title = 'T' + i; h.commit(p); }
  assert.ok(h.stack.length <= 5);
  const back = M.deserialize(M.serialize(p)); assert.equal(back.title, 'T9'); assert.equal(back.slides[0].elements.length, 2);
  const n = M.normalize({ slides: [{ elements: [{ type: 'text', text: 'plain' }] }] });
  assert.equal(n.slides[0].elements[0].text.paragraphs[0].runs[0].text, 'plain'); assert.equal(n.width, 960);
});

test('model: theme application swaps colors and fonts', () => {
  const p = M.newPresentation(); const t0 = p.theme;
  const s = p.slides[0]; s.elements.push(M.makeShape('rect', 0, 0, 10, 10, { fill: { type: 'solid', color: t0.accents[0] }, stroke: { color: t0.accents[1], width: 1 } }));
  M.applyTheme(p, M.themeByName('Midnight'));
  assert.equal(p.theme.name, 'Midnight');
  assert.equal(s.elements[2].fill.color, p.theme.accents[0]); assert.equal(s.elements[2].stroke.color, p.theme.accents[1]);
  assert.equal(s.elements[0].font, p.theme.fonts.heading); assert.equal(s.elements[0].color, p.theme.heading);
});

test('model: groups, move/resize, duplicate, outline import', () => {
  const p = M.newPresentation(); const s = M.makeSlide(p, 'blank');
  const a = M.makeShape('rect', 10, 10, 100, 50), b = M.makeShape('ellipse', 200, 100, 50, 50, { rotation: 45 });
  s.elements.push(a, b);
  const g = M.groupElements(s, [a, b]);
  assert.equal(s.elements.length, 1); assert.equal(g.type, 'group'); assert.ok(g.x <= 10 && g.w >= 240);
  M.moveElement(g, 5, 5); assert.equal(a.x, 15);
  M.resizeElement(g, g.x, g.y, g.w * 2, g.h); assert.equal(Math.round(a.w), 200);
  const d = M.duplicateElement(g, 10, 10); assert.notEqual(d.id, g.id); assert.notEqual(d.children[0].id, a.id); assert.equal(d.children[0].x, a.x + 10);
  M.ungroup(s, g); assert.equal(s.elements.length, 2);
  const slides = M.slidesFromOutline(p, '# One\n- a\n  - b\n\n# Two\nplain line\n# Three');
  assert.equal(slides.length, 3); assert.equal(M.textToString(slides[0].elements[0].text), 'One');
  assert.deepEqual(slides[0].elements[1].text.paragraphs.map((x) => x.level || 0), [0, 1]);
  assert.equal(slides[1].elements[1].text.paragraphs[0].runs[0].text, 'plain line');
  assert.equal(slides[2].elements[1].text.paragraphs.length, 1);
});

test('text layout: wrapping, bullets, numbering, alignment, vertical alignment, autofit', () => {
  const el = { font: 'Arial', size: 20, align: 'left', valign: 'top', lineHeight: 1.2 };
  const text = { paragraphs: [{ runs: [{ text: 'word '.repeat(30).trim() }] }] };
  const lay = layoutText(el, text, 200, 500, approxMeasure);
  assert.ok(lay.lines.length > 3, 'wrapped'); assert.ok(lay.lines.every((l) => l.width <= 200 + 1));
  assert.equal(lay.lines[1].y, 24); assert.equal(lay.height, lay.lines.length * 24);
  const numbered = layoutText(el, { paragraphs: [{ runs: [{ text: 'a' }], bullet: 'number' }, { runs: [{ text: 'b' }], bullet: 'number' }, { runs: [{ text: 'c' }], bullet: 'alpha', level: 1 }, { runs: [{ text: 'd' }], bullet: '•' }] }, 300, 300, approxMeasure);
  assert.deepEqual(numbered.lines.map((l) => l.bullet.text), ['1.', '2.', 'a.', '•']);
  assert.ok(numbered.lines[2].x > numbered.lines[0].x, 'level indent');
  const center = layoutText({ ...el, align: 'center' }, { paragraphs: [{ runs: [{ text: 'hi' }] }] }, 300, 100, approxMeasure);
  assert.ok(Math.abs(center.lines[0].x - (300 - center.lines[0].width) / 2) < 0.01);
  const bottom = layoutText({ ...el, valign: 'bottom' }, { paragraphs: [{ runs: [{ text: 'hi' }] }] }, 300, 100, approxMeasure);
  assert.equal(bottom.lines[0].y, 100 - 24);
  const fit = layoutText({ ...el, autofit: 'shrink' }, text, 200, 60, approxMeasure);
  assert.ok(fit.scale < 1 && fit.height <= 60.01, 'shrunk ' + fit.scale);
  const mixed = layoutText(el, { paragraphs: [{ runs: [{ text: 'big ', size: 40 }, { text: 'small', size: 10 }] }] }, 500, 100, approxMeasure);
  assert.equal(mixed.lines[0].height, 48); assert.equal(mixed.lines[0].runs.length, 2);
  assert.ok(textWidth(el, { paragraphs: [{ runs: [{ text: 'abc' }] }] }, approxMeasure) > 20);
  const longWord = layoutText(el, { paragraphs: [{ runs: [{ text: 'x'.repeat(100) }] }] }, 100, 500, approxMeasure);
  assert.ok(longWord.lines.length > 5, 'long word broken by characters');
});

test('shapes: every preset produces a path, prst mapping, custom geometry', () => {
  for (const k of Object.keys(SHAPES)) { const d = shapePath(k, 100, 50); assert.ok(/^M/.test(d) && d.length > 10, k); assert.ok(!/NaN/.test(d), k + ' NaN'); }
  assert.equal(shapeForPrst('roundRect'), 'roundRect'); assert.equal(shapeForPrst('flowChartProcess'), 'rect'); assert.equal(shapeForPrst('nonsense'), null);
  const d = geomPath({ cmds: [['M', 0, 0], ['L', 1, 0], ['C', 1, 0.5, 0.5, 1, 0, 1], ['A', 0.5, 0.5, 90, 180], ['Z']] }, 100, 50);
  assert.ok(d.startsWith('M0 0L100 0C100 25 50 50 0 50A50 25 0 0 1'));
});

test('charts: svg output for every type and grid conversion', () => {
  const el = M.makeChart(0, 0, 400, 300);
  for (const t of ['column', 'bar', 'line', 'area', 'pie', 'doughnut', 'scatter']) { const s = chartSvg({ ...el, chartType: t, labels: true }, 400, 300); assert.ok(s.includes('<text') && !/NaN/.test(s), t); }
  assert.ok(chartSvg({ ...el, series: [] }, 100, 100).includes('No data'));
  const grid = chartDataToGrid(el); assert.equal(grid[0][1], 'Series 1'); assert.equal(grid.length, 5);
  const back = chartDataFromGrid([['', 'S1', 'S2'], ['A', '1,000', '2'], ['B', '3', '']]);
  assert.deepEqual(back.categories, ['A', 'B']); assert.deepEqual(back.series[0].values, [1000, 3]); assert.deepEqual(back.series[1].values, [2, 0]);
});

test('svg renderer: demo slides produce well-formed SVG with text, gradients, images, footer', () => {
  const p = M.demoPresentation(); p.footer = { text: 'Foot', showNumber: true, showDate: false };
  p.assets.i1 = 'data:image/png;base64,iVBORw0KGgo='; p.slides[2].elements.push(M.makeImage('i1', 10, 10, 50, 50, { radius: 5 }));
  p.slides[2].elements.push(M.makeGroup([M.makeShape('rect', 0, 0, 10, 10), M.makeLine(0, 0, 50, 50, { arrowEnd: true, arrowStart: true })]));
  for (const s of p.slides) { const svg = slideToSvg(p, s, { measure: approxMeasure }); const d = parseXml(svg); assert.equal(d.children[0].name, 'svg'); assert.ok(!/NaN|undefined/.test(svg), 'no NaN'); }
  const svg = slideToSvg(p, p.slides[2], { measure: approxMeasure });
  assert.ok(svg.includes('linearGradient') && svg.includes('<image') && svg.includes('clipPath') && svg.includes('>Foot<') && svg.includes('>3<'));
  assert.ok(svg.includes('feDropShadow'), 'shadow filter');
  assert.ok(svg.includes('xml:space="preserve"'));
  const fresh = M.newPresentation(); const empty = slideToSvg(fresh, M.makeSlide(fresh, 'titleContent'), { measure: approxMeasure });
  assert.ok(!empty.includes('<text'), 'empty placeholders are not exported');
});

test('util: colors and geometry', () => {
  assert.deepEqual(parseColor('#ff0000'), { r: 255, g: 0, b: 0, a: 1 }); assert.equal(toHex(parseColor('rgb(1, 2, 3)')), '#010203'); assert.equal(parseColor('#abc').g, 0xbb);
  assert.equal(mixColor('#000000', '#ffffff', 0.5), '#808080');
  const b = boundsOf({ x: 0, y: 0, w: 100, h: 0, rotation: 90 }); assert.ok(Math.abs(b.w) < 1e-9 && Math.abs(b.h - 100) < 1e-9);
  assert.deepEqual(unionBounds([{ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }]), { x: 0, y: 0, w: 15, h: 15 });
  const r = rotatePoint(10, 0, 0, 0, 90); assert.ok(Math.abs(r.x) < 1e-9 && Math.abs(r.y - 10) < 1e-9);
});

test('editor text helpers: split, splice, apply style to a range', () => {
  const p = { runs: [{ text: 'Hello ' }, { text: 'World', bold: true }], bullet: '•' };
  const [a, b] = splitParagraph(p, 3);
  assert.equal(a.runs[0].text, 'Hel'); assert.equal(b.runs[0].text, 'lo '); assert.equal(b.runs[1].text, 'World'); assert.equal(b.bullet, '•');
  const q = { runs: [{ text: 'abcdef' }] }; spliceRuns(q, 1, 4); assert.equal(q.runs[0].text, 'aef');
  const r = { runs: [{ text: 'abcdef' }] }; applyToRange(r, 2, 4, { italic: true, size: (v) => (v || 18) + 2 }, { size: 18 });
  assert.deepEqual(r.runs.map((x) => x.text), ['ab', 'cd', 'ef']); assert.equal(r.runs[1].italic, true); assert.equal(r.runs[1].size, 20); assert.equal(r.runs[0].italic, undefined);
});
