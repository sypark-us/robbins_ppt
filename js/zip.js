// Minimal ZIP reader/writer (deflate via the Compression Streams API, available in browsers and Node 18+).

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

async function pipeBytes(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
export const deflateRaw = (bytes) => pipeBytes(bytes, new CompressionStream('deflate-raw'));
export const inflateRaw = (bytes) => pipeBytes(bytes, new DecompressionStream('deflate-raw'));

const enc = new TextEncoder(), dec = new TextDecoder();
const dosDateTime = (d = new Date()) => ({ time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() });

/** entries: Array<{ name: string, data: Uint8Array|string, store?: boolean }> → Uint8Array (zip file) */
export async function writeZip(entries) {
  const { time, date } = dosDateTime();
  const locals = [], centrals = [];
  let offset = 0;
  for (const e of entries) {
    const raw = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    const nameBytes = enc.encode(e.name);
    const crc = crc32(raw);
    let method = 0, data = raw;
    if (!e.store && raw.length > 0) { const c = await deflateRaw(raw); if (c.length < raw.length) { method = 8; data = c; } }
    const lh = new Uint8Array(30 + nameBytes.length); const v = new DataView(lh.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, method, true);
    v.setUint16(10, time, true); v.setUint16(12, date, true); v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, raw.length, true);
    v.setUint16(26, nameBytes.length, true); v.setUint16(28, 0, true); lh.set(nameBytes, 30);
    const ch = new Uint8Array(46 + nameBytes.length); const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, method, true);
    cv.setUint16(12, time, true); cv.setUint16(14, date, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true); cv.setUint32(42, offset, true); ch.set(nameBytes, 46);
    locals.push(lh, data); centrals.push(ch);
    offset += lh.length + data.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22); const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const total = offset + cdSize + 22, out = new Uint8Array(total);
  let p = 0;
  for (const b of [...locals, ...centrals, eocd]) { out.set(b, p); p += b.length; }
  return out;
}

/** Uint8Array → Map<name, { bytes(): Promise<Uint8Array>, text(): Promise<string>, size }> */
export async function readZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 70000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = v.getUint16(eocd + 10, true), cdOffset = v.getUint32(eocd + 16, true);
  const entries = new Map();
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Bad zip central directory');
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), loff = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    const entry = {
      name, size: usize, method,
      async bytes() {
        const lnlen = v.getUint16(loff + 26, true), lxlen = v.getUint16(loff + 28, true);
        const start = loff + 30 + lnlen + lxlen, data = bytes.subarray(start, start + csize);
        if (method === 0) return data;
        if (method === 8) return inflateRaw(data);
        throw new Error('Unsupported zip compression method ' + method);
      },
      async text() { return dec.decode(await this.bytes()); },
    };
    entries.set(name, entry);
  }
  return entries;
}
