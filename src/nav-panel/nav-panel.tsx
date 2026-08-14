import { useState } from 'react';
import { TIME_SPEEDS, DEFAULT_TIME_SPEED } from '../constants/planets.const';
import './nav-panel.scss';

/**
 * A button sitting beside a row that switches something rather than flying to it.
 * `script.ts` owns the label and the state outright — same reasoning as free flight's
 * button: several paths (this button, a keyboard shortcut, a click in the scene) all
 * have to be able to drive it, and none of them should have to fight React state to
 * do it. Everything here does is put it on the page with the right initial label, so
 * there is no flash of the wrong one before `initScene`'s deferred effect runs.
 */
interface Toggle {
  toggleId: string;
  initialLabel: string;
  /** Renders dimmed, matching the "currently off" state script.ts starts it in. */
  startsOff?: boolean;
}

interface Satellite {
  id: string;
  label: string;
  toggle?: Toggle;
}

interface Planet {
  id: string;
  label: string;
  symbol: string;
  satellites: Satellite[];
  /**
   * A row in the dropdown that toggles something rather than flying to it. Venus has
   * no moons, so its dropdown would otherwise be empty — what belongs in there is the
   * cloud deck, which is the only thing on any of these planets you can take off.
   * `toggleId` is looked up by script.ts, which owns the button's label and state
   * outright, the same way it owns the analemma's and the orbits'.
   */
  toggle?: { label: string; toggleId: string };
}

