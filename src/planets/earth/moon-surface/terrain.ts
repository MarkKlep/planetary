import {
    BufferGeometry,
    CanvasTexture,
    Color,
    Float32BufferAttribute,
    IcosahedronGeometry,
    InstancedMesh,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    Quaternion,
    RepeatWrapping,
    Uint32BufferAttribute,
    Vector3,
} from 'three';
import { CRATER_REACH, craterDiameter, craterProfile } from '../../../craters';
import { fbm, mulberry32 } from '../../../noise';
import { MOON_RADIUS_M } from '../../../constants/planets.const';
import type { LandingSite } from './sites';
import type { SiteSample } from './site-samples';

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

const RINGS = 128;
const SPOKES = 256;
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
 * radius of at least 0.06·r, just under one ring of spacing.
 *
 * It has a useful consequence. The expected count per octave of distance works out
 * *independent* of the distance, so the field is scale-free in the same way the grid
 * is, and the total is logarithmic in the patch radius rather than quadratic. Seven
 * hundred craters cover three kilometres; a uniform field at the same density and the
 * same smallest size would need some three million.
 */
const CRATER_MIN_RADIUS_FACTOR = 0.06;
/** Largest crater relative to the smallest generated at the same distance. */
const CRATER_SIZE_SPAN = 40;
const CRATER_MAX_DIAMETER_M = 1200;
/** Nothing beyond here can clear the horizon, so nothing beyond here is generated. */
const CRATER_FIELD_RADIUS_M = 2800;
/** Below this the grid could not resolve one anyway; the detail map takes over. */
const CRATER_FIELD_INNER_M = 1.5;
/** Depth of a fresh simple crater as a fraction of its diameter. */
const FRESH_DEPTH_RATIO = 0.2;

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

const DETAIL_TEXTURE_SIZE = 512;
/** Metres covered by one tile of the detail map. */
const DETAIL_TILE_M = 3;
/** Height of the finest relief, metres — the pitting and gardening of the regolith. */
const DETAIL_RELIEF_M = 0.045;

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
 * everything.
 */
const OPPOSITION_AMPLITUDE = 1.0;
const OPPOSITION_WIDTH = 0.06;

function buildSurfaceMaterial(): MeshStandardMaterial {
    const material = new MeshStandardMaterial({ roughness: 1, metalness: 0 });

    material.onBeforeCompile = (shader) => {
        shader.uniforms.uSunDirectionView = { value: regolithSunDirectionView };

        shader.fragmentShader = `uniform vec3 uSunDirectionView;\n` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            /* glsl */ `
            #include <color_fragment>
            {
                // Phase angle: the angle at this point between the direction to the
                // camera and the direction to the Sun. vViewPosition already runs
                // from the fragment toward the camera, and the Sun is far enough off
                // that its direction is the same across the whole view.
                float cosPhase = clamp(dot(normalize(vViewPosition), normalize(uSunDirectionView)), -1.0, 1.0);
                float phase = acos(cosPhase);
                float surge = ${OPPOSITION_AMPLITUDE.toFixed(2)} /
                    (1.0 + tan(min(phase, 3.0) * 0.5) / ${OPPOSITION_WIDTH.toFixed(3)});
                diffuseColor.rgb *= 1.0 + surge;
            }
            `
        );
    };

    return material;
}

// --- assembly --------------------------------------------------------------

export interface Terrain {
    readonly ground: Mesh;
    readonly boulders: InstancedMesh;
    /** Ground height in metres at a point in the local frame. */
    heightAt(x: number, z: number): number;
    dispose(): void;
}

const noisePoint = new Vector3();

/** `noise.ts`'s fBm, handed metres rather than a direction. The lattice does not mind. */
function relief(x: number, z: number, seed: number): number {
    return fbm(noisePoint.set(x, 0, z), seed, 2);
}

