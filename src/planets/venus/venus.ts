import { SphereGeometry, Mesh, MeshStandardMaterial, TextureLoader, SRGBColorSpace } from 'three';
import { VENUS_RADIUS } from '../../constants/planets.const';
import { quality } from '../../quality';
import { texturePath } from '../../textures';

const textureLoader = new TextureLoader();

/**
 * The ground under the clouds — and the one map in this project that is not a
 * photograph of anything.
 *
 * Every other body here wraps light that a camera actually recorded. There is no such
 * image of Venus's surface: the cloud deck is completely opaque at visible
 * wavelengths, and the only pictures ever taken from below it are the few square
 * metres around the Venera landers. What this is instead is Magellan's radar looking
 * *through* the clouds — brightness here is backscatter, i.e. how rough and how
 * steeply tilted the ground is, not how bright it would look to the eye. Maxwell
 * Montes reads brilliant white for that reason, not because it is pale.
 *
 * So the map is left greyscale and the colour comes from the material tint below,
 * which is the honest split: the *structure* is measured, the *hue* is not in the
 * data at all.
 */
const radarMap = textureLoader.load(texturePath('venus_surface.jpg'));
radarMap.colorSpace = SRGBColorSpace;
radarMap.anisotropy = 8;

// Magellan altimetry. Venus is a conspicuously smooth planet — 14.6 km from the floor
// of Diana Chasma to the summit of Maxwell Montes, against Mars's 29 km on a globe
// barely half the size — so there is far less relief here than on any other surface
// in this scene, and it is worth not overstating.
const heightMap = textureLoader.load(texturePath('venus_height.png'));
heightMap.anisotropy = 4;

const geometry = new SphereGeometry(VENUS_RADIUS, quality.planetSegments[0], quality.planetSegments[1]);

const material = new MeshStandardMaterial({
    map: radarMap,
    bumpMap: heightMap,
    // Lower than Mars's 7 for two compounding reasons: the map is coarser (2700 wide
    // against 5760, and three.js takes its bump normals from adjacent texels), and
    // the relief it encodes is genuinely subtler — 0.24% of Venus's radius against
    // Mars's 0.86%. Matching Mars's number would invent mountains.
    bumpScale: 5,
    /**
     * The Venera 13 and 14 colour panoramas, which remain the only photographs of the
     * surface, and which is why this is a tint rather than a texture. They show a
     * warm ochre — partly the basalt itself, and mostly the sky above it: 90 bars of
     * CO2 filters the blue out of the sunlight long before it reaches the ground, so
     * everything down there is lit orange. That cast is not a property of the rock,
     * but it *is* the only way the surface has ever been seen.
     */
    color: 0xc98f5a,
    // Basalt and wind-worked grit, in an atmosphere far too thick and far too hot to
    // leave anything glassy behind.
    roughness: 0.95,
    metalness: 0,
});

export const venus = new Mesh(geometry, material);
