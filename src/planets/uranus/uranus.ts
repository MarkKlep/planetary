import {
    CanvasTexture,
    Color,
    Mesh,
    MeshStandardMaterial,
    SRGBColorSpace,
    SphereGeometry,
    Vector3,
} from 'three';
import {
    URANUS_EQUATORIAL_RADIUS,
    URANUS_FLATTENING,
    URANUS_GEOMETRIC_ALBEDO,
} from '../../constants/planets.const';
import { fbm } from '../../noise';
import { latLonToDirection } from '../../geo';
import { quality } from '../../quality';

/**
 * Uranus — the one planet here with **no map**, and the only one where that is a
 * statement about the planet rather than about what has been photographed.
 *
 * Jupiter and Saturn get real mosaics because they have real faces. Voyager 2 went past
 * Uranus in January 1986 with the same cameras that had just returned the Great Red Spot
 * in detail, from 81,500 km, and came back with a blank. Not underexposed, not out of
 * focus, not a poor phase angle: there was nothing there. The mission report's own phrase
 * for it was "a featureless blue-green ball", and the handful of clouds anyone has ever
 * pointed at in those frames only appear after contrast stretches of several hundred to
 * one — the kind that turn photon noise into structure.
 *
 * The reason is temperature, and it is the same reason the colour is what it is. At 76 K
 * the methane condenses out far below the visible level and freezes into a deep haze,
 * and Uranus is the one giant planet radiating essentially no internal heat — about 1.06
 * times what it receives, against Jupiter's 1.7 — so there is very little convection
 * driving weather up through it. What you see is the top of a still, deep atmosphere.
 *
 * So this surface is **generated**, and that is the honest option rather than the cheap
 * one. Every "Uranus map" in circulation is either a painting or a stretch, and pasting
 * one on here would draw contrast no eye has ever seen — which is exactly the argument
 * `venus/clouds.ts` makes about mapping Venus's ultraviolet markings into visible light,
 * and exactly the argument `mars/moons.ts` makes about generating Phobos. The rule is
 * the same in all three places: real measurements where they exist, generated below the
 * resolution of what was actually observed. Here that line falls very high up.
 *
 * What *is* real and does go in: the colour, the albedo, the limb, the oblateness, and
 * the fact that the banding is zonal — which on a planet lying 97.77° over means the
 * bands are not stripes across the disc at all. Near solstice they are concentric rings
 * around the pole facing you, and that geometry comes from the axis node, for free.
 */

/**
 * 1024 x 512, matching Venus's deck, and built the same way — on the main thread at
 * import time, inside the stall the splash screen covers.
 *
 * There is even less to lose here than there is on Venus. This field is very nearly a
 * pure function of latitude, its whole contrast range is under three percent, and its
 * finest real feature is a band some ten degrees of latitude wide — around thirty texels
 * at this height. Three octaves of mottling on top is all that is not band structure.
 */
const SIZE = 1024;
const direction = new Vector3();
const bandDirection = new Vector3();

/**
 * The colour, in **linear** light, normalised so the largest channel is 1.
 *
 * Methane is the whole explanation. It is transparent through the blue and green and
 * absorbs hard from about 600 nm up, so red sunlight goes into the atmosphere and does
 * not come back out; what returns is Rayleigh-scattered short wavelengths off the haze.
 * Hence a pale greenish cyan rather than the saturated aquamarine everyone remembers,
 * which comes from the contrast-stretched Voyager release — Irwin et al. (2024)
 * re-derived both ice giants' true colours and found Uranus considerably paler and much
 * closer to Neptune than the two are usually drawn.
 *
 * Linear rather than sRGB because the multiply downstream happens in linear light:
 * `material.color` is decoded from sRGB on the way in and so is this map, so a ratio
 * written into the sRGB *bytes* is not the ratio that reaches the shading. That is the
 * trap `saturn/moons.ts` documents, and it bites hardest exactly where a tint is
 * furthest from white — which, of everything in this project, is here.
 */
const TINT = [0.62, 0.93, 1.0];

