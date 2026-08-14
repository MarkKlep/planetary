import {
    BoxGeometry,
    BufferGeometry,
    CanvasTexture,
    CylinderGeometry,
    DoubleSide,
    Group,
    Mesh,
    MeshStandardMaterial,
    NearestFilter,
    Object3D,
    PlaneGeometry,
    Quaternion,
    SRGBColorSpace,
    Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LandingSite } from './sites';

/**
 * What was left behind.
 *
 * Two of the six landing sites have anything on them at all, and the other four are
 * bare — which is the point. Nothing here is scattered around every site as set
 * dressing; it is placed where it actually is, and Copernicus is empty because nobody
 * has ever been to Copernicus.
 *
 * ## What is actually still there
 *
 * Only the **descent stage**. The ascent stage is what left, and on Apollo 11 it was
 * later dropped back onto the surface somewhere unknown — so what you walk up to is a
 * four-legged octagon with a hole in the top where the rest of the spacecraft used to
 * be, wrapped in the gold Kapton that kept it from cooking.
 *
 * The **flag at Tranquility Base is lying flat**, and that is not a mistake. The
 * ascent engine knocked it over on liftoff; Aldrin watched it go through the window.
 * It is the only one of the six that fell. All of them, standing or not, have been
 * bleached by fifty years of unfiltered ultraviolet — there is no ozone up there and
 * no night long enough to matter — so the colours are rendered well faded.
 *
 * ## Cost
 *
 * Everything merges to one buffer per material — three draw calls — and the whole
 * cluster sits in a `Group` whose bounds are tens of metres across, so it culls
 * cleanly whenever the observer looks the other way. At a site with no artefacts,
 * none of this is built at all.
 */

// --- materials -------------------------------------------------------------

/** Amber Kapton over the descent stage. The one unmistakable colour on the Moon. */
const kaptonMaterial = new MeshStandardMaterial({
    color: 0xc98f2e,
    metalness: 0.82,
    roughness: 0.3,
});
/** Bare and painted structure: struts, footpads, ladder, instrument cases. */
const structureMaterial = new MeshStandardMaterial({
    color: 0xa8aab0,
    metalness: 0.45,
    roughness: 0.5,
});
/** Black thermal blanket and the shaded panels between the Kapton. */
const darkMaterial = new MeshStandardMaterial({
    color: 0x24242a,
    metalness: 0.3,
    roughness: 0.72,
});

const MATERIALS = {
    kapton: kaptonMaterial,
    structure: structureMaterial,
    dark: darkMaterial,
} as const;

type MaterialKey = keyof typeof MATERIALS;

class PartSet {
    private readonly groups = new Map<MaterialKey, BufferGeometry[]>();

    add(key: MaterialKey, geometry: BufferGeometry, x = 0, y = 0, z = 0): void {
        geometry.translate(x, y, z);
        const existing = this.groups.get(key);
        if (existing) existing.push(geometry);
        else this.groups.set(key, [geometry]);
    }

    build(target: Object3D): BufferGeometry[] {
        const built: BufferGeometry[] = [];
        for (const [key, geometries] of this.groups) {
            const merged = mergeGeometries(geometries, false);
            if (!merged) continue;
            const mesh = new Mesh(merged, MATERIALS[key]);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            target.add(mesh);
            built.push(merged);
        }
        return built;
    }
}

// --- the descent stage -----------------------------------------------------

/** Across the flats of the octagon. The diagonal is 4.2 m. */
const DESCENT_WIDTH_M = 3.2;
const DESCENT_HEIGHT_M = 1.65;
/** Footpad to footpad, diagonally. The legs splay a long way out. */
const LEG_SPAN_M = 9.4;
const FOOTPAD_RADIUS_M = 0.47;
/** How high the body rides once the gear has taken the landing. */
const DECK_Y = 1.5;

