/** Dev harness: exercise the API layer from the command line. */
import { handleApi } from "../server/api.ts";

const argv = process.argv.slice(2);
const path = argv[0] ?? "/api/dataset";
const qs = argv[1] ?? "ra=133.7951&dec=-7.2451&fov=0.1&det=3&release=dr1";

const t0 = Date.now();
const res = await handleApi(path, new URLSearchParams(qs));
console.log(`status=${res.status} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`);
const b = res.body as any;

if (!b.epochs) {
  console.log(JSON.stringify(b).slice(0, 800));
  process.exit(0);
}

console.log(
  `shape=${b.shape} field=${b.fieldArcmin}' px=${b.pixelScaleArcsec}" unit=${b.unit} lambda=${b.wavelengthUm}`,
);
console.log(`span=${b.observedSpanDays}d stretch=`, b.stretch, "notes=", b.notes);
console.table(
  b.epochs.map((e: any) => ({
    period: e.period,
    date: e.date,
    visits: e.visits,
    dx: e.shift.dx,
    dy: e.shift.dy,
    fluxRel: e.fluxRel,
    flg: e.flaggedFraction,
  })),
);

const n: number = b.shape;
if (n && process.env.ASCII !== "0") {
  const f: number[] = b.frames[0];
  const lo = b.stretch.lo;
  const hi = b.stretch.hi;
  const ramp = " .:-=+*#%@";
  let art = "";
  for (let j = 0; j < n; j++) {
    let line = "";
    for (let i = 0; i < n; i++) {
      const t = (f[j * n + i] - lo) / (hi - lo || 1);
      line += ramp[Math.max(0, Math.min(9, Math.floor(t * 10)))];
    }
    art += line + "\n";
  }
  console.log(art);
}
