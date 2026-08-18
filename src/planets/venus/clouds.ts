import {
    CanvasTexture,
    Color,
    Mesh,
    MeshStandardMaterial,
    SRGBColorSpace,
    SphereGeometry,
    Vector3,
} from 'three';
import { fbm } from '../../noise';
import { latLonToDirection } from '../../geo';
import {
    VENUS_CLOUD_RADIUS,
    VENUS_GEOMETRIC_ALBEDO,
} from '../../constants/planets.const';
import { quality } from '../../quality';

/**
 * Venus's cloud deck — which is to say, Venus.
 *
 * Earth's clouds are a translucent shell you see the planet through. This one is the
 * planet: an unbroken layer of sulphuric acid droplets 65 km up, opaque from pole to
 * pole, with no gap anywhere and no hole that has ever opened. Nothing below it is
 * visible at any wavelength the eye works at. So this mesh is not a veil over
 * `venus.ts`, it is what Venus *looks like*, and the surface underneath is the thing
 * that has to be revealed rather than the other way round.
 *
 * It is generated rather than textured, and for the same reason the Martian moons
 * are: there is no map to use. Not because none was made, but because in visible
 * light there is essentially nothing on it to map. The famous dark Y-shaped markings
 * are ultraviolet features — pasting a UV mosaic on here would draw contrast that no
 * eye has ever seen, which would be a more confident lie than a bland deck is. What
 * is real and does show is the banding: a zonal structure drawn out by winds running
 * sixty times faster than the planet turns.
 */

/**
 * Half the width the other maps here are, and that is a deliberate trade rather than
 * a corner cut.
 *
 * This one is not loaded from a file — it is computed on the main thread while the
 * module is being imported, so its cost lands squarely in the startup stall the
 * splash screen is covering. 2048 wide takes ~320 ms; 1024 takes ~67 ms. What that
 * buys is only the finest fBm octave, which carries a sixteenth of the amplitude of
 * the first and so moves the final brightness by about a tenth of a percent — on a
 * deck whose entire contrast range is under five percent to begin with. There is
 * nothing sharp on Venus to lose.
 */
const SIZE = 1024;
const direction = new Vector3();
const streakDirection = new Vector3();

/**
 * Sulphur compounds in the deck absorb at the blue end, so what comes back is a
 * warm off-white. Ratios only — the absolute brightness is set by the material's
 * `color` below, from the measured albedo, and duplicating it here would double-count.
 */
const TINT = [1.0, 0.952, 0.825];

function buildCloudTexture(): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE / 2;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(canvas.width, canvas.height);

    // Built in two passes so the pattern can be normalised against its own peak
    // rather than clamped. Written straight out, the brightest few percent of the
    // deck ran past 255 in the red channel and clipped — which flattened exactly the
    // banding this is here to produce, and pulled the hue toward cyan where it did.
    const values = new Float32Array(canvas.width * canvas.height);
    let peak = 0;

    for (let y = 0; y < canvas.height; y++) {
        const latitude = 90 - (y / canvas.height) * 180;
        const polar = Math.abs(Math.sin((latitude * Math.PI) / 180));

        for (let x = 0; x < canvas.width; x++) {
            const longitude = (x / canvas.width) * 360;
            latLonToDirection(latitude, longitude, direction);

            // Squashing the noise along the spin axis stretches every feature out in
            // longitude, which is not a stylistic choice — it is what a 100 m/s zonal
            // wind does to anything it gets hold of. Nothing here survives being
            // dragged right round the planet every four days except the bands.
            streakDirection.set(direction.x, direction.y * 5.5, direction.z);
            const streaked = fbm(streakDirection, 77, 5);
            // A second, rounder octave set for the mottling inside the bands, so they
            // do not read as painted stripes.
            const mottle = fbm(direction, 314, 4);

            // Deliberately tiny. In visible light Venus is very nearly a blank disc,
            // and the whole difficulty of looking at it through a telescope is that
            // there is nothing to fix on. Anything more emphatic than a few percent
            // would be drawing the UV picture in the wrong band.
            //
            // The polar hoods on the end are the one large-scale brightening that is
            // there in visible light too, sitting over each of the planet-sized
            // vortices that cap the circulation.
            const value = 1 + streaked * 0.045 + mottle * 0.022 + polar ** 4 * 0.05;

            values[y * canvas.width + x] = value;
            if (value > peak) peak = value;
        }
    }

    for (let i = 0; i < values.length; i++) {
        const value = (values[i] / peak) * 255;
        image.data[i * 4] = value * TINT[0];
        image.data[i * 4 + 1] = value * TINT[1];
        image.data[i * 4 + 2] = value * TINT[2];
        image.data[i * 4 + 3] = 255;
    }

    ctx.putImageData(image, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
}

/**
 * The same conversion the Martian moons need, at the opposite extreme.
 *
 * The quoted 0.65 is the *geometric* albedo — brightness at full phase against a
 * perfect diffusing disc — and a diffuse material wants the hemispherical
 * reflectance, which for a Lambert sphere is half again as much. That lands at 0.975,
 * which looks like a mistake and is not: this is the most reflective planet in the
 * solar system, sitting where the sunlight is twice as strong as it is here. Venus is
 * *supposed* to blow out. It is why it casts shadows on Earth.
 *
 * The tone mapper takes the top off, so what survives is what you actually see
 * through a telescope: a dazzling blank near the subsolar point, with the banding
 * only readable as the light rakes toward the terminator.
 */
const DIFFUSE_ALBEDO = VENUS_GEOMETRIC_ALBEDO * 1.5;

const material = new MeshStandardMaterial({
    map: buildCloudTexture(),
    color: new Color().setScalar(DIFFUSE_ALBEDO),
    // Opaque, unlike Earth's shell, which is the entire point — this is what hides
    // the planet. No `transparent`, no `depthWrite: false`: it is a solid surface as
    // far as the renderer is concerned, and the radar map inside it is occluded
    // exactly the way the real ground is.
    roughness: 1,
    metalness: 0,
});

export const venusClouds = new Mesh(
    new SphereGeometry(VENUS_CLOUD_RADIUS, quality.planetSegments[0], quality.planetSegments[1]),
    material
);
