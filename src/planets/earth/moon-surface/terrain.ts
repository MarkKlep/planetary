import {
    BufferGeometry,
    CanvasTexture,
    Color,
    Float32BufferAttribute,
    IcosahedronGeometry,
    Group,
    InstancedMesh,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    Object3D,
    Quaternion,
    RepeatWrapping,
    Sphere,
    Uint32BufferAttribute,
    Vector3,
} from 'three';
import { CRATER_REACH, craterDiameter, craterProfile } from '../../../craters';
import type { Collider } from './colliders';
import { fbm, mulberry32 } from '../../../noise';
import { MOON_RADIUS_M } from '../../../constants/planets.const';
import {
    TRACK_ALBEDO_FACTOR,
    TRACK_BOWL_M,
    TRACK_FIELD_M,
    TRACK_RIM_M,
    TRACK_SURGE_LOSS,
    TRACK_TEXEL_M,
    type Tracks,
} from './tracks';
import type { LandingSite } from './sites';
import type { SiteSample } from './site-samples';
import { quality } from '../../../quality';

/**
 * The ground you stand on.
 *
 * ## Why this is not the Moon mesh
 *
 * Everything else in this project renders the real globe. Standing on it cannot:
 * from an astronaut's 1.7 m the horizon is 2,430 m away, and against that, one texel
 * of `moon_color.jpg` is 2,665 m and one facet of the 128-segment sphere is 85 km.
 * The entire visible world is a single flat triangle inside a single texel. There is
 * no camera position that fixes that — the data stops two and a half kilometres above
 * the scale being asked for.
 *
 * So this builds a local patch, in metres, and takes the line `moons.ts` takes with
 * Phobos: real measurements where they exist, generated below their resolution. The
 * measured parts are the radius (which sets the horizon), the site's albedo and its
 * regional slope; the craters, the boulders and the regolith are produced.
 *
 * ## The horizon is not a setting
 *
 * The one number nobody had to choose. Each vertex is dropped by the sphere's
 * sagitta, r²/2R, so the ground curves away exactly as the real body does — and the
 * distance at which that drop reaches eye height is the horizon, √(2Rh) = 2,430 m,
 * because it cannot be anywhere else. Earth's, from the same height, is 4,654 m. The
 * Moon's being 1.9x closer is the first thing every Apollo crew remarked on, and it
 * falls out of `MOON_RADIUS_KM` rather than being dialled in.
 *
 * ## Why the grid is polar
 *
 * Detail is wanted in proportion to how much of the view it takes up, which on a
 * ground plane means in inverse proportion to distance. Rings spaced geometrically —
 * each 8% further out than the last — with spokes radiating from the observer give
 * almost exactly that: triangles hold a roughly constant *screen* size from 35 cm at
 * your boots out to the horizon. A uniform grid fine enough to match it underfoot
 * would need tens of millions of triangles to reach as far. This needs 65,280, in one
 * draw call, and looks better where it counts.
 */

// --- the grid --------------------------------------------------------------

/**
 * 160 x 320 at the top tier, and the number that has to be watched when it comes down is
 * `SPOKES`: `SECTORS` below divides it, and so does the shadow proxy's spoke step, so
 * every tier's figure is a multiple of 32. `RINGS` is free — it only sets how many rings
 * the geometric spacing is spread over, and `RING_GROWTH` re-derives itself from it.
 *
 * Coming down costs less than it looks like it should, for the same reason the grid is
 * polar in the first place: the spacing is geometric, so halving the ring count does not
 * halve the resolution anywhere in particular — it widens every ring by the same *ratio*,
 * which the eye reads as a uniform loss of fineness rather than as a horizon that has
 * come closer or ground that has gone flat underfoot.
 */
const RINGS = quality.terrainRings;
const SPOKES = quality.terrainSpokes;
/**
 * How many wedges the grid is cut into for culling, and the one number here that is
 * about the renderer rather than the Moon.
 *
 * The patch is a disc centred on the observer, so as a single mesh its bounding sphere
 * always contains the camera and it can *never* be frustum-culled — every triangle is
 * submitted every frame regardless of which way you are facing, and you are facing
 * about a quarter of it. Cut into wedges, each with its own bounds, three.js throws
 * away the ones behind you before they cost anything.
 *
 * It pays twice. The shadow camera covers only the near field around the observer — 55 m
 * for any Sun above about 8° — so the depth pass drops nearly every wedge as well.
 *
 * 16 wedges of 22.5°: enough that an 85° horizontal field keeps only five or six, few
 * enough that the draw calls stay cheaper than the geometry they save. It has to
 * divide `SPOKES`.
 */
const SECTORS = 16;
const SPOKES_PER_SECTOR = SPOKES / SECTORS;
/**
 * How far out the *shadow* proxy reaches, and how coarsely it is built.
 *
 * The wedges themselves cast nothing. A wedge running the full 6 km has a bounding
 * sphere some 3 km across, which intersects the shadow camera's box whichever way the
 * observer faces — so letting them cast means drawing all 102,000 triangles into a
 * depth map covering a fraction of a percent of their area, every frame, and no amount
 * of splitting fixes it because the shadow region genuinely surrounds you.
 *
 * What fixes it is noticing that the shadow map is 1024 texels over the box, which at
 * its usual 110 m is about 11 cm a texel. Terrain detail finer than that cannot be
 * represented in the map at all, so casting it is work thrown away. One decimated proxy
 * — every fourth ring, every second spoke, sharing the same vertices — carries the same
 * surface at 1/8 the triangles and produces an identical shadow.
 *
 * `moon-surface.ts` also stops the proxy casting altogether below 6° of Sun elevation,
 * where a texel spans metres of depth and the ground can only shadow itself in stripes.
 *
 * It lives on its own layer so the colour camera never sees it, which is cleaner than
 * trying to make a mesh invisible but still casting.
 */
export const SHADOW_PROXY_RADIUS_M = 150;
const SHADOW_PROXY_RING_STEP = 4;
const SHADOW_PROXY_SPOKE_STEP = 2;
/** The layer the colour camera does not draw and the shadow camera does. */
export const SHADOW_ONLY_LAYER = 1;
/** Inner radius of the first ring; inside it, a fan to a single centre vertex. */
const INNER_RADIUS_M = 0.35;
/**
 * Outer radius. Well past the 2,430 m horizon, which is the point: hopping raises the
 * eye and pushes the horizon out with it, and the ground must not run out first. By
 * 6 km the curvature has already carried the surface 10 m below eye level, so the rim
 * of the patch is buried a long way under the visible horizon.
 */
