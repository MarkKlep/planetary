import { Vector3 } from 'three';

const Y_AXIS = new Vector3(0, 1, 0);

/**
 * Converts geographic coordinates to a unit direction in the Earth mesh's *local*
 * frame — i.e. the frame the surface texture is painted in.
 *
 * The mapping is derived from three.js `SphereGeometry`, which builds vertices as
 *   x = -r·cos(2πu)·sin(πv),  y = r·cos(πv),  z = r·sin(2πu)·sin(πv)
 * and emits uv = (u, 1-v). For an equirectangular map (U=0 → 180°W, U=0.5 → 0°,
 * V=1 → 90°N) that works out to the signs below. Note the *negative* z term: get
 * it wrong and everything lands at a mirrored longitude.
 *
 * @param latitude  degrees, positive north
 * @param longitude degrees, positive east
 */
export function latLonToDirection(latitude: number, longitude: number, target = new Vector3()): Vector3 {
    const lat = (latitude * Math.PI) / 180;
    const lon = (longitude * Math.PI) / 180;
    const cosLat = Math.cos(lat);

    return target.set(cosLat * Math.cos(lon), Math.sin(lat), -cosLat * Math.sin(lon));
}

/**
 * Rotates a local-frame direction into world space to follow the Earth mesh's
 * current spin. The Earth is a plain `Mesh` whose `rotation.y` advances every
 * frame, so anything positioned by geography — the ISS, the sun's subsolar point —
 * has to be carried along with it or it will drift across the surface.
 */
export function toWorldFrame(direction: Vector3, earthRotationY: number): Vector3 {
    return direction.applyAxisAngle(Y_AXIS, earthRotationY);
}
