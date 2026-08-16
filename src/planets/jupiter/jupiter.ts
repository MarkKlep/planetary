import { SphereGeometry, Mesh, MeshStandardMaterial, TextureLoader, SRGBColorSpace } from 'three';
import {
    JUPITER_EQUATORIAL_RADIUS,
    JUPITER_FLATTENING,
} from '../../constants/planets.const';

const textureLoader = new TextureLoader();

/**
 * Cassini's cylindrical map, assembled from narrow-angle camera frames taken over the
 * December 2000 flyby.
 *
 * Unlike every other colour map in this project, this one is a **snapshot rather than
 * a survey**. Mars's Viking mosaic and Mercury's MESSENGER mosaic describe surfaces
 * that have not moved in a billion years, so they are as true now as when they were
 * taken. Jupiter has no surface at all: the belts and zones here are weather, they
 * shear past each other continuously, and the Great Red Spot has both shrunk and
 * drifted in longitude since these frames were shot. What the map is honest about is
 * the *character* of the banding — the alternating light zones and dark belts, the
 * turbulent wake downstream of the Spot, the white ovals — none of which has changed.
 *
 * The poles are Cassini's weakest ground: the flyby was near-equatorial, so real
 * detail runs out around ±58° and the mosaic is filler beyond it. Those latitudes are
 * blended into their own zonal means (see CREDITS.md) so the caps close smoothly
 * instead of showing the fill's edge, which is the same treatment Mercury's poles get
 * for the same reason.
 */
const colorMap = textureLoader.load('/textures/jupiter_color.jpg');
colorMap.colorSpace = SRGBColorSpace;
colorMap.anisotropy = 8;

/**
 * There is no height map here, and there is nothing to put in one.
 *
 * Every other body in this scene gets a bump map because every other body has ground.
 * What looks like relief on Jupiter is cloud tops at different pressures, and the
 * whole visible range spans a few tens of kilometres on a planet 143,000 km across —
 * five parts in ten thousand, well under a texel. The banding already reads as depth
 * because it is genuinely shaded by the same one light everything else here uses.
 */

// Segment counts are up from the 128 the rocky planets use. Jupiter's disc is the
// largest in the scene by a wide margin, so its limb is the one silhouette where a
// polygonal edge would actually be visible against the sky.
const geometry = new SphereGeometry(JUPITER_EQUATORIAL_RADIUS, 192, 128);
// The oblateness, applied as a scale on the polar axis rather than baked into the
// geometry, so the mesh stays a unit sphere for raycasting and the number above stays
// the equatorial radius it is named for. 6.5% is not subtle — it is visible in any
// backyard telescope, and getting it wrong makes Jupiter read as a beach ball.
geometry.scale(1, 1 - JUPITER_FLATTENING, 1);

const material = new MeshStandardMaterial({
    map: colorMap,
    /**
     * No albedo tint, and unusually this needs saying.
     *
     * The Moon and Mercury are tinted because their mosaics are brightness-normalised
     * and mean nothing in absolute terms; Venus is tinted because its map is radar
     * rather than light. This one is neither — it is ordinary visible-light imagery of
     * a body whose geometric albedo is 0.538, and the map already carries that
     * brightness. Tinting it would be correcting something that is not wrong.
     */
    // Ammonia ice and ammonium hydrosulphide cloud, which is to say: frost. Nothing
    // here is polished, and there is no solid limb to catch a specular highlight.
    roughness: 1,
    metalness: 0,
});

export const jupiter = new Mesh(geometry, material);
