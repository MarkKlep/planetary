import { SphereGeometry, Mesh, MeshStandardMaterial, TextureLoader, SRGBColorSpace } from 'three';
import { MERCURY_RADIUS } from '../../constants/planets.const';
import { quality } from '../../quality';
import { texturePath } from '../../textures';

const textureLoader = new TextureLoader();

/**
 * MESSENGER's global colour mosaic, with most of its colour taken back out.
 *
 * The published product is a stretched multiband composite: it has a mean saturation
 * of 13%, which is where the strong blues and tans in it come from, and it is a long
 * way from what Mercury looks like. The real planet is a slightly browner Moon —
 * genuine colour variation across the surface is a couple of percent. The *structure*
 * in those bands is real (they map composition units that are actually there), so it
 * is kept at reduced strength; the stretch is a visualisation choice made for
 * geologists, so it is mostly undone. Luminance was left untouched, since that is
 * albedo and it is what carries the craters and the ray systems.
 */
const colorMap = textureLoader.load(texturePath('mercury_color.jpg'));
colorMap.colorSpace = SRGBColorSpace;
colorMap.anisotropy = 8;

// MESSENGER laser altimetry and stereo. Only 9.9 km from the floor of Rachmaninoff
// to the high ground near the equator — a quarter of Mars's range, on a body a
// quarter of the size, so proportionally Mercury is about as rumpled as Mars is.
const heightMap = textureLoader.load(texturePath('mercury_height.png'));
heightMap.anisotropy = 4;

const geometry = new SphereGeometry(MERCURY_RADIUS, quality.planetSegments[0], quality.planetSegments[1]);

const material = new MeshStandardMaterial({
    map: colorMap,
    bumpMap: heightMap,
    // Scaled from Venus's 5: same map width, so the only thing that differs is how
    // much relief the 0-255 range is stretched over — 0.40% of the radius here
    // against Venus's 0.24%.
    bumpScale: 8,
    /**
     * Albedo, derived by comparison rather than in the abstract.
     *
     * Mercury and the Moon are the two bodies here wearing brightness-normalised
     * mosaics, so neither map means anything in absolute terms and the honest thing
     * is to place one against the other. The Moon is already tinted to 0x8a for its
     * albedo of 0.12. Mercury's is 0.106, and its mosaic is darker to begin with
     * (mean luminance 112 against the Moon's 151), so holding the *ratio* of the two
     * finished surfaces at 0.106/0.12 means tinting up rather than down:
     *
     *     0x8a x (0.106 / 0.12) x (151 / 112) = 0xa4
     *
     * Tinting it to 0x7a "because Mercury is darker than the Moon" would have been
     * the obvious move and would have made it darker than it should be twice over.
     */
    color: 0xa4a4a4,
    // Airless, so nothing has ever weathered or polished it. As with the Moon, the
    // relief along the terminator is doing all the work of making it read as solid.
    roughness: 0.98,
    metalness: 0,
});

/**
 * Mercury has no atmosphere shell, and that is deliberate rather than unfinished.
 *
 * Earth, Mars and Venus each get a Fresnel limb glow. Mercury's surface pressure is
 * under 5x10^-15 bar — it holds a bare exosphere of atoms knocked loose by the solar
 * wind, thin enough that they never collide with each other. There is nothing there
 * to scatter light, so the limb ends in a hard edge against the sky exactly the way
 * the Moon's does, and adding a glow would be inventing an atmosphere for the one
 * planet that hasn't got one.
 */
export const mercury = new Mesh(geometry, material);
