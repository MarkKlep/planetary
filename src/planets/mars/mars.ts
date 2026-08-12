import { SphereGeometry, Mesh, MeshStandardMaterial, TextureLoader, SRGBColorSpace } from 'three';
import { MARS_RADIUS } from '../../constants/planets.const';

const textureLoader = new TextureLoader();

// Viking MDIM 2.1 colour mosaic. The polar caps, Syrtis Major and the great dust
// albedo features are all in the map itself rather than being shaded on.
const colorMap = textureLoader.load('/textures/mars_color.jpg');
colorMap.colorSpace = SRGBColorSpace;
colorMap.anisotropy = 8;

// MOLA elevation, the full 29 km from the floor of Hellas to the summit of Olympus
// Mons. Mars has enough air to soften shadows a little but nothing like Earth's, so
// as on the Moon the relief along the terminator is what sells the surface as solid.
const heightMap = textureLoader.load('/textures/mars_height.png');
heightMap.anisotropy = 4;

const geometry = new SphereGeometry(MARS_RADIUS, 128, 128);

const material = new MeshStandardMaterial({
    map: colorMap,
    bumpMap: heightMap,
    // The height map is twice the Moon's resolution, and three.js derives its bump
    // normals from adjacent texels, so the same relief needs a smaller number here.
    bumpScale: 7,
    // Deliberately *no* albedo correction, unlike the Moon next door.
    //
    // It is tempting to darken this, since Mars's albedo of 0.17 is far below the
    // 0.30 usually quoted for Earth. But that 0.30 is mostly cloud, and the clouds
    // here are a separate shell: the Blue Marble map underneath is the bare surface,
    // which reflects about 0.12. Measured the same way, the two mosaics already sit
    // in almost exactly that ratio. Mars's ground really is the brighter of the two
    // — Earth only outshines it by being wrapped in cloud and a third closer in.
    //
    // So the only thing dimming Mars is the inverse-square falloff from the Sun,
    // which is as it should be.
    // Dust and basalt, with no ocean anywhere to put a glint on.
    roughness: 0.96,
    metalness: 0,
});

export const mars = new Mesh(geometry, material);
