import { Euler, MathUtils, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import {
    LRV_MAX_STEER_RAD,
    LRV_TOP_SPEED_MS,
    LRV_TRACK_M,
    LRV_WHEELBASE_M,
} from '../../../constants/planets.const';
import { SURFACE_FOV } from './sky';
import type { Rover } from './rover';

/**
 * Driving the LRV.
 *
 * ## The steering is the whole vehicle
 *
 * Both axles steer, in opposite directions, which halves the effective wheelbase and
 * is why a vehicle 3.1 m long turns inside a 3.1 m circle. That falls straight out of
 * the bicycle model below — the yaw rate is v·tan(δ)/(L/2), and it is the *halved* L
 * that does it. Nothing here special-cases the turning circle; it is a consequence of
 * where the wheels point.
 *
 * ## Why it wanders
 *
 * The body is not carried along a smooth path. Its height and its attitude are read
 * from the ground under all four wheels every frame, so the whole vehicle pitches into
 * crater bowls and rolls across their rims, and the camera — bolted to the left seat —
 * goes with it. That is most of what makes 10 km/h feel like a lot, and it is the same
 * `heightAt` the terrain vertices were built from, so a wheel never floats or sinks.
 *
 * The one thing not modelled is the part the crews complained about most: at speed the
 * back end broke loose and all four wheels would leave the ground together over a rise.
 * There is no slip and no suspension travel here, so it grips. The top speed is the
 * real 13 km/h, and if you point it downhill gravity will take you past it, which is
 * exactly how the 18 km/h record was set.
 */

/** Metres per second per second. Two 36-volt batteries and a quarter horsepower a wheel. */
const ACCELERATION = 1.6;
const BRAKING = 2.6;
/** Coasting drag: wire mesh in loose regolith does not roll far. */
const ROLLING_DRAG = 0.55;
/** Reverse was slow and awkward, and the crews avoided it. */
const REVERSE_SPEED_MS = 1.2;
/** How fast the hand controller can swing the wheels over, radians per second. */
const STEER_RATE = 1.5;
const STEER_RETURN_RATE = 2.4;

const LOOK_SENSITIVITY = 0.0022;
const PITCH_LIMIT = MathUtils.degToRad(85);
/** How far you can turn in the seat before the suit stops you. */
const YAW_LIMIT = MathUtils.degToRad(115);

/**
 * Where the commander sat: left seat, eye about 1.3 m off the ground, and set well
 * back on the chassis. The setback matters more than it sounds like it should — the
 * console is at arm's length and the antenna mast is a metre and a half beyond that,
 * and moving the eye forward by 20 cm is the difference between driving the thing and
 * looking at the back of its own hardware.
 */
const SEAT_OFFSET = new Vector3(-0.4, 1.32, 0.42);

const HALF_BASE = LRV_WHEELBASE_M / 2;
const HALF_TRACK = LRV_TRACK_M / 2;

const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);

export interface Driver {
    readonly enabled: boolean;
    /** Ground speed, m/s. Negative in reverse. */
    readonly speed: number;
    /** Metres driven since the rover was set down. */
    readonly odometer: number;
    /** Where the rover is, on the ground between its wheels. */
    readonly position: Vector3;
    /** Compass heading, radians east of north. */
    readonly heading: number;
    enable(): void;
    disable(): void;
    setGround(heightAt: (x: number, z: number) => number): void;
    /** Put the rover down at a spot and a bearing, and reset the trip. */
    park(x: number, z: number, azimuth: number): void;
    update(deltaSeconds: number, fieldOfView: number): void;
}

