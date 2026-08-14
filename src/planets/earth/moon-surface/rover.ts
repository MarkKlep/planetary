import {
    BoxGeometry,
    BufferGeometry,
    Color,
    CylinderGeometry,
    DoubleSide,
    Float32BufferAttribute,
    Group,
    Mesh,
    MeshStandardMaterial,
    Object3D,
    SphereGeometry,
    TorusGeometry,
    Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
    LRV_BUMP_STOP_RADIUS_M,
    LRV_GROUND_CLEARANCE_M,
    LRV_HEIGHT_M,
    LRV_TRACK_M,
    LRV_WHEELBASE_M,
    LRV_WHEEL_RADIUS_M,
    LRV_WHEEL_WIDTH_M,
} from '../../../constants/planets.const';

/**
 * The Lunar Roving Vehicle, built from primitives the way `iss.ts` builds the station.
 *
 * There is no model to load and no texture to wrap, so the recognisability has to come
 * out of the proportions and the parts list — and both are the real ones. It is 3.05 m
 * long, 1.83 m across and 1.14 m tall, which makes it nearly as wide as it is long and
 * barely taller than its own wheels. It looks wrong in a way you cannot name until you
 * notice the chassis clears the ground by 36 cm on wheels 81 cm across.
 *
 * ## What actually makes it read as an LRV
 *
 * Four things, and they are each worth the geometry they cost:
 *
 *  - **The wheels are see-through.** Woven from 0.84 mm zinc-coated steel strand, with
 *    the 65 cm titanium bump-stop frame visible straight through the mesh. Nothing
 *    else has ever looked like this, and a solid tyre throws the silhouette away.
 *  - **Titanium chevrons over half the contact area.** Half, deliberately — the mesh
 *    between them had to keep flexing down into the regolith rather than riding along
 *    on top of it.
 *  - **The open tubular frame.** 2219 aluminium tube in three hinged sections, so the
 *    whole vehicle folded flat against the side of the lunar module. You can see the
 *    ground through most of it, and the suspension is all out in the open.
 *  - **The high-gain dish on its mast**, which is the one part nobody mistakes.
 *
 * ## Local frame
 *
 * Origin on the ground, between the wheels. +X right, +Y up, **-Z forward**, matching
 * the scene's own convention. Everything below is placed in metres from there.
 *
 * ## Draw calls
 *
 * One merged buffer per material for everything that does not move, plus four wheels
 * (they steer and they spin) and the dish (it tracks Earth). The wheel's own two
 * finishes — dark mesh, bright titanium — are folded into vertex colours rather than
 * geometry groups, which halves its draw calls for the cost of one attribute.
 */

// --- materials -------------------------------------------------------------

/** Bare 2219 aluminium tube and panel: most of the vehicle. */
const frameMaterial = new MeshStandardMaterial({
    color: 0xb6b9be,
    // Anodised aluminium, not chrome. With one hard light and no sky to fill in, a
    // near-mirror finish turns the whole deck into a blown-out white slab.
    metalness: 0.34,
    roughness: 0.56,
});
/**
 * The fenders were moulded fibreglass, lighter than the frame around them — and thin
 * enough that they have to be drawn from both faces, or they disappear the moment you
 * look up at one from beside the wheel.
 */
const fenderMaterial = new MeshStandardMaterial({
    color: 0xdedeb8,
    metalness: 0.04,
    roughness: 0.66,
    side: DoubleSide,
});
/**
 * The deck panels, which are *not* the same finish as the tube frame around them and
 * should not be lit like it. Left matching, a metre and a half of upward-facing panel
 * under a hard overhead sun becomes the brightest thing in the scene and the vehicle
 * reads as a white table.
 */
const deckMaterial = new MeshStandardMaterial({
    color: 0x8f9095,
    metalness: 0.2,
    roughness: 0.78,
});
/**
 * Mylar over the battery radiators and the comms relay. The batteries were passively
 * cooled by wax phase-change packages venting through upward-facing radiators, with
 * the blankets over them while driving — which is also why the crews hand-dusted the
 * radiators at every stop: dust on a radiator stops it radiating.
 */
