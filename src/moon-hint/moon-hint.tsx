import { useEffect, useState } from 'react';
import { GESTURE_EVENTS, playChime } from './chime';
import './moon-hint.scss';

/**
 * The one-time card that says the Moon can be walked on.
 *
 * Landing is the only thing in the app that is a *mode* rather than a camera move —
 * it replaces the whole render (see CLAUDE.md on `moon-surface/`) — and it is also
 * the only feature that is invisible on arrival: the Land button lives inside Earth's
 * sheet, which opens only when asked, inside a panel that starts collapsed as well on a
 * phone. `LandFlag` in the nav panel already marks the row permanently for anyone
 * who opens that sheet; nothing tells the visitor who never does.
 *
 * So this is the announcement half of the same fact, and it is built the opposite way
 * on purpose: temporary rather than permanent, animated rather than steady, and gone
 * for good once it has done its job. Two things carry it — the card, and a beacon
 * that walks the route the card describes, one control at a time: the panel's toggle
 * while the panel is shut, Earth's opener while its sheet is shut, and then the
 * Land button itself. That is why the card can name two controls in a sentence and
 * still be followed on a phone, where the first control is a third one it never
 * mentions. The whole trail is CSS — see moon-hint.scss — because every stage of it
 * is already written on the panel's own class list.
 *
 * Shown once per tab session, not once per visit. A hint that returns after it has
 * been read is not a hint, it is a nag — and this one makes a sound. Session rather
 * than persistent storage is deliberate: this is a "don't show again *right now*"
 * rather than a "never show again" — closing the tab and coming back later, or opening
 * a fresh one, is treated as enough of a new visit to be worth a reminder.
 */

/** Named like `planetary:quality`, though it lives in a different storage — see below. */
const STORAGE_KEY = 'planetary:moon-hint';

/**
 * Long enough after the splash's own 400 ms fade that the card arrives at a settled
 * scene rather than sliding in over the tail of it — and, more to the point, long
 * enough that the chime does not land on top of the first frame's stutter.
 */
const ENTER_DELAY_MS = 900;

/** Two sentences and a shortcut, at an unhurried reading speed, plus a beat to act. */
const AUTO_HIDE_MS = 18000;

/** Must match `moon-hint-out`'s duration in the stylesheet. */
const EXIT_MS = 240;

/** Drives the beacon on the nav panel's own controls — see moon-hint.scss. */
const BEACON_CLASS = 'moon-hint-live';

/**
 * Pressing Land is the card being taken up, so it is also the card being finished —
 * a better dismissal than the × will ever be, and the only click that counts as one.
 */
const TAKEN_UP = '#toggle-moon-surface';

/** The card's own dismissal, which ends it just as surely as taking it up does. */
const CLOSED = '.moon-hint__close';

/** `L` lands from anywhere, and the card says so — so it ends the card too. */
const TAKE_UP_KEY = 'l';

/**
 * Guarded on the event target exactly the way `script.ts`'s own shortcut handler is,
 * and for the same reason: the chat widget has a text field, and someone typing
 * "lunar" into it is not asking to land. Without this the card would count that as
 * having been taken up and never come back.
 */
function isLandKey(event: KeyboardEvent): boolean {
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return false;
    return event.key.toLowerCase() === TAKE_UP_KEY;
}

/**
 * The two steps *before* that one. Deliberately not dismissals: opening the panel or
 * Earth's sheet is someone halfway through the instruction, and taking the card
 * away at that exact moment removes the word "Land" from the screen one frame before
 * the Land button appears on it. They restart the clock instead, so following the
 * hint slowly can never run it out.
 */
const IN_PROGRESS = '.nav-panel-toggle, [data-expand="earth"]';

function shouldShow(): boolean {
    // Same escape hatch `quality.ts` gives its tier, and for the same reason: a
    // one-time card is otherwise unreachable the moment you have seen it once, which
    // makes it the hardest thing in the app to work on. `?hint=0` is the other half,
    // for looking at a clean first frame.
    const forced = new URLSearchParams(window.location.search).get('hint');
    if (forced === '1') return true;
    if (forced === '0') return false;

    try {
        return window.sessionStorage.getItem(STORAGE_KEY) === null;
    } catch {
        // Private-mode Safari throws on Storage access outright — the same wall
        // `quality.ts` documents for `localStorage`, and `sessionStorage` shares it.
        // Showing it is the safe side of that failure: the card is dismissible, and a
        // visitor who cannot be remembered is exactly the one who has not been told.
        return true;
    }
}

function markSeen(): void {
    try {
        window.sessionStorage.setItem(STORAGE_KEY, 'seen');
    } catch {
        // See shouldShow — nothing to do, and nothing worth reporting.
    }
}

/**
 * `waiting` and `done` render nothing; the two in between are the card's own
 * animation. Entry is a CSS animation rather than a transition toggled a frame after
 * mount, so there is no render-then-add-a-class dance to get wrong, and `leaving` is
 * a real state rather than an unmount because a card that vanishes mid-sentence reads
 * as a bug in the page.
 */
type Phase = 'waiting' | 'shown' | 'leaving' | 'done';

