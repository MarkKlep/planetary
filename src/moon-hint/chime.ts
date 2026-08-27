/**
 * The landing hint's chime, synthesised rather than loaded.
 *
 * There is no audio file here for the same reason `venus/clouds.ts` and the ice
 * giants draw their own maps: the thing is generated below the resolution at which a
 * recording would say anything. Two notes and an envelope are a handful of numbers,
 * while a file would be a binary in the repo, a second network round trip during the
 * exact window the splash exists to cover, and a decode on the main thread that
 * `initScene` has just finished monopolising.
 *
 * A rising perfect fifth (G5 → D6). Rising reads as "here is something", falling as
 * "something is over"; the fifth is the widest interval that still sounds like one
 * gesture rather than two unrelated beeps. Each note is a fundamental plus a quiet
 * octave partial, which is roughly what a small struck bell does and is what keeps a
 * pure sine from sounding like a hearing test.
 *
 * ## Autoplay
 *
 * A page that has not been interacted with cannot make sound: every current browser
 * creates the `AudioContext` in `suspended` and only lets `resume()` through off a
 * user gesture. That is not an error case to swallow — it is the *common* case for a
 * chime that fires on arrival, so it is handled rather than caught. `playChime` tries
 * to resume immediately (which succeeds for anyone who arrived by clicking a link on
 * a page of ours, or who reloaded a tab they had already used), and otherwise arms a
 * one-shot listener for the first click, tap or key and rings then.
 *
 * That listener is why this returns a canceller instead of nothing. Without one, a
 * visitor who never touches the page for five minutes gets a chime out of nowhere
 * long after the card that explains it has gone; the caller cancels on unmount, so
 * the sound can only ever arrive while there is something on screen to attribute it
 * to.
 *
 * The canceller also has to be usable *within* a gesture, because the deferred chime
 * has one genuinely bad case: the first gesture on the page may be the click that
 * dismisses the card, and a sound that arrives because you closed the notification is
 * worse than no sound at all. `GESTURE_EVENTS` is exported so the caller can watch
 * the same events in the capture phase — which runs ahead of the window-level
 * listeners armed here — and cancel before this ever sees them.
 */

/** G5 and D6. */
const NOTES = [
    { frequency: 783.99, delay: 0, duration: 0.55, gain: 0.085 },
    { frequency: 1174.66, delay: 0.13, duration: 0.75, gain: 0.065 },
];

/** The octave partial's share of its fundamental. Body, not a second audible note. */
const PARTIAL_GAIN = 0.22;

/** Long enough not to click, short enough to still read as a strike rather than a swell. */
const ATTACK_S = 0.008;

/**
 * What counts as the first interaction. Exported because a caller cancelling inside
 * one of these has to be watching exactly the same set — a gesture listened for here
 * and not there is one that can ring the chime at the wrong moment.
 */
export const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

/**
 * One context for the page, created on first use — never at module load. Constructing
 * an `AudioContext` eagerly costs an audio thread on every visit, including the many
 * where the hint never shows because the visitor has already seen it.
 */
let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
    if (context) return context;
    const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
        context = new Ctor();
    } catch {
        // Some embedded webviews expose the constructor and then refuse to build one.
        return null;
    }
    return context;
}

function ring(ctx: AudioContext): void {
    // A beat of lead-in: scheduling at exactly `currentTime` asks for samples the
    // hardware may already have consumed, which clips the attack off the first note.
    const start = ctx.currentTime + 0.02;

    for (const note of NOTES) {
        const at = start + note.delay;
        const envelope = ctx.createGain();
        envelope.connect(ctx.destination);

        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.exponentialRampToValueAtTime(note.gain, at + ATTACK_S);
        // Exponential rather than linear: loudness is perceived logarithmically, so a
        // linear fade is heard as holding steady and then stopping.
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + note.duration);

        for (const [multiple, share] of [[1, 1], [2, PARTIAL_GAIN]] as const) {
            const oscillator = ctx.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.value = note.frequency * multiple;

            const level = ctx.createGain();
            level.gain.value = share;

            oscillator.connect(level).connect(envelope);
            oscillator.start(at);
            // Stopping releases the node for collection; an oscillator left running is
            // a permanently scheduled source feeding a silent gain.
            oscillator.stop(at + note.duration + 0.05);
        }
    }
}

/**
 * Rings once, now or at the first user gesture, whichever the autoplay policy allows.
 *
 * @returns a canceller that withdraws a gesture-deferred chime that has not sounded
 *          yet. Safe to call at any point, including after the chime has played.
 */
export function playChime(): () => void {
    const ctx = audioContext();
    if (!ctx) return () => {};

    // Both routes below can win the race — the deferred `resume()` may settle just
    // after a gesture has already resumed and rung — so the ring itself is the thing
    // guarded, not either path into it.
    let rung = false;
    let cancelled = false;

    const ringOnce = () => {
        if (rung || cancelled) return;
        rung = true;
        ring(ctx);
    };

    if (ctx.state === 'running') {
        ringOnce();
        return () => {};
    }

    const onGesture = () => {
        stopListening();
        if (cancelled) return;
        void ctx.resume().then(ringOnce, () => {});
    };


    const stopListening = () => {
        for (const type of GESTURE_EVENTS) window.removeEventListener(type, onGesture);
    };

    for (const type of GESTURE_EVENTS) {
        // Bubble phase, deliberately — see the note on `GESTURE_EVENTS`: a caller
        // cancelling from the capture phase has to be able to get in first.
        window.addEventListener(type, onGesture, { once: true, passive: true });
    }

    // Chrome leaves this promise pending until a gesture arrives rather than
    // rejecting, and Safari resolves it with the context still suspended — so the
    // state is re-read on the way out instead of the promise being taken as an
    // answer.
    void ctx.resume().then(
        () => {
            if (ctx.state !== 'running') return;
            stopListening();
            ringOnce();
        },
        () => {},
    );

    return () => {
        cancelled = true;
        stopListening();
    };
}
