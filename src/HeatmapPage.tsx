import { useMemo, useState } from 'react';

export function HeatmapPage() {
  const [frameKey, setFrameKey] = useState(0);

  const heatmapUrl = useMemo(() => {
    return import.meta.env.DEV ? 'http://localhost:3001' : '/heatmap/';
  }, []);

  return (
    <div className="heatmap-page">
      <header className="heatmap-topbar">
        <div className="heatmap-topbar__left">
          <a className="heatmap-topbar__link" href="/">← Back to Planetary</a>
          <span className="heatmap-topbar__title">Heat map</span>
        </div>
        <div className="heatmap-topbar__right">
          {/* Three controls that look identical at rest but do three different
              things — navigate away, leave the app entirely for a raw endpoint,
              or act in place — is exactly the kind of gap a plain toolbar hides.
              The icons carry that distinction rather than the label wording alone. */}
          <a className="heatmap-topbar__link" href="http://localhost:3002/api/data" target="_blank" rel="noreferrer">
            <span className="heatmap-topbar__icon" aria-hidden="true">↗</span>Open API
          </a>
          <button
            type="button"
            className="heatmap-topbar__button"
            onClick={() => setFrameKey((k) => k + 1)}
          >
            <span className="heatmap-topbar__icon" aria-hidden="true">⟳</span>Refresh
          </button>
        </div>
      </header>
      <iframe
        key={frameKey}
        title="HeatmapApp"
        src={heatmapUrl}
        className="heatmap-frame"
      />
    </div>
  );
}
