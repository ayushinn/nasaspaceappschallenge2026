import type { Dataset } from "../types";

interface Props {
  data: Dataset;
  frameIndex: number;
  onSelect: (i: number) => void;
}

export function LightCurve({ data, frameIndex, onSelect }: Props) {
  const W = 340;
  const H = 128;
  const padL = 34;
  const padR = 10;
  const padT = 12;
  const padB = 22;

  const epochs = data.epochs;
  const values = epochs.map((e) => (Number.isFinite(e.fluxRel) ? e.fluxRel : 0));
  const errs = epochs.map((e) => (Number.isFinite(e.fluxRelErr) ? e.fluxRelErr : 0));

  // Axis range comes from the measured values; error bars are clipped to it so a
  // noisy epoch cannot squash the whole curve into a line.
  const yMin = Math.min(0, ...values);
  const yMax = Math.max(1.15, ...values);
  const pad = (yMax - yMin) * 0.12 || 0.2;
  const lo = yMin - pad;
  const hi = yMax + pad;
  const ySpan = hi - lo || 1;
  const clamp = (v: number) => Math.min(hi, Math.max(lo, v));

  const x = (i: number) =>
    padL + (epochs.length === 1 ? (W - padL - padR) / 2 : (i / (epochs.length - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - (v - lo) / ySpan) * (H - padT - padB);

  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const isFlat = values.every((v) => Math.abs(v - 1) < 0.25);
  const detected = values.some((v) => Math.abs(v) > 0.05);

  if (!detected) {
    return (
      <section className="panel side-panel">
        <header className="side-panel__head">
          <h2>Light curve</h2>
          <span className="side-panel__meta">aperture at target</span>
        </header>
        <p className="side-panel__note side-panel__note--loud">
          No compact source stands above the background at this position in any epoch. Either the
          source is fainter than a 113-second SPHEREx frame, or it is bright enough to saturate and
          its core is masked in the Level-2 products. The images and the difference view are still
          valid — this panel simply has nothing to measure.
        </p>
      </section>
    );
  }

  return (
    <section className="panel side-panel">
      <header className="side-panel__head">
        <h2>Light curve</h2>
        <span className="side-panel__meta">aperture at target</span>
      </header>
      <svg className="lightcurve" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Relative flux per epoch">
        <line x1={padL} y1={y(1)} x2={W - padR} y2={y(1)} className="lc-median" />
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} className="lc-axis" />
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} className="lc-axis" />
        <text x={4} y={padT + 4} className="lc-label">
          {hi.toFixed(1)}×
        </text>
        <text x={4} y={H - padB} className="lc-label">
          {lo.toFixed(1)}×
        </text>
        {epochs.length > 1 && <path d={path} className="lc-line" />}
        {epochs.map((e, i) => (
          <g key={`${e.obsId}-pt`} onClick={() => onSelect(i)} className="lc-point-group">
            <circle cx={x(i)} cy={y(values[i])} r={10} className="lc-hit" />
            <line
              x1={x(i)}
              y1={y(clamp(values[i] - errs[i]))}
              x2={x(i)}
              y2={y(clamp(values[i] + errs[i]))}
              className="lc-err"
            />
            <circle
              cx={x(i)}
              cy={y(values[i])}
              r={i === frameIndex ? 4.6 : 3}
              className={`lc-dot ${i === frameIndex ? "is-active" : ""}`}
            />
            <text x={x(i)} y={H - 8} className="lc-label lc-label--x" textAnchor="middle">
              {e.period.slice(2)}
            </text>
          </g>
        ))}
      </svg>
      <p className="side-panel__note">
        {isFlat
          ? "Flux is flat within the errors: nothing at these coordinates is varying strongly between epochs."
          : "Error bars come from the local background scatter. A steady decline usually means the source is drifting out of the fixed aperture."}
      </p>
    </section>
  );
}
