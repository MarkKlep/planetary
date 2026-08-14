import { LANDING_SITES } from '../planets/earth/moon-surface/sites';
import { MOON_HORIZON_M } from '../constants/planets.const';
import './surface-hud.scss';

/**
 * Read-out and key legend for standing on the Moon.
 *
 * Static markup, like `flight-hud.tsx` and for the same reason: `script.ts` owns the
 * mode, and the surface can be left by keyboard as well as by button, so React state
 * here would only be a second copy of the truth waiting to disagree with it. The one
 * exception is the site list, which is data rather than state and comes from the same
 * module the scene builds from.
 *
 * Walking and driving get different rows and different keys, and both sets are always
 * in the DOM — `script.ts` puts `surface-hud--driving` on the panel and CSS does the
 * rest, the same always-mounted rule the nav panel's satellite lists follow.
 *
 * The panel itself takes no pointer events, since the canvas under it is being dragged
 * to look around, so the `<select>` has to opt back in.
 */
export function SurfaceHud() {
  const walkKeys: Array<[string, string]> = [
    ['W / S', 'walk'],
    ['A / D', 'strafe'],
    ['space', 'hop'],
    ['shift', 'lope'],
    ['R', 'board rover'],
    ['Z', 'long lens'],
    ['drag', 'look around'],
    ['Esc', 'leave'],
  ];

  const driveKeys: Array<[string, string]> = [
    ['W / S', 'throttle · brake'],
    ['A / D', 'steer'],
    ['R', 'get out'],
    ['Z', 'long lens'],
    ['drag', 'look around'],
    ['Esc', 'leave'],
  ];

  return (
    <div className="surface-hud" id="surface-hud">
      <h2 className="surface-hud__title">
        <span className="surface-hud__walk-only">Lunar surface</span>
        <span className="surface-hud__drive-only">Roving vehicle</span>
      </h2>

      <select className="surface-hud__site" id="surface-site" aria-label="Landing site">
        {LANDING_SITES.map((site) => (
          <option key={site.id} value={site.id}>
            {site.label}
          </option>
        ))}
      </select>
      <p className="surface-hud__note" id="surface-note" />

      <div className="surface-hud__readout">
        <span className="surface-hud__label">Sun</span>
        <span className="surface-hud__value" id="surface-sun">—</span>
        <span className="surface-hud__label">Earth</span>
        <span className="surface-hud__value" id="surface-earth">—</span>

        {/* Not a setting and not a measurement of the render — it is √(2Rh) for the
            Moon's radius and an astronaut's eye height, and the ground was built to
            match it rather than the other way round. Earth's, for comparison, is
            4,654 m. */}
        <span className="surface-hud__label surface-hud__walk-only">Horizon</span>
        <span className="surface-hud__value surface-hud__walk-only">
          {Math.round(MOON_HORIZON_M).toLocaleString()} m
        </span>
        <span className="surface-hud__label surface-hud__walk-only">Rover</span>
        <span className="surface-hud__value surface-hud__walk-only" id="surface-rover">—</span>

        <span className="surface-hud__label surface-hud__drive-only">Speed</span>
        <span className="surface-hud__value surface-hud__drive-only" id="surface-speed">—</span>
        <span className="surface-hud__label surface-hud__drive-only">Trip</span>
        <span className="surface-hud__value surface-hud__drive-only" id="surface-trip">—</span>
        {/* What the LRV's own navigation box displayed, and the only reason it was
            safe to drive out of sight of the lunar module: range and bearing back,
            dead-reckoned from the wheels and a sun shot, because there is no GPS up
            there and no magnetic field to hang a compass on. */}
        <span className="surface-hud__label surface-hud__drive-only">Home</span>
        <span className="surface-hud__value surface-hud__drive-only" id="surface-home">—</span>
      </div>

      <dl className="surface-hud__keys surface-hud__walk-only">
        {walkKeys.map(([key, action]) => (
          <div className="surface-hud__key-row" key={key}>
            <dt>{key}</dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
      <dl className="surface-hud__keys surface-hud__drive-only">
        {driveKeys.map(([key, action]) => (
          <div className="surface-hud__key-row" key={key}>
            <dt>{key}</dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
