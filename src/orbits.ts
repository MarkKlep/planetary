import { Matrix4, Quaternion, Vector3 } from 'three';
import { latLonToDirection } from './geo';
import {
    CALLISTO_ORBIT_RADIUS,
    DEIMOS_ORBIT_RADIUS,
    DIONE_ORBIT_RADIUS,
    EARTH_OBLIQUITY_DEG,
    EARTH_ORBIT_RADIUS,
    ENCELADUS_ORBIT_RADIUS,
    EUROPA_ORBIT_RADIUS,
    GANYMEDE_ORBIT_RADIUS,
    IAPETUS_ORBIT_RADIUS,
    IO_ORBIT_RADIUS,
    JUPITER_POLE_DEC_DEG,
    JUPITER_POLE_RA_DEG,
    JUPITER_PRIME_MERIDIAN_DEG,
    JUPITER_ROTATION_DEG_PER_DAY,
    MARS_POLE_DEC_DEG,
    MARS_POLE_RA_DEG,
    MARS_PRIME_MERIDIAN_DEG,
    MARS_ROTATION_DEG_PER_DAY,
    MERCURY_POLE_DEC_DEG,
    MERCURY_POLE_RA_DEG,
    MERCURY_PRIME_MERIDIAN_DEG,
    MERCURY_ROTATION_DEG_PER_DAY,
    MIMAS_ORBIT_RADIUS,
    MOON_DISTANCE,
    PHOBOS_ORBIT_RADIUS,
    RHEA_ORBIT_RADIUS,
    SATURN_POLE_DEC_DEG,
    SATURN_POLE_RA_DEG,
    SATURN_PRIME_MERIDIAN_DEG,
    SATURN_ROTATION_DEG_PER_DAY,
    TETHYS_ORBIT_RADIUS,
    NEPTUNE_POLE_DEC_DEG,
    NEPTUNE_POLE_RA_DEG,
    PLUTO_POLE_DEC_DEG,
    PLUTO_POLE_RA_DEG,
    PLUTO_PRIME_MERIDIAN_DEG,
    PLUTO_ROTATION_DEG_PER_DAY,
    NEPTUNE_PRIME_MERIDIAN_DEG,
    NEPTUNE_ROTATION_DEG_PER_DAY,
    TITAN_ORBIT_RADIUS,
    URANUS_POLE_DEC_DEG,
    URANUS_POLE_RA_DEG,
    URANUS_PRIME_MERIDIAN_DEG,
    URANUS_ROTATION_DEG_PER_DAY,
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
// All four planets below run through exactly the same code. Nothing in it imposes an
// obliquity, a period, a distance or a resonance; all of that falls out of the
// elements and the pole. Checked against JPL Horizons over 2000-2030 (997 samples
// each):
//
//                            Mars                Venus                Mercury
//   heliocentric position    16,000 km, 0.006°   14,000 km, 0.0074°   6,400 km, 0.0079°
//   perihelion / aphelion    1.3814 / 1.6661     0.71844 / 0.72823    0.30750 / 0.46670 AU
//     Horizons               1.3814 / 1.6660     0.71840 / 0.72825    0.30749 / 0.46670
//   sidereal period          686.98 d            224.70080 d          87.96926 d
//     Horizons               686.98              224.70080            87.969257
//   orbital inclination      1.848° (1.850°)     3.3946° (3.3946°)    7.0041° (7.0050°)
//   obliquity to its orbit   25.188° (25.19°)    177.36° (177.3°)     0.0344° (0.0352°)
//   sidereal rotation        1.026 d (1.026)     243.01848 (243.0185) 58.64615 (58.6463)
//
// Jupiter is the one exception, and it is worth knowing which way:
//
//                            Jupiter
//   heliocentric position    661,000 km, 0.044° RMS (max 0.086°)
//   perihelion / aphelion    4.95121 / 5.45459 AU   (Horizons 4.95156 / 5.45492)
//   sidereal period          4332.82 d              (Horizons 4332.589)
//   obliquity to its orbit   3.120°                 (published 3.13°)
//
// 0.044° is seven times the inner planets' residual, and it is not a transcription
// error — it is the **Jupiter-Saturn great inequality**. The two are close to a 5:2
// commensurability, which pumps a term of ~0.33° amplitude into Jupiter's longitude
// with an 883-year period. Standish's table is a single Keplerian fit across
// 1800-2050, so it averages that term out and leaves a slowly varying remainder at any
// one epoch. Carrying JPL's own correction terms for it (Table 2b's b, c, s, f) was
// tried and moves the RMS to 0.037° while making the worst case worse, which is not a
// trade worth a special case in `keplerianPosition`.
//
// It is also still four times smaller than the constant 0.373° frame offset the whole
// scene already carries (see below), so chasing it further would be false precision of
// exactly the kind the Mercury libration note rejects.
//
// Uranus is the control that confirms the diagnosis, and it is worth reading next to
// Saturn's:
//
//                            Saturn                 Uranus                 Neptune
//   heliocentric position    0.097° RMS (max 0.155) 0.018° (max 0.032°)    0.011° (max 0.017°)
//   perihelion / aphelion    9.023 / 10.049 AU      18.283 / 20.096        29.811 / 30.328
//     Horizons               9.031 / 10.066         18.284 / 20.099        29.806 / 30.332
//   sidereal period          10755.7 d              30687.4 d              60189.7 d (60189)
//   obliquity to its orbit   26.73°                 97.770° (pub. 97.77)   28.318° (28.32)
//   sidereal rotation        10h 39m                17.240 h (17.24)       15.966 h — see below
//
// If the residual grew with distance, Uranus at twice Saturn's range would be worse
// again, and Neptune at three times worse still. Both are several times *better* — back
// down near the inner planets' figures — because neither is in the 5:2 commensurability
// Jupiter and Saturn share, so nothing is pumping an 883-year term into their longitudes
// for Standish's single fit to average away. Four bodies, one unmodelled resonance, and
// only the two bodies actually in it are affected. Don't chase the other two toward these.
//
// Neptune's rotation figure is not a typo and not the number the fact sheets print: the
// IAU replaced Voyager's 16.11 h magnetic period with Karkoschka's 15.966 h optical one
// in 2015. See `NEPTUNE_ROTATION_DEG_PER_DAY`, which carries the whole story.
//
// Mercury additionally lands its 3:2 spin-orbit resonance without being told about
// it: three rotations come to 175.938 days against two orbits' 175.939, from a
// rotation rate and an orbital period that were taken from two unrelated sources.
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

/**
 * J2000 equatorial → scene, i.e. tilt down by the obliquity, then re-axis as above.
 *
 * Exported because it is not only planetary poles that arrive in equatorial
 * coordinates: a star catalogue quotes right ascension and declination, and
 * `background/betelgeuse.ts` has to land in the same frame the poles do.
 * Mutates and returns `v`.
 */
export function equatorialToScene(v: Vector3): Vector3 {
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
 * The inclination is the interesting one: at 3.39° it is the second steepest of the
 * planets, behind only Mercury below, and it is why Venus mostly passes above or
 * below the Sun at inferior conjunction instead of transiting it. Transits come only
 * when the alignment happens near a node — hence the famous 8/121.5/8/105.5-year
 * pattern.
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
 * Mercury's, again from the same table — and the orbit that makes the strongest case
 * for solving Kepler's equation rather than drawing a circle.
 *
 * The eccentricity of 0.2056 is easily the largest of any planet: Mercury runs from
 * 0.307 AU at perihelion out to 0.467, so its distance from the Sun varies by half
 * again over a single 88-day year. A circle would be wrong by 0.08 AU — nearly 2,000
 * scene units — twice per orbit. The inclination of 7.00° is likewise the steepest of
 * the planets, which is why Mercury's path visibly rides above and below the others'
 * when the orbit paths are switched on.
 *
 * One thing worth knowing about what this does *not* contain. Mercury's perihelion
 * advances by 574 arcseconds a century, and 43 of those are famously unexplainable by
 * Newtonian gravity — the anomaly that general relativity resolved. There is no
 * relativity anywhere in this file, and there does not need to be: `perihelionLongitude`
 * below is an *observed* rate, fitted to where Mercury actually goes, so the full 574
 * is already in the 0.16047689°/century figure. The scene reproduces the precession
 * that broke Newton without knowing why it happens.
 */
const MERCURY_ELEMENTS: OrbitalElements = {
    semiMajorAxis: [0.38709927, 0.00000037],
    eccentricity: [0.20563593, 0.00001906],
    inclination: [7.00497902, -0.00594749],
    meanLongitude: [252.25032350, 149472.67411175],
    perihelionLongitude: [77.45779628, 0.16047689],
    ascendingNode: [48.33076593, -0.12534081],
};

/**
 * Jupiter's, from the same table, and the one orbit here whose *scale* is the point.
 *
 * At 5.2 AU Jupiter is more than three times as far out as Mars, so the whole inner
 * system — every other body in this scene — fits inside a third of this orbit. That is
 * what makes it the first body here you cannot frame together with Earth at any useful
 * size, and why `SYSTEM_VIEW_DISTANCE` in script.ts had to move out to accommodate it.
 *
 * The eccentricity of 0.0485 is modest but the orbit is so large that it still swings
 * Jupiter 0.5 AU — some 11,800 scene units — between perihelion and aphelion, which is
 * half the radius of Earth's entire orbit.
 */
const JUPITER_ELEMENTS: OrbitalElements = {
    semiMajorAxis: [5.20288700, -0.00011607],
    eccentricity: [0.04838624, -0.00013253],
    inclination: [1.30439695, -0.00183714],
    meanLongitude: [34.39644051, 3034.74612775],
    perihelionLongitude: [14.72847983, 0.21252668],
    ascendingNode: [100.47390909, 0.20469106],
};

/**
 * Saturn's, from the same table, and the orbit that changes what "the solar system"
 * means in this scene for the second time.
 *
 * Jupiter's arrival put every previous body inside a third of one orbit's radius.
 * Saturn is 1.83 times further out again, so it now encloses *Jupiter's* orbit with the
 * same margin to spare — and the pattern is the point: from Mercury out, each orbit is
 * roughly half again the last, so the diagram is logarithmic and no linear framing ever
 * shows two neighbours well at once.
 *
 * The eccentricity of 0.0539 is the largest of the four outer bodies here and swings
 * Saturn a full AU — 24,000 scene units, more than the whole radius of Earth's orbit —
 * between perihelion at 9.03 AU and aphelion at 10.07.
 */
const SATURN_ELEMENTS: OrbitalElements = {
    semiMajorAxis: [9.53667594, -0.00125060],
    eccentricity: [0.05386179, -0.00050991],
    inclination: [2.48599187, 0.00193609],
    meanLongitude: [49.95424423, 1222.49362201],
    perihelionLongitude: [92.59887831, -0.41897216],
    ascendingNode: [113.66242448, -0.28867794],
};

/**
 * Uranus's, from the same table, and the orbit that stops the doubling being a curve
 * and makes it a fact.
 *
 * Every previous arrival has enclosed its predecessor with room to spare — Jupiter put
 * the inner four inside a third of its radius, Saturn did the same to Jupiter. Uranus is
 * 2.01 times Saturn's again, so *the entire scene as it stood* now fits inside half of
 * this one orbit. That is the sixth term of a sequence with no bend in it, and it is why
 * `SYSTEM_VIEW_DISTANCE` doubled rather than being nudged.
 *
 * The eccentricity of 0.0473 is the smallest of the four outer bodies here, and still
 * the largest swing in absolute terms in the scene: perihelion 18.28 AU, aphelion 20.10,
 * a range of 1.81 AU — 42,600 scene units, nearly twice the radius of Earth's whole
 * orbit. That is what an eccentricity of five percent buys you this far out.
 *
 * Checked against Horizons over 2000-2030, 997 samples, and the residuals sit where the
 * others predict they should: 0.018° RMS, worse than the inner planets' 0.006° and
 * better than Jupiter's 0.044° and Saturn's 0.097°. Those two are pulled out by the
 * great inequality they share with each other (see the header above); Uranus is not in
 * that resonance, so it falls back toward the table's own accuracy rather than
 * continuing the trend outward. It is the control that shows the Jupiter/Saturn gap is
 * a real physical term and not the fit degrading with distance.
 */
const URANUS_ELEMENTS: OrbitalElements = {
    semiMajorAxis: [19.18916464, -0.00196176],
    eccentricity: [0.04725744, -0.00004397],
    inclination: [0.77263783, -0.00242939],
    meanLongitude: [313.23810451, 428.48202785],
    perihelionLongitude: [170.95427630, 0.40805281],
    ascendingNode: [74.01692503, 0.04240589],
};

/**
 * Neptune's, from the same table, and the last orbit this scene will get.
 *
 * The doubling finally stops — 30.07 AU against Uranus's 19.19 is 1.57, the smallest
 * step since Mars to Jupiter, and the two ice giants are neighbours in a way none of the
 * other pairs are. Everything else about them is a near-match too: 3.87 units of radius
 * against 3.98, 17.1 Earth masses against 14.5, the same hydrogen and helium over the
 * same water-ammonia-methane mantle. They are the same planet built twice.
 *
 * The eccentricity of 0.0086 is the second roundest orbit of any planet, behind only
 * Venus's 0.0068. Over 30.07 AU it is still worth 0.52 AU — some 12,100 scene units,
 * half the radius of Earth's entire orbit — between perihelion and aphelion.
 *
 * Checked against Horizons over 2000-2030, 997 samples: **0.011° RMS, max 0.017°** —
 * the best of the outer planets and on a par with the inner ones, which is the second
 * confirmation of the point Uranus makes. Jupiter's 0.044° and Saturn's 0.097° are the
 * great inequality those two share with each other; the two bodies outside it are fine.
 */
const NEPTUNE_ELEMENTS: OrbitalElements = {
    semiMajorAxis: [30.06992276, 0.00026291],
    eccentricity: [0.00859048, 0.00005105],
    inclination: [1.77004347, 0.00035372],
    meanLongitude: [-55.12002969, 218.45945325],
    perihelionLongitude: [44.96476227, -0.32241464],
    ascendingNode: [131.78422574, -0.00508664],
};

/**
 * Pluto's, and the one set in this file that is **not** fitted here.
 *
 * Every other body's elements were fitted against JPL's ephemeris and then run back
 * against Horizons over 2000-2030, with the residuals recorded beside them. These are
 * taken from Standish's published 1800-2050 table as printed, because the fitting rig
 * needs a network Horizons query and none was available when this was added. **So there
 * is no residual figure here, and one must not be invented.** Anyone with a Horizons
 * query to hand should run the same check the other seven carry and write the answer in.
 *
 * What *can* be checked without a network is the physics, and it is a stronger test than
 * a residual anyway — see `plutoNeptuneResonance` below.
 *
 * Three of these numbers are unlike anything else in the file:
 *
 *  - **e = 0.2488**, the largest here by a distance; Mercury's 0.2056 is next and every
 *    planet outside Mars is under 0.06. It carries Pluto from 29.66 AU at perihelion to
 *    49.31 at aphelion, a swing of two thirds of its own mean distance.
 *  - **I = 17.14°**, six times any planet's. Pluto spends most of its orbit well clear
 *    of the plane everything else here moves in, and the wide view shows it.
 *  - **Perihelion inside Neptune's orbit.** 29.66 AU against Neptune's 30.07, so the
 *    orbits genuinely cross — Pluto was nearer the Sun than Neptune from 1979 to 1999.
 *    They cannot collide, and the reason is the resonance rather than luck or the
 *    inclination.
 */
const PLUTO_ELEMENTS: OrbitalElements = {
    semiMajorAxis: [39.48211675, -0.00031596],
    eccentricity: [0.24882730, 0.00005170],
    inclination: [17.14001206, 0.00004818],
    meanLongitude: [238.92903833, 145.20780515],
    perihelionLongitude: [224.06891629, -0.04062942],
    ascendingNode: [110.30393684, -0.01183482],
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

export const mercuryOrbitPosition = (date: Date, target = new Vector3()): Vector3 =>
    keplerianPosition(MERCURY_ELEMENTS, date, target);

export const jupiterOrbitPosition = (date: Date, target = new Vector3()): Vector3 =>
    keplerianPosition(JUPITER_ELEMENTS, date, target);

export const saturnOrbitPosition = (date: Date, target = new Vector3()): Vector3 =>
    keplerianPosition(SATURN_ELEMENTS, date, target);

export const uranusOrbitPosition = (date: Date, target = new Vector3()): Vector3 =>
    keplerianPosition(URANUS_ELEMENTS, date, target);

export const neptuneOrbitPosition = (date: Date, target = new Vector3()): Vector3 =>
    keplerianPosition(NEPTUNE_ELEMENTS, date, target);

/**
 * Pluto's, and note what this positions: the **Pluto system barycentre**, not Pluto.
 *
 * That distinction is meaningless for every other body here and is the whole point of
 * this one. Standish's elements are barycentric, as is Horizons' body 9 against its body
 * 999, because a two-body pair of comparable mass has no single position — what follows
 * a Keplerian orbit around the Sun is the centre of mass. Pluto then goes round *that*,
 * 2,126 km away, which is outside its own surface.
 */
export const plutoOrbitPosition = (date: Date, target = new Vector3()): Vector3 =>
    keplerianPosition(PLUTO_ELEMENTS, date, target);

/**
 * The 3:2 resonance with Neptune, evaluated rather than asserted.
 *
 * This is the check that replaces the Horizons residual the elements above do not have,
 * and it is a better one: a residual says a transcription was copied correctly, while
 * this says the numbers describe the solar system. It also follows the pattern the
 * Laplace resonance and Enceladus-Dione already set in this file — take mean motions
 * fitted from unrelated sources and see whether the resonant argument closes.
 *
 * Pluto goes round twice for Neptune's three. The consequence is not a curiosity: the
 * two orbits *cross*, and the resonance is the only reason that is survivable. The
 * resonant argument φ = 3λ_P − 2λ_N − ϖ_P librates about 180°, which forces Pluto to
 * reach perihelion — the part of its orbit inside Neptune's — only when Neptune is a
 * quarter of the sky away. The two have never come within 17 AU of each other and
 * cannot; Pluto passes closer to Uranus than it ever does to Neptune.
 *
 * φ̇ in degrees per day, and it is deliberately **not** compared against zero. A
 * librating argument drifts by definition; what makes this a resonance rather than a
 * near miss is that the drift is tiny next to the mean motions it is built from, so the
 * argument turns through a slow cycle instead of circulating. The raw period ratio is
 * 1.5046, which reads like a near miss and is not one.
 *
 * A constant rather than a function of date, because these elements carry linear rates
 * and the three of them therefore give one number for all time. Exported so the check
 * script can state it rather than restating the arithmetic.
 */
export const PLUTO_NEPTUNE_RESONANCE_DRIFT =
    (3 * PLUTO_ELEMENTS.meanLongitude[1] -
        2 * NEPTUNE_ELEMENTS.meanLongitude[1] -
        PLUTO_ELEMENTS.perihelionLongitude[1]) /
    36525;

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
 * Mercury's pole is within 0.03° of its own orbit normal — the most upright planet
 * there is, so this node leans by almost nothing. It still has to exist and still has
 * to be built the same way: the axis is upright relative to *Mercury's* orbit, which
 * is itself tipped 7° to the ecliptic this scene is laid out in.
 */
export const MERCURY_AXIS_ORIENTATION = axisOrientationFromPole(
    MERCURY_POLE_RA_DEG,
    MERCURY_POLE_DEC_DEG
);

/**
 * Jupiter's pole leans 3.12° from its own orbit normal — a third of Earth's tilt, and
 * the reason its weather owes nothing to seasons.
 *
 * This node does more work than the other planets', because four moons hang off it.
 * Their orbits are ruled by Jupiter's equatorial bulge rather than by the Sun (see the
 * Galilean section below), so they inherit this lean the way Phobos and Deimos inherit
 * Mars's — and unlike Mars's pair, they are big enough and far enough apart to watch
 * doing it.
 */
export const JUPITER_AXIS_ORIENTATION = axisOrientationFromPole(
    JUPITER_POLE_RA_DEG,
    JUPITER_POLE_DEC_DEG
);

/**
 * Saturn's, and the one axis node in this scene that you can *see*.
 *
 * Every other planet's tilt has to be inferred from where its terminator falls or how
 * its poles catch the light. Saturn's is drawn across the sky by the rings, which lie
 * in the equatorial plane this node defines: the ring plane's opening angle as seen
 * from Earth is a direct read-out of the 26.73° lean, and it is fixed in space here for
 * exactly the same reason Earth's is — set once, never touched, so it holds its
 * direction while the planet goes round. That is what produces the 29½-year cycle of
 * the rings opening, closing and vanishing edge-on, and none of it is scripted.
 *
 * Seven moons hang off this node as well, for the reason Jupiter's four and Mars's two
 * do: they are deep in the oblateness of the most oblate planet there is, so their
 * orbits are ruled by the equatorial bulge and not by the Sun.
 */
export const SATURN_AXIS_ORIENTATION = axisOrientationFromPole(
    SATURN_POLE_RA_DEG,
    SATURN_POLE_DEC_DEG
);

/**
 * Uranus's, and the node that does the most work of any of them for the least code.
 *
 * It is built from a pole direction exactly like the other five and it is set once and
 * never touched exactly like the other five, and out of that comes a planet lying 97.77°
 * over — the one genuinely bizarre orientation in the solar system, tipped past its own
 * side so that it rolls along its orbit. There is no obliquity term anywhere here, no
 * branch for it, and no mention of the figure outside a comment.
 *
 * What it buys is worth watching for rather than reading about. Because the axis holds
 * a fixed direction in space while the planet goes round, each pole spends about 42
 * years pointed at the Sun and 42 in the dark, and at the equinox the Sun swings back
 * across the equator — 2007 last time, 2049 next. Wind the clock to "10 d/s" and you can
 * watch the terminator go from a ring around the sub-solar pole to a line through the
 * middle of the disc and back, which is the same mechanism producing Earth's seasons
 * and Saturn's rings opening, taken to its limit.
 *
 * The declination below is negative and the pole nonetheless sits 7.7° *north* of the
 * ecliptic; see the constant, which explains why that is the IAU being consistent
 * rather than a transcription error.
 */
export const URANUS_AXIS_ORIENTATION = axisOrientationFromPole(
    URANUS_POLE_RA_DEG,
    URANUS_POLE_DEC_DEG
);

/**
 * Neptune's, and the one axis node here built from a pole that is not actually constant.
 *
 * The IAU's published pole for Neptune carries periodic terms — see the constants, which
 * give the full model and the 688-year cycle behind it. This node takes that model
 * evaluated at J2000 and then does what every other one does: sits still. The cost was
 * measured, not waved through, and it is 0.037° of sub-Earth longitude across 2000-2030,
 * a tenth of the precession offset the whole scene already carries.
 *
 * The lean is 28.32°, the largest of any planet here bar none — a shade over Saturn's
 * 26.73° and Earth's 23.44°. So after Uranus lying on its side, the outermost planet
 * turns out to have seasons of an entirely familiar shape, only 41 years long each.
 */
/**
 * Pluto's, and it lies over past its side like Uranus's.
 *
 * The obliquity is stated nowhere here, exactly as Uranus's is not: it is the angle
 * between this pole and the orbit normal `PLUTO_ELEMENTS` implies, and it comes out
 * obtuse — so Pluto turns backwards relative to its own orbit while
 * `PLUTO_ROTATION_DEG_PER_DAY` stays positive. That is the same one sign that makes
 * Venus and Uranus retrograde, and nothing branches on it for any of the three.
 *
 */
export const PLUTO_AXIS_ORIENTATION = axisOrientationFromPole(
    PLUTO_POLE_RA_DEG,
    PLUTO_POLE_DEC_DEG
);

export const NEPTUNE_AXIS_ORIENTATION = axisOrientationFromPole(
    NEPTUNE_POLE_RA_DEG,
    NEPTUNE_POLE_DEC_DEG
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
 * Mercury's, with one term of the IAU model deliberately left out.
 *
 * The published elements carry five sine terms for the physical libration — Mercury's
 * slightly out-of-round figure gets torqued back and forth by the Sun as its distance
 * swings over that very eccentric orbit, so it rocks a little about its mean
 * rotation. It is a real effect and a direct consequence of the 3:2 resonance, so it
 * was tempting. It peaks at 0.0107°.
 *
 * That is thirty-five times smaller than the constant 0.373° frame offset this scene
 * already carries (see the header above), which makes carrying it false precision:
 * five sine calls a frame to refine a number buried under an error many times its
 * size. Checked rather than assumed — including it moves the sub-Earth longitude
 * residual from 0.0488° to 0.0446°, and both figures are themselves mostly light
 * time, which nothing in this scene corrects for either.
 */
export const mercurySpinAngle = (date: Date): number =>
    primeMeridianAngle(MERCURY_PRIME_MERIDIAN_DEG, MERCURY_ROTATION_DEG_PER_DAY, date);

/**
 * Jupiter's, in System III — the magnetic rotation, and the only one that is the
 * planet's rather than its weather's. See the constant for why the visible cloud decks
 * cannot be used to define a meridian.
 *
 * At 870.5°/day this is by far the fastest thing in the scene: two and a half turns per
 * Earth day, fast enough to watch at the "1 hr/s" setting.
 */
export const jupiterSpinAngle = (date: Date): number =>
    primeMeridianAngle(JUPITER_PRIME_MERIDIAN_DEG, JUPITER_ROTATION_DEG_PER_DAY, date);

/**
 * Saturn's, in System III — with the caveat, recorded on the constant, that Saturn's
 * magnetic field is so nearly axisymmetric that its own rotation period is genuinely
 * unsettled by several minutes. This is the IAU's number, not a measurement anyone is
 * confident in.
 */
export const saturnSpinAngle = (date: Date): number =>
    primeMeridianAngle(SATURN_PRIME_MERIDIAN_DEG, SATURN_ROTATION_DEG_PER_DAY, date);

/**
 * Uranus's, in System III, and the one rotation model here that rests on a single
 * five-day measurement from forty years ago — Voyager 2's flyby in January 1986 is the
 * only time anything has been close enough to read the field, and nothing is going back.
 *
 * The rate is negative, which is the whole of what makes Uranus turn backwards in this
 * scene. It is the same one line Venus runs through, and neither needed a special case;
 * `primeMeridianAngle` has never known which way any of these bodies goes.
 *
 * Verified end to end rather than transcribed: fed Horizons' own Earth-Uranus vectors,
 * this model reproduces Horizons' sub-Earth longitude to a mean of 0.011° with 0.017° of
 * spread over 2000-2030, once two things the scene deliberately does not model are taken
 * out — the ~2.7 hours of light time (55° of Uranus's rotation, and nothing here
 * corrects for it) and the ~69 s between the UTC the simulation runs on and the TDB the
 * elements are defined in (0.40°, against Mars's 0.28° noted above).
 */
export const uranusSpinAngle = (date: Date): number =>
    primeMeridianAngle(URANUS_PRIME_MERIDIAN_DEG, URANUS_ROTATION_DEG_PER_DAY, date);

/**
 * Neptune's — and the one prime meridian in this project that is **not** System III.
 *
 * Jupiter's, Saturn's and Uranus's are all magnetic rotations, because a gas giant has
 * no surface to time and the visible cloud decks shear past one another. Neptune's
 * shears worse than any of them: it has the fastest winds in the solar system, near
 * 580 m/s, and its equator laps its mid-latitudes so hard that no cloud feature was
 * expected to survive long enough to time anything by. Two did. See the constant — the
 * rate here is Karkoschka's optical period, 15.966 h, which the IAU adopted in 2015 in
 * place of Voyager's 16.11 h radio period, and which is why the number below does not
 * match the one every fact sheet prints.
 */
export const neptuneSpinAngle = (date: Date): number =>
    primeMeridianAngle(NEPTUNE_PRIME_MERIDIAN_DEG, NEPTUNE_ROTATION_DEG_PER_DAY, date);

/**
 * Pluto's prime meridian — and the one in this project that is defined by something
 * other than the body it belongs to.
 *
 * The IAU fixes Pluto's 0° meridian as **the mean sub-Charon meridian**: the longitude
 * that faces its moon. No other body here has its coordinate system anchored to a
 * second object, and that it was worth doing for this one is itself the measurement —
 * the pair are locked hard enough that "the side facing Charon" is a permanent feature
 * of Pluto rather than a moment in its day.
 *
 * Charon is not modelled, so nothing in the scene points at that meridian any more. It
 * is still the frame these numbers are quoted in, and it is still why `pluto.ts` places
 * Sputnik Planitia at longitude 178 — which is very nearly the anti-Charon point, and
 * not by accident. See the note there.
 */
export const plutoSpinAngle = (date: Date): number =>
    primeMeridianAngle(PLUTO_PRIME_MERIDIAN_DEG, PLUTO_ROTATION_DEG_PER_DAY, date);


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

/** A planet's own north in its own equatorial frame — the same for every planet. */
const PLANET_NORTH = new Vector3(0, 1, 0);
const MARS_AXIS_INVERSE = MARS_AXIS_ORIENTATION.clone().invert();
const JUPITER_AXIS_INVERSE = JUPITER_AXIS_ORIENTATION.clone().invert();

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
    /**
     * A sinusoid added to the mean longitude — the one term here that is not a
     * two-body element, and the only one any moon in this scene has needed.
     *
     * Everything else in this interface describes a body going round a point mass on an
     * ellipse that slowly turns. Mimas is not doing that: it is locked to Tethys in a
     * 4:2 resonance, and the resonant argument *librates* rather than holding still, so
     * Mimas swings tens of degrees back and forth along its own orbit over decades. A
     * precessing ellipse has nowhere to put that, and leaving it out costs 6.7° RMS —
     * thirty times the worst residual of any other moon in the file, and easily visible.
     *
     * So it goes in explicitly. Two moons carry one: Mimas, and Tethys, which is the
     * other half of the same resonance and shows the same signal an order of magnitude
     * smaller, in the ratio the two masses lead you to expect. Nothing else in this
     * project wants it and nothing else sets it.
     *
     * The period is *fitted over 2000–2030 alongside everything else*, and is not a
     * measurement of the resonance's true libration period. A thirty-year arc covers
     * under half a cycle of a ~70-year libration, so what comes out is the effective
     * single tone that best reproduces JPL's ephemeris over the window this file is
     * checked against — pinning it to the published 70.6 years instead makes Mimas nine
     * times worse.
     */
    librationAmplitudeDeg?: number;
    librationPeriodDays?: number;
    librationPhaseDeg?: number;
}

interface Satellite extends SatelliteElements {
    /** All three in the host planet's own equatorial frame, i.e. its axis node's
     *  local space. */
    laplacePole: Vector3;
    laplaceX: Vector3;
    laplaceZ: Vector3;
    inclination: number;
}

/** A fixed J2000 equatorial direction, re-expressed in a planet's equatorial frame. */
function planetFrameDirection(raDeg: number, decDeg: number, axisInverse: Quaternion): Vector3 {
    const ra = raDeg * DEG;
    const dec = decDeg * DEG;
    return equatorialToScene(
        new Vector3(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec))
    ).applyQuaternion(axisInverse);
}

function defineSatellite(elements: SatelliteElements, axisInverse: Quaternion): Satellite {
    const laplacePole = planetFrameDirection(
        elements.laplacePoleRaDeg,
        elements.laplacePoleDecDeg,
        axisInverse
    );

    // A fixed reference direction inside the Laplace plane to measure the node from:
    // its own ascending node on the planet's equator. Phobos's Laplace plane is only
    // 0.01° off the equator, and Io's is closer still, so these two are very nearly
    // parallel and the cross product is small — but it is never zero, and normalising
    // it is exact at double precision.
    const laplaceX = new Vector3().crossVectors(PLANET_NORTH, laplacePole).normalize();
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
}, MARS_AXIS_INVERSE);

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
}, MARS_AXIS_INVERSE);

