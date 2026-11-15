/**
 * Cutout fetching, north-up resampling, alignment and aperture photometry.
 *
 * Three facts about SPHEREx data drive this file:
 *
 *  1. A level-2 cutout is a single 2-D spectral image (wavelength varies along
 *     the detector y-axis through the LVF), not a cube, and it always ships with
 *     a ~3.9 MB PSF table. Download cost is therefore ~4 MB whether you ask for
 *     3 arcmin or 30, so we ask for a generous box and bin down.
 *  2. Cutout axes follow the *spacecraft* orientation of that exposure. Measured
 *     at one position: -163.7 deg in survey 1 vs +19.6 deg in survey 2, i.e. the
 *     field arrives nearly inverted between epochs. Blinking raw arrays would
 *     show rotation, not motion, so every frame is resampled to north-up.
 *  3. Centres snap to the parent pixel grid, so a residual translation of up to
 *     ~1 pixel remains after rotation. We measure it by cross-correlation and
 *     report it instead of hiding it.
 */

import { parseFits, type FitsImage, type Hdu } from "./fits.ts";
import type { Observation } from "./spherex.ts";

export const NOMINAL_PIXEL_DEG = 6.15 / 3600;

export interface RawFrame {
  image: Float32Array;
  flags?: Float32Array;
  variance?: Float32Array;
  nx: number;
  ny: number;
  northAngleDeg: number;
  pixelScaleDeg: number;
  mjd: number;
  exptime: number;
  unit: string;
  hduHeader: Hdu["header"];
}

const UA = "spherex-blink/1.0 (NASA Space Apps hackathon demo)";

/** IRSA's cutout service answers 503 when busy; retry with backoff. */
export async function fetchCutout(
  accessUrl: string,
  ra: number,
  dec: number,
  sizeDeg: number,
  attempts = 4,
): Promise<Uint8Array> {
  const url = `${accessUrl}?center=${ra.toFixed(5)},${dec.toFixed(5)}&size=${sizeDeg.toFixed(4)}`;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { "user-agent": UA } });
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
      lastErr = new Error(`cutout HTTP ${res.status}`);
      if (res.status !== 503 && res.status !== 429 && res.status < 500) break;
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 1200 * (i + 1) + Math.random() * 600));
  }
  throw new Error(`cutout unavailable for ${accessUrl.split("/").pop()}: ${String(lastErr)}`);
}

function cdMatrix(h: Hdu["header"]) {
  const num = (k: string, d: number) => (typeof h[k] === "number" ? (h[k] as number) : d);
  const cdelt1 = num("CDELT1", 1);
  const cdelt2 = num("CDELT2", 1);
  return [
    [num("PC1_1", 1) * cdelt1, num("PC1_2", 1) * cdelt2],
    [num("PC2_1", 0) * cdelt1, num("PC2_2", 1) * cdelt2],
  ];
}

export function decodeFrame(buf: Uint8Array): RawFrame {
  const fits = parseFits(buf);
  const sci =
    fits.images.find((im) => im.name.trim().toUpperCase() === "IMAGE") ?? fits.images[0];
  if (!sci) throw new Error("cutout contained no image extension");
  const flags = fits.images.find((im) => im.name.trim().toUpperCase() === "FLAGS");
  const variance = fits.images.find((im) => im.name.trim().toUpperCase() === "VARIANCE");

  const cd = cdMatrix(sci.header);
  const det = cd[0][0] * cd[1][1] - cd[0][1] * cd[1][0];
  const northAngleDeg = (Math.atan2(-cd[0][1], cd[1][1]) * 180) / Math.PI;
  const pixelScaleDeg = Math.sqrt(Math.abs(det));
  const mjd = typeof sci.header["MJD-OBS"] === "number" ? (sci.header["MJD-OBS"] as number) : NaN;
  const exptime =
    typeof sci.header["EXPTIME"] === "number"
      ? (sci.header["EXPTIME"] as number)
      : typeof sci.header["T_EXPTIME"] === "number"
        ? (sci.header["T_EXPTIME"] as number)
        : 113.58;

  return {
    image: sci.data,
    flags: flags && flags.nx === sci.nx && flags.ny === sci.ny ? flags.data : undefined,
    variance:
      variance && variance.nx === sci.nx && variance.ny === sci.ny ? variance.data : undefined,
    nx: sci.nx,
    ny: sci.ny,
    northAngleDeg,
    pixelScaleDeg,
    mjd,
    exptime,
    unit: typeof sci.header["BUNIT"] === "string" ? (sci.header["BUNIT"] as string).trim() : "",
    hduHeader: sci.header,
  };
}

