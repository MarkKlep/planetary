import { modalIds } from './modal-controller';
import './modal.scss';

export interface ModalProps {
    /**
     * Root element id. Every child id is derived from it, and `script.ts` reaches the
     * whole dialog through `bindModal(id, …)` with the same string.
     */
    id: string;
    title: string;
    message: string;
    /** The irreversible half — label it with the verb, not with "OK". */
    confirmLabel: string;
    cancelLabel: string;
}

/**
 * A confirmation dialog, mounted once and driven from outside.
 *
 * Static markup with no state of its own, like `flight-hud.tsx` and `surface-hud.tsx`:
 * whether it is up is a fact about the scene, which `script.ts` owns, so React state
 * here would only be a second copy of that waiting to disagree with it. The props are
 * the copy — fixed at the call site — not the state.
 *
 * `role="alertdialog"` rather than `dialog` because it interrupts to ask about
 * something already in progress, and it is the whole content of the overlay rather
 * than a request for more information.
 */
export function Modal({ id, title, message, confirmLabel, cancelLabel }: ModalProps) {
    const ids = modalIds(id);

    return (
        <div className="modal" id={ids.root} aria-hidden="true">
            <div
                className="modal__dialog"
                id={ids.dialog}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={ids.title}
                aria-describedby={ids.message}
            >
                <h2 className="modal__title" id={ids.title}>
                    {title}
                </h2>
                <p className="modal__message" id={ids.message}>
                    {message}
                </p>
                <div className="modal__actions">
                    <button type="button" className="modal__button" id={ids.cancel}>
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        className="modal__button modal__button--confirm"
                        id={ids.confirm}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
