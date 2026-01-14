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
          <a className="heatmap-topbar__link" href="http://localhost:3002/api/data" target="_blank" rel="noreferrer">
            Open API
          </a>
          <button
            type="button"
            className="heatmap-topbar__button"
            onClick={() => setFrameKey((k) => k + 1)}
          >
            Refresh
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
