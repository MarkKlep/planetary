import {
    BoxGeometry,
    BufferGeometry,
    CanvasTexture,
    Color,
    CylinderGeometry,
    Group,
    MathUtils,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    Object3D,
    PlaneGeometry,
    Quaternion,
    RepeatWrapping,
    SRGBColorSpace,
    SphereGeometry,
    TorusGeometry,
    Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { earth } from './planets/earth/earth';
import { latLonToDirection, toWorldFrame } from './geo';
import { getSimulatedDate } from './simulation';
import {
    EARTH_RADIUS_KM,
    ISS_ALTITUDE_KM,
    ISS_INCLINATION_DEG,
    ISS_MODEL_SCALE,
    ISS_ORBITAL_PERIOD_S,
    ISS_ORBITAL_RADIUS,
    ISS_ORBITAL_SPEED_KM_S,
    ISS_TRUSS_LENGTH_M,
    ISS_UPDATE_INTERVAL,
} from './constants/planets.const';

/**
 * The International Space Station.
 *
 * ## Scale
 *
 * Every dimension below is the flown one, in **metres**, and the whole group is scaled
 * by the single factor `ISS_MODEL_SCALE` on the way into the scene. The overall size is
 * a deliberate lie — 109 m at true scale is 1.7e-5 scene units, a thousandth of a pixel
 * — but the *proportions* are not, which is the same bargain `body-marker.ts` strikes
 * for the planets. One number to change if the exaggeration ever needs revisiting, and
 * nothing inside this file to touch when it does.
 *
 * ## Local frame
 *
 * **+X starboard, +Y zenith, +Z along the velocity vector.** That is the station's own
 * flight attitude (+XVV ZLV, in the operational shorthand): the pressurised modules run
 * fore-and-aft along the direction of travel, the truss lies across it, and the
 * Earth-facing side is −Y. `updateISS()` builds that basis every frame out of the orbit
 * itself rather than calling `lookAt`, which can only fix one axis and leaves the roll
 * to whatever the world up vector happens to imply — with a `lookAt` the truss slowly
 * rolls through the orbit and the station flies sideways half the time.
 *
 * ## What makes it read as the ISS
 *
 * Not the part count. Four things, and each is worth its geometry:
 *
 *  - **The truss is a see-through lattice, not a beam.** 108.5 m of open aluminium with
 *    the sky visible through every bay, and it is the longest thing on the station by a
 *    factor of two.
 *  - **Eight array wings in four pairs, extending fore and aft** — not radially out
 *    along the truss, which is the usual mistake. Each wing is 34 m long and 11.6 m
 *    wide, so the arrays reach further across the orbit track than the modules do.
 *  - **The modules are perpendicular to the truss and hang below it**, in a chain that
 *    is visibly narrower than it is long, with side modules (Columbus, Kibō, Node 3)
 *    branching off the two nodes.
 *  - **The radiators are white and the arrays are black-blue**, on opposite sides. Half
 *    the station's recognisability is that one contrast.
 *
 * ## What moves
 *
 * The arrays track the Sun on both of their real axes, and the radiators track it too —
 * edge-on, which is the opposite thing to want. See `updateISS()`.
 */
const iss = new Group();
iss.name = 'International Space Station';
iss.scale.setScalar(ISS_MODEL_SCALE);

// --- materials -------------------------------------------------------------

/** Anodised aluminium: the truss, the masts, the booms. */
const trussMaterial = new MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.45, metalness: 0.82 });
/** US and European pressurised modules, under white multi-layer insulation. */
const hullMaterial = new MeshStandardMaterial({ color: 0xdcdad4, roughness: 0.52, metalness: 0.24 });
/**
 * The Russian segment, which is genuinely a different colour: Zarya and Zvezda wear a
 * greenish screen-vacuum insulation rather than the US segment's white beta cloth, and
 * fifty years of photographs show the two halves of the station not matching.
 */
const russianHullMaterial = new MeshStandardMaterial({ color: 0xc6bda4, roughness: 0.62, metalness: 0.2 });
/** Gold Kapton over the docking adapters and the smaller fittings. */
const foilMaterial = new MeshStandardMaterial({ color: 0xc08a2e, roughness: 0.3, metalness: 0.85 });
/**
 * The heat-rejection radiators. Deliberately the brightest, flattest white on the
 * station: they are ammonia loops facing deep space, and their whole job is to be a
 * poor absorber, which is exactly what a specular white surface is.
 */
const radiatorMaterial = new MeshStandardMaterial({ color: 0xe9edf0, roughness: 0.32, metalness: 0.28 });
/** Photovoltaic blanket, front face. The cell grid comes from the generated map. */
const solarMaterial = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.34,
    metalness: 0.6,
});
/**
 * ...and the back of the same blanket, which is not blue. The reverse side is bare
 * Kapton substrate and photographs a warm orange — visible on roughly half the wings
 * from any given angle, and leaving it blue is what makes a model of this look like
 * eight sheets of card.
 */
const kaptonMaterial = new MeshStandardMaterial({ color: 0xa9762c, roughness: 0.44, metalness: 0.52 });
/** Handrails, hinges, thrusters, the shadowed interior of the truss bays. */
const darkMaterial = new MeshStandardMaterial({ color: 0x35383d, roughness: 0.68, metalness: 0.45 });
/** The Cupola's seven windows, and the Soyuz's. */
const glassMaterial = new MeshStandardMaterial({
    color: 0x0b1620,
    roughness: 0.08,
    metalness: 0.9,
});

/**
 * Going dark sixteen times a day.
 *
 * The scene's `sunLight` casts no shadows — there is no shadow map in the solar-system
 * view at all — so the station would otherwise stay brightly lit while flying through
 * the middle of Earth's shadow, which is both wrong and the one place the read-out beside
 * it would be visibly contradicted. Since these materials belong to nothing else in the
 * scene, the cheapest honest fix is to dim them directly: one colour write per material
 * on the frames where the factor actually moves, and no shader recompile.
 *
 * The floor is not zero. Earth fills a third of the sky from up there at an albedo of
 * 0.3, so a station in eclipse is genuinely earthlit — dim, blue, and nothing like black.
 */
