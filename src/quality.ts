/**
 * How hard to work the machine.
 *
 * Everything in this project is drawn at true scale with real maps, and that has never
 * been the thing that costs — the profile has always said the same thing, that ~99% of
 * a frame is fragment work. What follows from that is the whole shape of this file:
 * **the levers that matter are the ones that change how many fragments get shaded**,
 * and the levers that look expensive (triangle counts, star counts, grid resolutions)
 * are mostly not worth trading picture for.
 *
 * So there are two mechanisms here and they answer different questions.
 *
 * ## The tier answers "what is this machine, roughly?"
 *
 * Decided once, at module load, from what the browser will admit to. It is a *starting
 * point*, not a verdict — it sets the geometry and texture budgets that have to be
 * chosen before anything is built, because a `SphereGeometry`'s segment count and a
 * terrain grid's ring count cannot be changed later without rebuilding them. Getting
 * this wrong in either direction is recoverable: too low and the adaptive scale below
 * finds the headroom and takes the resolution back up; too high and it finds the
 * frames are slow and takes it down.
 *
 * ## The adaptive scale answers "is *this frame* costing too much?"
 *
 * Measured continuously, and it moves the one quantity that fragment cost is quadratic
 * in: the size of the drawing buffer. A phone that is thermally throttling, a laptop on
 * battery, a window dragged onto a 5K display — none of those are visible to any
 * capability check, and all of them show up immediately in the frame time. This is what
 * actually keeps a device cool, because it is the only part of the system that responds
 * to the device getting hot.
 *
 * ## Why not just cap the frame rate lower and be done
 *
 * Because the scene already does that, and it is not enough on its own. `script.ts`
 * drops to an idle rate when nothing is changing, which is most of the time and is the
 * single biggest saving in the app. But the frames that are *not* idle — a fly-to, a
 * drag, driving the LRV — are exactly the ones being watched, and halving their rate is
 * far more visible than shading them at 80% resolution.
 *
 * ## Overrides
 *
 * `?quality=low|medium|high|ultra` in the URL, or `planetary:quality` in localStorage,
 * pins the tier and disables the adaptive scale. Both exist for testing — you cannot
 * profile a low-end path on a machine that never selects it — and the URL form wins,
 * so a link can carry a setting without leaving one behind.
 */

export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityProfile {
    readonly tier: QualityTier;
    /**
     * Ceiling on `devicePixelRatio`. Fragment cost is quadratic in this, so it is the
     * most expensive number in the file — a Retina display's honest 2 is four times the
     * work of 1 for a difference that is barely visible on a scene made mostly of
     * gradients and starfields.
     */
    readonly maxPixelRatio: number;
    /**
     * MSAA. Cheap on a desktop GPU with fast tile memory and genuinely not cheap on a
     * mobile one, where it multiplies the bandwidth of every one of the additively
     * blended shells the scene is built from.
     */
    readonly antialias: boolean;
    /** Frames per second while something is actually moving. */
    readonly targetFps: number;
    /** ...and while nothing is. See `IDLE_FRAME_INTERVAL_MS` in `script.ts`. */
    readonly idleFps: number;

    // --- geometry, fixed at build time -------------------------------------

    /** Rocky planets and the Moon: [segmentsAround, segmentsDown]. */
    readonly planetSegments: readonly [number, number];
    /** Jupiter and Saturn, which are wider than they are tall and show it. */
    readonly gasGiantSegments: readonly [number, number];
    /** Cloud decks, atmosphere shells, Titan's haze — silhouette only, no detail. */
    readonly shellSegments: number;
    /** The mapped moons. Never more than a few hundred pixels across. */
    readonly moonSegments: number;
    /** Fraction of the full starfield population to generate. */
    readonly starFraction: number;
    /**
     * Which of the texture sets under `public/textures` to load — `''` for the
     * originals, `'half/'` or `'quarter/'` for the reduced ones that
     * `scripts/generate-texture-variants.sh` writes.
     *
     * The largest single number in this file by a wide margin, and the one that decides
     * whether the scene runs on a phone at all. A JPEG's compression exists only on
     * disk: every map reaches the GPU as RGBA8, mipmaps add a third, and the full set
     * comes to roughly 800 MB of texture memory. Halving the width quarters that, and
     * the tiers that take it are already shading at a pixel ratio where the texels were
     * never resolved — Earth's disc at 1080p is about 1,100 pixels across, against 2,700
     * texels of half-resolution map over the visible hemisphere, so it is still
     * oversampled by more than a factor of two.
     *
     * Kept at the originals for the two desktop tiers, because that is where somebody
     * flies up to a planet and looks at it closely, and because a machine that scores
     * that highly is not the one this is protecting.
     */
    readonly textureDirectory: string;

    // --- standing on the Moon ----------------------------------------------

    readonly shadowMapSize: number;
    readonly terrainRings: number;
    /** Must stay divisible by `SECTORS` (16) and by the shadow proxy's spoke step (2). */
    readonly terrainSpokes: number;
    readonly terrainDetailTexture: number;
    readonly trackTexels: number;
    readonly dustCapacity: number;
}

