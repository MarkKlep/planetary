import { BufferGeometry, LineBasicMaterial, LineLoop, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three';
import { latLonToDirection } from '../../geo';
import { EARTH_OBLIQUITY, earthOrbitPosition, earthSpinAngle } from '../../orbits';

/**
 * The analemma — the figure-8 the Sun traces over a year when you mark its position
 * in the sky at the same clock time every day.
 *
 * It is not a separate calculation. The whole shape falls out of the same real
 * ephemeris this app already uses for the terminator and the seasons: sample the
 * Sun's true position daily at a fixed UTC hour for a year, convert each sample to
 * the observer's local altitude and azimuth, and plot them. The figure-8's width is
 * the equation of time — nothing here computes that formula directly, it emerges the
 * same way Earth's obliquity emerges from the tilt pivot rather than being imposed.
 *
 * Observer: 45°N, 0°E, sampled at 12:00 UTC. Longitude 0 keeps UTC noon close to
 * local solar noon there, which is what centres the loop near the zenith instead of
 * low against one horizon — the classic framing for a photographed analemma.
 */
const OBSERVER_LATITUDE_DEG = 45;
const OBSERVER_LONGITUDE_DEG = 0;
const SAMPLE_HOUR_UTC = 12;
const SAMPLE_COUNT = 365;

/**
 * How far above the surface the loop is drawn, in Earth radii — a display choice,
 * not a distance. The Sun is not really this close; this is a wedge of the
 * observer's own sky pulled in close enough to see against the globe.
 */
const SKY_HEIGHT = 0.4;
export const ANALEMMA_RADIUS = 1 + SKY_HEIGHT;

const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);

// The observer's local basis, in `earth`'s own *unrotated* frame — computed once,
// since the location is fixed. Once the curve is parented to `earth`, its existing
// per-frame spin and its parent tilt pivot carry this into world space for free;
// nothing here needs updating per frame.
const localUp = latLonToDirection(OBSERVER_LATITUDE_DEG, OBSERVER_LONGITUDE_DEG);
// (0,1,0) is `earth`'s own spin axis, in its own local frame, by definition.
const localPole = new Vector3(0, 1, 0);
const localNorth = localPole.clone().addScaledVector(localUp, -localPole.dot(localUp)).normalize();
const localEast = new Vector3().crossVectors(localNorth, localUp).normalize();

const worldUp = new Vector3();
const worldPole = new Vector3();
const worldNorth = new Vector3();
const worldEast = new Vector3();
const sunDirection = new Vector3();

/**
 * The Sun's altitude and azimuth as this observer would really see it at the given
 * moment. Same vector approach `earthSpinAngle` already uses elsewhere, rather than
 * a fresh set of spherical-trig formulas with their own quadrant bugs to get wrong —
 * see `geo.ts`'s warning about the negative-z convention, which the same class of
 * mistake would reintroduce here.
 *
 * This is what actually produces the figure-8: sampled at the same *clock* time
 * every day, the Sun's true position drifts against that fixed instant by the
 * equation of time — up to about 16 minutes either way — because a solar day is not
 * exactly 24 hours all year. That drift shows up directly as the azimuth swing
 * below; nothing here treats it as a separate correction.
 */
function sunHorizontal(date: Date): { altitude: number; azimuth: number } {
    const spin = earthSpinAngle(date);

    worldUp.copy(localUp).applyAxisAngle(Y_AXIS, spin).applyAxisAngle(X_AXIS, -EARTH_OBLIQUITY);
    // The spin rotation is skipped here deliberately: (0,1,0) is the axis spin
    // itself rotates about, so it is invariant under it, and only the fixed tilt
    // moves the pole. Applying spin anyway would be harmless but pointless work.
    worldPole.set(0, 1, 0).applyAxisAngle(X_AXIS, -EARTH_OBLIQUITY);
    worldNorth.copy(worldPole).addScaledVector(worldUp, -worldPole.dot(worldUp)).normalize();
    worldEast.crossVectors(worldNorth, worldUp).normalize();

    sunDirection.copy(earthOrbitPosition(date)).negate().normalize();

    const altitude = Math.asin(Math.max(-1, Math.min(1, sunDirection.dot(worldUp))));
    const azimuth = Math.atan2(sunDirection.dot(worldEast), sunDirection.dot(worldNorth));
    return { altitude, azimuth };
}

/**
 * The year sampled doesn't matter — day-of-year is what determines Earth's orbital
 * position, not the calendar year, so the shape repeats almost exactly from one year
 * to the next. 2025 is just a fixed, arbitrary, recent reference; `Date.UTC`'s
 * month/day rollover means "day N of the year" needs no calendar-boundary handling.
 */
function buildPoints(): Vector3[] {
    const points: Vector3[] = [];

    for (let day = 0; day < SAMPLE_COUNT; day++) {
        const date = new Date(Date.UTC(2025, 0, 1 + day, SAMPLE_HOUR_UTC));
        const { altitude, azimuth } = sunHorizontal(date);

        const horizontalRadius = Math.cos(altitude);
        points.push(
            new Vector3()
                .addScaledVector(localUp, Math.sin(altitude))
                .addScaledVector(localNorth, Math.cos(azimuth) * horizontalRadius)
                .addScaledVector(localEast, Math.sin(azimuth) * horizontalRadius)
                .multiplyScalar(ANALEMMA_RADIUS)
        );
    }

    return points;
}

const lineGeometry = new BufferGeometry().setFromPoints(buildPoints());
const lineMaterial = new LineBasicMaterial({
    color: 0xffd27a,
    transparent: true,
    opacity: 0.85,
    // Without this the loop gets rolled off by ACES with everything else and reads
    // as a dim thread against the dayside; the same trick the body markers use.
    toneMapped: false,
});
/** The figure-8 itself. A closed loop, since the pattern repeats every year. */
export const analemmaLine = new LineLoop(lineGeometry, lineMaterial);

// A small marker at the observer's own position, just clear of the cloud shell
// (radius 1.006) so it never reads as buried under cloud cover.
const anchorGeometry = new SphereGeometry(0.012, 12, 12);
const anchorMaterial = new MeshBasicMaterial({ color: 0xffd27a, toneMapped: false });
export const analemmaAnchor = new Mesh(anchorGeometry, anchorMaterial);
analemmaAnchor.position.copy(localUp).multiplyScalar(1.01);
