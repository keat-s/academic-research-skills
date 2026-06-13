// Generates solid-color PWA/app icons (no external deps) so the build has
// valid PNGs. Replace with real artwork any time.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const COLOR = [15, 23, 42]; // #0f172a

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  // rows: filter byte + RGB pixels
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = COLOR[0];
    row[1 + x * 3 + 1] = COLOR[1];
    row[1 + x * 3 + 2] = COLOR[2];
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  const path = `public/icon-${size}.png`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png(size));
  console.log("wrote", path);
}
// Tauri also wants a 32x32 and an icon.png
writeFileSync("src-tauri/icons/icon.png", png(512));
writeFileSync("src-tauri/icons/32x32.png", png(32));
writeFileSync("src-tauri/icons/128x128.png", png(128));
writeFileSync("src-tauri/icons/128x128@2x.png", png(256));
console.log("wrote tauri icons");
