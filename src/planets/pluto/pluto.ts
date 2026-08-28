import {
    CanvasTexture,
    Mesh,
    MeshStandardMaterial,
    SRGBColorSpace,
    SphereGeometry,
    TextureLoader,
} from 'three';
import { PLUTO_RADIUS } from '../../constants/planets.const';
import { craterDiameter, craterProfile, CRATER_REACH } from '../../craters';
import { mulberry32 } from '../../noise';
import { quality } from '../../quality';
import { texturePath } from '../../textures';

/**
 * Pluto — the New Horizons global mosaic for colour, and a generated height field for
 * relief. The split is not a compromise; it is what the data supports.
 *
 * ## Why the colour is real and the relief is not
 *
 * The argument that keeps Uranus and Neptune generated does not apply here. Uranus has
 * nothing on it to map and Neptune has plenty that will not stay put; Pluto's surface is
 * covered, static, and published. What there is no global product for is **topography**.
 * New Horizons flew past once and could not orbit — 13.8 km/s, and Pluto has nowhere near
 * the gravity to catch anything — so elevations exist only as stereo patches over part of
 * one hemisphere. There is no Pluto equivalent of MOLA or LOLA and there will not be one
 * for decades.
 *
 * That matters more than it sounds. This scene lights every body with one hard light, no
 * fill and no environment map, which is the condition under which shading carries the
 * detail and a flat albedo map carries almost none — the argument `foil.ts` makes about
 * the lunar module's blankets. A real colour map with no relief renders as a photograph
 * pasted onto a ball.
 *
 * ## The relief is read *off* the mosaic, not invented beside it
 *
 * This is the part that has to be right. A generated Sputnik Planitia laid over a
 * photographed one would carve a basin next to where the bright ice actually is, and the
 * two would disagree by tens of degrees. So the height field is built **after** the
 * texture loads, from the texture's own pixels: the ice sheet is found by looking for it,
 * not by being told where it is.
 *
 * That is also what makes the crater field mean something. Pluto's dark equatorial
 * terrain is saturated with craters — four billion years old. Sputnik Planitia has **not
 * one**; none has ever been found, which caps that surface's age at about ten million
 * years on a world at 38 K, because it is convecting. So `stampCraters` **rejects** any
 * candidate that lands on bright ice rather than merely thinning them, and it knows where
 * that ice is because the photograph says so.
 *
 * ## A third of the mosaic is not a photograph either
 *
 * New Horizons arrived in the middle of a 124-year southern winter, so everything below
 * about −50° was in polar night and is pure black in the published product — 34% of the
 * map. `scripts/prepare-pluto-texture.mjs` fills it, continuing the terrain above the
 * terminator downward with noise and no invented features, and also takes most of the
 * enhanced-colour stretch back out (mean saturation 29% → 13%) the way `mercury_color.jpg`
 * already does. The seam it fills from is real: it is the daylight terminator of July
 * 2015. See CREDITS.md.
 *
 * ## Sputnik Planitia is where it is for a reason
 *
 * The mosaic puts it near 178°E, and `orbits.ts` puts longitude 0 at the sub-Charon
 * meridian by the IAU's own definition — so it sits almost exactly on the **anti-Charon
 * point**. A 1,000 km basin filled kilometres deep with nitrogen ice is a large positive
 * mass anomaly, a tidally locked pair pulls such a load onto its tidal axis, and Pluto
 * appears to have rolled over until the basin got there: the best evidence anywhere for
 * true polar wander. Nothing here arranges for it.
 *
 * It is also the check that caught the texture being 180° out. Read as a PDS grid the
 * mosaic puts Sputnik at 189°E and Cthulhu Macula at 85°E, against their real 178° and
 * ~80°; read as a three.js texture it puts them at 9°E and 265°E, which is nowhere. The
 * roll lives in the prep script.
 */

const textureLoader = new TextureLoader();

