import { Matrix4, Quaternion, Vector3 } from 'three';
import { latLonToDirection } from './geo';
import {
    EARTH_OBLIQUITY_DEG,
    EARTH_ORBIT_RADIUS,
    MARS_POLE_DEC_DEG,
    MARS_POLE_RA_DEG,
    MARS_PRIME_MERIDIAN_DEG,
    MARS_ROTATION_DEG_PER_DAY,
    MOON_DISTANCE,
} from './constants/planets.const';

const DEG = Math.PI / 180;
const ARCSEC = DEG / 3600;
export const EARTH_OBLIQUITY = EARTH_OBLIQUITY_DEG * DEG;

const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);

/** Julian day number. 2440587.5 is the Julian day of the Unix epoch. */
function julianDay(date: Date): number {
    return date.getTime() / 86400000 + 2440587.5;
}

/** Days since the J2000.0 epoch — the argument every formula below is built on. */
export function daysSinceJ2000(date: Date): number {
    return julianDay(date) - 2451545.0;
}

/**
 * World layout: the ecliptic is the XZ plane, +Y is ecliptic north, and the Sun is
 * at the origin. Longitudes use the same handedness as `latLonToDirection` in
 * geo.ts (note the negative z), so the two can be composed without a sign fix.
 */
export function eclipticDirection(longitude: number, target = new Vector3()): Vector3 {
    return target.set(Math.cos(longitude), 0, -Math.sin(longitude));
}

export interface SolarPosition {
    /** Sun's apparent geocentric ecliptic longitude, radians. */
    eclipticLongitude: number;
    /** Radians north of the celestial equator — drives the seasons. */
    declination: number;
    rightAscension: number;
    /** Greenwich mean sidereal time, degrees. */
    gmst: number;
}

/**
 * Low-precision solar position from the Astronomical Almanac. Good to a fraction of
 * a degree for the next century, which is far finer than a terminator drawn on a
 * 1-unit sphere can resolve.
 */
export function solarPosition(date: Date): SolarPosition {
    const n = daysSinceJ2000(date);

    const meanLongitude = (280.46 + 0.9856474 * n) * DEG;
    const meanAnomaly = (357.528 + 0.9856003 * n) * DEG;

    // Mean longitude corrected for the orbit's eccentricity.
    const eclipticLongitude =
        meanLongitude + 1.915 * DEG * Math.sin(meanAnomaly) + 0.02 * DEG * Math.sin(2 * meanAnomaly);

    const obliquity = (23.439 - 0.0000004 * n) * DEG;

    const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
    const rightAscension = Math.atan2(
        Math.cos(obliquity) * Math.sin(eclipticLongitude),
        Math.cos(eclipticLongitude)
    );

    const gmst = 280.46061837 + 360.98564736629 * n;

    return { eclipticLongitude, declination, rightAscension, gmst };
}

export interface SubsolarPoint {
    /** Degrees north — equals the sun's declination, so it tracks the seasons. */
    latitude: number;
    /** Degrees east — sweeps westward roughly 15°/hour. */
    longitude: number;
}

/** The point on Earth where the sun is directly overhead. */
export function subsolarPoint(date: Date): SubsolarPoint {
    const { declination, rightAscension, gmst } = solarPosition(date);

    let longitude = rightAscension / DEG - gmst;
    longitude = ((((longitude + 180) % 360) + 360) % 360) - 180; // wrap to [-180, 180)

    return { latitude: declination / DEG, longitude };
}

/** Earth's heliocentric position. It sits opposite the Sun's apparent direction. */
export function earthOrbitPosition(date: Date, target = new Vector3()): Vector3 {
    const { eclipticLongitude } = solarPosition(date);
    return eclipticDirection(eclipticLongitude + Math.PI, target).multiplyScalar(EARTH_ORBIT_RADIUS);
}

const spinSunDir = new Vector3();
const spinLocalDir = new Vector3();

/** Angle around the world's XZ plane, matching the handedness of eclipticDirection. */
function planarAngle(v: Vector3): number {
    return Math.atan2(-v.z, v.x);
}

/**
 * The spin to apply to the Earth mesh *inside* its tilt pivot.
 *
 * The mesh hangs off a pivot rotated by −obliquity about X, so its world orientation
 * is `R_x(−ε) · R_y(spin)`. We need the subsolar point to end up pointing at the Sun:
 *
 *     R_x(−ε) · R_y(spin) · d = s        (d = subsolar direction, s = Sun direction)
 *  => R_y(spin) · d = R_x(+ε) · s
 *
 * `R_y` leaves the y component alone, and both sides already agree there — their y is
 * sin(declination) either way — so the spin is just the difference of the two
 * horizontal bearings. Solving it this way keeps the terminator exactly consistent
 * with `subsolarPoint()`, rather than hoping two independent conventions line up.
 */
