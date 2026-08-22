import { useState } from 'react';
import { TIME_SPEEDS, DEFAULT_TIME_SPEED } from '../constants/planets.const';
import { BodyIcon } from './planet-icons';
import './nav-panel.scss';

/**
 * The mark that says "this one you can also stand on, not just look at".
 *
 * Every other row here is a camera target — this is the one place that switches the
 * app into a different mode entirely, and nothing about "Moon" sitting in a list next
 * to "ISS" and "Analemma" says so. Permanent, not a one-time callout: the distinction
 * ("landable" vs. "observe only") is a standing fact about this row, the same way the
 * live dot beside "Solar system simulator" is a standing fact rather than an
 * announcement — so, like that dot, this has no dismissal and no animation, just a
 * steady glow.
 *
 * A flag rather than an abstract icon, because the thing it points at has a real one:
 * `moon-surface/artefacts.ts` plants the actual Apollo 11 flag at Tranquility Base,
 * lying flat where the ascent engine knocked it over.
 *
 * `aria-label` rather than `aria-hidden`: this sits inside the Moon's own button, so
 * it extends that button's accessible name — a screen reader gets "Moon, click Land
 * to walk the surface" instead of an unexplained icon.
 *
 * The hover card is a `data-tooltip` + CSS `::after`, not the native `title`
 * attribute: `title` renders as the browser's own unstyled tooltip on its own ~1s
 * delay, which would fight this chrome's instrument-panel look.
 */
function LandFlag() {
  const message = 'Click Land to walk the surface';
  return (
    <span className="nav-flag" role="img" aria-label={message} data-tooltip={message}>
      <svg viewBox="0 0 12 12" width="12" height="12" focusable="false">
        <path d="M3 1.2v9.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <path d="M3.75 1.7h6.1v4.05h-6.1z" fill="currentColor" />
      </svg>
    </span>
  );
}

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
    satellites: [],
  },
  {
    id: 'venus',
    label: 'Venus',
    satellites: [],
    toggle: { label: 'Clouds', toggleId: 'toggle-venus-clouds' },
  },
  {
    id: 'earth',
    label: 'Earth',
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
    satellites: [
      { id: 'phobos', label: 'Phobos' },
      { id: 'deimos', label: 'Deimos' },
    ],
  },
  // The only entry whose satellites are worth flying to in their own right: all four
  // are larger than Pluto and Ganymede is larger than Mercury, which is four rows up.
  // Listed inward-out, the order Galileo numbered them in and the order they are
  // locked in — Io twice round for Europa's one, Europa twice for Ganymede's.
  {
    id: 'jupiter',
    label: 'Jupiter',
    satellites: [
      { id: 'io', label: 'Io' },
      { id: 'europa', label: 'Europa' },
      { id: 'ganymede', label: 'Ganymede' },
      { id: 'callisto', label: 'Callisto' },
    ],
  },
  // The longest dropdown here, and the only planet whose list carries both kinds of row
  // at once: seven moons to fly to, and — under Titan — the one toggle in the outer
  // system, which is Venus's cloud row again for the only other body whose surface is
  // hidden by its own atmosphere. Listed inward-out like Jupiter's, which is also
  // discovery order for five of the seven: Huygens found Titan in 1655, Cassini the four
  // between 1671 and 1684, and Herschel the two innermost in a single fortnight of 1789.
  {
    id: 'saturn',
    label: 'Saturn',
    satellites: [
      { id: 'mimas', label: 'Mimas' },
      { id: 'enceladus', label: 'Enceladus' },
      { id: 'tethys', label: 'Tethys' },
      { id: 'dione', label: 'Dione' },
      { id: 'rhea', label: 'Rhea' },
      { id: 'titan', label: 'Titan' },
      { id: 'iapetus', label: 'Iapetus' },
    ],
    // Venus's cloud row again, and it has to be the *planet*-level toggle rather than
    // one hanging off Titan's row: a bare "Hide" sitting beside a button labelled Titan
    // reads as hiding Titan. This one gets to say what it takes off.
    toggle: { label: 'Titan haze', toggleId: 'toggle-titan-haze' },
  },
];

// Matches the breakpoint the modal and surface HUD already use elsewhere in the
// chrome. Below it the panel stops being a docked pane and becomes a drawer: it
// starts closed so the 3D scene — the actual point of the app — is what a phone
// visitor sees first, not 288px of instrument panel covering most of a ~375px screen.
const MOBILE_QUERY = '(max-width: 768px)';

