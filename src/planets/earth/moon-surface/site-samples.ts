import { Color } from 'three';
import { MOON_RADIUS_M, MOON_REGOLITH_ALBEDO } from '../../../constants/planets.const';

/**
 * Reading the two lunar maps as *data* rather than as textures.
 *
 * The ground patch is at most 6 km across, and the colour mosaic resolves 2.7 km per
 * texel — so there is nothing to wrap onto it, and the surface below that scale has
 * to be generated. What the maps can still say, and what nothing else can, is which
 * *kind* of ground this is: Mare Tranquillitatis is dark young basalt at an albedo
 * near 0.07, Tycho's ejecta is raw highland rock at nearly 0.25, and getting that
 * wrong makes every site look like the same grey field.
 *
 * So the maps are sampled once per landing site, at a single point, through a canvas.
 * Two small `getImageData` reads, not a full readback — the images are already in the
 * browser cache from `moon.ts`, and the decode is deferred to idle time so it never
 * lands on the intro.
 */

const COLOR_MAP_URL = '/textures/moon_color.jpg';
const HEIGHT_MAP_URL = '/textures/moon_height.png';

/**
 * The colour map is downscaled on the way into the canvas. Mare/highland boundaries
 * are hundreds of kilometres across and one texel here is still 10.7 km, so nothing
 * that matters at this scale is lost — and it keeps the retained bitmap at 2 MB
 * rather than the 33 MB the native 4096x2048 would cost.
 */
const COLOR_SAMPLE_WIDTH = 1024;
const COLOR_SAMPLE_HEIGHT = 512;

/**
 * LOLA's elevation range, roughly -9,150 m to +10,780 m. The PNG is an 8-bit
 * greyscale bump map rather than a tagged elevation product, so this is an
 * assumption, not a decode — but it is only ever used for a *gradient*, and a
 * regional slope being out by a factor of two is not a thing anyone can see.
 */
const LUNAR_ELEVATION_RANGE_M = 19930;

/**
 * The real span of lunar surface reflectance, converted for a diffuse material the
 * same way `MOON_REGOLITH_ALBEDO` is: about 0.06 geometric for the darkest mare basalt
 * and 0.24 for the freshest crater material, times the 3/2 that turns a full-phase
 * disc comparison into a hemispherical reflectance.
 */
const MIN_DIFFUSE_ALBEDO = 0.06 * 1.5;
const MAX_DIFFUSE_ALBEDO = 0.24 * 1.5;

/**
 * Regional slopes on the Moon, measured over a baseline this long, are almost all
 * under a couple of degrees — the dramatic-looking relief is nearly all at scales
 * far below one texel here. The cap is a guard on an 8-bit gradient rather than a
 * claim about the terrain, and it doubles as the safety rail at the poles, where a
 * degree of longitude collapses to nothing and the east-west difference would
 * otherwise be divided by a vanishing spacing.
 */
const MAX_REGIONAL_SLOPE = Math.tan((2.5 * Math.PI) / 180);

export interface SiteSample {
    /** Diffuse reflectance at this site, real units. */
    albedo: Color;
    /** Regional ground slope, rise per unit distance, in the local horizon frame. */
    slopeEast: number;
    slopeNorth: number;
}

const NEUTRAL: SiteSample = {
    albedo: new Color(MOON_REGOLITH_ALBEDO, MOON_REGOLITH_ALBEDO, MOON_REGOLITH_ALBEDO),
    slopeEast: 0,
    slopeNorth: 0,
};

interface Bitmap {
    context: CanvasRenderingContext2D;
    width: number;
    height: number;
}

let colorBitmap: Bitmap | null = null;
let heightBitmap: Bitmap | null = null;
/** Mean linear brightness of the whole colour map — see `sampleSite`. */
let colorMapMean = 1;

function toBitmap(image: HTMLImageElement, width: number, height: number): Bitmap {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0, width, height);
    return { context, width, height };
}

function load(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
    });
}

/** sRGB to linear. The colour map carries encoded colour; the height map does not. */
function toLinear(value: number): number {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/**
 * The mosaic is brightness-normalised for legibility, which is why `moon.ts` has to
 * tint the whole globe down to 0x8a8a8a to get the Moon's real darkness back. The
 * same correction, done per site: measure the map's own mean and read every sample as
 * a ratio against it, so the *relative* brightness of mare against highland survives
 * while the absolute level comes from the measured albedo instead of the picture.
 */
function measureMean(bitmap: Bitmap): number {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(bitmap.context.canvas, 0, 0, size, size);

    const { data } = context.getImageData(0, 0, size, size);
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
        total += toLinear(data[i]) * 0.2126 + toLinear(data[i + 1]) * 0.7152 + toLinear(data[i + 2]) * 0.0722;
    }
    return Math.max(total / (size * size), 1e-4);
}

let priming: Promise<void> | null = null;

/**
 * Decode both maps into canvases. Idempotent, and safe to call before anything needs
 * them — which is the point: kicked off at idle, it is long finished by the time
 * anyone presses Land, and `sampleSite` degrades to neutral grey if it is not.
 */
