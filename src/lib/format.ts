/** Propagate a J2000 position with proper motion (mas/yr) to another epoch. */
export function propagate(
  ra: number,
  dec: number,
  pmra: number,
  pmdec: number,
  fromEpoch: number,
  toEpoch: number,
): { ra: number; dec: number } {
  const dt = toEpoch - fromEpoch;
  if (!pmra && !pmdec) return { ra, dec };
  const decRad = (dec * Math.PI) / 180;
  const cosDec = Math.max(0.01, Math.cos(decRad));
  const dRa = (pmra * dt) / 3_600_000 / cosDec;
  const dDec = (pmdec * dt) / 3_600_000;
  return { ra: ((ra + dRa) % 360 + 360) % 360, dec: Math.max(-90, Math.min(90, dec + dDec)) };
}

export function formatRa(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  const hours = d / 15;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  const s = ((hours - h) * 60 - m) * 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${s.toFixed(1)}s`;
}

export function formatDec(deg: number): string {
  const sign = deg < 0 ? "\u2212" : "+";
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = ((abs - d) * 60 - m) * 60;
  return `${sign}${String(d).padStart(2, "0")}\u00b0 ${String(m).padStart(2, "0")} \u2032 ${s.toFixed(0)} \u2033`;
}

/** Accepts decimal degrees or sexagesimal (e.g. 17 57 48.5 or 17h57m48.5s). */
export function parseRaInput(input: string, fallback: number): number {
  const cleaned = input.trim().replace(/h|m|s/gi, " ").replace(/[:]/g, " ");
  const parts = cleaned.split(/\s+/).filter(Boolean).map(Number);
  if (!parts.length || parts.some((p) => !Number.isFinite(p))) return fallback;
  if (parts.length === 1) return ((parts[0] % 360) + 360) % 360;
  const [h, m = 0, s = 0] = parts;
  return (((h + m / 60 + s / 3600) * 15) % 360 + 360) % 360;
}

export function parseDecInput(input: string, fallback: number): number {
  const sign = /^\s*-/.test(input) ? -1 : 1;
  const cleaned = input
    .trim()
    .replace(/[d°'"]/gi, " ")
    .replace(/[:]/g, " ")
    .replace(/[+-]/g, " ");
  const parts = cleaned.split(/\s+/).filter(Boolean).map(Number);
  if (!parts.length || parts.some((p) => !Number.isFinite(p))) return fallback;
  if (parts.length === 1) return Math.max(-90, Math.min(90, sign * Math.abs(parts[0])));
  const [d, m = 0, s = 0] = parts;
  return Math.max(-90, Math.min(90, sign * (Math.abs(d) + m / 60 + s / 3600)));
}

export function formatFlux(value: number): string {
  if (!Number.isFinite(value)) return "\u2014";
  const abs = Math.abs(value);
  if (abs === 0) return "0";
  if (abs < 0.001 || abs >= 10000) return value.toExponential(2);
  return value.toFixed(abs < 10 ? 3 : 1);
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}
