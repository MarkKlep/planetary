import { Mesh, MeshStandardMaterial, SRGBColorSpace, SphereGeometry, TextureLoader } from 'three';
import { TITAN_RADIUS } from '../../constants/planets.const';

/**
 * Titan's **surface** — which is not what Titan looks like.
 *
 * This is the second body in the project made of two visible shells rather than a
 * surface with a veil over it, and the parallel with Venus is exact enough to be worth
 * drawing out. Venus's ground was mapped through an opaque cloud deck by radar; Titan's
 * was mapped through an opaque smog at 938 nm, in a narrow window between methane
 * absorption bands where the haze happens to be thin. Neither map is a photograph, and
 * neither is anything an eye has seen.
 *
 * So the treatment is Venus's: this mesh is the ground, `haze.ts` is what Titan actually
 * looks like, the haze is opaque and on by default, and the surface is the thing you opt
 * into. Voyager 1 was retargeted for a close Titan flyby in 1980 — costing it any chance
 * at Pluto — and returned a photograph of a featureless orange ball. Nothing below the
 * haze was seen at all until Cassini arrived twenty-four years later.
 *
 * What the map shows is real and worth the trip: **Xanadu**, a bright continent-sized
 * highland the size of Australia; the dark equatorial bands, which are not seas but dune
 * fields of solid hydrocarbon sand, wrapped most of the way round the moon; and the
 * bright polar terrain. The genuine seas — Kraken, Ligeia and Punga Mare, liquid methane
 * and ethane, hundreds of metres deep — are at the north pole and are better mapped by
 * radar than by this near-infrared mosaic.
 *
 * The hue is a tint rather than data, for the reason Europa's and Callisto's are: the
 * mosaic ships greyscale. It comes from the one direct measurement there is — Huygens
 * photographed the surface on the way down in January 2005, from the only landing ever
 * made in the outer solar system, and everything in those frames is a dull orange-brown,
 * because on Titan everything is coated in tholins that have been raining out of the
 * haze for four billion years.
 *
 * The brightness is not a tint choice: 0.099 comes out of the same comparison table in
 * `moons.ts` that sets the other six, and it is low because Titan genuinely is dark —
 * geometric albedo 0.22 against Enceladus's 1.375.
 */

const textureLoader = new TextureLoader();
const colorMap = textureLoader.load('/textures/titan_color.jpg');
colorMap.colorSpace = SRGBColorSpace;
colorMap.anisotropy = 8;

export const titan = new Mesh(
    // 128 rather than the icy moons' 96: Titan is larger than Mercury, which is drawn at
    // 128 here, and its limb is a silhouette you can actually get close to.
    new SphereGeometry(TITAN_RADIUS, 128, 128),
    new MeshStandardMaterial({
        map: colorMap,
        // Luminance 0.099 from the table in `moons.ts`, carried at the Huygens hue.
        color: 0x635741,
        roughness: 1,
        metalness: 0,
    })
);