function bilinear(src: Float32Array, nx: number, ny: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x > nx - 1 || y > ny - 1) return NaN;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, nx - 1);
  const y1 = Math.min(y0 + 1, ny - 1);
  const fx = x - x0;
  const fy = y - y0;
  const v00 = src[y0 * nx + x0];
  const v10 = src[y0 * nx + x1];
  const v01 = src[y1 * nx + x0];
  const v11 = src[y1 * nx + x1];
  if (![v00, v10, v01, v11].every(Number.isFinite)) {
    // Fall back to nearest neighbour at masked edges instead of poisoning the pixel.
    const nearest = src[Math.round(y) * nx + Math.round(x)];
    return Number.isFinite(nearest) ? nearest : NaN;
  }
  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
}

/**
 * Rotate a cutout so celestial north is +y and east is -x (the standard
 * north-up, east-left sky orientation), centred on the requested position.
 */
export function toNorthUp(frame: RawFrame, outN: number): Float32Array {
  const cd = cdMatrix(frame.hduHeader);
  const det = cd[0][0] * cd[1][1] - cd[0][1] * cd[1][0];
  // unit pixel vectors for +east and +north, derived from the inverse CD matrix
  let ex = cd[1][1] / det;
  let ey = -cd[1][0] / det;
  let nxv = -cd[0][1] / det;
  let nyv = cd[0][0] / det;
  const el = Math.hypot(ex, ey);
  const nl = Math.hypot(nxv, nyv);
  ex /= el; ey /= el; nxv /= nl; nyv /= nl;

  const cx = (frame.nx - 1) / 2;
  const cy = (frame.ny - 1) / 2;
  const half = (outN - 1) / 2;
  const out = new Float32Array(outN * outN);
  for (let j = 0; j < outN; j++) {
    const dy = j - half;
    for (let i = 0; i < outN; i++) {
      const dx = i - half;
      const sx = cx + (-dx * ex + dy * nxv);
      const sy = cy + (-dx * ey + dy * nyv);
      out[j * outN + i] = bilinear(frame.image, frame.nx, frame.ny, sx, sy);
    }
  }
  return out;
}

export function shiftImage(src: Float32Array, n: number, dx: number, dy: number): Float32Array {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return src;
  const out = new Float32Array(n * n);
  const half = (n - 1) / 2;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = i - dx;
      const y = j - dy;
      out[j * n + i] = bilinear(src, n, n, x, y);
    }
  }
  void half;
  return out;
}

function median(values: number[]): number {
  if (!values.length) return NaN;
  const s = values.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Subtract a boxcar mean so zodiacal background gradients cannot win the correlation. */
function highPass(src: Float32Array, n: number, radius = 4): Float32Array {
  const out = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let count = 0;
      for (let dj = -radius; dj <= radius; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= n) continue;
        for (let di = -radius; di <= radius; di++) {
          const ii = i + di;
          if (ii < 0 || ii >= n) continue;
          const v = src[jj * n + ii];
          if (Number.isFinite(v)) {
            sum += v;
            count++;
          }
        }
      }
      const v = src[j * n + i];
      out[j * n + i] = Number.isFinite(v) && count ? v - sum / count : NaN;
    }
  }
  return out;
}

/**
 * Pearson correlation over a small shift search, ignoring pixels that are not
 * finite in both frames (clipped footprints leave NaN wedges). Returns the shift
 * of `img` relative to `ref` in pixels, plus the correlation coefficient so the
 * caller can tell a real alignment from noise.
 */