export function createDriver(
    rover: Rover,
    camera: PerspectiveCamera,
    domElement: HTMLElement
): Driver {
    const held = new Set<string>();
    // The look direction is relative to the *vehicle*, not to the world: turning your
    // head does not turn the rover, and the rover turning carries your head with it.
    const look = new Euler(0, 0, 0, 'YXZ');
    const position = new Vector3();
    const orientation = new Quaternion();
    const seat = new Vector3();
    const spin = new Quaternion();

    let ground: (x: number, z: number) => number = () => 0;
    let enabled = false;
    let looking = false;
    let heading = 0;
    let speed = 0;
    let steer = 0;
    let odometer = 0;

    /**
     * Attitude from the ground under the wheels.
     *
     * Four samples of the same height field the terrain was built from: the mean sets
     * how high the body rides, the front-to-back difference sets the pitch, and the
     * side-to-side difference sets the roll. No suspension and no contact solver — on
     * a surface with no mud, no grass and no compliance worth modelling, the ground
     * *is* the constraint.
     */
    function settle(): void {
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);

        let mean = 0;
        let front = 0;
        let rear = 0;
        let left = 0;
        let right = 0;

        for (const [dx, dz] of WHEEL_OFFSETS) {
            // Rotate the wheel offset into the world by the current heading. Same
            // rotation `Object3D.rotation.y` applies: x' = x·cos + z·sin, z' = z·cos - x·sin.
            const x = position.x + dx * cos + dz * sin;
            const z = position.z + dz * cos - dx * sin;
            const height = ground(x, z);

            mean += height * 0.25;
            if (dz < 0) front += height * 0.5;
            else rear += height * 0.5;
            if (dx < 0) left += height * 0.5;
            else right += height * 0.5;
        }

        position.y = mean;

        // Nose up when the front wheels sit higher; right side up when they do.
        const pitch = Math.atan2(front - rear, LRV_WHEELBASE_M);
        const roll = Math.atan2(right - left, LRV_TRACK_M);

        // Composed explicitly rather than through an Euler order, because which of the
        // six three.js orders means "yaw, then pitch, then roll about the vehicle's own
        // axes" is exactly the kind of thing that is wrong once and never noticed.
        orientation
            .setFromAxisAngle(Y_AXIS, heading)
            .multiply(spin.setFromAxisAngle(X_AXIS, pitch))
            .multiply(spin.setFromAxisAngle(Z_AXIS, roll));
    }

    function onPointerDown(event: PointerEvent): void {
        if (!enabled || event.button !== 0) return;
        looking = true;
        domElement.setPointerCapture(event.pointerId);
        domElement.style.cursor = 'grabbing';
    }

    function onPointerMove(event: PointerEvent): void {
        if (!enabled || !looking) return;
        const scale =
            Math.tan((camera.fov * Math.PI) / 360) / Math.tan((SURFACE_FOV * Math.PI) / 360);
        // Clamped both ways, because this is a head turn in a pressure suit rather than
        // a free camera: you cannot look behind your own seat.
        look.y = MathUtils.clamp(
            look.y - event.movementX * LOOK_SENSITIVITY * scale,
            -YAW_LIMIT,
            YAW_LIMIT
        );
        look.x = MathUtils.clamp(
            look.x - event.movementY * LOOK_SENSITIVITY * scale,
            -PITCH_LIMIT,
            PITCH_LIMIT
        );
    }

    function onPointerUp(event: PointerEvent): void {
        if (!looking) return;
        looking = false;
        domElement.releasePointerCapture(event.pointerId);
        domElement.style.cursor = enabled ? 'grab' : 'default';
    }

    function onKeyDown(event: KeyboardEvent): void {
        if (!enabled) return;
        const tag = (event.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (event.code === 'Space') event.preventDefault();
        held.add(event.code);
    }

    function onKeyUp(event: KeyboardEvent): void {
        held.delete(event.code);
    }

    function onBlur(): void {
        held.clear();
    }

    domElement.addEventListener('pointerdown', onPointerDown);
    domElement.addEventListener('pointermove', onPointerMove);
    domElement.addEventListener('pointerup', onPointerUp);
    domElement.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return {
        get enabled() {
            return enabled;
        },
        get speed() {
            return speed;
        },
        get odometer() {
            return odometer;
        },
        position,
        get heading() {
            // Compass bearing, east of north. The scene points -Z north, so a rover
            // yaw of zero is already facing north and the sense is simply reversed.
            return -heading;
        },

        enable() {
            enabled = true;
            held.clear();
            look.set(0, 0, 0);
            domElement.style.cursor = 'grab';
        },

        disable() {
            enabled = false;
            looking = false;
            held.clear();
            // The parking brake was a full pull back on the hand controller, and they
            // used it every time — on a slope with a sixth of the friction, a rover
            // that rolls away is a walk home of several kilometres.
            speed = 0;
            steer = 0;
            domElement.style.cursor = 'default';
        },

        setGround(heightAt) {
            ground = heightAt;
        },

        park(x, z, azimuth) {
            position.set(x, 0, z);
            heading = -azimuth;
            speed = 0;
            steer = 0;
            odometer = 0;
            settle();
            rover.object.position.copy(position);
            rover.object.quaternion.copy(orientation);
            rover.setSteering(0);
        },

        update(deltaSeconds, fieldOfView) {
            if (!enabled) {
                // Still has to sit on the ground correctly while parked and looked at.
                rover.object.position.copy(position);
                rover.object.quaternion.copy(orientation);
                return;
            }

            if (Math.abs(camera.fov - fieldOfView) > 1e-4) {
                camera.fov = fieldOfView;
                camera.updateProjectionMatrix();
            }

            // --- throttle ---
            const forward = held.has('KeyW');
            const back = held.has('KeyS');
            if (forward) speed += ACCELERATION * deltaSeconds;
            else if (back) speed -= BRAKING * deltaSeconds;
            else {
                // Coast down toward a stop without crossing it.
                const drag = ROLLING_DRAG * deltaSeconds;
                speed = Math.abs(speed) <= drag ? 0 : speed - Math.sign(speed) * drag;
            }
            speed = MathUtils.clamp(speed, -REVERSE_SPEED_MS, LRV_TOP_SPEED_MS);

            // --- steering ---
            const steerInput = (held.has('KeyA') ? 1 : 0) - (held.has('KeyD') ? 1 : 0);
            if (steerInput !== 0) {
                steer = MathUtils.clamp(
                    steer + steerInput * STEER_RATE * deltaSeconds,
                    -LRV_MAX_STEER_RAD,
                    LRV_MAX_STEER_RAD
                );
            } else {
                // Self-centring, the way a caster does — it was not sprung, but it
                // followed the ground back to straight soon enough.
                const centring = STEER_RETURN_RATE * deltaSeconds;
                steer = Math.abs(steer) <= centring ? 0 : steer - Math.sign(steer) * centring;
            }
            rover.setSteering(steer);

            // --- motion ---
            const travelled = speed * deltaSeconds;
            // The bicycle model, over the *halved* wheelbase — which is the entire
            // reason both axles steer, and the entire reason it turns as tightly as it
            // is long. Yaw only accumulates while it is actually rolling: a stationary
            // rover with the wheels over does not rotate on the spot.
            heading += (travelled * Math.tan(steer)) / HALF_BASE;

            position.x -= travelled * Math.sin(heading);
            position.z -= travelled * Math.cos(heading);
            odometer += Math.abs(travelled);

            settle();
            rover.roll(travelled);
            rover.object.position.copy(position);
            rover.object.quaternion.copy(orientation);

            // --- the view from the left seat ---
            seat.copy(SEAT_OFFSET).applyQuaternion(orientation).add(position);
            camera.position.copy(seat);
            // Vehicle attitude first, head turn second: pitching over a crater rim
            // carries the view with it, exactly as being strapped to the thing would.
            camera.quaternion.copy(orientation).multiply(spin.setFromEuler(look));
        },
    };
}

/**
 * Wheel contact offsets in the rover's own frame — front pair first, matching
 * `rover.ts`. -Z is forward, so the front wheels have the negative z.
 */
const WHEEL_OFFSETS: ReadonlyArray<readonly [number, number]> = [
    [-HALF_TRACK, -HALF_BASE],
    [HALF_TRACK, -HALF_BASE],
    [-HALF_TRACK, HALF_BASE],
    [HALF_TRACK, HALF_BASE],
];