function buildDescentStage(parts: PartSet): void {
    const half = DESCENT_WIDTH_M / 2;

    // The octagonal body. Eight sides, wrapped in Kapton, with a darker band where the
    // propellant tanks sit behind the blankets.
    const body = new CylinderGeometry(half, half, DESCENT_HEIGHT_M, 8);
    body.rotateY(Math.PI / 8);
    parts.add('kapton', body, 0, DECK_Y + DESCENT_HEIGHT_M / 2, 0);

    const band = new CylinderGeometry(half + 0.02, half + 0.02, 0.3, 8);
    band.rotateY(Math.PI / 8);
    parts.add('dark', band, 0, DECK_Y + 0.3, 0);

    // The deck the ascent stage used to bolt to. It is open now — a flat top with a
    // ring of hardpoints and nothing above them.
    const deck = new CylinderGeometry(half * 0.92, half * 0.92, 0.1, 8);
    deck.rotateY(Math.PI / 8);
    parts.add('dark', deck, 0, DECK_Y + DESCENT_HEIGHT_M, 0);
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
        parts.add(
            'structure',
            new BoxGeometry(0.18, 0.22, 0.18),
            Math.cos(angle) * half * 0.7,
            DECK_Y + DESCENT_HEIGHT_M + 0.1,
            Math.sin(angle) * half * 0.7
        );
    }

    // The descent engine bell, pointing down into the blast crater it dug.
    const bell = new CylinderGeometry(0.28, 0.75, 1.15, 12, 1, true);
    parts.add('dark', bell, 0, DECK_Y - 0.5, 0);

    // Four legs, on the diagonals. Each is a main strut down to the footpad plus a
    // pair of secondary struts bracing it back to the body.
    const reach = LEG_SPAN_M / 2;
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const dirX = Math.cos(angle);
        const dirZ = Math.sin(angle);
        const padX = dirX * reach;
        const padZ = dirZ * reach;
        const hipX = dirX * half * 0.9;
        const hipZ = dirZ * half * 0.9;

        parts.add('structure', strut(hipX, DECK_Y + 0.2, hipZ, padX, FOOTPAD_RADIUS_M * 0.5, padZ, 0.075));
        // Bracing, from the outer half of the main strut back up to the deck.
        const midX = (hipX + padX) / 2;
        const midZ = (hipZ + padZ) / 2;
        parts.add('structure', strut(midX, (DECK_Y + 0.2) / 2 + 0.3, midZ, hipX, DECK_Y + DESCENT_HEIGHT_M * 0.9, hipZ, 0.045));

        // The footpad, and the contact probe that hung a metre and a half below three
        // of the four. When one touched, a light came on in the cabin and the crew
        // shut the engine down — which is why the last thing said before the landing
        // was "contact light".
        const pad = new CylinderGeometry(FOOTPAD_RADIUS_M, FOOTPAD_RADIUS_M * 0.85, 0.16, 14);
        parts.add('structure', pad, padX, 0.08, padZ);
        if (i !== 0) {
            parts.add('structure', new CylinderGeometry(0.015, 0.015, 1.6, 5), padX, -0.7, padZ);
        }
    }

    // The ladder, on the forward leg, and the plaque on the strut behind it: "Here men
    // from the planet Earth first set foot upon the Moon. July 1969 A.D. We came in
    // peace for all mankind."
    const ladderX = Math.cos(Math.PI / 4) * half * 0.95;
    const ladderZ = Math.sin(Math.PI / 4) * half * 0.95;
    for (let i = 0; i < 9; i++) {
        parts.add(
            'structure',
            new BoxGeometry(0.42, 0.03, 0.03),
            ladderX,
            0.35 + i * 0.17,
            ladderZ
        );
    }
    parts.add('structure', new BoxGeometry(0.3, 0.22, 0.02), ladderX * 1.14, DECK_Y - 0.15, ladderZ * 1.14);
}

/** A tube between two points — most of a lunar module is these. */
function strut(
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    radius: number
): BufferGeometry {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const geometry = new CylinderGeometry(radius, radius, length, 6);
    // A cylinder is built along +Y; rotate that onto the strut's own direction.
    const orientation = new Quaternion().setFromUnitVectors(
        UP,
        new Vector3(dx, dy, dz).divideScalar(length)
    );
    geometry.applyQuaternion(orientation);
    geometry.translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    return geometry;
}