export function correlate(
  ref: Float32Array,
  img: Float32Array,
  n: number,
  maxShift = 4,
): { dx: number; dy: number; peak: number } {
  const margin = maxShift + 1;
  const a = highPass(ref, n);
  const b = highPass(img, n);
  let best = { dx: 0, dy: 0, peak: -Infinity };
  const grid: number[][] = [];
  for (let dy = -maxShift; dy <= maxShift; dy++) {
    grid[dy + maxShift] = [];
    for (let dx = -maxShift; dx <= maxShift; dx++) {
      let sa = 0;
      let sb = 0;
      let saa = 0;
      let sbb = 0;
      let sab = 0;
      let count = 0;
      for (let j = margin; j < n - margin; j++) {
        for (let i = margin; i < n - margin; i++) {
          const va = a[j * n + i];
          const vb = b[(j + dy) * n + (i + dx)];
          if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
          sa += va;
          sb += vb;
          saa += va * va;
          sbb += vb * vb;
          sab += va * vb;
          count++;
        }
      }
      let score = -Infinity;
      if (count > 400) {
        const denom = Math.sqrt((count * saa - sa * sa) * (count * sbb - sb * sb));
        score = denom > 1e-12 ? (count * sab - sa * sb) / denom : -Infinity;
      }
      grid[dy + maxShift][dx + maxShift] = score;
      if (score > best.peak) best = { dx, dy, peak: score };
    }
  }
  const at = (dx: number, dy: number) =>
    grid[dy + maxShift]?.[dx + maxShift] ?? -Infinity;
  const parab = (m: number, c: number, p: number) => {
    const denom = m - 2 * c + p;
    if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12) return 0;
    const off = (0.5 * (m - p)) / denom;
    return Math.abs(off) <= 1 ? off : 0;
  };
  const subX = parab(at(best.dx - 1, best.dy), best.peak, at(best.dx + 1, best.dy));
  const subY = parab(at(best.dx, best.dy - 1), best.peak, at(best.dx, best.dy + 1));
  return { dx: best.dx + subX, dy: best.dy + subY, peak: best.peak };
}

export interface Photometry {
  flux: number;
  fluxErr: number;
  peak: number;
  flaggedFraction: number;
  background: number;
  backgroundSigma: number;
}

/** Aperture sum minus a local annulus, at the exact centre of the cutout (= requested position). */
export function aperturePhotometry(
  img: Float32Array,
  flags: Float32Array | undefined,
  variance: Float32Array | undefined,
  n: number,
  // SPHEREx masks saturated cores, so bright stars appear as rings; a 2.2-pixel
  // aperture captures those wings while staying close to the ~1-pixel PSF.
  apRadius = 2.2,
  bgInner = 5,
  bgOuter = 8,
): Photometry {
  const c = (n - 1) / 2;
  let apSum = 0;
  let apCount = 0;
  let apVar = 0;
  let flagged = 0;
  const bg: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const r = Math.hypot(i - c, j - c);
      const idx = j * n + i;
      const v = img[idx];
      if (r <= apRadius) {
        if (Number.isFinite(v)) {
          apSum += v;
          apCount++;
          if (variance) {
            const va = variance[idx];
            if (Number.isFinite(va)) apVar += va;
          }
          if (flags && Number.isFinite(flags[idx]) && flags[idx] !== 0) flagged++;
        }
      } else if (r >= bgInner && r <= bgOuter && Number.isFinite(v)) {
        bg.push(v);
      }
    }
  }
  const bgMed = bg.length ? median(bg) : 0;
  const bgSigma = bg.length
    ? Math.sqrt(bg.reduce((acc, v) => acc + (v - bgMed) ** 2, 0) / Math.max(1, bg.length - 1))
    : 1;
  const flux = apCount ? apSum - bgMed * apCount : NaN;
  // Variance map when present, otherwise poisson-free background scatter scaled
  // by aperture area — good enough to make non-detections obvious.
  const fluxErr = apVar > 0 ? Math.sqrt(apVar) : bgSigma * Math.sqrt(Math.max(1, apCount));
  return {
    flux,
    fluxErr,
    peak: apCount ? apSum / apCount : NaN,
    flaggedFraction: apCount ? flagged / apCount : 0,
    background: bgMed,
    backgroundSigma: bgSigma,
  };
}

/** Fraction of usable pixels in the central part of a resampled frame. */
export function centralCoverage(a: Float32Array, n: number, frac = 0.85): number {
  const margin = Math.floor((n * (1 - frac)) / 2);
  let ok = 0;
  let total = 0;
  for (let j = margin; j < n - margin; j++) {
    for (let i = margin; i < n - margin; i++) {
      total++;
      if (Number.isFinite(a[j * n + i])) ok++;
    }
  }
  return total ? ok / total : 0;
}

export function oddAtMost(value: number, cap = 129): number {
  const v = Math.max(9, Math.min(cap, Math.floor(value)));
  return v % 2 === 0 ? v - 1 : v;
}

export function epochLabel(period: string): string {
  const m = /^(\d{4})W(\d{2})$/.exec(period);
  if (!m) return period;
  return `${m[1]} W${m[2]}`;
}

export function detectorWavelength(obs: Observation): [number, number] {
  return [obs.emMin * 1e6, obs.emMax * 1e6];
}
