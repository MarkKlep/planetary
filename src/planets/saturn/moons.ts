import { Mesh, MeshStandardMaterial, SphereGeometry } from 'three';
import {
    DIONE_RADIUS,
    ENCELADUS_RADIUS,
    IAPETUS_RADIUS,
    MIMAS_RADIUS,
    RHEA_RADIUS,
    TETHYS_RADIUS,
} from '../../constants/planets.const';
import { loadLowPriorityColorMap } from '../../low-priority-texture';
import { quality } from '../../quality';
import { texturePath } from '../../textures';

/**
 * Saturn's six major icy moons. Titan gets its own pair of files, for the reason Venus
 * does — see `titan.ts`.
 *
 * These are the ordinary treatment again: a sphere, a real mosaic, a real albedo. What
 * marks them out from every other family here is how *bright* they are. The Galileans
 * span 0.22 to 0.67 and that was called the widest range in the scene; five of these
 * six sit between 0.95 and 1.38, above the top of the Galilean range and above the top
 * of the geometric albedo *scale*.
 *
 * That is not an error and it has a single cause: Enceladus. Its south-polar jets throw
 * water ice into Saturn orbit continuously, which becomes the E ring, and the E ring
 * snows back onto everything inside it. Mimas, Enceladus, Tethys, Dione and Rhea are
 * all in that snowstorm, wearing a coat of fresh sub-micron frost that is repainted
 * faster than space weathering can darken it. Iapetus, out at 59 Saturn radii, is well
 * outside it — and is correspondingly the odd one out below.
 *
 * ## Albedo, and why every one of them is tinted down
 *
 * Geometric albedo needs the same 3/2 conversion to hemispherical reflectance the
 * Martian moons, Venus and the Galileans need. Applied here it gives numbers that look
 * absurd — Enceladus 2.06 — and the reason is worth stating plainly rather than
 * clamping away: a geometric albedo compares a body at full phase against a perfect
 * diffusing disc, and a surface that *backscatters* can beat one. Fresh frost does. The
 * Lambert model has no room for any of it, so, exactly as with Europa, what has to
 * survive is the **ratios**.
 *
 * So the tints are derived by comparison, the way `jupiter/moons.ts` and `mercury.ts`
 * derive theirs. Each mosaic has its own mean brightness and none is radiometrically
 * absolute.
 *
 * One difference from the Galileans' table, and it is not cosmetic. Both the map means
 * and the tints below are in **linear** light, because that is the space three.js
 * actually multiplies them in: `material.color` is decoded from sRGB on the way in, and
 * so is the map. Jupiter's table compares sRGB-encoded means instead, which is very
 * nearly harmless there because every tint it produces is above 0.79 and the two spaces
 * agree closely near white. It is not harmless here. Titan's tint is 0.099, and 0.099
 * read as sRGB is 0.011 of linear light — a factor of nine, which renders the only
 * mapped surface in the outer solar system as a black disc.
 *

 *     body        map mean    diffuse albedo   tint needed
 *     Mimas         0.184           1.443           0.604
 *     Enceladus     0.159           2.063           1.000
 *     Tethys        0.209           1.844           0.680
 *     Dione         0.240           1.497           0.480
 *     Rhea          0.164           1.423           0.668
 *     Titan         0.257           0.330           0.099
 *     Iapetus       0.234           0.900           0.296
 *
 * Enceladus is the binding constraint and comes out at exactly 1.0 — it is the body
 * whose mosaic is dimmest relative to its albedo, so anchoring there is what keeps
 * every other tint at or under white. Note what that means for Titan: at 0.130 it is
 * *eight times darker* than Enceladus, which is the real ratio and is invisible in
 * photographs because nobody photographs the two together.
 *
 * No absolute level is being claimed by any of this, and none needs to be. Saturn is
 * 9.5 AU out, so everything here is already receiving a ninetieth of Earth's sunlight
 * before the tone mapper sees it, and `updateExposure` in script.ts is what develops it.
 */

/**
 * Loaded at `fetchPriority: 'low'` rather than through the ordinary `TextureLoader`
 * every other body here uses — see `low-priority-texture.ts` for the mechanism and why
 * a same-tick delay cannot substitute for it. These six are 2.5–2.7 MB apiece and
 * almost nobody flies to any specific one of them on a given visit; there is nothing
 * to buy by racing all six against a body's own textures for one of a handful of
 * HTTP/1.1 connections on the frame that matters. The material starts out wearing its
 * tint alone, which is a perfectly readable sphere for the moment before the map lands.
 */
function colorMap(material: MeshStandardMaterial, file: string) {
    loadLowPriorityColorMap(file, (texture) => {
        material.map = texture;
        material.needsUpdate = true;
    });
}

