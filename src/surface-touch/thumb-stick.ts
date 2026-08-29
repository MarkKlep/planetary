/**
 * An analog thumb stick, as a pair of DOM elements and a vector.
 *
 * This exists because standing on the Moon is the one mode here with no touch story
 * at all: `walk.ts` and `drive.ts` both read a `Set` of `event.code`, so on a phone
 * the surface was a place you could look around from and never move in — the rover
 * sat 8 m away with no way to cross them. Looking already worked, because dragging
 * the canvas is a pointer gesture either way; it was only ever the *movement* half
 * that was keyboard-shaped.
 *
 * Three things about it are deliberate.
 *
 * **It reports a direction and a lean, not a set of pressed keys.** Synthesising
 * `KeyW` from a stick would throw away the one thing a stick has over a keyboard —
 * how far it is pushed — and that quantity turns out to carry real meaning here: it
 * is what picks the gait. See `walk.ts`.
 *
 * **The knob is clamped to the pad but the finger is not.** A touch that slides past
 * the rim keeps steering, because lifting the constraint at the edge is what makes a
 * stick feel like a stick rather than like a small square you keep falling out of.
 * The vector saturates at 1; the finger can be anywhere.
 *
 * **It captures the pointer and it takes `touch-action: none`.** Without the capture
 * a finger leaving the pad silently stops reporting and the walker keeps going in the
 * last direction it heard — the same latched-key failure `onBlur` exists to prevent
 * everywhere else in this project. Without `touch-action` the browser claims the
 * gesture for scrolling or pull-to-refresh before the first `pointermove` arrives,
 * which on Android reloads a ten-second boot.
 */
export interface ThumbStick {
    /** Right-positive, in −1..1. */
    readonly x: number;
    /** Forward-positive — screen *up* — in −1..1. */
    readonly y: number;
    /** Whether a finger is currently on it. */
    readonly active: boolean;
    dispose(): void;
}

export function createThumbStick(
    pad: HTMLElement,
    knob: HTMLElement,
    onChange: (x: number, y: number) => void
): ThumbStick {
    let x = 0;
    let y = 0;
    let pointerId: number | null = null;
    /** Pad radius in CSS pixels, read on the gesture rather than cached — the layout
     *  changes with the viewport and a rotated phone is a different pad. */
    let radius = 1;
    let centreX = 0;
    let centreY = 0;

    function publish(nextX: number, nextY: number): void {
        if (nextX === x && nextY === y) return;
        x = nextX;
        y = nextY;
        onChange(x, y);
    }

    function moveKnob(): void {
        knob.style.transform = `translate(${x * radius}px, ${-y * radius}px)`;
    }

    function onPointerDown(event: PointerEvent): void {
        if (pointerId !== null) return;
        const box = pad.getBoundingClientRect();
        // Half the pad, less the knob's own radius, so a fully deflected knob sits
        // inside the rim rather than half out of it.
        radius = Math.max(box.width / 2 - knob.offsetWidth / 2, 1);
        centreX = box.left + box.width / 2;
        centreY = box.top + box.height / 2;
        pointerId = event.pointerId;
        pad.setPointerCapture(event.pointerId);
        pad.classList.add('surface-touch__pad--active');
        onPointerMove(event);
    }

    function onPointerMove(event: PointerEvent): void {
        if (event.pointerId !== pointerId) return;
        event.preventDefault();
        const dx = event.clientX - centreX;
        // Screen y grows downward and forward is up, so the sign flips here once and
        // nowhere else — every consumer gets a vector that already means what it says.
        const dy = centreY - event.clientY;
        const distance = Math.hypot(dx, dy);
        // Saturate rather than clamp each axis, or a diagonal would reach 1.41 and
        // the walker would lope on the diagonals while walking on the cardinals.
        const scale = distance > radius ? radius / distance : 1;
        publish((dx * scale) / radius, (dy * scale) / radius);
        moveKnob();
    }

    function onPointerUp(event: PointerEvent): void {
        if (event.pointerId !== pointerId) return;
        pointerId = null;
        if (pad.hasPointerCapture(event.pointerId)) pad.releasePointerCapture(event.pointerId);
        pad.classList.remove('surface-touch__pad--active');
        publish(0, 0);
        moveKnob();
    }

    pad.addEventListener('pointerdown', onPointerDown);
    pad.addEventListener('pointermove', onPointerMove);
    pad.addEventListener('pointerup', onPointerUp);
    pad.addEventListener('pointercancel', onPointerUp);
    // A stick that keeps its last value while the tab is in the background is the
    // latched-key bug wearing a different hat.
    window.addEventListener('blur', () => {
        if (pointerId === null) return;
        pointerId = null;
        pad.classList.remove('surface-touch__pad--active');
        publish(0, 0);
        moveKnob();
    });

    return {
        get x() {
            return x;
        },
        get y() {
            return y;
        },
        get active() {
            return pointerId !== null;
        },
        dispose() {
            pad.removeEventListener('pointerdown', onPointerDown);
            pad.removeEventListener('pointermove', onPointerMove);
            pad.removeEventListener('pointerup', onPointerUp);
            pad.removeEventListener('pointercancel', onPointerUp);
        },
    };
}
