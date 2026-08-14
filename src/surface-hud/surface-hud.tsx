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
 * The panel itself takes no pointer events — the canvas under it is being dragged to
 * look around — so the `<select>` has to opt back in.
 */
export function SurfaceHud() {
  const keys: Array<[string, string]> = [
    ['W / S', 'walk'],
    ['A / D', 'strafe'],
    ['space', 'hop'],
    ['shift', 'lope'],
    ['Z', 'long lens'],
    ['drag', 'look around'],
    ['Esc', 'leave'],
  ];

  return (
    <div className="surface-hud" id="surface-hud">
      <h2 className="surface-hud__title">Lunar surface</h2>

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
        <span className="surface-hud__label">Horizon</span>
        <span className="surface-hud__value">{Math.round(MOON_HORIZON_M).toLocaleString()} m</span>
      </div>

      <dl className="surface-hud__keys">
        {keys.map(([key, action]) => (
          <div className="surface-hud__key-row" key={key}>
            <dt>{key}</dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
