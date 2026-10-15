// PPTX writer/reader tests: package structure, XML validity, round trips, and importing a
// hand-built "foreign" package with placeholder inheritance, theme colors and group transforms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writePptx, chartPartXml } from '../js/pptx-write.js';
import { readPptx } from '../js/pptx-read.js';
import { readZip, writeZip } from '../js/zip.js';
import { parseXml, find, findAll, attr, rootEl } from '../js/xml.js';
import * as M from '../js/model.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function richDemo() {
  const p = M.demoPresentation();
  p.assets.img = PNG;
  const s = p.slides[2];
  s.elements.push(M.makeImage('img', 700, 100, 120, 80, { rotation: 15, crop: { l: 0.1, t: 0, r: 0.2, b: 0 }, radius: 4 }));
  s.elements.push(M.makeGroup([M.makeShape('hexagon', 600, 400, 60, 60, { fill: { type: 'solid', color: '#112233', opacity: 0.5 } }), M.makeLine(670, 400, 80, 60, { arrowStart: true, flipV: true })]));
  s.elements.push(M.makeShape('rect', 20, 20, 50, 50, { shape: 'custom', geom: { cmds: [['M', 0, 0], ['L', 1, 0], ['L', 0.5, 1], ['Z']] }, fill: { type: 'solid', color: '#ff0000' }, stroke: null }));
  s.elements.push(M.makeText(100, 480, 300, 40, { text: { paragraphs: [{ runs: [{ text: 'Link ', link: 'https://example.com' }, { text: 'and ' }, { text: 'sup', sup: 'sup' }], align: 'right', bullet: 'number', spaceBefore: 6 }] }, fill: { type: 'gradient', from: '#ff0000', to: '#0000ff', angle: 45 }, stroke: { color: '#00ff00', width: 2, dash: 'dot' }, autofit: 'shrink', valign: 'bottom' }));
  p.slides[1].hidden = true; p.slides[1].advance = 4; p.slides[1].background = { type: 'image', assetId: 'img', fit: 'cover' };
  p.slides[3].elements[0].anim = { type: 'zoom', dir: 'left', duration: 1, delay: 0.5, order: 1 };
  p.slides[3].elements[1].anim = { type: 'wipe', dir: 'up', duration: 0.5, delay: 0, order: 2 };
  p.footer = { text: 'Footer text', showNumber: true, showDate: true, dateText: '2026-10-14' };
  return p;
}

test('writePptx produces a valid package: content types, rels, parts, well-formed XML', async () => {
  const bytes = await writePptx(richDemo());
  const zip = await readZip(bytes);
  const ct = parseXml(await zip.get('[Content_Types].xml').text());
  const overrides = findAll(ct, 'Override').map((o) => attr(o, 'PartName'));
  for (const part of overrides) assert.ok(zip.has(part.slice(1)), 'override part exists: ' + part);
  for (const [name, e] of zip) {
    if (/\.(xml|rels)$/.test(name)) { const d = parseXml(await e.text()); assert.ok(rootEl(d), 'parses ' + name); }
    if (/\.xml$/.test(name) && !name.startsWith('[') && !name.includes('_rels')) assert.ok(overrides.includes('/' + name), 'content type for ' + name);
  }
  // every relationship target exists
  for (const [name, e] of zip) if (name.endsWith('.rels')) {
    const base = name.replace('_rels/', '').replace(/\.rels$/, '');
    for (const r of findAll(parseXml(await e.text()), 'Relationship')) {
      if (attr(r, 'TargetMode') === 'External') continue;
      const target = attr(r, 'Target'); const dir = base.slice(0, base.lastIndexOf('/') + 1);
      const parts = (dir + target).split('/'), out = []; for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
      assert.ok(zip.has(out.join('/')), `${name} → ${target}`);
    }
  }
  assert.ok(zip.has('ppt/media/image1.png') && zip.has('ppt/charts/chart1.xml') && zip.has('ppt/notesSlides/notesSlide2.xml'));
  const s1 = parseXml(await zip.get('ppt/slides/slide1.xml').text());
  assert.ok(find(s1, 'transition'), 'transition written'); assert.equal(attr(find(s1, 'ph'), 'type'), 'ctrTitle');
  const s2 = parseXml(await zip.get('ppt/slides/slide2.xml').text());
  assert.equal(attr(rootEl(s2), 'show'), '0'); assert.equal(attr(find(s2, 'transition'), 'advTm'), '4000'); assert.ok(find(s2, 'blipFill'), 'image background');
  assert.ok(find(s2, 'timing') && find(s2, 'spTgt'), 'animation timing');
  const s3 = parseXml(await zip.get('ppt/slides/slide3.xml').text());
  for (const tag of ['custGeom', 'grpSp', 'srcRect', 'hlinkClick', 'gradFill', 'normAutofit', 'buAutoNum', 'tbl', 'outerShdw']) assert.ok(find(s3, tag), tag);
  assert.ok(findAll(s3, 'alpha').some((a) => attr(a, 'val') === '50000'), 'fill alpha');
  const pres = parseXml(await zip.get('ppt/presentation.xml').text());
  assert.equal(attr(find(pres, 'sldSz'), 'cx'), String(960 * 12700)); assert.equal(findAll(pres, 'sldId').length, 4);
});

