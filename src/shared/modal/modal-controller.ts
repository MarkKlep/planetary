/**
 * The imperative half of the shared modal.
 *
 * `modal.tsx` renders the markup and this drives it — the same DOM-bridge split the
 * nav panel and the two HUDs already use, and for the same reason: the thing that
 * decides a dialog should be up lives in `script.ts`, outside React entirely, so the
 * two meet at an element id rather than at a prop.
 *
 * A dialog needs a little more than the class toggle those panels get. It has to take
 * the keyboard away from whatever is behind it, answer Escape itself, and hand focus
 * back where it found it. That plumbing lives here once instead of in each caller.
 */

/**
 * The ids the component writes and the controller reads, derived from one root id so
 * the two halves cannot drift apart.
 */
export function modalIds(id: string) {
    return {
        root: id,
        dialog: `${id}-dialog`,
        title: `${id}-title`,
        message: `${id}-message`,
        confirm: `${id}-confirm`,
        cancel: `${id}-cancel`,
    };
}

export interface ModalHandlers {
    /** The confirm button, and nothing else — this is the irreversible half. */
    onConfirm(): void;
    /** Cancel, Escape, or a click on the backdrop. */
    onCancel?(): void;
}

export interface ModalController {
    readonly open: boolean;
    show(): void;
    /** Take it down without answering: neither handler fires. */
    close(): void;
}

const OPEN_CLASS = 'modal--open';

export function bindModal(id: string, handlers: ModalHandlers): ModalController {
    const ids = modalIds(id);
    const root = document.getElementById(ids.root);
    const confirmButton = document.getElementById(ids.confirm);
    const cancelButton = document.getElementById(ids.cancel);

    let open = false;
    let restoreFocus: HTMLElement | null = null;

    function setOpen(next: boolean): void {
        if (next === open) return;
        open = next;
        root?.classList.toggle(OPEN_CLASS, next);
        root?.setAttribute('aria-hidden', next ? 'false' : 'true');

        if (next) {
            restoreFocus = document.activeElement as HTMLElement | null;
            // Focus lands on the *quiet* option, not the destructive one: a dialog the
            // user did not ask for should do the harmless thing if they hit Enter or
            // Space on reflex.
            cancelButton?.focus();
        } else {
            restoreFocus?.focus?.();
            restoreFocus = null;
        }
    }

    function answer(confirmed: boolean): void {
        if (!open) return;
        // Closed before the handler runs, so anything it does — including putting a
        // second dialog up — sees a controller that is no longer busy.
        setOpen(false);
        if (confirmed) handlers.onConfirm();
        else handlers.onCancel?.();
    }

    confirmButton?.addEventListener('click', () => answer(true));
    cancelButton?.addEventListener('click', () => answer(false));

    // The backdrop *is* the root element, with the dialog inside it, so a click that
    // lands on the root itself is by definition a click outside the dialog.
    root?.addEventListener('click', (event) => {
        if (event.target === root) answer(false);
    });

    // Capture phase on `document`, and *every* key is swallowed rather than only the
    // ones handled here. That is what makes this modal rather than merely on top:
    // everything behind it listens on `window` in the bubble phase — `script.ts`'s
    // shortcuts, and the movement keys in `walk.ts`/`drive.ts` — so stopping
    // propagation here is what keeps W from walking off while the question is still on
    // screen, and what stops Escape being read a second time by whatever put the
    // dialog up in the first place.
    //
    // `stopPropagation` does not cancel default actions, so Enter and Space still
    // activate the focused button.
    document.addEventListener(
        'keydown',
        (event) => {
            if (!open) return;
            event.stopPropagation();

            if (event.key === 'Escape') {
                event.preventDefault();
                answer(false);
            } else if (event.key === 'Tab') {
                // With exactly two controls, wrapping by hand is cheaper than a real
                // focus trap and cannot fall out of step with the markup.
                event.preventDefault();
                const next = document.activeElement === cancelButton ? confirmButton : cancelButton;
                next?.focus();
            }
        },
        true
    );

    return {
        get open() {
            return open;
        },
        show: () => setOpen(true),
        close: () => setOpen(false),
    };
}
