// Preset shape geometry → SVG path data for a w×h box. Names match OOXML prstGeom where possible.

const poly = (pts) => 'M' + pts.map((p) => p.join(' ')).join('L') + 'Z';
const star = (w, h, n, inner) => { const cx = w / 2, cy = h / 2, pts = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? inner : 1; pts.push([cx + Math.cos(a) * r * cx, cy + Math.sin(a) * r * cy]); } return poly(pts); };
const regular = (w, h, n, rot = -Math.PI / 2) => { const cx = w / 2, cy = h / 2, pts = []; for (let i = 0; i < n; i++) { const a = rot + (i * 2 * Math.PI) / n; pts.push([cx + Math.cos(a) * cx, cy + Math.sin(a) * cy]); } return poly(pts); };

export const SHAPES = {
  rect: { name: 'Rectangle', prst: 'rect', path: (w, h) => poly([[0, 0], [w, 0], [w, h], [0, h]]) },
  roundRect: { name: 'Rounded Rectangle', prst: 'roundRect', path: (w, h) => { const r = Math.min(w, h) * 0.16667; return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`; } },
  snipRect: { name: 'Snipped Rectangle', prst: 'snip2DiagRect', path: (w, h) => { const r = Math.min(w, h) * 0.16667; return poly([[r, 0], [w, 0], [w, h - r], [w - r, h], [0, h], [0, r]]); } },
  ellipse: { name: 'Ellipse', prst: 'ellipse', path: (w, h) => { const rx = w / 2, ry = h / 2; return `M${rx} 0A${rx} ${ry} 0 1 1 ${rx} ${h}A${rx} ${ry} 0 1 1 ${rx} 0Z`; }, inset: (w, h) => ({ x: w * 0.146, y: h * 0.146, w: w * 0.708, h: h * 0.708 }) },
  triangle: { name: 'Triangle', prst: 'triangle', path: (w, h) => poly([[w / 2, 0], [w, h], [0, h]]), inset: (w, h) => ({ x: w * 0.25, y: h * 0.5, w: w * 0.5, h: h * 0.5 }) },
  rtTriangle: { name: 'Right Triangle', prst: 'rtTriangle', path: (w, h) => poly([[0, 0], [w, h], [0, h]]), inset: (w, h) => ({ x: w * 0.08, y: h * 0.5, w: w * 0.45, h: h * 0.45 }) },
  diamond: { name: 'Diamond', prst: 'diamond', path: (w, h) => poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]), inset: (w, h) => ({ x: w * 0.25, y: h * 0.25, w: w * 0.5, h: h * 0.5 }) },
  parallelogram: { name: 'Parallelogram', prst: 'parallelogram', path: (w, h) => { const d = Math.min(w, h) * 0.25; return poly([[d, 0], [w, 0], [w - d, h], [0, h]]); } },
  trapezoid: { name: 'Trapezoid', prst: 'trapezoid', path: (w, h) => { const d = Math.min(w, h) * 0.25; return poly([[d, 0], [w - d, 0], [w, h], [0, h]]); } },
  pentagon: { name: 'Pentagon', prst: 'pentagon', path: (w, h) => regular(w, h, 5) },
  hexagon: { name: 'Hexagon', prst: 'hexagon', path: (w, h) => { const d = Math.min(w, h) * 0.25; return poly([[d, 0], [w - d, 0], [w, h / 2], [w - d, h], [d, h], [0, h / 2]]); } },
  octagon: { name: 'Octagon', prst: 'octagon', path: (w, h) => { const d = Math.min(w, h) * 0.29; return poly([[d, 0], [w - d, 0], [w, d], [w, h - d], [w - d, h], [d, h], [0, h - d], [0, d]]); } },
  star4: { name: '4-Point Star', prst: 'star4', path: (w, h) => star(w, h, 4, 0.4), inset: (w, h) => ({ x: w * 0.3, y: h * 0.3, w: w * 0.4, h: h * 0.4 }) },
  star5: { name: '5-Point Star', prst: 'star5', path: (w, h) => star(w, h, 5, 0.382), inset: (w, h) => ({ x: w * 0.28, y: h * 0.32, w: w * 0.44, h: h * 0.4 }) },
  star6: { name: '6-Point Star', prst: 'star6', path: (w, h) => star(w, h, 6, 0.577), inset: (w, h) => ({ x: w * 0.25, y: h * 0.25, w: w * 0.5, h: h * 0.5 }) },
  rightArrow: { name: 'Right Arrow', prst: 'rightArrow', path: (w, h) => { const a = Math.min(w, h * 0.5), t = h * 0.25; return poly([[0, t], [w - a, t], [w - a, 0], [w, h / 2], [w - a, h], [w - a, h - t], [0, h - t]]); }, inset: (w, h) => ({ x: 0, y: h * 0.25, w: w - Math.min(w, h * 0.5), h: h * 0.5 }) },
  leftArrow: { name: 'Left Arrow', prst: 'leftArrow', path: (w, h) => { const a = Math.min(w, h * 0.5), t = h * 0.25; return poly([[w, t], [a, t], [a, 0], [0, h / 2], [a, h], [a, h - t], [w, h - t]]); }, inset: (w, h) => ({ x: Math.min(w, h * 0.5), y: h * 0.25, w: w - Math.min(w, h * 0.5), h: h * 0.5 }) },
  upArrow: { name: 'Up Arrow', prst: 'upArrow', path: (w, h) => { const a = Math.min(h, w * 0.5), t = w * 0.25; return poly([[t, h], [t, a], [0, a], [w / 2, 0], [w, a], [w - t, a], [w - t, h]]); }, inset: (w, h) => ({ x: w * 0.25, y: Math.min(h, w * 0.5), w: w * 0.5, h: h - Math.min(h, w * 0.5) }) },
  downArrow: { name: 'Down Arrow', prst: 'downArrow', path: (w, h) => { const a = Math.min(h, w * 0.5), t = w * 0.25; return poly([[t, 0], [t, h - a], [0, h - a], [w / 2, h], [w, h - a], [w - t, h - a], [w - t, 0]]); }, inset: (w, h) => ({ x: w * 0.25, y: 0, w: w * 0.5, h: h - Math.min(h, w * 0.5) }) },
  leftRightArrow: { name: 'Left-Right Arrow', prst: 'leftRightArrow', path: (w, h) => { const a = Math.min(w / 2, h * 0.5), t = h * 0.25; return poly([[0, h / 2], [a, 0], [a, t], [w - a, t], [w - a, 0], [w, h / 2], [w - a, h], [w - a, h - t], [a, h - t], [a, h]]); }, inset: (w, h) => { const a = Math.min(w / 2, h * 0.5); return { x: a, y: h * 0.25, w: w - 2 * a, h: h * 0.5 }; } },
  chevron: { name: 'Chevron', prst: 'chevron', path: (w, h) => { const d = Math.min(w, h) * 0.5; return poly([[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h], [d, h / 2]]); } },
  homePlate: { name: 'Pentagon Arrow', prst: 'homePlate', path: (w, h) => { const d = Math.min(w, h) * 0.5; return poly([[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h]]); } },
  plus: { name: 'Cross', prst: 'plus', path: (w, h) => { const d = Math.min(w, h) * 0.25; return poly([[d, 0], [w - d, 0], [w - d, d], [w, d], [w, h - d], [w - d, h - d], [w - d, h], [d, h], [d, h - d], [0, h - d], [0, d], [d, d]]); } },
  heart: { name: 'Heart', prst: 'heart', path: (w, h) => `M${w / 2} ${h}C${w * 0.1} ${h * 0.6} 0 ${h * 0.45} 0 ${h * 0.25}C0 ${h * 0.08} ${w * 0.15} 0 ${w * 0.28} 0C${w * 0.4} 0 ${w / 2} ${h * 0.12} ${w / 2} ${h * 0.25}C${w / 2} ${h * 0.12} ${w * 0.6} 0 ${w * 0.72} 0C${w * 0.85} 0 ${w} ${h * 0.08} ${w} ${h * 0.25}C${w} ${h * 0.45} ${w * 0.9} ${h * 0.6} ${w / 2} ${h}Z`, inset: (w, h) => ({ x: w * 0.2, y: h * 0.15, w: w * 0.6, h: h * 0.5 }) },
  cloud: { name: 'Cloud', prst: 'cloud', path: (w, h) => `M${w * 0.25} ${h * 0.85}A${w * 0.18} ${h * 0.2} 0 0 1 ${w * 0.12} ${h * 0.5}A${w * 0.2} ${h * 0.22} 0 0 1 ${w * 0.35} ${h * 0.2}A${w * 0.22} ${h * 0.22} 0 0 1 ${w * 0.7} ${h * 0.22}A${w * 0.2} ${h * 0.2} 0 0 1 ${w * 0.9} ${h * 0.55}A${w * 0.17} ${h * 0.18} 0 0 1 ${w * 0.75} ${h * 0.88}A${w * 0.22} ${h * 0.14} 0 0 1 ${w * 0.25} ${h * 0.85}Z`, inset: (w, h) => ({ x: w * 0.2, y: h * 0.25, w: w * 0.6, h: h * 0.5 }) },
  wedgeRectCallout: { name: 'Callout', prst: 'wedgeRectCallout', path: (w, h) => { const b = h * 0.75; return poly([[0, 0], [w, 0], [w, b], [w * 0.4, b], [w * 0.2, h], [w * 0.25, b], [0, b]]); }, inset: (w, h) => ({ x: 0, y: 0, w, h: h * 0.75 }) },
  wedgeEllipseCallout: { name: 'Oval Callout', prst: 'wedgeEllipseCallout', path: (w, h) => { const rx = w / 2, ry = h * 0.375; return `M${rx} 0A${rx} ${ry} 0 1 1 ${w * 0.3} ${h * 0.7}L${w * 0.2} ${h}L${w * 0.4} ${h * 0.74}A${rx} ${ry} 0 0 1 ${rx} 0Z`; }, inset: (w, h) => ({ x: w * 0.15, y: h * 0.1, w: w * 0.7, h: h * 0.55 }) },
  can: { name: 'Cylinder', prst: 'can', path: (w, h) => { const ry = Math.min(h * 0.125, w * 0.25); return `M0 ${ry}A${w / 2} ${ry} 0 0 1 ${w} ${ry}V${h - ry}A${w / 2} ${ry} 0 0 1 0 ${h - ry}ZM0 ${ry}A${w / 2} ${ry} 0 0 0 ${w} ${ry}`; }, inset: (w, h) => { const ry = Math.min(h * 0.125, w * 0.25); return { x: 0, y: ry * 2, w, h: h - ry * 3 }; } },
  cube: { name: 'Cube', prst: 'cube', path: (w, h) => { const d = Math.min(w, h) * 0.25; return poly([[0, d], [d, 0], [w, 0], [w, h - d], [w - d, h], [0, h]]) + `M0 ${d}H${w - d}V${h}M${w - d} ${d}L${w} 0`; }, inset: (w, h) => { const d = Math.min(w, h) * 0.25; return { x: 0, y: d, w: w - d, h: h - d }; } },
  donut: { name: 'Donut', prst: 'donut', path: (w, h) => { const rx = w / 2, ry = h / 2, ix = rx * 0.5, iy = ry * 0.5; return `M${rx} 0A${rx} ${ry} 0 1 1 ${rx} ${h}A${rx} ${ry} 0 1 1 ${rx} 0ZM${rx} ${ry - iy}A${ix} ${iy} 0 1 0 ${rx} ${ry + iy}A${ix} ${iy} 0 1 0 ${rx} ${ry - iy}Z`; } },
  pie: { name: 'Pie', prst: 'pie', path: (w, h) => { const rx = w / 2, ry = h / 2; return `M${rx} ${ry}L${rx} 0A${rx} ${ry} 0 1 1 ${w} ${ry}Z`; } },
  blockArc: { name: 'Block Arc', prst: 'blockArc', path: (w, h) => { const rx = w / 2, ry = h / 2; return `M0 ${ry}A${rx} ${ry} 0 0 1 ${w} ${ry}H${w - rx * 0.5}A${rx * 0.5} ${ry * 0.5} 0 0 0 ${rx * 0.5} ${ry}Z`; } },
  lightningBolt: { name: 'Lightning', prst: 'lightningBolt', path: (w, h) => poly([[w * 0.4, 0], [w * 0.75, h * 0.4], [w * 0.55, h * 0.45], [w * 0.8, h * 0.7], [w * 0.62, h * 0.72], [w, h], [w * 0.35, h * 0.62], [w * 0.5, h * 0.58], [w * 0.2, h * 0.38], [w * 0.4, h * 0.34], [0, 0.1 * h]]), inset: (w, h) => ({ x: w * 0.3, y: h * 0.3, w: w * 0.4, h: h * 0.3 }) },
  sun: { name: 'Sun', prst: 'sun', path: (w, h) => { let d = `M${w * 0.5} ${h * 0.25}A${w * 0.25} ${h * 0.25} 0 1 1 ${w * 0.5} ${h * 0.75}A${w * 0.25} ${h * 0.25} 0 1 1 ${w * 0.5} ${h * 0.25}Z`; for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a), cx = w / 2, cy = h / 2; d += poly([[cx + c * w * 0.5, cy + s * h * 0.5], [cx + Math.cos(a + 0.2) * w * 0.32, cy + Math.sin(a + 0.2) * h * 0.32], [cx + Math.cos(a - 0.2) * w * 0.32, cy + Math.sin(a - 0.2) * h * 0.32]]); } return d; }, inset: (w, h) => ({ x: w * 0.3, y: h * 0.3, w: w * 0.4, h: h * 0.4 }) },
  moon: { name: 'Moon', prst: 'moon', path: (w, h) => `M${w} 0A${w * 0.5} ${h * 0.5} 0 1 0 ${w} ${h}A${w * 0.4} ${h * 0.37} 0 1 1 ${w} 0Z`, inset: (w, h) => ({ x: w * 0.1, y: h * 0.25, w: w * 0.45, h: h * 0.5 }) },
  smiley: { name: 'Smiley Face', prst: 'smileyFace', path: (w, h) => { const rx = w / 2, ry = h / 2; return `M${rx} 0A${rx} ${ry} 0 1 1 ${rx} ${h}A${rx} ${ry} 0 1 1 ${rx} 0ZM${w * 0.3} ${h * 0.35}a${w * 0.05} ${h * 0.06} 0 1 0 0.1 0ZM${w * 0.7} ${h * 0.35}a${w * 0.05} ${h * 0.06} 0 1 0 0.1 0ZM${w * 0.25} ${h * 0.62}Q${rx} ${h * 0.9} ${w * 0.75} ${h * 0.62}`; } },
  noSmoking: { name: 'No Symbol', prst: 'noSmoking', path: (w, h) => { const rx = w / 2, ry = h / 2, ix = rx * 0.7, iy = ry * 0.7; return `M${rx} 0A${rx} ${ry} 0 1 1 ${rx} ${h}A${rx} ${ry} 0 1 1 ${rx} 0ZM${rx} ${ry - iy}A${ix} ${iy} 0 1 0 ${rx} ${ry + iy}A${ix} ${iy} 0 1 0 ${rx} ${ry - iy}ZM${rx - ix * 0.75} ${ry - iy * 0.55}L${rx + ix * 0.55} ${ry + iy * 0.75}L${rx + ix * 0.75} ${ry + iy * 0.55}L${rx - ix * 0.55} ${ry - iy * 0.75}Z`; } },
  frame: { name: 'Frame', prst: 'frame', path: (w, h) => { const d = Math.min(w, h) * 0.125; return `M0 0H${w}V${h}H0ZM${d} ${d}V${h - d}H${w - d}V${d}Z`; } },
  bevel: { name: 'Bevel', prst: 'bevel', path: (w, h) => { const d = Math.min(w, h) * 0.125; return `M0 0H${w}V${h}H0ZM${d} ${d}H${w - d}V${h - d}H${d}ZM0 0L${d} ${d}M${w} 0L${w - d} ${d}M${w} ${h}L${w - d} ${h - d}M0 ${h}L${d} ${h - d}`; } },
  flowTerminator: { name: 'Flowchart: Terminator', prst: 'flowChartTerminator', path: (w, h) => { const r = h / 2; return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 ${r} 0Z`; } },
  flowDocument: { name: 'Flowchart: Document', prst: 'flowChartDocument', path: (w, h) => `M0 0H${w}V${h * 0.8}Q${w * 0.75} ${h * 0.6} ${w / 2} ${h * 0.8}Q${w * 0.25} ${h} 0 ${h * 0.85}Z`, inset: (w, h) => ({ x: 0, y: 0, w, h: h * 0.75 }) },
  flowDecision: { name: 'Flowchart: Decision', prst: 'flowChartDecision', path: (w, h) => poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]), inset: (w, h) => ({ x: w * 0.25, y: h * 0.25, w: w * 0.5, h: h * 0.5 }) },
  flowData: { name: 'Flowchart: Data', prst: 'flowChartInputOutput', path: (w, h) => { const d = w * 0.2; return poly([[d, 0], [w, 0], [w - d, h], [0, h]]); } },
  flowPreparation: { name: 'Flowchart: Preparation', prst: 'flowChartPreparation', path: (w, h) => { const d = w * 0.2; return poly([[d, 0], [w - d, 0], [w, h / 2], [w - d, h], [d, h], [0, h / 2]]); } },
  flowConnector: { name: 'Flowchart: Connector', prst: 'flowChartConnector', path: (w, h) => { const rx = w / 2, ry = h / 2; return `M${rx} 0A${rx} ${ry} 0 1 1 ${rx} ${h}A${rx} ${ry} 0 1 1 ${rx} 0Z`; } },
  bracketPair: { name: 'Double Bracket', prst: 'bracketPair', path: (w, h) => { const r = Math.min(w, h) * 0.16; return `M${r} 0H0V${h}H${r}M${w - r} 0H${w}V${h}H${w - r}`; }, open: true },
  bracePair: { name: 'Double Brace', prst: 'bracePair', path: (w, h) => { const r = Math.min(w, h) * 0.08; return `M${r * 2} 0Q${r} 0 ${r} ${r}V${h / 2 - r}Q${r} ${h / 2} 0 ${h / 2}Q${r} ${h / 2} ${r} ${h / 2 + r}V${h - r}Q${r} ${h} ${r * 2} ${h}M${w - r * 2} 0Q${w - r} 0 ${w - r} ${r}V${h / 2 - r}Q${w - r} ${h / 2} ${w} ${h / 2}Q${w - r} ${h / 2} ${w - r} ${h / 2 + r}V${h - r}Q${w - r} ${h} ${w - r * 2} ${h}`; }, open: true },
};
export const SHAPE_GROUPS = [
  { name: 'Basic', items: ['rect', 'roundRect', 'snipRect', 'ellipse', 'triangle', 'rtTriangle', 'diamond', 'parallelogram', 'trapezoid', 'pentagon', 'hexagon', 'octagon', 'can', 'cube', 'donut', 'pie', 'blockArc', 'frame', 'bevel', 'heart', 'cloud', 'sun', 'moon', 'smiley', 'lightningBolt', 'noSmoking', 'bracketPair', 'bracePair'] },
  { name: 'Stars', items: ['star4', 'star5', 'star6'] },
  { name: 'Arrows', items: ['rightArrow', 'leftArrow', 'upArrow', 'downArrow', 'leftRightArrow', 'chevron', 'homePlate'] },
  { name: 'Callouts', items: ['wedgeRectCallout', 'wedgeEllipseCallout'] },
  { name: 'Flowchart', items: ['flowTerminator', 'flowDocument', 'flowDecision', 'flowData', 'flowPreparation', 'flowConnector'] },
];
export const shapePath = (shape, w, h) => (SHAPES[shape] || SHAPES.rect).path(Math.max(w, 0.01), Math.max(h, 0.01));
export const shapeInset = (shape, w, h) => { const s = SHAPES[shape]; return s && s.inset ? s.inset(w, h) : { x: 0, y: 0, w, h }; };
export const prstFor = (shape) => (SHAPES[shape] || SHAPES.rect).prst;
const PRST_TO_SHAPE = Object.fromEntries(Object.entries(SHAPES).map(([k, v]) => [v.prst, k]));
Object.assign(PRST_TO_SHAPE, { flowChartProcess: 'rect', flowChartAlternateProcess: 'roundRect', round2SameRect: 'roundRect', round1Rect: 'roundRect', snip1Rect: 'snipRect', star7: 'star6', star8: 'star6', star10: 'star6', star12: 'star6', star16: 'star6', star24: 'star6', star32: 'star6', mathPlus: 'plus', notchedRightArrow: 'rightArrow', stripedRightArrow: 'rightArrow', upDownArrow: 'leftRightArrow', quadArrow: 'plus', wedgeRoundRectCallout: 'wedgeRectCallout', cloudCallout: 'cloud', ribbon: 'rect', ribbon2: 'rect', wave: 'rect', doubleWave: 'rect', plaque: 'roundRect', decagon: 'octagon', dodecagon: 'octagon', heptagon: 'hexagon', flowChartMagneticDisk: 'can', flowChartPunchedCard: 'snipRect', flowChartPredefinedProcess: 'rect', flowChartInternalStorage: 'rect', flowChartMultidocument: 'flowDocument', flowChartManualInput: 'trapezoid', flowChartManualOperation: 'trapezoid', flowChartOffpageConnector: 'homePlate', flowChartDelay: 'flowTerminator', flowChartOr: 'ellipse', flowChartSummingJunction: 'ellipse', flowChartCollate: 'diamond', flowChartSort: 'diamond', flowChartExtract: 'triangle', flowChartMerge: 'triangle', flowChartDisplay: 'ellipse', flowChartOnlineStorage: 'can', flowChartMagneticTape: 'ellipse', flowChartMagneticDrum: 'can', leftBracket: 'bracketPair', rightBracket: 'bracketPair', leftBrace: 'bracePair', rightBrace: 'bracePair', mathMinus: 'rect', mathEqual: 'rect', irregularSeal1: 'star6', irregularSeal2: 'star6', corner: 'rect', diagStripe: 'rtTriangle', halfFrame: 'frame', teardrop: 'ellipse', chord: 'pie', arc: 'blockArc' });
export const shapeForPrst = (prst) => PRST_TO_SHAPE[prst] || null;