export function MoonHint() {
    const [phase, setPhase] = useState<Phase>(() => (shouldShow() ? 'waiting' : 'done'));

    useEffect(() => {
        if (phase !== 'waiting') return;
        const timer = window.setTimeout(() => setPhase('shown'), ENTER_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [phase]);

    // Everything that holds only while the card is actually up. Tearing all of it
    // down together is what guarantees the beacon stops with the card and the chime
    // can never arrive after it — see `playChime` on why that matters.
    useEffect(() => {
        if (phase !== 'shown') return;

        document.body.classList.add(BEACON_CLASS);
        const cancelChime = playChime();

        const dismiss = () => setPhase('leaving');

        let autoHide = window.setTimeout(dismiss, AUTO_HIDE_MS);
        const restartClock = () => {
            window.clearTimeout(autoHide);
            autoHide = window.setTimeout(dismiss, AUTO_HIDE_MS);
        };

        // Delegated on the document rather than bound to the controls themselves, for
        // the nav panel's own reason: those buttons are React-rendered and the panel
        // is a separate component, so reaching in to attach handlers would be a
        // second, fragile bridge alongside the `data-target` one that already exists.
        const onDocumentClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target) return;
            if (target.closest(TAKEN_UP)) dismiss();
            else if (target.closest(IN_PROGRESS)) restartClock();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (isLandKey(event)) dismiss();
        };

        // The chime waits for the page's first gesture whenever the browser blocked
        // it on arrival, and that gesture can perfectly well be the one that ends the
        // card — pressing Land, hitting L, or clicking the ×. A sound that arrives
        // *because* the notification was dismissed is worse than no sound at all, so
        // the chime is withdrawn before it can hear the same event.
        //
        // This has to be the gesture itself rather than the dismissal it leads to:
        // `click` runs a whole event later than `pointerdown`, by which time the
        // chime has already resumed the context and rung. Capture phase on the
        // document runs ahead of the chime's window-level listeners for every one of
        // these, which is what makes getting in first possible at all.
        const onEndingGesture = (event: Event) => {
            const ends =
                event.type === 'keydown'
                    ? isLandKey(event as KeyboardEvent)
                    : Boolean((event.target as HTMLElement | null)?.closest(`${TAKEN_UP}, ${CLOSED}`));
            if (ends) cancelChime();
        };

        document.addEventListener('click', onDocumentClick);
        document.addEventListener('keydown', onKeyDown);
        for (const type of GESTURE_EVENTS) {
            document.addEventListener(type, onEndingGesture, true);
        }

        return () => {
            document.body.classList.remove(BEACON_CLASS);
            cancelChime();
            window.clearTimeout(autoHide);
            document.removeEventListener('click', onDocumentClick);
            document.removeEventListener('keydown', onKeyDown);
            for (const type of GESTURE_EVENTS) {
                document.removeEventListener(type, onEndingGesture, true);
            }
        };
    }, [phase]);

    useEffect(() => {
        if (phase !== 'leaving') return;
        // Recorded here rather than on first paint, so a visitor who reloads within
        // the first few seconds — before they could plausibly have read it — gets it
        // again, while one who has seen it out never does.
        markSeen();
        const timer = window.setTimeout(() => setPhase('done'), EXIT_MS);
        return () => window.clearTimeout(timer);
    }, [phase]);

    if (phase === 'waiting' || phase === 'done') return null;

    return (
        // `role="status"` rather than `alert`: this is an offer, not an interruption,
        // so a screen reader should finish what it is saying before reading it out.
        <div
            className={`moon-hint ${phase === 'leaving' ? 'moon-hint--leaving' : ''}`}
            role="status"
        >
            {/* The nav panel's own Moon row plus its Land flag, drawn as one mark —
                the card and the row it points at should be recognisably the same
                thing. Hand-drawn rather than `<BodyIcon id="moon" />`: that component
                derives its gradient's element id from the body id, and the panel is
                already rendering a moon, so reusing it would put two nodes with the
                same id in the document. */}
            <span className="moon-hint__mark" aria-hidden="true">
                <svg viewBox="0 0 28 28" width="28" height="28" focusable="false">
                    <circle className="moon-hint__disc" cx="12.5" cy="15.5" r="9.5" />
                    <circle className="moon-hint__crater" cx="9" cy="12.5" r="2.5" />
                    <circle className="moon-hint__crater" cx="15" cy="19" r="1.9" />
                    <circle className="moon-hint__crater" cx="15.5" cy="11.5" r="1.1" />
                    <g className="moon-hint__flag">
                        <path d="M20.5 2.5v10.5" strokeWidth="1.6" strokeLinecap="round" fill="none" />
                        <path d="M21.4 3.1h5v3.4h-5z" strokeWidth="0" />
                    </g>
                </svg>
            </span>

            <div className="moon-hint__body">
                <p className="moon-hint__eyebrow">You can land</p>
                {/* Names the controls in the order they are used and in the words
                    printed on them, and hands the rest to the beacon — which is what
                    lets one sentence be right on both layouts. On a phone the first
                    thing lit is the panel's own toggle, a control this text never
                    mentions and would read as clutter if it did. */}
                <p className="moon-hint__text">
                    The Moon is the one body here you can stand on. Follow the amber
                    marks: open <strong>Earth</strong>, then press <strong>Land</strong>{' '}
                    beside Moon.
                </p>
                <p className="moon-hint__shortcut">
                    <kbd>L</kbd> does the same from anywhere
                </p>
            </div>

            <button
                type="button"
                className="moon-hint__close"
                aria-label="Dismiss"
                onClick={() => setPhase('leaving')}
            >
                <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
                    <path
                        d="M2.5 2.5l7 7M9.5 2.5l-7 7"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        fill="none"
                    />
                </svg>
            </button>
        </div>
    );
}