/**
 * The working resolution of the height field, independent of whatever the quality tier
 * hands the colour map. Relief here is craters and one basin — there is nothing in it
 * finer than this, and building it at the colour map's 4096 would cost four times as much
 * for detail that does not exist.
 */
const RELIEF_WIDTH = 2048;

/** Above this luminance the mosaic is nitrogen ice: bright, and never cratered. */
const ICE_THRESHOLD = 176;
/** And below this it is old tholin ground, which takes craters far more readily. */
const DARK_THRESHOLD = 96;

const smoothstep = (edge0: number, edge1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
};

/**
 * Craters, stamped rather than sampled.
 *
 * Their sizes come from `craters.ts`'s power law — the same one the Martian moons and the
 * lunar surface draw from, deliberately scale-free, and it does not know it is being asked
 * for Pluto this time. `craterProfile` gives the bowl and rim at any size, and it is used
 * here for *relief* rather than for geometry: the profile goes into the height buffer and
 * the normal map does the rest.
 *
 * The floor of 1.1° is set by what the map can hold, not by what Pluto has. At 2048 texels
 * round a 360° field one degree is 5.7 texels, so a crater under a degree occupies four of
 * them and reads as a speck. A first pass ran from 0.35°, which the power law made *most*
 * of them, and produced a visibly bare planet.
 */
const CRATER_COUNT = 280;
const CRATER_MIN_DEG = 1.1;
const CRATER_MAX_DEG = 11;
/**
 * Nothing above this latitude. An equirectangular stamp near the pole spans most of a row
 * for a footprint a few degrees across, and the whole southern cap is generated fill
 * anyway — the crater field has no business being confident there.
 */
const CRATER_MAX_LAT_DEG = 76;

function stampCraters(relief: Float32Array, ice: Float32Array, dark: Float32Array, width: number, height: number): void {
    const random = mulberry32(19300218); // Tombaugh's plates, 18 February 1930
    let cx = 0, cy = 0, cz = 0;

    for (let attempt = 0, placed = 0; placed < CRATER_COUNT && attempt < CRATER_COUNT * 10; attempt++) {
        // Uniform on the sphere: latitude from the arcsine of a uniform z, or the poles
        // collect several times the equator's density.
        const latDeg = (Math.asin(random() * 2 - 1) * 180) / Math.PI;
        if (Math.abs(latDeg) > CRATER_MAX_LAT_DEG) continue;
        const px = Math.floor(random() * width);
        const py = Math.floor(((90 - latDeg) / 180) * height);
        const at = py * width + px;

        // Never on the ice. Not rarely — never; see the header.
        if (ice[at] > 0.15) continue;
        // Old dark ground takes far more of them than the fresher terrain does.
        if (random() > 0.3 + dark[at] * 0.9) continue;

        const radiusDeg = craterDiameter(random(), CRATER_MIN_DEG, CRATER_MAX_DEG) / 2;
        placed++;

        const lat = (latDeg * Math.PI) / 180;
        const lon = ((px + 0.5) / width) * Math.PI * 2;
        cx = Math.cos(lat) * Math.cos(lon);
        cy = Math.sin(lat);
        cz = -Math.cos(lat) * Math.sin(lon);

        const depth = 0.35 + random() * 0.5;
        // The bounding box, which is the whole optimisation: 280 craters against four
        // million texels is not a per-pixel problem. Each runs over its own footprint.
        const reach = radiusDeg * CRATER_REACH;
        const rowSpan = Math.ceil((reach / 180) * height) + 1;
        const cosLat = Math.max(0.06, Math.cos(lat));
        const colSpan = Math.min(width / 2, Math.ceil((reach / cosLat / 360) * width) + 1);
        const chordScale = 2 * Math.sin((radiusDeg * Math.PI) / 360);

        for (let dy = -rowSpan; dy <= rowSpan; dy++) {
            const y = py + dy;
            if (y < 0 || y >= height) continue;
            const rowLat = ((90 - ((y + 0.5) / height) * 180) * Math.PI) / 180;
            const sinRow = Math.sin(rowLat);
            const cosRow = Math.cos(rowLat);

            for (let dx = -colSpan; dx <= colSpan; dx++) {
                const x = (((px + dx) % width) + width) % width;
                const rowLon = ((x + 0.5) / width) * Math.PI * 2;
                const dot =
                    cosRow * Math.cos(rowLon) * cx + sinRow * cy + -cosRow * Math.sin(rowLon) * cz;
                // Chord distance in units of the crater's own chord radius — the same
                // "distance over radius" `craterProfile` wants, and no `Math.acos`:
                // chord² = 2(1 − dot), within 3% of arc out to 50°.
                const s = Math.sqrt(Math.max(0, 2 * (1 - dot))) / chordScale;
                if (s > CRATER_REACH) continue;
                const index = y * width + x;
                // Faded out against the ice rather than cut off at it, so a crater that
                // straddles Sputnik's shore thins toward the sheet instead of being
                // sliced down the middle.
                relief[index] += craterProfile(s * radiusDeg, radiusDeg, depth * radiusDeg) * 1.6 * (1 - ice[index]);
            }
        }
    }
}