export function primeSiteSamples(): Promise<void> {
    if (priming) return priming;

    priming = Promise.all([load(COLOR_MAP_URL), load(HEIGHT_MAP_URL)])
        .then(([color, height]) => {
            colorBitmap = toBitmap(color, COLOR_SAMPLE_WIDTH, COLOR_SAMPLE_HEIGHT);
            colorMapMean = measureMean(colorBitmap);
            // Native resolution: the gradient is a difference between *adjacent*
            // texels, so downscaling would blur away the very thing being measured.
            heightBitmap = toBitmap(height, height.naturalWidth, height.naturalHeight);
        })
        .catch(() => {
            // A missing texture is not worth refusing to land over.
        });

    return priming;
}

/** Equirectangular pixel coordinates, matching `geo.ts`'s longitude convention. */
function pixelAt(bitmap: Bitmap, latitude: number, longitude: number): [number, number] {
    const u = 0.5 + longitude / 360;
    const v = 0.5 - latitude / 180;
    const x = Math.min(bitmap.width - 1, Math.max(0, Math.round(u * bitmap.width)));
    const y = Math.min(bitmap.height - 1, Math.max(0, Math.round(v * bitmap.height)));
    return [x, y];
}

function greyAt(bitmap: Bitmap, x: number, y: number): number {
    // Wrap in longitude, clamp in latitude — the map is a cylinder, not a torus.
    const wrappedX = ((x % bitmap.width) + bitmap.width) % bitmap.width;
    const clampedY = Math.min(bitmap.height - 1, Math.max(0, y));
    return bitmap.context.getImageData(wrappedX, clampedY, 1, 1).data[0];
}

export function sampleSite(latitude: number, longitude: number): SiteSample {
    if (!colorBitmap || !heightBitmap) return NEUTRAL;

    // --- albedo ---
    const [cx, cy] = pixelAt(colorBitmap, latitude, longitude);
    const patch = colorBitmap.context.getImageData(
        Math.max(0, cx - 1),
        Math.max(0, cy - 1),
        2,
        2
    ).data;

    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < patch.length; i += 4) {
        r += toLinear(patch[i]);
        g += toLinear(patch[i + 1]);
        b += toLinear(patch[i + 2]);
    }

    // One factor, applied to every site: it rescales the map's own mean brightness
    // onto the Moon's measured albedo. The *site* variation is already in r/g/b, so
    // the ratio survives — dark mare stays dark relative to bright ejecta, and the
    // absolute level stops being the mosaic's editorial choice. The hue rides along
    // for free, which is how Tycho's slightly cooler ray material keeps its cast.
    const samples = patch.length / 4;
    const scale = MOON_REGOLITH_ALBEDO / colorMapMean / samples;
    const albedo = new Color(r * scale, g * scale, b * scale);

    // ...and then clamped, because a ratio has no ceiling and the Moon does. The whole
    // surface spans roughly 0.06 to 0.24 geometric — darkest mare to the freshest
    // crater material anywhere on it — and the mosaic's contrast stretch can push a
    // bright site well past the top of that. Left uncapped, Tycho comes out at an
    // albedo no lunar material has, and every slope facing a low Sun clips to white.
    const luminance = albedo.r * 0.2126 + albedo.g * 0.7152 + albedo.b * 0.0722;
    const capped = Math.min(Math.max(luminance, MIN_DIFFUSE_ALBEDO), MAX_DIFFUSE_ALBEDO);
    albedo.multiplyScalar(capped / Math.max(luminance, 1e-4));

    // --- regional slope ---
    // Central differences over one texel each way. At this resolution a texel is
    // 7.6 km, so what comes out is the *setting* — which way the ground falls away
    // over the horizon — not the local relief, which is generated.
    const [hx, hy] = pixelAt(heightBitmap, latitude, longitude);
    const metresPerLevel = LUNAR_ELEVATION_RANGE_M / 255;
    const texelNorthM = (Math.PI * MOON_RADIUS_M) / heightBitmap.height;
    // Meridians converge, so an east-west texel shrinks with the cosine of latitude.
    const cosLat = Math.max(Math.cos((latitude * Math.PI) / 180), 1e-3);
    const texelEastM = ((2 * Math.PI * MOON_RADIUS_M) / heightBitmap.width) * cosLat;

    const east = ((greyAt(heightBitmap, hx + 1, hy) - greyAt(heightBitmap, hx - 1, hy)) * metresPerLevel) / (2 * texelEastM);
    // Image rows run north to south, so a positive row difference is a *fall* to the
    // north — hence the negation.
    const north = -((greyAt(heightBitmap, hx, hy + 1) - greyAt(heightBitmap, hx, hy - 1)) * metresPerLevel) / (2 * texelNorthM);

    const clamp = (v: number) => Math.max(-MAX_REGIONAL_SLOPE, Math.min(MAX_REGIONAL_SLOPE, v));
    return { albedo, slopeEast: clamp(east), slopeNorth: clamp(north) };
}
