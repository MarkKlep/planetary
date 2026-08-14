import {
    BoxGeometry,
    BufferGeometry,
    CylinderGeometry,
    DoubleSide,
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
    LRV_TRACK_M,
    LRV_WHEELBASE_M,
    LRV_WHEEL_RADIUS_M,
} from '../../../constants/planets.const';

/**
 * The Lunar Roving Vehicle, built from primitives the way `iss.ts` builds the station.
 *
 * There is no model to load and no texture to wrap, so the recognisability has to come
 * out of the proportions — and those are the real ones. It is a 3.1 m vehicle with a
 * 3.1 m turning circle, almost as wide as it is long, and it looks wrong in a way you
 * cannot name until you notice the wheels are nearly a metre across on a chassis that
 * barely clears them.
 *
 * ## Local frame
 *
 * Origin on the ground, between the wheels. +X right, +Y up, **-Z forward**, matching
 * the scene's own convention (the camera looks down its -Z, and the surface scene
 * points that north). Everything below is placed in metres from there.
 *
 * ## Draw calls
 *
 * The whole vehicle is four wheels plus one merged mesh per material. The wheels have
 * to stay separate — they steer and they spin — but nothing else on it moves, so the
 * chassis, seats, fenders, console and antenna collapse into four buffers. Eight draw
 * calls for the hero object of the mode, against five for everything else in it.
 */

// Bare aluminium tubing and panels: most of what you see.
const frameMaterial = new MeshStandardMaterial({
    color: 0xb9bcc2,
    metalness: 0.55,
    roughness: 0.42,
});
// Kapton thermal blanket over the battery covers and the underside of the fenders.
// The one genuinely bright thing on the vehicle, and it reads gold in every photograph.
const foilMaterial = new MeshStandardMaterial({
    color: 0xd9a441,
    metalness: 0.85,
    roughness: 0.28,
});
// Woven wire mesh, deep in shadow between the treads.
const wheelMaterial = new MeshStandardMaterial({
    color: 0x54565c,
    metalness: 0.7,
    roughness: 0.55,
});
// Nylon webbing seats and the chevron treads, both the same orange-brown.
const trimMaterial = new MeshStandardMaterial({
    color: 0x8a5a34,
    metalness: 0.05,
    roughness: 0.9,
});

const MATERIALS = {
    frame: frameMaterial,
    foil: foilMaterial,
    trim: trimMaterial,
} as const;

type MaterialKey = keyof typeof MATERIALS;

/** Collects geometry per material so it can all be merged into one buffer each. */
class PartSet {
    private readonly groups = new Map<MaterialKey, BufferGeometry[]>();

    add(
        key: MaterialKey,
        geometry: BufferGeometry,
        [x, y, z]: [number, number, number],
        rotation?: [number, number, number]
    ): void {
        if (rotation) {
            geometry.rotateX(rotation[0]);
            geometry.rotateY(rotation[1]);
            geometry.rotateZ(rotation[2]);
        }
        geometry.translate(x, y, z);
        const existing = this.groups.get(key);
        if (existing) existing.push(geometry);
        else this.groups.set(key, [geometry]);
    }

