import { DEFAULT_TIME_SPEED } from './constants/planets.const';

/**
 * The simulated clock.
 *
 * Every body's position is a pure function of this clock rather than of an
 * accumulated per-frame angle. That keeps all the motion consistent with each other
 * at any speed — change the multiplier and the Earth's spin, the Moon's orbit and
 * the seasons all stay in step, because they are all reading the same date. It also
 * makes the simulation frame-rate independent, which the old
 * "+= ANGULAR_VELOCITY per frame, assuming 60 FPS" approach was not.
 *
 * It starts at the real current date, so at 1x the terminator matches the actual
 * daylight on Earth right now.
 */
let simulatedMs = Date.now();
let lastRealMs = performance.now();
let secondsPerSecond: number = DEFAULT_TIME_SPEED;
let paused = false;

export function getTimeSpeed(): number {
    return secondsPerSecond;
}

export function setTimeSpeed(speed: number): void {
    secondsPerSecond = speed;
}

export function isPaused(): boolean {
    return paused;
}

export function setPaused(value: boolean): void {
    paused = value;
}

/** Advances the clock by the real time elapsed since the last call, and returns it. */
export function advanceClock(): Date {
    const now = performance.now();
    const elapsedRealSeconds = (now - lastRealMs) / 1000;
    lastRealMs = now;

    if (!paused) {
        // Clamp the step so a backgrounded tab (or a slow first frame) does not
        // fast-forward the simulation by minutes when it resumes.
        simulatedMs += Math.min(elapsedRealSeconds, 0.1) * secondsPerSecond * 1000;
    }

    return new Date(simulatedMs);
}

export function getSimulatedDate(): Date {
    return new Date(simulatedMs);
}
