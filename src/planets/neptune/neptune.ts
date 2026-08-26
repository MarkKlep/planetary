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
    NEPTUNE_EQUATORIAL_RADIUS,
    NEPTUNE_FLATTENING,
    NEPTUNE_GEOMETRIC_ALBEDO,
} from '../../constants/planets.const';
import { fbm } from '../../noise';
import { latLonToDirection } from '../../geo';
import { quality } from '../../quality';

/**
 * Neptune — generated like Uranus, and for a *different* reason, which is the whole
 * interest of having the two of them here.
 *
 * Uranus has no map because there is nothing on it to map. Neptune has plenty on it: a
 * dark equatorial band, bright methane cirrus streaking the mid-latitudes, and in 1989
 * the Great Dark Spot, an anticyclone the size of Earth. The problem is the opposite
 * one. Neptune has the **fastest winds in the solar system** — near 580 m/s, 2,100 km/h,
 * supersonic relative to its own atmosphere — and its equatorial jet laps its
 * mid-latitudes so hard that nothing survives being drawn on. The Great Dark Spot was
 * gone by the time Hubble looked in 1994, five years after Voyager photographed it, and
 * a different one had opened in the northern hemisphere. Mapping Voyager's frames here
 * would be painting a storm that has not existed for thirty years onto a planet that has
 * since grown and lost several others.
 *
 * So the same rule as everywhere else in this project: real measurements where they
 * exist, generated below the resolution of what was actually observed — and for Neptune
 * that line is drawn in *time* rather than in space. What is permanent is the character
 * of the banding, and that is what this builds.
 *
 * The two ice giants together are the argument, and it is worth stating because they
 * look like the same object and are not. Same size to within 3%, same composition, same
 * distance from anything that matters — and Uranus is dead while Neptune is the
 * stormiest place there is. The reason is one number: Neptune radiates **2.6 times** the
 * energy it receives from the Sun, the largest internal heat excess of any planet, and
 * Uranus radiates about 1.06. Weather here is driven from below, which is why the planet
 * furthest from the Sun is also the most active.
 */

/** 1024 x 512, matching Uranus's and Venus's, and built at import time like both. */
const SIZE = 1024;
const direction = new Vector3();
const bandDirection = new Vector3();
const streakDirection = new Vector3();

/**
 * The colour, in **linear** light, normalised so the largest channel is 1 — same
 * treatment as Uranus's, and worth reading beside it: [0.62, 0.93, 1.0] there against
 * [0.50, 0.82, 1.0] here.
 *
 * Neptune really is the bluer of the two, and the difference is real but far smaller
 * than the pictures suggest. The famous deep-cobalt Voyager portrait was contrast-
 * enhanced to bring out the banding; Irwin et al. (2024) reconstructed both planets'
 * true colours from spectra and found them close cousins, a pale greenish cyan and a
 * slightly bluer, slightly darker one. The cause is haze, not chemistry: both have the
 * same ~2% methane, but Uranus carries a thicker aerosol layer that scatters light back
 * before it reaches the methane, so more of Neptune's red end goes down and stays down.
 * That single fact makes Neptune both bluer *and* dimmer — see the albedo below, 0.41
 * against Uranus's 0.51.
 */
const TINT = [0.50, 0.82, 1.0];

