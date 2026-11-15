import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset, ViewMode } from "../types";
import { rampLut, type RampName } from "../lib/colormap";

interface Props {
  data: Dataset;
  frameIndex: number;
  mode: ViewMode;
  gain: number;
  ramp: RampName;
  backgroundMatched: boolean;
  smooth: boolean;
  showTarget: boolean;
}

export function Viewer({
  data,
  frameIndex,
  mode,
  gain,
  ramp,
  backgroundMatched,
  smooth,
  showTarget,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const [sizeTick, setSizeTick] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => setSizeTick((t) => t + 1));
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  /** Global scale for difference images so the colour range does not jump. */
  const diffScale = useMemo(() => {
    const ref = data.frames[data.referenceIndex] ?? data.frames[0];
    const magnitudes: number[] = [];
    for (const frame of data.frames) {
      for (let i = 0; i < frame.length; i += 2) {
        const d = frame[i] - ref[i];
        if (Number.isFinite(d)) magnitudes.push(Math.abs(d));
      }
    }
    if (!magnitudes.length) return 1;
    magnitudes.sort((a, b) => a - b);
    return magnitudes[Math.floor(magnitudes.length * 0.999)] || 1;
  }, [data]);

  const stacked = useMemo(() => {
    const n = data.shape;
    const out = new Float32Array(n * n);
    for (const frame of data.frames) {
      for (let i = 0; i < frame.length; i++) {
        const v = frame[i];
        if (Number.isFinite(v)) out[i] += v;
      }
    }
    for (let i = 0; i < out.length; i++) out[i] /= Math.max(1, data.frames.length);
    return out;
  }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssSize = canvas.clientWidth || 560;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cssSize * dpr)) {
      canvas.width = Math.round(cssSize * dpr);
      canvas.height = Math.round(cssSize * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const n = data.shape;
    if (!n) return;
    // Difference images need a diverging ramp so zero maps to the middle.
    const lut = rampLut(mode === "difference" ? "diverge" : ramp);
    const pixels = new ImageData(n, n);
    const shift = backgroundMatched ? (data.epochs[frameIndex]?.background ?? 0) : 0;
    const refShift = backgroundMatched
      ? (data.epochs[data.referenceIndex]?.background ?? 0)
      : 0;

    let lo: number;
    let hi: number;
    if (mode === "difference") {
      const scale = diffScale / Math.max(0.15, gain);
      lo = -scale;
      hi = scale;
    } else {
      lo = data.stretch.lo;
      hi = data.stretch.lo + (data.stretch.hi - data.stretch.lo) / Math.max(0.2, gain);
    }
    const span = hi - lo || 1;

    const frame =
      mode === "stack" ? stacked : (data.frames[frameIndex] ?? data.frames[0]);
    const reference = data.frames[data.referenceIndex] ?? data.frames[0];

    let values: Float32Array;
    if (mode === "difference") {
      values = new Float32Array(n * n);
      const finite: number[] = [];
      for (let i = 0; i < n * n; i++) {
        const a = frame[i];
        const b = reference[i];
        if (!Number.isFinite(a) || !Number.isFinite(b)) {
          values[i] = NaN;
          continue;
        }
        const diff = (a - shift) - (b - refShift);
        values[i] = diff;
        finite.push(diff);
      }
      // Remove the residual pedestal between the two epochs so zero really is
      // zero; otherwise a zodiacal background change tints the whole frame.
      finite.sort((x, y) => x - y);
      const pedestal = finite.length ? finite[Math.floor(finite.length / 2)] : 0;
      if (pedestal) for (let i = 0; i < values.length; i++) values[i] -= pedestal;
    } else {
      values = new Float32Array(n * n);
      for (let i = 0; i < n * n; i++) {
        const v = frame[i];
        values[i] = Number.isFinite(v) && backgroundMatched ? v - shift : v;
      }
    }

    for (let i = 0; i < n * n; i++) {
      const v = values[i];
      if (!Number.isFinite(v)) {
        pixels.data[i * 4 + 3] = 255;
        continue;
      }
      let t = (v - lo) / span;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      // asinh compresses the bright peaks so faint sources stay visible; linear is
      // kept for difference images where zero must map to the middle of the ramp.
      if (mode !== "difference") t = Math.asinh(t * 6) / Math.asinh(6);
      const idx = Math.round(t * 255) * 3;
      pixels.data[i * 4] = lut[idx];
      pixels.data[i * 4 + 1] = lut[idx + 1];
      pixels.data[i * 4 + 2] = lut[idx + 2];
      pixels.data[i * 4 + 3] = 255;
    }

    let off = offRef.current;
    if (!off) {
      off = document.createElement("canvas");
      offRef.current = off;
    }
    if (off.width !== n || off.height !== n) {
      off.width = n;
      off.height = n;
    }
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    offCtx.putImageData(pixels, 0, 0);

    ctx.imageSmoothingEnabled = smooth;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }, [data, frameIndex, mode, gain, ramp, backgroundMatched, smooth, diffScale, stacked, sizeTick]);

  const epoch = data.epochs[frameIndex];
  const pxPerArcmin = 60 / data.pixelScaleArcsec;
  const barPx = Math.min(data.shape, Math.max(6, Math.round(pxPerArcmin)));
  const barFraction = barPx / data.shape;

  return (
    <div className={`viewer ${mode === "stack" ? "viewer--still" : ""}`}>
      <canvas ref={canvasRef} className="viewer__canvas" aria-label="SPHEREx epoch image" />

      <div className="viewer__hud viewer__hud--tl">
        <div className="hud-epoch">{mode === "stack" ? "MEAN STACK" : epoch?.label ?? "\u2014"}</div>
        <div className="hud-sub">
          {mode === "stack"
            ? `${data.epochs.length} epochs averaged`
            : epoch
              ? `${epoch.date} \u00b7 ${epoch.visits} visit${epoch.visits === 1 ? "" : "s"}`
              : ""}
        </div>
      </div>

      <div className="viewer__hud viewer__hud--tr">
        {mode === "stack" ? (
          <span className="hud-counter">{"\u2014"}</span>
        ) : (
          <span className="hud-counter">
            {frameIndex + 1}
            <em>/{data.epochs.length}</em>
          </span>
        )}
      </div>

      <div className="viewer__hud viewer__hud--bl">
        <div className="scalebar" style={{ width: `${barFraction * 100}%` }}>
          <span>{"1\u2032"}</span>
        </div>
      </div>

      <div className="viewer__hud viewer__hud--br">
        {mode === "difference" ? "epoch \u2212 reference \u00b7 sink \u2190 0 \u2192 source" : data.wavelengthUm[0].toFixed(2) + "\u2013" + data.wavelengthUm[1].toFixed(2) + " \u00b5m"}
      </div>

      {showTarget && (
        <div className="viewer__target" title={"Requested coordinates \u2014 centre of the cutout"}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="7" />
            <line x1="50" y1="34" x2="50" y2="44" />
            <line x1="50" y1="56" x2="50" y2="66" />
            <line x1="34" y1="50" x2="44" y2="50" />
            <line x1="56" y1="50" x2="66" y2="50" />
          </svg>
        </div>
      )}
    </div>
  );
}
