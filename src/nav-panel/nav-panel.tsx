import { useState } from 'react';
import { TIME_SPEEDS, DEFAULT_TIME_SPEED } from '../constants/planets.const';
import './nav-panel.scss';

interface Satellite {
  id: string;
  label: string;
}

interface Planet {
  id: string;
  label: string;
  satellites: Satellite[];
}

const PLANETS: Planet[] = [
  {
    id: 'earth',
    label: 'Earth',
    satellites: [
      { id: 'moon', label: 'Moon' },
      { id: 'iss', label: 'ISS' },
    ],
  },
  {
    id: 'mars',
    label: 'Mars',
    satellites: [
      { id: 'phobos', label: 'Phobos' },
      { id: 'deimos', label: 'Deimos' },
    ],
  },
];

export function NavPanel() {
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [activeSpeed, setActiveSpeed] = useState<number>(DEFAULT_TIME_SPEED);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // The actual behaviour is wired up in script.ts, which listens on the data-*
  // attributes and ids below. These handlers only drive the button styling.
  return (
    <nav className="navigation-panel">
        <h1 className="nav-title">Planetary</h1>
        <div className="nav-section">
            <h2 className="nav-section-title">Objects</h2>
            <button
              className={`nav-btn ${activeTarget === 'sun' ? 'active' : ''}`}
              data-target="sun"
              onClick={() => setActiveTarget('sun')}
            >
              Sun
            </button>
            {PLANETS.map((planet) => {
              const isExpanded = expanded.has(planet.id);
              return (
                <div className="nav-planet" key={planet.id}>
                  <div className="nav-planet-row">
                    <button
                      className={`nav-btn nav-planet-btn ${activeTarget === planet.id ? 'active' : ''}`}
                      data-target={planet.id}
                      onClick={() => setActiveTarget(planet.id)}
                    >
                      {planet.label}
                    </button>
                    <button
                      type="button"
                      className={`nav-expand-btn ${isExpanded ? 'nav-expand-btn--open' : ''}`}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Hide' : 'Show'} ${planet.label}'s moons`}
                      onClick={() => toggleExpanded(planet.id)}
                    >
                      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
                        <path
                          d="M2 4l4 4 4-4"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                  {/* Always mounted — never conditionally rendered on `isExpanded`.
                      script.ts collects every `.nav-btn[data-target]` once when the
                      scene initialises; a satellite button that doesn't exist yet
                      while collapsed would never pick up its click handler. Showing
                      and hiding it is CSS-only. */}
                  <div className={`nav-satellites ${isExpanded ? 'nav-satellites--open' : ''}`}>
                    <div className="nav-satellites__inner">
                      {planet.satellites.map((satellite) => (
                        <button
                          key={satellite.id}
                          className={`nav-btn nav-btn--satellite ${activeTarget === satellite.id ? 'active' : ''}`}
                          data-target={satellite.id}
                          onClick={() => setActiveTarget(satellite.id)}
                        >
                          {satellite.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
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
            {/* Free flight is also bound to F and left with Esc, so script.ts owns
                this button's label and active state outright rather than mirroring
                it into React state that the keyboard could desync. */}
            <button className="nav-btn" id="toggle-free-flight">
              Free flight
            </button>
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
