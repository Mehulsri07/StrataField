// Builds app/src/assets/lucknow-elevation.bin: ground height for Lucknow and its surroundings on a
// regular grid (about 100 m apart), used by the cross-section's "heights above sea level".
//
// Source: Terrain Tiles on AWS (https://registry.opendata.aws/terrain-tiles/), "terrarium" encoding,
// zoom 12 (about 38 m per pixel). Around Lucknow the data comes from SRTM (NASA). Heights are
// approximate (a few metres), and in the city partly include buildings and trees.
//
// Run: node scripts/build-elevation.mjs   (needs internet; about 40 small images are downloaded)
//
// File format (little-endian): "SEL1", uint32 cols, uint32 rows, float64 west, south, east, north,
// then cols*rows int16 heights in decimetres, row by row from north to south; -32768 = no data.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const BBOX = { west: 80.75, south: 26.65, east: 81.15, north: 27.05 };
const STEP = 0.001; // degrees between grid points (about 100 m)
const Z = 12;
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app", "src", "assets", "lucknow-elevation.bin");

const lon2x = (lon) => ((lon + 180) / 360) * 2 ** Z * 256;
const lat2y = (lat) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z * 256; };

/** Minimal PNG decoder for 8-bit RGB/RGBA, non-interlaced images (what terrarium tiles are). */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8, width = 0, height = 0, channels = 0; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      const depth = data[8], colour = data[9], interlace = data[12];
      if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6)) throw new Error(`unsupported PNG (depth ${depth}, colour ${colour})`);
      channels = colour === 2 ? 3 : 4;
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels, px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += Math.floor((a + b) / 2);
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  return { width, height, channels, px };
}

// Download the tiles covering the area.
const x0 = Math.floor(lon2x(BBOX.west) / 256), x1 = Math.floor(lon2x(BBOX.east) / 256);
const y0 = Math.floor(lat2y(BBOX.north) / 256), y1 = Math.floor(lat2y(BBOX.south) / 256);
const tiles = new Map();
for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  tiles.set(`${tx}/${ty}`, decodePng(Buffer.from(await res.arrayBuffer())));
  process.stdout.write(".");
}
console.log(` ${tiles.size} tiles`);

/** Height in metres at a global pixel position (bilinear between the four nearest pixels). */
function heightAt(gx, gy) {
  const at = (x, y) => {
    const t = tiles.get(`${Math.floor(x / 256)}/${Math.floor(y / 256)}`);
    const i = ((y % 256) * 256 + (x % 256)) * t.channels;
    return t.px[i] * 256 + t.px[i + 1] + t.px[i + 2] / 256 - 32768;
  };
  const fx = gx - 0.5, fy = gy - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), dx = fx - ix, dy = fy - iy;
  return at(ix, iy) * (1 - dx) * (1 - dy) + at(ix + 1, iy) * dx * (1 - dy) + at(ix, iy + 1) * (1 - dx) * dy + at(ix + 1, iy + 1) * dx * dy;
}

const cols = Math.round((BBOX.east - BBOX.west) / STEP) + 1, rows = Math.round((BBOX.north - BBOX.south) / STEP) + 1;
const file = Buffer.alloc(4 + 8 + 32 + cols * rows * 2);
file.write("SEL1", 0, "ascii");
file.writeUInt32LE(cols, 4); file.writeUInt32LE(rows, 8);
[BBOX.west, BBOX.south, BBOX.east, BBOX.north].forEach((v, k) => file.writeDoubleLE(v, 12 + k * 8));
let min = Infinity, max = -Infinity;
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const lat = BBOX.north - r * STEP, lon = BBOX.west + c * STEP;
  const m = heightAt(lon2x(lon), lat2y(lat));
  min = Math.min(min, m); max = Math.max(max, m);
  file.writeInt16LE(Math.round(m * 10), 44 + (r * cols + c) * 2);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, file);
console.log(`${cols} x ${rows} points, heights ${min.toFixed(1)} to ${max.toFixed(1)} m, ${(file.length / 1024).toFixed(0)} KB -> ${out}`);
