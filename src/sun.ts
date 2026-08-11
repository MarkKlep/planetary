import { DirectionalLight, Vector3 } from 'three';
import { latLonToDirection, toWorldFrame } from './geo';
import { SUN_DISTANCE, SUN_INTENSITY } from './constants/planets.const';

const DEG = Math.PI / 180;

/** Julian day number for a JS date. 2440587.5 is the Julian day of the Unix epoch. */
function julianDay(date: Date): number {
    return date.getTime() / 86400000 + 2440587.5;
}

export interface SubsolarPoint {
    /** Degrees north — equals the sun's declination, so it tracks the seasons. */
    latitude: number;
    /** Degrees east — sweeps westward roughly 15°/hour. */
    longitude: number;
}

/**
 * The point on Earth where the sun is directly overhead, for a given instant.
 *
 * Low-precision solar position from the Astronomical Almanac: accurate to a
 * fraction of a degree for the next century or so, which is far beyond what a
 * terminator line drawn on a 1-unit sphere can resolve.
 */
export function subsolarPoint(date: Date): SubsolarPoint {
    // Days since the J2000.0 epoch.
    const n = julianDay(date) - 2451545.0;

    const meanLongitude = (280.46 + 0.9856474 * n) * DEG;
    const meanAnomaly = (357.528 + 0.9856003 * n) * DEG;

    // Ecliptic longitude: mean longitude corrected for the orbit's eccentricity.
    const eclipticLongitude =
        meanLongitude + 1.915 * DEG * Math.sin(meanAnomaly) + 0.02 * DEG * Math.sin(2 * meanAnomaly);

    // Obliquity of the ecliptic — Earth's axial tilt, the reason for seasons.
    const obliquity = (23.439 - 0.0000004 * n) * DEG;

    const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
    const rightAscension = Math.atan2(
        Math.cos(obliquity) * Math.sin(eclipticLongitude),
        Math.cos(eclipticLongitude)
    );

    // Greenwich mean sidereal time, in degrees.
    const gmst = 280.46061837 + 360.98564736629 * n;

    let longitude = rightAscension / DEG - gmst;
    longitude = ((((longitude + 180) % 360) + 360) % 360) - 180; // wrap to [-180, 180)

    return { latitude: declination / DEG, longitude };
}

export const sun = new DirectionalLight(0xfff6e8, SUN_INTENSITY);

/** Unit vector from the Earth toward the sun, in world space. Reused by the shaders. */
export const sunDirection = new Vector3(1, 0, 0);

/**
 * Points the sun at the geography that is actually in daylight right now.
 *
 * `earthRotationY` is threaded through because the Earth mesh spins on its own
 * clock: the subsolar point is geographic, so it has to be carried into the same
 * world frame as the surface texture, otherwise the terminator slides across the
 * continents instead of staying put.
 */
export function updateSunPosition(date: Date, earthRotationY: number): void {
    const { latitude, longitude } = subsolarPoint(date);

    latLonToDirection(latitude, longitude, sunDirection);
    toWorldFrame(sunDirection, earthRotationY);

    sun.position.copy(sunDirection).multiplyScalar(SUN_DISTANCE);
    sun.target.position.set(0, 0, 0);
    sun.target.updateMatrixWorld();
}
