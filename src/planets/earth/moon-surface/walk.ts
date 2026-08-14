import { Euler, MathUtils, PerspectiveCamera, Vector3 } from 'three';
import {
    MOON_EYE_HEIGHT_M,
    MOON_SURFACE_GRAVITY,
} from '../../../constants/planets.const';
import { SURFACE_FOV } from './sky';

/**
 * Walking, which is a different problem from flying.
 *
 * `free-flight.ts` exists because at solar-system scale there is no workable fixed
 * speed, so it derives one from the clearance to the nearest surface. Here the
 * opposite is true and it is the constants that carry the meaning: a suited astronaut
 * walks at about 0.9 m/s and lopes at a little over 2, and those numbers are the
 * whole feel of the place. Nothing about them should scale with anything.
 *
 * What does carry over is the reasoning about *time*. Movement runs on real elapsed
 * seconds, never on the simulated clock — you have to be able to walk around while
 * the simulation is paused, and picking a larger time multiplier to watch the shadows
 * move must not also make you sprint.
 */

/** Suited, on the flat. Apollo crews measured out about this and found it awkward. */
const WALK_SPEED = 1.1;
/**
 * The loping, two-footed bound the crews switched to almost immediately, and which
 * turned out to be both faster and less tiring than walking in a pressure suit.
 */
const LOPE_SPEED = 2.6;
/**
 * Take-off speed for a hop. At 1.62 m/s² this clears 0.79 m and hangs for very nearly
 * two seconds; the identical push on Earth manages 13 cm and is over in a third of a
 * second. Six times the height and six times the time, which is the one piece of
 * lunar physics you can feel rather than measure.
 */
const HOP_SPEED = 1.6;

const LOOK_SENSITIVITY = 0.0022; // radians per pixel dragged, matching free flight
const PITCH_LIMIT = MathUtils.degToRad(89.5);
/**
 * How far the opening view will tilt up to frame something. A sixth of the standing
 * field of view, which puts the horizon in the lower third — the ground is what there
 * is to see here, and arriving to a frame full of sky is a worse first second than
 * having to look up for Earth.
 */
const LANDING_PITCH_LIMIT = MathUtils.degToRad(SURFACE_FOV / 6);
/** Exponential ease on the horizontal velocity, so starting and stopping is not a step. */
const SMOOTHING_SECONDS = 0.16;
/**
 * Gait bob. Small — under 4 cm — but its absence is conspicuous: without it a walk
 * reads as a camera being slid along a rail rather than as somebody moving.
 */
const BOB_AMPLITUDE = 0.035;
const BOB_WAVELENGTH = 1.6;

export interface Walker {
    /** Eye position in the local scene frame, metres. */
    readonly position: Vector3;
    readonly airborne: boolean;
    /** Ground speed, m/s — for the read-out. */
    readonly speed: number;
    enable(): void;
    disable(): void;
    /** Re-derive the standing height, after a landing or a change of site. */
    setGround(heightAt: (x: number, z: number) => number): void;
    /** Stand somewhere else — used when stepping off the rover. */
    placeAt(x: number, z: number): void;
    /**
     * Point the observer at a bearing, radians east of north, and tilt toward
     * something at `altitude` radians above the horizon.
     */
    face(azimuth: number, altitude?: number): void;
    update(deltaSeconds: number, fieldOfView: number, zoomed: boolean): void;
}

const UP = new Vector3(0, 1, 0);