const PROFILES: Record<QualityTier, QualityProfile> = {
    low: {
        tier: 'low',
        maxPixelRatio: 1,
        antialias: false,
        // 30 rather than 60 only here, and only because on a device this is chosen for
        // the alternative is not a smoother 60 but a stuttering 40 that also cooks.
        targetFps: 30,
        idleFps: 10,
        planetSegments: [64, 48],
        gasGiantSegments: [96, 64],
        shellSegments: 48,
        moonSegments: 40,
        starFraction: 0.3,
        textureDirectory: 'quarter/',
        shadowMapSize: 512,
        terrainRings: 96,
        terrainSpokes: 192,
        terrainDetailTexture: 256,
        trackTexels: 1024,
        dustCapacity: 1500,
    },
    medium: {
        tier: 'medium',
        maxPixelRatio: 1.25,
        antialias: true,
        targetFps: 60,
        idleFps: 12,
        planetSegments: [96, 64],
        gasGiantSegments: [144, 96],
        shellSegments: 64,
        moonSegments: 64,
        starFraction: 0.6,
        textureDirectory: 'half/',
        shadowMapSize: 1024,
        terrainRings: 128,
        terrainSpokes: 256,
        terrainDetailTexture: 384,
        trackTexels: 1536,
        dustCapacity: 3000,
    },
    high: {
        tier: 'high',
        maxPixelRatio: 1.5,
        antialias: true,
        targetFps: 60,
        idleFps: 15,
        planetSegments: [128, 96],
        gasGiantSegments: [192, 128],
        shellSegments: 96,
        moonSegments: 96,
        starFraction: 1,
        textureDirectory: '',
        shadowMapSize: 1024,
        terrainRings: 160,
        terrainSpokes: 320,
        terrainDetailTexture: 512,
        trackTexels: 2048,
        dustCapacity: 6000,
    },
    // Never auto-selected. The settings the project had before any of this existed,
    // kept so `?quality=ultra` can still ask for them on a machine that can take it.
    ultra: {
        tier: 'ultra',
        maxPixelRatio: 2,
        antialias: true,
        targetFps: 60,
        idleFps: 15,
        planetSegments: [128, 128],
        gasGiantSegments: [192, 128],
        shellSegments: 96,
        moonSegments: 96,
        starFraction: 1,
        textureDirectory: '',
        shadowMapSize: 2048,
        terrainRings: 160,
        terrainSpokes: 320,
        terrainDetailTexture: 512,
        trackTexels: 2048,
        dustCapacity: 6000,
    },
};

function readOverride(): QualityTier | null {
    const valid = (value: string | null): QualityTier | null =>
        value === 'low' || value === 'medium' || value === 'high' || value === 'ultra'
            ? value
            : null;
    try {
        const fromUrl = valid(new URLSearchParams(window.location.search).get('quality'));
        if (fromUrl) return fromUrl;
        return valid(window.localStorage.getItem('planetary:quality'));
    } catch {
        // Private-mode Safari throws on `localStorage`, and a document with an opaque
        // origin throws on `location.search`. Neither is a reason to fail to start.
        return null;
    }
}

/**
 * What the GPU calls itself, if it will say.
 *
 * Worth the throwaway context for one reason above all others: it is the only way to
 * find out that there is no GPU at all. A software rasteriser (SwiftShader on a machine
 * with blocklisted drivers, llvmpipe on a headless Linux box) reports every capability
 * a real GPU does and then shades fragments on the CPU at a thousandth of the rate,
 * which is precisely the case where the difference between the low and high profiles is
 * the difference between usable and not.
 */