const foilMaterial = new MeshStandardMaterial({
    color: 0xd7a244,
    metalness: 0.88,
    roughness: 0.22,
});
/** Nylon webbing over aluminium tube. Muted tan, not orange. */
const webbingMaterial = new MeshStandardMaterial({
    color: 0x93714b,
    metalness: 0.04,
    roughness: 0.92,
});
/** Woven steel strand and titanium chevrons, told apart by vertex colour. */
const wheelMaterial = new MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.68,
    roughness: 0.46,
});

const MATERIALS = {
    frame: frameMaterial,
    deck: deckMaterial,
    fender: fenderMaterial,
    foil: foilMaterial,
    webbing: webbingMaterial,
} as const;

type MaterialKey = keyof typeof MATERIALS;
type Placement = readonly [number, number, number];

/** Collects geometry per material so it can all be merged into one buffer each. */
class PartSet {
    private readonly groups = new Map<MaterialKey, BufferGeometry[]>();

    add(key: MaterialKey, geometry: BufferGeometry, [x, y, z]: Placement): void {
        geometry.translate(x, y, z);
        const existing = this.groups.get(key);
        if (existing) existing.push(geometry);
        else this.groups.set(key, [geometry]);
    }

    /** Mirrored about the centreline — almost everything on this vehicle is. */
    addPair(key: MaterialKey, build: () => BufferGeometry, [x, y, z]: Placement): void {
        this.add(key, build(), [x, y, z]);
        this.add(key, build(), [-x, y, z]);
    }

    /** And at all four corners, for anything that belongs to a wheel. */
    addQuad(key: MaterialKey, build: () => BufferGeometry, [x, y, z]: Placement): void {
        this.addPair(key, build, [x, y, z]);
        this.addPair(key, build, [x, y, -z]);
    }

    build(target: Object3D): void {
        for (const [key, geometries] of this.groups) {
            const merged = mergeGeometries(geometries, false);
            if (!merged) continue;
            const mesh = new Mesh(merged, MATERIALS[key]);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            target.add(mesh);
        }
    }
}

const HALF_TRACK = LRV_TRACK_M / 2;
const HALF_BASE = LRV_WHEELBASE_M / 2;
const FLOOR_Y = LRV_GROUND_CLEARANCE_M;
/** Chassis width. Narrower than the track — the wheels stand well clear of it. */
const FLOOR_WIDTH = 1.32;
/** Deck length. The wheels are what carry the vehicle out to 3.05 m over all. */
const FLOOR_LENGTH = 2.16;
/** Seat pan height, which with a 0.42 m back reaches the quoted 1.14 m at the top. */
const SEAT_Y = 0.7;

/** A length of aluminium tube along one axis. */
function tube(radius: number, length: number, axis: 'x' | 'y' | 'z'): BufferGeometry {
    const geometry = new CylinderGeometry(radius, radius, length, 7);
    if (axis === 'x') geometry.rotateZ(Math.PI / 2);
    if (axis === 'z') geometry.rotateX(Math.PI / 2);
    return geometry;
}

// --- the chassis -----------------------------------------------------------