    /** Mirrored about the centreline — most of this vehicle is symmetric. */
    addPair(
        key: MaterialKey,
        build: () => BufferGeometry,
        [x, y, z]: [number, number, number],
        rotation?: [number, number, number]
    ): void {
        this.add(key, build(), [x, y, z], rotation);
        this.add(key, build(), [-x, y, z], rotation);
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

/** The direction the spherical cap's concave face looks along, before any aiming. */
const DISH_FACE = new Vector3(0, -1, 0);
/** Where it rests when Earth is not up: tilted back off the driver's sightline. */
const STOWED = new Vector3(0, 0.71, -0.71);
/** Floor height. The LRV's chassis clears the ground by only about 36 cm. */
const FLOOR_Y = 0.36;

function buildChassis(): { group: Object3D; aim: Object3D } {
    const group = new Group();
    const parts = new PartSet();

    // --- floor and frame ---
    // Three folding sections in reality, hinged so the whole thing packed flat against
    // the side of the lunar module. One panel here; the seam is not the point.
    parts.add('frame', new BoxGeometry(1.36, 0.05, 2.3), [0, FLOOR_Y, 0]);
    // Side rails, running the length of it.
    parts.addPair('frame', () => new BoxGeometry(0.06, 0.16, 2.3), [0.71, FLOOR_Y + 0.06, 0]);
    // Cross members over each axle.
    parts.add('frame', new BoxGeometry(1.68, 0.09, 0.12), [0, FLOOR_Y, -HALF_BASE]);
    parts.add('frame', new BoxGeometry(1.68, 0.09, 0.12), [0, FLOOR_Y, HALF_BASE]);

    // --- seats ---
    // Two, side by side, close enough that the crews' shoulders touched. Aluminium
    // tube frames strung with nylon webbing, which folded flat for the trip out.
    for (const side of [-1, 1] as const) {
        const x = side * 0.38;
        // The pan sits high — 0.76 m off the ground. A pressurised suit does not bend
        // at the hip, so the crews did not so much sit down as lean back against a
        // shelf, and the seat had to meet them where they already were.
        parts.add('trim', new BoxGeometry(0.52, 0.07, 0.46), [x, FLOOR_Y + 0.4, 0.3]);
        // Backrest, raked back 15°, and tall enough to take a backpack.
        parts.add('trim', new BoxGeometry(0.52, 0.58, 0.06), [x, FLOOR_Y + 0.72, 0.58], [0.26, 0, 0]);
        // Tubular frame under the pan.
        parts.add('frame', new BoxGeometry(0.56, 0.04, 0.04), [x, FLOOR_Y + 0.36, 0.08]);
        parts.add('frame', new BoxGeometry(0.56, 0.04, 0.04), [x, FLOOR_Y + 0.36, 0.5]);
    }
    // Headrest bar spanning both seats, clear above the backrests.
    parts.add('frame', new BoxGeometry(1.4, 0.045, 0.045), [0, FLOOR_Y + 1.12, 0.72]);

    // --- console and hand controller ---
    // The LRV had no steering wheel. It was driven with a single T-shaped hand
    // controller between the seats: forward to accelerate, back to brake, tilt to
    // steer, and pull the whole thing back to set the parking brake.
    parts.add('frame', new BoxGeometry(0.38, 0.28, 0.1), [0, FLOOR_Y + 0.44, -0.86], [-0.35, 0, 0]);
    parts.add('frame', new CylinderGeometry(0.026, 0.026, 0.42, 8), [0, FLOOR_Y + 0.34, -0.34]);
    parts.add('frame', new BoxGeometry(0.22, 0.045, 0.045), [0, FLOOR_Y + 0.55, -0.34]);

    // --- forward deck ---
    parts.add('foil', new BoxGeometry(1.42, 0.26, 0.62), [0, FLOOR_Y + 0.14, -1.02]);
    // Battery covers, under reflective blankets — they had to dump heat, and on the
    // later missions the crews had to brush the dust off them by hand between traverses
    // because a dusted radiator stops radiating.
    parts.add('foil', new BoxGeometry(1.3, 0.1, 0.4), [0, FLOOR_Y + 0.29, -1.0]);

    // --- high-gain antenna ---
    // The 0.9 m parabolic mesh dish, re-aimed at Earth by hand at every single stop.
    // It is the one part of the silhouette nobody mistakes for anything else, and the
    // reason the drives went out live.
    // The mast is taller than it looks like it needs to be, and that is the real
    // proportion rather than a concession: the dish had to clear the crew's sightline,
    // because a metre of parabola a metre and a half in front of your visor is most of
    // the windscreen. Shortening it here would put it straight back in the way.
    parts.add('frame', new CylinderGeometry(0.032, 0.032, 2.1, 8), [0, FLOOR_Y + 1.15, -1.42]);
    // Low-gain antenna: a whip, for voice while the dish was stowed.
    parts.add('frame', new CylinderGeometry(0.012, 0.012, 0.9, 6), [0.56, FLOOR_Y + 0.6, -1.15]);

    // --- television camera ---
    // Ground-controlled, and pointed by a man in Houston working three seconds behind
    // what he was looking at.
    parts.add('frame', new CylinderGeometry(0.028, 0.028, 0.55, 8), [-0.62, FLOOR_Y + 0.42, -1.15]);
    parts.add('frame', new BoxGeometry(0.2, 0.18, 0.26), [-0.62, FLOOR_Y + 0.76, -1.15]);

    // --- rear tool pallet ---
    parts.add('frame', new BoxGeometry(1.3, 0.5, 0.1), [0, FLOOR_Y + 0.3, 1.32]);
    parts.add('foil', new BoxGeometry(1.1, 0.34, 0.34), [0, FLOOR_Y + 0.3, 1.14]);

    // --- fenders ---
    // Fibreglass, and famously fragile: Young caught a hammer on one and tore it off,
    // and on Apollo 17 the crew rebuilt a lost fender out of four laminated lunar maps
    // and two clamps from the optical alignment telescope. Without it the wheel throws
    // dust over everything behind it, and dust on a radiator is a real problem.
    const FENDER_ARC = Math.PI * 0.85;
    for (const zSide of [-1, 1] as const) {
        parts.addPair(
            'frame',
            () => {
                const fender = new TorusGeometry(LRV_WHEEL_RADIUS_M + 0.09, 0.035, 6, 12, FENDER_ARC);
                // A torus arc always starts at +X and sweeps through the XY plane, so
                // it has to be swung back by half its own span to sit centred over the
                // top of the wheel, and only then turned into the wheel's plane. Doing
                // it the other way round tips it out of that plane instead.
                fender.rotateZ(Math.PI / 2 - FENDER_ARC / 2);
                fender.rotateY(Math.PI / 2);
                return fender;
            },
            [HALF_TRACK, LRV_WHEEL_RADIUS_M, zSide * HALF_BASE]
        );
    }

    parts.build(group);

    // The dish is the one piece that cannot be merged with the rest: it is a spherical
    // cap, and a cap is only a *dish* when you can see its concave face, which needs
    // both sides drawn. One extra draw call for the part of the silhouette that says
    // what the vehicle is.
    const dish = new Mesh(
        new SphereGeometry(0.45, 24, 9, 0, Math.PI * 2, 0, Math.PI * 0.38),
        new MeshStandardMaterial({
            color: 0xd8d9dc,
            metalness: 0.5,
            roughness: 0.45,
            side: DoubleSide,
        })
    );
    dish.castShadow = true;

    // Hung off a pivot at the top of the mast rather than bolted to the chassis,
    // because on the real vehicle it *moved*: the crews re-aimed it at Earth by hand
    // at every stop, and out of alignment it was useless. Aiming it is `aimDish`.
    //
    // It also happens to fix the view. A metre of parabola face-on a metre and a half
    // ahead of the driver is most of the windscreen; the same dish turned to point at
    // an Earth two-thirds of the way up the sky presents its edge instead, and the
    // road comes back.
    const aim = new Group();
    aim.position.set(0, FLOOR_Y + 2.2, -1.42);
    aim.add(dish);
    group.add(aim);

    return { group, aim };
}

/**
 * One wheel, merged into a single buffer: rim, hub, spokes and chevron treads. It is
 * instantiated four times and each copy steers and spins on its own, which is the only
 * reason these are not merged into the chassis along with everything else.
 */
function buildWheelGeometry(): BufferGeometry {
    const pieces: BufferGeometry[] = [];

    // The mesh tyre. Open-ended, because the real one is see-through wire.
    const rim = new CylinderGeometry(
        LRV_WHEEL_RADIUS_M,
        LRV_WHEEL_RADIUS_M,
        0.23,
        20,
        1,
        true
    );
    rim.rotateZ(Math.PI / 2);
    pieces.push(rim);

    // Inner frame — the wheel had a titanium bump stop inside the mesh to keep it from
    // deflecting flat under load.
    const inner = new CylinderGeometry(0.2, 0.2, 0.2, 12, 1, true);
    inner.rotateZ(Math.PI / 2);
    pieces.push(inner);

    const hub = new CylinderGeometry(0.11, 0.11, 0.28, 10);
    hub.rotateZ(Math.PI / 2);
    pieces.push(hub);

    // Spokes. Each box is a full diameter, so eight of them at π/8 apart give sixteen
    // arms — and they rotate about X because that is the axle.
    for (let i = 0; i < 8; i++) {
        const spoke = new BoxGeometry(0.05, LRV_WHEEL_RADIUS_M * 1.8, 0.03);
        spoke.rotateX((i / 8) * Math.PI);
        pieces.push(spoke);
    }

    // Chevron treads: titanium strips covering half the contact area, no more, so the
    // mesh underneath could still flex into the regolith rather than ride on top of it.
    for (let i = 0; i < 14; i++) {
        const tread = new BoxGeometry(0.26, 0.045, 0.075);
        tread.translate(0, LRV_WHEEL_RADIUS_M + 0.01, 0);
        tread.rotateX((i / 14) * Math.PI * 2);
        pieces.push(tread);
    }

    return mergeGeometries(pieces, false) ?? rim;
}

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
            // wheelbase and gets a vehicle 3.1 m long around a 3.1 m circle.
            wheels[0].rotation.y = radians;
            wheels[1].rotation.y = radians;
            wheels[2].rotation.y = -radians;
            wheels[3].rotation.y = -radians;
        },
        aimDish(direction) {
            // The cap's open face looks along its own -Y, so aiming it is exactly the
            // rotation that carries -Y onto the direction wanted. Stowed at 45° when
            // there is no Earth to find.
            if (direction) aim.quaternion.setFromUnitVectors(DISH_FACE, direction);
            else aim.quaternion.setFromUnitVectors(DISH_FACE, STOWED);
        },
        roll(distance) {
            // Rolling without slipping. On a real one the wheels slipped constantly in
            // the regolith, which is why the navigation system had to correct its dead
            // reckoning against sun shots at every stop.
            const angle = distance / LRV_WHEEL_RADIUS_M;
            for (const spinner of spinners) spinner.rotation.x -= angle;
        },
        dispose() {
            wheelGeometry.dispose();
            chassis.traverse((child) => {
                if (child instanceof Mesh) child.geometry.dispose();
            });
        },
    };
}