/** Custom geometry ({ cmds } normalised to the unit square, from pptx custGeom) → SVG path for w×h. */
export function geomPath(geom, w, h) {
  if (!geom || !geom.cmds) return shapePath('rect', w, h);
  let d = '', cx = 0, cy = 0;
  const f = (v) => Math.round(v * 1000) / 1000;
  for (const c of geom.cmds) {
    switch (c[0]) {
      case 'M': cx = c[1] * w; cy = c[2] * h; d += `M${f(cx)} ${f(cy)}`; break;
      case 'L': cx = c[1] * w; cy = c[2] * h; d += `L${f(cx)} ${f(cy)}`; break;
      case 'C': cx = c[5] * w; cy = c[6] * h; d += `C${f(c[1] * w)} ${f(c[2] * h)} ${f(c[3] * w)} ${f(c[4] * h)} ${f(cx)} ${f(cy)}`; break;
      case 'Q': cx = c[3] * w; cy = c[4] * h; d += `Q${f(c[1] * w)} ${f(c[2] * h)} ${f(cx)} ${f(cy)}`; break;
      case 'A': { const rx = c[1] * w, ry = c[2] * h, st = (c[3] * Math.PI) / 180, sw = (c[4] * Math.PI) / 180; const ccx = cx - rx * Math.cos(st), ccy = cy - ry * Math.sin(st); cx = ccx + rx * Math.cos(st + sw); cy = ccy + ry * Math.sin(st + sw); d += `A${f(rx)} ${f(ry)} 0 ${Math.abs(c[4]) > 180 ? 1 : 0} ${c[4] > 0 ? 1 : 0} ${f(cx)} ${f(cy)}`; break; }
      case 'Z': d += 'Z'; break;
      default: break;
    }
  }
  return d || shapePath('rect', w, h);
}
export const pathFor = (el, w, h) => (el.shape === 'custom' && el.geom ? geomPath(el.geom, w, h) : shapePath(el.shape, w, h));