/** Linear -> sRGB transfer, so the ratios above survive being written as bytes. */
function encodeSRGB(value: number): number {
    return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

/**
 * How much brighter the field's peak is than its mean, filled in by the build below and
 * multiplied back into the material.
 *
 * Without it the map clips. The field is normalised so its *mean* is the measured
 * albedo — which is the quantity an albedo actually is, a disc average — but that leaves
 * everything above the mean running past 1.0 in whichever channel the tint has at full
 * strength, and the first casualty is the polar cap, the one feature on Uranus anybody
 * has ever seen without stretching the image first. Dividing by the peak instead and
 * handing the factor to `material.color` keeps both: nothing clips, and the mean is
 * still the albedo.
 */
let peakOverMean = 1;

function buildSurfaceTexture(): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE / 2;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(canvas.width, canvas.height);

    // Two passes, for Venus's reason: normalise against the field's own mean rather
    // than clamping, so the albedo set on the material below is the albedo the disc
    // actually averages instead of whatever survived a clip.
    const values = new Float32Array(canvas.width * canvas.height);
    let total = 0;
    let peak = 0;

    for (let y = 0; y < canvas.height; y++) {
        const latitude = 90 - ((y + 0.5) / canvas.height) * 180;
        const sinLatitude = Math.sin((latitude * Math.PI) / 180);

        for (let x = 0; x < canvas.width; x++) {
            const longitude = ((x + 0.5) / canvas.width) * 360;
            latLonToDirection(latitude, longitude, direction);

            // Zonal banding, as a function of latitude alone. Uranus's winds run to
            // 250 m/s and, like Jupiter's and Saturn's, they shear anything with a
            // longitude to it into a stripe — but here there is the further point that
            // the belts genuinely have been resolved from Earth since about 2004 as the
            // planet came round toward equinox, and they are broad, few, and faint.
            //
            // Squared so the bands are not a plain sinusoid: real zones are wide and
            // flat with narrower darker belts between them.
            const bands = Math.cos(sinLatitude * 9.2) ** 2;

            // The polar hood, and the one large-scale feature anybody has ever pointed
            // at without stretching the image first. Hubble and Keck have watched the
            // northern one brighten steadily since the mid-2000s as that pole turned
            // sunward; it is a haze cap, thickening where the atmosphere has had
            // decades of unbroken daylight to work on it. Drawn on both poles, because
            // the model has no way to know which one the Sun is on — and does not need
            // one, since only the lit pole is ever visible.
            const hood = Math.abs(sinLatitude) ** 6;

            // Mottling, so the bands do not read as painted-on stripes. Stretched along
            // latitude for the same reason Venus's is, and kept below a percent because
            // that is roughly where the real thing sits: this is the amplitude at which
            // Voyager saw nothing.
            bandDirection.set(direction.x, direction.y * 6, direction.z);
            const mottle = fbm(bandDirection, 913, 3);

            const value = 1 + bands * 0.018 + hood * 0.055 + mottle * 0.008;
            values[y * canvas.width + x] = value;
            total += value;
            if (value > peak) peak = value;
        }
    }

    peakOverMean = peak / (total / values.length);
    for (let i = 0; i < values.length; i++) {
        const value = values[i] / peak;
        image.data[i * 4] = encodeSRGB(value * TINT[0]) * 255;
        image.data[i * 4 + 1] = encodeSRGB(value * TINT[1]) * 255;
        image.data[i * 4 + 2] = encodeSRGB(value * TINT[2]) * 255;
        image.data[i * 4 + 3] = 255;
    }

    ctx.putImageData(image, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
}

/**
 * The same geometric -> hemispherical conversion Venus's deck and the Martian moons
 * need, and needed here for the same reason they need it: this map is generated, so it
 * carries no brightness of its own and the measurement has to be supplied.
 *
 * Jupiter and Saturn skip this step because their mosaics are real visible-light
 * imagery that already holds the planet's brightness — tinting those would be
 * correcting something that is not wrong. There is nothing to correct here; there is
 * only the number, 0.51 geometric, and 1.5x it for what a Lambert sphere wants.
 *
 * 0.765 is high — a shade under Jupiter's and above Saturn's — which sounds wrong for
 * the planet everyone thinks of as dim. Uranus is not dim; it is *far*. It reflects
 * about half the light that lands on it, and only 1/368th as much lands.
 */
const DIFFUSE_ALBEDO = URANUS_GEOMETRIC_ALBEDO * 1.5;

/**
 * Built before the material, because the material's colour depends on what the build
 * measured — see `peakOverMean`.
 */
const surfaceTexture = buildSurfaceTexture();

/**
 * The segment counts are the gas giants', not the rocky planets', and on this body that
 * is the one place the geometry budget genuinely matters.
 *
 * Jupiter and Saturn take them because their discs are the largest in the scene and a
 * polygonal limb would show against the sky. Uranus's disc is well under half Jupiter's
 * — but Uranus has nothing on its face, so when you fly to it the silhouette is the
 * entire subject, and a faceted edge is the only artefact there is room to notice.
 */
const geometry = new SphereGeometry(
    URANUS_EQUATORIAL_RADIUS,
    quality.gasGiantSegments[0],
    quality.gasGiantSegments[1]
);
/**
 * The oblateness, on the polar axis, so the mesh stays a unit sphere for raycasting and
 * the constant above stays the equatorial radius it is named for — the same one line
 * Jupiter and Saturn use.
 *
 * At 0.0229 this is the smallest of the three and the only arguable one. It is kept
 * because it is real, because it is seven times Earth's, and because the flattening runs
 * *across* the disc rather than up and down it here: the pole is nearly in the orbit
 * plane, so unlike Jupiter and Saturn, Uranus is usually squashed side to side.
 */
geometry.scale(1, 1 - URANUS_FLATTENING, 1);

const material = new MeshStandardMaterial({
    map: surfaceTexture,
    color: new Color().setScalar(DIFFUSE_ALBEDO * peakOverMean),
    /**
     * No atmosphere shell, and no height map, for the gas giants' reasons exactly:
     * there is no ground to raise relief on, and the limb *darkens* rather than
     * glowing. Uranus darkens harder than either of the others, in fact — methane
     * absorption lengthens the slant path at the edge — which is a thing a Fresnel
     * rind would actively fight.
     */
    roughness: 1,
    metalness: 0,
});

export const uranus = new Mesh(geometry, material);
