/**
 * SPHEREx archive layer: IVOA SIA2 search against IRSA plus epoch grouping.
 *
 * SIA2 is the only service that hands back a direct path to the spectral-image
 * MEF, which is what the cutout service needs. Its CSV response is wide and
 * contains a few unquoted commas in the trailing metadata columns, so we parse
 * strictly the leading columns we use and validate the access URL shape rather
 * than trusting column count.
 */

export const SIA_ENDPOINT = "https://irsa.ipac.caltech.edu/SIA";

export const COLLECTIONS = {
  dr1: { id: "spherex_dr1", label: "DR1", blurb: "Year-1 reprocessing, 102-channel all-sky cube" },
  qr3: { id: "spherex_qr3", label: "QR3", blurb: "Latest weekly release" },
} as const;

export type ReleaseKey = keyof typeof COLLECTIONS;

export interface Observation {
  obsId: string;
  detector: number;
  bandName: string;
  emMin: number;
  emMax: number;
  accessUrl: string;
  collection: ReleaseKey;
  /** Planning period encoded in the obs_id, e.g. 2025W19 */
  period: string;
}

const FIELD = {
  ra: 0,
  dec: 1,
  bandName: 7,
  obsId: 9,
  emMin: 11,
  emMax: 12,
  accessUrl: 15,
  collection: 20,
} as const;

export function detectorOf(bandName: string): number {
  const m = /D(\d)/.exec(bandName);
  return m ? Number(m[1]) : 0;
}

export function parseSiaCsv(text: string): Observation[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const out: Observation[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const parts = line.split(",");
    if (parts.length < 21) continue;
    const accessUrl = parts[FIELD.accessUrl];
    if (!accessUrl.startsWith("https://irsa.ipac.caltech.edu/")) continue;
    const obsId = parts[FIELD.obsId];
    if (!obsId) continue;
    const collectionRaw = parts[FIELD.collection];
    const collection: ReleaseKey = collectionRaw.includes("qr3") ? "qr3" : "dr1";
    const emMin = Number(parts[FIELD.emMin]);
    const emMax = Number(parts[FIELD.emMax]);
    if (!Number.isFinite(emMin) || !Number.isFinite(emMax)) continue;
    out.push({
      obsId,
      detector: detectorOf(parts[FIELD.bandName]),
      bandName: parts[FIELD.bandName],
      emMin,
      emMax,
      accessUrl,
      collection,
      period: obsId.split("_")[0],
    });
  }
  return out;
}

async function siaQuery(
  collection: string,
  ra: number,
  dec: number,
  radiusDeg: number,
  signal?: AbortSignal,
): Promise<Observation[]> {
  const url =
    `${SIA_ENDPOINT}?COLLECTION=${collection}` +
    `&POS=${encodeURIComponent(`circle ${ra} ${dec} ${radiusDeg}`)}` +
    `&RESPONSEFORMAT=CSV`;
  const res = await fetch(url, { signal, headers: { "user-agent": "spherex-blink/1.0 (hackathon demo)" } });
  if (!res.ok) {
    throw new Error(
      `The IRSA archive did not answer the ${collection} image search (HTTP ${res.status}). ` +
        `That is upstream, not your query — try again in a moment.`,
    );
  }
  return parseSiaCsv(await res.text());
}

export async function searchObservations(
  ra: number,
  dec: number,
  radiusDeg: number,
  releases: ReleaseKey[],
): Promise<Observation[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const batches = await Promise.all(
      releases.map((r) => siaQuery(COLLECTIONS[r].id, ra, dec, radiusDeg, controller.signal)),
    );
    return batches.flat();
  } finally {
    clearTimeout(timer);
  }
}

export interface EpochGroup {
  period: string;
  periods: string[];
  collection: ReleaseKey;
  observations: Observation[];
  /** Chosen representative observation actually downloaded. */
  pick: Observation;
  mjd: number;
}

/** MJD of the Monday of an ISO week, decoded from a planning period like 2025W19. */
export function periodToMjd(period: string): number {
  const m = /^(\d{4})W(\d{2})$/.exec(period);
  if (!m) return NaN;
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = Date.UTC(year, 0, 4);
  const jan4Dow = new Date(jan4).getUTCDay() || 7;
  const mondayW1 = jan4 - (jan4Dow - 1) * 86_400_000;
  const days = (mondayW1 + (week - 1) * 7 * 86_400_000) / 86_400_000;
  return days - 40587;
}

/** Epochs closer together than this are treated as one look at the sky. */
const CLUSTER_DAYS = 32;

/**
 * Epochs are clustered in time, not by planning period: the spacecraft revisits
 * a field on consecutive weeks, which would otherwise flood the blink sequence
 * with near-duplicate frames while hiding the year-long baseline that makes
 * motion measurable.
 */
export function groupEpochs(observations: Observation[], detector: number): EpochGroup[] {
  const filtered = observations
    .filter((o) => o.detector === detector)
    .map((o) => ({ o, mjd: periodToMjd(o.period) }))
    .filter((x) => Number.isFinite(x.mjd))
    .sort((a, b) => a.mjd - b.mjd);
  if (!filtered.length) return [];

  const clusters: { items: { o: Observation; mjd: number }[]; mjd: number }[] = [];
  for (const item of filtered) {
    const last = clusters[clusters.length - 1];
    if (last && item.mjd - last.mjd <= CLUSTER_DAYS) {
      last.items.push(item);
    } else {
      clusters.push({ items: [item], mjd: item.mjd });
    }
  }

  return clusters.map((cluster) => {
    const obs = cluster.items.map((x) => x.o).sort((a, b) => a.obsId.localeCompare(b.obsId));
    const mid = obs[Math.floor(obs.length / 2)];
    return {
      period: mid.period,
      periods: [...new Set(obs.map((o) => o.period))],
      collection: mid.collection,
      observations: obs,
      pick: mid,
      mjd: cluster.mjd,
    };
  });
}