// ---------------------------------------------------------------------------
// The Galilean moons
//
// Structurally identical to Phobos and Deimos — deep inside their planet's gravity
// well, ruled by its equatorial bulge rather than by the Sun, so each settles on its
// own local Laplace plane and precesses around it. They run through the same
// `satelliteState` unchanged. What is different is that these are worlds: Ganymede is
// wider than Mercury, and all four are comfortably larger than Pluto.
//
// Elements fitted to JPL's JUP365 ephemeris over 2000-2030, in the frame this scene
// actually uses (Jupiter's equator, `eclipticDirection` handedness), so they drop
// straight in with no convention shim. Compared against published values, none of
// which the fit was given:
//
//                          fitted           published
//   Io       a             421,766 km       421,800
//            e             0.004105         0.0041
//            i (Laplace)   0.0367°          0.036° (to Jupiter's equator)
//            period        1.76913776 d     1.769137786
//   Europa   a             671,061 km       671,100
//            e             0.008996         0.0094
//            i             0.4718°          0.466°
//            period        3.55118104 d     3.551181041
//   Ganymede a             1,070,430 km     1,070,400
//            e             0.001856         0.0013
//            period        7.15455322 d     7.15455296
//   Callisto a             1,882,744 km     1,882,700
//            e             0.007299         0.0074
//            period        16.68901698 d    16.6890184
//
// Run back against Horizons over the whole 2000-2030 span, the model stays within:
//
//              RMS      max angle    max distance   (of its own orbit radius)
//   Io         0.013°   0.030°         218 km        0.05%
//   Europa     0.059°   0.148°       1,730 km        0.26%
//   Ganymede   0.055°   0.136°       2,551 km        0.24%
//   Callisto   0.023°   0.049°       1,610 km        0.09%
//
// — around a quarter of the angular error the Martian pair carry, which is what a
// precessing ellipse can manage before the unmodelled part (chiefly the libration of
// the resonance below) sets the floor.
//
// **The Laplace resonance is not in this file.** Io, Europa and Ganymede are locked
// 4:2:1, the only three-body mean-motion resonance in the solar system, and it is why
// Io is the most volcanically active body there is: being held eccentric by the other
// two is what kneads its interior. The three mean motions below were fitted from three
// separate ephemeris files with no knowledge of each other, and come to
//
//     n_Io − 3·n_Europa + 2·n_Ganymede = −1.0×10⁻⁶ °/day
//
// which is five parts in a billion of Io's own mean motion. Like Mercury's 3:2, the
// resonance is a result here rather than an input. The apsidal rates say the same
// thing twice over: Io's and Europa's come out at −0.7395070 and −0.7395126 °/day,
// locked to each other to six figures, from independent fits.
//
// The Laplace *planes* also show the physics changing with distance. Io's and Europa's
// poles land within 0.04° of Jupiter's own — that deep in the bulge, the equator is
// the only plane that matters. Callisto, four times further out, has its plane dragged
// 0.29° toward Jupiter's orbit by the Sun, which is most of its inclination.
// ---------------------------------------------------------------------------