const ECLIPSE_FLOOR = 0.11;
const baseColours = new Map<MeshStandardMaterial, Color>();
let eclipseFactor = -1;

function setEclipse(factor: number): void {
    if (Math.abs(factor - eclipseFactor) < 0.002) return;
    eclipseFactor = factor;
    const scale = ECLIPSE_FLOOR + (1 - ECLIPSE_FLOOR) * factor;
    for (const [material, base] of baseColours) {
        material.color.copy(base).multiplyScalar(scale);
    }
}

const MATERIALS = {
    truss: trussMaterial,
    hull: hullMaterial,
    russian: russianHullMaterial,
    foil: foilMaterial,
    radiator: radiatorMaterial,
    solar: solarMaterial,
    kapton: kaptonMaterial,
    dark: darkMaterial,
    glass: glassMaterial,
} as const;

type MaterialKey = keyof typeof MATERIALS;

for (const material of Object.values(MATERIALS)) {
    baseColours.set(material, material.color.clone());
}

/**
 * The photovoltaic cell grid.
 *
 * Generated rather than drawn as geometry: the blankets carry 32,800 cells apiece, and
 * the eight wings between them are never more than a few hundred pixels across. A map
 * costs one 64×64 canvas; the same detail in triangles costs a quarter of a million.
 * Tiled through the UVs of each blanket (see `scaleUv`) rather than through
 * `texture.repeat`, because the Russian arrays are a different size from the US ones
 * and a single repeat would give them the wrong cell pitch.
 */
function buildCellTexture(): CanvasTexture {
    const size = 64;
    const cells = 4;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // The gaps between cells are the interconnects and the Kapton behind them, which
    // are lighter than the cells and are most of what you actually see at a distance.
    ctx.fillStyle = '#2c3a5c';
    ctx.fillRect(0, 0, size, size);

    const pitch = size / cells;
    for (let row = 0; row < cells; row++) {
        for (let column = 0; column < cells; column++) {
            const x = column * pitch;
            const y = row * pitch;
            // A gradient across each cell rather than a flat fill: silicon under glass
            // is a near-mirror at grazing angles, and the sheen is what stops the wing
            // reading as painted card.
            const sheen = ctx.createLinearGradient(x, y, x + pitch, y + pitch);
            sheen.addColorStop(0, '#101f45');
            sheen.addColorStop(0.55, '#0a1633');
            sheen.addColorStop(1, '#16294f');
            ctx.fillStyle = sheen;
            ctx.fillRect(x + 1, y + 1, pitch - 2, pitch - 2);
        }
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.colorSpace = SRGBColorSpace;
    return texture;
}

solarMaterial.map = buildCellTexture();

// --- geometry helpers ------------------------------------------------------

type Placement = readonly [number, number, number];

/** Collects geometry per material so each one is drawn in a single call. */
class PartSet {
    private readonly groups = new Map<MaterialKey, BufferGeometry[]>();

    add(key: MaterialKey, geometry: BufferGeometry, [x, y, z]: Placement = [0, 0, 0]): void {
        geometry.translate(x, y, z);
        const existing = this.groups.get(key);
        if (existing) existing.push(geometry);
        else this.groups.set(key, [geometry]);
    }

    /** Mirrored port and starboard, which most of this station is. */
    addPair(key: MaterialKey, build: () => BufferGeometry, [x, y, z]: Placement): void {
        this.add(key, build(), [x, y, z]);
        this.add(key, build(), [-x, y, z]);
    }

    build(target: Object3D): void {
        for (const [key, geometries] of this.groups) {
            const merged = mergeGeometries(geometries, false);
            if (!merged) continue;
            target.add(new Mesh(merged, MATERIALS[key]));
        }
    }
}

/** A square-section bar of the given length, lying along one axis. */
function bar(length: number, thickness: number, axis: 'x' | 'y' | 'z'): BufferGeometry {
    if (axis === 'x') return new BoxGeometry(length, thickness, thickness);
    if (axis === 'y') return new BoxGeometry(thickness, length, thickness);
    return new BoxGeometry(thickness, thickness, length);
}

const UP = new Vector3(0, 1, 0);
const strutFrom = new Vector3();
const strutTo = new Vector3();
const strutDirection = new Vector3();
const strutQuaternion = new Quaternion();

/** A bar between two arbitrary points — the truss diagonals and the arm's booms. */
function strut(from: Placement, to: Placement, thickness: number): BufferGeometry {
    strutFrom.set(...from);
    strutTo.set(...to);
    strutDirection.subVectors(strutTo, strutFrom);
    const length = strutDirection.length();
    const geometry = new BoxGeometry(thickness, length, thickness);
    geometry.applyQuaternion(strutQuaternion.setFromUnitVectors(UP, strutDirection.divideScalar(length)));
    geometry.translate(
        (strutFrom.x + strutTo.x) / 2,
        (strutFrom.y + strutTo.y) / 2,
        (strutFrom.z + strutTo.z) / 2
    );
    return geometry;
}

/** A pressurised module: a cylinder lying along one axis, with its end domes. */
function hull(radius: number, length: number, axis: 'x' | 'y' | 'z'): BufferGeometry {
    const geometry = new CylinderGeometry(radius, radius, length, 14, 1);
    if (axis === 'x') geometry.rotateZ(Math.PI / 2);
    if (axis === 'z') geometry.rotateX(Math.PI / 2);
    return geometry;
}

/** A micrometeoroid-shield rib around a module, which is most of its close-up detail. */
function rib(radius: number, axis: 'x' | 'y' | 'z'): BufferGeometry {
    const geometry = new TorusGeometry(radius + 0.03, 0.07, 5, 14);
    if (axis === 'x') geometry.rotateY(Math.PI / 2);
    if (axis === 'y') geometry.rotateX(Math.PI / 2);
    return geometry;
}

/**
 * Retile a flat panel's UVs so the generated cell map lands at the right pitch on it,
 * whatever size the panel is. Scaling the attribute rather than the texture is what
 * lets one map serve blankets of four different sizes.
 */
function scaleUv(geometry: BufferGeometry, u: number, v: number): BufferGeometry {
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v);
    }
    return geometry;
}

