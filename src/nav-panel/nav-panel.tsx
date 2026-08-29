import { useState } from 'react';
import { TIME_SPEEDS, DEFAULT_TIME_SPEED } from '../constants/planets.const';
import { BODIES, SHEET_GROUPS, hasSheet } from './bodies';
import { BodyIcon } from './planet-icons';
import { SystemSheet } from './system-sheet';
import './nav-panel.scss';

// Matches the breakpoint the modal and surface HUD already use elsewhere in the
// chrome. Below it the panel stops being a docked pane and becomes a drawer: it
// starts closed so the 3D scene — the actual point of the app — is what a phone
// visitor sees first, not 288px of instrument panel covering most of a ~375px screen.
const MOBILE_QUERY = '(max-width: 768px)';

/**
 * The control that opens a group's sheet.
 *
 * **It points right, not down**, and that is the only visible trace of the change from
 * an accordion to a dialog — a chevron pointing down promises the row will grow and
 * push the list apart, which is exactly what this no longer does. Right is the list
 * idiom for "there is another level, and it is somewhere else".
 *
 * It keeps `.nav-expand-btn`, `data-expand` and `--open`, none of which are cosmetic:
 * `moon-hint.scss` beacons Earth's while its card is up, `moon-hint.tsx` treats a click
 * on `[data-expand="earth"]` as progress rather than dismissal, and both are pointing
 * at this button whatever it opens. An attribute rather than an id because every group
 * has one of these, and the id would have to be invented per group for one selector.
 */
function SheetOpener({
  id,
  label,
  open,
  onOpen,
}: {
  id: string;
  label: string;
  open: boolean;
  onOpen(id: string): void;
}) {
  return (
    <button
      type="button"
      className={`nav-expand-btn ${open ? 'nav-expand-btn--open' : ''}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`Show more of ${label}`}
      data-expand={id}
      onClick={() => onOpen(id)}
    >
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
        <path
          d="M4 2l4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export function NavPanel() {
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [activeSpeed, setActiveSpeed] = useState<number>(DEFAULT_TIME_SPEED);
  const [paused, setPaused] = useState(false);
  /** Which group's sheet is up, or null. See system-sheet.tsx. */
  const [openSheet, setOpenSheet] = useState<string | null>(null);
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

  /**
   * Opens a group's sheet, and remembers where the pointer came from.
   *
   * Focus goes back to that button on close rather than to the top of the panel,
   * which is the one thing a dialog opened from a list has to get right — the row it
   * belongs to is a long way down a scrolling column, and losing the place is worse
   * than never having opened it.
   */
  const closeSheet = () => {
    const opener = openSheet;
    setOpenSheet(null);
    if (opener) {
      document.querySelector<HTMLElement>(`.nav-expand-btn[data-expand="${opener}"]`)?.focus();
    }
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
        {/* Everything below the header scrolls; the header does not. It is its own
            element rather than the header being `position: sticky` inside one
            scroller, because sticky would have to be pinned through this container's
            own 20px of padding — and paying that back in negative margins leaves the
            resting layout depending on two numbers agreeing that nothing enforces.
            Taking the header out of the scrollport makes it structural instead. */}
        <div className="nav-panel-scroll">
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
            {BODIES.map((planet, index) => (
              // A hairline above the first planet, and another above Pluto. The list
              // mixes three kinds of thing — a star, the eight planets, and a place to
              // look from — and it read as ten identical rows because nothing said so.
              // Rules rather than more eyebrow headings: they cost a few pixels instead
              // of a row each, and hairline-divided rectangles are already this
              // chrome's vocabulary.
              <div
                className={`nav-planet ${index === 0 || planet.startsGroup ? 'nav-planet--starts-group' : ''}`}
                key={planet.id}
              >
                <div className="nav-planet-row">
                  <button
                    className={`nav-btn nav-planet-btn nav-object-btn ${activeTarget === planet.id ? 'active' : ''}`}
                    data-target={planet.id}
                    onClick={() => setActiveTarget(planet.id)}
                  >
                    <span className="nav-object-symbol"><BodyIcon id={planet.id} /></span>
                    <span>{planet.label}</span>
                  </button>
                  {hasSheet(planet) && (
                    <SheetOpener
                      id={planet.id}
                      label={planet.label}
                      open={openSheet === planet.id}
                      onOpen={setOpenSheet}
                    />
                  )}
                </div>
              </div>
            ))}
            <div className="nav-planet nav-planet--starts-group">
              <div className="nav-planet-row">
                <button
                  className={`nav-btn nav-planet-btn nav-object-btn ${activeTarget === 'system' ? 'active' : ''}`}
                  data-target="system"
                  onClick={() => setActiveTarget('system')}
                >
                  <span className="nav-object-symbol"><BodyIcon id="system" /></span>
                  <span>Solar system</span>
                </button>
                <SheetOpener
                  id="system"
                  label="Solar system"
                  open={openSheet === 'system'}
                  onOpen={setOpenSheet}
                />
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
    {/* Outside the panel, not inside it: the panel is `position: fixed` and slides
        clean off the screen when collapsed, which would take the dialog with it — and
        on the mobile layout, choosing a moon closes the drawer, so the sheet would be
        leaving at the moment it is being read. */}
    <SystemSheet
      groups={SHEET_GROUPS}
      openId={openSheet}
      activeTarget={activeTarget}
      onSelect={(id) => {
        setActiveTarget(id);
        // The drawer's own "select and get out of the way" rule, which the delegated
        // handler on the object list cannot reach from here — the sheet is not inside
        // it. Same condition, same reason: on desktop the panel is docked and must not
        // fight the user's own collapse choice.
        if (window.matchMedia(MOBILE_QUERY).matches) setIsCollapsed(true);
      }}
      onClose={closeSheet}
    />
    </>
  );
}