export const IO = defineSatellite({
    laplacePoleRaDeg: 268.0604,
    laplacePoleDecDeg: 64.4961,
    semiMajorAxis: IO_ORBIT_RADIUS,
    // Tiny, and *maintained* rather than left over: tides would have circularised this
    // long ago if Europa and Ganymede were not pumping it. That forced eccentricity is
    // the entire energy source for 400 active volcanoes.
    eccentricity: 0.004105,
    inclinationDeg: 0.0367,
    nodeJ2000Deg: 145.6437,
    nodeRateDegPerDay: -0.1331632,
    periapsisJ2000Deg: 292.4557,
    periapsisRateDegPerDay: -0.7395070,
    meanLongitudeJ2000Deg: 263.3557,
    // 203.5°/day — Io gets round Jupiter in 42 hours, fast enough to watch at "1 hr/s".
    meanMotionDegPerDay: 203.4889584,
}, JUPITER_AXIS_INVERSE);

export const EUROPA = defineSatellite({
    laplacePoleRaDeg: 268.0924,
    laplacePoleDecDeg: 64.4886,
    semiMajorAxis: EUROPA_ORBIT_RADIUS,
    eccentricity: 0.008996,
    inclinationDeg: 0.4718,
    nodeJ2000Deg: 116.2129,
    nodeRateDegPerDay: -0.0323622,
    periapsisJ2000Deg: 162.5295,
    // Matching Io's to six figures — see the resonance note above.
    periapsisRateDegPerDay: -0.7395126,
    meanLongitudeJ2000Deg: 147.9470,
    meanMotionDegPerDay: 101.3747247,
}, JUPITER_AXIS_INVERSE);

