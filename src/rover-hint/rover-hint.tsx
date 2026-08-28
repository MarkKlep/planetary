import './rover-hint.scss';

/**
 * The centre-screen prompt that says the rover can be driven.
 *
 * Standing on the Moon is already a mode you had to be told about — that is what
 * `moon-hint/` is for — and the rover is the same problem one level in: it is parked
 * 8 m away on a bearing you are not facing when you are set down (see
 * `ROVER_PARK_*` in moon-surface.ts), so the first thing a visitor sees of it is
 * nothing at all. The key legend in `surface-hud.tsx` names `R` and the read-out
 * counts the metres down, but both live in the bottom-right corner of a first-person
 * view whose whole point is that you are looking at the horizon.
 *
 * So this is the one piece of chrome in the project that sits in the middle of the
 * frame rather than against an edge, and it is deliberately the smallest thing that
 * can work: a key cap and one line. It is also the only piece that *blinks*, which is
 * the other half of the same argument — a static badge in the centre of a landscape
 * reads as part of the instrument, and a visitor who has stopped noticing it is a
 * visitor who never learns the rover exists.
 *
 * Static markup driven by classes from `script.ts`, exactly like `surface-hud.tsx`
 * and for the same reason: the mode, the rover's distance and whether anyone is
 * already driving all live outside React, and a copy of them in state here would only
 * be a second truth waiting to disagree with the first. `script.ts` toggles
 * `rover-hint--visible` and `rover-hint--near`; the two wordings are both always in
 * the DOM and the cascade picks one, the same always-mounted rule the HUD's walking
 * and driving halves follow.
 *
 * Two things it must never do. It must not take the pointer — it covers the entire
 * viewport and the canvas under it is being dragged to look around — and it must not
 * outlive its usefulness, which is why `script.ts` retires it for the session the
 * first time anyone actually boards.
 */
export function RoverHint() {
    return (
        // `role="status"` rather than `alert`: an offer, not an interruption. It is
        // announced when it appears because the layer is genuinely hidden
        // (`visibility`, not just transparent) the rest of the time.
        <div className="rover-hint" id="rover-hint" role="status">
            <kbd className="rover-hint__key" aria-hidden="true">
                R
            </kbd>
            <p className="rover-hint__text">
                {/* Far and near are the same instruction at two distances, and the
                    difference between them is the whole reason this is worth two
                    wordings: at 8 m the useful half of the sentence is "walk to the
                    rover", and at 4 m it is the key. */}
                <span className="rover-hint__far">
                    Walk to the rover, then press <kbd>R</kbd> to board
                </span>
                <span className="rover-hint__near">
                    Press <kbd>R</kbd> to board the rover
                </span>
            </p>
        </div>
    );
}
