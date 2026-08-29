import { useEffect, useRef } from 'react';
import type { Body } from './bodies';
import { BodyIcon } from './planet-icons';
import './system-sheet.scss';

/**
 * The mark that says "this one you can also stand on, not just look at".
 *
 * Every other row in this dialog is a camera target — this is the one place that
 * switches the app into a different mode entirely, and nothing about "Moon" sitting in
 * a list next to "ISS" and "Analemma" says so. Permanent, not a one-time callout: the
 * distinction ("landable" vs. "observe only") is a standing fact about this row, the
 * same way the live dot beside "Solar system simulator" is a standing fact rather than
 * an announcement — so, like that dot, this has no dismissal and no animation, just a
 * steady glow.
 *
 * A flag rather than an abstract icon, because the thing it points at has a real one:
 * `moon-surface/artefacts.ts` plants the actual Apollo 11 flag at Tranquility Base,
 * lying flat where the ascent engine knocked it over.
 *
 * `aria-label` rather than `aria-hidden`: this sits inside the Moon's own button, so
 * it extends that button's accessible name — a screen reader gets "Moon, click Land to
 * walk the surface" instead of an unexplained icon.
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

interface SystemSheetProps {
  /** Every group that has one, mounted at once. See below for why that matters. */
  groups: Body[];
  /** Which group is showing, or null for closed. */
  openId: string | null;
  activeTarget: string | null;
  onSelect(id: string): void;
  onClose(): void;
}

/**
 * What hangs off a planet, as a dialog rather than as a drawer in the list.
 *
 * It replaced an in-place accordion, and the reason is Saturn: seven moons and a haze
 * toggle unfolding inside a 288px column pushed everything below them off the screen,
 * so choosing a moon meant scrolling a list that had just grown by half its own height
 * underneath the finger that opened it. A planet's moons are a *set* — they are worth
 * seeing next to each other, at a size that fits their names — and a list column is the
 * one shape that cannot show a set without displacing everything around it.
 *
 * ## Every group is mounted, always
 *
 * This is the constraint the whole component is built around, and it is not a React
 * concern — it is `script.ts`'s. That file collects every `.nav-btn[data-target]` once
 * when the scene initialises and looks each toggle up by id at the same moment, so a
 * button that does not exist yet never picks up its handler and a toggle that appears
 * later is invisible to the code that owns its label. So all six groups render on the
 * first pass and stay rendered; `hidden` is what selects between them, and the closed
 * dialog is a class on the overlay. **Do not make this render only the open group.**
 *
 * ## The rest
 *
 * - **It closes on any button inside it.** Every control here either flies the camera
 *   somewhere or switches a layer, and both are answered by looking at the scene — so
 *   holding a dialog over the scene afterwards is holding it over the answer. The one
 *   real cost would be flipping two toggles in a row, and no group has more than two.
 * - **The scrim is the dialog's own background**, so a click that lands on it closes:
 *   the same shape `shared/modal` uses, and the same z-order argument — this sits above
 *   the panel and both HUD corners, and *below* the confirmation dialog, which can be
 *   raised from inside this one by picking a body while standing on the Moon.
 * - **Focus goes to the close button and comes back to the opener**, which is the whole
 *   of the keyboard contract a dialog owes: `Escape` closes, and the opener is where
 *   the user was.
 */
export function SystemSheet({ groups, openId, activeTarget, onSelect, onClose }: SystemSheetProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openId) return;

    // Found in the DOM rather than held in a ref, because the ref would have to be
    // attached conditionally — one of six dialogs at a time — and `:not([hidden])`
    // already says exactly the same thing without a second mechanism that has to agree
    // with the `hidden` attribute. Next frame rather than this one: the overlay is
    // `visibility: hidden` while closed, and nothing inside a hidden subtree can take
    // focus, so this has to run after the class that reveals it has been through style.
    const focusFrame = requestAnimationFrame(() => {
      overlayRef.current
        ?.querySelector<HTMLElement>('.system-sheet__dialog:not([hidden]) .system-sheet__close')
        ?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    // Capture, so Escape takes the dialog down before it reaches the window listener
    // that would otherwise read it as "leave free flight" or "lift off the Moon".
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [openId, onClose]);

  return (
    <div
      ref={overlayRef}
      className={`system-sheet ${openId ? 'system-sheet--open' : ''}`}
      // Only a click on the scrim itself — a click that reached a dialog stops here.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {groups.map((group) => (
        <div
          key={group.id}
          className="system-sheet__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`system-sheet-title-${group.id}`}
          hidden={openId !== group.id}
        >
          <header className="system-sheet__header">
            <span className="system-sheet__symbol"><BodyIcon id={group.id} /></span>
            <h2 className="system-sheet__title" id={`system-sheet-title-${group.id}`}>
              {group.label}
            </h2>
            <button
              type="button"
              className="system-sheet__close"
              aria-label={`Close ${group.label}`}
              onClick={onClose}
            >
              <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
                <path
                  d="M3 3l6 6M9 3l-6 6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </button>
          </header>

          {/* Delegated rather than wired onto each control: this is the dialog's own
              "answer and get out of the way" behaviour and it applies to every button
              in it equally, including the toggles script.ts owns — whose click handlers
              are attached outside React and would have to be left alone anyway. */}
          <div
            className="system-sheet__list"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('button')) onClose();
            }}
          >
            {group.satellites.map((satellite) => (
              <div className="system-sheet__group" key={satellite.id}>
                <div className="system-sheet__row">
                  <button
                    className={`nav-btn system-sheet__target ${activeTarget === satellite.id ? 'active' : ''}`}
                    data-target={satellite.id}
                    onClick={() => onSelect(satellite.id)}
                  >
                    <span className="system-sheet__row-symbol"><BodyIcon id={satellite.id} /></span>
                    <span>{satellite.label}</span>
                    {satellite.id === 'moon' && <LandFlag />}
                  </button>
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
                {/* A satellite's own switchable things, indented under it and simply
                    shown. In the old list these were behind a second chevron, because a
                    bare "Show" beside a row named ISS reads as showing the ISS — but
                    that was a fix for a column too narrow to carry both a name and a
                    label. Here the row has room to say "Trajectory" itself. */}
                {satellite.nested?.map((item) => (
                  <div className="system-sheet__row system-sheet__row--nested" key={item.toggleId}>
                    {/* Not a `data-target` button: there is nothing here to fly to, so
                        it carries no click handler and no active state. */}
                    <span className="nav-btn nav-btn--static system-sheet__target">{item.label}</span>
                    <button
                      type="button"
                      className={`nav-btn nav-btn--compact nav-visibility-btn ${
                        item.startsOff ? 'nav-visibility-btn--off' : ''
                      }`}
                      id={item.toggleId}
                    >
                      {item.initialLabel}
                    </button>
                  </div>
                ))}
              </div>
            ))}

            {/* The group's own layer, last and set apart by a rule: everything above it
                is somewhere to go, and this is something to take off. */}
            {group.toggle && (
              <div
                className={`system-sheet__row ${
                  group.satellites.length > 0 ? 'system-sheet__row--parted' : ''
                }`}
              >
                <span className="nav-btn nav-btn--static system-sheet__target">
                  {group.toggle.label}
                </span>
                <button
                  type="button"
                  className={`nav-btn nav-btn--compact nav-visibility-btn ${
                    group.toggle.startsOff ? 'nav-visibility-btn--off' : ''
                  }`}
                  id={group.toggle.toggleId}
                >
                  {group.toggle.initialLabel}
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
