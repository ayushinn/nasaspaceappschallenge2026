import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controls } from "./components/Controls";
import { Viewer } from "./components/Viewer";
import { EpochList } from "./components/EpochList";
import { LightCurve } from "./components/LightCurve";
import { MetaPanel } from "./components/MetaPanel";
import { PRESETS, DEFAULT_TARGET, DISPLAY_EPOCH } from "./lib/presets";
import { formatDec, formatRa, parseDecInput, parseRaInput, propagate } from "./lib/format";
import type { RampName } from "./lib/colormap";
import type { Dataset, Preset, ViewMode } from "./types";

type Release = "dr1" | "qr3" | "both";

/** Preset positions are J2000; spread them to the epoch the archive data covers. */
function presetPos(p: Preset) {
  return propagate(p.ra, p.dec, p.pmra, p.pmdec, 2000, DISPLAY_EPOCH);
}

const DEFAULT_POS = presetPos(DEFAULT_TARGET);

const MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: "blink", label: "Blink", hint: "raw epochs" },
  { id: "difference", label: "Difference", hint: "epoch \u2212 reference" },
  { id: "stack", label: "Mean stack", hint: "all epochs combined" },
];

function readUrl() {
  const q = new URLSearchParams(window.location.search);
  const num = (k: string, d: number) => {
    const v = Number(q.get(k));
    return Number.isFinite(v) && q.get(k) !== null && q.get(k) !== "" ? v : d;
  };
  const releaseRaw = q.get("release");
  const release: Release =
    releaseRaw === "dr1" || releaseRaw === "qr3" || releaseRaw === "both" ? releaseRaw : "both";
  const modeRaw = q.get("mode");
  const mode: ViewMode =
    modeRaw === "difference" || modeRaw === "stack" || modeRaw === "blink" ? modeRaw : "blink";
  return {
    ra: num("ra", DEFAULT_POS.ra),
    dec: num("dec", DEFAULT_POS.dec),
    fov: num("fov", 0.1),
    det: num("det", 3),
    release,
    mode,
  };
}

