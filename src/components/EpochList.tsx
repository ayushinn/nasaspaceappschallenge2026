import type { Dataset } from "../types";

interface Props {
  data: Dataset;
  frameIndex: number;
  onSelect: (i: number) => void;
}

export function EpochList({ data, frameIndex, onSelect }: Props) {
  const max = Math.max(...data.epochs.map((e) => Math.abs(e.fluxRel)), 0.001);
  return (
    <section className="panel side-panel">
      <header className="side-panel__head">
        <h2>Epochs</h2>
        <span className="side-panel__meta">
          {data.epochs.length} frame{data.epochs.length === 1 ? "" : "s"} ·{" "}
          {data.spanDays > 0 ? `${Math.round(data.spanDays)} d baseline` : "single visit"}
        </span>
      </header>
      <ul className="epoch-list">
        {data.epochs.map((e, i) => (
          <li key={`${e.obsId}-${e.period}`}>
            <button
              type="button"
              className={`epoch ${i === frameIndex ? "is-active" : ""}`}
              onClick={() => onSelect(i)}
            >
              <span className="epoch__idx">{String(i + 1).padStart(2, "0")}</span>
              <span className="epoch__main">
                <strong>
                  <i
                    className={`reg ${
                      e.corrPeak >= 0.5 ? "reg--good" : e.corrPeak >= 0.25 ? "reg--fair" : "reg--weak"
                    }`}
                    title={`registration against reference: r = ${e.corrPeak.toFixed(2)}`}
                  />
                  {e.label}
                </strong>
                <em>
                  {e.date} · {e.visits} visit{e.visits === 1 ? "" : "s"}
                </em>
              </span>
              <span className="epoch__flux" title="relative aperture flux">
                <span
                  className={`epoch__bar ${e.fluxRel < 0 ? "is-negative" : ""}`}
                  style={{ width: `${Math.min(100, (Math.abs(e.fluxRel) / max) * 100)}%` }}
                />
                <b>{e.fluxRel.toFixed(2)}×</b>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="side-panel__note">
        Relative flux in a 2.2-pixel aperture at the requested position, background subtracted.
      </p>
    </section>
  );
}