export const GANYMEDE = defineSatellite({
    laplacePoleRaDeg: 268.0437,
    laplacePoleDecDeg: 64.6528,
    semiMajorAxis: GANYMEDE_ORBIT_RADIUS,
    eccentricity: 0.001856,
    inclinationDeg: 0.2879,
    nodeJ2000Deg: 219.3316,
    nodeRateDegPerDay: -0.0039058,
    periapsisJ2000Deg: 103.8002,
    periapsisRateDegPerDay: 0.0056659,
    meanLongitudeJ2000Deg: 39.7720,
    meanMotionDegPerDay: 50.3176074,
}, JUPITER_AXIS_INVERSE);

export const CALLISTO = defineSatellite({
    laplacePoleRaDeg: 268.2807,
    laplacePoleDecDeg: 64.7251,
    semiMajorAxis: CALLISTO_ORBIT_RADIUS,
    eccentricity: 0.007299,
    // The smallest figure of the four against its *own* Laplace plane, which is the
    // opposite of how it is usually quoted: Callisto's 0.28° to Jupiter's equator is
    // almost entirely the plane's own tilt, not the orbit's tilt within it.
    inclinationDeg: 0.0413,
    nodeJ2000Deg: 173.3664,
    nodeRateDegPerDay: -0.0110241,
    periapsisJ2000Deg: 197.4029,
    periapsisRateDegPerDay: 0.0017987,
    meanLongitudeJ2000Deg: 283.5599,
    // The one Galilean *outside* the resonance, and the only one not tidally heated
    // into activity because of it — which is why it still wears a four-billion-year-old
    // surface while Io repaves itself.
    meanMotionDegPerDay: 21.5710728,
}, JUPITER_AXIS_INVERSE);