const PLANETS: Planet[] = [
  // The one entry with nothing to expand: Mercury has no moons, no cloud deck and no
  // atmosphere, so it gets a plain full-width button and no chevron.
  {
    id: 'mercury',
    label: 'Mercury',
    symbol: '☿',
    satellites: [],
  },
  {
    id: 'venus',
    label: 'Venus',
    symbol: '♀',
    satellites: [],
    toggle: { label: 'Clouds', toggleId: 'toggle-venus-clouds' },
  },
  {
    id: 'earth',
    label: 'Earth',
    symbol: '●',
    satellites: [
      // The only row here that switches the app into a different mode rather than
      // pointing the camera somewhere. Its label reads Land / Leave, not Show / Hide,
      // because there is nowhere in the solar-system scene that "the lunar surface"
      // could be — at true scale an astronaut's eye is 2.7e-7 of a scene unit off the
      // ground, so it gets its own scene, in metres.
      { id: 'moon', label: 'Moon', toggle: { toggleId: 'toggle-moon-surface', initialLabel: 'Land', startsOff: true } },
      { id: 'iss', label: 'ISS' },
      { id: 'analemma', label: 'Analemma', toggle: { toggleId: 'toggle-analemma', initialLabel: 'Show', startsOff: true } },
    ],
  },
  {
    id: 'mars',
    label: 'Mars',
    symbol: '♂',
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
  const [isCollapsed, setIsCollapsed] = useState(false);

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
    <nav className={`navigation-panel ${isCollapsed ? 'navigation-panel--collapsed' : ''}`}>
        <button
          type="button"
          className="nav-panel-toggle"
          aria-label={isCollapsed ? 'Show navigation panel' : 'Hide navigation panel'}
          aria-expanded={!isCollapsed}
          onClick={() => setIsCollapsed((collapsed) => !collapsed)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m14.5 5-7 7 7 7" />
          </svg>
        </button>
        <header className="nav-header">
          <div>
            <h1 className="nav-title">Planetary</h1>
            <p className="nav-subtitle"><span aria-hidden="true" />Solar system simulator</p>
          </div>
        </header>
        <div className="nav-section nav-section--objects">
            <h2 className="nav-section-title">Objects</h2>
            <div className="nav-object-list">
            <button
              className={`nav-btn nav-object-btn ${activeTarget === 'sun' ? 'active' : ''}`}
              data-target="sun"
              onClick={() => setActiveTarget('sun')}
            >
              <span className="nav-object-symbol nav-object-symbol--sun" aria-hidden="true">☀</span>
              <span>Sun</span>
            </button>
            {PLANETS.map((planet) => {
              const isExpanded = expanded.has(planet.id);
              // Nothing to reveal means no chevron — an expander that opens an empty
              // drawer is worse than no expander. `.nav-planet-btn` is `flex: 1`, so
              // the button simply takes the whole row and still lines up.
              const isExpandable = planet.satellites.length > 0 || planet.toggle !== undefined;
              return (
                <div className="nav-planet" key={planet.id}>
                  <div className="nav-planet-row">
                    <button
                      className={`nav-btn nav-planet-btn nav-object-btn ${activeTarget === planet.id ? 'active' : ''}`}
                      data-target={planet.id}
                      onClick={() => setActiveTarget(planet.id)}
                    >
                      <span className={`nav-object-symbol nav-object-symbol--${planet.id}`} aria-hidden="true">{planet.symbol}</span>
                      <span>{planet.label}</span>
                    </button>
                    {isExpandable && (
                      <button
                        type="button"
                        className={`nav-expand-btn ${isExpanded ? 'nav-expand-btn--open' : ''}`}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? 'Hide' : 'Show'} more of ${planet.label}`}
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
                    )}
                  </div>
                  {/* Always mounted — never conditionally rendered on `isExpanded`.
                      script.ts collects every `.nav-btn[data-target]` once when the
                      scene initialises; a satellite button that doesn't exist yet
                      while collapsed would never pick up its click handler. Showing
                      and hiding it is CSS-only. */}
                  <div className={`nav-satellites ${isExpanded ? 'nav-satellites--open' : ''}`}>
                    <div className="nav-satellites__inner">
                      {planet.satellites.map((satellite) => (
                        <div className="nav-satellite-row" key={satellite.id}>
                          <button
                            className={`nav-btn nav-btn--satellite ${activeTarget === satellite.id ? 'active' : ''}`}
                            data-target={satellite.id}
                            onClick={() => setActiveTarget(satellite.id)}
                          >
                            {satellite.label}
                          </button>
                          {/* Two rows carry one of these, and they are the two things
                              under Earth that aren't simply a body to fly to: the
                              analemma is a permanent overlay worth switching off, and
                              the Moon's surface is a mode rather than a place in the
                              scene. See `Toggle` for why script.ts owns both labels. */}
                          {satellite.toggle && (
                            <button
                              type="button"
                              className={`nav-btn nav-btn--compact nav-visibility-btn ${
                                satellite.toggle.startsOff ? 'nav-visibility-btn--off' : ''
                              }`}
                              id={satellite.toggle.toggleId}
                            >
                              {satellite.toggle.initialLabel}
                            </button>
                          )}
                        </div>
                      ))}
                      {planet.toggle && (
                        <div className="nav-satellite-row">
                          {/* Not a `data-target` button: there is nothing to fly to.
                              The row labels the toggle beside it, so it carries no
                              click handler and no active state — same as the Orbits
                              row under Solar system. */}
                          <span className="nav-btn nav-btn--satellite nav-btn--static">
                            {planet.toggle.label}
                          </span>
                          {/* Starts on, matching script.ts's own default, so there is
                              no flash of the wrong label before initScene runs. This
                              is the one toggle here that begins visible: the clouds
                              are what Venus looks like. */}
                          <button
                            type="button"
                            className="nav-btn nav-btn--compact nav-visibility-btn"
                            id={planet.toggle.toggleId}
                          >
                            Hide
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="nav-planet">
              <div className="nav-planet-row">
                <button
                  className={`nav-btn nav-planet-btn nav-object-btn ${activeTarget === 'system' ? 'active' : ''}`}
                  data-target="system"
                  onClick={() => setActiveTarget('system')}
                >
                  <span className="nav-object-symbol nav-object-symbol--system" aria-hidden="true">◎</span>
                  <span>Solar system</span>
                </button>
                <button
                  type="button"
                  className={`nav-expand-btn ${expanded.has('system') ? 'nav-expand-btn--open' : ''}`}
                  aria-expanded={expanded.has('system')}
                  aria-label={`${expanded.has('system') ? 'Hide' : 'Show'} solar system options`}
                  onClick={() => toggleExpanded('system')}
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
              {/* Same always-mounted rule as the satellite lists above: script.ts looks
                  this button up by id once, at scene init, so it has to exist even
                  while the dropdown is collapsed. */}
              <div className={`nav-satellites ${expanded.has('system') ? 'nav-satellites--open' : ''}`}>
                <div className="nav-satellites__inner">
                  <div className="nav-satellite-row">
                    {/* Not a `data-target` button: there is nothing to fly to here.
                        The row is a label for the toggle beside it, which is why it
                        carries no click handler and no active state. */}
                    <span className="nav-btn nav-btn--satellite nav-btn--static">Orbits</span>
                    {/* Mirrors script.ts's own default (hidden) so there's no flash of
                        "Hide" before initScene runs and corrects it. */}
                    <button
                      type="button"
                      className="nav-btn nav-btn--compact nav-visibility-btn nav-visibility-btn--off"
                      id="toggle-orbits"
                    >
                      Show
                    </button>
                  </div>
                </div>
              </div>
            </div>
            </div>
        </div>
        <div className="nav-section">
            <h2 className="nav-section-title">Simulation</h2>
            <div className="nav-speeds" role="group" aria-label="Simulation speed">
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
              className="nav-btn nav-action-btn"
              id="toggle-rotation"
              onClick={() => setPaused(!paused)}
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
        </div>
        <div className="nav-section nav-section--utilities">
            <h2 className="nav-section-title">Controls</h2>
            {/* Free flight is also bound to F and left with Esc, so script.ts owns
                this button's label and active state outright rather than mirroring
                it into React state that the keyboard could desync. */}
            <button className="nav-btn nav-action-btn" id="toggle-free-flight">
              <span className="nav-action-icon" aria-hidden="true">⌁</span>Free flight
            </button>
            <button
              className="nav-btn nav-action-btn nav-action-btn--secondary"
              id="reset-camera"
              onClick={() => setActiveTarget(null)}
            >
              <span className="nav-action-icon" aria-hidden="true">↺</span>Reset camera
            </button>
        </div>
        <div className="nav-section nav-section--data">
            <h2 className="nav-section-title">Data layers</h2>
            <a
              className="nav-btn nav-action-btn nav-action-btn--secondary"
              href="/heatmap.html"
            >
              <span className="nav-action-icon" aria-hidden="true">▦</span>Surface heat map
            </a>
        </div>
    </nav>
  );
}