export function earthSpinAngle(date: Date): number {
    const { eclipticLongitude } = solarPosition(date);
    const { latitude, longitude } = subsolarPoint(date);

    // Sun direction as seen from Earth, then un-tilted into the mesh's own frame.
    eclipticDirection(eclipticLongitude, spinSunDir).applyAxisAngle(X_AXIS, EARTH_OBLIQUITY);
    latLonToDirection(latitude, longitude, spinLocalDir);

    return planarAngle(spinSunDir) - planarAngle(spinLocalDir);
}

/**
 * The Moon's mean ecliptic longitude. Mean motion only — no eccentricity or evection
 * — so the Moon can be a couple of degrees off its true position, but the period and
 * therefore the phase cycle are right.
 */
export function moonEclipticLongitude(date: Date): number {
    return (218.316 + 13.176396 * daysSinceJ2000(date)) * DEG;
}

/** Moon position relative to Earth, in the (un-inclined) orbit plane's frame. */
export function moonOrbitPosition(date: Date, target = new Vector3()): Vector3 {
    return eclipticDirection(moonEclipticLongitude(date), target).multiplyScalar(MOON_DISTANCE);
}

// ---------------------------------------------------------------------------
// Mars
//
// Earth's position comes from an almanac series for the *apparent Sun*, which is
// only useful for the one body we happen to be standing on. Mars needs the general
// case, so it is done properly: Keplerian elements, solved for the true position in
// its own inclined, eccentric orbit. Mars's eccentricity is 0.093 — seven times
// Earth's — so a circle would be visibly wrong, swinging the planet up to 0.14 AU
// off course and getting its apparent size at opposition badly out.
//
// Checked against JPL Horizons for 2026-08-12. Nothing below imposes an obliquity,
// a period or a distance; all of it falls out of the elements and the pole:
//
//   heliocentric position      16,000 km off, 0.006° in Earth-Mars elongation
//   perihelion / aphelion      1.3814 / 1.6661 AU   (1.3814 / 1.6660)
//   sidereal period            686.98 days          (686.98)
//   obliquity to its orbit     25.188°              (25.19°)
//   orbital inclination        1.848°               (1.850°)
//   sub-Earth point            lat 0.001° off, longitude 0.30°
//
// That last residual is almost entirely the clock: the simulation runs on UTC while
// the rotational elements are defined on TDB, and the ~69 s between them is 0.28° of
// Mars. The rest of this file makes the same approximation.
// ---------------------------------------------------------------------------

/**
 * Standard J2000 ecliptic coordinates → this scene's axes.
 *
 * Textbook ecliptic coordinates are +x to the vernal equinox, +z to ecliptic north.
 * The scene puts the ecliptic in XZ with +y north, which is the same frame rotated
 * −90° about x — a proper rotation, so handedness (and therefore the direction
 * longitudes run) is preserved.
 */
function eclipticToScene(x: number, y: number, z: number, target: Vector3): Vector3 {
    return target.set(x, z, -y);
}

/** J2000 equatorial → scene, i.e. tilt down by the obliquity, then re-axis as above. */
function equatorialToScene(v: Vector3): Vector3 {
    const cos = Math.cos(EARTH_OBLIQUITY);
    const sin = Math.sin(EARTH_OBLIQUITY);
    // Rotate about the shared x axis (the equinox line) into ecliptic coordinates.
    const yEcliptic = v.y * cos + v.z * sin;
    const zEcliptic = -v.y * sin + v.z * cos;
    return eclipticToScene(v.x, yEcliptic, zEcliptic, v);
}

/**
 * Mars's orbital elements: value at J2000 and drift per Julian century, from JPL's
 * approximate-positions tables (Standish). Good to a few arcseconds across the
 * 1800–2050 range, which is far tighter than anything visible here.
 */
const MARS_ELEMENTS = {
    semiMajorAxis: [1.52371034, 0.00001847], // AU
    eccentricity: [0.09339410, 0.00007882],
    inclination: [1.84969142, -0.00813131], // degrees, to the ecliptic
    meanLongitude: [-4.55343205, 19140.30268499],
    perihelionLongitude: [-23.94362959, 0.44441088],
    ascendingNode: [49.55953891, -0.29257343],
} as const;

/**
 * Kepler's equation, `M = E − e·sin E`, solved for the eccentric anomaly.
 *
 * There is no closed form, so this is Newton–Raphson. It converges in three or four
 * passes at Mars's eccentricity; the loop cap is only there so a pathological input
 * cannot hang the render loop.
 */
function eccentricAnomaly(meanAnomaly: number, eccentricity: number): number {
    let E = meanAnomaly + eccentricity * Math.sin(meanAnomaly);

    for (let i = 0; i < 8; i++) {
        const residual = meanAnomaly - (E - eccentricity * Math.sin(E));
        const step = residual / (1 - eccentricity * Math.cos(E));
        E += step;
        if (Math.abs(step) < 1e-12) break;
    }

    return E;
}

/** Wraps to (−π, π], which is where Newton–Raphson starts closest to the root. */
function wrapAngle(angle: number): number {
    return angle - 2 * Math.PI * Math.floor((angle + Math.PI) / (2 * Math.PI));
}