// ---------------------------------------------------------------------------
// The seven major Saturnian moons
//
// The same `satelliteState` a third time, for the same structural reason: all seven are
// deep inside the oblateness of the most oblate planet there is, so their orbits are
// ruled by Saturn's equatorial bulge rather than by the Sun, and they hang off the
// *axis* node. All seven are tidally locked, so the same call that places them aims
// them.
//
// Elements fitted to JPL's SAT441 ephemeris over 2000-2030, in the frame this scene
// uses (Saturn's equator, `eclipticDirection` handedness), so they drop straight in.
// Compared against JPL's published mean elements, none of which the fit was given:
//
//                        fitted           published
//   Mimas      a         185,536 km       186,000
//              e         0.019663         0.020
//              i         1.5677°          1.6°
//              period    0.94242674 d     0.942422
//   Enceladus  a         238,034 km       238,400
//              e         0.004728         0.005
//              period    1.37021815 d     1.370218
//   Tethys     a         294,673 km       295,000
//              i         1.0909°          1.1°
//              period    1.88780305 d     1.887802
//   Dione      a         377,415 km       377,700
//              e         0.002193         0.002
//              period    2.73691555 d     2.736916
//   Rhea       a         527,068 km       527,200
//              i         0.3318°          0.3°
//              period    4.51750274 d     4.517503
//   Titan      a         1,221,865 km     1,221,900
//              e         0.028701         0.029
//              i         0.3451°          0.3°
//              period    15.94544735 d    15.945448
//   Iapetus    a         3,560,840 km     3,561,700
//              e         0.028409         0.028
//              i         7.5743°          7.6°
//              period    79.33089448 d    79.331002
//
// Run back against Horizons over the whole 2000-2030 span:
//
//              RMS      max angle    max distance   (of its own orbit radius)
//   Mimas      0.210°   0.686°       2,206 km       1.19%
//   Enceladus  0.229°   0.429°       1,787 km       0.75%
//   Tethys     0.019°   0.056°         292 km       0.10%
//   Dione      0.022°   0.052°         341 km       0.09%
//   Rhea       0.011°   0.032°         293 km       0.06%
//   Titan      0.016°   0.033°         674 km       0.06%
//   Iapetus    0.059°   0.115°       7,079 km       0.20%
//
// **The Enceladus-Dione 2:1 resonance is not in this file.** Enceladus goes round twice
// for each of Dione's orbits, and being held eccentric by it is the entire power source
// for the south-polar jets — the plumes that feed the E ring, and the reason Enceladus
// is the most reflective body in the solar system and one of two places anywhere with a
// confirmed liquid-water ocean venting into space. The resonance condition is
//
//     2·n_Dione − n_Enceladus − ϖ̇_Enceladus = +6.3×10⁻⁵ °/day
//
// which is 2.4×10⁻⁷ of Enceladus's own mean motion. The two mean motions and the apsidal
// rate were fitted from separate ephemeris queries with no knowledge of each other, so
// like Mercury's 3:2 and Jupiter's Laplace resonance, this is a result rather than an
// input. Note that it only closes when the apsidal precession is carried: the raw period
// ratio is 1.99743, which looks like a *near* miss and is in fact exact.
//
// The Mimas-Tethys 4:2 is the one exception to that rule, and the only place in this
// project where a resonance had to be put in by hand — see `librationAmplitudeDeg`.
// Its argument closes to 9.5×10⁻⁶ of Mimas's mean motion on the fitted rates, but the
// *libration about* it is tens of degrees and no two-body model can carry it.
//
// The Laplace planes show the same distance-dependence Jupiter's do, only much further.
// The inner five sit within 0.03° of Saturn's own pole — that deep in a 0.098 oblateness,
// the equator is the only plane there is. Titan's is 0.6° off it. Iapetus's is **14.8°**
// off, out at 59 Saturn radii where the Sun has largely won, and that single fact is why
// Iapetus's "inclination" is usually quoted as 15.5°: only 7.6° of it is the orbit's tilt
// within its own Laplace plane, and the rest is the plane.
// ---------------------------------------------------------------------------

