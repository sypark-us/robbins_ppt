// Takes screenshots of the app in headless Chrome. Usage: node test/screenshot.mjs [outDir]
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const outDir = process.argv[2] || 'screenshots';
mkdirSync(outDir, { recursive: true });
const PORT = 8149, CDP = 9349;
const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
const chrome = candidates.find((p) => existsSync(p));
if (!chrome) { console.error('No Chrome found'); process.exit(2); }
const server = spawn(process.execPath, [fileURLToPath(new URL('./serve.mjs', import.meta.url)), String(PORT)], { stdio: 'ignore' });
await delay(500);
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--window-size=1400,900', `--remote-debugging-port=${CDP}`, `--user-data-dir=${process.env.TEMP || '/tmp'}/robbinsppt-shot-profile`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { browser.kill(); } catch { /* */ } try { server.kill(); } catch { /* */ } };
process.on('exit', cleanup);
let targets = null;
for (let i = 0; i < 50 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); } catch { await delay(200); } }
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) console.log('eval error', JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result?.result?.value; };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(outDir, name), Buffer.from(r.result.data, 'base64')); console.log('saved', join(outDir, name)); };
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: `http://localhost:${PORT}/?demo` });
await delay(1500);
await evaluate(`app.gotoSlide(2); app.editor.select(app.slide.elements.find(e => e.shape === 'roundRect').id); 'ok'`);
await delay(300);
await shot('01-editor.png');
await evaluate(`app.gotoSlide(1); app.ui.setTab('design'); app.editor.clearSelection(); 'ok'`);
await delay(300);
await shot('02-design.png');
await evaluate(`app.startShow(2, { windowed: true }); 'ok'`);
await delay(600);
await shot('03-show.png');
await evaluate(`app.show.stop(); document.body.classList.add('sorter'); app.ui.renderThumbs(); 'ok'`);
await delay(300);
await shot('04-sorter.png');
ws.close(); cleanup(); process.exit(0);