function detectRenderer(): string {
    try {
        const canvas = document.createElement('canvas');
        const gl = (canvas.getContext('webgl2') ||
            canvas.getContext('webgl')) as WebGLRenderingContext | null;
        if (!gl) return '';
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        const name = info
            ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '')
            : String(gl.getParameter(gl.RENDERER) ?? '');
        // Contexts are a scarce resource — browsers cap them per page at around 16 and
        // silently kill the oldest past that, which on this page would be the one the
        // whole scene is drawn into.
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return name.toLowerCase();
    } catch {
        return '';
    }
}

function detectTier(): QualityTier {
    const override = readOverride();
    if (override) return override;

    // A score rather than a decision tree, because no single signal is reliable: a
    // phone can have eight cores, a workstation can report a coarse pointer through a
    // touchscreen, and `deviceMemory` is Chromium-only and quantised to powers of two.
    // Several weak signals agreeing is worth more than any one of them.
    let score = 0;

    const nav = navigator as Navigator & { deviceMemory?: number };

    const cores = nav.hardwareConcurrency ?? 4;
    if (cores <= 2) score -= 2;
    else if (cores <= 4) score -= 1;
    else if (cores >= 8) score += 1;

    const memory = nav.deviceMemory;
    if (memory !== undefined) {
        if (memory <= 2) score -= 2;
        else if (memory <= 4) score -= 1;
        else if (memory >= 8) score += 1;
    }

    // Touch-first devices, which is very nearly the same question as "is this a phone
    // or a tablet" and rather more robust than parsing a user-agent string.
    const coarse =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches;
    if (coarse) score -= 3;

    // A phone-class GPU pushing a 3x display is the worst combination in the ranking:
    // the panel asks for nine times the fragments of a 1x one and there is nothing
    // behind it to shade them with.
    if (coarse && window.devicePixelRatio >= 3) score -= 1;

    const renderer = detectRenderer();
    if (renderer) {
        if (/swiftshader|llvmpipe|software|basic render/.test(renderer)) score -= 6;
        // Integrated Intel parts up to and including UHD. Iris Xe and Arc are a
        // different class and deliberately not matched here.
        else if (/(intel).*(hd|uhd) graphics/.test(renderer)) score -= 2;
        else if (/adreno|mali|powervr/.test(renderer)) score -= 1;
        else if (/rtx|radeon rx|geforce gtx 1[0-9]{3}|apple m[0-9]/.test(renderer)) score += 2;
    }

    if (score <= -3) return 'low';
    if (score <= 0) return 'medium';
    return 'high';
}

/** The tier this session was started at. Fixed for its lifetime. */
export const quality: QualityProfile = PROFILES[detectTier()];

/** True when the tier came from a URL parameter or localStorage rather than a guess. */
export const qualityPinned = readOverride() !== null;

/**
 * A resolution that follows the frame time.
 *
 * The scale multiplies whatever the session actually started at — `initialPixelRatio()`,
 * which is the display's own ratio *or* the tier's cap, whichever is lower. Multiplying
 * the cap instead would be a subtle no-op on the machines that need this most: a 1x
 * display against a 1.5 cap starts at 1.0, so the first four steps down the scale would
 * all still clamp back to 1.0 and nothing would happen until the fifth. Four windows of
 * measurement spent doing nothing on a device that is already struggling.
 *
 * Four things about how it moves are load-bearing:
 *
 * - **It measures a median, not a mean.** Frame times on a browser main thread are
 *   spiky in a way that has nothing to do with the GPU — a garbage collection, a
 *   texture upload finishing, the compositor missing a vsync — and a mean chases every
 *   one of those. A median over a couple of dozen frames ignores them and still
 *   responds within half a second to a genuine change in load.
 * - **What it is fed is the gap between frames that were actually drawn, not the time
 *   spent inside the frame.** Those are different quantities and only the first one is
 *   any use here. `renderer.render()` returns as soon as the commands are submitted,
 *   long before the GPU has finished with them, so a scene that is entirely GPU-bound —
 *   which this one is, being ~99% fragment work — measures as costing almost nothing
 *   from inside. What it cannot hide is that the *next* frame arrives late, so the
 *   arrival interval is where the real cost surfaces.
 * - **Which is also why the two tests are not symmetric.** The scene throttles itself
 *   to a target rate, so a frame that costs 10 ms and one that costs 15 still arrive
 *   16.7 ms apart — the measurement is clamped from below and there is no such thing as
 *   an observably *fast* frame. So "too slow" is a real reading (the interval overran
 *   the throttle, meaning the frame could not be delivered in time) while "there is
 *   headroom" can only ever be inferred from hitting the target exactly, and is then
 *   *tested* by raising the resolution a step and watching what happens.
 * - **Only frames that were actually drawn at the target rate count.** `script.ts`
 *   skips whole frames at the idle rate, and the gaps that produces say nothing about
 *   how hard the last frame was to draw. Feeding them in would drive the resolution to
 *   the floor on a scene that is sitting perfectly still.
 */