const SATURN_AXIS_INVERSE = SATURN_AXIS_ORIENTATION.clone().invert();

/**
 * Mimas — the smallest body in the solar system still round enough for gravity to have
 * made it so, and only just: it is an ellipsoid a tenth longer than it is tall.
 *
 * Herschel, its 130 km crater, is a third of the moon's own diameter; the impact that
 * made it very nearly did not leave a Mimas. The 4:2 resonance with Tethys is what
 * `librationAmplitudeDeg` below is for, and it is not a small correction.
 */
export const MIMAS = defineSatellite({
    laplacePoleRaDeg: 40.5941,
    laplacePoleDecDeg: 83.5367,
    semiMajorAxis: MIMAS_ORBIT_RADIUS,
    // Forced, like Io's: tides would have circularised this long ago, and it is Tethys
    // that keeps pumping it back up.
    eccentricity: 0.019663,
    inclinationDeg: 1.5677,
    nodeJ2000Deg: 111.6533,
    // A full degree a day — the fastest node regression in this project by a factor of
    // two, and a consequence of sitting 3.08 radii above a planet a tenth out of round.
    // Mimas's orbit plane turns right round in under a year.
    nodeRateDegPerDay: -0.9994652,
    periapsisJ2000Deg: 84.4495,
    // And the apse advances at very nearly the same rate the node regresses, for the
    // reason Phobos's do: one bulge drives both.
    periapsisRateDegPerDay: 1.0008894,
    meanLongitudeJ2000Deg: 106.3842,
    meanMotionDegPerDay: 381.9925578,
    librationAmplitudeDeg: 33.0927,
    librationPeriodDays: 23218.1,
    librationPhaseDeg: 139.8020,
}, SATURN_AXIS_INVERSE);

