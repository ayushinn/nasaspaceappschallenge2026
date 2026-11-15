export type Ramp = [number, number, number][];

const INFERNO: Ramp = [
  [0, 0, 4],
  [12, 8, 38],
  [35, 11, 71],
  [58, 9, 99],
  [84, 7, 116],
  [105, 19, 124],
  [126, 31, 129],
  [148, 45, 128],
  [170, 60, 120],
  [191, 77, 106],
  [211, 96, 86],
  [229, 120, 60],
  [244, 151, 30],
  [253, 186, 15],
  [249, 222, 73],
  [252, 255, 164],
];

const VIRIDIS: Ramp = [
  [68, 1, 84],
  [72, 26, 108],
  [71, 47, 125],
  [65, 68, 135],
  [57, 86, 140],
  [49, 104, 142],
  [42, 120, 142],
  [35, 136, 142],
  [31, 152, 139],
  [34, 168, 132],
  [53, 183, 121],
  [84, 197, 104],
  [122, 209, 81],
  [165, 219, 54],
  [210, 226, 27],
  [253, 231, 37],
];

const GRAY: Ramp = [
  [8, 10, 14],
  [255, 255, 255],
];

/** Diverging map for difference images: cool sink, warm source. */
const DIVERGE: Ramp = [
  [64, 168, 196],
  [24, 74, 96],
  [10, 12, 16],
  [120, 74, 24],
  [255, 176, 64],
];

export const RAMPS = { inferno: INFERNO, viridis: VIRIDIS, gray: GRAY, diverge: DIVERGE };
export type RampName = keyof typeof RAMPS;

const cache = new Map<string, Uint8ClampedArray>();

export function rampLut(name: RampName): Uint8ClampedArray {
  const hit = cache.get(name);
  if (hit) return hit;
  const stops = RAMPS[name];
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1);
    const i0 = Math.floor(t);
    const i1 = Math.min(stops.length - 1, i0 + 1);
    const f = t - i0;
    for (let c = 0; c < 3; c++) {
      lut[i * 3 + c] = Math.round(stops[i0][c] * (1 - f) + stops[i1][c] * f);
    }
  }
  cache.set(name, lut);
  return lut;
}