export const TERRAIN_RADIUS_M = 6000;

/** Each ring sits this much further out than the one inside it. */
const RING_GROWTH = Math.pow(TERRAIN_RADIUS_M / INNER_RADIUS_M, 1 / (RINGS - 1));

// --- craters ---------------------------------------------------------------

/**
 * Cumulative crater density: N(≥D) = C·D⁻² per square metre, so C is the number of
 * craters a metre or more across per square metre. 0.1 puts ten craters of 100 m or
 * more in every square kilometre, which is about what the maria carry.
 */
const CRATER_DENSITY = 0.1;
/**
 * A crater is only worth putting into geometry while it is larger than the local
 * vertex spacing — and that spacing grows with distance, so the smallest crater
 * generated grows with it too. This is the ratio: a crater at distance r is given a
 * radius of at least 0.05·r, just under one ring of spacing.
 *
 * It has a useful consequence. The expected count per octave of distance works out
 * *independent* of the distance, so the field is scale-free in the same way the grid
 * is, and the total is logarithmic in the patch radius rather than quadratic. Seven
 * hundred craters cover three kilometres; a uniform field at the same density and the
 * same smallest size would need some three million.
 */
const CRATER_MIN_RADIUS_FACTOR = 0.05;
/** Largest crater relative to the smallest generated at the same distance. */
const CRATER_SIZE_SPAN = 40;
const CRATER_MAX_DIAMETER_M = 1200;
/** Nothing beyond here can clear the horizon, so nothing beyond here is generated. */
const CRATER_FIELD_RADIUS_M = 2800;
/** Below this the grid could not resolve one anyway; the detail map takes over. */
const CRATER_FIELD_INNER_M = 1.5;
/** Depth of a fresh simple crater as a fraction of its diameter. */
const FRESH_DEPTH_RATIO = 0.2;

/**
 * Rays: the bright streaks thrown clear of a young impact, and the most recognisably
 * lunar thing the ground can do. They are not relief at all — the surface under a ray
 * is flat — they are *albedo*, fresh material scattered on top of ground that has been
 * darkening under the solar wind for a billion years. Which is exactly why they fade:
 * the ray is only bright until it has been weathered as long as everything around it.
 *
 * So they go into the vertex colours and never touch `heightAt`. They also reach far
 * beyond the crater that threw them — Tycho's run a third of the way round the Moon —
 * which is why they need their own list rather than riding the height sweep, whose
 * craters drop out at 1.7 radii.
 */
const RAY_REACH_RADII = 15;
/** Only young, sizeable craters have them; everything older has lost them. */
const RAY_MIN_FRESHNESS = 0.72;
const RAY_MIN_RADIUS_M = 10;
/** How many streaks each one throws. Real ray systems are a handful, not a halo. */
const RAY_COUNT = 7;

interface Crater {
    x: number;
    z: number;
    radius: number;
    depth: number;
    /** 0 = ancient and filled in, 1 = fresh, with bright ejecta still on the rim. */
    freshness: number;
    /** How far out the profile still contributes anything. */
    reach: number;
    /** Radial band this crater can touch, for the sweep in `buildTerrain`. */
    nearest: number;
    farthest: number;
    /** Fixes where this crater's rays fall, so they do not all point the same way. */
    phase: number;
}

function buildCraterField(site: LandingSite): Crater[] {
    const random = mulberry32(site.seed);
    const craters: Crater[] = [];

    for (let inner = CRATER_FIELD_INNER_M; inner < CRATER_FIELD_RADIUS_M; inner *= 2) {
        const outer = Math.min(inner * 2, CRATER_FIELD_RADIUS_M);
        const area = Math.PI * (outer * outer - inner * inner);
        const minDiameter = 2 * CRATER_MIN_RADIUS_FACTOR * inner;
        const maxDiameter = Math.min(minDiameter * CRATER_SIZE_SPAN, CRATER_MAX_DIAMETER_M);
        const count = Math.round(
            (site.craterDensity * CRATER_DENSITY * area) / (minDiameter * minDiameter)
        );

        for (let i = 0; i < count; i++) {
            // Uniform *in area* over the annulus. Sampling the radius uniformly
            // instead would crowd every shell against its inner edge.
            const distance = Math.sqrt(inner * inner + random() * (outer * outer - inner * inner));
            const theta = random() * Math.PI * 2;
            const diameter = craterDiameter(random(), minDiameter, maxDiameter);
            // Craters do not stay fresh. Regolith creeps in and later impacts churn
            // the rim, so most of what is on the ground at any one time is a shallow
            // remnant and only a few are crisp.
            const freshness = Math.pow(random(), 1.8);
            const radius = diameter / 2;
            const reach = radius * CRATER_REACH;

            craters.push({
                x: distance * Math.cos(theta),
                z: -distance * Math.sin(theta),
                radius,
                depth: diameter * FRESH_DEPTH_RATIO * (0.3 + 0.7 * freshness),
                freshness,
                reach,
                nearest: distance - reach,
                farthest: distance + reach,
                phase: random(),
            });
        }
    }

    return craters;
}

// --- sub-grid detail -------------------------------------------------------

/**
 * Tileable value noise. `noise.ts`'s version samples a 3D *direction*, which is what
 * makes it seam-free on a sphere and is exactly wrong here: this has to wrap over a
 * square, so the detail map can repeat across the ground without a visible grid. The
 * lattice index is taken modulo the period instead.
 */