/**
 * Enceladus. 252 km across, and geologically alive: a hundred jets of water vapour and
 * ice out of four fractures at the south pole, erupting continuously, feeding the E
 * ring and snowing back onto the moon. It is the reason five of the seven moons here
 * are so bright.
 */
export const ENCELADUS = defineSatellite({
    laplacePoleRaDeg: 40.5752,
    laplacePoleDecDeg: 83.5379,
    semiMajorAxis: ENCELADUS_ORBIT_RADIUS,
    // The number the whole moon runs on: 0.0047 of forced eccentricity, held by Dione,
    // flexing the ice shell twice per orbit. Circularise this and the plumes stop.
    eccentricity: 0.004728,
    inclinationDeg: 0.0031,
    nodeJ2000Deg: 16.4910,
    nodeRateDegPerDay: -0.3786513,
    periapsisJ2000Deg: 292.5945,
    // This rate is the third term of the resonance condition in the note above, and it
    // is what makes 1.99743 come out exact.
    periapsisRateDegPerDay: 0.3379131,
    meanLongitudeJ2000Deg: 303.1200,
    meanMotionDegPerDay: 262.7318866,
}, SATURN_AXIS_INVERSE);

/**
 * Tethys. Almost pure water ice — density 0.956, less than water itself, so there is
 * essentially no rock in it. Carries Ithaca Chasma, a canyon 2,000 km long running
 * three quarters of the way round the moon, and Odysseus, a 450 km basin on a 1,070 km
 * body whose floor has relaxed back to the curve of the surface.
 */
export const TETHYS = defineSatellite({
    laplacePoleRaDeg: 40.5683,
    laplacePoleDecDeg: 83.5365,
    semiMajorAxis: TETHYS_ORBIT_RADIUS,
    // Effectively zero — three parts in a hundred thousand. Unlike Mimas's and
    // Enceladus's, nothing is forcing it.
    eccentricity: 0.000030,
    inclinationDeg: 1.0909,
    nodeJ2000Deg: 336.6731,
    nodeRateDegPerDay: -0.1978501,
    periapsisJ2000Deg: 310.4403,
    periapsisRateDegPerDay: 0.2431647,
    meanLongitudeJ2000Deg: 265.1745,
    meanMotionDegPerDay: 190.6978592,
    // The other half of Mimas's libration, and the evidence that it is the resonance
    // rather than a fitting artefact: same signal, same window, 12.6 times smaller —
    // roughly the ratio of the two masses, which is how a resonance divides a libration.
    librationAmplitudeDeg: 2.6158,
    librationPeriodDays: 28661.2,
    librationPhaseDeg: 329.3642,
}, SATURN_AXIS_INVERSE);

/**
 * Dione. Denser than its neighbours, so there is real rock inside, and cracked across
 * its trailing hemisphere by the bright "wispy terrain" that Voyager took for frost
 * streaks and Cassini resolved into ice cliffs hundreds of metres high.
 */
