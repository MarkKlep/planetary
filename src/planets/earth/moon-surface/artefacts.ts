import {
    BoxGeometry,
    BufferGeometry,
    CanvasTexture,
    ConeGeometry,
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
    SphereGeometry,
    TorusGeometry,
    Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LandingSite } from './sites';

/**
 * What was left behind.
 *
 * Six of the eleven landing sites have anything on them at all, and the rest are bare —
 * which is the point. Nothing here is scattered around every site as set dressing; it is
 * placed where it actually is, and Copernicus is empty because nobody has ever been to
 * Copernicus.
 *
 * ## The six are not six copies of each other
 *
 * This is the thing most worth getting right, because the temptation is to build one
 * Apollo site and stamp it out. The programme changed enormously across three and a half
 * years, and what is lying on the ground says so:
 *
 *  - **Apollo 11** left EASEP — a seismometer and a retroreflector on solar cells, dead
 *    within weeks. Armstrong and Aldrin were outside for 2 hours 31 minutes, never went
 *    more than about 60 m from the ladder, and planted the flag close in.
 *  - **Apollo 12 onward** left the full **ALSEP**, run by a plutonium generator that
 *    kept the instruments reporting until they were switched off in 1977. The RTG is the
 *    one object at these sites that was still doing something a decade after it was set
 *    down, and it looks like nothing else there: a finned cask, warm to this day.
 *  - **Apollo 14** brought the **MET**, a two-wheeled hand cart the crew pulled like a
 *    rickshaw. It is the only wheeled thing left at that site and the last mission that
 *    had to walk.
 *  - **Apollo 15, 16 and 17** brought the **LRV**, and the character of the whole thing
 *    changes: kilometres instead of hundreds of metres. Each rover was parked clear of
 *    the LM at the end, pointed back at it, so its TV camera could film the ascent stage
 *    leave — which is where that famous shot comes from.
 *
 * ## What is actually still there
 *
 * Only the **descent stage**. The ascent stage is what left — see `ascent-stage.ts`,
 * which puts it back on the deck for as long as it takes to watch it go again. What you
 * walk up to is a four-legged octagon with a hole in the top where the rest of the
 * spacecraft used to be, wrapped in the gold Kapton that kept it from cooking.
 *
 * The **flag at Tranquility Base is lying flat**, and that is not a mistake — nor is it
 * hard-coded. It fell because it was planted about 8 m from the engine that was about to
 * fire; the later crews planted theirs well clear, and theirs are still standing. So the
 * flag's distance from the LM is the *cause*, `blast()` knocks over whatever is inside
 * the radius, and Apollo 11's being the only one of the six to fall comes out of the
 * arithmetic rather than out of a flag.
 *
 * All of them, standing or not, have been bleached by fifty years of unfiltered
 * ultraviolet — there is no ozone up there and no night long enough to matter — so the
 * colours are rendered well faded.
 *
 * ## Cost
 *
 * Everything static merges to one buffer per material — three draw calls — and the whole
 * cluster sits in a `Group` whose bounds are tens of metres across, so it culls cleanly
 * whenever the observer looks the other way. At a site with no artefacts, none of this is
 * built at all.
 */

// --- materials -------------------------------------------------------------

/** Amber Kapton over the descent stage. The one unmistakable colour on the Moon. */
export const kaptonMaterial = new MeshStandardMaterial({
    color: 0xc98f2e,
    metalness: 0.82,
    roughness: 0.3,
});
/** Bare and painted structure: struts, footpads, ladder, instrument cases. */
export const structureMaterial = new MeshStandardMaterial({
    color: 0xa8aab0,
    metalness: 0.45,
    roughness: 0.5,
});
/** Black thermal blanket and the shaded panels between the Kapton. */
export const darkMaterial = new MeshStandardMaterial({
    color: 0x24242a,
    metalness: 0.3,
    roughness: 0.72,
});

const MATERIALS = {
    kapton: kaptonMaterial,
    structure: structureMaterial,
    dark: darkMaterial,
} as const;

export type MaterialKey = keyof typeof MATERIALS;