/**
 * The height field, and then its normal map — both derived from the loaded mosaic.
 *
 * Note what the mosaic is *not* used for: its luminance is albedo, not elevation, and on
 * Pluto the two are actively anti-correlated. Sputnik Planitia is the brightest thing on
 * the body and also the lowest, a basin two to three kilometres deep. Feeding luminance
 * in as a height map — the usual shortcut — would raise the one place that is a hole.
 * So brightness is read only to *classify* the ground, and the relief is built from that
 * classification.
 */
function buildNormalMap(image: CanvasImageSource): CanvasTexture | null {
    const width = RELIEF_WIDTH;
    const height = RELIEF_WIDTH / 2;

    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    const sourceCtx = source.getContext('2d', { willReadFrequently: true });
    if (!sourceCtx) return null;
    sourceCtx.drawImage(image, 0, 0, width, height);
    const pixels = sourceCtx.getImageData(0, 0, width, height).data;

    const count = width * height;
    const relief = new Float32Array(count);
    const ice = new Float32Array(count);
    const dark = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        const r = pixels[i * 4];
        const g = pixels[i * 4 + 1];
        const b = pixels[i * 4 + 2];
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        ice[i] = smoothstep(ICE_THRESHOLD, ICE_THRESHOLD + 34, luminance);
        dark[i] = smoothstep(DARK_THRESHOLD + 34, DARK_THRESHOLD, luminance);
        // The basin, and a little general roughness on everything else. The ice sheet
        // goes *down*; the tholin uplands are the high ground it drains into.
        relief[i] = -ice[i] * 0.5 + dark[i] * 0.12;
    }

    stampCraters(relief, ice, dark, width, height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const out = ctx.createImageData(width, height);

    // Central differences, wrapping in longitude and clamped at the poles. The horizontal
    // step is divided by cos(latitude): a texel is the same number of degrees of longitude
    // everywhere but a rapidly shrinking number of metres, so without it every slope near
    // the poles is exaggerated by 1/cos and the caps boil.
    const STRENGTH = 2.2;
    for (let y = 0; y < height; y++) {
        const latDeg = 90 - ((y + 0.5) / height) * 180;
        const cosLat = Math.max(0.15, Math.cos((latDeg * Math.PI) / 180));
        const up = Math.max(0, y - 1) * width;
        const down = Math.min(height - 1, y + 1) * width;
        const row = y * width;

        for (let x = 0; x < width; x++) {
            const left = (x - 1 + width) % width;
            const right = (x + 1) % width;
            const dx = ((relief[row + right] - relief[row + left]) * STRENGTH) / cosLat;
            const dy = (relief[down + x] - relief[up + x]) * STRENGTH;
            const inverse = 1 / Math.sqrt(dx * dx + dy * dy + 1);
            const index = (row + x) * 4;
            out.data[index] = Math.round((-dx * inverse * 0.5 + 0.5) * 255);
            out.data[index + 1] = Math.round((-dy * inverse * 0.5 + 0.5) * 255);
            out.data[index + 2] = Math.round((inverse * 0.5 + 0.5) * 255);
            out.data[index + 3] = 255;
        }
    }
    ctx.putImageData(out, 0, 0);

    const texture = new CanvasTexture(canvas);
    // Data, not colour: no sRGB decode.
    texture.anisotropy = 8;
    return texture;
}

