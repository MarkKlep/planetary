import {
    BETELGEUSE_ANGULAR_DIAMETER_ARCSEC,
    BETELGEUSE_DISTANCE_LY,
    BETELGEUSE_RADIUS_AU,
    BETELGEUSE_RADIUS_SOLAR,
    BETELGEUSE_TEMPERATURE_K,
} from '../background/betelgeuse';
import './betelgeuse-hud.scss';

/**
 * The star's read-out, shown while the camera is pointed at it.
 *
 * Static markup driven by ids from `script.ts`, like `iss-hud.tsx` and for its reason:
 * the star can be selected from the nav panel or by clicking it in the sky, and it is
 * released by every other nav target, by free flight and by landing — so React state
 * here would be a second copy of the truth waiting to disagree with one of them. It
 * shares the bottom-right corner with the other three HUDs, and the exclusion runs both
 * ways: those four routes stand this panel down, and while it is up the station's
 * read-out stands down for it — that one needs saying explicitly, because unlike free
 * flight and the lunar surface, pointing at a star does not give up the camera's focus
 * target. Keeping it is what stops the view drifting while you look.
 *
 * The split is the one that panel makes too, and here it is nearly the whole panel.
 * **Every figure but the first is a constant**, and each is imported from
 * `background/betelgeuse.ts` rather than typed in, so what is printed cannot drift
 * from what the scene is drawing. Only the magnitude moves, off the two pulsation
 * cycles and the simulated clock.
 *
 * Two of them are chosen for what they say rather than for completeness. **The radius**
 * is the figure that lands: 764 R☉ is 3.55 AU, so stand this star where the Sun is and
 * its surface swallows Mercury, Venus, Earth and Mars and reaches into the belt.
 * **The apparent size** is why the thing on screen is a point — 0.042″ is five
 * thousandths of a pixel, so a point is not a stand-in for the star, it is what the
 * star looks like. It is also the number that makes the other two checkable against
 * each other: the radius and the distance have to produce it, and they do.
 */
export function BetelgeuseHud() {
    return (
        <div className="betelgeuse-hud" id="betelgeuse-hud">
            <h2 className="betelgeuse-hud__title">Betelgeuse</h2>
            {/* Spelled out rather than "α Orionis": the subtitle is uppercased in CSS
                like the other HUDs', and an uppercased α is Α, which renders as a
                Latin A and quietly turns the Bayer designation into a different one. */}
            <p className="betelgeuse-hud__subtitle">Alpha Orionis · red supergiant</p>

            <div className="betelgeuse-hud__readout">
                {/* The one figure that moves: two cycles, 388 days and 2,050, off the
                    simulated clock. Wind time forward and watch this change. */}
                <span className="betelgeuse-hud__label">Magnitude</span>
                <span className="betelgeuse-hud__value" id="betelgeuse-magnitude">—</span>

                <span className="betelgeuse-hud__label">Distance</span>
                <span className="betelgeuse-hud__value">
                    {BETELGEUSE_DISTANCE_LY} ly
                    <span className="betelgeuse-hud__aside">
                        light left it around {new Date().getFullYear() - BETELGEUSE_DISTANCE_LY}
                    </span>
                </span>

                <span className="betelgeuse-hud__label">Radius</span>
                <span className="betelgeuse-hud__value">
                    {BETELGEUSE_RADIUS_SOLAR} R☉
                    <span className="betelgeuse-hud__aside">
                        {BETELGEUSE_RADIUS_AU.toFixed(2)} AU — past the belt
                    </span>
                </span>

                <span className="betelgeuse-hud__label">Temperature</span>
                <span className="betelgeuse-hud__value">
                    {BETELGEUSE_TEMPERATURE_K.toLocaleString()} K
                    <span className="betelgeuse-hud__aside">2,200 K cooler than the Sun</span>
                </span>

                <span className="betelgeuse-hud__label">Apparent size</span>
                <span className="betelgeuse-hud__value">
                    {BETELGEUSE_ANGULAR_DIAMETER_ARCSEC.toFixed(3)}″
                    <span className="betelgeuse-hud__aside">a twenty-thousandth of the Moon's</span>
                </span>
            </div>

            {/* Worth the three lines. The camera did just move, so something happened,
                and in a project where every other camera move is a real translation to
                a real place it would be fair to read this one as the same thing. It is
                not: it is a step past the planet that was in the way, and there is no
                move in this model that gets measurably closer to a star. */}
            <p className="betelgeuse-hud__note">
                The camera has turned to face it and stepped clear of the nearest planet.
                Nothing further is possible — at {BETELGEUSE_DISTANCE_LY} light years,
                crossing this whole model would not shift the star by a pixel.
            </p>
        </div>
    );
}
