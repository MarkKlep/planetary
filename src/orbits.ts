import { Vector3 } from 'three';
import { latLonToDirection } from './geo';
import {
    EARTH_OBLIQUITY_DEG,
    EARTH_ORBIT_RADIUS,
    MOON_DISTANCE,
} from './constants/planets.const';

const DEG = Math.PI / 180;
export const EARTH_OBLIQUITY = EARTH_OBLIQUITY_DEG * DEG;

const X_AXIS = new Vector3(1, 0, 0);

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