test('round trip preserves content, formatting, media, notes, transitions, animations', async () => {
  const p = richDemo();
  const back = await readPptx(await writePptx(p));
  assert.equal(back.slides.length, 4); assert.equal(back.width, 960); assert.equal(back.title, 'OfficePPT demo');
  assert.deepEqual(back.theme.accents.map((c) => c.toLowerCase()), p.theme.accents.map((c) => c.toLowerCase()));
  assert.equal(back.theme.fonts.heading, 'Trebuchet MS');
  const s1 = back.slides[0]; assert.equal(s1.layout, 'title'); assert.equal(M.textToString(s1.elements[0].text), 'OfficePPT'); assert.equal(s1.elements[0].ph, 'ctitle'); assert.equal(s1.transition.type, 'fade');
  const s2 = back.slides[1]; assert.equal(s2.hidden, true); assert.equal(s2.advance, 4); assert.equal(s2.background.type, 'image'); assert.equal(s2.notes, 'Mention that everything stays on the local machine.');
  const body = s2.elements.find((e) => e.ph === 'body'); assert.equal(body.text.paragraphs.length, 5); assert.equal(body.text.paragraphs[0].bullet, '•'); assert.equal(body.anim.type, 'fly');
  const s3 = back.slides[2];
  const types = s3.elements.map((e) => e.type); for (const t of ['shape', 'line', 'chart', 'table', 'image', 'group']) assert.ok(types.includes(t), t);
  const custom = s3.elements.find((e) => e.shape === 'custom'); assert.ok(custom && custom.geom.cmds.length === 4);
  const img = s3.elements.find((e) => e.type === 'image'); assert.equal(Math.round(img.rotation), 15); assert.ok(Math.abs(img.crop.l - 0.1) < 1e-6); assert.equal(back.assets[img.assetId], PNG);
  const chart = s3.elements.find((e) => e.type === 'chart'); assert.equal(chart.chartType, 'column'); assert.deepEqual(chart.categories, ['Q1', 'Q2', 'Q3', 'Q4']); assert.deepEqual(chart.series[1].values, [15, 21, 18, 27]); assert.equal(chart.title, 'Quarterly revenue');
  const tbl = s3.elements.find((e) => e.type === 'table'); assert.equal(tbl.rows.length, 3); assert.equal(M.textToString(tbl.rows[1][1].text), '1,240'); assert.ok(tbl.rows[0][0].fill, 'header fill kept');
  const grp = s3.elements.find((e) => e.type === 'group'); assert.equal(grp.children.length, 2); assert.equal(grp.children[1].type, 'line'); assert.equal(grp.children[1].arrowStart, true); assert.equal(grp.children[1].flipV, true);
  assert.ok(Math.abs(grp.children[0].fill.opacity - 0.5) < 1e-6);
  const rich = s3.elements.find((e) => e.type === 'text' && e.fill && e.fill.type === 'gradient');
  assert.ok(rich, 'gradient text box'); assert.equal(rich.stroke.dash, 'dot'); assert.equal(rich.autofit, 'shrink'); assert.equal(rich.valign, 'bottom');
  const para = rich.text.paragraphs[0]; assert.equal(para.bullet, 'number'); assert.equal(para.align || rich.align, 'right'); assert.equal(para.spaceBefore, 6);
  assert.equal(para.runs[0].link, 'https://example.com'); assert.equal(para.runs[2].sup, 'sup');
  const s4 = back.slides[3]; assert.equal(s4.elements[0].anim.type, 'zoom'); assert.equal(s4.elements[1].anim.type, 'wipe'); assert.equal(s4.elements[1].anim.dir, 'up');
  // second round trip is stable
  const again = await readPptx(await writePptx(back));
  assert.equal(again.slides.length, 4); assert.equal(M.textToString(again.slides[2].elements.find((e) => e.type === 'table').rows[2][2].text), '+3%');
});

test('chart part xml is well formed for every chart type', () => {
  const el = M.makeChart(0, 0, 100, 100);
  for (const t of ['column', 'bar', 'line', 'area', 'pie', 'doughnut', 'scatter']) { const x = chartPartXml({ ...el, chartType: t, labels: true }, M.THEMES[0]); const d = parseXml(x); assert.equal(rootEl(d).name, 'c:chartSpace', t); assert.ok(findAll(d, 'ser').length >= 1, t); }
});

