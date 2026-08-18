import { Mesh, SphereGeometry, MeshStandardMaterial, TextureLoader, SRGBColorSpace } from 'three';
import { CLOUD_RADIUS } from '../../constants/planets.const';
import { quality } from '../../quality';
import { texturePath } from '../../textures';

const textureLoader = new TextureLoader();

// The MODIS composite is white cloud on black, so the same image serves as both the
// colour map and the opacity mask — black areas fall away to fully transparent.
const cloudMap = textureLoader.load(texturePath('earth_clouds.jpg'));
cloudMap.colorSpace = SRGBColorSpace;
cloudMap.anisotropy = 8;

const material = new MeshStandardMaterial({
    map: cloudMap,
    alphaMap: cloudMap,
    transparent: true,
    // Clouds sit on a shell of their own; writing depth would let them z-fight the
    // surface and clip the terminator.
    depthWrite: false,
    roughness: 1,
    metalness: 0,
});

export const clouds = new Mesh(new SphereGeometry(CLOUD_RADIUS, quality.shellSegments, quality.shellSegments), material);
