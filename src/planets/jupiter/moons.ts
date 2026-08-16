import { SphereGeometry, Mesh, MeshStandardMaterial, TextureLoader, SRGBColorSpace } from 'three';
import {
    CALLISTO_RADIUS,
    EUROPA_RADIUS,
    GANYMEDE_RADIUS,
    IO_RADIUS,
} from '../../constants/planets.const';

/**
 * The four Galilean moons.
 *
 * The opposite case to Phobos and Deimos in every respect. Those two are built rather
 * than textured because they are 11 km lumps with no map worth wrapping; these are
 * worlds — Ganymede is wider than Mercury, which is in this scene to be compared
 * against — and every one of them has been surveyed by Voyager and Galileo. So they go
 * back to the ordinary treatment: a sphere, a mosaic, and a real albedo.
 *
 * What they do share with the Martian pair is `satelliteState`: all six are tidally
 * locked, all six are ruled by their planet's equatorial bulge rather than by the Sun,
 * and all six therefore hang off the planet's *axis* node rather than its system node.
 *
 * ## Albedo, and why only two of the four are tinted
 *
 * Geometric albedo needs the same 3/2 conversion to hemispherical reflectance that the
 * Martian moons and Venus need — see `moons.ts` there for the derivation. That gives
 * Io 0.945, Europa 1.005, Ganymede 0.645, Callisto 0.330.
 *
 * Europa's exceeding 1 is not an arithmetic slip, it is the physical edge of the
 * scale: Europa is the most reflective large surface in the solar system, resurfaced
 * water ice throwing back two thirds of what lands on it, and the Lambert model simply
 * runs out of room. Whatever is done about it, the *ratios* between the four are the
 * thing that has to survive, since they are what makes bright Europa and sooty
 * Callisto read as different materials rather than the same rock at two exposures.
 *
 * So the tints are derived the way `mercury.ts` derives its one, by comparison rather
 * than in the abstract. Each mosaic has its own mean brightness, and none of them is
 * radiometrically absolute:
 *
 *     body      map mean luma   diffuse albedo   tint needed
 *     Io            0.519           0.945           1.000
 *     Europa        0.566           1.005           0.975
 *     Ganymede      0.444           0.645           0.797
 *     Callisto      0.227           0.330           0.799
 *
 * Io comes out at exactly 1.0 because it is the binding constraint — it is the body
 * whose mosaic is dimmest relative to its albedo, so anchoring there is what keeps
 * every other tint at or under white. Ganymede's colour mosaic is *relatively* too
 * bright (its map is 86% of Io's brightness where the real ratio is 68%), which is why
 * a body that carries its own colour still needs taking down.
 *
 * Absolute level is not being claimed by any of this, and does not need to be: the
 * point light falls off as 1/d², so everything out here is already receiving a
 * twenty-seventh of Earth's sunlight before the tone mapper sees it.
 */

const textureLoader = new TextureLoader();

function colorMap(file: string) {
    const texture = textureLoader.load(file);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
}

/**
 * None of the four gets a bump map, and unlike Jupiter's case that is a gap rather
 * than a principle: there are no global DEMs of these bodies. Voyager and Galileo flew
 * past rather than orbited, so outside a few stereo patches there is no altimetry to
 * wrap. The relief is real and in places enormous — Io's Boösaule Montes stands 17 km,
 * twice Everest — but it is not mapped, and inventing it here would be the one thing
 * `moons.ts` is careful not to do for Phobos.
 */
function moon(radius: number, map: string, color: number, roughness = 0.95) {
    return new Mesh(
        // 96 segments rather than the planets' 128: these are a quarter the size of the
        // rocky planets and are only ever seen from a distance where that reads the
        // same, but there are four of them.
        new SphereGeometry(radius, 96, 96),
        new MeshStandardMaterial({ map: colorMap(map), color, roughness, metalness: 0 })
    );
}

/**
 * Io. Sulphur and sulphur dioxide frost over silicate rock, repaved continuously by
 * some 400 active volcanoes — the most geologically active body in the solar system,
 * and the only one besides Earth where eruptions have been caught in the act.
 *
 * It is the one body in this scene with **no impact craters at all**. Its surface is
 * younger than most human civilisations; anything that hits it is buried within a
 * geological instant. That is why the map reads as paint rather than as rock.
 *
 * Untinted: it is the anchor the table above is built from.
 */
export const io = moon(IO_RADIUS, '/textures/io_color.jpg', 0xffffff);

/**
 * Europa. Water ice, cracked through by the same tidal kneading that melts Io — the
 * linea are fractures in a shell floating on what is almost certainly a liquid ocean
 * holding twice the water of every ocean on Earth.
 *
 * The map ships greyscale (see CREDITS.md), so the faint warm cast here is a tint
 * rather than measurement, taken from Galileo's colour work: Europa's trailing
 * hemisphere is stained reddish-brown by sulphur swept off Io and implanted by
 * Jupiter's magnetosphere, while the leading side stays nearly white.
 */
export const europa = moon(EUROPA_RADIUS, '/textures/europa_color.jpg', 0xfff9f0);

/**
 * Ganymede. The largest moon in the solar system, larger than Mercury, and the only
 * one anywhere with a magnetic field of its own.
 *
 * The map is Voyager/Galileo colour, so the two terrains it shows are measured, not
 * inferred: dark, ancient, heavily cratered plates — Galileo Regio is the big one —
 * cut across by bright grooved bands where the crust was pulled apart and refrozen.
 * Roughly a third of the surface is old and two thirds young, which is a division no
 * other icy moon shows this plainly.
 */
export const ganymede = moon(GANYMEDE_RADIUS, '/textures/ganymede_color.jpg', 0xcbcbcb);

/**
 * Callisto. The outermost Galilean, the only one outside the Laplace resonance, and
 * therefore the only one that was never tidally heated into resurfacing itself.
 *
 * The result is the most heavily cratered surface known anywhere — saturated, meaning
 * new impacts can only erase old ones, so it has stopped recording. The ground is four
 * billion years old and reflects a fifth of what lands on it, half of Ganymede's. The
 * bright bullseye of Valhalla, 3,800 km across, is the largest multi-ring structure in
 * the solar system.
 *
 * Greyscale map, so the grey-brown is a tint: dirty ice, with the ice sublimated away
 * from the high ground and a dark residue of rock and organics left behind.
 */
export const callisto = moon(CALLISTO_RADIUS, '/textures/callisto_color.jpg', 0xdbc9b3);
