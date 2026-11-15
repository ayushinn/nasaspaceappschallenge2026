import type { Preset } from "../types";

/**
 * The five targets named in the challenge brief.
 *
 * Positions are J2000; `pmra`/`pmdec` are Gaia DR3 proper motions in mas/yr.
 * They matter more than they look: Barnard's Star travels 10.3"/yr, so by 2026
 * its J2000 position is 4.5 arcmin — nearly a whole 6-arcmin field — away from
 * where SPHEREx actually sees it. The app propagates presets to the observation
 * epoch before searching, which is why the object lands in the middle.
 */
export const PRESETS: readonly Preset[] = [
  {
    id: "epsindi",
    name: "Epsilon Indi",
    sub: "brown dwarf pair orbits here",
    ra: 330.8402,
    dec: -56.786,
    pmra: 3966.7,
    pmdec: -2536.2,
    lens: "motion",
  },
  {
    id: "rdra",
    name: "R Draconis",
    sub: "Mira variable, 1.6\u00d7 swing",
    ra: 248.1675,
    dec: 66.755,
    pmra: -20.6,
    pmdec: 6.1,
    lens: "variability",
  },
  {
    id: "rwaur",
    name: "RW Aurigae",
    sub: "young variable, 1.5\u00d7 swing",
    ra: 76.9561,
    dec: 30.4013,
    pmra: 2.6,
    pmdec: -27.4,
    lens: "variability",
  },
  {
    id: "barnard",
    name: "Barnard's Star",
    sub: "10.3\u2033/yr proper motion",
    ra: 269.4521,
    dec: 4.6934,
    pmra: -801.6,
    pmdec: 10362.4,
    lens: "motion",
  },
  {
    id: "wise0855",
    name: "WISE 0855",
    sub: "fast, very faint brown dwarf",
    ra: 133.79513,
    dec: -7.24515,
    pmra: 0,
    pmdec: 0,
    lens: "motion",
  },
];

export const DEFAULT_TARGET = PRESETS[0];

/** Midpoint of the seasons DR1 + QR3 cover, used as the display epoch. */
export const DISPLAY_EPOCH = 2026.0;