/**
 * General precession in longitude — the angle between the J2000 equinox and the
 * equinox of date, ~50.3" a year.
 *
 * This exists because the two models above do not natively share a frame.
 * `solarPosition` is an almanac series and, like all of them, is referred to the
 * *equinox of date*; the orbital elements are referred to J2000. Left alone that is
 * a 0.37° disagreement today, growing by a degree every 72 years — small, but it is
 * a slow drift in the one thing the two bodies genuinely share, and it would put
 * oppositions a day out. Rotating Mars onto Earth's frame costs one axis-angle.
 */
function precessionSinceJ2000(centuries: number): number {
    return (5029.0966 * centuries + 1.11113 * centuries * centuries) * ARCSEC;
}

/** Mars's heliocentric position, in scene units. */
export function marsOrbitPosition(date: Date, target = new Vector3()): Vector3 {
    const centuries = daysSinceJ2000(date) / 36525;
    const at = ([value, rate]: readonly [number, number]) => value + rate * centuries;

    const a = at(MARS_ELEMENTS.semiMajorAxis);
    const e = at(MARS_ELEMENTS.eccentricity);
    const inclination = at(MARS_ELEMENTS.inclination) * DEG;
    const node = at(MARS_ELEMENTS.ascendingNode) * DEG;
    const perihelion = at(MARS_ELEMENTS.perihelionLongitude) * DEG;
    const meanAnomaly = wrapAngle(at(MARS_ELEMENTS.meanLongitude) * DEG - perihelion);

    const E = eccentricAnomaly(meanAnomaly, e);

    // Position in the orbital plane, with +x toward perihelion. This is where the
    // eccentricity actually bites: the focus is offset by a·e, not centred.
    const xOrbit = a * (Math.cos(E) - e);
    const yOrbit = a * Math.sqrt(1 - e * e) * Math.sin(E);

    // Rotate the orbital plane into the ecliptic: Rz(node)·Rx(inclination)·Rz(argument
    // of perihelion), expanded so it costs six trig calls rather than three matrices.
    const argument = perihelion - node;
    const cosArg = Math.cos(argument);
    const sinArg = Math.sin(argument);
    const cosNode = Math.cos(node);
    const sinNode = Math.sin(node);
    const cosInc = Math.cos(inclination);
    const sinInc = Math.sin(inclination);

    const x =
        (cosArg * cosNode - sinArg * sinNode * cosInc) * xOrbit +
        (-sinArg * cosNode - cosArg * sinNode * cosInc) * yOrbit;
    const y =
        (cosArg * sinNode + sinArg * cosNode * cosInc) * xOrbit +
        (-sinArg * sinNode + cosArg * cosNode * cosInc) * yOrbit;
    const z = sinArg * sinInc * xOrbit + cosArg * sinInc * yOrbit;

    // The elements are in AU; EARTH_ORBIT_RADIUS is exactly one AU in scene units.
    // The final rotation carries J2000 onto the equinox of date, which is the frame
    // Earth is already in — see `precessionSinceJ2000`.
    return eclipticToScene(x, y, z, target)
        .applyAxisAngle(Y_AXIS, precessionSinceJ2000(centuries))
        .multiplyScalar(EARTH_ORBIT_RADIUS);
}

/**
 * The fixed orientation of Mars's spin axis, as a rotation to hang the planet under
 * — the counterpart of Earth's `earthTilt` node, and used the same way: set once and
 * never touched, so the axis holds its direction in space through the whole orbit.
 *
 * The IAU defines a body's orientation by its north pole (α₀, δ₀) plus an angle W
 * measured east from the node of its equator. So the mesh's local +Y is carried to
 * the pole, and its local +X — longitude 0 by `geo.ts`'s convention — to that node,
 * which leaves `marsSpinAngle()` free to be W itself.
 */
export const MARS_AXIS_ORIENTATION = (() => {
    const rightAscension = MARS_POLE_RA_DEG * DEG;
    const declination = MARS_POLE_DEC_DEG * DEG;

    const pole = equatorialToScene(
        new Vector3(
            Math.cos(declination) * Math.cos(rightAscension),
            Math.cos(declination) * Math.sin(rightAscension),
            Math.sin(declination)
        )
    );
    // The equator's ascending node on the celestial equator, 90° ahead of the pole
    // in right ascension — where W is measured from.
    const equatorNode = equatorialToScene(
        new Vector3(-Math.sin(rightAscension), Math.cos(rightAscension), 0)
    );

    // Columns are the images of local X, Y, Z. For a right-handed basis the third
    // is fixed by the first two.
    const third = new Vector3().crossVectors(equatorNode, pole);
    return new Quaternion().setFromRotationMatrix(
        new Matrix4().makeBasis(equatorNode, pole, third)
    );
})();

/** Mars's rotation inside its axis pivot: the IAU prime-meridian angle W. */
export function marsSpinAngle(date: Date): number {
    const W = MARS_PRIME_MERIDIAN_DEG + MARS_ROTATION_DEG_PER_DAY * daysSinceJ2000(date);
    return wrapAngle(W * DEG);
}