/**
 * None of the six carries a bump map, and as with the Galileans that is a gap rather
 * than a principle: there is no global altimetry for any of them. Cassini's stereo
 * coverage is patchy and the shape models that exist are low-order spherical harmonics,
 * which describe the figure but carry no relief to wrap.
 */
function moon(radius: number, map: string, color: number) {
    const material = new MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 });
    colorMap(material, map);
    return new Mesh(
        // 96 segments, matching the Galileans. Five of these six are smaller again —
        // Mimas is a fortieth of Earth's radius — but Rhea and Iapetus are large enough
        // to fly up to, and there are six of them to keep consistent.
        new SphereGeometry(radius, quality.moonSegments, quality.moonSegments),
        material
    );
}

/**
 * Mimas. The smallest body in the solar system that gravity has pulled round, and only
 * just — 396 km across, and measurably an ellipsoid rather than a sphere.
 *
 * Herschel, the crater on the leading hemisphere, is 130 km wide with a 6 km central
 * peak and walls 5 km high: a third of the moon's diameter, from an impact that came
 * close to breaking it apart. Fractures on the far side are thought to be the shock
 * arriving back after passing through the body. The resemblance to a certain battle
 * station is entirely coincidental and four years too late.
 */
export const mimas = moon(MIMAS_RADIUS, texturePath('mimas_color.jpg'), 0xcccccc);

/**
 * Enceladus. 504 km across, and the brightest surface in the solar system — it reflects
 * more light than falls on it by the geometric definition, which is what a fresh frost
 * of sub-micron ice grains does.
 *
 * The reason it stays that way is the four "tiger stripe" fractures at the south pole,
 * venting a hundred jets of water vapour and ice grains continuously from a global
 * ocean under 20 km of shell. Cassini flew through the plume and found salt, silica and
 * organic molecules, and the silica requires water at over 90 °C in contact with rock —
 * hydrothermal vents on the sea floor of a moon 500 km across. The energy comes from
 * the 0.0047 of orbital eccentricity Dione holds it at, which is in `orbits.ts` and is
 * doing more work than any other number in this project.
 */
export const enceladus = moon(ENCELADUS_RADIUS, texturePath('enceladus_color.jpg'), 0xffffff);

/**
 * Tethys. Density 0.956 g/cm³ — *less than water* — so it is essentially a ball of ice
 * with almost no rock in it at all.
 *
 * Two features dominate and both are near the limit of what the body could survive.
 * Odysseus is a 450 km basin on a 1,062 km moon, and its floor has since relaxed back
 * to the curve of the surface because ice at these temperatures flows. Ithaca Chasma is
 * a graben 100 km wide and 2,000 km long, running most of the way from pole to pole.
 */
export const tethys = moon(TETHYS_RADIUS, texturePath('tethys_color.jpg'), 0xd7d7d7);

/**
 * Dione. The densest of the icy six, so there is real rock inside, and the one whose
 * trailing hemisphere carries the "wispy terrain" — bright streaks that Voyager
 * resolved only as smears and were assumed to be frost deposits, until Cassini got
 * close enough to show them as a network of ice cliffs several hundred metres high.
 */
export const dione = moon(DIONE_RADIUS, texturePath('dione_color.jpg'), 0xb8b8b8);

/**
 * Rhea. Saturn's second largest moon, and the gap between it and the largest is the
 * thing worth noticing: at 1,528 km across it is under a fifth of Titan's diameter and
 * about a hundredth of its mass. Saturn's satellite system is Titan and some gravel.
 */
export const rhea = moon(RHEA_RADIUS, texturePath('rhea_color.jpg'), 0xd5d5d5);

/**
 * Iapetus — the one moon here that is not in the E ring's snowstorm, and the strangest
 * thing to look at in the solar system.
 *
 * One hemisphere is as dark as coal and the other as bright as snow, with a contrast of
 * more than ten and a boundary you can see. Cassini worked out why: out at 59 Saturn
 * radii, Iapetus is sweeping up dark dust spiralling in from the retrograde Phoebe ring,
 * which lands on the leading hemisphere. That side then absorbs more sunlight, warms,
 * and its ice sublimates away to refreeze on the colder bright side — which runs away
 * until the two hemispheres are what they are now. It is thermal segregation, not
 * painting, and Iapetus's 79-day rotation is slow enough to let it happen.
 *
 * Two consequences for this file. The albedo constant it is calibrated against is only
 * its **bright half**, because the dark half is 0.05 and a single figure would be
 * meaningless — the contrast is in the map, so the map carries it. And the tint is the
 * one here with a hue in it: the dark material is reddish-brown organics and the mosaic
 * is greyscale, so the warmth is added, at a ratio that leaves the luminance the
 * comparison above set. The bright half is very slightly too warm as a result, which is
 * the cheaper of the two errors.
 */
export const iapetus = moon(IAPETUS_RADIUS, texturePath('iapetus_color.jpg'), 0x9c9385);