function tileHash(i: number, j: number, seed: number): number {
    let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function tileNoise(x: number, y: number, period: number, seed: number): number {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const wrap = (n: number) => ((n % period) + period) % period;

    const i0 = wrap(i);
    const i1 = wrap(i + 1);
    const j0 = wrap(j);
    const j1 = wrap(j + 1);

    const a = tileHash(i0, j0, seed);
    const b = tileHash(i1, j0, seed);
    const c = tileHash(i0, j1, seed);
    const d = tileHash(i1, j1, seed);

    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

const DETAIL_TEXTURE_SIZE = quality.terrainDetailTexture;
/** Metres covered by one tile of the detail map. */
const DETAIL_TILE_M = 2.2;
/** Height of the finest relief, metres — the pitting and gardening of the regolith. */
const DETAIL_RELIEF_M = 0.06;

/**
 * The relief below one grid cell, carried as a normal map rather than as geometry.
 *
 * The polar grid resolves about 3 cm at your boots and 170 m at the horizon; the
 * pitted, endlessly gardened texture of the regolith runs well below the first of
 * those. Baking it into normals costs one 512² texture and no triangles at all, and
 * mipmapping fades it out with distance by itself — which is correct, because that is
 * where it stops being resolvable in reality too.
 */
function buildDetailNormalMap(seed: number): CanvasTexture {
    const size = DETAIL_TEXTURE_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(size, size);

    // Four octaves of tileable fBm, each doubling in frequency and losing about half
    // its amplitude. The lattice period doubles along with the frequency, so every
    // octave wraps over the same square and the tile as a whole is seamless.
    const height = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let sum = 0;
            let amplitude = 1;
            let weight = 0;
            let period = 8;
            for (let octave = 0; octave < 4; octave++) {
                sum += amplitude * tileNoise((x / size) * period, (y / size) * period, period, seed + octave * 71);
                weight += amplitude;
                amplitude *= 0.55;
                period *= 2;
            }
            height[y * size + x] = sum / weight;
        }
    }

    // Central differences into a tangent-space normal. Green is +V, and canvas rows
    // run the opposite way from texture V because `CanvasTexture` flips Y — which is
    // why dy is left positive where dx is negated.
    const metresPerTexel = DETAIL_TILE_M / size;
    const scale = DETAIL_RELIEF_M / metresPerTexel;
    const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * scale;
            const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * scale;
            const length = Math.sqrt(dx * dx + dy * dy + 1);

            const index = (y * size + x) * 4;
            image.data[index] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
            image.data[index + 1] = Math.round(((dy / length) * 0.5 + 0.5) * 255);
            image.data[index + 2] = Math.round((1 / length) * 127.5 + 127.5);
            image.data[index + 3] = 255;
        }
    }

    context.putImageData(image, 0, 0);

    const texture = new CanvasTexture(canvas);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
}

// --- the regional slope ----------------------------------------------------

/**
 * Where the km-scale slope out of the height map still applies, and where it stops.
 *
 * It has to stop somewhere. Even a couple of degrees of slope beats the sphere's
 * curvature out to 150 km, so carried to the rim of the patch it would lift the edge
 * 400 m into the sky and leave a hard line with nothing above it. Fading it out
 * before the horizon is also the more honest reading of the measurement: a gradient
 * taken across one 7.6 km texel says what the ground does *here*, not that it goes on
 * doing it forever.
 */
const SLOPE_HOLD_M = 1200;
const SLOPE_FADE_M = 3000;

function slopeTaper(radius: number): number {
    if (radius <= SLOPE_HOLD_M) return 1;
    if (radius >= SLOPE_FADE_M) return 0;
    const t = (radius - SLOPE_HOLD_M) / (SLOPE_FADE_M - SLOPE_HOLD_M);
    return 1 - t * t * (3 - 2 * t);
}

// --- the surface material --------------------------------------------------

/**
 * Sun direction in *view* space, kept current by the render loop — the same
 * arrangement `earth.ts` uses, and for the same reason: the shader below compares it
 * against another view-space vector.
 */
export const regolithSunDirectionView = new Vector3(1, 0, 0);

/**
 * The opposition surge, which is most of why Apollo photographs look the way they do.
 *
 * Lunar regolith backscatters hard. At zero phase angle — looking directly away from
 * the Sun, at your own shadow — the shadow each grain casts is hidden behind the
 * grain itself, and the surface brightens sharply. The washed-out halo that produces
 * around the observer's own shadow is unmissable in the surface photography and
 * entirely absent from ordinary Lambert shading, which is a good part of why plain
 * grey terrain reads as a video game rather than as the Moon.
 *
 * Hapke's shadow-hiding term, B(α) = B₀/(1 + tan(α/2)/h). The width h is small, about
 * 0.06, so the surge stays confined to a few degrees instead of just brightening
 * everything. B₀ is at the low end of the measured range for the Moon, which matters
 * because it multiplies terms that are already generous: on a bright-ejecta site, a
 * slope tilted into a low Sun is picking up full N·L *and* fresh-ejecta brightening,
 * and a surge of 1.0 on top of that clips it to white.
 */
const OPPOSITION_AMPLITUDE = 0.7;
const OPPOSITION_WIDTH = 0.06;

/**
 * ...and what happens *away* from opposition, which is the other half of the same
 * question and was for a long time simply Lambert.
 *
 * Lambert is the wrong law for regolith, and the Moon is the standard illustration of
 * how wrong. A Lambertian sphere lit head-on is brightest at the centre of its disc and
 * falls to zero at the limb; the full Moon does no such thing, it is a flat disc of
 * near-uniform brightness right out to the edge. That is not a subtlety, it is the most
 * familiar thing about the Moon's appearance, and any surface rendered with Lambert
 * carries the error down to the ground with it — shading far too contrasty, slopes
 * facing away from the Sun dropping off far faster than they really do.
 *
 * The correction is the **lunar-Lambert** function: a mix, weighted by phase angle,
 * between Lommel-Seeliger scattering (μ₀/(μ₀+μ), what a semi-infinite particulate
 * medium actually does) and Lambert. Written as a multiplier on the Lambert term the
 * renderer already computes, it is
 *
 *     2·L(α)/(μ₀+μ) + (1 − L(α))
 *
 * and it needs no recalibration of the albedo, because at normal incidence and normal
 * emission it is exactly 1 — which is the geometry a *normal albedo* is defined at, and
 * the geometry the mosaic `site-samples.ts` reads was normalised to.
 *
 * L(α) is McEwen's, the empirical limb-darkening parameter that essentially every
 * published lunar mosaic — including the LROC one sampled two files over — was
 * photometrically normalised with. Using the same function to put the light back is the
 * closest this can get to a round trip.
 *
 * ## Why the roughness correction is a clamp rather than sixty lines of Hapke
 *
 * Hapke's full model carries a macroscopic-roughness term S(i,e,ψ;θ̄) that the two terms
 * above do not. Left out entirely, μ (the emission cosine) is catastrophic here: a
 * ground plane seen from 1.7 m is past 80° of emission by 10 m out and past 89° by 100,
 * so μ → 0 over nearly the whole frame, the disk function collapses to 2L, and the
 * ground goes *uniformly bright regardless of the Sun* — every slope, every crater
 * wall, flat. Measured over twelve first-person views it drove the mean brightness up
 * 61% with individual fragments running 1,180× Lambert.
 *
 * What that term physically does at grazing angles is the part worth keeping: a rough
 * surface never presents a facet at grazing, it presents one near its mean slope angle,
 * so neither effective cosine can actually reach zero. Imposing that as a floor at
 * sin θ̄ — θ̄ = 20°, the standard fit for the maria — captures it in one clamp, and it
 * is the honest choice for a surface that *also* carries a detail normal map: the
 * sub-grid roughness is already there geometrically, and a full S(i,e,ψ) on top would
 * be counting some of it twice. With the floor the same twelve views come to a mean of
 * ×1.35, no fragment exceeds ×2.9, and the shading stays shading.
 *
 * `SUNLIGHT_INTENSITY` in `moon-surface.ts` was divided by that 1.4 to pay for it. What
 * moves is the *distribution*: views down-Sun brighten (the opposition washout gets its
 * true reach), views into the Sun darken (high phase really is dark), and the contrast
 * between the two is now a real ×2 rather than nothing.
 */
