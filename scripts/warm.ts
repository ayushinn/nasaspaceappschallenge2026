/** Pre-fetch the five challenge targets so the demo never waits on the archive. */
import { PRESETS, DISPLAY_EPOCH } from "../src/lib/presets.ts";
import { propagate } from "../src/lib/format.ts";

const base = process.env.BASE ?? "http://127.0.0.1:3000";
for (const p of PRESETS) {
  const pos = propagate(p.ra, p.dec, p.pmra, p.pmdec, 2000, DISPLAY_EPOCH);
  const url = `${base}/api/dataset?ra=${pos.ra}&dec=${pos.dec}&fov=0.1&det=3&release=both`;
  const t0 = Date.now();
  const res = await fetch(url);
  const body: any = await res.json();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (!body.epochs) {
    console.log(`${p.name.padEnd(16)} ${secs}s  EMPTY: ${JSON.stringify(body.notes)}`);
    continue;
  }
  const rel = body.epochs.map((e: any) => e.fluxRel.toFixed(2)).join(" ");
  console.log(
    `${p.name.padEnd(16)} ${secs}s epochs=${body.epochs.length} span=${Math.round(body.spanDays)}d rel=[${rel}] ${body.notes.length ? "notes=" + body.notes.length : ""}`,
  );
}
