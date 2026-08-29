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
 * user gesture. For a chime that fires on arrival that is not an edge case, it is
 * *the* case — a cold visit is suspended every single time. **There is therefore no
 * way to guarantee the chime sounds at the moment the card appears, in any browser,
 * and no amount of code here changes that.** It is worth stating plainly because it
 * is the constraint every version of this file has been shaped by.
 *
 * What is guaranteed instead is the pairing: the chime is never heard without the
 * card being on screen. `chimeWhenAudible` rings immediately if the context is
 * already running (a reload of a tab that has been used, an arrival from a click on a
 * page of ours), and otherwise at the first gesture — with the wait bounded by the
 * caller, which passes the card's own visible life. The caller is told which of the
 * two happened, so a late ring can hold the card open long enough to be read after
 * the sound rather than leaving at the same moment.
 *
 * Two earlier arrangements are worth not going back to. Waiting for a gesture with no
 * bound at all rang the chime long after the card had gone, with nothing on screen to
 * attribute it to. Bounding it to a couple of seconds instead — short enough that the
 * sound would always be part of the card's arrival — made it silent for practically
 * everyone, because nobody clicks that fast.
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
 * Rings once at the first moment the browser allows it, and tells the caller when
 * that has been settled either way.
 *
 * @param waitMs   how long to wait for the gesture that unblocks audio before giving
 *                 up on the sound. The caller's content should not be held back
 *                 longer than it is willing to withhold it — see the note above.
 * @param onSettled called exactly once with whether anything was actually heard —
 *                 immediately after the chime is scheduled, or at `waitMs` with the
 *                 page still silent. Never called after the returned canceller has
 *                 run. The flag is there so a caller can keep its own content up long
 *                 enough to be looked at after a ring that arrived late.
 * @returns a canceller. It must be callable *synchronously* from inside a gesture:
 *          the gesture that would unblock the chime can be the one that makes the
 *          chime unwanted, and a caller that waits for a state update to tear this
 *          down will be a whole event too late.
 */
export function chimeWhenAudible(waitMs: number, onSettled: (rang: boolean) => void): () => void {
    let settled = false;
    let cancelled = false;
    let waitTimer = 0;

    const onGesture = () => {
        void resumeThenSettle();
    };

    const stopListening = () => {
        for (const type of GESTURE_EVENTS) window.removeEventListener(type, onGesture);
    };

    /**
     * The one way out, taken once. `sound` is the context to ring on, or null for
     * having given up — the two endings differ only in whether anything is heard,
     * which is why they share a path rather than being separate callbacks.
     */
    const settle = (sound: AudioContext | null) => {
        if (settled || cancelled) return;
        settled = true;
        window.clearTimeout(waitTimer);
        stopListening();
        if (sound) ring(sound);
        onSettled(Boolean(sound));
    };

    const ctx = audioContext();
    if (!ctx) {
        // No Web Audio at all. Nothing to wait for, so the caller should not be kept
        // waiting either.
        settle(null);
        return () => {};
    }

    const resumeThenSettle = () =>
        ctx.resume().then(
            // Chrome leaves this promise pending until a gesture arrives rather than
            // rejecting, and Safari resolves it with the context still suspended — so
            // the state is re-read on the way out instead of the promise being taken
            // as an answer.
            () => {
                if (ctx.state === 'running') settle(ctx);
            },
            () => {},
        );

    if (ctx.state === 'running') {
        // Already interacted with — a reload of a tab that has been used, or an
        // arrival from a click on a page of ours. Nothing to wait for.
        settle(ctx);
        return () => {};
    }

    waitTimer = window.setTimeout(() => settle(null), waitMs);

    for (const type of GESTURE_EVENTS) {
        // Bubble phase, deliberately — see the note on `GESTURE_EVENTS`: a caller
        // cancelling from the capture phase has to be able to get in first.
        window.addEventListener(type, onGesture, { once: true, passive: true });
    }

    // Tried once up front as well, because the state above can go stale between the
    // read and here on a page that is being interacted with as it loads.
    void resumeThenSettle();

    return () => {
        cancelled = true;
        window.clearTimeout(waitTimer);
        stopListening();
    };
}
