import './flight-hud.scss';

/**
 * Read-out and key legend for free-flight mode.
 *
 * Static markup only: `script.ts` owns the mode, and drives visibility and the two
 * values through the ids below — the same DOM bridge the nav panel uses. Free flight
 * can be left by keyboard as well as by button, so React state here would only be a
 * second copy of the truth waiting to disagree with it.
 */
export function FlightHud() {
  const keys: Array<[string, string]> = [
    ['W / S', 'forward · back'],
    ['A / D', 'strafe'],
    ['Q / E', 'down · up'],
    ['drag', 'look around'],
    ['wheel, [ ]', 'speed'],
    ['shift / ctrl', 'boost · fine'],
    ['Esc', 'exit'],
  ];

  return (
    <div className="flight-hud" id="flight-hud">
      <h2 className="flight-hud__title">Free flight</h2>
      <div className="flight-hud__readout">
        <span className="flight-hud__label">Speed</span>
        <span className="flight-hud__value" id="flight-speed">—</span>
        <span className="flight-hud__label">Frame</span>
        <span className="flight-hud__value" id="flight-frame">—</span>
      </div>
      <dl className="flight-hud__keys">
        {keys.map(([key, action]) => (
          <div className="flight-hud__key-row" key={key}>
            <dt>{key}</dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