/** Linear -> sRGB transfer, so the ratios above survive being written as bytes. */
function encodeSRGB(value: number): number {
    return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

/** Peak over mean, filled in by the build and multiplied back into the material — see
 *  `uranus.ts`, which explains why normalising on the mean alone clips the bright
 *  features off the top. It matters more here, the contrast being five times Uranus's. */
let peakOverMean = 1;

function buildSurfaceTexture(): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE / 2;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(canvas.width, canvas.height);

    const values = new Float32Array(canvas.width * canvas.height);
    let total = 0;
    let peak = 0;

    for (let y = 0; y < canvas.height; y++) {
        const latitude = 90 - ((y + 0.5) / canvas.height) * 180;
        const sinLatitude = Math.sin((latitude * Math.PI) / 180);

        for (let x = 0; x < canvas.width; x++) {
            const longitude = ((x + 0.5) / canvas.width) * 360;
            latLonToDirection(latitude, longitude, direction);

            // Zonal banding, several times Uranus's amplitude, because Neptune's is
            // several times more visible — the dark equatorial band and the brighter
            // mid-latitude zones show in ordinary true-colour imagery rather than only
            // under a stretch. Still modest in absolute terms: this is a planet whose
            // whole visible contrast a photographer would call flat.
            const bands = Math.cos(sinLatitude * 7.4) ** 2;
            // ...on top of a broad darkening centred on the equator, which is the one
            // large-scale feature that has been there every time anyone has looked.
            const equatorialBelt = Math.exp(-((sinLatitude / 0.28) ** 2));

            // The methane cirrus. These are the white streaks in every Voyager frame:
            // clouds condensing 50-100 km *above* the main deck, high enough to cast
            // shadows onto it — the only clouds in the outer solar system anyone has
            // measured a shadow from. Individually they last days; as a population they
            // are permanent, and it is the population this draws.
            //
            // Squashed hard along the spin axis for the reason Venus's deck is, only
            // more so: at 580 m/s nothing here keeps a shape that is not a streak.
            streakDirection.set(direction.x, direction.y * 14, direction.z);
            const streak = Math.max(0, fbm(streakDirection, 451, 4) - 0.22);
            // Concentrated at mid-latitudes, where they actually form, and kept off the
            // equator and the poles.
            const cirrusBand = Math.exp(-(((Math.abs(sinLatitude) - 0.62) / 0.22) ** 2));

            bandDirection.set(direction.x, direction.y * 5, direction.z);
            const mottle = fbm(bandDirection, 1187, 3);

            /**
             * No Great Dark Spot, and that is a decision rather than an omission.
             *
             * It was the single most recognisable thing about Neptune for five years and
             * it does not exist. Hubble found it gone in 1994; others have opened and
             * closed since, in both hemispheres, none in the same place. Drawing one
             * would be drawing a date, not a planet — the same objection `jupiter.ts`
             * raises about its own map being a snapshot, except that here the feature is
             * not merely out of date but absent.
             */
            const value =
                1 + bands * 0.055 - equatorialBelt * 0.06 + streak * cirrusBand * 0.30 + mottle * 0.012;

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
 * Geometric -> hemispherical, the conversion every authored albedo in this project
 * needs. 0.41 → 0.615, against Uranus's 0.51 → 0.765.
 *
 * A fifth darker than its twin, and it will not look it: Neptune is half again as far
 * out, so it receives 2.4 times less light and the exposure mechanism in `script.ts`
 * hands back exactly that. What the number does control is the two of them side by side
 * in the same frame, which is the only place the difference is a difference.
 */
const DIFFUSE_ALBEDO = NEPTUNE_GEOMETRIC_ALBEDO * 1.5;

/** Built before the material, whose colour depends on what the build measured. */
const surfaceTexture = buildSurfaceTexture();

// The gas giants' segment counts, for the reason Uranus takes them: the disc is smaller
// than Jupiter's, but a planet framed on nothing but its own limb has nowhere to hide a
// faceted edge.
const geometry = new SphereGeometry(
    NEPTUNE_EQUATORIAL_RADIUS,
    quality.gasGiantSegments[0],
    quality.gasGiantSegments[1]
);
// Oblateness on the polar axis, the same one line the other three giants use. At 0.0171
// this is the smallest of the four and still five times Earth's, which is drawn round.
geometry.scale(1, 1 - NEPTUNE_FLATTENING, 1);

const material = new MeshStandardMaterial({
    map: surfaceTexture,
    color: new Color().setScalar(DIFFUSE_ALBEDO * peakOverMean),
    // No height map and no atmosphere shell, for the other three giants' reasons: no
    // ground to raise relief on, and a limb that darkens rather than glowing.
    roughness: 1,
    metalness: 0,
});

export const neptune = new Mesh(geometry, material);