function buildChassis(): { group: Object3D; aim: Object3D } {
    const group = new Group();
    const parts = new PartSet();

    // --- floor and frame ---
    // Three sections, hinged across the vehicle so the whole thing folded up and hung
    // flat against the side of the lunar module. The ribs are where it broke.
    // Three deck panels rather than one, with the hinge ribs between them — which is
    // both what the vehicle actually was and what stops the deck reading as a single
    // unbroken slab.
    for (const [z, length] of [[-0.75, 0.62], [0, 0.82], [0.75, 0.62]] as const) {
        parts.add('deck', new BoxGeometry(FLOOR_WIDTH - 0.06, 0.03, length), [0, FLOOR_Y, z]);
    }
    for (const z of [-0.44, 0.44]) {
        parts.add('frame', new BoxGeometry(FLOOR_WIDTH, 0.055, 0.05), [0, FLOOR_Y + 0.015, z]);
    }
    parts.addPair('frame', () => new BoxGeometry(0.05, 0.12, FLOOR_LENGTH), [FLOOR_WIDTH / 2, FLOOR_Y + 0.06, 0]);
    parts.addPair('frame', () => new BoxGeometry(FLOOR_WIDTH + 0.05, 0.07, 0.09), [0, FLOOR_Y, HALF_BASE]);

    // --- suspension ---
    // Double horizontal wishbone, upper and lower, with a torsion bar at the chassis
    // end of each arm and a damper between the chassis and the upper one. All of it is
    // out in the open on the real vehicle, and leaving it off is what makes a model of
    // this thing look like a table on wheels.
    const reach = HALF_TRACK - FLOOR_WIDTH / 2 - 0.02;
    const armCentre = FLOOR_WIDTH / 2 + reach / 2;
    for (const zSide of [-1, 1] as const) {
        const z = zSide * HALF_BASE;
        parts.addPair('frame', () => new BoxGeometry(reach, 0.035, 0.05), [armCentre, FLOOR_Y + 0.14, z]);
        parts.addPair('frame', () => new BoxGeometry(reach, 0.035, 0.05), [armCentre, FLOOR_Y - 0.06, z]);
        // Torsion-bar housings, lying along the vehicle at the chassis end.
        parts.addPair('frame', () => tube(0.035, 0.24, 'z'), [FLOOR_WIDTH / 2 + 0.03, FLOOR_Y + 0.04, z]);
        // Damper, leaning out and up to the upper arm.
        parts.addPair('frame', () => {
            const damper = tube(0.022, 0.3, 'y');
            damper.rotateZ(0.8);
            return damper;
        }, [FLOOR_WIDTH / 2 + 0.17, FLOOR_Y + 0.2, z]);
        // Upright at the wheel end, carrying the hub and the drive motor.
        parts.addPair('frame', () => tube(0.032, 0.26, 'y'), [HALF_TRACK - 0.04, FLOOR_Y + 0.04, z]);
    }

    // --- seats ---
    // Tubular aluminium strung with nylon webbing, folded flat for the trip out. The
    // crews sat shoulder to shoulder, and in a pressurised suit could not bend at the
    // hip — they leaned back against the webbing rather than sitting down into it.
    for (const side of [-1, 1] as const) {
        const x = side * 0.36;

        parts.add('webbing', new BoxGeometry(0.5, 0.035, 0.44), [x, SEAT_Y, 0.26]);
        parts.add('webbing', (() => {
            const back = new BoxGeometry(0.5, 0.42, 0.03);
            back.rotateX(0.26); // raked 15°
            return back;
        })(), [x, SEAT_Y + 0.22, 0.52]);

        // The tube frame the webbing is strung on, and the legs down to the deck.
        parts.add('frame', new BoxGeometry(0.54, 0.03, 0.03), [x, SEAT_Y - 0.02, 0.05]);
        parts.add('frame', new BoxGeometry(0.54, 0.03, 0.03), [x, SEAT_Y - 0.02, 0.47]);
        parts.add('frame', tube(0.016, 0.46, 'z'), [x + side * 0.25, SEAT_Y - 0.02, 0.26]);
        parts.add('frame', (() => {
            const post = tube(0.016, 0.44, 'y');
            post.rotateX(0.26);
            return post;
        })(), [x + side * 0.25, SEAT_Y + 0.21, 0.52]);
        parts.add('frame', tube(0.018, SEAT_Y - FLOOR_Y - 0.02, 'y'), [x + side * 0.2, (SEAT_Y + FLOOR_Y) / 2, 0.14]);
    }
    // Armrest between the seats, and the rail across the top of both backs.
    parts.add('frame', new BoxGeometry(0.09, 0.05, 0.4), [0, SEAT_Y + 0.14, 0.26]);
    parts.add('frame', new BoxGeometry(1.26, 0.032, 0.032), [0, LRV_HEIGHT_M, 0.6]);

    // --- footrests ---
    // Adjustable, and set well forward: with the seat pan this high there is nowhere
    // else for a suited leg to go.
    parts.addPair('frame', () => {
        const rest = new BoxGeometry(0.26, 0.025, 0.22);
        rest.rotateX(-0.3);
        return rest;
    }, [0.34, FLOOR_Y + 0.08, -0.78]);

    // --- console and hand controller ---
    // No steering wheel. A single T-handle between the seats: forward to accelerate,
    // back to brake, tilt to steer, and pull it all the way back for the parking
    // brake. The console beside it read out speed, heading, pitch, power and
    // temperature — and the heading came from a gyro, since there is no magnetic field
    // up there to hang a compass on.
    parts.add('frame', (() => {
        const panel = new BoxGeometry(0.34, 0.26, 0.06);
        panel.rotateX(-0.4);
        return panel;
    })(), [0, FLOOR_Y + 0.46, -0.82]);
    parts.add('frame', tube(0.022, 0.4, 'y'), [0, FLOOR_Y + 0.3, -0.38]);
    parts.add('frame', tube(0.02, 0.2, 'x'), [0, FLOOR_Y + 0.5, -0.38]);

    // --- forward deck: batteries and the comms relay ---
    parts.add('frame', new BoxGeometry(1.3, 0.16, 0.56), [0, FLOOR_Y + 0.09, -0.99]);
    // Two 36-volt silver-zinc batteries, 121 A·h each, under reflective blankets.
    parts.addPair('foil', () => new BoxGeometry(0.58, 0.09, 0.46), [0.33, FLOOR_Y + 0.21, -0.99]);
    // The Lunar Communications Relay Unit, which is what made live television possible
    // at all: it went straight to Earth rather than through the lunar module.
    parts.add('foil', new BoxGeometry(0.44, 0.3, 0.3), [0, FLOOR_Y + 0.36, -1.16]);

    // --- antennas ---
    // The mast is genuinely this tall. The dish had to clear the crew's heads, and
    // shortening it puts a metre of parabola straight in the driver's eyeline.
    parts.add('frame', tube(0.026, 1.9, 'y'), [0, FLOOR_Y + 1.25, -1.3]);
    // Low-gain whip, for voice while the dish was stowed or off-target.
    parts.add('frame', tube(0.011, 0.86, 'y'), [0.5, FLOOR_Y + 0.75, -1.12]);

    // --- television camera ---
    // Panned, tilted and zoomed from Houston by a man working three seconds behind
    // what he was looking at — which is how the ascent-stage launches got filmed, and
    // why he had to lead them.
    parts.add('frame', tube(0.024, 0.6, 'y'), [-0.54, FLOOR_Y + 0.5, -1.22]);
    parts.add('frame', new BoxGeometry(0.17, 0.16, 0.22), [-0.54, FLOOR_Y + 0.84, -1.22]);
    parts.add('frame', tube(0.05, 0.1, 'z'), [-0.54, FLOOR_Y + 0.86, -1.35]);

    // --- rear pallet ---
    // Hand tools, sample bags, and the aft pallet the geology came home on.
    parts.add('frame', new BoxGeometry(1.16, 0.44, 0.04), [0, FLOOR_Y + 0.24, 1.14]);
    parts.addPair('frame', () => tube(0.02, 0.44, 'y'), [0.56, FLOOR_Y + 0.24, 1.12]);
    parts.add('foil', new BoxGeometry(0.86, 0.26, 0.26), [0, FLOOR_Y + 0.2, 0.98]);

    // --- fenders ---
    // Moulded fibreglass, and famously fragile. Young caught one with a hammer on
    // Apollo 16; on 17 the crew lost one outright and rebuilt it from four laminated
    // lunar maps and two clamps off the optical alignment telescope. Without it the
    // wheel throws regolith over the radiators behind it, and a dusted radiator stops
    // radiating — a mission problem, not a cosmetic one.
    const FENDER_ARC = Math.PI * 0.62;
    parts.addQuad('fender', () => {
        const fender = new CylinderGeometry(
            LRV_WHEEL_RADIUS_M + 0.075,
            LRV_WHEEL_RADIUS_M + 0.075,
            LRV_WHEEL_WIDTH_M + 0.09,
            14,
            1,
            true,
            -FENDER_ARC / 2,
            FENDER_ARC
        );
        // A cylinder's arc opens along +X with its axis up Y; the wheel wants the axis
        // across the vehicle and the arc over the top, which is one rotation each.
        fender.rotateZ(-Math.PI / 2);
        fender.rotateX(Math.PI / 2);
        return fender;
    }, [HALF_TRACK, LRV_WHEEL_RADIUS_M, HALF_BASE]);

    parts.build(group);

    // The dish is the one piece that cannot be merged: a spherical cap only reads as a
    // *dish* when you can see its concave face, which needs both sides drawn — and it
    // hangs off a pivot because the crews re-aimed it at Earth by hand at every stop.
    const dish = new Mesh(
        new SphereGeometry(0.45, 26, 10, 0, Math.PI * 2, 0, Math.PI * 0.36),
        new MeshStandardMaterial({
            color: 0xd4d6da,
            metalness: 0.45,
            roughness: 0.5,
            side: DoubleSide,
        })
    );
    dish.castShadow = true;

    const aim = new Group();
    aim.position.set(0, FLOOR_Y + 2.18, -1.3);
    aim.add(dish);
    group.add(aim);

    return { group, aim };
}