/** A blanket lying in the XZ plane: `width` across the truss, `length` fore-and-aft. */
function blanket(width: number, length: number, facing: 1 | -1): BufferGeometry {
    const geometry = new PlaneGeometry(width, length);
    // Rotated into the XZ plane rather than built there: `PlaneGeometry` is the only
    // primitive here that carries usable UVs, and they have to survive the move.
    geometry.rotateX(facing > 0 ? -Math.PI / 2 : Math.PI / 2);
    // ~0.5 m cells, against the real 8 cm. Anything finer aliases into noise at the
    // size a wing is ever drawn.
    return scaleUv(geometry, width / 2, length / 2);
}

// --- the station, in metres ------------------------------------------------

const TRUSS_HALF = ISS_TRUSS_LENGTH_M / 2;
/** The lattice's square section. The real segments run 4.6 m across; this is close. */
const TRUSS_SECTION = 3.4;
const TRUSS_EDGE = TRUSS_SECTION / 2;
/** One cube per bay, which is what puts the diagonals at 45°. */
const TRUSS_BAY = 3.39;
/** Module centreline. The S0 truss sits on top of Destiny, so the chain hangs below. */
const MODULE_Y = -4.3;
/** Where the four array pairs sit along the truss: P6/P4 to port, S4/S6 to starboard. */
const IEA_X = [27.2, 46.4] as const;
/** Solar Alpha Rotary Joints, the 3.2 m rings the outboard truss turns on. */
const SARJ_X = 22.3;

