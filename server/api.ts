/**
 * Transport-agnostic API surface shared by the Vite dev middleware (and any
 * production adapter). Pure fetch + typed arrays, so it can run unchanged on a
 * Node server or an edge worker.
 */

import { COLLECTIONS, groupEpochs, searchObservations, type ReleaseKey } from "./spherex.ts";
import {
  aperturePhotometry,
  centralCoverage,
  correlate,
  decodeFrame,
  epochLabel,
  fetchCutout,
  NOMINAL_PIXEL_DEG,
  oddAtMost,
  shiftImage,
  toNorthUp,
  type RawFrame,
} from "./frames.ts";

export interface ApiResult {
  status: number;
  body: unknown;
}

const MAX_EPOCHS = 10;
const MIN_COVERAGE = 0.9;
const CONCURRENCY = 3;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 60;

const cache = new Map<string, { at: number; body: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Disk-backed cache. IRSA returns 502/503 under load and this process does not
 * survive a restart, so a payload that was successfully built once is written to
 * .cache/ and served from there afterwards. A judging session should never fail
 * because the archive is having a bad minute.
 */
const CACHE_DIR = ".cache";

async function readDiskCache(key: string): Promise<unknown | null> {
  try {
    const fs = await import("node:fs/promises");
    const crypto = await import("node:crypto");
    const name = crypto.createHash("sha1").update(key).digest("hex").slice(0, 20);
    const raw = await fs.readFile(`${CACHE_DIR}/${name}.json`, "utf8");
    const parsed = JSON.parse(raw) as { at: number; body: unknown };
    if (Date.now() - parsed.at > CACHE_TTL_MS * 4) return null;
    return parsed.body;
  } catch {
    return null;
  }
}

async function writeDiskCache(key: string, body: unknown): Promise<void> {
  try {
    const fs = await import("node:fs/promises");
    const crypto = await import("node:crypto");
    const name = crypto.createHash("sha1").update(key).digest("hex").slice(0, 20);
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(`${CACHE_DIR}/${name}.json`, JSON.stringify({ at: Date.now(), body }));
  } catch {
    /* non-Node runtime, or read-only filesystem: memory cache only */
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

function round(v: number, sig = 6): number {
  if (!Number.isFinite(v)) return 0;
  if (v === 0) return 0;
  return Number(v.toPrecision(sig));
}

function parseNumber(raw: string | null, fallback: number): number {
  if (raw === null || raw.trim() === "") return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

interface DatasetRequest {
  ra: number;
  dec: number;
  fovDeg: number;
  detector: number;
  releases: ReleaseKey[];
}

function parseDatasetQuery(params: URLSearchParams): DatasetRequest {
  const ra = parseNumber(params.get("ra"), 133.7951);
  const dec = parseNumber(params.get("dec"), -7.2451);
  const fovDeg = Math.min(0.6, Math.max(0.03, parseNumber(params.get("fov"), 0.1)));
  const detector = Math.min(6, Math.max(1, Math.round(parseNumber(params.get("det"), 3))));
  const releaseRaw = (params.get("release") ?? "dr1").toLowerCase();
  const releases: ReleaseKey[] =
    releaseRaw === "both" ? ["dr1", "qr3"] : releaseRaw === "qr3" ? ["qr3"] : ["dr1"];
  return {
    ra: Math.max(0, Math.min(360, ra)),
    dec: Math.max(-89.9, Math.min(89.9, dec)),
    fovDeg,
    detector,
    releases,
  };
}

function subsample<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const out = [items[0]];
  const step = (items.length - 1) / (n - 1);
  for (let i = 1; i < n - 1; i++) out.push(items[Math.round(i * step)]);
  out.push(items[items.length - 1]);
  return out;
}

async function buildDataset(req: DatasetRequest) {
  const radiusDeg = Math.max(0.02, Math.min(0.25, req.fovDeg * 0.6));
  const observations = await searchObservations(req.ra, req.dec, radiusDeg, req.releases);
  const groups = groupEpochs(observations, req.detector);
  const notes: string[] = [];

  const empty = (message: string) => ({
    query: req,
    shape: 0,
    epochs: [],
    frames: [],
    notes: [message],
  });

  if (!groups.length) {
    return empty(
      `No SPHEREx ${req.releases.map((r) => COLLECTIONS[r].label).join("/")} spectral images cover this position for detector ${req.detector}. Try another detector (1-6), a different release, or other coordinates.`,
    );
  }

  const targetOut = oddAtMost(req.fovDeg / NOMINAL_PIXEL_DEG, 129);
  const requestSize = Math.min(0.6, Math.max(0.05, req.fovDeg * 1.5));

  const raws = await mapLimit(groups, CONCURRENCY, async (group) => {
    try {
      const buf = await fetchCutout(group.pick.accessUrl, req.ra, req.dec, requestSize);
      return { group, frame: decodeFrame(buf) as RawFrame | null };
    } catch (err) {
      console.warn("[api] frame failed", group.pick.obsId, String(err));
      return { group, frame: null as RawFrame | null };
    }
  });

  let usable = raws.filter(
    (r): r is { group: (typeof groups)[number]; frame: RawFrame } => !!r.frame,
  );
  const downloadFailures = raws.length - usable.length;
  if (downloadFailures) {
    notes.push(`${downloadFailures} epoch(s) could not be downloaded and were skipped.`);
  }
  if (!usable.length) {
    return empty(
      "The archive listed epochs at this position but none could be downloaded — IRSA's cutout service is busy. Try again in a moment.",
    );
  }

  // Frames clipped at a detector edge cannot fill the display box; drop them.
  const tooSmall = usable.filter((r) => Math.min(r.frame.nx, r.frame.ny) - 2 < targetOut);
  if (tooSmall.length) {
    usable = usable.filter((r) => Math.min(r.frame.nx, r.frame.ny) - 2 >= targetOut);
    notes.push(
      `${tooSmall.length} epoch(s) skipped: the position sits at the edge of that detector and the cutout is clipped.`,
    );
  }
  if (!usable.length) {
    return empty("Every epoch at this position is clipped by a detector edge. Try a smaller field of view.");
  }

  const shape = Math.min(...usable.map((r) => oddAtMost(Math.min(r.frame.nx, r.frame.ny) - 2, targetOut + 2)));
  const rotated = usable.map((r) => toNorthUp(r.frame, shape));

  // Reject frames whose rotation leaves too many empty pixels.
  const coverage = rotated.map((a) => centralCoverage(a, shape));
  const keepIdx = coverage.map((c, i) => (c >= MIN_COVERAGE ? i : -1)).filter((i) => i >= 0);
  if (keepIdx.length < rotated.length) {
    notes.push(
      `${rotated.length - keepIdx.length} epoch(s) skipped: too little usable sky after re-orienting.`,
    );
  }
  if (keepIdx.length < 1) {
    return empty("No epoch has enough usable coverage at this position.");
  }

  const kept = keepIdx.map((i) => ({ group: usable[i].group, frame: usable[i].frame, img: rotated[i], coverage: coverage[i] }));
  const chosen = subsample(kept, MAX_EPOCHS);
  if (chosen.length < kept.length) {
    notes.push(`Showing ${chosen.length} of ${kept.length} epochs, evenly spaced to keep the time baseline.`);
  }

  // Anchor on the frame with the most usable sky, then align every other frame.
  let refIndex = 0;
  chosen.forEach((c, i) => {
    if (c.coverage > chosen[refIndex].coverage) refIndex = i;
  });
  const reference = chosen[refIndex].img;

  const measured = chosen.map((c, i) => {
    if (i === refIndex) return { i, dx: 0, dy: 0, peak: 1 };
    const cc = correlate(reference, c.img, shape, 4);
    return { i, dx: cc.dx, dy: cc.dy, peak: cc.peak };
  });

  // A frame that will not correlate against the reference is either contaminated
  // or pointed somewhere else; shifting it by a wrong offset would corrupt the
  // whole sequence, so it is dropped rather than shown.
  const MIN_PEAK = 0.15;
  const registered = measured.filter((m) => m.peak >= MIN_PEAK);
  if (registered.length < measured.length) {
    notes.push(
      `${measured.length - registered.length} epoch(s) could not be registered to the reference frame and were skipped.`,
    );
  }
  if (!registered.some((m) => m.i === refIndex)) {
    return empty("Epochs at this position could not be registered to a common grid.");
  }

  const finalChosen = registered.map((m) => chosen[m.i]);
  const shifts = registered.map((m) => ({ dx: m.dx, dy: m.dy, peak: m.peak }));
  const aligned = registered.map((m) =>
    // `correlate` returns the offset of the frame relative to the reference, so
    // it is removed with the opposite sign.
    m.i === refIndex ? chosen[m.i].img : shiftImage(chosen[m.i].img, shape, -m.dx, -m.dy),
  );
  const finalRefIndex = registered.findIndex((m) => m.i === refIndex);

  // One global stretch keeps brightness changes visible while blinking.
  const sample: number[] = [];
  for (const frame of aligned) {
    for (let i = 0; i < frame.length; i += 3) {
      const v = frame[i];
      if (Number.isFinite(v)) sample.push(v);
    }
  }
  sample.sort((a, b) => a - b);
  const q = (p: number) =>
    sample[Math.min(sample.length - 1, Math.max(0, Math.floor(sample.length * p)))] ?? 0;
  const stretch = { lo: q(0.02), hi: q(0.995), median: q(0.5) };

  const pixelScaleDeg = finalChosen[0].frame.pixelScaleDeg;
  const centerIdx = Math.floor(shape / 2) * shape + Math.floor(shape / 2);

  const epochs = finalChosen.map((c, i) => {
    const phot = aperturePhotometry(aligned[i], undefined, undefined, shape);
    const f = c.frame;
    const flagRaw = f.flags ? Math.round(f.flags[centerIdx] ?? 0) : 0;
    const date = Number.isFinite(f.mjd)
      ? new Date((f.mjd - 40587) * 86400 * 1000).toISOString().slice(0, 10)
      : "";
    return {
      period: c.group.period,
      periods: c.group.periods,
      label: epochLabel(c.group.period),
      obsId: c.group.pick.obsId,
      collection: c.group.pick.collection,
      visits: c.group.observations.length,
      mjd: round(f.mjd, 9),
      date,
      exptime: round(f.exptime, 6),
      coverage: round(c.coverage, 3),
      shift: { dx: round(shifts[i].dx, 3), dy: round(shifts[i].dy, 3) },
      corrPeak: round(shifts[i].peak, 3),
      flux: round(phot.flux, 6),
      fluxErr: round(phot.fluxErr, 6),
      background: round(phot.background, 6),
      fluxRel: 0,
      fluxRelErr: 0,
      flagsAtCenter: `0x${(flagRaw >>> 0).toString(16).toUpperCase()}`,
    };
  });

  const fluxValues = epochs.map((e) => e.flux).filter((f) => Number.isFinite(f) && f !== 0);
  fluxValues.sort((a, b) => a - b);
  const medianFlux = fluxValues.length ? fluxValues[Math.floor(fluxValues.length / 2)] : 0;
  for (const e of epochs) {
    e.fluxRel = medianFlux !== 0 ? round(e.flux / medianFlux, 5) : 0;
    e.fluxRelErr = medianFlux !== 0 ? round(Math.abs(e.fluxErr / medianFlux), 5) : 0;
  }

  const pickObs = finalChosen[0].group.pick;

  return {
    query: { ...req, fovDeg: round(req.fovDeg, 4) },
    shape,
    frames: aligned.map((f) => f.map((v) => round(v, 6))),
    epochs,
    stretch: {
      lo: round(stretch.lo, 7),
      hi: round(stretch.hi, 7),
      median: round(stretch.median, 7),
    },
    pixelScaleArcsec: round(pixelScaleDeg * 3600, 2),
    fieldArcmin: round(((shape - 1) * pixelScaleDeg * 60), 3),
    wavelengthUm: [round(pickObs.emMin * 1e6, 4), round(pickObs.emMax * 1e6, 4)] as [number, number],
    unit: finalChosen[0].frame.unit || "MJy/sr",
    referenceIndex: finalRefIndex,
    spanDays: round(epochs[epochs.length - 1].mjd - epochs[0].mjd, 3),
    notes,
  };
}

export async function handleApi(pathname: string, params: URLSearchParams): Promise<ApiResult> {
  try {
    if (pathname === "/api/dataset") {
      const req = parseDatasetQuery(params);
      const key = JSON.stringify(req);
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        return { status: 200, body: { ...(hit.body as object), cached: true } };
      }
      const onDisk = await readDiskCache(key);
      if (onDisk && (onDisk as { epochs?: unknown[] }).epochs !== undefined) {
        cache.set(key, { at: Date.now(), body: onDisk });
        return { status: 200, body: { ...(onDisk as object), cached: true } };
      }

      let pending = inflight.get(key);
      if (!pending) {
        pending = buildDataset(req).finally(() => inflight.delete(key));
        inflight.set(key, pending);
      }
      const body = await pending;
      if ((body as { epochs?: unknown[] }).epochs !== undefined) {
        await writeDiskCache(key, body);
      }
      cache.set(key, { at: Date.now(), body });
      if (cache.size > CACHE_MAX) {
        const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (oldest) cache.delete(oldest[0]);
      }
      return { status: 200, body };
    }

    if (pathname === "/api/presets") {
      return { status: 200, body: { presets: PRESETS } };
    }

    if (pathname === "/api/health") {
      return { status: 200, body: { ok: true, cached: cache.size } };
    }

    return { status: 404, body: { error: "unknown endpoint" } };
  } catch (err) {
    console.error("[api] error", err);
    return { status: 502, body: { error: String((err as Error)?.message ?? err) } };
  }
}

/** The five targets named in the challenge. */
export const PRESETS = [
  {
    id: "wise0855",
    name: "WISE 0855",
    sub: "fast brown dwarf",
    ra: 133.7951,
    dec: -7.2451,
    lens: "motion",
  },
  {
    id: "barnard",
    name: "Barnard's Star",
    sub: "10.3\u2033/yr proper motion",
    ra: 269.454,
    dec: 4.6934,
    lens: "motion",
  },
  {
    id: "epsindib",
    name: "Epsilon Indi B",
    sub: "brown dwarf pair",
    ra: 330.843,
    dec: -56.786,
    lens: "motion",
  },
  {
    id: "rwaur",
    name: "RW Aurigae",
    sub: "young variable star",
    ra: 73.937,
    dec: 30.466,
    lens: "variability",
  },
  {
    id: "rdra",
    name: "R Draconis",
    sub: "Mira-type variable",
    ra: 251.929,
    dec: 66.08,
    lens: "variability",
  },
] as const;
