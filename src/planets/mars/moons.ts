import {
    BufferGeometry,
    Color,
    Float32BufferAttribute,
    IcosahedronGeometry,
    Mesh,
    MeshStandardMaterial,
    Vector3,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { latLonToDirection } from '../../geo';
import { fbm, mulberry32 } from '../../noise';
import {
    DEIMOS_SEMI_AXES_KM,
    EARTH_RADIUS_KM,
    MARTIAN_MOON_GEOMETRIC_ALBEDO,
    PHOBOS_SEMI_AXES_KM,
} from '../../constants/planets.const';

/**
 * Phobos and Deimos, built rather than textured.
 *
 * Every other body here wraps a NASA map around a sphere. These two cannot: they are
 * not spheres, and the shape is the whole point — at 11 km and 6 km across, an
 * observer close enough to see them at all is close enough to see that they are
 * lumps of rock rather than little planets. The overall figure is real (the triaxial
 * axes are measured), the relief on top of it is generated.
 *
 * Both are also extremely dark, geometric albedo 0.068, which is what a D-type
 * asteroid looks like and part of why they are usually taken for captured ones.
 */

// --- craters ---------------------------------------------------------------

interface Crater {
    centre: Vector3;
    /** Half-width as an angle at the body's centre, radians. */
    angularRadius: number;
    /** Depth as a fraction of the mean radius. */
    depth: number;
}

/**
 * A crater bowl plus its raised rim, as a fraction of the mean radius.
 *
 * Craters on bodies this small are enormous relative to them — Stickney is nearly a
 * quarter of Phobos's circumference — so they have to be laid on as real geometry
 * rather than suggested with a bump map, or the silhouette stays a smooth egg.
 */
function craterProfile(crater: Crater, angle: number): number {
    const s = angle / crater.angularRadius;
    if (s > 1.7) return 0;

    // Parabolic floor, reaching the surrounding surface exactly at the rim.
    const bowl = s < 1 ? -crater.depth * (1 - s * s) : 0;
    // Ejecta piled just outside it. Shallow, but it is what stops overlapping
    // craters from reading as a single dented region.
    const rim = crater.depth * 0.34 * Math.exp(-(((s - 1) * 2.6) ** 2));
    return bowl + rim;
}

interface MoonShape {
    /** [toward Mars, along the spin axis, along the orbit], km. */
    semiAxesKm: readonly [number, number, number];
    seed: number;
    /** Fractal relief amplitude, as a fraction of the mean radius. */
    relief: number;
    craterCount: number;
    /** Depth of a crater as a fraction of its angular radius. */
    craterDepth: number;
    /** Craters big enough to have names and known positions. */
    landmarks?: Array<{ latitude: number; longitude: number; angularRadius: number; depth: number }>;
}

function buildCraters(shape: MoonShape): Crater[] {
    const random = mulberry32(shape.seed);
    const craters: Crater[] = (shape.landmarks ?? []).map((landmark) => ({
        centre: latLonToDirection(landmark.latitude, landmark.longitude),
        angularRadius: landmark.angularRadius,
        depth: landmark.depth,
    }));

    for (let i = 0; i < shape.craterCount; i++) {
        // Uniform on the sphere: cos(latitude) has to be the uniform variable, or
        // the craters bunch up at the poles.
        const z = random() * 2 - 1;
        const azimuth = random() * Math.PI * 2;
        const ring = Math.sqrt(1 - z * z);

        // Small craters vastly outnumber large ones, so the draw is biased hard
        // toward the bottom of the range — but not below about 3.4°, because a
        // crater narrower than a couple of vertex spacings just nudges a few points
        // and reads as noise rather than as a crater.
        const angularRadius = 0.06 + 0.3 * random() ** 2.2;

        craters.push({
            centre: new Vector3(ring * Math.cos(azimuth), z, ring * Math.sin(azimuth)),
            angularRadius,
            depth: shape.craterDepth * angularRadius,
        });
    }

    return craters;
}

const direction = new Vector3();
const vertexColour = new Color();

/**
 * Geometric albedo is not what a diffuse material's colour means.
 *
 * The quoted 0.068 is how bright the body looks at full phase compared with a
 * perfectly diffusing disc of the same size; the material wants the *hemispherical*
 * reflectance, how much of the light arriving actually leaves again. For a Lambert
 * sphere the two differ by exactly 2/3, so the reflectance is half again the number
 * everyone quotes. Feeding the geometric albedo straight in makes the moons a third
 * darker than they are, which on bodies this dark is the difference between dim and
 * invisible.
 */
const DIFFUSE_ALBEDO = MARTIAN_MOON_GEOMETRIC_ALBEDO * 1.5;

function buildMoon(shape: MoonShape): Mesh {
    // An icosphere rather than a UV sphere: the vertices are evenly spread, so relief
    // is resolved equally everywhere instead of piling detail at the poles, and there
    // is no texture seam to crease.
    //
    // `detail` is *not* a recursion depth — `PolyhedronGeometry` cuts each icosahedron
    // edge into `detail + 1`, so the count is 10(detail+1)² + 2 and grows
    // quadratically rather than exponentially. A number that looks like a sensible
    // subdivision depth gives a few hundred vertices, 9° apart, and then no crater
    // below resolves at all: the moons come out as smooth eggs. 32 puts them 1.9°
    // apart for 21,780 triangles, comfortably under the 32,768 Earth uses. Every
    // other body here takes its detail from a texture; with no map to wrap on, for
    // these two the geometry *is* the detail, so it earns more than their size
    // suggests. Finer than this stops being visible.
    const source = new IcosahedronGeometry(1, 32);

    // The merge welds shared vertices, so `computeVertexNormals` below can average
    // across the faces meeting at each one instead of shading every triangle flat.
    //
    // Deleting the other two attributes first is what makes it do anything at all:
    // `mergeVertices` only welds vertices whose *every* attribute matches, and on a
    // non-indexed polyhedron the normals are per-face by construction, so no two
    // copies of a corner ever agree. Left in, the weld silently no-ops and the moons
    // come out visibly faceted, with the terminator crawling along triangle edges.
    // Both attributes are rebuilt below anyway.
    source.deleteAttribute('normal');
    source.deleteAttribute('uv');
    const geometry: BufferGeometry = mergeVertices(source);
    const position = geometry.attributes.position;
    const craters = buildCraters(shape);

    const [alongMars, alongSpin, alongOrbit] = shape.semiAxesKm;
    const scaleX = alongMars / EARTH_RADIUS_KM;
    const scaleY = alongSpin / EARTH_RADIUS_KM;
    const scaleZ = alongOrbit / EARTH_RADIUS_KM;

    const colours = new Float32Array(position.count * 3);

    for (let i = 0; i < position.count; i++) {
        direction.fromBufferAttribute(position, i).normalize();

        let displacement = fbm(direction, shape.seed, 5) * shape.relief;
        for (const crater of craters) {
            displacement += craterProfile(crater, direction.angleTo(crater.centre));
        }

        // Relief first, ellipsoid second: the lumps ride on the measured figure
        // rather than being flattened along with it.
        const radius = 1 + displacement;
        position.setXYZ(i, direction.x * radius * scaleX, direction.y * radius * scaleY, direction.z * radius * scaleZ);

        // Regolith is not uniform — fresher material thrown out of craters is
        // brighter than the space-weathered surface around it. A slow noise on top
        // of the albedo is enough to keep the terminator from looking painted on.
        const mottle = 0.86 + 0.28 * (fbm(direction, shape.seed + 41, 3) * 0.5 + 0.5);
        vertexColour.setRGB(
            DIFFUSE_ALBEDO * 1.08 * mottle,
            DIFFUSE_ALBEDO * mottle,
            DIFFUSE_ALBEDO * 0.9 * mottle
        );
        colours[i * 3] = vertexColour.r;
        colours[i * 3 + 1] = vertexColour.g;
        colours[i * 3 + 2] = vertexColour.b;
    }

    position.needsUpdate = true;
    geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
    geometry.computeVertexNormals();

    return new Mesh(
        geometry,
        new MeshStandardMaterial({
            // The albedo lives in the vertex colours, so the material tint stays out
            // of the way at white.
            vertexColors: true,
            roughness: 1,
            metalness: 0,
        })
    );
}

export const phobos = buildMoon({
    semiAxesKm: PHOBOS_SEMI_AXES_KM,
    seed: 1877, // the year Hall found them
    relief: 0.055,
    craterCount: 38,
    // Impact craters run about a fifth as deep as they are wide, and `angularRadius`
    // is a half-width, so the fresh-crater ratio lands on 0.4 rather than being
    // picked by eye. Stickney below obeys it too: 0.4 x 0.43 rad is 2.1 km, its
    // measured depth.
    craterDepth: 0.4,
    landmarks: [
        // Stickney, 9.5 km across on a body whose mean radius is 11.1 — the impact
        // came close to breaking Phobos apart, and it takes a visible bite out of
        // the silhouette. Placed at its real 1°N 49°W, which lands it just off the
        // sub-Mars point on the leading side.
        { latitude: 1, longitude: 311, angularRadius: 0.43, depth: 0.19 },
    ],
});

export const deimos = buildMoon({
    // Deimos is conspicuously smoother than Phobos: its craters are largely buried
    // under regolith that Phobos, closer in and more strongly tugged at, does not
    // hold on to. So the same generator, run shallow.
    semiAxesKm: DEIMOS_SEMI_AXES_KM,
    seed: 6247,
    relief: 0.032,
    craterCount: 28,
    // Two fifths of a fresh crater's depth: what is left after the regolith has
    // filled them in.
    craterDepth: 0.16,
});
