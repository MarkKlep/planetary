import { SphereGeometry, Mesh, MeshStandardMaterial, TextureLoader, SRGBColorSpace } from 'three';
import { MOON_RADIUS } from '../../constants/planets.const';

const textureLoader = new TextureLoader();

const colorMap = textureLoader.load('/textures/moon_color.jpg');
colorMap.colorSpace = SRGBColorSpace;
colorMap.anisotropy = 8;

// LOLA elevation. The Moon has no atmosphere to soften shadows, so relief along the
// terminator is the dominant visual cue that the surface has depth.
const heightMap = textureLoader.load('/textures/moon_height.png');
heightMap.anisotropy = 4;

const geometry = new SphereGeometry(MOON_RADIUS, 128, 128);

// Lit by the same directional sun as Earth, so the Moon runs through real phases as
// it orbits instead of reading as a flat disc.
const material = new MeshStandardMaterial({
    map: colorMap,
    bumpMap: heightMap,
    bumpScale: 12,
    // The LROC mosaic is brightness-normalised for legibility, so lighting it at
    // the same intensity as Earth clips it to featureless white. The Moon's real
    // albedo (~0.12) is well under Earth's (~0.30); scaling it back down restores
    // the crater detail and keeps it the darker of the two, as it should be.
    color: 0x8a8a8a,
    roughness: 0.98,
    metalness: 0,
});

export const moon = new Mesh(geometry, material);

/**
 * Spin needed to keep the Moon tidally locked, for a given point in its orbit.
 *
 * The real Moon rotates exactly once per orbit, so the same near side always faces
 * Earth. Left unrotated the mesh holds a fixed orientation in world space and slowly
 * turns its far side toward us as it goes around — which is why the wrong hemisphere
 * was showing.
 *
 * `SphereGeometry` puts texture longitude 0° (the near-side centre on an
 * equirectangular lunar map) along local +X, and rotating by φ carries +X to
 * (cos φ, 0, −sin φ). Pointing that at Earth from orbital angle θ — direction
 * (−cos θ, 0, −sin θ) — gives φ = π − θ.
 */
export function moonTidalRotation(orbitalAngle: number): number {
    return Math.PI - orbitalAngle;
}