const UP = new Vector3(0, 1, 0);

// --- the flag --------------------------------------------------------------

const FLAG_WIDTH_M = 1.52;
const FLAG_HEIGHT_M = 0.91;
const FLAG_POLE_M = 2.4;

/**
 * The flag, drawn onto a canvas rather than loaded — and drawn *faded*.
 *
 * Fifty-odd years of unfiltered ultraviolet, with no ozone to stop any of it and no
 * night long enough to matter, have bleached all six of them. The nylon is intact; the
 * dye is not. What is up there now is very nearly a white flag, and rendering it in
 * fresh red and blue would be the one dishonest thing in this whole scene.
 */
const FLAG_FADE = 0.55;

function buildFlagTexture(): CanvasTexture {
    const width = 190;
    const height = 100;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;

    const faded = (r: number, g: number, b: number) => {
        const mix = (channel: number) => Math.round(channel + (255 - channel) * FLAG_FADE);
        return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
    };

    // Thirteen stripes, seven of them red.
    const stripe = height / 13;
    context.fillStyle = faded(255, 255, 255);
    context.fillRect(0, 0, width, height);
    context.fillStyle = faded(178, 34, 52);
    for (let i = 0; i < 13; i += 2) {
        context.fillRect(0, i * stripe, width, stripe);
    }

    // The union: two fifths of the fly, seven stripes deep.
    const unionWidth = width * 0.4;
    const unionHeight = stripe * 7;
    context.fillStyle = faded(60, 59, 110);
    context.fillRect(0, 0, unionWidth, unionHeight);

    // Fifty stars, in the nine alternating rows they actually go in.
    context.fillStyle = faded(255, 255, 255);
    for (let row = 0; row < 9; row++) {
        const count = row % 2 === 0 ? 6 : 5;
        for (let column = 0; column < count; column++) {
            const x = ((column + (row % 2 === 0 ? 0.5 : 1)) / 6) * unionWidth;
            const y = ((row + 0.5) / 9) * unionHeight;
            context.beginPath();
            context.arc(x, y, 1.6, 0, Math.PI * 2);
            context.fill();
        }
    }

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    // Crisp stripes rather than a smear; it is 190 px standing in for a metre and a half.
    texture.magFilter = NearestFilter;
    return texture;
}

let flagTexture: CanvasTexture | null = null;

/**
 * The assembly: a telescoping pole with a horizontal crossbar along the top, because
 * there is no air to hold a flag out. On Apollo 11 the crossbar would not extend the
 * last few inches, which left a permanent ripple in the nylon — and is the entire
 * reason the flag in the photographs looks like it is flying.
 */
function buildFlag(standing: boolean): Object3D {
    flagTexture ??= buildFlagTexture();

    const assembly = new Group();
    const parts = new PartSet();

    parts.add('structure', new CylinderGeometry(0.016, 0.016, FLAG_POLE_M, 6), 0, FLAG_POLE_M / 2, 0);
    const crossbar = new CylinderGeometry(0.011, 0.011, FLAG_WIDTH_M, 5);
    crossbar.rotateZ(Math.PI / 2);
    parts.add('structure', crossbar, FLAG_WIDTH_M / 2, FLAG_POLE_M, 0);
    parts.build(assembly);

    const cloth = new Mesh(
        // Segmented across the fly so the crossbar's ripple has somewhere to live.
        new PlaneGeometry(FLAG_WIDTH_M, FLAG_HEIGHT_M, 12, 1),
        new MeshStandardMaterial({
            map: flagTexture,
            side: DoubleSide,
            roughness: 0.95,
            metalness: 0,
        })
    );
    const position = cloth.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
        const across = (position.getX(i) / FLAG_WIDTH_M + 0.5);
        // The crimp left by a crossbar that never fully extended.
        position.setZ(i, Math.sin(across * Math.PI * 2.4) * 0.045 * across);
    }
    position.needsUpdate = true;
    cloth.geometry.computeVertexNormals();
    cloth.position.set(FLAG_WIDTH_M / 2, FLAG_POLE_M - FLAG_HEIGHT_M / 2 - 0.02, 0);
    cloth.castShadow = true;
    assembly.add(cloth);

    if (!standing) {
        // Knocked flat by the ascent engine. Laid over on its side, still attached to
        // its pole, exactly where it went down.
        assembly.rotation.z = -Math.PI / 2 + 0.06;
        assembly.rotation.y = 0.7;
        assembly.position.y = 0.04;
    }

    return assembly;
}