// --- the wheel -------------------------------------------------------------

/** Woven steel strand: dark, and mostly holes. */
const MESH_COLOUR = new Color(0.055, 0.058, 0.066);
/** Titanium chevrons and the bump-stop frame. */
const TITANIUM_COLOUR = new Color(0.29, 0.28, 0.26);
/** Spun aluminium hub. */
const HUB_COLOUR = new Color(0.42, 0.43, 0.45);

function tinted(geometry: BufferGeometry, colour: Color): BufferGeometry {
    const count = geometry.attributes.position.count;
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        colours[i * 3] = colour.r;
        colours[i * 3 + 1] = colour.g;
        colours[i * 3 + 2] = colour.b;
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
    return geometry;
}

/**
 * One wheel: hoops, sidewall wires, hub, bump-stop frame and chevron treads, merged
 * into a single buffer. Instantiated four times, each copy steering and spinning on
 * its own — which is the only reason these are not merged in with the chassis.
 */
function buildWheelGeometry(): BufferGeometry {
    const pieces: BufferGeometry[] = [];
    const R = LRV_WHEEL_RADIUS_M;
    const halfWidth = LRV_WHEEL_WIDTH_M / 2;

    // The tyre, as hoops rather than a solid cylinder. This is the whole point of an
    // LRV wheel: it is woven wire, you can see through it, and the bump-stop frame
    // below shows straight past it.
    const HOOPS = 8;
    for (let i = 0; i < HOOPS; i++) {
        const hoop = new TorusGeometry(R, 0.0065, 4, 28);
        hoop.rotateY(Math.PI / 2);
        hoop.translate(-halfWidth + (i / (HOOPS - 1)) * LRV_WHEEL_WIDTH_M, 0, 0);
        pieces.push(tinted(hoop, MESH_COLOUR));
    }

    // The 65 cm titanium bump stop inside the mesh, which the tyre lands on when the
    // wire deflects flat under load.
    const bumpStop = new TorusGeometry(LRV_BUMP_STOP_RADIUS_M, 0.012, 4, 20);
    bumpStop.rotateY(Math.PI / 2);
    pieces.push(tinted(bumpStop, TITANIUM_COLOUR));

    const hub = new CylinderGeometry(0.1, 0.1, LRV_WHEEL_WIDTH_M + 0.04, 12);
    hub.rotateZ(Math.PI / 2);
    pieces.push(tinted(hub, HUB_COLOUR));

    // Sidewall wires, hub out to rim, on both faces.
    const WIRES = 18;
    for (const x of [-halfWidth, halfWidth]) {
        for (let i = 0; i < WIRES; i++) {
            const wire = new BoxGeometry(0.009, R - 0.08, 0.009);
            wire.translate(0, (R + 0.1) / 2 - 0.01, 0);
            wire.rotateX((i / WIRES) * Math.PI * 2);
            wire.translate(x, 0, 0);
            pieces.push(tinted(wire, MESH_COLOUR));
        }
    }

    // Chevron treads: titanium, V-shaped, covering half the contact area — half,
    // deliberately, so the mesh between them could still flex down into the regolith
    // instead of riding along on top of it.
    // Circumference is 2.55 m; 16 chevrons of 0.08 m cover very nearly the quoted
    // half of the contact area, which is the figure that matters — full coverage would
    // have had the wheel riding on titanium instead of letting the mesh sink in.
    const CHEVRONS = 16;
    for (let i = 0; i < CHEVRONS; i++) {
        for (const half of [-1, 1] as const) {
            const strip = new BoxGeometry(halfWidth + 0.012, 0.022, 0.08);
            strip.rotateY(half * 0.38); // angled into a V along the direction of travel
            strip.translate(half * (halfWidth / 2), R + 0.006, 0);
            strip.rotateX((i / CHEVRONS) * Math.PI * 2);
            pieces.push(tinted(strip, TITANIUM_COLOUR));
        }
    }

    return mergeGeometries(pieces, false) ?? tinted(new BoxGeometry(0.1, 0.1, 0.1), MESH_COLOUR);
}

