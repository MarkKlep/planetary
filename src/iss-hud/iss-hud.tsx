import {
    ISS_INCLINATION_DEG,
    ISS_ALTITUDE_KM,
    ISS_ORBITAL_PERIOD_S,
    ISS_ORBITAL_SPEED_KM_S,
} from '../constants/planets.const';
import './iss-hud.scss';

/**
 * The station's read-out, shown while the camera is following it.
 *
 * Static markup, like `flight-hud.tsx` and `surface-hud.tsx` and for the same reason:
 * `script.ts` owns which body the camera is on, and it can be changed from the nav
 * panel, from a click in the scene, from a keyboard shortcut or by entering free
 * flight — React state here would only be a second copy of the truth waiting to
 * disagree with one of them.
 *
 * The split below is the useful one. **The four figures on the left are constants of
 * the orbit** and are rendered here, once, straight out of the same module the
 * simulation flies the station with — so the speed on screen cannot drift from the
 * speed being used. **The four on the right are state** and are written by the render
 * loop through the ids: where it is, whether the Sun is on it, and where the number
 * came from.
 *
 * That last row is the one worth having. The live feed is plain HTTP, so a browser on
 * an HTTPS page refuses it outright — the station is then flown on its own orbital
 * model instead, which is a different claim from "this is where it is right now" and
 * ought to say so rather than quietly presenting a computed position as a measured one.
 */
export function IssHud() {
    const orbitsPerDay = 86400 / ISS_ORBITAL_PERIOD_S;

    return (
        <div className="iss-hud" id="iss-hud">
            <h2 className="iss-hud__title">International Space Station</h2>
            <p className="iss-hud__subtitle">Low Earth orbit · crewed since Nov 2000</p>

            <div className="iss-hud__readout">
                <span className="iss-hud__label">Latitude</span>
                <span className="iss-hud__value" id="iss-latitude">—</span>
                <span className="iss-hud__label">Longitude</span>
                <span className="iss-hud__value" id="iss-longitude">—</span>

                <span className="iss-hud__label">Altitude</span>
                <span className="iss-hud__value">{Math.round(ISS_ALTITUDE_KM)} km</span>

                {/* √(µ/r), not a quoted figure — see `planets.const.ts`. Both units,
                    because neither one alone lands: 7.7 km/s means nothing until you
                    see it as 27,600 km/h, and 27,600 km/h means nothing until you see
                    it circle the planet in an hour and a half. */}
                <span className="iss-hud__label">Speed</span>
                <span className="iss-hud__value">
                    {ISS_ORBITAL_SPEED_KM_S.toFixed(2)} km/s
                    <span className="iss-hud__aside">{Math.round(ISS_ORBITAL_SPEED_KM_S * 3600).toLocaleString()} km/h</span>
                </span>

                <span className="iss-hud__label">Period</span>
                <span className="iss-hud__value">
                    {(ISS_ORBITAL_PERIOD_S / 60).toFixed(1)} min
                    <span className="iss-hud__aside">{orbitsPerDay.toFixed(2)} orbits/day</span>
                </span>

                {/* The one element a single position fix cannot recover, and the reason
                    the ground track never reaches past 51.6° either way. */}
                <span className="iss-hud__label">Inclination</span>
                <span className="iss-hud__value">{ISS_INCLINATION_DEG.toFixed(2)}°</span>
            </div>

            <div className="iss-hud__status">
                {/* Sixteen sunrises a day: about 36 minutes of every 93 are spent inside
                    Earth's shadow, which the render loop tests for rather than assumes. */}
                <div className="iss-hud__status-row">
                    <span className="iss-hud__label">Sunlight</span>
                    <span className="iss-hud__state" id="iss-sunlight">—</span>
                </div>
                <div className="iss-hud__status-row">
                    <span className="iss-hud__label">Position</span>
                    <span className="iss-hud__state" id="iss-feed">—</span>
                </div>
            </div>
        </div>
    );
}
