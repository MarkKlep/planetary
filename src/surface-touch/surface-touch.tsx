import './surface-touch.scss';

/**
 * The touch controls for standing on the Moon.
 *
 * Everything else in this project degrades gracefully without a keyboard: the solar
 * system is `OrbitControls`, which has had touch gestures since it was written, and
 * the nav panel is buttons. Surface mode was the exception and it was not a degraded
 * experience but a missing one — `walk.ts` and `drive.ts` read `held.has('KeyW')`, so
 * a visitor on a phone landed at Tranquility Base, read "Rover · 8 m away" in the
 * HUD, and had no way to cross 8 m. `rover-hint.scss` and `surface-hud.scss` both
 * already hid their key legends on coarse pointers, which removed the *instructions*
 * for something that could not be done and left nothing in their place.
 *
 * Static markup driven by classes from `script.ts`, the same DOM bridge
 * `surface-hud.tsx` and `rover-hint.tsx` use and for the same reason: the mode,
 * whether anyone is driving, and how far away the rover is all live outside React.
 *
 * Four things about the shape are load-bearing:
 *
 * - **The container takes no pointer events and the controls opt back in.** It spans
 *   the viewport, and the canvas underneath is being dragged to look around — the
 *   look gesture has to survive everywhere the controls are not. This is the rule
 *   `rover-hint.tsx` follows for the same reason.
 * - **The stick is left and the buttons are right**, which is the one arrangement
 *   that works one-handed either way round and keeps the look gesture — the whole
 *   middle of the screen — clear between them.
 * - **Both button sets are always mounted** and CSS picks one off
 *   `surface-touch--driving`, exactly as the HUD switches its walking and driving
 *   halves. A button that does not exist yet never picks up its handler, which is
 *   the same rule `system-sheet.tsx` documents at length.
 * - **Hop is absent while driving and the rover button changes what it says**, because
 *   the pair is a handover rather than two independent actions. `Board` is disabled
 *   out of range rather than hidden: a control that vanishes as you walk away reads
 *   as a bug, and the HUD is already counting the metres down.
 */
export function SurfaceTouch() {
    return (
        <div className="surface-touch" id="surface-touch">
            <div className="surface-touch__pad" id="surface-stick" aria-hidden="true">
                <div className="surface-touch__knob" id="surface-stick-knob" />
                {/* Four ticks rather than arrow glyphs: the stick is analog and free
                    in every direction, and drawing four arrows on it would promise
                    the cardinals a keyboard has and this does not. */}
                <span className="surface-touch__tick surface-touch__tick--n" />
                <span className="surface-touch__tick surface-touch__tick--s" />
                <span className="surface-touch__tick surface-touch__tick--w" />
                <span className="surface-touch__tick surface-touch__tick--e" />
            </div>

            <div className="surface-touch__actions" role="group" aria-label="Surface actions">
                <button
                    type="button"
                    className="surface-touch__btn surface-touch__btn--lens"
                    id="surface-touch-lens"
                >
                    Lens
                </button>
                <button
                    type="button"
                    className="surface-touch__btn surface-touch__btn--hop"
                    id="surface-touch-hop"
                >
                    Hop
                </button>
                <button
                    type="button"
                    className="surface-touch__btn surface-touch__btn--rover"
                    id="surface-touch-rover"
                >
                    {/* Both wordings in the DOM, the cascade picks one — the same
                        always-mounted rule as the HUD's two halves. */}
                    <span className="surface-touch__walk-only">Board</span>
                    <span className="surface-touch__drive-only">Get out</span>
                </button>
                <button
                    type="button"
                    className="surface-touch__btn surface-touch__btn--leave"
                    id="surface-touch-leave"
                >
                    Leave
                </button>
            </div>
        </div>
    );
}
