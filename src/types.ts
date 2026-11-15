export interface Epoch {
  period: string;
  periods: string[];
  label: string;
  obsId: string;
  collection: string;
  visits: number;
  mjd: number;
  date: string;
  exptime: number;
  coverage: number;
  shift: { dx: number; dy: number };
  corrPeak: number;
  flux: number;
  fluxErr: number;
  background: number;
  fluxRel: number;
  fluxRelErr: number;
  flagsAtCenter: string;
}

export interface Dataset {
  query: { ra: number; dec: number; fovDeg: number; detector: number; releases: string[] };
  shape: number;
  frames: number[][];
  epochs: Epoch[];
  stretch: { lo: number; hi: number; median: number };
  pixelScaleArcsec: number;
  fieldArcmin: number;
  wavelengthUm: [number, number];
  unit: string;
  referenceIndex: number;
  spanDays: number;
  notes: string[];
  cached?: boolean;
}

export interface Preset {
  id: string;
  name: string;
  sub: string;
  ra: number;
  dec: number;
  /** Gaia DR3 proper motion, mas/yr. Zero when unknown. */
  pmra: number;
  pmdec: number;
  lens: string;
}

export type ViewMode = "blink" | "difference" | "stack";
