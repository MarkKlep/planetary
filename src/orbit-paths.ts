import {
    AdditiveBlending,
    BufferGeometry,
    Line,
    LineBasicMaterial,
    Vector3,
} from 'three';
import { earthOrbitPosition, marsOrbitPosition, venusOrbitPosition } from './orbits';
import {
    EARTH_ORBITAL_PERIOD_DAYS,
    MARS_ORBITAL_PERIOD_DAYS,
    VENUS_ORBITAL_PERIOD_DAYS,
} from './constants/planets.const';

const MS_PER_DAY = 86400000;

/**
 * How many points to trace each orbit with.
 *
 * The error of a chord against the arc it cuts is r·(1−cos(π/n)), so at 512 points
 * the path departs from the true ellipse by 2e-5 of its own radius — half a scene
 * unit on Earth's orbit, well under a pixel at any distance the whole orbit is in
 * frame. Worth being deliberate about, because the cost is paid once at module load
 * and never again: these are static lines.
 */
const ORBIT_SAMPLES = 512;

/**
 * Trace a body's orbit by asking the ephemeris where it actually goes.
 *
 * Sampling the real position function rather than drawing an ellipse from the
 * elements is the point: it costs nothing extra here, and it means the line is the
 * same curve the planet is flying, eccentricity, inclination, precession correction
 * and all. An idealised circle would visibly miss — Mars's eccentricity of 0.0934
 * swings it 0.19 AU between perihelion and aphelion, which at this scale is 4,400
 * units, and the line would sit off the planet by that much twice per orbit.
 */
function traceOrbit(
    positionAt: (date: Date, target?: Vector3) => Vector3,
    periodDays: number,
    epoch: Date,
    color: number
): Line {
    const points: Vector3[] = [];
    for (let i = 0; i <= ORBIT_SAMPLES; i++) {
        const date = new Date(epoch.getTime() + (i / ORBIT_SAMPLES) * periodDays * MS_PER_DAY);
        points.push(positionAt(date, new Vector3()));
    }

    // A `Line` closed by hand with a repeated first point rather than a `LineLoop`:
    // one orbital period does not return a body exactly where it started (that is
    // what makes an anomalistic year differ from a sidereal one), so the loop's
    // implicit closing segment would be a visible chord across the gap.
    points[points.length - 1].copy(points[0]);

    const material = new LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.32,
        // Additive so the line reads against black without ever brightening a body it
        // crosses in front of, and depth-write off so it cannot z-fight the marker
        // sprites it passes through.
        blending: AdditiveBlending,
        depthWrite: false,
        // These are diagrammatic, not lit geometry: tone mapping would drag the
        // colour toward the rest of the scene's exposure and dull it.
        toneMapped: false,
    });

    const line = new Line(new BufferGeometry().setFromPoints(points), material);
    // Nothing about an orbit path is worth raycasting against, and leaving it pickable
    // would let a click on the line count as a click on empty space near a body.
    line.raycast = () => { };
    return line;
}

/**
 * The epoch the paths are traced from.
 *
 * Fixed at module load rather than following the simulated clock, because the shape
 * of an orbit is not what changes as time runs — the planet's position along it is.
 * Re-tracing per frame would rebuild 512 points to draw the same curve.
 */
const EPOCH = new Date();

// Coloured to match each body's own marker, so a line and the dot travelling along it
// read as belonging together at system scale, where that dot is all you can see of the
// planet itself.
export const earthOrbitPath = traceOrbit(
    earthOrbitPosition,
    EARTH_ORBITAL_PERIOD_DAYS,
    EPOCH,
    0x9fc4ff
);

export const marsOrbitPath = traceOrbit(
    marsOrbitPosition,
    MARS_ORBITAL_PERIOD_DAYS,
    EPOCH,
    0xff9c6b
);

// The one orbit here whose 3.39° tilt to the ecliptic is worth being able to see:
// it is the steepest of any planet, and the reason Venus usually misses the Sun's
// disc at inferior conjunction instead of transiting it.
export const venusOrbitPath = traceOrbit(
    venusOrbitPosition,
    VENUS_ORBITAL_PERIOD_DAYS,
    EPOCH,
    0xffd9a0
);

export const orbitPaths = [venusOrbitPath, earthOrbitPath, marsOrbitPath];