export interface AdaptiveResolution {
    /** Current multiplier on the session's starting pixel ratio, in [MIN_SCALE, 1]. */
    readonly scale: number;
    /**
     * Feed the interval, in milliseconds, since the last frame that was *also* drawn at
     * the target rate. Call it only for those frames; see above.
     */
    sample(intervalMs: number): void;
    /**
     * Throw away the window. For any moment the next interval will be meaningless
     * through no fault of the GPU's — coming back from the idle rate, entering or
     * leaving the surface mode, a resize.
     */
    reset(): void;
}

const SAMPLE_WINDOW = 24;
/** Below this the buffer is small enough that the picture visibly goes. */
const MIN_SCALE = 0.6;
const SCALE_STEP = 0.1;
/** Missing the target by more than this is what "struggling" means. */
const SLOW_FACTOR = 1.3;
/** ...and hitting it to within this is the only evidence of headroom there can be. */
const FAST_FACTOR = 1.06;
/** How long to leave it alone after raising the resolution, before raising again. */
const RAISE_COOLDOWN_MS = 3000;
/**
 * ...and after lowering it, which is deliberately much longer. A drop means the last
 * attempt to raise was wrong, and re-testing it every three seconds would leave the
 * buffer resizing back and forth for the rest of the session — visible in itself, and
 * expensive in exactly the way this exists to avoid, since every resize reallocates the
 * drawing buffer.
 */
const RETEST_COOLDOWN_MS = 20000;

export function createAdaptiveResolution(
    apply: (pixelRatio: number) => void
): AdaptiveResolution {
    const samples: number[] = [];
    const baseRatio = initialPixelRatio();
    let scale = 1;
    let nextRaiseMs = 0;

    const commit = (next: number, cooldown: number) => {
        samples.length = 0;
        nextRaiseMs = performance.now() + cooldown;
        if (Math.abs(next - scale) < 1e-3) return;
        scale = next;
        apply(baseRatio * scale);
    };

    return {
        get scale() {
            return scale;
        },
        reset() {
            samples.length = 0;
        },
        sample(intervalMs: number) {
            // Pinned means pinned: someone asked for a specific tier and is presumably
            // measuring something, which a resolution that moved underneath them would
            // make impossible.
            if (qualityPinned) return;

            samples.push(intervalMs);
            if (samples.length < SAMPLE_WINDOW) return;

            const sorted = samples.slice().sort((a, b) => a - b);
            const median = sorted[sorted.length >> 1];
            samples.length = 0;

            const budget = 1000 / quality.targetFps;

            // Overran the throttle, so the frame genuinely could not be delivered on
            // time. Nothing about waiting longer changes that.
            if (median > budget * SLOW_FACTOR) {
                if (scale > MIN_SCALE) {
                    commit(Math.max(MIN_SCALE, scale - SCALE_STEP), RETEST_COOLDOWN_MS);
                }
                return;
            }

            // Landing on the target rate at less than full resolution. That is as much
            // as can be known from here, so take one step up and let the next window say
            // whether it was affordable.
            if (median < budget * FAST_FACTOR && scale < 1 && performance.now() >= nextRaiseMs) {
                commit(Math.min(1, scale + SCALE_STEP), RAISE_COOLDOWN_MS);
            }
        },
    };
}

/** Convenience for the modules that only want the capped ratio once, at startup. */
export function initialPixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio);
}
