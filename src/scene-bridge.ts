import type { Object3D } from 'three';
import { earth } from './planets/earth/earth';
import { moon } from './planets/earth/moon';
import { sun } from './sun';
import { iss } from './iss';
import { analemmaAnchor } from './planets/earth/analemma';
import { mercury } from './planets/mercury/mercury';
import { venus } from './planets/venus/venus';
import { mars } from './planets/mars/mars';
import { deimos, phobos } from './planets/mars/moons';
import { jupiter } from './planets/jupiter/jupiter';
import { callisto, europa, ganymede, io } from './planets/jupiter/moons';
import { saturn } from './planets/saturn/saturn';
import { dione, enceladus, iapetus, mimas, rhea, tethys } from './planets/saturn/moons';
import { titan } from './planets/saturn/titan';

/**
 * The scene's own view of where the camera is and what it is on, exposed for readers
 * outside `initScene()`'s closure — today that is the chat assistant.
 *
 * This exists because `script.ts` has exactly one module-scope binding (`initScene`),
 * so `focusOnObject`, `freeFlight` and `moonSurface` are all unreachable from another
 * module. It follows the shape `issTelemetry` already establishes in `iss.ts`: a
 * module-scope object the scene writes to and consumers read, rather than state
 * plumbed through React.
 *
 * Reading this from the DOM instead was the obvious cheaper idea and does not work.
 * The nav panel's `active` class is only set by the nav buttons' own click handler;
 * clicking a body *in the 3D scene* focuses it through `focusOnObject` without ever
 * touching that class, so the panel's record goes stale exactly when someone asks
 * "what am I looking at?".
 */

/** The 24 focus targets, matching the nav panel's `data-target` vocabulary exactly. */
export type BodyId =
    | 'sun'
    | 'mercury'
    | 'venus'
    | 'earth'
    | 'moon'
    | 'iss'
    | 'analemma'
    | 'mars'
    | 'phobos'
    | 'deimos'
    | 'jupiter'
    | 'io'
    | 'europa'
    | 'ganymede'
    | 'callisto'
    | 'saturn'
    | 'mimas'
    | 'enceladus'
    | 'tethys'
    | 'dione'
    | 'rhea'
    | 'titan'
    | 'iapetus'
    | 'system';

export const BODY_IDS: BodyId[] = [
    'sun', 'mercury', 'venus', 'earth', 'moon', 'iss', 'analemma',
    'mars', 'phobos', 'deimos',
    'jupiter', 'io', 'europa', 'ganymede', 'callisto',
    'saturn', 'mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan', 'iapetus',
    'system',
];

/** Human-readable names, for the assistant's own prose and the action read-out. */
export const BODY_LABELS: Record<BodyId, string> = {
    sun: 'the Sun',
    mercury: 'Mercury',
    venus: 'Venus',
    earth: 'Earth',
    moon: 'the Moon',
    iss: 'the ISS',
    analemma: 'the analemma',
    mars: 'Mars',
    phobos: 'Phobos',
    deimos: 'Deimos',
    jupiter: 'Jupiter',
    io: 'Io',
    europa: 'Europa',
    ganymede: 'Ganymede',
    callisto: 'Callisto',
    saturn: 'Saturn',
    mimas: 'Mimas',
    enceladus: 'Enceladus',
    tethys: 'Tethys',
    dione: 'Dione',
    rhea: 'Rhea',
    titan: 'Titan',
    iapetus: 'Iapetus',
    system: 'the whole solar system',
};

export const sceneState = {
    /** What the camera is following. `system` means the wide shot of every orbit. */
    focusedBody: 'earth' as BodyId,
    mode: 'orbit' as 'orbit' | 'free-flight' | 'surface',
    /** The landing site's id, only while `mode` is `surface`. */
    surfaceSite: null as string | null,
};

/**
 * Reverse lookup from the focused mesh back to its id.
 *
 * Built here rather than passed in because the meshes are module-scope singletons in
 * their own files, so this module can import them directly — which is what keeps the
 * edit to `script.ts` down to one call inside `focusOnObject` rather than a line at
 * each of the 24 `case` arms.
 */
const idByObject = new Map<Object3D, BodyId>([
    [sun, 'sun'],
    [mercury, 'mercury'],
    [venus, 'venus'],
    [earth, 'earth'],
    [moon, 'moon'],
    [iss, 'iss'],
    [analemmaAnchor, 'analemma'],
    [mars, 'mars'],
    [phobos, 'phobos'],
    [deimos, 'deimos'],
    [jupiter, 'jupiter'],
    [io, 'io'],
    [europa, 'europa'],
    [ganymede, 'ganymede'],
    [callisto, 'callisto'],
    [saturn, 'saturn'],
    [mimas, 'mimas'],
    [enceladus, 'enceladus'],
    [tethys, 'tethys'],
    [dione, 'dione'],
    [rhea, 'rhea'],
    [titan, 'titan'],
    [iapetus, 'iapetus'],
]);

/**
 * Records a focus. Called from `focusOnObject`, so it catches every route in —
 * nav button, click in the scene, and keyboard shortcut alike.
 *
 * `isSystemView` is passed rather than inferred: the wide shot focuses `sun` like the
 * Sun button does, and only the caller knows which of the two it meant.
 */
export function setFocusedObject(target: Object3D, isSystemView = false): void {
    if (isSystemView) {
        sceneState.focusedBody = 'system';
        return;
    }
    const id = idByObject.get(target);
    if (id) sceneState.focusedBody = id;
}

/**
 * Flies the camera to a body by clicking its nav button.
 *
 * Deliberately routed through the DOM rather than through a second code path into the
 * scene: CLAUDE.md prescribes the `data-target` bridge for nav actions, and going
 * through the real button inherits the leave-surface confirmation and the panel's own
 * active-highlight bookkeeping for free. Every button is always mounted — collapsed
 * dropdowns are hidden in CSS only — so this works whatever the panel is showing.
 *
 * Returns false if the button is missing, which the assistant reports rather than
 * claiming a move that never happened.
 */
export function focusBody(id: BodyId): boolean {
    const button = document.querySelector<HTMLElement>(`.nav-btn[data-target="${id}"]`);
    if (!button) return false;
    button.click();
    return true;
}