const ROUGHNESS_FLOOR = Math.sin((20 * Math.PI) / 180);

/** How far out a print's 2 cm of relief is still worth a pixel. See `trackChunk`. */
const TRACK_RELIEF_RANGE_M = 30;

/**
 * Sampled once per fragment out of the track field. Compaction reads back three ways —
 * see `tracks.ts`; the surge loss is the biggest of them and the reason a bootprint is
 * visible at zero phase where nothing casts a shadow at all.
 */
function trackChunk(): string {
    return /* glsl */ `
        vec2 trackUv = vSurfaceXZ * ${(1 / TRACK_FIELD_M).toFixed(9)} + 0.5;
        vec2 fromCentre = abs(trackUv - 0.5);
        // Faded at the rim, or the field would end on a visible square edge.
        float within = 1.0 - smoothstep(0.44, 0.5, max(fromCentre.x, fromCentre.y));

        // The ground runs out to a 2,430 m horizon and the field is 128 m across, so on
        // any view that is not straight down at your own boots most of the frame is
        // ground that can have nothing on it. Branching on that is worth a great deal —
        // measured, it is the whole of this feature's cost — and it is safe despite the
        // fetches taking their mip level from derivatives: the only quads with mixed
        // control flow straddle the boundary where the fade reaches zero, and whatever
        // they compute there is multiplied by it.
        if (within > 0.0) {
            vec4 here = texture2D(uTrackMap, trackUv);
            compaction = here.r * within;

            // Relief is dropped past the range where it could be resolved at all. The
            // bowl is 2 cm deep; at 30 m that subtends two thirds of a pixel, so the
            // three extra fetches would be buying a sub-pixel shading difference on the
            // fragments there are most of. Compaction is *not* dropped with it, because
            // it is an area average and stays meaningful at any distance — which is
            // exactly why the trail still reads to the horizon after the relief has
            // gone. Same argument as the shadow proxy, one scale down.
            float relief = 1.0 - smoothstep(
                ${(TRACK_RELIEF_RANGE_M * 0.7).toFixed(1)},
                ${TRACK_RELIEF_RANGE_M.toFixed(1)},
                length(vViewPosition)
            );
            if (relief > 0.0) {
                // Forward differences over a *two* texel baseline, sharing the sample
                // already taken above: three fetches rather than five, and the wider
                // baseline is the point rather than a compromise.
                //
                // The wall of a real bootprint is 2 cm deep over about 2 cm of ground —
                // 45°, but only 2 cm of it. Stored at 6.25 cm a texel that wall is
                // necessarily smeared across three times its true width, so a gradient
                // that preserves the *slope* triples the area of ground standing at it,
                // and the print stops reading as a print and starts reading as a
                // trench. Differencing over two texels halves it to about 12°, which is
                // what keeps the walls from tipping past the terminator — with a fill
                // light 4% of the Sun's, a normal that crosses it does not go dark, it
                // goes black, and a row of black slashes is what this looked like
                // before. The depth stays honest; only the slope is spread.
                const float step = ${((2 * TRACK_TEXEL_M) / TRACK_FIELD_M).toFixed(9)};
                float h0 = trackRelief(here);
                float hX = trackRelief(texture2D(uTrackMap, trackUv + vec2(step, 0.0)));
                float hZ = trackRelief(texture2D(uTrackMap, trackUv + vec2(0.0, step)));
                vec3 slope = vec3(-(hX - h0), 0.0, -(hZ - h0)) *
                    (within * relief / ${(2 * TRACK_TEXEL_M).toFixed(6)});

                // First-order perturbation, applied in view space so the ground's own
                // normal — crater walls, the regional slope, the detail map — survives
                // underneath it. mat3(viewMatrix) is the world-to-view rotation; the
                // ground is unscaled and unrotated, so nothing more is needed.
                normal = normalize(normal + mat3(viewMatrix) * slope);
            }
        }
    `;
}

