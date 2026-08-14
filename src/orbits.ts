import { Matrix4, Quaternion, Vector3 } from 'three';
import { latLonToDirection } from './geo';
import {
    DEIMOS_ORBIT_RADIUS,
    EARTH_OBLIQUITY_DEG,
    EARTH_ORBIT_RADIUS,
    MARS_POLE_DEC_DEG,
    MARS_POLE_RA_DEG,
    MARS_PRIME_MERIDIAN_DEG,
    MARS_ROTATION_DEG_PER_DAY,
    MOON_DISTANCE,
    PHOBOS_ORBIT_RADIUS,
    VENUS_CLOUD_DEG_PER_DAY,
    VENUS_POLE_DEC_DEG,
    VENUS_POLE_RA_DEG,
    VENUS_PRIME_MERIDIAN_DEG,
    VENUS_ROTATION_DEG_PER_DAY,
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
// The other planets
//
// Earth's position comes from an almanac series for the *apparent Sun*, which is
// only useful for the one body we happen to be standing on. Everything else needs
// the general case, so it is done properly: Keplerian elements, solved for the true
// position in each planet's own inclined, eccentric orbit, and an IAU pole for the
// spin. Mars's eccentricity is 0.093 — seven times Earth's — so a circle would be
// visibly wrong, swinging the planet up to 0.14 AU off course and getting its
// apparent size at opposition badly out.
//
// Both planets below run through exactly the same code. Nothing in it imposes an
// obliquity, a period or a distance; all of that falls out of the elements and the
// pole. Checked against JPL Horizons over 2000-2030 (997 samples each):
//
//                            Mars                      Venus
//   heliocentric position    16,000 km, 0.006°         14,000 km, 0.0074°
//   perihelion / aphelion    1.3814 / 1.6661 AU        0.71844 / 0.72823 AU
//     Horizons               1.3814 / 1.6660           0.71840 / 0.72825
//   sidereal period          686.98 d   (686.98)       224.70080 d  (224.70080)
//   orbital inclination      1.848°     (1.850°)       3.3946°      (3.3946°)
//   obliquity to its orbit   25.188°    (25.19°)       177.36°      (177.3°)
//   sidereal rotation        1.026 d    (1.026)        243.01848 d  (243.018484)
//
// Fed Horizons' own positions, the rotation model alone puts Venus's sub-Earth point
// within 0.005° of longitude and 0.001° of latitude. Composed through the whole scene
// graph, though — the way script.ts actually uses it — that becomes 1.15° and 0.12°,
// and the gap is worth knowing about because neither term is Venus's fault and both
// apply to Mars in exactly the same way:
//
//   * `earthOrbitPosition` puts Earth on a perfect circle of exactly 1 AU. The real
//     Earth ranges over 0.983-1.017, so the direction *from* another planet *to*
//     Earth can be off by up to a degree at Venus's range. It is the dominant term
//     here, and it shrinks the further out the body is.
//   * Positions get precessed onto the equinox of date (see `precessionSinceJ2000`)
//     but the axis quaternions below do not — they stay on J2000, since they are
//     built once and never touched. That leaves a *constant* longitude offset equal
//     to the precession angle, 0.373° today. It is why the residual above barely
//     varies from epoch to epoch.
//
// Both are well under a pixel on anything you can see, so neither is worth the cost
// of fixing: the first would mean a second almanac series, the second would mean
// re-deriving the axis nodes every frame to chase an angle that moves 1.4° a century.
//
// One approximation that genuinely does not matter here: the simulation runs on UTC
// while the rotational elements are defined on TDB. Those ~69 s are 0.28° of Mars,
// but Venus turns 240 times slower, so the same offset costs it under a thousandth
// of a degree.
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
 * Orbital elements: value at J2000 and drift per Julian century, from JPL's
 * approximate-positions tables (Standish). Good to a few arcseconds across the
 * 1800–2050 range, which is far tighter than anything visible here.
 */
interface OrbitalElements {
    semiMajorAxis: readonly [number, number]; // AU
    eccentricity: readonly [number, number];
    inclination: readonly [number, number]; // degrees, to the ecliptic
    meanLongitude: readonly [number, number];
    perihelionLongitude: readonly [number, number];
    ascendingNode: readonly [number, number];
}

const MARS_ELEMENTS: OrbitalElements = {
    semiMajorAxis: [1.52371034, 0.00001847],
    eccentricity: [0.09339410, 0.00007882],
    inclination: [1.84969142, -0.00813131],
    meanLongitude: [-4.55343205, 19140.30268499],
    perihelionLongitude: [-23.94362959, 0.44441088],
    ascendingNode: [49.55953891, -0.29257343],
};

/**
 * Venus's, from the same table.
 *
 * The eccentricity is 0.0068 — the roundest orbit of any planet, and a twentieth of
 * Mars's. It would be tempting to drop it, and unlike Phobos's it really is nearly
 * negligible: carrying it moves Venus by about 0.4° at most. It costs one call to a
 * solver that is already here, and the solver converges on the first pass at this
 * eccentricity, so there is no reason to find out how it looks without.
 *
 * The inclination is the interesting one: 3.39° is the steepest of any planet here,
 * and it is why Venus mostly passes above or below the Sun at inferior conjunction
 * instead of transiting it. Transits come only when the alignment happens near a
 * node — hence the famous 8/121.5/8/105.5-year pattern.
 */
const VENUS_ELEMENTS: OrbitalElements = {
    semiMajorAxis: [0.72333566, 0.00000390],
    eccentricity: [0.00677672, -0.00004107],
    inclination: [3.39467605, -0.00078890],
    meanLongitude: [181.97909950, 58517.81538729],
    perihelionLongitude: [131.60246718, 0.00268329],
    ascendingNode: [76.67984255, -0.27769418],
};

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

/** A planet's heliocentric position from its elements, in scene units. */
function keplerianPosition(
    elements: OrbitalElements,
    date: Date,
    target = new Vector3()
): Vector3 {
    const centuries = daysSinceJ2000(date) / 36525;
    const at = ([value, rate]: readonly [number, number]) => value + rate * centuries;

    const a = at(elements.semiMajorAxis);
    const e = at(elements.eccentricity);
    const inclination = at(elements.inclination) * DEG;
    const node = at(elements.ascendingNode) * DEG;
    const perihelion = at(elements.perihelionLongitude) * DEG;
    const meanAnomaly = wrapAngle(at(elements.meanLongitude) * DEG - perihelion);

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

export const marsOrbitPosition = (date: Date, target = new Vector3()): Vector3 =>
    keplerianPosition(MARS_ELEMENTS, date, target);

export const venusOrbitPosition = (date: Date, target = new Vector3()): Vector3 =>
    keplerianPosition(VENUS_ELEMENTS, date, target);

/**
 * The fixed orientation of a planet's spin axis, as a rotation to hang it under — the
 * counterpart of Earth's `earthTilt` node, and used the same way: set once and never
 * touched, so the axis holds its direction in space through the whole orbit.
 *
 * The IAU defines a body's orientation by its north pole (α₀, δ₀) plus an angle W
 * measured east from the node of its equator. So the mesh's local +Y is carried to
 * the pole, and its local +X — longitude 0 by `geo.ts`'s convention — to that node,
 * which leaves the spin angle free to be W itself.
 */
function axisOrientationFromPole(poleRaDeg: number, poleDecDeg: number): Quaternion {
    const rightAscension = poleRaDeg * DEG;
    const declination = poleDecDeg * DEG;

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
}

export const MARS_AXIS_ORIENTATION = axisOrientationFromPole(
    MARS_POLE_RA_DEG,
    MARS_POLE_DEC_DEG
);

/**
 * Venus's pole lands within 1.3° of ecliptic north, so this node is almost the
 * identity — nothing like Mars's pronounced lean, and the reason Venus has no
 * seasons worth the name. Its axis is nonetheless tipped 177.36° to its orbit, and
 * both facts are the same fact: the planet is very nearly upside down, which is
 * indistinguishable from being upright and turning backwards.
 */
export const VENUS_AXIS_ORIENTATION = axisOrientationFromPole(
    VENUS_POLE_RA_DEG,
    VENUS_POLE_DEC_DEG
);

/**
 * A body's rotation inside its axis pivot: the IAU prime-meridian angle W.
 *
 * `degreesPerDay` is signed, and Venus's is negative. That is the only thing marking
 * it out as the one planet here that turns backwards — no branch, no special case.
 */
function primeMeridianAngle(w0Deg: number, degreesPerDay: number, date: Date): number {
    return wrapAngle((w0Deg + degreesPerDay * daysSinceJ2000(date)) * DEG);
}

export const marsSpinAngle = (date: Date): number =>
    primeMeridianAngle(MARS_PRIME_MERIDIAN_DEG, MARS_ROTATION_DEG_PER_DAY, date);

export const venusSpinAngle = (date: Date): number =>
    primeMeridianAngle(VENUS_PRIME_MERIDIAN_DEG, VENUS_ROTATION_DEG_PER_DAY, date);

/**
 * Venus's cloud deck, which does not turn with the planet.
 *
 * Started from the same W₀ as the surface so the two shells begin aligned at J2000
 * and then visibly diverge — the deck laps the ground beneath it every four days.
 * There is no "correct" phase to give it: the clouds are a fluid, not a body with a
 * prime meridian, so the only thing being claimed here is the rate.
 */
export const venusCloudAngle = (date: Date): number =>
    primeMeridianAngle(VENUS_PRIME_MERIDIAN_DEG, VENUS_CLOUD_DEG_PER_DAY, date);

// ---------------------------------------------------------------------------
// Phobos and Deimos
//
// These do not work like the Moon, and the difference is not a detail — it is the
// reason they are modelled here at all rather than being hung off a fixed pivot.
//
// The Moon is far enough out that the Sun dominates it, so its orbit stays near the
// *ecliptic* and merely nods 5.14° to it. Phobos and Deimos are deep inside Mars's
// gravity well, where the planet's equatorial bulge dominates instead, and it drags
// them into the *equatorial* plane. Each settles on its own local Laplace plane, the
// compromise between the two: for Phobos, only 0.01° off Mars's equator; for Deimos,
// three times further out and so slightly more swayed by the Sun, 0.89° off it.
//
// The orbit then precesses around that plane rather than sitting still in it, and
// quickly — 2.27 years for Phobos, 54.4 for Deimos. Over a session at 10 days/second
// that is a cycle every 82 milliseconds, so it is not something that can be pinned
// to a starting value and forgotten.
//
// Elements below were fitted to JPL's MAR099 ephemeris over 2000-2030, in the frame
// this scene actually uses (Mars's equator, `eclipticDirection` handedness), so they
// drop straight in with no convention shim. Compared back against JPL's published
// mean elements, none of which the fit was given:
//
//                        fitted            JPL published
//   Phobos Laplace pole  RA 317.670        317.671
//                        Dec  52.896        52.893
//          a             9378.5 km         9376
//          e             0.01515           0.0151
//          i             1.069°            1.075°
//          node period   2.267 yr          2.3 yr
//          apse period   1.132 yr          1.1 yr
//          period        0.31891008 d      0.31891023 d
//   Deimos Laplace pole  RA 316.626        316.657
//                        Dec  53.514        53.529
//          a             23459.0 km        23458
//          e             0.000272          0.00033
//          i             1.789°            1.788°
//          node period   54.36 yr          54.5 yr
//          period        1.26244072 d      1.26244
//
// Positions run back against Horizons over the whole 2000-2030 span stay within
// 0.65° / 105 km for Phobos and 0.37° / 152 km for Deimos — about a hundredth of an
// orbit radius each, and well under the marker dot that stands in for these bodies
// at any distance where their orbits are in frame.
//
// Eccentricity is worth carrying even though Phobos's 0.0151 sounds negligible: it
// is the single largest term after the plane itself. Dropping it left Phobos 2.3°
// and 371 km out, three times everything else combined.
// ---------------------------------------------------------------------------

const MARS_NORTH = new Vector3(0, 1, 0);
const MARS_AXIS_INVERSE = MARS_AXIS_ORIENTATION.clone().invert();

export interface SatelliteElements {
    /** Pole of the satellite's local Laplace plane, J2000 equatorial. */
    laplacePoleRaDeg: number;
    laplacePoleDecDeg: number;
    /** Scene units. */
    semiMajorAxis: number;
    eccentricity: number;
    /** To the Laplace plane, not to Mars's equator. */
    inclinationDeg: number;
    nodeJ2000Deg: number;
    nodeRateDegPerDay: number;
    /** Longitude of periapsis, i.e. measured from the node, not from the apse. */
    periapsisJ2000Deg: number;
    periapsisRateDegPerDay: number;
    meanLongitudeJ2000Deg: number;
    meanMotionDegPerDay: number;
}

interface Satellite extends SatelliteElements {
    /** All three in Mars's own equatorial frame, i.e. `marsAxis`'s local space. */
    laplacePole: Vector3;
    laplaceX: Vector3;
    laplaceZ: Vector3;
    inclination: number;
}

/** A fixed J2000 equatorial direction, re-expressed in Mars's equatorial frame. */
function marsFrameDirection(raDeg: number, decDeg: number): Vector3 {
    const ra = raDeg * DEG;
    const dec = decDeg * DEG;
    return equatorialToScene(
        new Vector3(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec))
    ).applyQuaternion(MARS_AXIS_INVERSE);
}

function defineSatellite(elements: SatelliteElements): Satellite {
    const laplacePole = marsFrameDirection(elements.laplacePoleRaDeg, elements.laplacePoleDecDeg);

    // A fixed reference direction inside the Laplace plane to measure the node from:
    // its own ascending node on Mars's equator. Phobos's Laplace plane is only 0.01°
    // off the equator, so these two are very nearly parallel and the cross product is
    // small — but it is never zero, and normalising it is exact at double precision.
    const laplaceX = new Vector3().crossVectors(MARS_NORTH, laplacePole).normalize();
    const laplaceZ = new Vector3().crossVectors(laplaceX, laplacePole);

    return {
        ...elements,
        laplacePole,
        laplaceX,
        laplaceZ,
        inclination: elements.inclinationDeg * DEG,
    };
}

export const PHOBOS = defineSatellite({
    laplacePoleRaDeg: 317.6703,
    laplacePoleDecDeg: 52.8960,
    semiMajorAxis: PHOBOS_ORBIT_RADIUS,
    eccentricity: 0.015150,
    inclinationDeg: 1.0690,
    nodeJ2000Deg: 313.2995,
    nodeRateDegPerDay: -0.4346798,
    periapsisJ2000Deg: 170.0291,
    // Note how nearly this cancels the node rate above. Both are driven by the same
    // equatorial bulge, which regresses the node and advances the apse at almost
    // exactly matching rates.
    periapsisRateDegPerDay: 0.4355682,
    meanLongitudeJ2000Deg: 359.5732,
    // 1128.8°/day against Mars's own 350.9°: Phobos laps the surface below it three
    // times a sol, so from the ground it rises in the *west* and sets in the east.
    meanMotionDegPerDay: 1128.8448458,
});

export const DEIMOS = defineSatellite({
    laplacePoleRaDeg: 316.6257,
    laplacePoleDecDeg: 53.5137,
    semiMajorAxis: DEIMOS_ORBIT_RADIUS,
    // Almost perfectly circular — 6 km of variation on a 23,459 km orbit. Carried
    // anyway so both moons run the same path; the Kepler solver converges on the
    // first pass at this eccentricity and costs nothing.
    eccentricity: 0.000272,
    inclinationDeg: 1.7891,
    nodeJ2000Deg: 189.3796,
    nodeRateDegPerDay: -0.0181330,
    periapsisJ2000Deg: 25.7307,
    periapsisRateDegPerDay: 0.0177336,
    // Just slower than Mars turns, so Deimos crawls the other way across the Martian
    // sky and takes 2.7 days to get from one horizon to the other.
    meanLongitudeJ2000Deg: 33.8856,
    meanMotionDegPerDay: 285.1619039,
});

const satelliteNode = new Vector3();
const satellitePole = new Vector3();
const satelliteAcross = new Vector3();
const satelliteApse = new Vector3();
const satelliteToMars = new Vector3();
const satelliteBasis = new Matrix4();

/**
 * Where a satellite is and which way it is facing, in Mars's equatorial frame.
 *
 * Position and orientation come out together because they are the same geometry: the
 * orbit pole and the direction back to Mars are what place the body, and being
 * tidally locked, they are also what aim it.
 */
export function satelliteState(
    satellite: Satellite,
    date: Date,
    position: Vector3,
    orientation: Quaternion
): void {
    const days = daysSinceJ2000(date);
    const node = (satellite.nodeJ2000Deg + satellite.nodeRateDegPerDay * days) * DEG;
    const periapsis = (satellite.periapsisJ2000Deg + satellite.periapsisRateDegPerDay * days) * DEG;
    const meanLongitude =
        (satellite.meanLongitudeJ2000Deg + satellite.meanMotionDegPerDay * days) * DEG;

    // The ascending node sweeps round the Laplace plane; the orbit pole is the
    // Laplace pole tipped by the inclination about it, so the orbit keeps a constant
    // tilt while the direction of that tilt turns.
    satelliteNode
        .copy(satellite.laplaceX)
        .multiplyScalar(Math.cos(node))
        .addScaledVector(satellite.laplaceZ, -Math.sin(node));
    satellitePole.copy(satellite.laplacePole).applyAxisAngle(satelliteNode, satellite.inclination);
    satelliteAcross.crossVectors(satellitePole, satelliteNode);

    // The apse line, swung round from the node by the argument of periapsis.
    const argument = periapsis - node;
    satelliteApse
        .copy(satelliteNode)
        .multiplyScalar(Math.cos(argument))
        .addScaledVector(satelliteAcross, Math.sin(argument));
    satelliteAcross.crossVectors(satellitePole, satelliteApse);

    const e = satellite.eccentricity;
    const E = eccentricAnomaly(wrapAngle(meanLongitude - periapsis), e);
    position
        .copy(satelliteApse)
        .multiplyScalar(satellite.semiMajorAxis * (Math.cos(E) - e))
        .addScaledVector(
            satelliteAcross,
            satellite.semiMajorAxis * Math.sqrt(1 - e * e) * Math.sin(E)
        );

    // Tidal lock. Both bodies turn once per orbit, so the same face is always toward
    // Mars — and because they are lumpy rather than round, that shows: the long axis
    // is held pointing at the planet, which is the state tides drive them into. Local
    // +X is carried to Mars and +Y to the spin axis, matching the axis order the
    // semi-axis constants are written in.
    //
    // Strictly the spin is *uniform* rather than aimed, so an eccentric orbit swings
    // the long axis back and forth about the sub-Mars direction — ±1.7° for Phobos.
    // Aiming it is simpler and the difference is a fraction of a pixel.
    satelliteToMars.copy(position).normalize().negate();
    satelliteAcross.crossVectors(satelliteToMars, satellitePole);
    orientation.setFromRotationMatrix(
        satelliteBasis.makeBasis(satelliteToMars, satellitePole, satelliteAcross)
    );
}
