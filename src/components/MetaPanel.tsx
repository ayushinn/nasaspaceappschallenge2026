import type { Dataset } from "../types";
import { formatDec, formatFlux, formatRa } from "../lib/format";

interface Props {
  data: Dataset;
}

export function MetaPanel({ data }: Props) {
  const releases = [...new Set(data.epochs.map((e) => e.collection))].join(" + ");
  const maxShift = Math.max(...data.epochs.map((e) => Math.hypot(e.shift.dx, e.shift.dy)));
  const worstPeak = Math.min(...data.epochs.map((e) => e.corrPeak));
  const ref = data.epochs[data.referenceIndex] ?? data.epochs[0];

  const rows: [string, string][] = [
    ["Position", `${formatRa(data.query.ra)}  ${formatDec(data.query.dec)}`],
    ["Field", `${data.fieldArcmin.toFixed(1)}\u2032 at ${data.pixelScaleArcsec.toFixed(1)}\u2033/pixel`],
    ["Detector band", `${data.wavelengthUm[0].toFixed(2)}\u2013${data.wavelengthUm[1].toFixed(2)} \u00b5m`],
    ["Units", data.unit],
    ["Release", releases || "\u2014"],
    ["Reference epoch", ref ? `${ref.label} (${ref.date})` : "\u2014"],
    ["Baseline", data.spanDays > 0 ? `${Math.round(data.spanDays)} days` : "single epoch"],
    ["Re-registration", `\u2264 ${maxShift.toFixed(2)} px, corr \u2265 ${worstPeak.toFixed(2)}`],
    ["Flags at target", ref?.flagsAtCenter ?? "\u2014"],
    ["Median flux", `${formatFlux(data.epochs.map((e) => e.flux).sort((a, b) => a - b)[Math.floor(data.epochs.length / 2)] ?? 0)}`],
  ];

  return (
    <section className="panel side-panel">
      <header className="side-panel__head">
        <h2>Observation metadata</h2>
        <span className="side-panel__meta">{data.cached ? "cached" : "live from IRSA"}</span>
      </header>
      <dl className="meta-grid">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {data.notes.length > 0 && (
        <ul className="notice-list">
          {data.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