const colorMap = textureLoader.load(texturePath('pluto_color.jpg'), (texture) => {
    // Built on load rather than at import: the relief is derived from these very pixels,
    // and until they exist there is nothing to derive it from. The material picks the map
    // up afterwards, which costs a frame or two behind the splash and buys a basin that
    // is in the same place as the ice sheet it belongs to.
    const normalMap = buildNormalMap(texture.image);
    if (!normalMap) return;
    material.normalMap = normalMap;
    material.needsUpdate = true;
});
colorMap.colorSpace = SRGBColorSpace;
colorMap.anisotropy = 8;

const geometry = new SphereGeometry(
    PLUTO_RADIUS,
    quality.planetSegments[0],
    quality.planetSegments[1]
);
// **No polar scale.** The four giants are all squashed on this axis and this one is not:
// a 6.4-day rotation cannot raise a bulge, and New Horizons found Pluto round to within
// its own 1.6 km measurement error. Adding a flattening here would be inventing one.

const material = new MeshStandardMaterial({
    map: colorMap,
    /**
     * White, and that is not a default — it is this project's albedo arithmetic running
     * out of room, which is worth writing down because it happens on exactly two bodies.
     *
     * `mercury.ts` sets the method: the Moon and Mercury both wear brightness-normalised
     * mosaics, so neither means anything absolute, and the honest move is to hold the
     * *ratio* of two finished surfaces. The Moon is tinted 0x8a for an albedo of 0.12, and
     * Mercury comes out at 0x8a x (0.106/0.12) x (151/112) = 0xa4. Run Pluto through the
     * same expression — geometric albedo 0.52, this map's mean luminance 102 against the
     * Moon's 151 — and it asks for 0x8a x 4.33 x 1.48, which is 885 on a scale that stops
     * at 255. It is over the top before the second factor is even applied.
     *
     * That is not an error in the arithmetic; it is the same wall `jupiter/moons.ts` hits
     * with Europa, where a ×1.5 conversion runs past 1.0 because Lambert genuinely cannot
     * express the most reflective surfaces. Pluto is bright — 0.52 geometric, brighter
     * than Uranus, which surprises anyone picturing a dark rock at the edge of things,
     * because the surface is fresh ice continually renewed by nitrogen subliming near
     * perihelion and snowing out again on the way back to aphelion.
     *
     * So it goes to white and still renders about three and a half times darker, relative
     * to the Moon, than the measurement says. Nothing is lost by that here: the two are
     * never in one frame, and absolute level is `updateExposure`'s job — at 39 AU it hands
     * back a factor of 2431.
     */
    color: 0xffffff,
    // Airless to within ten microbars, so nothing has ever weathered or polished it. As
    // with Mercury and the Moon, the relief along the terminator does the work of making
    // it read as solid.
    roughness: 0.98,
    metalness: 0,
    // No atmosphere shell. Pluto does have one, and New Horizons' departure shot of it
    // backlit — twenty haze layers glowing round a black disc — is the most beautiful
    // image the mission returned. But it is about 1 Pa at the surface and freezes onto
    // the ground as the orbit carries Pluto back toward aphelion; a limb glow sized to be
    // visible would be several thousand times the real thing.
});
material.normalScale.set(0.8, 0.8);

export const pluto = new Mesh(geometry, material);