export function NavPanel() {
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [activeSpeed, setActiveSpeed] = useState<number>(DEFAULT_TIME_SPEED);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isCollapsed, setIsCollapsed] = useState(() => window.matchMedia(MOBILE_QUERY).matches);

  // Delegated rather than wired onto every `data-target` button individually — this
  // is the drawer's "select and it gets out of the way" behaviour, and it only makes
  // sense on the mobile layout where opening the panel is a deliberate act that hid
  // the scene to begin with. On desktop the panel is docked, not a drawer, so picking
  // a target there must not fight the user's own collapse/expand choice. `closest`
  // from the click target means this only fires for the fly-to buttons themselves —
  // the expand chevrons and the Land/Show/Hide toggles beside them carry no
  // `data-target` and are left alone, since those are meant to be used in sequence.
  const handleObjectListClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!(event.target as HTMLElement).closest('[data-target]')) return;
    if (window.matchMedia(MOBILE_QUERY).matches) setIsCollapsed(true);
  };

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
    <>
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
      <div className="nav-panel-content">
        <header className="nav-header">
          <div>
            <h1 className="nav-title">Planetary</h1>
            <p className="nav-subtitle"><span aria-hidden="true" />Solar system simulator</p>
            {/* script.ts owns this value — same pattern as the flight and surface
                HUDs, and the same reason: it is written every frame from
                `getSimulatedDate()`, the one clock every position in the scene is a
                pure function of, so React re-rendering it would fight the render
                loop for no benefit. The em dash is a neutral placeholder rather
                than a guessed date, gone within one frame of initScene running. */}
            <div className="nav-clock">
              <span className="nav-clock__label">Simulated</span>
              <span className="nav-clock__value" id="nav-clock-value">—</span>
            </div>
          </div>
        </header>
        <div className="nav-section nav-section--objects">
          <h2 className="nav-section-title">Objects</h2>
          <div className="nav-object-list" onClick={handleObjectListClick}>
            <button
              className={`nav-btn nav-object-btn ${activeTarget === 'sun' ? 'active' : ''}`}
              data-target="sun"
              onClick={() => setActiveTarget('sun')}
            >
              <span className="nav-object-symbol"><BodyIcon id="sun" /></span>
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
                      <span className="nav-object-symbol"><BodyIcon id={planet.id} /></span>
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
                            <span className="nav-object-symbol nav-object-symbol--small"><BodyIcon id={satellite.id} /></span>
                            <span>{satellite.label}</span>
                            {/* Inline rather than a corner badge on the Land button
                                beside it: `.nav-satellites__inner` clips to
                                `overflow: hidden` for the accordion animation, so
                                anything hung off that button's outer edge would get
                                its corner cut. */}
                            {satellite.id === 'moon' && <LandFlag />}
                          </button>
                          {/* Two rows carry one of these, and they are the two things
                              under Earth that aren't simply a body to fly to: the
                              analemma is a permanent overlay worth switching off, and
                              the Moon's surface is a mode rather than a place in the
                              scene. See `Toggle` for why script.ts owns both labels. */}
                          {satellite.toggle && (
                            <button
                              type="button"
                              className={`nav-btn nav-btn--compact nav-visibility-btn ${satellite.toggle.startsOff ? 'nav-visibility-btn--off' : ''
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
                  <span className="nav-object-symbol"><BodyIcon id="system" /></span>
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
                    <span className="nav-btn nav-btn--satellite nav-btn--static">
                      <span className="nav-object-symbol nav-object-symbol--small">
                        <BodyIcon id="orbits" />
                      </span>
                      <span>Orbits</span>
                    </span>
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
      </div>
    </nav>
    {/* A tap-outside-to-close convenience, visible only at the mobile breakpoint (see
        nav-panel.scss) — on desktop the panel is a docked pane, not a drawer, so this
        stays inert and invisible there. Not a `<button>`: the toggle chevron already
        gives keyboard/screen-reader users a real control for the same action. */}
    <div
      className={`nav-panel-scrim ${!isCollapsed ? 'nav-panel-scrim--visible' : ''}`}
      onClick={() => setIsCollapsed(true)}
      aria-hidden="true"
    />
    </>
  );
}