/**
 * A bag of geometry sorted by material, merged into one mesh each at the end.
 *
 * Shared with `ascent-stage.ts`, because most of a lunar module really is the same three
 * surfaces — gold blanket, bare structure, black shadow — and building the two halves out
 * of one vocabulary is what keeps the reassembled vehicle looking like one object.
 */
export class PartSet {
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

export const UP = new Vector3(0, 1, 0);

/** A tube between two points — most of a lunar module is these. */
export function strut(
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

// --- the descent stage -----------------------------------------------------

/** Across the flats of the octagon. The diagonal is 4.2 m. */
const DESCENT_WIDTH_M = 3.2;
const DESCENT_HEIGHT_M = 1.65;
/** Footpad to footpad, diagonally. The legs splay a long way out. */
const LEG_SPAN_M = 9.4;
const FOOTPAD_RADIUS_M = 0.47;
/** How high the body rides once the gear has taken the landing. */
const DECK_Y = 1.5;
/**
 * Top of the descent stage, which is the plane the ascent stage bolted to and therefore
 * where `ascent-stage.ts` has to put it back. Exported so the two halves cannot drift
 * apart: there is one number, and it is this one.
 */
export const DESCENT_DECK_Y = DECK_Y + DESCENT_HEIGHT_M;

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

    // The deck the ascent stage bolted to. It is open now — a flat top with a ring of
    // hardpoints and nothing above them.
    const deck = new CylinderGeometry(half * 0.92, half * 0.92, 0.1, 8);
    deck.rotateY(Math.PI / 8);
    parts.add('dark', deck, 0, DESCENT_DECK_Y, 0);
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
        parts.add(
            'structure',
            new BoxGeometry(0.18, 0.22, 0.18),
            Math.cos(angle) * half * 0.7,
            DESCENT_DECK_Y + 0.1,
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
function buildFlag(): Object3D {
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

    return assembly;
}

// --- science stations ------------------------------------------------------

/**
 * EASEP, which only Apollo 11 left: a seismometer and a laser retroreflector, both on
 * solar cells, both set down within a few dozen metres of the LM because there was no
 * time to walk further.
 *
 * The retroreflector is the one that still matters. It is a panel of corner cubes, and
 * corner cubes send light back exactly where it came from, so observatories on Earth
 * are still bouncing lasers off it half a century later and timing the return. It is
 * how we know the Moon is receding 3.8 cm a year — and it is the only Apollo experiment
 * still returning data, because it needs no power and has no moving parts. The
 * seismometer beside it ran for three weeks.
 */
function buildEasep(parts: PartSet, atX: number, atZ: number): void {
    // Seismometer: a low box under a reflective shroud, on a skirt to keep it level,
    // with the two solar panels that were all the power it ever had.
    parts.add('kapton', new BoxGeometry(0.55, 0.28, 0.5), atX, 0.22, atZ);
    parts.add('structure', new BoxGeometry(0.75, 0.02, 0.7), atX, 0.06, atZ);
    parts.add('structure', new CylinderGeometry(0.012, 0.012, 0.5, 5), atX + 0.2, 0.55, atZ);
    for (const side of [-1, 1]) {
        const panel = new BoxGeometry(0.62, 0.015, 0.42);
        panel.rotateZ(side * 0.18);
        parts.add('dark', panel, atX + side * 0.62, 0.34, atZ);
    }

    buildRetroreflector(parts, atX + 1.9, atZ + 0.4);
}

/** The corner-cube panel, tilted up at Earth. Aimed at the sky rather than laid flat. */
function buildRetroreflector(parts: PartSet, atX: number, atZ: number): void {
    const panel = new BoxGeometry(0.46, 0.05, 0.46);
    panel.rotateX(-0.9);
    parts.add('dark', panel, atX, 0.24, atZ);
    parts.add('structure', new BoxGeometry(0.5, 0.03, 0.5), atX, 0.1, atZ);
}

/**
 * ALSEP, on all five later missions, and a different order of thing from EASEP.
 *
 * The reason is the **RTG**: 2.6 kg of plutonium-238 in a finned beryllium cask, putting
 * out 70 W and — the part that mattered — not caring in the least about the fourteen-day
 * night that killed everything running on solar cells. The stations ran continuously
 * until NASA switched them off in September 1977, by which point Apollo 12's had been
 * reporting for nearly eight years.
 *
 * The cask ran at a few hundred degrees the whole time, which is why it is drawn with
 * its fins bare: it was the one object at these sites that had to *lose* heat.
 */
function buildAlsep(parts: PartSet, atX: number, atZ: number): void {
    // Central station: a flat box with the sunshade lid raised off it and the ribbon
    // cables running out to the instruments.
    parts.add('kapton', new BoxGeometry(0.9, 0.35, 0.55), atX, 0.28, atZ);
    parts.add('structure', new BoxGeometry(1.05, 0.02, 0.7), atX, 0.48, atZ);
    // The steerable helical antenna that pointed at Earth, on its short mast.
    parts.add('structure', new CylinderGeometry(0.014, 0.014, 0.75, 5), atX, 0.85, atZ);
    parts.add('structure', new CylinderGeometry(0.085, 0.085, 0.2, 8, 1, true), atX, 1.3, atZ);

    // The generator, set well away from the station so its heat and its neutrons were
    // somebody else's problem. Finned, because it had nothing but radiation to cool it.
    const caskX = atX - 1.7;
    const caskZ = atZ + 0.5;
    parts.add('structure', new CylinderGeometry(0.2, 0.2, 0.46, 12), caskX, 0.34, caskZ);
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const fin = new BoxGeometry(0.22, 0.42, 0.012);
        fin.rotateY(-angle);
        parts.add(
            'structure',
            fin,
            caskX + Math.cos(angle) * 0.28,
            0.34,
            caskZ + Math.sin(angle) * 0.28
        );
    }
    parts.add('dark', new BoxGeometry(0.5, 0.02, 0.5), caskX, 0.1, caskZ);

    // The passive seismometer, on its own skirt, and the retroreflector.
    parts.add('kapton', new BoxGeometry(0.5, 0.3, 0.5), atX + 2.1, 0.24, atZ - 1.1);
    parts.add('structure', new BoxGeometry(0.9, 0.02, 0.9), atX + 2.1, 0.06, atZ - 1.1);
    buildRetroreflector(parts, atX + 2.4, atZ + 1.3);

    // Geophones on a line, and the ribbon cable that fed them. The cables were flat and
    // stiff enough to hold the curl they were coiled in, which is exactly how they lie
    // in the photographs — nothing about lunar regolith flattens a cable out.
    for (let i = 0; i < 3; i++) {
        const gx = atX + 1.0 + i * 1.35;
        const gz = atZ + 2.4 + i * 0.5;
        parts.add('structure', new CylinderGeometry(0.05, 0.05, 0.16, 8), gx, 0.09, gz);
        parts.add('dark', new BoxGeometry(1.3, 0.008, 0.03), gx - 0.65, 0.02, gz - 0.25);
    }
}

/**
 * The Modular Equipment Transporter, which only Apollo 14 had: a two-wheeled cart the
 * crew pulled by a handle, carrying tools, film and core tubes.
 *
 * It is the pivot of the whole programme. Shepard and Mitchell dragged it up the flank of
 * Cone Ridge, could not tell where the rim was, and turned back about 30 m short of it —
 * on television, out of breath, hauling a handcart. Every mission after theirs had a car.
 */
function buildMet(parts: PartSet, atX: number, atZ: number, heading: number): void {
    const cart = new PartSet();
    const trackHalf = 0.43;

    // The A-frame chassis and the tray it carried.
    cart.add('structure', strut(-0.5, 0.72, 0, 0.55, 0.5, 0, 0.022));
    cart.add('structure', strut(-0.5, 0.72, 0, 0.55, 0.5, -trackHalf * 0.8, 0.018));
    cart.add('structure', strut(-0.5, 0.72, 0, 0.55, 0.5, trackHalf * 0.8, 0.018));
    cart.add('structure', new BoxGeometry(0.62, 0.03, 0.72), 0.34, 0.52, 0);
    cart.add('kapton', new BoxGeometry(0.44, 0.24, 0.5), 0.34, 0.65, 0);
    // The handle, which is what makes it read as a cart rather than a trailer.
    const grip = new CylinderGeometry(0.02, 0.02, 0.34, 6);
    grip.rotateX(Math.PI / 2);
    cart.add('structure', grip, -0.54, 0.75, 0);

    // Two wire-mesh wheels on a common axle, and the tyres really were that fat — they
    // were inflated, the only pneumatic tyres ever used off Earth.
    for (const side of [-1, 1]) {
        const wheel = new TorusGeometry(0.2, 0.075, 6, 14);
        wheel.rotateY(Math.PI / 2);
        cart.add('dark', wheel, 0.42, 0.2, side * trackHalf);
        const hub = new CylinderGeometry(0.05, 0.05, 0.06, 8);
        hub.rotateZ(Math.PI / 2);
        cart.add('structure', hub, 0.42, 0.2, side * trackHalf);
    }

    const assembly = new Group();
    cart.build(assembly);
    assembly.position.set(atX, 0, atZ);
    assembly.rotation.y = heading;
    // Merged into the cluster's own buffers by the caller adding the group; the cart is
    // its own small set because it has to be rotated as a unit.
    parts.add('structure', new BufferGeometry() as never, 0, 0, 0);
    (parts as unknown as { pending?: Object3D[] }).pending ??= [];
    (parts as unknown as { pending: Object3D[] }).pending.push(assembly);
}

/**
 * *Fallen Astronaut*, at Hadley: an 8.5 cm aluminium figure laid face down in the dust
 * beside a plaque naming the fourteen astronauts and cosmonauts dead by August 1971 —
 * Americans and Soviets on one list, in the middle of the space race.
 *
 * Scott set it down without clearing it with anyone and mentioned it at the post-flight
 * press conference. It is the only sculpture on another world, and at this scale it is
 * three centimetres of geometry that most people will walk straight past, which is about
 * right.
 */
function buildMemorial(parts: PartSet, atX: number, atZ: number): void {
    parts.add('structure', new BoxGeometry(0.09, 0.012, 0.032), atX, 0.012, atZ);
    parts.add('structure', new BoxGeometry(0.13, 0.004, 0.09), atX + 0.13, 0.006, atZ + 0.01);
}

/**
 * Apollo 16's far-ultraviolet camera and spectrograph: a 22 kg gold-plated Schmidt
 * telescope on a tripod, stood in the LM's shadow because it could not be allowed to
 * warm up.
 *
 * The only astronomical telescope ever *operated* from the surface of another world. It
 * photographed the Earth's geocorona in Lyman-alpha, which cannot be done from inside the
 * geocorona, and it is still standing there pointed at where the sky was in April 1972.
 */
function buildTelescope(parts: PartSet, atX: number, atZ: number): void {
    const barrel = new CylinderGeometry(0.15, 0.15, 0.62, 12);
    barrel.rotateZ(0.55);
    parts.add('kapton', barrel, atX, 0.62, atZ);
    parts.add('dark', new CylinderGeometry(0.155, 0.155, 0.06, 12), atX + 0.16, 0.78, atZ);
    for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        parts.add(
            'structure',
            strut(atX, 0.42, atZ, atX + Math.cos(angle) * 0.34, 0, atZ + Math.sin(angle) * 0.34, 0.014)
        );
    }
}

// --- assembly --------------------------------------------------------------

export interface Artefacts {
    readonly object: Object3D;
    /** Where the lander stands, for aiming the first look at it. */
    readonly landerPosition: Vector3;
    /**
     * World position of the descent stage's top deck — where the ascent stage was
     * bolted, and so where it has to be put back before it can leave again.
     */
    readonly ascentOrigin: Vector3;
    /**
     * The ascent engine firing. Knocks over any flag close enough to the blast, which is
     * how Apollo 11's went and why none of the others did.
     */
    blast(): void;
    /** Stand the flag back up, for a re-run. */
    restore(): void;
    update(realDeltaSeconds: number): void;
    dispose(): void;
}

/** Where the cluster sits relative to the landing point, metres. */
const LANDER_X = 11;
const LANDER_Z = -23;

/**
 * How far out the flag was planted, and the one number that decides whether it survives.
 *
 * Apollo 11's went in close to the LM — the first crew had two and a half hours outside
 * and no reason to walk the flag anywhere — and it was inside the ascent engine's blast.
 * Every later crew planted theirs well clear, having watched what happened to the first
 * one. Nothing here says "Apollo 11's flag falls"; it says how far each flag is from the
 * engine, and `FLAG_BLAST_RADIUS_M` does the rest.
 */
const FLAG_CLOSE_M = 7;
const FLAG_CLEAR_M = 21;
/** How far the exhaust could still push over a pole standing in loose regolith. */
const FLAG_BLAST_RADIUS_M = 11;
/** Seconds for a pole in one sixth of Earth's gravity to go over. */
const FLAG_FALL_SECONDS = 1.6;

export function createArtefacts(
    site: LandingSite,
    heightAt: (x: number, z: number) => number
): Artefacts | null {
    if (!site.artefacts) return null;
    const record = site.artefacts;

    const object = new Group();
    const parts = new PartSet();

    buildDescentStage(parts);

    // What the mission actually left, rather than a generic scatter.
    if (record.science === 'easep') buildEasep(parts, -7.5, 4);
    else buildAlsep(parts, -9, 5.5);
    if (record.memorial) buildMemorial(parts, 2.6, 4.4);
    if (record.telescope) buildTelescope(parts, -2.4, 3.6);

    const merged = parts.build(object);

    // Carts and flags are built as their own groups because they are placed and rotated
    // as units — and the flag, uniquely, has to be able to move after the fact.
    const carts = (parts as unknown as { pending?: Object3D[] }).pending;
    if (carts) for (const cart of carts) object.add(cart);

    const flagDistance = record.flagStanding ? FLAG_CLEAR_M : FLAG_CLOSE_M;
    const flagBearing = 0.55;
    const flagX = Math.cos(flagBearing) * flagDistance;
    const flagZ = Math.sin(flagBearing) * flagDistance;
    const flag = buildFlag();
    flag.position.set(flagX, 0, flagZ);
    object.add(flag);

    if (record.transport === 'met') {
        const cart = new Group();
        const cartParts = new PartSet();
        buildMet(cartParts, 0, 0, 0);
        const pendingCarts = (cartParts as unknown as { pending?: Object3D[] }).pending;
        if (pendingCarts) for (const built of pendingCarts) cart.add(built);
        cart.position.set(-3.4, 0, 5.2);
        cart.rotation.y = 2.1;
        object.add(cart);
    }

    object.position.set(LANDER_X, heightAt(LANDER_X, LANDER_Z), LANDER_Z);

    /**
     * How far over the flag is, 0 standing and 1 flat. Held rather than baked into the
     * transform so a re-run can put it back up — and so the fall can be *watched*, which
     * is the entire reason Apollo 11's flag is interesting.
     */
    const fallen = record.flagStanding ? 0 : 1;
    let fall = fallen;
    let falling = false;

    function applyFall(): void {
        // Over on its side about the base, still attached to its pole, exactly the way
        // Aldrin described it going.
        flag.rotation.z = -(Math.PI / 2 - 0.06) * fall;
        flag.rotation.y = 0.7 * fall;
        flag.position.y = 0.04 * fall;
    }
    applyFall();

    return {
        object,
        landerPosition: new Vector3(LANDER_X, 0, LANDER_Z),
        ascentOrigin: new Vector3(
            LANDER_X,
            heightAt(LANDER_X, LANDER_Z) + DESCENT_DECK_Y,
            LANDER_Z
        ),

        blast() {
            // Inside the radius or not. Apollo 11's flag is 7 m out and goes; the others
            // are 21 m out and stand there watching, which is what they did.
            if (Math.hypot(flagX, flagZ) <= FLAG_BLAST_RADIUS_M) falling = true;
        },

        restore() {
            falling = false;
            fall = 0;
            applyFall();
        },

        update(realDeltaSeconds) {
            if (!falling || fall >= 1) return;
            fall = Math.min(1, fall + realDeltaSeconds / FLAG_FALL_SECONDS);
            applyFall();
        },

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

export { ConeGeometry, SphereGeometry };
