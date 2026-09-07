// Generates simple PWA icons (dark background, gold "S" block) without any dependencies.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const bg = [0x0b, 0x0f, 0x14],
  gold = [0xfb, 0xbf, 0x24],
  white = [0xff, 0xff, 0xff];
function draw(size) {
  const u = size / 16;
  // "S" shape drawn from three horizontal bars and two vertical stubs on a rounded gold tile.
  return png(size, (x, y) => {
    const inTile = x > u * 1.5 && x < size - u * 1.5 && y > u * 1.5 && y < size - u * 1.5;
    if (!inTile) return bg;
    const bar = (y0) => y >= y0 && y < y0 + 2 * u && x >= 4.5 * u && x < 11.5 * u;
    const top = bar(3.5 * u),
      mid = bar(7 * u),
      bot = bar(10.5 * u);
    const leftStub = x >= 4.5 * u && x < 6.5 * u && y >= 3.5 * u && y < 9 * u;
    const rightStub = x >= 9.5 * u && x < 11.5 * u && y >= 7 * u && y < 12.5 * u;
    return top || mid || bot || leftStub || rightStub ? white : gold;
  });
}
mkdirSync('apps/web/public/icons', { recursive: true });
for (const s of [192, 512]) writeFileSync(`apps/web/public/icons/icon-${s}.png`, draw(s));
console.log('icons written');