export const DIONE = defineSatellite({
    laplacePoleRaDeg: 40.5536,
    laplacePoleDecDeg: 83.5422,
    semiMajorAxis: DIONE_ORBIT_RADIUS,
    eccentricity: 0.002193,
    inclinationDeg: 0.0270,
    nodeJ2000Deg: 68.7792,
    nodeRateDegPerDay: -0.0831080,
    periapsisJ2000Deg: 356.8408,
    periapsisRateDegPerDay: 0.0842525,
    meanLongitudeJ2000Deg: 319.3808,
    // Twice this, less Enceladus's apsidal rate, is Enceladus's own mean motion — see
    // the resonance note above.
    meanMotionDegPerDay: 131.5349315,
}, SATURN_AXIS_INVERSE);

/**
 * Rhea. Saturn's second largest moon and, at 1,528 km across, still under a fifth of
 * Titan's diameter and a hundredth of its mass — the gap between Titan and everything
 * else here is not a detail.
 */
export const RHEA = defineSatellite({
    laplacePoleRaDeg: 40.3272,
    laplacePoleDecDeg: 83.5518,
    semiMajorAxis: RHEA_ORBIT_RADIUS,
    eccentricity: 0.000936,
    inclinationDeg: 0.3318,
    nodeJ2000Deg: 108.1774,
    nodeRateDegPerDay: -0.0275855,
    periapsisJ2000Deg: 331.1636,
    // Near enough zero that the apse barely moves in a human lifetime. At this
    // eccentricity it is worth almost nothing to the position either way.
    periapsisRateDegPerDay: -0.0004671,
    meanLongitudeJ2000Deg: 168.9793,
    meanMotionDegPerDay: 79.6900457,
}, SATURN_AXIS_INVERSE);

/**
 * Titan, which is a planet in everything but what it orbits: larger than Mercury, with
 * a nitrogen atmosphere half again Earth's surface pressure, weather, rain, rivers,
 * dunes and seas. The only other place in the solar system with standing liquid on the
 * surface — methane and ethane, at 94 K.
 *
 * The Laplace pole here is pinned to JPL's published value rather than fitted. Titan's
 * node takes 3,400 years to come round, so over the thirty-year window this file is
 * checked against it moves a third of a degree, and the pole, the inclination and the
 * node are only determined in combination. A free fit walks the pole tens of degrees
 * for two thousandths of a degree of residual and lands on a plane that is arithmetically
 * as good and physically meaningless.
 */
export const TITAN = defineSatellite({
    laplacePoleRaDeg: 36.4000,
    laplacePoleDecDeg: 84.0000,
    semiMajorAxis: TITAN_ORBIT_RADIUS,
    // The largest of the seven, and unexplained: tides should have circularised a moon
    // this size long ago, and nothing is currently forcing it.
    eccentricity: 0.028701,
    inclinationDeg: 0.3451,
    nodeJ2000Deg: 155.5638,
    nodeRateDegPerDay: -0.0010862,
    periapsisJ2000Deg: 341.5486,
    periapsisRateDegPerDay: 0.0014244,
    meanLongitudeJ2000Deg: 145.1433,
    meanMotionDegPerDay: 22.5769771,
}, SATURN_AXIS_INVERSE);

/**
 * Iapetus, the strangest-looking body in the solar system: one hemisphere as dark as
 * coal and the other as bright as snow, split down a line, with a 13 km ridge running
 * along the equator through the dark half that nothing else anywhere has.
 *
 * Its Laplace pole is 14.8° from Saturn's, which is the largest such tilt in this
 * project by two orders of magnitude and is the whole reason Iapetus's orbit looks so
 * inclined. Out at 59 Saturn radii the planet's bulge has stopped being the dominant
 * influence and the Sun has taken over — the same transition Callisto shows at 0.29°,
 * fifty times further along. Pinned to JPL's published value for the reason Titan's is.
 */
export const IAPETUS = defineSatellite({
    laplacePoleRaDeg: 288.7000,
    laplacePoleDecDeg: 78.9000,
    semiMajorAxis: IAPETUS_ORBIT_RADIUS,
    eccentricity: 0.028409,
    // To its *own* Laplace plane. The 15.5° usually quoted is this plus the 14.8° the
    // plane itself is tilted — the same distinction Callisto's entry makes.
    inclinationDeg: 7.5743,
    nodeJ2000Deg: 98.8214,
    nodeRateDegPerDay: -0.0002883,
    periapsisJ2000Deg: 15.7762,
    periapsisRateDegPerDay: 0.0002462,
    meanLongitudeJ2000Deg: 224.4032,
    meanMotionDegPerDay: 4.5379546,
}, SATURN_AXIS_INVERSE);

const satelliteNode = new Vector3();
const satellitePole = new Vector3();
const satelliteAcross = new Vector3();
const satelliteApse = new Vector3();
const satelliteToPlanet = new Vector3();
const satelliteBasis = new Matrix4();

/**
 * Where a satellite is and which way it is facing, in its planet's equatorial frame.
 *
 * Position and orientation come out together because they are the same geometry: the
 * orbit pole and the direction back to the planet are what place the body, and being
 * tidally locked, they are also what aim it.
 *
 * Shared unchanged by the Martian and the Galilean moons, which is not a coincidence
 * worth glossing over: all six are tidally locked, and the IAU puts the prime meridian
 * of a synchronous satellite at its sub-planetary point. So "longitude 0 faces the
 * planet" is simultaneously the convention `geo.ts` maps a texture by and the physical
 * state tides drive these bodies into — the same rotation satisfies both.
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
    let meanLongitude =
        (satellite.meanLongitudeJ2000Deg + satellite.meanMotionDegPerDay * days) * DEG;
    // The resonant libration, for the two moons that have one. Zero-cost for the other
    // seven: the amplitude is undefined and the branch never runs.
    if (satellite.librationAmplitudeDeg) {
        meanLongitude +=
            satellite.librationAmplitudeDeg *
            DEG *
            Math.sin(
                ((360 / satellite.librationPeriodDays!) * days + satellite.librationPhaseDeg!) * DEG
            );
    }

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

    // Tidal lock. Every body run through here turns once per orbit, so the same face
    // is always toward its planet. Local +X is carried to the planet and +Y to the
    // spin axis — which for the lumpy Martian moons matches the axis order their
    // semi-axis constants are written in, and for the textured Galileans puts
    // longitude 0 under the planet, exactly where the IAU defines it.
    //
    // Strictly the spin is *uniform* rather than aimed, so an eccentric orbit swings
    // the body back and forth about the sub-planet direction — ±1.7° for Phobos, and
    // ±1° for Callisto. Aiming it is simpler and the difference is a fraction of a
    // pixel.
    satelliteToPlanet.copy(position).normalize().negate();
    satelliteAcross.crossVectors(satelliteToPlanet, satellitePole);
    orientation.setFromRotationMatrix(
        satelliteBasis.makeBasis(satelliteToPlanet, satellitePole, satelliteAcross)
    );
}
