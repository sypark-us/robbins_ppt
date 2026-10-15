# RobbinsPPT

A free, PowerPoint-style presentation editor that runs entirely in the browser. No server, no
build step, no dependencies, no uploads: your files never leave your computer.

**Run it:** double-click `start.cmd` (Windows, needs [Node.js](https://nodejs.org)), or serve the
folder with any static server and open it in Chrome, Edge, Firefox or Safari:

```
node test/serve.mjs 8080        # then open http://localhost:8080/
# or: npx serve .  /  python -m http.server 8080
```

Opening `index.html` straight from disk does not work: browsers refuse to load ES modules from
`file://`. Add `?demo` to the URL to open a sample presentation.

Tests (Node 20+; the browser test needs Chrome or Edge installed):

```
npm run test:unit    # node --test: zip, xml, model, text layout, shapes, charts, svg, pptx read/write
npm run test:smoke   # drives the real app in headless Chrome: editing, dragging, text, export, slide show
npm test             # both
node test/screenshot.mjs screenshots   # captures screenshots of the editor and slide show
```

## Features

### Slides
- Nine layouts (title, title and content, section header, two content, comparison, title only,
  blank, content/picture with caption), placeholder prompts, layout switching that keeps your text.
- Ten themes (colors, fonts, solid or gradient backgrounds); switching a theme re-colors shapes,
  text and tables that used theme colors.
- Per-slide backgrounds: solid, gradient or picture (fill / fit / stretch); apply to all slides.
- Slide sizes 16:9, 16:10, 4:3, A4, Letter (objects are scaled when you change size).
- Thumbnail panel with drag-and-drop reordering, multi-select, duplicate, delete, hide; slide
  sorter view; speaker notes pane; header & footer (footer text, date, slide numbers).
- New slides from a text outline (`# Title` + bullet lines), find & replace across the deck.

### Objects
- **Text boxes** with rich text: fonts, sizes, bold/italic/underline/strikethrough, colors,
  superscript, hyperlinks, left/center/right/justify, bullets (several styles), numbering
  (1. / a. / i.), list levels (Tab / Shift+Tab), line spacing, vertical alignment, padding,
  shrink-on-overflow autofit. Edit in place: double-click or just start typing.
- **Shapes**: 45 presets (rectangles, ellipse, triangles, polygons, stars, arrows, chevrons,
  callouts, flowchart symbols, heart, cloud, sun, moon, smiley, brackets…), solid or gradient
  fill with transparency, outline color / width / dash, shadow, text inside shapes.
- **Lines and arrows** with draggable end points, dash styles and arrow heads.
- **Pictures** from file, drag & drop, paste or URL; corner radius, border, shadow, crop, opacity.
- **Tables** with header row, banded rows, cell fills, per-cell formatting, add/remove rows and
  columns, Tab to move between cells.
- **Charts**: column, bar, line, area, pie, doughnut, scatter; edit data in a grid (paste from a
  spreadsheet), title, legend, data labels, gridlines, theme colors.
- Symbols, slide number and date text, hyperlinks on text or whole objects.

### Editing
- Select, multi-select (Shift/Ctrl-click, marquee), move, resize with handles (Shift keeps
  proportions), rotate with the rotation handle (Shift snaps to 15°), Alt-drag to duplicate.
- Smart guides that snap to slide edges/centers and to other objects; optional grid and grid snap.
- Align (left/center/right/top/middle/bottom), distribute, group/ungroup, order (front/back),
  rotate 90°, flip, lock, nudge with arrow keys, context menus everywhere.
- Unlimited undo/redo, copy/cut/paste/duplicate (also across tabs), format pane with every
  property of the selected object, zoom 10–600 % (Ctrl+wheel), fit to window.
- Automatic recovery: your work is saved in the browser (IndexedDB) and restored on reload.

### Slide show
- Transitions per slide (fade, push, wipe, cover, zoom, split, dissolve, wheel, circle,
  newsflash, cut, random) with direction and duration; apply to all; preview.
- Entrance animations per object (appear, fade, fly in, zoom, wipe, bounce, spin, float) with
  direction, duration, delay and click order; preview.
- Full-screen show (F5 / Shift+F5), click or keyboard navigation, jump to slide number, black/white
  screen, laser pointer, pen with erase, on-screen notes, auto-advance timings, loop, hidden slides,
  rehearse timings.
- **Presenter view** in a second window: current and next slide, notes, elapsed timer, clock.

### Files
- **Open** PowerPoint `.pptx` files (text with inherited placeholder styles, shapes incl. custom
  geometry, pictures, lines, groups, tables, charts, backgrounds, theme colors/fonts, notes,
  transitions, entrance animations, hidden slides) and RobbinsPPT `.json` projects.
- **Save as PowerPoint (.pptx)** that opens in PowerPoint, Keynote, Google Slides and LibreOffice:
  real text, shapes, pictures, tables, native charts, notes, transitions and animations.
- **Export** PDF, PNG / JPEG images (one file or a zip), SVG (vector), and a standalone HTML
  slide show; print one, two, four or six slides per page or slides with notes.
- Save / Save As use the File System Access API when available (Ctrl+S overwrites the file).

## Layout of the code

```
index.html        app shell
css/style.css     editor, ribbon, dialogs, slide show transitions and animations
js/app.js         App: state, history, commands, file I/O, clipboard, autosave
js/ui.js          ribbon, file menu, format pane, thumbnails, dialogs, menus, shortcuts
js/editor.js      canvas interaction: selection, drag/resize/rotate, snapping, text editing
js/render.js      DOM renderer for the canvas and the slide show, contenteditable → model
js/svg.js         SVG renderer (thumbnails, PNG/PDF/HTML export)
js/textlayout.js  word wrap / bullets / numbering layout engine
js/model.js       document model, layouts, themes, history, outline import
js/shapes.js      preset shape geometry (SVG paths) and OOXML preset names
js/charts.js      chart rendering to SVG
js/show.js        slide show player, presenter window
js/export.js      PNG/JPEG/SVG/PDF/HTML/print
js/pptx-write.js  .pptx writer       js/pptx-read.js  .pptx reader
js/zip.js         zip reader/writer  js/xml.js        XML parser
test/             node tests, browser smoke test, screenshot script, static server
```

Units are points (a 16:9 slide is 960 × 540 pt, 1 pt = 12700 EMU), which maps directly to
PowerPoint's coordinate system.

## License

MIT
