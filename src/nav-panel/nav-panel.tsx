import { useState } from 'react';
import { TIME_SPEEDS, DEFAULT_TIME_SPEED } from '../constants/planets.const';
import './nav-panel.scss';

export function NavPanel() {
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [activeSpeed, setActiveSpeed] = useState<number>(DEFAULT_TIME_SPEED);
  const [paused, setPaused] = useState(false);

  // The actual behaviour is wired up in script.ts, which listens on the data-*
  // attributes and ids below. These handlers only drive the button styling.
  const objects = [
    { id: 'sun', label: 'Sun' },
    { id: 'earth', label: 'Earth' },
    { id: 'moon', label: 'Moon' },
    { id: 'iss', label: 'ISS' },
    { id: 'mars', label: 'Mars' },
  ];

  return (
    <nav className="navigation-panel">
        <h1 className="nav-title">Planetary</h1>
        <div className="nav-section">
            <h2 className="nav-section-title">Objects</h2>
            {objects.map(({ id, label }) => (
              <button
                key={id}
                className={`nav-btn ${activeTarget === id ? 'active' : ''}`}
                data-target={id}
                onClick={() => setActiveTarget(id)}
              >
                {label}
              </button>
            ))}
            <button
              className={`nav-btn ${activeTarget === 'system' ? 'active' : ''}`}
              data-target="system"
              onClick={() => setActiveTarget('system')}
            >
              Solar system
            </button>
        </div>
        <div className="nav-section">
            <h2 className="nav-section-title">Time</h2>
            <div className="nav-speeds">
              {TIME_SPEEDS.map(({ label, secondsPerSecond }) => (
                <button
                  key={label}
                  className={`nav-btn nav-btn--compact ${activeSpeed === secondsPerSecond ? 'active' : ''}`}
                  data-speed={secondsPerSecond}
                  onClick={() => setActiveSpeed(secondsPerSecond)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="nav-btn"
              id="toggle-rotation"
              onClick={() => setPaused(!paused)}
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
        </div>
        <div className="nav-section">
            <h2 className="nav-section-title">Controls</h2>
            <button
              className="nav-btn"
              id="reset-camera"
              onClick={() => setActiveTarget(null)}
            >
              Reset Camera
            </button>
        </div>
        <div className="nav-section">
            <h2 className="nav-section-title">Surface data</h2>
            <a
              className="nav-btn"
              href="/heatmap.html"
            >
              Heat map
            </a>
        </div>
    </nav>
  );
}