function buildTruss(parts: PartSet): void {
    // Four longerons running the whole length, at the corners of the section.
    for (const y of [-TRUSS_EDGE, TRUSS_EDGE]) {
        for (const z of [-TRUSS_EDGE, TRUSS_EDGE]) {
            parts.add('truss', bar(ISS_TRUSS_LENGTH_M, 0.22, 'x'), [0, y, z]);
        }
    }

    const bays = Math.round(ISS_TRUSS_LENGTH_M / TRUSS_BAY);
    for (let i = 0; i <= bays; i++) {
        const x = -TRUSS_HALF + i * TRUSS_BAY;

        // Transverse frame: the square that holds the four longerons apart.
        parts.add('truss', bar(TRUSS_SECTION, 0.16, 'z'), [x, TRUSS_EDGE, 0]);
        parts.add('truss', bar(TRUSS_SECTION, 0.16, 'z'), [x, -TRUSS_EDGE, 0]);
        parts.add('truss', bar(TRUSS_SECTION, 0.16, 'y'), [x, 0, TRUSS_EDGE]);
        parts.add('truss', bar(TRUSS_SECTION, 0.16, 'y'), [x, 0, -TRUSS_EDGE]);

        if (i === bays) continue;

        // One diagonal per face per bay, alternating sense along the run — a Warren
        // truss. Two per face would be stiffer and would also close the bays up into
        // something that reads as a solid beam from any distance.
        const next = x + TRUSS_BAY;
        const flip = i % 2 === 0 ? 1 : -1;
        parts.add('truss', strut([x, TRUSS_EDGE, -TRUSS_EDGE * flip], [next, TRUSS_EDGE, TRUSS_EDGE * flip], 0.13));
        parts.add('truss', strut([x, -TRUSS_EDGE, TRUSS_EDGE * flip], [next, -TRUSS_EDGE, -TRUSS_EDGE * flip], 0.13));
        parts.add('truss', strut([x, -TRUSS_EDGE * flip, TRUSS_EDGE], [next, TRUSS_EDGE * flip, TRUSS_EDGE], 0.13));
        parts.add('truss', strut([x, TRUSS_EDGE * flip, -TRUSS_EDGE], [next, -TRUSS_EDGE * flip, -TRUSS_EDGE], 0.13));
    }

    // The two Solar Alpha Rotary Joints. Everything outboard of these turns on them,
    // once per orbit — see `updateISS`, which is where that actually happens.
    parts.addPair('truss', () => {
        const ring = new TorusGeometry(TRUSS_EDGE + 0.25, 0.34, 6, 20);
        ring.rotateY(Math.PI / 2);
        return ring;
    }, [SARJ_X, 0, 0]);

    // Orbital replacement units — batteries, converters, nitrogen tanks — bolted along
    // the truss on both faces. Without them the lattice reads as decorative rather than
    // as the utility spine the whole station is plumbed through.
    for (const x of [7.8, 16.4, 25.6, 33.2, 41.5]) {
        parts.addPair('dark', () => new BoxGeometry(2.4, 1.1, 1.5), [x, TRUSS_EDGE + 0.55, 0.9]);
        parts.addPair('hull', () => new BoxGeometry(2.0, 1.0, 1.4), [x, -TRUSS_EDGE - 0.5, -0.9]);
    }

    // The Alpha Magnetic Spectrometer, riding the zenith face of S3 since 2011 and
    // still the largest single instrument up there.
    parts.add('hull', new BoxGeometry(4.4, 3.0, 3.6), [18.6, TRUSS_EDGE + 1.6, 0]);
    parts.add('dark', new BoxGeometry(3.2, 0.5, 2.6), [18.6, TRUSS_EDGE + 3.2, 0]);

    // S-band and Ku-band dishes on the nadir face.
    parts.addPair('hull', () => {
        const dish = new SphereGeometry(0.95, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        dish.rotateX(Math.PI);
        return dish;
    }, [31.5, -TRUSS_EDGE - 1.1, 1.4]);
    parts.addPair('truss', () => bar(1.2, 0.12, 'y'), [31.5, -TRUSS_EDGE - 0.5, 1.4]);
}

/**
 * The pressurised volume: a chain along the direction of travel with three side
 * branches. Positions are the berthing ones, so the modules meet at their hatches.
 */
function buildModules(parts: PartSet): void {
    const chain: Array<[MaterialKey, number, number, number]> = [
        // [material, z centre, length, radius]
        ['hull', 13.3, 7.2, 2.2],      // Node 2 Harmony — the forward hub
        ['hull', 5.4, 8.5, 2.12],      // Destiny, the US laboratory
        ['hull', -0.5, 5.5, 2.29],     // Node 1 Unity — the first US element up
        ['russian', -10.9, 12.6, 2.05], // Zarya, and the oldest thing on the station
        ['russian', -23.9, 13.1, 2.08], // Zvezda, the Russian service module
    ];

    for (const [material, z, length, radius] of chain) {
        parts.add(material, hull(radius, length, 'z'), [0, MODULE_Y, z]);
        for (const offset of [-length / 4, 0, length / 4]) {
            parts.add(material, rib(radius, 'z'), [0, MODULE_Y, z + offset]);
        }
    }

    // Pressurised mating adapters, in gold foil: PMA-1 between the US and Russian
    // segments, PMA-2 with the docking adapter the commercial crew vehicles use.
    parts.add('foil', hull(1.1, 1.4, 'z'), [0, MODULE_Y, -3.9]);
    parts.add('foil', hull(1.1, 1.6, 'z'), [0, MODULE_Y, 17.6]);
    parts.add('dark', hull(0.85, 0.5, 'z'), [0, MODULE_Y, 18.6]);

    // Columbus to starboard of Node 2, Kibō to port — the European and Japanese labs,
    // and the reason the forward end of the station is so much wider than the aft.
    parts.add('hull', hull(2.25, 6.9, 'x'), [5.4, MODULE_Y, 13.3]);
    parts.add('hull', rib(2.25, 'x'), [5.4, MODULE_Y, 13.3]);
    parts.add('hull', hull(2.2, 11.2, 'x'), [-8.0, MODULE_Y, 13.3]);
    for (const x of [-5.2, -8.0, -10.8]) {
        parts.add('hull', rib(2.2, 'x'), [x, MODULE_Y, 13.3]);
    }
    // Kibō's logistics module rides on its zenith, and the Exposed Facility — the one
    // open-air porch on the station — hangs off its port end.
    parts.add('hull', hull(2.1, 4.0, 'x'), [-7.0, MODULE_Y + 4.2, 13.3]);
    parts.add('dark', new BoxGeometry(5.6, 1.0, 4.4), [-16.4, MODULE_Y, 13.3]);
    parts.add('truss', new BoxGeometry(5.4, 0.5, 4.2), [-16.4, MODULE_Y + 0.7, 13.3]);

    // Node 3 Tranquility to port of Node 1, with Leonardo berthed forward of it and the
    // Cupola underneath — seven windows pointing straight down at the Earth, which is
    // where the crew spend most of their off-duty time and where the photographs come
    // from.
    parts.add('hull', hull(2.24, 6.7, 'x'), [-5.5, MODULE_Y, -0.5]);
    parts.add('hull', rib(2.24, 'x'), [-5.5, MODULE_Y, -0.5]);
    parts.add('hull', hull(2.2, 4.5, 'z'), [-5.5, MODULE_Y, 3.6]);
    parts.add('hull', hull(1.05, 1.5, 'y'), [-7.2, MODULE_Y - 2.6, -0.5]);
    parts.add('glass', hull(0.98, 0.55, 'y'), [-7.2, MODULE_Y - 3.4, -0.5]);
    parts.add('dark', hull(0.55, 0.2, 'y'), [-7.2, MODULE_Y - 3.7, -0.5]);

    // The Quest airlock, to starboard of Node 1 — every US spacewalk since 2001 has
    // started here — with its two high-pressure gas tanks strapped to the outside.
    parts.add('hull', hull(2.0, 5.5, 'x'), [4.9, MODULE_Y, -0.5]);
    for (const z of [-2.2, 1.2]) {
        parts.add('hull', hull(0.75, 1.4, 'x'), [6.4, MODULE_Y + 1.9, z]);
    }

    // Nauka under Zvezda, and the Prichal node on its far end.
    parts.add('russian', hull(2.1, 8.0, 'z'), [0, MODULE_Y - 4.3, -22.0]);
    parts.add('russian', new SphereGeometry(1.35, 12, 10), [0, MODULE_Y - 4.3, -26.6]);

    // A Soyuz docked aft, which is the only reason anyone up there can come home. Its
    // arrays are built into the structure rather than onto a pivot, because unlike
    // every other wing here they genuinely do not articulate — a Soyuz points its whole
    // self at the Sun instead, and rolls slowly to keep them lit.
    parts.add('russian', hull(1.35, 4.2, 'z'), [0, MODULE_Y, -32.8]);
    for (const side of [1, -1] as const) {
        parts.add('solar', blanket(7.6, 2.6, 1), [side * 5.2, MODULE_Y + 0.53, -33.2]);
        parts.add('kapton', blanket(7.6, 2.6, -1), [side * 5.2, MODULE_Y + 0.47, -33.2]);
        parts.add('truss', bar(7.6, 0.16, 'x'), [side * 5.2, MODULE_Y + 0.5, -33.2]);
    }
    parts.add('foil', hull(1.1, 2.6, 'z'), [0, MODULE_Y, -35.9]);
    parts.add('dark', hull(0.7, 0.9, 'z'), [0, MODULE_Y, -37.4]);
    parts.add('glass', hull(1.36, 0.9, 'z'), [0, MODULE_Y, -31.4]);

    // ...and a cargo vehicle on the forward port, because there almost always is one.
    parts.add('hull', hull(1.9, 5.0, 'z'), [0, MODULE_Y, 21.6]);
    parts.add('dark', hull(1.92, 0.6, 'z'), [0, MODULE_Y, 19.2]);
}

/**
 * Canadarm2 and its mobile base.
 *
 * Parked in the dog-leg it usually sits in between jobs. It rides a flatcar on rails
 * running the length of the truss's forward face, which is how a 17.6 m arm reaches a
 * 109 m station.
 */
function buildArm(parts: PartSet): void {
    const baseZ = TRUSS_EDGE + 0.8;
    parts.add('truss', new BoxGeometry(5.4, 0.9, 1.4), [2.0, 0, baseZ]);
    parts.add('hull', new BoxGeometry(3.0, 1.4, 1.2), [2.0, 1.2, baseZ]);

    const shoulder: Placement = [2.0, 2.0, baseZ];
    const elbow: Placement = [3.4, 8.6, baseZ + 3.6];
    const wrist: Placement = [3.4, 12.4, baseZ + 10.4];
    parts.add('hull', strut(shoulder, elbow, 0.62));
    parts.add('hull', strut(elbow, wrist, 0.62));
    for (const joint of [shoulder, elbow, wrist]) {
        parts.add('dark', new SphereGeometry(0.5, 10, 8), joint);
    }
    // The latching end effector: the business end, and a distinctly fatter cylinder
    // than the boom it is on.
    parts.add('truss', hull(0.55, 1.1, 'z'), [wrist[0], wrist[1] + 0.3, wrist[2] + 0.6]);
}

/**
 * The four Integrated Equipment Assemblies, with their photovoltaic radiators.
 *
 * Separate from the wings because they turn with only *one* of the two joints: the
 * whole outboard truss swings on the alpha rotary joint, but the beta gimbal past it
 * turns the wings alone. Building them into the wings would have a 4.6 m box pivoting
 * out of the truss it is bolted to. All four are merged into one buffer per material,
 * since none of them needs a node of its own.
 */
function buildEquipmentAssemblies(): Group {
    const group = new Group();
    const parts = new PartSet();

    for (const distance of IEA_X) {
        for (const side of [1, -1] as const) {
            const x = side * distance;
            parts.add('truss', new BoxGeometry(4.6, 3.4, 3.4), [x, 0, 0]);
            parts.add('truss', bar(5.4, 0.5, 'x'), [x, 0, 0]);
            // The photovoltaic radiator, sticking out perpendicular to the blankets —
            // where it sees deep space rather than the Sun, whatever the arrays are
            // doing. Seven panels hinged end to end along the direction it extends, so
            // the thin dimension is across the *face*: stack them the other way and a
            // radiator becomes a comb.
            for (let i = 0; i < 7; i++) {
                parts.add('radiator', new BoxGeometry(3.4, 1.7, 0.1), [x, 2.4 + i * 1.78, 0]);
            }
        }
    }

    parts.build(group);
    return group;
}

/**
 * One pair of solar array wings, without the assembly they are mounted on.
 *
 * Built once at the origin and cloned to all four stations, so the eight wings share a
 * single set of buffers. The group's own origin is the mast axis, which is what lets
 * the beta gimbal be a plain `rotation.z` on it.
 */
function buildWingPair(): Group {
    const group = new Group();
    const parts = new PartSet();

    for (const side of [1, -1] as const) {
        // The deployable mast: 33 m of hinged lattice, stowed in a canister a metre
        // deep. Two bars and a run of rungs is enough at the size it is drawn.
        parts.add('truss', bar(32.8, 0.36, 'z'), [0, 0, side * 19.4]);
        for (let i = 1; i <= 9; i++) {
            parts.add('truss', bar(0.9, 0.16, 'x'), [0, 0, side * (3.4 + i * 3.3)]);
        }

        // Two blankets per wing with the mast between them — 11.6 m across the pair.
        for (const x of [-3.05, 3.05]) {
            parts.add('solar', blanket(5.0, 32.0, 1), [x, 0.03, side * 19.4]);
            parts.add('kapton', blanket(5.0, 32.0, -1), [x, -0.03, side * 19.4]);
            // The blanket box each one folded out of, still there at the root.
            parts.add('truss', new BoxGeometry(5.0, 0.9, 1.5), [x, 0, side * 2.9]);
        }
        // Tip bar, which is what the blankets are tensioned against.
        parts.add('truss', bar(11.6, 0.3, 'x'), [0, 0, side * 35.5]);
    }

    parts.build(group);
    return group;
}

/**
 * The three heat-rejection radiators, on their own rotary joint.
 *
 * Two on S1 and one on P1, which is the real asymmetry and looks like a mistake until
 * you count them in a photograph. Each is 23 m of eight hinged panels.
 */
function buildRadiators(): Group {
    const group = new Group();
    const parts = new PartSet();

    for (const x of [11.4, 15.2, -12.4]) {
        parts.add('truss', bar(2.6, 0.5, 'y'), [x, TRUSS_EDGE + 1.0, 0]);
        // Eight panels end to end along the deployment direction, 0.1 m apart, making
        // one flat 23 m surface whose *face* is what radiates — not eight shelves.
        for (let panel = 0; panel < 8; panel++) {
            parts.add('radiator', new BoxGeometry(3.4, 2.75, 0.14), [x, TRUSS_EDGE + 3.4 + panel * 2.85, 0]);
        }
    }

    parts.build(group);
    return group;
}

/**
 * Zvezda's own two wings.
 *
 * The Russian segment carries its own power, on arrays that turn about a single axis —
 * their own long one — rather than the two the US wings have. They are also mounted
 * across the station rather than along it, so `blanket`'s width and length swap over.
 */
function buildRussianArrays(): Group {
    const group = new Group();
    const parts = new PartSet();

    for (const side of [1, -1] as const) {
        const x = side * 8.6;
        parts.add('solar', blanket(13.0, 3.4, 1), [x, 0.03, 0]);
        parts.add('kapton', blanket(13.0, 3.4, -1), [x, -0.03, 0]);
        parts.add('truss', bar(13.0, 0.2, 'x'), [x, 0, 0]);
    }

    parts.build(group);
    return group;
}

// --- assembly --------------------------------------------------------------

const structure = new PartSet();
buildTruss(structure);
buildModules(structure);
buildArm(structure);
structure.build(iss);

/**
 * Everything outboard of the two SARJs, which turns as one about the truss axis.
 *
 * All four assemblies share an angle because they are all solving the same problem —
 * point the blankets at the Sun — and the truss axis they turn on is common to them.
 * That is also what makes this one node instead of four.
 */
const arrayPivot = new Group();
arrayPivot.add(buildEquipmentAssemblies());
const wingPairTemplate = buildWingPair();
/** The four beta gimbals, each turning its own pair about its own mast. */
const betaGimbals: Group[] = [];
for (const distance of IEA_X) {
    for (const side of [1, -1] as const) {
        const gimbal = new Group();
        gimbal.position.x = side * distance;
        gimbal.add(betaGimbals.length === 0 ? wingPairTemplate : wingPairTemplate.clone());
        betaGimbals.push(gimbal);
        arrayPivot.add(gimbal);
    }
}
iss.add(arrayPivot);

const radiatorPivot = buildRadiators();
iss.add(radiatorPivot);

const russianArrayPivot = buildRussianArrays();
russianArrayPivot.position.set(0, MODULE_Y + 2.1, -22.0);
iss.add(russianArrayPivot);

// --- where it actually is --------------------------------------------------

const INCLINATION = MathUtils.degToRad(ISS_INCLINATION_DEG);
const Y_AXIS = new Vector3(0, 1, 0);

/**
 * Live telemetry, written here once a frame and read by the panel in `iss-hud`.
 *
 * The orbital constants are along for the ride rather than measured per frame, but they
 * are *derived* ones — see `planets.const.ts` — so the speed on the read-out and the
 * rate the station is actually flown round its orbit at come out of the same square
 * root and cannot drift apart.
 */
export const issTelemetry = {
    latitude: 0,
    longitude: 0,
    altitudeKm: ISS_ALTITUDE_KM,
    speedKmS: ISS_ORBITAL_SPEED_KM_S,
    periodMinutes: ISS_ORBITAL_PERIOD_S / 60,
    inclinationDeg: ISS_INCLINATION_DEG,
    /** True unless the station is inside Earth's shadow — see `updateISS`. */
    sunlit: true,
    /** How the position on screen was arrived at, which is not always a measurement. */
    source: 'waiting' as 'waiting' | 'live' | 'propagated' | 'offline',
};

/**
 * The orbit frame, in `earthTilt` coordinates, rewritten every frame.
 *
 * Exported because the trajectory lines are built from exactly this and nothing else —
 * see `iss-trajectory.ts`. Keeping one copy means the drawn orbit cannot disagree with
 * the station sitting on it.
 */
export const issOrbitFrame = {
    /** Unit vector from Earth's centre to the station. */
    position: new Vector3(1, 0, 0),
    /** Unit orbit normal. `normal × position` is the direction of travel. */
    normal: new Vector3(0, 0, 1),
    /** ...which is kept here rather than recomputed by every consumer. */
    velocity: new Vector3(0, 1, 0),
};

/**
 * The orbit plane through a point, given the inclination.
 *
 * A single position fix is one point on a circle and says nothing about which circle.
 * But the inclination is a constant of this orbit and the pole is +Y, which between
 * them cut the possibilities down to **two**: the normal has to lie on a cone of
 * half-angle `i` about the pole *and* be perpendicular to the position, and a cone and
 * a plane meet in two lines. Those two are the northbound and the southbound pass, and
 * the sign of the change in latitude between two consecutive fixes picks which — a
 * decision robust enough to survive any noise the feed could carry, because it is a
 * single bit taken from an 11 km displacement.
 *
 * Writing the normal as `cos(i)·ŷ + b·û + c·v̂` in the triad below and solving `n·p = 0`
 * gives `b = −cos(i)·tan(lat)` directly, and `|n| = 1` gives `c`. The cross product
 * `(n × p)·ŷ` works out to `−c·cos(lat)`, which is why the northbound branch is the
 * negative root and not the positive one.
 */
const frameU = new Vector3();
const frameV = new Vector3();

function orbitNormal(position: Vector3, northbound: boolean, target: Vector3): Vector3 {
    const sinLat = MathUtils.clamp(position.y, -1, 1);
    const cosLat = Math.sqrt(Math.max(1 - sinLat * sinLat, 1e-9));
    // The equatorial direction under the station, and a third axis completing a
    // right-handed (u, v, ŷ) triad.
    frameU.set(position.x, 0, position.z).divideScalar(cosLat);
    frameV.crossVectors(Y_AXIS, frameU);

    const cosI = Math.cos(INCLINATION);
    const b = (-cosI * sinLat) / cosLat;
    // Negative only if a fix arrives from further north than the orbit can reach, which
    // the real station never does — but a garbled reading should not produce a NaN.
    const c = Math.sqrt(Math.max(Math.sin(INCLINATION) ** 2 - b * b, 0));

    return target
        .set(0, 0, 0)
        .addScaledVector(Y_AXIS, cosI)
        .addScaledVector(frameU, b)
        .addScaledVector(frameV, northbound ? -c : c)
        .normalize();
}

/**
 * An anchor is a position, a plane and the moment both were true. Everything else about
 * where the station is comes out of propagating one of these forward.
 */
interface Anchor {
    /** Unit position in the `earthTilt` frame. */
    readonly position: Vector3;
    readonly normal: Vector3;
    /** `normal × position`, cached because every propagation step needs it. */
    readonly velocity: Vector3;
    /** Simulated milliseconds at which the position above was where the station was. */
    epochMs: number;
}

function createAnchor(): Anchor {
    return {
        position: new Vector3(1, 0, 0),
        normal: new Vector3(0, 0, 1),
        velocity: new Vector3(0, 1, 0),
        epochMs: 0,
    };
}

function setAnchor(anchor: Anchor, position: Vector3, northbound: boolean, epochMs: number): void {
    anchor.position.copy(position).normalize();
    orbitNormal(anchor.position, northbound, anchor.normal);
    anchor.velocity.crossVectors(anchor.normal, anchor.position).normalize();
    anchor.epochMs = epochMs;
}

/**
 * Where the station is at `simulatedMs`, as a pure function of the clock.
 *
 * The same rule the planets follow, for the same reason: nothing accumulates a
 * per-frame angle, so the station stays in step with the Earth's spin at any time
 * multiplier and is frame-rate independent. A circular orbit is enough — the real one
 * has an eccentricity of 0.0005, which is 3 km on a 6,779 km radius and a tenth of the
 * error the feed's own 1.5 s update interval carries.
 */
function propagate(anchor: Anchor, simulatedMs: number, target: Vector3): Vector3 {
    const angle = ((simulatedMs - anchor.epochMs) / 1000 / ISS_ORBITAL_PERIOD_S) * Math.PI * 2;
    return target
        .set(0, 0, 0)
        .addScaledVector(anchor.position, Math.cos(angle))
        .addScaledVector(anchor.velocity, Math.sin(angle));
}

/**
 * Two anchors, and a blend between them.
 *
 * A fix never lands exactly where the propagation had the station, so switching anchors
 * outright puts a visible jump in every 1.5 s. Both are carried and crossfaded over one
 * update interval instead, which is the same smoothing the previous version applied to
 * raw fixes — except that both ends of it are now moving along the orbit rather than
 * sitting still, so what gets faded out is only the correction.
 */
const currentAnchor = createAnchor();
const previousAnchor = createAnchor();
let blendStartRealMs = 0;
let hasFix = false;
let lastFixLatitude = Number.NaN;
let feedFailed = false;
let northbound = true;

// A plausible starting orbit so the station is never parked at a single point waiting
// for a network round trip — right inclination, right period, arbitrary node. The
// read-out says "no feed" for exactly as long as this is what you are looking at.
setAnchor(currentAnchor, latLonToDirection(0, 0), true, Date.now());
previousAnchor.position.copy(currentAnchor.position);
previousAnchor.normal.copy(currentAnchor.normal);
previousAnchor.velocity.copy(currentAnchor.velocity);
previousAnchor.epochMs = currentAnchor.epochMs;
// Somewhere real before the first frame runs, so anything that reads the position
// during scene setup — a fly-to aimed at it, say — gets an orbit rather than an origin.
iss.position.copy(currentAnchor.position).multiplyScalar(ISS_ORBITAL_RADIUS);

const ISS_FEED_URL = 'http://api.open-notify.org/iss-now.json';

/**
 * Take a live sub-satellite point and re-anchor the orbit on it.
 *
 * The fix is a latitude and longitude, which are Earth-fixed, so it has to be carried
 * into the inertial frame the station is drawn in — through the same helper the subsolar
 * point uses, so the station and the daylight terminator agree on where a place is.
 */
function applyFix(latitude: number, longitude: number): void {
    const nowMs = Date.now();
    const simulatedMs = getSimulatedDate().getTime();

    // Fixes are real-time readings, so they only mean anything while the simulated
    // clock is keeping real time. Once the user winds the multiplier up — or leaves it
    // paused — the scene's date has nothing to do with now, and pinning the station to
    // where it is *this second* would drag it backwards along its orbit every 1.5 s.
    // Past that point the model is the better answer, and the read-out says so.
    if (Math.abs(simulatedMs - nowMs) > 5000) {
        lastFixLatitude = latitude;
        hasFix = true;
        feedFailed = false;
        return;
    }

    // Which way it is crossing. A single bit, from a displacement of some 11 km.
    if (Number.isFinite(lastFixLatitude) && Math.abs(latitude - lastFixLatitude) > 1e-4) {
        northbound = latitude > lastFixLatitude;
    }
    lastFixLatitude = latitude;

    // Carry the current state into the previous slot before overwriting it, so the
    // crossfade has something to come from.
    propagate(currentAnchor, simulatedMs, previousAnchor.position);
    previousAnchor.normal.copy(currentAnchor.normal);
    previousAnchor.velocity.crossVectors(previousAnchor.normal, previousAnchor.position).normalize();
    previousAnchor.epochMs = simulatedMs;

    const fixDirection = latLonToDirection(latitude, longitude);
    toWorldFrame(fixDirection, earth.rotation.y);
    setAnchor(currentAnchor, fixDirection, northbound, simulatedMs);

    blendStartRealMs = nowMs;
    hasFix = true;
    feedFailed = false;
}

/** Poll the live position feed. Called on an interval from `script.ts`. */
async function updateISSPosition(): Promise<void> {
    try {
        const response = await fetch(ISS_FEED_URL);
        const data = await response.json();
        const latitude = Number.parseFloat(data?.iss_position?.latitude);
        const longitude = Number.parseFloat(data?.iss_position?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        applyFix(latitude, longitude);
    } catch {
        // Expected, and not an error worth a console entry every 1.5 s: the feed is
        // plain HTTP, so a browser on an HTTPS page blocks it outright as mixed
        // content. That is the normal case in production, which is precisely why the
        // station is propagated rather than merely interpolated between fixes.
        feedFailed = true;
    }
}

// --- per-frame -------------------------------------------------------------

const scratchCurrent = new Vector3();
const scratchPrevious = new Vector3();
const scratchLocal = new Vector3();
const scratchSunTilt = new Vector3();
const scratchSun = new Vector3();
const scratchRight = new Vector3();
const scratchZenith = new Vector3();
const scratchForward = new Vector3();
const scratchQuaternion = new Quaternion();
const attitudeBasis = new Matrix4();

/**
 * Place, aim and articulate the station.
 *
 * @param now                simulated date — the same clock every other body reads
 * @param earthRotationY     Earth's current spin, for turning the position back into
 *                           the latitude and longitude the read-out shows
 * @param sunDirectionWorld  unit vector from Earth towards the Sun, in world space
 */
export function updateISS(now: Date, earthRotationY: number, sunDirectionWorld: Vector3): void {
    const simulatedMs = now.getTime();
    const realMs = Date.now();

    propagate(currentAnchor, simulatedMs, scratchCurrent);
    const blend = MathUtils.clamp((realMs - blendStartRealMs) / ISS_UPDATE_INTERVAL, 0, 1);
    if (blend < 1) {
        propagate(previousAnchor, simulatedMs, scratchPrevious);
        scratchCurrent.lerp(scratchPrevious, 1 - blend).normalize();
    }

    issOrbitFrame.position.copy(scratchCurrent);
    issOrbitFrame.normal.copy(currentAnchor.normal);
    issOrbitFrame.velocity.crossVectors(issOrbitFrame.normal, issOrbitFrame.position).normalize();
    iss.position.copy(scratchCurrent).multiplyScalar(ISS_ORBITAL_RADIUS);

    // Attitude, built in the parent's frame from the orbit itself: zenith is straight
    // up from Earth's centre, forward is the direction of travel, and the third axis
    // follows. `makeBasis` takes them as columns in X, Y, Z order, so this is exactly
    // the frame the model was built in.
    scratchZenith.copy(issOrbitFrame.position);
    scratchForward.copy(issOrbitFrame.velocity);
    scratchRight.crossVectors(scratchZenith, scratchForward);
    attitudeBasis.makeBasis(scratchRight, scratchZenith, scratchForward);
    iss.quaternion.setFromRotationMatrix(attitudeBasis);

    // --- the two things that track the Sun ---
    //
    // The sun direction, carried into the station's own frame. Two rotations: out of
    // world space into the parent's (the axial tilt), then out of that into the
    // station's (the attitude just set). The intermediate step is kept, because the
    // eclipse test below needs the Sun in the *same* frame as the position — mixing the
    // world direction with a position inside `earthTilt` charges the geometry a 23.44°
    // error, which is most of a season.
    scratchSunTilt.copy(sunDirectionWorld);
    if (iss.parent) {
        scratchSunTilt.applyQuaternion(iss.parent.getWorldQuaternion(scratchQuaternion).invert());
    }
    scratchSun.copy(scratchSunTilt).applyQuaternion(scratchQuaternion.copy(iss.quaternion).invert());

    // Alpha: the whole outboard truss turns about its own long axis, once per orbit,
    // to bring the blanket normal — local +Y at rest — round to the Sun.
    const alpha = Math.atan2(scratchSun.z, scratchSun.y);
    arrayPivot.rotation.x = alpha;
    // Beta: each pair then turns about its own mast to take out whatever is left, which
    // is the component along the truss. Together the two put the blankets square on.
    const beta = Math.atan2(-scratchSun.x, Math.hypot(scratchSun.y, scratchSun.z));
    for (const gimbal of betaGimbals) gimbal.rotation.z = beta;
    russianArrayPivot.rotation.x = alpha;

    // The radiators want the opposite of what the arrays want: they reject heat from
    // their faces, so the Sun should graze them. Pointing their long axis the way the
    // blankets face achieves exactly that. Clamped to a quarter turn either side of
    // zenith because the real joint has stops in about that place, and because a 23 m
    // panel swung further would sweep straight through Kibō.
    radiatorPivot.rotation.x = MathUtils.clamp(alpha, -Math.PI / 2, Math.PI / 2);

    // --- telemetry ---
    // Latitude and longitude are read back out of the position rather than stored from
    // the fix, so they stay right while the station is being propagated — and stay in
    // step with the ground under it at every time multiplier.
    scratchLocal.copy(scratchCurrent);
    toWorldFrame(scratchLocal, -earthRotationY);
    issTelemetry.latitude = MathUtils.radToDeg(Math.asin(MathUtils.clamp(scratchLocal.y, -1, 1)));
    // Inverting `latLonToDirection`, negative z and all.
    issTelemetry.longitude = MathUtils.radToDeg(Math.atan2(-scratchLocal.z, scratchLocal.x));
    issTelemetry.altitudeKm = (ISS_ORBITAL_RADIUS - 1) * EARTH_RADIUS_KM;

    // Sunlit or not: Earth's shadow is a cylinder of one Earth radius pointing away
    // from the Sun, so being in it means being behind Earth *and* within a radius of
    // the axis. At 408 km the station spends roughly 36 minutes of every 93 in there,
    // which is why it sees sixteen sunrises a day.
    const alongSun = scratchCurrent.dot(scratchSunTilt) * ISS_ORBITAL_RADIUS;
    scratchPrevious
        .copy(scratchCurrent)
        .multiplyScalar(ISS_ORBITAL_RADIUS)
        .addScaledVector(scratchSunTilt, -alongSun);
    const shadowClearance = scratchPrevious.length();
    issTelemetry.sunlit = alongSun > 0 || shadowClearance > 1;
    // Smoothed over the last 130 km of the shadow's edge rather than switched, which is
    // about 17 s of flight — near enough the real penumbra crossing, and far better than
    // the whole station changing brightness between two frames.
    setEclipse(alongSun > 0 ? 1 : MathUtils.smoothstep(shadowClearance, 1, 1.02));

    issTelemetry.source = !hasFix
        ? feedFailed
            ? 'offline'
            : 'waiting'
        : // A fix that was received but not applied — because the clock had been wound
          // away from real time — leaves the station on the model, and says so.
          realMs - blendStartRealMs < ISS_UPDATE_INTERVAL * 4
          ? 'live'
          : 'propagated';
}

export { iss, updateISSPosition };