/** Build a minimal PowerPoint-like package by hand (as other apps write it) to test inheritance. */
async function foreignPptx() {
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const rels = (list) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, t, tg]) => `<Relationship Id="${id}" Type="${R}/${t}" Target="${tg}"/>`).join('')}</Relationships>`;
  const theme = `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="T"><a:themeElements><a:clrScheme name="T"><a:dk1><a:sysClr val="windowText" lastClr="111111"/></a:dk1><a:lt1><a:srgbClr val="FAFAFA"/></a:lt1><a:dk2><a:srgbClr val="222222"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2><a:accent1><a:srgbClr val="AA0000"/></a:accent1><a:accent2><a:srgbClr val="00AA00"/></a:accent2><a:accent3><a:srgbClr val="0000AA"/></a:accent3><a:accent4><a:srgbClr val="AAAA00"/></a:accent4><a:accent5><a:srgbClr val="AA00AA"/></a:accent5><a:accent6><a:srgbClr val="00AAAA"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="T"><a:majorFont><a:latin typeface="Georgia"/></a:majorFont><a:minorFont><a:latin typeface="Verdana"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>`;
  const master = `<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="1270000" y="635000"/><a:ext cx="9652000" cy="1270000"/></a:xfrm></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="1270000" y="2540000"/><a:ext cx="9652000" cy="3810000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p/></p:txBody></p:sp></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="4400" b="1"><a:solidFill><a:schemeClr val="tx2"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr marL="342900" indent="-342900"><a:buChar char="–"/><a:defRPr sz="2800"><a:solidFill><a:schemeClr val="accent1"><a:lumMod val="50000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl1pPr><a:lvl2pPr marL="742950" indent="-285750"><a:buChar char="•"/><a:defRPr sz="2400"/></a:lvl2pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;
  const layout = `<p:sldLayout ${NS} type="obj"><p:cSld name="Title and Content"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="635000" y="254000"/><a:ext cx="10922000" cy="1016000"/></a:xfrm></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  const slide = `<p:sld ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Inherited title</a:t></a:r></a:p></p:txBody></p:sp>
    <p:sp><p:nvSpPr><p:cNvPr id="3" name="Content 2"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>First</a:t></a:r></a:p><a:p><a:pPr lvl="1"/><a:r><a:rPr lang="en-US" b="1"><a:solidFill><a:schemeClr val="accent2"/></a:solidFill></a:rPr><a:t>Second</a:t></a:r><a:br/><a:r><a:t>after break</a:t></a:r></a:p><a:p><a:pPr><a:buNone/></a:pPr><a:r><a:t>No bullet</a:t></a:r></a:p></p:txBody></p:sp>
    <p:grpSp><p:nvGrpSpPr><p:cNvPr id="4" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="1270000" y="5080000"/><a:ext cx="2540000" cy="1270000"/><a:chOff x="0" y="0"/><a:chExt cx="1000" cy="500"/></a:xfrm></p:grpSpPr>
      <p:sp><p:nvSpPr><p:cNvPr id="5" name="A"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="500" cy="500"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent3"/></a:solidFill><a:ln w="25400"><a:solidFill><a:srgbClr val="123456"/></a:solidFill><a:prstDash val="dash"/></a:ln></p:spPr><p:style><a:lnRef idx="0"/><a:fillRef idx="0"/><a:effectRef idx="0"/><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></p:style></p:sp>
      <p:cxnSp><p:nvCxnSpPr><p:cNvPr id="6" name="L"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm flipV="1"><a:off x="500" y="0"/><a:ext cx="500" cy="500"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln><a:tailEnd type="arrow"/></a:ln></p:spPr><p:style><a:lnRef idx="1"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="0"/><a:effectRef idx="0"/><a:fontRef idx="minor"/></p:style></p:cxnSp>
    </p:grpSp>
    <p:sp><p:nvSpPr><p:cNvPr id="7" name="Styled"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm rot="2700000"><a:off x="8890000" y="5080000"/><a:ext cx="1270000" cy="1270000"/></a:xfrm><a:prstGeom prst="flowChartProcess"><a:avLst/></a:prstGeom></p:spPr><p:style><a:lnRef idx="2"><a:schemeClr val="accent1"><a:shade val="50000"/></a:schemeClr></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent4"/></a:fillRef><a:effectRef idx="0"/><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></p:style><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Styled</a:t></a:r></a:p></p:txBody></p:sp>
    <mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="p14"><p:sp><p:nvSpPr><p:cNvPr id="8" name="Choice"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100000" cy="100000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FF00FF"/></a:solidFill></p:spPr></p:sp></mc:Choice><mc:Fallback><p:sp><p:nvSpPr><p:cNvPr id="9" name="Fallback"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/></p:sp></mc:Fallback></mc:AlternateContent>
  </p:spTree></p:cSld><p:transition spd="slow"><p:wipe dir="u"/></p:transition></p:sld>`;
  const pres = `<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`;
  return writeZip([
    { name: '[Content_Types].xml', data: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>' },
    { name: '_rels/.rels', data: rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]) },
    { name: 'ppt/presentation.xml', data: pres }, { name: 'ppt/_rels/presentation.xml.rels', data: rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'slide', 'slides/slide1.xml']]) },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: master }, { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]) },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: layout }, { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]) },
    { name: 'ppt/theme/theme1.xml', data: theme },
    { name: 'ppt/slides/slide1.xml', data: slide }, { name: 'ppt/slides/_rels/slide1.xml.rels', data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]) },
  ]);
}

test('import a foreign package: placeholder geometry/style inheritance, theme colors, groups, styles, AlternateContent', async () => {
  const p = await readPptx(await foreignPptx());
  assert.equal(p.slides.length, 1); assert.equal(p.theme.fonts.heading, 'Georgia'); assert.equal(p.theme.accents[0].toUpperCase(), '#AA0000'); assert.equal(p.theme.bg.color.toUpperCase(), '#FAFAFA'); assert.equal(p.theme.text.toUpperCase(), '#111111');
  const s = p.slides[0]; assert.equal(s.transition.type, 'wipe'); assert.equal(s.transition.dir, 'up'); assert.ok(s.transition.duration > 1);
  const title = s.elements.find((e) => e.ph === 'title');
  assert.equal(Math.round(title.x), 50, 'xfrm from layout (635000 EMU)'); assert.equal(Math.round(title.w), 860);
  assert.equal(title.size, 44); assert.equal(title.bold, true); assert.equal(title.align, 'center'); assert.equal(title.font, 'Georgia'); assert.equal(title.color.toUpperCase(), '#222222', 'tx2 → dk2');
  const body = s.elements.find((e) => e.ph === 'body');
  assert.equal(Math.round(body.x), 100, 'xfrm from master'); assert.equal(Math.round(body.h), 300); assert.equal(body.valign, 'middle', 'anchor from master');
  assert.equal(body.size, 28); assert.equal(body.text.paragraphs[0].bullet, '–'); assert.equal(body.text.paragraphs[1].bullet, '•'); assert.equal(body.text.paragraphs[1].level, 1);
  assert.equal(body.text.paragraphs[1].runs[0].bold, true); assert.equal(body.text.paragraphs[1].runs[0].color.toUpperCase(), '#00AA00');
  assert.equal(body.text.paragraphs[2].runs[0].text, 'after break', 'a:br splits paragraphs'); assert.equal(body.text.paragraphs[2].bullet, undefined);
  assert.equal(body.text.paragraphs[3].bullet, undefined, 'buNone');
  assert.equal(body.color.toUpperCase(), '#550000', 'lumMod applied to accent1');
  const grp = s.elements.find((e) => e.type === 'group'); assert.ok(grp, 'group'); assert.equal(grp.children.length, 2);
  const ell = grp.children[0]; assert.equal(ell.shape, 'ellipse'); assert.equal(Math.round(ell.x), 100); assert.equal(Math.round(ell.w), 100); assert.equal(Math.round(ell.h), 100); assert.equal(ell.fill.color.toUpperCase(), '#0000AA'); assert.equal(ell.stroke.dash, 'dash'); assert.equal(ell.stroke.width, 2);
  const line = grp.children[1]; assert.equal(line.type, 'line'); assert.equal(line.flipV, true); assert.equal(line.arrowEnd, true); assert.equal(line.stroke.color.toUpperCase(), '#AA0000', 'line color from style lnRef'); assert.equal(Math.round(line.x), 200);
  const styled = s.elements.find((e) => e.name === 'Styled'); assert.equal(styled.shape, 'rect'); assert.equal(styled.rotation, 45); assert.equal(styled.fill.color.toUpperCase(), '#AAAA00', 'fill from style fillRef'); assert.equal(styled.stroke.color.toUpperCase(), '#550000', 'shade applied'); assert.equal(styled.color.toUpperCase(), '#FAFAFA', 'font color from fontRef lt1');
  assert.ok(s.elements.some((e) => e.name === 'Choice'), 'mc:Choice content used'); assert.ok(!s.elements.some((e) => e.name === 'Fallback'));
  assert.equal(s.background, null, 'master bg equals theme bg → inherit');
});
