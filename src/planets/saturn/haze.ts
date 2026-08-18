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
import { TITAN_GEOMETRIC_ALBEDO, TITAN_HAZE_RADIUS } from '../../constants/planets.const';
import { quality } from '../../quality';

/**
 * Titan's haze — which is to say, Titan.
 *
 * The only moon in the solar system with a real atmosphere, and it is not a thin one:
 * 1.45 bar at the surface, half again Earth's, on a body a third of Earth's radius. It
 * is 95% nitrogen, the only other predominantly nitrogen atmosphere anywhere, and the
 * remaining few percent of methane is what does all the damage — sunlight cracks it
 * apart, the fragments polymerise into heavier and heavier organics, and the result is
 * an unbroken orange photochemical smog that has been raining tholins onto the surface
 * for four billion years.
 *
 * That smog is opaque. Voyager 1 gave up a shot at Pluto for a close pass in 1980 and
 * came back with a picture of a blank orange ball. So this shell is not a veil over
 * `titan.ts` — it *is* what Titan looks like, and the near-infrared map underneath is
 * the thing that has to be revealed. Same argument as Venus, and the same handling: the
 * deck is opaque, on by default, and toggleable from the nav panel.
 *
 * It is generated rather than textured for Venus's reason exactly. There are plenty of
 * images of Titan; there is essentially nothing *on* it to map. What visible-light
 * imaging shows, and all it shows, is a very slight north-south brightness asymmetry
 * that reverses over Titan's 29½-year seasons, a darker polar hood, and the detached
 * haze layer standing off the limb. Pasting a 938 nm surface mosaic onto a visible-light
 * scene would draw continents no eye has ever seen — which is the more confident lie.
 */

/**
 * Half the width of the mapped bodies, matching Venus's deck and for the same reason:
 * this is computed on the main thread at import, so its cost lands in the startup stall
 * the splash covers. There is nothing sharp on Titan to lose — the entire contrast range
 * here is a few percent.
 */
const SIZE = 1024;
const direction = new Vector3();
const streakDirection = new Vector3();

/**
 * Tholins absorb hard at the blue end and pass the red, which is the whole of Titan's
 * colour. Ratios only — the absolute level comes from the material's `color` below, off
 * the measured albedo, and duplicating it here would double-count.
 */
const TINT = [1.0, 0.76, 0.42];

function buildHazeTexture(): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE / 2;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(canvas.width, canvas.height);

    // Two passes, so the pattern is normalised against its own peak rather than
    // clipped — the same trap Venus's deck hit, where the brightest few percent ran
    // past 255 in red and pulled the hue toward cyan exactly where it should be
    // strongest.
    const values = new Float32Array(canvas.width * canvas.height);
    let peak = 0;

    for (let y = 0; y < canvas.height; y++) {
        const latitude = 90 - (y / canvas.height) * 180;
        const polar = Math.abs(Math.sin((latitude * Math.PI) / 180));

        for (let x = 0; x < canvas.width; x++) {
            const longitude = (x / canvas.width) * 360;
            latLonToDirection(latitude, longitude, direction);

            // Squashed along the spin axis for the reason Venus's is: Titan's haze is
            // organised into zonal bands by a superrotating stratosphere that laps the
            // surface, and nothing survives being dragged round the moon except
            // structure that is already latitude-aligned.
            streakDirection.set(direction.x, direction.y * 7.0, direction.z);
            const streaked = fbm(streakDirection, 41, 4);

            // Smaller even than Venus's. Titan in visible light is the blandest disc in
            // the solar system; the honest answer is very nearly a flat ball, and the
            // banding is here to keep the terminator from reading as a paper cut-out
            // rather than because you could see it.
            let value = 1 + streaked * 0.028;

            // The one large-scale feature visible-light imaging does show: a darker,
            // slightly bluer hood over the winter pole, thickening where the
            // circulation dumps haze. Real, seasonal, and it swapped hemispheres
            // between Voyager and Cassini.
            value -= polar ** 6 * 0.10;

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
 * The same geometric → hemispherical conversion everything else here needs, at the
 * opposite end from Enceladus: 0.22 × 3/2 = 0.33.
 *
 * Titan is the darkest thing in the Saturn system that is not Iapetus's leading side,
 * and it looks bright in photographs for the same reason Enceladus looks ordinary in
 * them — each is shot alone, at whatever exposure suits it.
 */
const DIFFUSE_ALBEDO = TITAN_GEOMETRIC_ALBEDO * 1.5;

export const titanHaze = new Mesh(
    new SphereGeometry(TITAN_HAZE_RADIUS, quality.shellSegments, quality.shellSegments),
    new MeshStandardMaterial({
        map: buildHazeTexture(),
        color: new Color().setScalar(DIFFUSE_ALBEDO),
        // Opaque, like Venus's deck and unlike Earth's clouds — no `transparent`, no
        // `depthWrite: false`. To the renderer this is a solid surface, and the map
        // underneath is occluded exactly the way the real ground is.
        roughness: 1,
        metalness: 0,
    })
);