// --- science station -------------------------------------------------------

/**
 * The experiments package. Apollo 11 left EASEP — a seismometer and a laser
 * retroreflector — and the later missions left the full ALSEP with a nuclear generator
 * to run it.
 *
 * The retroreflector is the one that still matters. It is a panel of corner cubes, and
 * corner cubes send light back exactly where it came from, so observatories on Earth
 * are still bouncing lasers off it half a century later and timing the return. It is
 * how we know the Moon is receding 3.8 cm a year — and it is the only Apollo experiment
 * still returning data, because it needs no power and has no moving parts.
 */
function buildScienceStation(parts: PartSet, atX: number, atZ: number): void {
    // Seismometer: a low box under a reflective shroud, on a skirt to keep it level.
    parts.add('kapton', new BoxGeometry(0.55, 0.28, 0.5), atX, 0.22, atZ);
    parts.add('structure', new BoxGeometry(0.75, 0.02, 0.7), atX, 0.06, atZ);
    parts.add('structure', new CylinderGeometry(0.012, 0.012, 0.5, 5), atX + 0.2, 0.55, atZ);

    // The retroreflector, tilted up so its corner cubes face Earth. It is aimed at the
    // sky rather than laid flat for exactly that reason.
    const panel = new BoxGeometry(0.46, 0.05, 0.46);
    panel.rotateX(-0.9);
    parts.add('dark', panel, atX + 1.6, 0.24, atZ + 0.3);
    parts.add('structure', new BoxGeometry(0.5, 0.03, 0.5), atX + 1.6, 0.1, atZ + 0.3);
}

// --- assembly --------------------------------------------------------------

export interface Artefacts {
    readonly object: Object3D;
    /** Where the lander stands, for aiming the first look at it. */
    readonly landerPosition: Vector3;
    dispose(): void;
}

/** Where the cluster sits relative to the landing point, metres. */
const LANDER_X = 11;
const LANDER_Z = -23;

export function createArtefacts(
    site: LandingSite,
    heightAt: (x: number, z: number) => number
): Artefacts | null {
    if (!site.artefacts) return null;

    const object = new Group();
    const parts = new PartSet();

    buildDescentStage(parts);
    buildScienceStation(parts, -7.5, 4);
    const merged = parts.build(object);

    const flagAssembly = buildFlag(site.artefacts.flagStanding);
    flagAssembly.position.set(5.5, 0, 3.2);
    object.add(flagAssembly);

    object.position.set(LANDER_X, heightAt(LANDER_X, LANDER_Z), LANDER_Z);

    return {
        object,
        landerPosition: new Vector3(LANDER_X, 0, LANDER_Z),
        dispose() {
            for (const geometry of merged) geometry.dispose();
            // The main-body geometries are covered by `merged` above; this also
            // catches the flag's own merged pole/crossbar and its cloth. Materials are
            // only disposed when they are not one of the three shared, long-lived
            // ones — the cloth's own material (and the site-specific quad it wraps
            // around the cached, cross-site `flagTexture`) is the one thing per landing
            // that actually needs it.
            object.traverse((child) => {
                if (!(child instanceof Mesh)) return;
                child.geometry.dispose();
                if (
                    child.material !== kaptonMaterial &&
                    child.material !== structureMaterial &&
                    child.material !== darkMaterial
                ) {
                    (child.material as MeshStandardMaterial).dispose();
                }
            });
        },
    };
}
