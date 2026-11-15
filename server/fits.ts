/**
 * Minimal FITS reader.
 *
 * Only what a SPHEREx level-2 cutout needs: walk the HDU chain, decode image
 * arrays (2-D or 3-D), and expose header keywords. Tile-compressed binary
 * tables (the PSF extension) are skipped by size arithmetic rather than decoded,
 * because a 29x29 cutout arrives with ~3.9 MB of PSF table we never render.
 */

export type Header = Record<string, string | number | boolean>;

export interface Hdu {
  index: number;
  name: string;
  header: Header;
  cards: string[];
}

export interface FitsImage extends Hdu {
  nx: number;
  ny: number;
  nz: number;
  /** Plane-major [z][y][x] float data, BSCALE/BZERO applied. */
  data: Float32Array;
  planes: Float32Array[];
}

export interface FitsFile {
  hdus: Hdu[];
  images: FitsImage[];
}

const BLOCK = 2880;

function readHeader(buf: Uint8Array, offset: number) {
  const cards: string[] = [];
  let p = offset;
  let ended = false;
  while (p + 80 <= buf.length) {
    const card = latin1(buf, p, 80);
    cards.push(card);
    if (card.startsWith("END")) {
      ended = true;
      p += 80;
      break;
    }
    p += 80;
  }
  const header: Header = {};
  for (const card of cards) {
    const key = card.slice(0, 8).trim();
    if (!key || key === "END" || key === "COMMENT" || key === "HISTORY") continue;
    const raw = card.slice(10).trim();
    // Quoted strings can contain '/', so the comment split must come second.
    if (raw.startsWith("'")) {
      const close = raw.indexOf("'", 1);
      header[key] = (close > 0 ? raw.slice(1, close) : raw.slice(1)).trim();
      continue;
    }
    const slash = raw.indexOf("/");
    const value = (slash >= 0 ? raw.slice(0, slash) : raw).trim();
    if (value === "T") { header[key] = true; continue; }
    if (value === "F") { header[key] = false; continue; }
    const num = Number(value);
    header[key] = value !== "" && Number.isFinite(num) ? num : value;
  }
  return { cards, header, headerBytes: p - offset, ended };
}

function latin1(buf: Uint8Array, start: number, len: number): string {
  let out = "";
  const end = Math.min(start + len, buf.length);
  for (let i = start; i < end; i++) out += String.fromCharCode(buf[i]);
  return out;
}

const roundUp = (n: number, m: number) => Math.ceil(n / m) * m;

export function parseFits(buf: Uint8Array): FitsFile {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const hdus: Hdu[] = [];
  const images: FitsImage[] = [];
  let offset = 0;
  let index = 0;

  while (offset + 80 <= buf.length) {
    const { cards, header, headerBytes, ended } = readHeader(buf, offset);
    if (!ended) break;

    const naxis = Number(header.NAXIS ?? 0);
    const dims: number[] = [];
    for (let i = 1; i <= naxis; i++) dims.push(Number(header[`NAXIS${i}`] ?? 1));

    const bitpix = Number(header.BITPIX ?? 8);
    const pcount = Number(header.PCOUNT ?? 0);
    const gcount = Number(header.GCOUNT ?? 1);
    const isTable = Number(header.TFIELDS ?? 0) > 0 || header.ZIMAGE !== undefined;

    let npix = naxis === 0 ? 0 : 1;
    for (const d of dims) npix *= d;
    const bytesPer = Math.abs(bitpix) / 8;
    const dataBytes = npix * bytesPer + (isTable ? pcount * gcount : 0);
    const dataOffset = offset + roundUp(headerBytes, BLOCK);

    const name = typeof header.EXTNAME === "string" ? header.EXTNAME : index === 0 ? "PRIMARY" : `HDU${index}`;
    const hdu: Hdu = { index, name, header, cards };
    hdus.push(hdu);

    const decodable =
      !isTable && naxis >= 1 && naxis <= 3 && [-32, -64, 8, 16, 32, 64].includes(bitpix) && npix > 0;

    if (decodable) {
      const nx = dims[0] ?? 1;
      const ny = dims[1] ?? 1;
      const nz = dims[2] ?? 1;
      const data = new Float32Array(npix);
      const bscale = Number(header.BSCALE ?? 1);
      const bzero = Number(header.BZERO ?? 0);
      for (let i = 0; i < npix; i++) {
        const at = dataOffset + i * bytesPer;
        if (at + bytesPer > buf.length) break;
        let v: number;
        switch (bitpix) {
          case -64: v = view.getFloat64(at, false); break;
          case -32: v = view.getFloat32(at, false); break;
          case 8: v = view.getUint8(at); break;
          case 16: v = view.getInt16(at, false); break;
          case 32: v = view.getInt32(at, false); break;
          case 64: v = Number(view.getBigInt64(at, false)); break;
          default: v = 0;
        }
        data[i] = bscale === 1 && bzero === 0 ? v : v * bscale + bzero;
      }
      const planes: Float32Array[] = [];
      for (let z = 0; z < nz; z++) planes.push(data.subarray(z * nx * ny, (z + 1) * nx * ny));
      images.push({ ...hdu, nx, ny, nz, data, planes });
    }

    offset = dataOffset + roundUp(dataBytes, BLOCK);
    index++;
    if (index > 24) break;
  }

  return { hdus, images };
}

export function findImage(fits: FitsFile, name: string): FitsImage | undefined {
  return fits.images.find((im) => im.name.trim().toUpperCase() === name.toUpperCase());
}

export function headerNumber(hdu: Hdu | undefined, key: string, fallback = NaN): number {
  const v = hdu?.header[key];
  return typeof v === "number" ? v : fallback;
}