function buildSurfaceMaterial(tracks: Tracks | null): MeshStandardMaterial {
    const material = new MeshStandardMaterial({ roughness: 1, metalness: 0 });

    material.onBeforeCompile = (shader) => {
        shader.uniforms.uSunDirectionView = { value: regolithSunDirectionView };

        let prefix = 'uniform vec3 uSunDirectionView;\n';

        if (tracks) {
            shader.uniforms.uTrackMap = { value: tracks.map };
            prefix +=
                'uniform sampler2D uTrackMap;\n' +
                'varying vec2 vSurfaceXZ;\n' +
                // Reassembled from the two positive channels it is stored in.
                `float trackRelief(vec4 t) {
                    return t.b * ${TRACK_RIM_M.toFixed(5)} - t.g * ${TRACK_BOWL_M.toFixed(5)};
                }\n`;

            shader.vertexShader = 'varying vec2 vSurfaceXZ;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                /* glsl */ `
                #include <begin_vertex>
                vSurfaceXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
                `
            );
        }

        shader.fragmentShader = prefix + shader.fragmentShader;
        // Injected here, immediately before the material struct is assembled, because
        // this is the first point in the chain where the shading normal exists *and*
        // `diffuseColor` has not yet been consumed. The old surge patch sat at
        // <color_fragment>, which is earlier than the normal and could therefore only
        // ever use terms that did not need one.
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <lights_physical_fragment>',
            /* glsl */ `
            {
                // vViewPosition runs from the fragment toward the camera; the Sun is
                // far enough off that its direction is the same across the whole view.
                vec3 viewDir = normalize(vViewPosition);
                vec3 sunDir = normalize(uSunDirectionView);

                float compaction = 0.0;
                ${tracks ? trackChunk() : ''}

                // Phase angle, between the direction to the camera and the direction to
                // the Sun. Zero is looking straight at your own shadow.
                float phase = acos(clamp(dot(viewDir, sunDir), -1.0, 1.0));

                float surge = ${OPPOSITION_AMPLITUDE.toFixed(2)} /
                    (1.0 + tan(min(phase, 3.0) * 0.5) / ${OPPOSITION_WIDTH.toFixed(3)});
                // Compacted ground has had the porosity that produces the surge crushed
                // out of it, so it keeps only a quarter of it. This is most of a print.
                surge *= 1.0 - ${TRACK_SURGE_LOSS.toFixed(3)} * compaction;

                // --- lunar-Lambert ---
                float mu0 = dot(normal, sunDir);
                float mu = dot(normal, viewDir);
                float phaseDeg = degrees(phase);
                // McEwen's L(alpha). Goes negative past about 105 deg of phase, where
                // the fit stops meaning anything and the surface is Lambertian anyway.
                float limb = clamp(
                    1.0 - 0.019 * phaseDeg + 0.000242 * phaseDeg * phaseDeg
                        - 1.46e-6 * phaseDeg * phaseDeg * phaseDeg,
                    0.0, 1.0
                );
                const float rough = ${ROUGHNESS_FLOOR.toFixed(5)};
                float disk = (2.0 * limb) / (max(mu0, rough) + max(mu, rough)) + (1.0 - limb);
                // Faded out where the Sun does not reach: what lights a surface turned
                // away from it is bounce off the regolith, which arrives from all over
                // the sky at once and is genuinely closer to Lambert.
                disk = mix(1.0, disk, smoothstep(0.0, 0.12, mu0));

                diffuseColor.rgb *= (1.0 + surge) * disk;
                // ...and the packing itself, which is much the smaller effect.
                diffuseColor.rgb *= mix(1.0, ${TRACK_ALBEDO_FACTOR.toFixed(3)}, compaction);
            }
            #include <lights_physical_fragment>
            `
        );
    };

    return material;
}

// --- assembly --------------------------------------------------------------

export interface Terrain {
    /** A `Group` of angular wedges — see the note on `SECTORS`. */
    readonly ground: Object3D;
    /** Two `InstancedMesh`es, split by size — see `buildBoulders`. */
    readonly boulders: Object3D;
    /**
     * The blocks big enough to stop somebody, in plan. Not the whole field: the size
     * distribution is a power law, so nearly all of it is 20 cm chips that a walker
     * steps over without noticing and a wheel rolls straight across — see
     * `BOULDER_SOLID_M`.
     */
    readonly obstacles: readonly Collider[];
    /** Ground height in metres at a point in the local frame. */
    heightAt(x: number, z: number): number;
    dispose(): void;
}

const noisePoint = new Vector3();

/** `noise.ts`'s fBm, handed metres rather than a direction. The lattice does not mind. */
function relief(x: number, z: number, seed: number, octaves = 2): number {
    return fbm(noisePoint.set(x, 0, z), seed, octaves);
}

export function buildTerrain(site: LandingSite, sample: SiteSample, tracks: Tracks): Terrain {
    const craters = buildCraterField(site);
    const random = mulberry32(site.seed + 977);

    /**
     * Everything that shapes the ground, at one point.
     *
     * Also the walker's ground query, which is exactly why it is a function rather
     * than being inlined into the vertex loop: a foot has to land on precisely the
     * surface the eye is looking at, and two implementations of that would drift
     * apart the first time either was touched.
     *
     * `subset` is the sweep optimisation and nothing more — the geometry pass hands
     * in only the craters whose reach covers the current ring, since every vertex
     * of a ring shares its radius. Callers who do not know which craters are relevant,
     * which is to say the walker, simply get all of them.
     */
    function heightAt(x: number, z: number, subset: readonly Crater[] = craters): number {
        const radius = Math.sqrt(x * x + z * z);

        // The sphere. This is the horizon.
        let height = -(radius * radius) / (2 * MOON_RADIUS_M);

        // The km-scale setting, out of LOLA. -z is north.
        height += (sample.slopeEast * x + sample.slopeNorth * -z) * slopeTaper(radius);

        // Undulation, in two bands: a slow roll from about 20 m down to 4, and a
        // hummocky texture from 4 m down to under one. The second band is what a
        // surface looks like after four billion years of overlapping impacts too small
        // and too degraded to read as craters any more — and its absence is why smooth
        // fractal ground always looks like a sand dune instead of regolith.
        height +=
            site.relief * 0.85 * relief(x / 45, z / 45, site.seed, 3) +
            site.relief * 0.34 * relief(x / 9, z / 9, site.seed + 13, 3);

        for (const crater of subset) {
            const dx = x - crater.x;
            const dz = z - crater.z;
            const distanceSq = dx * dx + dz * dz;
            // The cheap rejection that the profile's finite reach exists to allow.
            if (distanceSq > crater.reach * crater.reach) continue;
            height += craterProfile(Math.sqrt(distanceSq), crater.radius, crater.depth);
        }

        return height;
    }

    // --- vertices ---
    const vertexCount = 1 + RINGS * SPOKES;
    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const colours = new Float32Array(vertexCount * 3);

    const tint = new Color();
    const ejecta = new Color();

    // The few craters young enough and large enough to still have a ray system. Kept
    // apart from the height sweep because rays reach fifteen radii and the sweep drops
    // a crater at 1.7 — and because there are only ever a handful, so testing all of
    // them against every vertex costs less than maintaining a second sweep would.
    const rayCraters = craters
        .filter((crater) => crater.freshness > RAY_MIN_FRESHNESS && crater.radius > RAY_MIN_RADIUS_M)
        .sort((a, b) => b.radius - a.radius)
        .slice(0, 6);

    function writeVertex(index: number, x: number, z: number, subset: readonly Crater[]): void {
        positions[index * 3] = x;
        positions[index * 3 + 1] = heightAt(x, z, subset);
        positions[index * 3 + 2] = z;

        // World-scaled uv, so the detail map holds a fixed size on the ground instead
        // of stretching along with the rings.
        uvs[index * 2] = x / DETAIL_TILE_M;
        uvs[index * 2 + 1] = z / DETAIL_TILE_M;

        // Regolith is not one colour. Space weathering darkens exposed ground over
        // tens of millions of years and every impact turns some of it back over, so
        // the surface is mottled at the scale of that churn.
        const mottle = 0.85 + 0.3 * (relief(x / 30, z / 30, site.seed + 41) * 0.5 + 0.5);
        tint.copy(sample.albedo).multiplyScalar(mottle);

        // Fresh ejecta is the brightest material on the Moon: rock thrown out of a
        // recent impact has not been weathered yet. It is the entire reason Tycho's
        // rays are visible from Earth with the naked eye.
        let brightening = 0;
        for (const crater of subset) {
            if (crater.freshness < 0.62) continue;
            const dx = x - crater.x;
            const dz = z - crater.z;
            const distanceSq = dx * dx + dz * dz;
            if (distanceSq > crater.reach * crater.reach) continue;
            const inner = crater.radius * 0.85;
            const distance = Math.sqrt(distanceSq);
            if (distance < inner) continue;
            const across = (distance - inner) / (crater.reach - inner);
            brightening = Math.max(brightening, (1 - across) * crater.freshness);
        }
        // Rays. Streaks rather than a halo: the azimuth is folded into a handful of
        // bands, so most directions get nothing and a few get a bright lane running
        // out to fifteen radii. The noise term is what stops them being drawn with a
        // ruler — real rays are ragged and braided, and split as they go.
        for (const crater of rayCraters) {
            const dx = x - crater.x;
            const dz = z - crater.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            const outer = crater.radius * RAY_REACH_RADII;
            if (distance > outer || distance < crater.radius) continue;

            const lane = (Math.atan2(dz, dx) / (Math.PI * 2)) * RAY_COUNT + crater.phase * RAY_COUNT;
            const across = Math.abs((lane - Math.floor(lane)) - 0.5) * 2;
            // Narrow bright core, and the width wanders with distance out.
            const wander = relief(x / 26, z / 26, crater.phase * 1000) * 0.28;
            const lane_ = Math.min(1, Math.max(0, across + wander));
            const strength = 1 - lane_ * lane_ * (3 - 2 * lane_);

            const fade = 1 - (distance - crater.radius) / (outer - crater.radius);
            brightening = Math.max(brightening, strength * fade * fade * crater.freshness * 0.85);
        }

        if (brightening > 0) {
            ejecta.copy(sample.albedo).multiplyScalar(mottle * 1.4);
            tint.lerp(ejecta, Math.min(brightening, 1));
        }

        colours[index * 3] = tint.r;
        colours[index * 3 + 1] = tint.g;
        colours[index * 3 + 2] = tint.b;
    }

    // Sweep outward: rings are generated in increasing radius, so the set of craters
    // that can reach the current one only ever gains at the near end and loses at the
    // far end. Without this every vertex would be tested against every crater, which
    // at a cratered-highland site is 32,769 x 2,400 and turns a landing into a
    // half-second stall.
    const pending = [...craters].sort((a, b) => a.nearest - b.nearest);
    let admitted = 0;
    let active: Crater[] = [];

    function activeAt(radius: number): readonly Crater[] {
        while (admitted < pending.length && pending[admitted].nearest <= radius) {
            active.push(pending[admitted++]);
        }
        active = active.filter((crater) => crater.farthest >= radius);
        return active;
    }

    writeVertex(0, 0, 0, activeAt(0));

    for (let ring = 0; ring < RINGS; ring++) {
        const radius = INNER_RADIUS_M * Math.pow(RING_GROWTH, ring);
        const subset = activeAt(radius);

        for (let spoke = 0; spoke < SPOKES; spoke++) {
            const theta = (spoke / SPOKES) * Math.PI * 2;
            // Negative z with increasing angle, matching `geo.ts`'s handedness — and
            // also what makes the triangles below wind front-face up.
            writeVertex(
                1 + ring * SPOKES + spoke,
                radius * Math.cos(theta),
                -radius * Math.sin(theta),
                subset
            );
        }
    }

    // --- triangles, cut into cullable wedges ---
    //
    // Every quad belongs to the sector its *inner* spoke falls in, so the wedges tile
    // the disc exactly once. Crucially they share vertices rather than duplicating
    // them along the seams: one position buffer, one normal buffer, one of everything,
    // and a separate index per wedge. That is what keeps the seams invisible — split
    // buffers would mean `computeVertexNormals` averaging over different triangle sets
    // on either side of a boundary, and a lighting crease every 22.5° all the way to
    // the horizon.
    const quadsPerSector = SPOKES_PER_SECTOR * (RINGS - 1);
    const wedges: Uint32Array[] = [];

    for (let sector = 0; sector < SECTORS; sector++) {
        const indices = new Uint32Array(SPOKES_PER_SECTOR * 3 + quadsPerSector * 6);
        let cursor = 0;
        const firstSpoke = sector * SPOKES_PER_SECTOR;

        // The cap: a fan from the centre vertex out to the first ring.
        for (let k = 0; k < SPOKES_PER_SECTOR; k++) {
            const spoke = firstSpoke + k;
            indices[cursor++] = 0;
            indices[cursor++] = 1 + spoke;
            indices[cursor++] = 1 + ((spoke + 1) % SPOKES);
        }

        for (let ring = 0; ring < RINGS - 1; ring++) {
            const inner = 1 + ring * SPOKES;
            const outer = inner + SPOKES;
            for (let k = 0; k < SPOKES_PER_SECTOR; k++) {
                const spoke = firstSpoke + k;
                const next = (spoke + 1) % SPOKES;
                indices[cursor++] = inner + spoke;
                indices[cursor++] = outer + spoke;
                indices[cursor++] = outer + next;
                indices[cursor++] = inner + spoke;
                indices[cursor++] = outer + next;
                indices[cursor++] = inner + next;
            }
        }

        wedges.push(indices);
    }

    // The shadow proxy: the same surface, every fourth ring and every second spoke,
    // out to where the shadow camera stops. Same vertices, so it cannot disagree with
    // the ground it is standing in for.
    const proxyRings: number[] = [];
    for (let ring = 0; ring < RINGS - 1; ring += SHADOW_PROXY_RING_STEP) {
        proxyRings.push(ring);
        if (INNER_RADIUS_M * Math.pow(RING_GROWTH, ring) > SHADOW_PROXY_RADIUS_M) break;
    }
    const proxySpokes = Math.floor(SPOKES / SHADOW_PROXY_SPOKE_STEP);
    const proxyIndex = new Uint32Array((proxyRings.length - 1) * proxySpokes * 6);
    let proxyCursor = 0;
    for (let i = 0; i < proxyRings.length - 1; i++) {
        const inner = 1 + proxyRings[i] * SPOKES;
        const outer = 1 + proxyRings[i + 1] * SPOKES;
        for (let k = 0; k < proxySpokes; k++) {
            const spoke = k * SHADOW_PROXY_SPOKE_STEP;
            const next = (spoke + SHADOW_PROXY_SPOKE_STEP) % SPOKES;
            proxyIndex[proxyCursor++] = inner + spoke;
            proxyIndex[proxyCursor++] = outer + spoke;
            proxyIndex[proxyCursor++] = outer + next;
            proxyIndex[proxyCursor++] = inner + spoke;
            proxyIndex[proxyCursor++] = outer + next;
            proxyIndex[proxyCursor++] = inner + next;
        }
    }

    // A master geometry carrying the whole index, purely so `computeVertexNormals`
    // sees every triangle every vertex belongs to. It is never added to the scene; the
    // wedges below borrow its attributes.
    const master = new BufferGeometry();
    master.setAttribute('position', new Float32BufferAttribute(positions, 3));
    master.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    master.setAttribute('color', new Float32BufferAttribute(colours, 3));
    const fullIndex = new Uint32Array(wedges.reduce((n, w) => n + w.length, 0));
    let offset = 0;
    for (const wedge of wedges) {
        fullIndex.set(wedge, offset);
        offset += wedge.length;
    }
    master.setIndex(new Uint32BufferAttribute(fullIndex, 1));
    master.computeVertexNormals();

    const detailMap = buildDetailNormalMap(site.seed);
    const groundMaterial = buildSurfaceMaterial(tracks);
    groundMaterial.vertexColors = true;
    groundMaterial.normalMap = detailMap;

    const ground = new Group();
    const sectorGeometries: BufferGeometry[] = [];

    for (const indices of wedges) {
        const wedge = new BufferGeometry();
        // The *same* attribute objects, not copies. three.js caches the GPU buffer
        // against the attribute, so all sixteen wedges are drawn out of one upload of
        // the vertex data — the split is purely in the index.
        wedge.setAttribute('position', master.getAttribute('position'));
        wedge.setAttribute('normal', master.getAttribute('normal'));
        wedge.setAttribute('uv', master.getAttribute('uv'));
        wedge.setAttribute('color', master.getAttribute('color'));
        wedge.setIndex(new Uint32BufferAttribute(indices, 1));
        // Computed by hand over this wedge's own indices, because the built-in walks
        // the whole position attribute — which every wedge shares, so every one would
        // come back with the bounding sphere of the entire six-kilometre disc and none
        // of them would ever be culled. That is the whole point, undone in one line.
        wedge.boundingSphere = sectorBounds(positions, indices);

        const mesh = new Mesh(wedge, groundMaterial);
        mesh.receiveShadow = true;
        // Receives, never casts — the proxy below does the casting for all of them.
        mesh.castShadow = false;
        ground.add(mesh);
        sectorGeometries.push(wedge);
    }

    const proxyGeometry = new BufferGeometry();
    proxyGeometry.setAttribute('position', master.getAttribute('position'));
    proxyGeometry.setIndex(new Uint32BufferAttribute(proxyIndex, 1));
    proxyGeometry.boundingSphere = sectorBounds(positions, proxyIndex);
    const proxy = new Mesh(proxyGeometry, groundMaterial);
    proxy.castShadow = true;
    proxy.receiveShadow = false;
    // Only on the shadow layer, so the colour camera never draws it and the shadow
    // camera draws nothing else from the ground.
    proxy.layers.set(SHADOW_ONLY_LAYER);
    ground.add(proxy);
    sectorGeometries.push(proxyGeometry);

    const { object: boulders, obstacles } = buildBoulders(sample, craters, random, heightAt);

    return {
        ground,
        boulders,
        obstacles,
        heightAt,
        dispose() {
            // The attributes are shared, so disposing the master releases the vertex
            // buffers; the wedges only own their own index.
            master.dispose();
            for (const wedge of sectorGeometries) wedge.dispose();
            groundMaterial.dispose();
            detailMap.dispose();
            boulders.traverse((child) => {
                if (child instanceof InstancedMesh) {
                    child.geometry.dispose();
                    (child.material as MeshStandardMaterial).dispose();
                }
            });
        },
    };
}

/** A tight bounding sphere over just the vertices one wedge actually references. */
function sectorBounds(positions: Float32Array, indices: Uint32Array): Sphere {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < indices.length; i++) {
        const at = indices[i] * 3;
        const x = positions[at];
        const y = positions[at + 1];
        const z = positions[at + 2];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
    }

    const centre = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    const radius = Math.sqrt(
        ((maxX - minX) / 2) ** 2 + ((maxY - minY) / 2) ** 2 + ((maxZ - minZ) / 2) ** 2
    );
    return new Sphere(centre, radius);
}

// --- boulders --------------------------------------------------------------

/**
 * Where the blocks go, and it is much closer in than it first looks like it should be.
 *
 * The size distribution puts the median block near 20 cm, which subtends a couple of
 * pixels at 50 m and nothing at all past 100. Scattering the same count over a wider
 * field does not make a rockier landscape, it makes an emptier one — every extra
 * metre of radius spends blocks on ground where they cannot be resolved. Forty-five
 * metres at this count is one block per 13 m², which is about what the mare carries
 * above 20 cm and reads as a scatter of rocks rather than a sprinkle of dust.
 */
const BOULDER_FIELD_RADIUS_M = 45;
const BOULDER_COUNT = 520;
const BOULDER_MIN_M = 0.18;
const BOULDER_MAX_M = 3;
/** How many are thrown out around fresh crater rims rather than scattered at random. */
const BOULDER_EJECTA_FRACTION = 0.65;
/**
 * Clear ground at the landing point. Not physics — nobody sets a spacecraft down on
 * top of a boulder, and a two-metre block a metre from your visor on the first frame
 * reads as a bug rather than as terrain.
 */
const BOULDER_KEEP_OUT_M = 4;
/** Blocks at least this wide get the subdivided icosahedron. See `buildBoulders`. */
const BOULDER_DETAIL_THRESHOLD_M = 0.75;
/**
 * And at least this wide are things you walk *round* rather than over.
 *
 * Half a metre is a little above the knee of a suited crewman and a little above the
 * LRV's 36 cm of ground clearance, which is the coincidence that lets one number serve
 * both — below it, a block is something the walker's own step height and the rover's
 * axles deal with silently. It also keeps the collider list to the few dozen blocks that
 * are actually in the way: the size distribution is a power law, so raising the bar from
 * 20 cm to 50 cm removes about nine tenths of the field and none of the obstacles.
 */
const BOULDER_SOLID_M = 0.5;

function buildBoulders(
    sample: SiteSample,
    craters: Crater[],
    random: () => number,
    heightAt: (x: number, z: number) => number
): { object: Object3D; obstacles: Collider[] } {
    // Blocks large enough to see are thrown out of impacts, so most of them lie in
    // the ejecta blankets of the fresher craters rather than being sprinkled evenly
    // about. That clustering is the whole reason to place them deliberately.
    const sources = craters.filter(
        (crater) =>
            crater.freshness > 0.4 &&
            crater.radius > 1 &&
            Math.hypot(crater.x, crater.z) < BOULDER_FIELD_RADIUS_M * 1.5
    );

    interface Placement {
        x: number;
        z: number;
        size: number;
        sink: number;
        axis: Vector3;
        angle: number;
        scale: Vector3;
    }
    const placements: Placement[] = [];

    for (let attempt = 0; placements.length < BOULDER_COUNT && attempt < BOULDER_COUNT * 4; attempt++) {
        let x: number;
        let z: number;

        if (sources.length > 0 && random() < BOULDER_EJECTA_FRACTION) {
            const crater = sources[Math.floor(random() * sources.length)];
            const distance = crater.radius * (1.05 + random() * 0.9);
            const theta = random() * Math.PI * 2;
            x = crater.x + distance * Math.cos(theta);
            z = crater.z - distance * Math.sin(theta);
        } else {
            const distance = BOULDER_FIELD_RADIUS_M * Math.sqrt(random());
            const theta = random() * Math.PI * 2;
            x = distance * Math.cos(theta);
            z = -distance * Math.sin(theta);
        }

        if (x * x + z * z < BOULDER_KEEP_OUT_M * BOULDER_KEEP_OUT_M) continue;

        // The same power law as the craters — the rock came apart the same way, and
        // small blocks vastly outnumber large ones.
        const size = craterDiameter(random(), BOULDER_MIN_M, BOULDER_MAX_M) / 2;

        placements.push({
            x,
            z,
            size,
            // Partly buried. A block sitting exactly on the surface reads as dropped
            // there; most of these have been worked into the regolith for an age.
            sink: size * (0.2 + random() * 0.45),
            axis: new Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize(),
            angle: random() * Math.PI * 2,
            // Angular rather than round: these are fragments, so the icosahedron is
            // squashed on all three axes to keep any two from looking alike.
            scale: new Vector3(
                size * (0.7 + random() * 0.6),
                size * (0.6 + random() * 0.5),
                size * (0.7 + random() * 0.6)
            ),
        });
    }

    // Two meshes, split by size, and the split is what makes the budget work. The size
    // distribution is a power law, so the overwhelming majority are 20 cm chips that
    // never cover more than a few pixels and are perfectly served by a bare
    // icosahedron's twenty faces — faceted is what a shattered block looks like. The
    // handful of metre-plus blocks are the ones you walk up to, and at twenty faces
    // those read as cut glass. Subdividing *those* costs 80 triangles each on maybe
    // sixty instances; subdividing all of them cost four times the whole boulder
    // field, in both the colour pass and the shadow pass.
    const coarse = placements.filter((p) => p.size * 2 < BOULDER_DETAIL_THRESHOLD_M);
    const fine = placements.filter((p) => p.size * 2 >= BOULDER_DETAIL_THRESHOLD_M);

    // No track field: nobody leaves a bootprint on a rock, and a boulder sampling the
    // ground's compaction at its own footprint would wear whatever ran past its base.
    const material = buildSurfaceMaterial(null);
    // Exposed blocks are brighter than the powder around them — that powder is what a
    // few billion years of micrometeorite grinding did to rock exactly like this.
    material.color.copy(sample.albedo).multiplyScalar(1.35);

    const group = new Group();
    const obstacles: Collider[] = [];
    const matrix = new Matrix4();
    const position = new Vector3();
    const quaternion = new Quaternion();

    for (const [batch, detail] of [[coarse, 0], [fine, 1]] as const) {
        if (batch.length === 0) continue;
        const mesh = new InstancedMesh(new IcosahedronGeometry(1, detail), material, batch.length);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // The instance matrices scatter these over tens of metres; the geometry's own
        // bounds are a unit sphere at the origin, so culling on them would drop the
        // whole field the moment the observer looked away from their own feet.
        mesh.frustumCulled = false;

        batch.forEach((placement, i) => {
            position.set(placement.x, heightAt(placement.x, placement.z) - placement.sink, placement.z);
            quaternion.setFromAxisAngle(placement.axis, placement.angle);
            matrix.compose(position, quaternion, placement.scale);
            mesh.setMatrixAt(i, matrix);

            // Solid, if it is big enough to be worth being solid. The block is an
            // arbitrarily-rotated ellipsoid, so the plan radius is taken from its widest
            // horizontal semi-axis and the top from its own — a little generous either
            // way, which is the right direction to be wrong in: being stopped a few
            // centimetres early beside a rock reads as the rock, and walking through the
            // middle of one reads as a bug.
            if (placement.size * 2 >= BOULDER_SOLID_M) {
                obstacles.push({
                    x: placement.x,
                    z: placement.z,
                    radius: Math.max(placement.scale.x, placement.scale.z),
                    top: position.y + placement.scale.y,
                });
            }
        });

        mesh.instanceMatrix.needsUpdate = true;
        group.add(mesh);
    }

    return { object: group, obstacles };
}