export function buildTerrain(site: LandingSite, sample: SiteSample): Terrain {
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
     * in only the craters whose reach covers the current ring, since all 256 vertices
     * of a ring share a radius. Callers who do not know which craters are relevant,
     * which is to say the walker, simply get all of them.
     */
    function heightAt(x: number, z: number, subset: readonly Crater[] = craters): number {
        const radius = Math.sqrt(x * x + z * z);

        // The sphere. This is the horizon.
        let height = -(radius * radius) / (2 * MOON_RADIUS_M);

        // The km-scale setting, out of LOLA. -z is north.
        height += (sample.slopeEast * x + sample.slopeNorth * -z) * slopeTaper(radius);

        // Metre-scale undulation: the slow roll of a surface that has been churned by
        // impacts for four billion years and never once rained on.
        height +=
            site.relief * 0.6 * relief(x / 14, z / 14, site.seed) +
            site.relief * 0.3 * relief(x / 4.5, z / 4.5, site.seed + 13);

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
            if (crater.freshness < 0.45) continue;
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
        if (brightening > 0) {
            ejecta.copy(sample.albedo).multiplyScalar(mottle * 1.75);
            tint.lerp(ejecta, brightening);
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

    // --- triangles ---
    const indices = new Uint32Array(SPOKES * 3 + (RINGS - 1) * SPOKES * 6);
    let cursor = 0;

    // The cap: a fan from the centre vertex out to the first ring.
    for (let spoke = 0; spoke < SPOKES; spoke++) {
        indices[cursor++] = 0;
        indices[cursor++] = 1 + spoke;
        indices[cursor++] = 1 + ((spoke + 1) % SPOKES);
    }

    for (let ring = 0; ring < RINGS - 1; ring++) {
        const inner = 1 + ring * SPOKES;
        const outer = inner + SPOKES;
        for (let spoke = 0; spoke < SPOKES; spoke++) {
            const next = (spoke + 1) % SPOKES;
            indices[cursor++] = inner + spoke;
            indices[cursor++] = outer + spoke;
            indices[cursor++] = outer + next;
            indices[cursor++] = inner + spoke;
            indices[cursor++] = outer + next;
            indices[cursor++] = inner + next;
        }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
    geometry.setIndex(new Uint32BufferAttribute(indices, 1));
    geometry.computeVertexNormals();

    const detailMap = buildDetailNormalMap(site.seed);
    const groundMaterial = buildSurfaceMaterial();
    groundMaterial.vertexColors = true;
    groundMaterial.normalMap = detailMap;

    const ground = new Mesh(geometry, groundMaterial);
    ground.receiveShadow = true;
    ground.castShadow = true;

    const boulders = buildBoulders(sample, craters, random, heightAt);

    return {
        ground,
        boulders,
        heightAt,
        dispose() {
            geometry.dispose();
            groundMaterial.dispose();
            detailMap.dispose();
            boulders.geometry.dispose();
            (boulders.material as MeshStandardMaterial).dispose();
        },
    };
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

function buildBoulders(
    sample: SiteSample,
    craters: Crater[],
    random: () => number,
    heightAt: (x: number, z: number) => number
): InstancedMesh {
    // Blocks large enough to see are thrown out of impacts, so most of them lie in
    // the ejecta blankets of the fresher craters rather than being sprinkled evenly
    // about. That clustering is the whole reason to place them deliberately.
    const sources = craters.filter(
        (crater) =>
            crater.freshness > 0.4 &&
            crater.radius > 1 &&
            Math.hypot(crater.x, crater.z) < BOULDER_FIELD_RADIUS_M * 1.5
    );

    const material = buildSurfaceMaterial();
    // Exposed blocks are brighter than the powder around them — that powder is what a
    // few billion years of micrometeorite grinding did to rock exactly like this.
    material.color.copy(sample.albedo).multiplyScalar(1.35);

    const mesh = new InstancedMesh(new IcosahedronGeometry(1, 1), material, BOULDER_COUNT);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // The instance matrices scatter these over 160 m; the geometry's own bounds are a
    // unit sphere at the origin, so culling on them would drop the whole field the
    // moment the observer looked away from their own feet.
    mesh.frustumCulled = false;

    const matrix = new Matrix4();
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    const axis = new Vector3();

    for (let i = 0; i < BOULDER_COUNT; i++) {
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

        // The same power law as the craters — the rock came apart the same way, and
        // small blocks vastly outnumber large ones.
        const size = craterDiameter(random(), BOULDER_MIN_M, BOULDER_MAX_M) / 2;
        // Partly buried. A block sitting exactly on the surface reads as dropped
        // there; most of these have been worked into the regolith for an age.
        const sink = size * (0.2 + random() * 0.45);

        position.set(x, heightAt(x, z) - sink, z);
        axis.set(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize();
        quaternion.setFromAxisAngle(axis, random() * Math.PI * 2);
        // Angular rather than round: these are fragments, so the icosahedron is
        // squashed on all three axes to keep any two from looking alike.
        scale.set(
            size * (0.7 + random() * 0.6),
            size * (0.6 + random() * 0.5),
            size * (0.7 + random() * 0.6)
        );

        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(i, matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
}
