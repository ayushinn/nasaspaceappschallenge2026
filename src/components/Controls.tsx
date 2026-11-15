import type { Preset } from "../types";

export const DETECTORS = [
  { id: 1, label: "D1", lo: 0.75, hi: 1.11 },
  { id: 2, label: "D2", lo: 1.10, hi: 1.65 },
  { id: 3, label: "D3", lo: 1.63, hi: 2.42 },
  { id: 4, label: "D4", lo: 2.42, hi: 3.82 },
  { id: 5, label: "D5", lo: 3.81, hi: 4.42 },
  { id: 6, label: "D6", lo: 4.41, hi: 5.00 },
];

export const FIELDS = [
  { value: 0.05, label: "3\u2032" },
  { value: 0.1, label: "6\u2032" },
  { value: 0.2, label: "12\u2032" },
  { value: 0.3, label: "18\u2032" },
];

interface Props {
  presets: readonly Preset[];
  activePreset: string | null;
  onPreset: (p: Preset) => void;
  raText: string;
  decText: string;
  onRaText: (v: string) => void;
  onDecText: (v: string) => void;
  onSubmitCoords: () => void;
  fov: number;
  onFov: (v: number) => void;
  detector: number;
  onDetector: (v: number) => void;
  release: "dr1" | "qr3" | "both";
  onRelease: (v: "dr1" | "qr3" | "both") => void;
  loading: boolean;
  raResolved: number;
  decResolved: number;
  echoNote?: string;
}

export function Controls({
  presets,
  activePreset,
  onPreset,
  raText,
  decText,
  onRaText,
  onDecText,
  onSubmitCoords,
  fov,
  onFov,
  detector,
  onDetector,
  release,
  onRelease,
  loading,
  raResolved,
  decResolved,
  echoNote,
}: Props) {
  return (
    <aside className="panel controls">
      <section className="control-group">
        <h2 className="control-title">
          Test targets <span className="control-hint">from the challenge</span>
        </h2>
        <div className="preset-list">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`preset ${activePreset === p.id ? "is-active" : ""}`}
              onClick={() => onPreset(p)}
              disabled={loading}
            >
              <span className="preset__dot" data-lens={p.lens} />
              <span className="preset__text">
                <strong>{p.name}</strong>
                <em>{p.sub}</em>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="control-group">
        <h2 className="control-title">
          Sky position <span className="control-hint">decimal or sexagesimal</span>
        </h2>
        <div className="coord-row">
          <label>
            <span>RA</span>
            <input
              value={raText}
              onChange={(e) => onRaText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmitCoords()}
              spellCheck={false}
              placeholder="133.7951"
              inputMode="decimal"
            />
          </label>
          <label>
            <span>Dec</span>
            <input
              value={decText}
              onChange={(e) => onDecText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmitCoords()}
              spellCheck={false}
              placeholder="-7.2451"
              inputMode="decimal"
            />
          </label>
        </div>
        <button type="button" className="btn btn--primary" onClick={onSubmitCoords} disabled={loading}>
          {loading ? "Loading\u2026" : "Load this patch"}
        </button>
        <p className="coord-echo">
          {`resolving to ${raResolved.toFixed(4)}\u00b0, ${decResolved.toFixed(4)}\u00b0`}
        </p>
        {echoNote && <p className="coord-echo coord-echo--accent">{echoNote}</p>}
      </section>

      <section className="control-group">
        <h2 className="control-title">
          Field of view <span className="control-hint">larger tracks faster sources</span>
        </h2>
        <div className="segmented">
          {FIELDS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={fov === f.value ? "is-active" : ""}
              onClick={() => onFov(f.value)}
              disabled={loading}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <section className="control-group">
        <h2 className="control-title">
          Detector <span className="control-hint">17 channels each</span>
        </h2>
        <div className="segmented segmented--six">
          {DETECTORS.map((d) => (
            <button
              key={d.id}
              type="button"
              className={detector === d.id ? "is-active" : ""}
              onClick={() => onDetector(d.id)}
              disabled={loading}
              title={`${d.lo}\u2013${d.hi} \u00b5m`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p className="coord-echo">
          {(() => {
            const d = DETECTORS.find((x) => x.id === detector)!;
            return `${d.lo.toFixed(2)}\u2013${d.hi.toFixed(2)} \u00b5m \u00b7 17 channels`;
          })()}
        </p>
      </section>

      <section className="control-group">
        <h2 className="control-title">
          Release <span className="control-hint">data vintage</span>
        </h2>
        <div className="segmented segmented--three">
          {(
            [
              ["dr1", "DR1"],
              ["both", "DR1+QR3"],
              ["qr3", "QR3"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={release === value ? "is-active" : ""}
              onClick={() => onRelease(value)}
              disabled={loading}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}
