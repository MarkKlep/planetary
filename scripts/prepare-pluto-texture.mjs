/**
 * Turns the New Horizons global mosaic into a texture this scene can use.
 *
 *   node scripts/prepare-pluto-texture.mjs ~/Downloads/pluto-surface.jpg
 *
 * Committed rather than run once and forgotten, because the published mosaic needs two
 * things done to it that are not obvious and would otherwise have to be rediscovered:
 *
 * 1. **A 180° roll.** USGS/PDS grids start at 0°E; an equirectangular texture on a
 *    three.js sphere starts at 180°W (see `geo.ts`, and the same note in CREDITS.md for
 *    `mars_height.png`, `mimas_color.jpg` and `titan_color.jpg`). Verified rather than
 *    assumed: read as a PDS grid, this mosaic puts Sputnik Planitia at 189°E and Cthulhu
 *    Macula at 85°E, against their real 178°E and ~80°E. Read the other way round they
 *    land at 9°E and 265°E, which is nowhere.
 *
 * 2. **A fill for the third of Pluto nobody has seen.** New Horizons arrived in the
 *    middle of a 124-year southern winter, so everything below about −55° was in polar
 *    night and is pure black in the mosaic — 30.5% of the map. Left alone that renders as
 *    a black cap over the bottom of the planet.
 *
 * The fill is generated, and it is generated *honestly*: each column is continued
 * downward from the terrain immediately above the terminator, converging on a common
 * tone by the pole so the columns do not fan into a pinwheel, with noise for texture and
 * a feathered seam. It invents no features — no south polar cap, no basins — because
 * nothing is known to be there. Where the boundary falls is itself real: it is the
 * daylight terminator of July 2015.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const source = process.argv[2];
if (!source) {
    console.error('usage: node scripts/prepare-pluto-texture.mjs <source.jpg>');
    process.exit(1);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_WIDTH = 4096;
/**
 * How much of the published stretch survives.
 *
 * Measured rather than picked. The circulating mosaic has a mean saturation of 28.6%,
 * which for a tan surface is close to plausible already — it is not the psychedelic
 * enhanced-colour product, and an early pass at 0.38 took Pluto to 12.9% and rendered a
 * grey moon. 0.85 is a trim rather than a correction: enough to pull the strongest
 * false-colour units back toward the rest, not enough to bleach the body.
 */
const SATURATION = 0.85;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');