export function createWalker(
    camera: PerspectiveCamera,
    domElement: HTMLElement
): Walker {
    const held = new Set<string>();
    // 'YXZ' is what keeps this roll-free: yaw about the world up, pitch about the
    // already-yawed right axis, so the horizon stays level however far round you turn.
    // On a surface that matters more than it does in flight — a tilted horizon here
    // reads as the ground being wrong rather than as the camera being banked.
    const orientation = new Euler(0, 0, 0, 'YXZ');
    const position = new Vector3(0, MOON_EYE_HEIGHT_M, 0);
    const velocity = new Vector3();
    const move = new Vector3();

    let ground: (x: number, z: number) => number = () => 0;
    let enabled = false;
    let looking = false;
    let verticalSpeed = 0;
    let airborne = false;
    let distanceWalked = 0;
    let speed = 0;

    function standingHeight(): number {
        return ground(position.x, position.z) + MOON_EYE_HEIGHT_M;
    }

    function onPointerDown(event: PointerEvent): void {
        if (!enabled || event.button !== 0) return;
        looking = true;
        domElement.setPointerCapture(event.pointerId);
        domElement.style.cursor = 'grabbing';
    }

    function onPointerMove(event: PointerEvent): void {
        if (!enabled || !looking) return;
        // Sensitivity tracks the field of view, or the long lens would be unusable:
        // the same drag has to sweep the same fraction of the frame either way.
        const scale =
            Math.tan((camera.fov * Math.PI) / 360) / Math.tan((SURFACE_FOV * Math.PI) / 360);
        orientation.y -= event.movementX * LOOK_SENSITIVITY * scale;
        orientation.x = MathUtils.clamp(
            orientation.x - event.movementY * LOOK_SENSITIVITY * scale,
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

        held.add(event.code);

        if (event.code === 'Space') {
            event.preventDefault(); // or the page scrolls under the canvas
            if (!airborne) {
                verticalSpeed = HOP_SPEED;
                airborne = true;
            }
        }
    }

    // Not gated on `enabled`: a key released after the mode is switched off would
    // otherwise stay latched and walk away on its own next time.
    function onKeyUp(event: KeyboardEvent): void {
        held.delete(event.code);
    }

    function onBlur(): void {
        held.clear();
        velocity.set(0, 0, 0);
    }

    domElement.addEventListener('pointerdown', onPointerDown);
    domElement.addEventListener('pointermove', onPointerMove);
    domElement.addEventListener('pointerup', onPointerUp);
    domElement.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return {
        position,
        get airborne() {
            return airborne;
        },
        get speed() {
            return speed;
        },

        enable() {
            enabled = true;
            held.clear();
            velocity.set(0, 0, 0);
            verticalSpeed = 0;
            airborne = false;
            domElement.style.cursor = 'grab';
        },

        disable() {
            enabled = false;
            looking = false;
            held.clear();
            velocity.set(0, 0, 0);
            speed = 0;
            domElement.style.cursor = 'default';
        },

        setGround(heightAt) {
            ground = heightAt;
            this.placeAt(0, 0);
        },

        placeAt(x, z) {
            position.set(x, 0, z);
            position.y = standingHeight();
            velocity.set(0, 0, 0);
            verticalSpeed = 0;
            airborne = false;
            distanceWalked = 0;
        },

        face(azimuth, altitude = 0) {
            // Azimuth is measured from north through east; the camera looks down its
            // own -Z, which the scene points north, so a yaw of zero already faces
            // north and the sign follows from the right-handed turn.
            orientation.y = -azimuth;
            // Tilted toward whatever it was aimed at, but never so far that the
            // horizon leaves the frame. That trade is real rather than a compromise:
            // from Tranquility Base, Earth stands 67° up, and no field of view a
            // person could stand behind holds both it and the ground at once.
            orientation.x = MathUtils.clamp(altitude, 0, LANDING_PITCH_LIMIT);
        },

        update(deltaSeconds, fieldOfView, zoomed) {
            if (!enabled) return;

            // Only when it actually moved: rebuilding a projection matrix every frame
            // for an unchanged field of view is pure churn.
            if (Math.abs(camera.fov - fieldOfView) > 1e-4) {
                camera.fov = fieldOfView;
                camera.updateProjectionMatrix();
            }
            camera.quaternion.setFromEuler(orientation);

            move.set(0, 0, 0);
            if (held.has('KeyW')) move.z -= 1;
            if (held.has('KeyS')) move.z += 1;
            if (held.has('KeyA')) move.x -= 1;
            if (held.has('KeyD')) move.x += 1;

            if (move.lengthSq() > 0) {
                // Walk in the tangent plane, not along the line of sight. Looking up
                // at Earth should not lift you off the ground, and looking down at
                // your boots should not drive you into them.
                move.normalize().applyAxisAngle(UP, orientation.y);
            }

            const lope = held.has('ShiftLeft') || held.has('ShiftRight');
            const target = (lope ? LOPE_SPEED : WALK_SPEED) * (zoomed ? 0.35 : 1);

            // Frame-rate independent easing: a fixed fraction closed per second.
            const blend = 1 - Math.exp(-deltaSeconds / SMOOTHING_SECONDS);
            velocity.lerp(move.multiplyScalar(target), blend);

            position.x += velocity.x * deltaSeconds;
            position.z += velocity.z * deltaSeconds;
            speed = Math.hypot(velocity.x, velocity.z);
            distanceWalked += speed * deltaSeconds;

            const standing = standingHeight();

            if (airborne) {
                verticalSpeed -= MOON_SURFACE_GRAVITY * deltaSeconds;
                position.y += verticalSpeed * deltaSeconds;
                if (position.y <= standing && verticalSpeed <= 0) {
                    position.y = standing;
                    verticalSpeed = 0;
                    airborne = false;
                }
            } else {
                // Glued to the ground, which is also what carries you over crater rims
                // and down into bowls without any collision work: the surface *is* the
                // constraint, and `heightAt` is the same function the vertices used.
                position.y = standing + Math.sin((distanceWalked / BOB_WAVELENGTH) * Math.PI * 2) * BOB_AMPLITUDE * Math.min(speed, 1);
            }

            camera.position.copy(position);
        },
    };
}
