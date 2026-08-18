import { SphereGeometry, Mesh, MeshStandardMaterial, TextureLoader, SRGBColorSpace } from 'three';
import { MOON_RADIUS } from '../../constants/planets.const';
import { quality } from '../../quality';
import { texturePath } from '../../textures';

const textureLoader = new TextureLoader();

const colorMap = textureLoader.load(texturePath('moon_color.jpg'));
colorMap.colorSpace = SRGBColorSpace;
colorMap.anisotropy = 8;

// LOLA elevation. The Moon has no atmosphere to soften shadows, so relief along the
// terminator is the dominant visual cue that the surface has depth.
const heightMap = textureLoader.load(texturePath('moon_height.png'));
heightMap.anisotropy = 4;

const geometry = new SphereGeometry(MOON_RADIUS, quality.planetSegments[0], quality.planetSegments[1]);

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
 * turns its far side toward us as it goes around.
 *
 * `SphereGeometry` puts texture longitude 0° (the near-side centre on an
 * equirectangular lunar map) along local +X, and rotating by φ carries +X to
 * (cos φ, 0, −sin φ). The Moon sits at `eclipticDirection(L) · d`, i.e.
 * (cos L, 0, −sin L), so the direction back to Earth is (−cos L, 0, sin L). Matching
 * those gives φ = π + L.
 */
export function moonTidalRotation(orbitalLongitude: number): number {
    return Math.PI + orbitalLongitude;
}