const result = await page.evaluate(async ({ data, outWidth, SATURATION }) => {
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = 'data:image/jpeg;base64,' + data; });

    // --- 1. roll 180 and resample in one draw ---
    const W = outWidth, H = outWidth / 2;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    // Two halves swapped left-for-right: the roll and the downscale cost one draw each
    // and no intermediate buffer.
    ctx.drawImage(img, img.width / 2, 0, img.width / 2, img.height, 0, 0, W / 2, H);
    ctx.drawImage(img, 0, 0, img.width / 2, img.height, W / 2, 0, W / 2, H);

    const image = ctx.getImageData(0, 0, W, H);
    const d = image.data;
    const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    /**
     * No-data, and it has to be told from *dark terrain* rather than merely from dark.
     *
     * Cthulhu Macula has a geometric albedo near 0.10 and is the darkest large surface in
     * the outer solar system — a plain luminance threshold finds it long before it finds
     * the terminator, which is how one attempt at this reported half the map missing.
     * What separates them is chroma: unmapped pixels are near-neutral black in all three
     * channels, and Cthulhu is emphatically red.
     */
    const isNoData = (i) => d[i] < 20 && d[i + 1] < 18 && d[i + 2] < 18;
    /** Rows discarded above the boundary, to clear the dim fringe along the terminator. */
    const ERODE = 10;
    /** How much of a column below a row must be no-data for that row to be the boundary. */
    // 0.9 rather than the 0.8 that would also swallow a thin lit sliver still visible on
    // the southern limb. Loosening it costs 5% more of the real mosaic to hide one
    // blemish, and real data is worth more than that.
    const RUN_FRACTION = 0.9;

    // --- 2. per-column terminator, and the terrain just above it ---
    // Found as "the highest row below which the column is almost entirely no-data",
    // rather than by scanning for the first or last dark pixel. Both of those fail: from
    // the bottom, a sliver of ground catching the sun past the limb anchors the boundary
    // beneath the gap and leaves it unfilled; from the top, any dark terrain stops the
    // scan early. A suffix fraction is immune to both.
    const boundary = new Int32Array(W).fill(H);
    const suffix = new Int32Array(H + 1);
    for (let x = 0; x < W; x++) {
        suffix[H] = 0;
        for (let y = H - 1; y >= 0; y--) suffix[y] = suffix[y + 1] + (isNoData((y * W + x) * 4) ? 1 : 0);
        let found = H;
        for (let y = 0; y < H; y++) {
            if (suffix[y] >= (H - y) * RUN_FRACTION) { found = y; break; }
        }
        boundary[x] = found >= H ? H : Math.max(1, found - ERODE);
    }
    // Then a **minimum** over a window, not a mean, and only afterwards a light mean to
    // take the steps out. A mean alone lets a column whose neighbours are mapped further
    // down pull its own boundary below a sliver, leaving that sliver stranded inside the
    // fill as a dark streak — which is what it did. Taking the minimum guarantees the
    // fill starts at least as high as anything nearby needs it to.
    const raw = Int32Array.from(boundary);
    const floored = new Int32Array(W);
    for (let x = 0; x < W; x++) {
        let m = raw[x];
        for (let k = -28; k <= 28; k++) m = Math.min(m, raw[(x + k + W) % W]);
        floored[x] = m;
    }
    for (let x = 0; x < W; x++) {
        let s = 0;
        for (let k = -10; k <= 10; k++) s += floored[(x + k + W) % W];
        boundary[x] = Math.round(s / 21);
    }

    const refR = new Float64Array(W), refG = new Float64Array(W), refB = new Float64Array(W);
    const SAMPLE_ROWS = 40;
    for (let x = 0; x < W; x++) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let k = 1; k <= SAMPLE_ROWS; k++) {
            const y = boundary[x] - k;
            if (y < 0) break;
            const i = (y * W + x) * 4;
            if (isNoData(i)) continue;
            r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
        if (n) { refR[x] = r / n; refG[x] = g / n; refB[x] = b / n; }
    }
    // Smooth the reference along longitude, or every column carries its own streak down
    // to the pole.
    const smooth = (src) => src.map((_, i) => {
        let s = 0;
        for (let k = -60; k <= 60; k++) s += src[(i + k + W) % W];
        return s / 121;
    });
    const sR = smooth(refR), sG = smooth(refG), sB = smooth(refB);
    let mR = 0, mG = 0, mB = 0;
    for (let x = 0; x < W; x++) { mR += sR[x] / W; mG += sG[x] / W; mB += sB[x] / W; }

    // --- 3. fill ---
    // Cheap value noise; this is asset prep, not the render path.
    const hash = (x, y) => {
        let h = x * 374761393 + y * 668265263;
        h = (h ^ (h >> 13)) * 1274126177;
        return ((h ^ (h >> 16)) >>> 0) / 4294967295;
    };
    const vnoise = (x, y) => {
        const xi = Math.floor(x), yi = Math.floor(y);
        const fx = x - xi, fy = y - yi;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const a = hash(xi, yi), b = hash(xi + 1, yi), cc = hash(xi, yi + 1), dd = hash(xi + 1, yi + 1);
        return (a * (1 - sx) + b * sx) * (1 - sy) + (cc * (1 - sx) + dd * sx) * sy;
    };
    const fbm2 = (x, y) => {
        let s = 0, amp = 0.5, f = 1;
        for (let o = 0; o < 4; o++) { s += amp * (vnoise(x * f, y * f) - 0.5); amp *= 0.5; f *= 2.1; }
        return s;
    };

    const FEATHER = 26;
    let filled = 0;
    for (let x = 0; x < W; x++) {
        const yb = boundary[x];
        if (yb >= H) continue;
        for (let y = yb; y < H; y++) {
            const i = (y * W + x) * 4;
            // 0 at the terminator, 1 at the pole: converge on a common tone so the
            // columns meet rather than fan out.
            const t = (y - yb) / Math.max(1, H - yb);
            const ease = t * t * (3 - 2 * t);
            const n =
                1 +
                fbm2(x * 0.012, y * 0.012) * 0.34 +
                fbm2(x * 0.05, y * 0.05) * 0.22 +
                fbm2(x * 0.31, y * 0.31) * 0.1;
            let r = (sR[x] * (1 - ease) + mR * ease) * n;
            let g = (sG[x] * (1 - ease) + mG * ease) * n;
            let b = (sB[x] * (1 - ease) + mB * ease) * n;
            // Feather across the seam so the join is not a hard line of its own.
            const blend = Math.min(1, (y - yb) / FEATHER);
            if (blend < 1) {
                const src = (Math.max(0, yb - 1) * W + x) * 4;
                r = d[src] * (1 - blend) + r * blend;
                g = d[src + 1] * (1 - blend) + g * blend;
                b = d[src + 2] * (1 - blend) + b * blend;
            }
            d[i] = Math.max(0, Math.min(255, r));
            d[i + 1] = Math.max(0, Math.min(255, g));
            d[i + 2] = Math.max(0, Math.min(255, b));
            d[i + 3] = 255;
            filled++;
        }
    }
    // --- 4. take most of the stretch back out ---
    // The circulating global mosaic is the *enhanced colour* product: a stretched
    // multiband composite made to bring out compositional units for geologists, and a
    // long way from what Pluto looks like. Real Pluto is a muted butterscotch — the
    // famous saturated reds and blue-whites are a visualisation choice. Same treatment
    // `mercury_color.jpg` already gets, and for the same reason: the *structure* in the
    // bands is real and is kept, the stretch is not and mostly is not.
    //
    // Luminance is left alone. That is albedo, and it is what carries Sputnik's edge,
    // Cthulhu's darkness and every crater on the map.
    let before = 0, after = 0;
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        before += max > 0 ? (max - min) / max : 0;
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        d[i] = l + (r - l) * SATURATION;
        d[i + 1] = l + (g - l) * SATURATION;
        d[i + 2] = l + (b - l) * SATURATION;
        const max2 = Math.max(d[i], d[i + 1], d[i + 2]), min2 = Math.min(d[i], d[i + 1], d[i + 2]);
        after += max2 > 0 ? (max2 - min2) / max2 : 0;
    }
    const n = d.length / 4;
    // The mean luminance of the finished map, which is what `pluto.ts`'s material tint has
    // to be derived against — a photograph carries its own brightness and the tint's job
    // is to place that where the measured albedo says it belongs.
    let meanLum = 0;
    for (let i = 0; i < d.length; i += 4) meanLum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255 / n;
    ctx.putImageData(image, 0, 0);

    let minB = H, maxB = 0;
    for (let x = 0; x < W; x++) { minB = Math.min(minB, boundary[x]); maxB = Math.max(maxB, boundary[x]); }
    return {
        jpeg: c.toDataURL('image/jpeg', 0.92),
        width: W, height: H,
        filledFraction: filled / (W * H),
        saturationBefore: before / n,
        saturationAfter: after / n,
        meanLuminance: meanLum,
        terminatorNorth: 90 - (minB / H) * 180,
        terminatorSouth: 90 - (maxB / H) * 180,
    };
}, { data: readFileSync(source).toString('base64'), outWidth: OUT_WIDTH, SATURATION });

const out = resolve(root, 'public/textures/pluto_color.jpg');
writeFileSync(out, Buffer.from(result.jpeg.split(',')[1], 'base64'));
console.log(`wrote ${out}`);
console.log(`  ${result.width}x${result.height}, rolled 180 deg`);
console.log(`  generated fill: ${(result.filledFraction * 100).toFixed(1)}% of the map`);
console.log(`  mean saturation ${(result.saturationBefore * 100).toFixed(1)}% -> ${(result.saturationAfter * 100).toFixed(1)}%`);
console.log(`  mean luminance ${(result.meanLuminance * 100).toFixed(1)}% (drives the material tint in pluto.ts)`);
console.log(`  flyby terminator ran from ${result.terminatorNorth.toFixed(1)} to ${result.terminatorSouth.toFixed(1)} deg latitude`);
await browser.close();