// --- assembly --------------------------------------------------------------

/** The direction the spherical cap's concave face looks along, before any aiming. */
const DISH_FACE = new Vector3(0, -1, 0);
/** Where it rests when Earth is not up: tilted back off the driver's sightline. */
const STOWED = new Vector3(0, 0.71, -0.71);

export interface Rover {
    readonly object: Object3D;
    /** Front-left, front-right, rear-left, rear-right, in the rover's local frame. */
    readonly wheels: Object3D[];
    /** Turn the steered wheels. Front and rear go opposite ways, as they really did. */
    setSteering(radians: number): void;
    /** Advance the wheel rotation for a distance travelled, in metres. */
    roll(distance: number): void;
    /**
     * Point the high-gain antenna, given the direction to Earth *in the rover's own
     * frame*. Pass null on the far side, where there is nothing to aim at and the real
     * answer would have been to leave it stowed.
     */
    aimDish(directionInRoverFrame: Vector3 | null): void;
    dispose(): void;
}

export function createRover(): Rover {
    const object = new Group();
    const { group: chassis, aim } = buildChassis();
    object.add(chassis);

    const wheelGeometry = buildWheelGeometry();
    const wheels: Object3D[] = [];
    const spinners: Object3D[] = [];

    // Front pair first, then rear — `setSteering` relies on that order.
    for (const z of [-HALF_BASE, HALF_BASE]) {
        for (const x of [-HALF_TRACK, HALF_TRACK]) {
            // Two nested nodes: the outer one steers, the inner one spins. Collapsing
            // them into one would make the spin axis turn with the steering, which is
            // right, and make the steer axis tumble with the spin, which is not.
            const steer = new Group();
            steer.position.set(x, LRV_WHEEL_RADIUS_M, z);

            const spin = new Mesh(wheelGeometry, wheelMaterial);
            spin.castShadow = true;
            spin.receiveShadow = true;
            steer.add(spin);

            object.add(steer);
            wheels.push(steer);
            spinners.push(spin);
        }
    }

    return {
        object,
        wheels,
        setSteering(radians) {
            // Both axles steer, in opposite senses: that is what halves the effective
            // wheelbase and turns a vehicle 3.05 m long inside a 3 m circle. Ackermann
            // on the real thing, so the inside wheel turns further than the outside.
            wheels[0].rotation.y = radians;
            wheels[1].rotation.y = radians;
            wheels[2].rotation.y = -radians;
            wheels[3].rotation.y = -radians;
        },
        roll(distance) {
            // Rolling without slipping. On the real one the wheels slipped constantly
            // in the regolith, which is why the navigation system had to correct its
            // dead reckoning against a sun shot at every stop.
            const angle = distance / LRV_WHEEL_RADIUS_M;
            for (const spinner of spinners) spinner.rotation.x -= angle;
        },
        aimDish(direction) {
            // The cap's open face looks along its own -Y, so aiming it is exactly the
            // rotation carrying -Y onto the direction wanted.
            aim.quaternion.setFromUnitVectors(DISH_FACE, direction ?? STOWED);
        },
        dispose() {
            wheelGeometry.dispose();
            chassis.traverse((child) => {
                if (child instanceof Mesh) child.geometry.dispose();
            });
        },
    };
}
