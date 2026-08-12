import { PerspectiveCamera, Euler, Vector3, MathUtils } from 'three';

/**
 * Free-flight camera — fly the scene directly instead of orbiting a chosen body.
 *
 * `OrbitControls` is a *pivot*: it can only ever swing around a point something else
 * picked. That is the right tool for "show me Mars" and the wrong one for "let me go
 * and look for myself", which needs the camera to translate freely and aim wherever
 * it is pointed.
 *
 * ## Speed, which is the whole problem at this scale
 *
 * A scene unit is an Earth radius and the orbits are tens of thousands of them, so
 * there is no such thing as a sensible fixed speed: inspecting the ISS wants about
 * 0.01 units/s, and crossing to Mars wants about 1000. Five orders of magnitude.
 *
 * So speed is not fixed — it is proportional to the clearance to the nearest
 * surface, supplied by the caller (which owns the scene graph). That makes the
 * control scale-invariant: whatever you are near, one second of travel always covers
 * the same *fraction* of the gap between you and it. Creeping over a surface and
 * crossing interplanetary space are then the same gesture, and the multiplier below
 * only exists for taste.
 *
 * ## No roll
 *
 * Space has no "up", but a camera free to roll is disorienting and — more
 * practically — could not hand back to `OrbitControls`, whose `lookAt` assumes the
 * world up vector. Pitch and yaw only, pitch stopped just short of vertical so the
 * view never flips through the pole.
 */

const WORLD_UP = new Vector3(0, 1, 0);

/** Fraction of the clearance to the nearest surface covered per second at ×1. */
const BASE_RATE = 0.8;
/** Keeps movement possible when parked on a surface, where clearance is ~0. */
const MIN_CLEARANCE = 0.002;
const LOOK_SENSITIVITY = 0.0022; // radians per pixel dragged
/** Exponential ease on the velocity, so starting and stopping are not a step. */
const SMOOTHING_SECONDS = 0.11;
const PITCH_LIMIT = MathUtils.degToRad(89.5);
const MIN_MULTIPLIER = 1 / 64;
const MAX_MULTIPLIER = 64;
const BOOST = 6;

export interface FreeFlight {
    readonly enabled: boolean;
    /** Current speed in scene units per second — for the read-out. */
    readonly speed: number;
    readonly multiplier: number;
    enable(): void;
    disable(): void;
    /** @param clearance distance to the nearest body's *surface*, in scene units. */
    update(deltaSeconds: number, clearance: number): void;
}

export function createFreeFlight(
    camera: PerspectiveCamera,
    domElement: HTMLElement
): FreeFlight {
    const held = new Set<string>();
    // 'YXZ' is what makes this roll-free: yaw is applied about the world's up axis
    // and pitch about the already-yawed right axis, so z stays 0 and the horizon
    // stays level however far round you turn.
    const orientation = new Euler(0, 0, 0, 'YXZ');
    const velocity = new Vector3();
    const move = new Vector3();
    const forward = new Vector3();

    let enabled = false;
    let looking = false;
    let multiplier = 1;
    let speed = 0;

    /** Adopt whatever the camera is already looking at, so enabling never jumps. */
    function syncFromCamera(): void {
        camera.getWorldDirection(forward);
        orientation.y = Math.atan2(-forward.x, -forward.z);
        orientation.x = Math.asin(MathUtils.clamp(forward.y, -1, 1));
        orientation.z = 0;
    }

    function scaleMultiplier(factor: number): void {
        multiplier = MathUtils.clamp(multiplier * factor, MIN_MULTIPLIER, MAX_MULTIPLIER);
    }

    function onPointerDown(event: PointerEvent): void {
        if (!enabled || event.button !== 0) return;
        looking = true;
        domElement.setPointerCapture(event.pointerId);
        domElement.style.cursor = 'grabbing';
    }

    function onPointerMove(event: PointerEvent): void {
        if (!enabled || !looking) return;
        // Drag right turns right, which means yaw *decreasing*: the camera looks
        // down -z with +x to its right, so a positive yaw swings it the other way.
        orientation.y -= event.movementX * LOOK_SENSITIVITY;
        orientation.x = MathUtils.clamp(
            orientation.x - event.movementY * LOOK_SENSITIVITY,
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

    function onWheel(event: WheelEvent): void {
        if (!enabled) return;
        event.preventDefault(); // OrbitControls is disabled, so nothing else claims this
        scaleMultiplier(Math.exp(-event.deltaY * 0.0015));
    }

    function onKeyDown(event: KeyboardEvent): void {
        if (!enabled) return;
        const tag = (event.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        held.add(event.code);
        if (event.code === 'BracketLeft') scaleMultiplier(1 / 1.5);
        if (event.code === 'BracketRight') scaleMultiplier(1.5);
    }

    // Not gated on `enabled`: a key released after the mode is switched off would
    // otherwise stay latched and fly the camera away next time it is switched on.
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
    domElement.addEventListener('wheel', onWheel, { passive: false });
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
        get multiplier() {
            return multiplier;
        },

        enable() {
            if (enabled) return;
            enabled = true;
            syncFromCamera();
            held.clear();
            velocity.set(0, 0, 0);
            domElement.style.cursor = 'grab';
        },

        disable() {
            if (!enabled) return;
            enabled = false;
            looking = false;
            held.clear();
            velocity.set(0, 0, 0);
            speed = 0;
            domElement.style.cursor = 'default';
        },

        update(deltaSeconds: number, clearance: number): void {
            if (!enabled) return;

            camera.quaternion.setFromEuler(orientation);

            move.set(0, 0, 0);
            if (held.has('KeyW')) move.z -= 1;
            if (held.has('KeyS')) move.z += 1;
            if (held.has('KeyA')) move.x -= 1;
            if (held.has('KeyD')) move.x += 1;
            move.applyQuaternion(camera.quaternion);

            // Up/down go along the *ecliptic* normal rather than the camera's own up,
            // so they always climb out of the plane of the solar system instead of
            // depending on where you happen to be looking.
            if (held.has('KeyE')) move.add(WORLD_UP);
            if (held.has('KeyQ')) move.sub(WORLD_UP);
            if (move.lengthSq() > 0) move.normalize();

            const boost = held.has('ShiftLeft') || held.has('ShiftRight') ? BOOST : 1;
            const fine =
                held.has('ControlLeft') ||
                held.has('ControlRight') ||
                held.has('AltLeft') ||
                held.has('AltRight')
                    ? 1 / BOOST
                    : 1;

            const targetSpeed =
                Math.max(clearance, MIN_CLEARANCE) * BASE_RATE * multiplier * boost * fine;

            // Frame-rate independent easing: the fraction closed per second is fixed,
            // rather than a fraction per frame.
            const blend = 1 - Math.exp(-deltaSeconds / SMOOTHING_SECONDS);
            velocity.lerp(move.multiplyScalar(targetSpeed), blend);
            camera.position.addScaledVector(velocity, deltaSeconds);
            speed = velocity.length();
        },
    };
}