export default function App() {
  const url = useMemo(readUrl, []);

  const [ra, setRa] = useState(url.ra);
  const [dec, setDec] = useState(url.dec);
  const [raText, setRaText] = useState(url.ra.toFixed(4));
  const [decText, setDecText] = useState(url.dec.toFixed(4));
  const [fov, setFov] = useState(url.fov);
  const [detector, setDetector] = useState(url.det);
  const [release, setRelease] = useState<Release>(url.release);
  const [activePreset, setActivePreset] = useState<string | null>(() => {
    const hit = PRESETS.find((p) => {
      const pos = presetPos(p);
      return Math.abs(pos.ra - url.ra) < 0.02 && Math.abs(pos.dec - url.dec) < 0.02;
    });
    return hit?.id ?? null;
  });

  const [data, setData] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(2);
  const [mode, setMode] = useState<ViewMode>(url.mode);
  const [gain, setGain] = useState(1);
  const [ramp, setRamp] = useState<RampName>("inferno");
  const [backgroundMatched, setBackgroundMatched] = useState(true);
  const [smooth, setSmooth] = useState(true);
  const [showTarget, setShowTarget] = useState(true);

  const requestId = useRef(0);

  const load = useCallback(
    async (params: { ra: number; dec: number; fov: number; detector: number; release: Release }) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      const started = Date.now();
      const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 200);
      try {
        const qs = new URLSearchParams({
          ra: String(params.ra),
          dec: String(params.dec),
          fov: String(params.fov),
          det: String(params.detector),
          release: params.release,
        });
        const res = await fetch(`/api/dataset?${qs}`);
        const body = await res.json();
        if (id !== requestId.current) return;
        if (!res.ok) throw new Error(body?.error ?? `request failed (${res.status})`);
        setData(body as Dataset);
        setFrameIndex(0);
        setPlaying(false);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(String((err as Error)?.message ?? err));
        setData(null);
      } finally {
        clearInterval(timer);
        if (id === requestId.current) setLoading(false);
      }
    },
    [],
  );

  // Initial load and any change to the query definition.
  useEffect(() => {
    void load({ ra, dec, fov, detector, release });
  }, [ra, dec, fov, detector, release, load]);

  // Keep the address bar shareable.
  useEffect(() => {
    const qs = new URLSearchParams({
      ra: ra.toFixed(4),
      dec: dec.toFixed(4),
      fov: String(fov),
      det: String(detector),
      release,
      mode,
    });
    window.history.replaceState(null, "", `${window.location.pathname}?${qs}`);
  }, [ra, dec, fov, detector, release, mode]);

  const frames = data?.epochs.length ?? 0;

  // Playback loop.
  useEffect(() => {
    if (!playing || mode === "stack" || frames < 2) return;
    const interval = setInterval(() => {
      setFrameIndex((i) => (i + 1) % frames);
    }, 1000 / fps);
    return () => clearInterval(interval);
  }, [playing, fps, frames, mode]);

  // Keyboard transport.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setFrameIndex((i) => (frames ? (i + 1) % frames : 0));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFrameIndex((i) => (frames ? (i - 1 + frames) % frames : 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [frames]);

  const applyPreset = (p: Preset) => {
    const pos = presetPos(p);
    setActivePreset(p.id);
    setRa(pos.ra);
    setDec(pos.dec);
    setRaText(pos.ra.toFixed(4));
    setDecText(pos.dec.toFixed(4));
  };

  const submitCoords = () => {
    const typedRa = parseRaInput(raText, ra);
    const typedDec = parseDecInput(decText, dec);
    // Typing a preset's published (J2000) coordinates should still find it.
    const hit = PRESETS.find(
      (p) => Math.abs(p.ra - typedRa) < 0.2 && Math.abs(p.dec - typedDec) < 0.2,
    );
    const pos = hit ? presetPos(hit) : { ra: typedRa, dec: typedDec };
    setRa(pos.ra);
    setDec(pos.dec);
    setRaText(pos.ra.toFixed(4));
    setDecText(pos.dec.toFixed(4));
    setActivePreset(hit?.id ?? null);
  };

  const current = data?.epochs[frameIndex];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand__mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <h1>SPHEREx Blink</h1>
            <p>Multi-epoch near-infrared sky viewer · any patch, any time</p>
          </div>
        </div>
        <div className="topbar__meta">
          <span className="chip">NASA SPHEREx</span>
          <span className="chip chip--muted">DR1 · QR3</span>
          <a className="chip chip--link" href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noreferrer">
            IRSA archive ↗
          </a>
        </div>
      </header>

      <div className="layout">
        <Controls
          presets={PRESETS}
          activePreset={activePreset}
          onPreset={applyPreset}
          raText={raText}
          decText={decText}
          onRaText={setRaText}
          onDecText={setDecText}
          onSubmitCoords={submitCoords}
          fov={fov}
          onFov={setFov}
          detector={detector}
          onDetector={setDetector}
          release={release}
          onRelease={setRelease}
          loading={loading}
          raResolved={ra}
          decResolved={dec}
          echoNote={
            activePreset
              ? `J2000 \u2192 ${DISPLAY_EPOCH.toFixed(1)} via Gaia proper motion`
              : undefined
          }
        />

        <main className="stage">
          {error && (
            <div className="state state--error">
              <h2>Could not load this patch</h2>
              <p>{error}</p>
              <button className="btn" type="button" onClick={() => load({ ra, dec, fov, detector, release })}>
                Retry
              </button>
            </div>
          )}

          {!error && loading && (
            <div className="state state--loading">
              <div className="pulse" aria-hidden="true" />
              <h2>Querying IRSA and co-aligning epochs</h2>
              <p>
                Searching SIA2 for frames covering {formatRa(ra)} {formatDec(dec)}, then downloading
                and re-orienting each cutout. {elapsed.toFixed(1)} s
              </p>
            </div>
          )}

          {!error && !loading && data && data.shape === 0 && (
            <div className="state">
              <h2>No frames here</h2>
              <p>{data.notes[0] ?? "This position has no SPHEREx coverage in the selected release."}</p>
            </div>
          )}

          {!error && !loading && data && data.shape > 0 && (
            <>
              <Viewer
                data={data}
                frameIndex={frameIndex}
                mode={mode}
                gain={gain}
                ramp={ramp}
                backgroundMatched={backgroundMatched}
                smooth={smooth}
                showTarget={showTarget}
              />

              <div className="transport">
                <div className="transport__row">
                  <button
                    className="btn btn--icon"
                    type="button"
                    onClick={() => {
                      setPlaying(false);
                      setFrameIndex((i) => (i - 1 + frames) % frames);
                    }}
                    aria-label="Previous epoch"
                  >
                    ◀
                  </button>
                  <button
                    className="btn btn--play"
                    type="button"
                    onClick={() => setPlaying((p) => !p)}
                    disabled={mode === "stack" || frames < 2}
                  >
                    {playing ? "❙❙ Pause" : "▶ Play"}
                  </button>
                  <button
                    className="btn btn--icon"
                    type="button"
                    onClick={() => {
                      setPlaying(false);
                      setFrameIndex((i) => (i + 1) % frames);
                    }}
                    aria-label="Next epoch"
                  >
                    ▶
                  </button>

                  <input
                    className="scrub"
                    type="range"
                    min={0}
                    max={Math.max(0, frames - 1)}
                    step={1}
                    value={frameIndex}
                    onChange={(e) => {
                      setPlaying(false);
                      setFrameIndex(Number(e.target.value));
                    }}
                    aria-label="Epoch position"
                  />

                  <label className="select">
                    <span>fps</span>
                    <select value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                      {[1, 2, 4, 8].map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="transport__row transport__row--wrap">
                  <div className="segmented segmented--modes">
                    {MODES.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={mode === m.id ? "is-active" : ""}
                        onClick={() => {
                          setMode(m.id);
                          if (m.id === "stack") setPlaying(false);
                        }}
                        title={m.hint}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <label className="slider">
                    <span>contrast</span>
                    <input
                      type="range"
                      min={0.4}
                      max={5}
                      step={0.05}
                      value={gain}
                      onChange={(e) => setGain(Number(e.target.value))}
                    />
                  </label>

                  <div className="segmented segmented--tiny">
                    {(["inferno", "viridis", "gray"] as RampName[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={ramp === r ? "is-active" : ""}
                        onClick={() => setRamp(r)}
                        title={r}
                      >
                        {r === "inferno" ? "Iron" : r === "viridis" ? "Viridis" : "Grey"}
                      </button>
                    ))}
                  </div>

                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={backgroundMatched}
                      onChange={(e) => setBackgroundMatched(e.target.checked)}
                    />
                    <span>match background</span>
                  </label>
                  <label className="toggle">
                    <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} />
                    <span>smooth</span>
                  </label>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={showTarget}
                      onChange={(e) => setShowTarget(e.target.checked)}
                    />
                    <span>target marker</span>
                  </label>
                </div>
              </div>

              <p className="readout">
                {mode === "stack"
                  ? `${data.epochs.length} epochs averaged after north-up re-orientation and re-registration.`
                  : current
                    ? `${current.label} · ${current.date} · MJD ${current.mjd.toFixed(1)} · ${current.visits} visit${current.visits === 1 ? "" : "s"} in this epoch · ${current.collection.toUpperCase()}`
                    : ""}
              </p>
            </>
          )}
        </main>

        <div className="sidebar">
          {data && data.shape > 0 && !error && (
            <>
              <EpochList data={data} frameIndex={frameIndex} onSelect={setFrameIndex} />
              <LightCurve data={data} frameIndex={frameIndex} onSelect={setFrameIndex} />
              <MetaPanel data={data} />
            </>
          )}
        </div>
      </div>

      <footer className="footer">
        <p>
          <strong>Reading the frames:</strong> every cutout is resampled to north-up and registered to
          a common grid, so a moving source shows up as a point that jumps between frames — use{" "}
          <em>Difference</em> when the motion is a fraction of the 6.2″ pixel. Bright stars render as
          rings: SPHEREx saturates on them and the Level-2 products mask the core, so only the wings
          survive. Photometry uses a 2.2-pixel aperture to include those wings.
        </p>
        <p className="footer__credit">
          Data: NASA/JPL-Caltech SPHEREx spectral images, DR1 and QR3, from the NASA/IPAC Infrared
          Science Archive (IRSA) at Caltech. Built for the 2026 NASA Space Apps Challenge. Code and
          data pipeline were developed with AI assistance — see the repository README for the full
          disclosure.
        </p>
      </footer>
    </div>
  );
}
