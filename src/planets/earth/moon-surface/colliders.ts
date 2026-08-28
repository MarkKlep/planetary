import { Vector3 } from 'three';

/**
 * Solid things.
 *
 * Everything else on this surface is a height field, and that is deliberate: the ground
 * *is* the constraint, `heightAt` is the same function the vertices used, and a walker
 * glued to it carries over crater rims and down into bowls without a line of collision
 * code. That works because the ground is a function — one height per point — which is
 * exactly what a lander, a flag pole and a two-metre block are not.
 *
 * So this is the small exception rather than a physics engine, and it is worth being
 * clear about why it is allowed to be as crude as it is.
 *
 * ## Why upright cylinders, and nothing else
 *
 * Every obstacle on the Moon that you can walk into is taller than it is subtle. A
 * descent stage is a four-legged octagon; a flag is a pole; a boulder is a lump. None of
 * them has an overhang worth representing, a moving part, or a face you could be pushed
 * along in a way a circle would get wrong by more than a boot's width — and all of them
 * are things you *stop at*, not things you interact with. A circle in plan with a height
 * is the entire fidelity the problem has.
 *
 * What that buys is that resolution is one square root per obstacle and the whole set
 * fits in a flat array of numbers. There are on the order of eighty of them at a
 * populated site, so the per-frame cost is beneath measurement, and there is no
 * broad-phase to keep in step with anything.
 *
 * ## The two numbers that carry the behaviour
 *
 * - **`top`** is what makes a footpad different from a flag pole. A 16 cm landing pad,
 *   a geophone and a ribbon cable are things you step over without noticing; the leg
 *   above the pad is not. One height per obstacle, compared against where the feet
 *   actually are, is what tells those apart — and it is also what lets a hop clear
 *   something low, since the test is against the feet rather than against the ground.
 * - **`radius`** is generous rather than tight. Being stopped a boot's width early is
 *   invisible; clipping through a leg strut because the cylinder was fitted to the
 *   tube's actual 7 cm is not, and a suited crewman is not a point either.
 *
 * ## Sliding, not sticking
 *
 * `resolve` returns the direction it pushed, and the callers use it to remove the
 * component of their own velocity that was going into the obstacle. Without that a
 * walker held against the side of the lander keeps accelerating into it, is pushed
 * back out every frame, and judders; with it they slide along it, which is both what
 * happens and what the hand expects. It is the whole reason this returns a normal
 * rather than a boolean.
 */

export interface Collider {
    /** Centre in the surface's local metre frame. */
    readonly x: number;
    readonly z: number;
    /** In plan. Fitted loosely — see above. */
    readonly radius: number;
    /** Metres in the local frame. Feet above this walk straight over. */
    readonly top: number;
}

/**
 * Two passes, because one is not enough in a corner.
 *
 * Pushed out of the lander's body, a walker can land inside a leg strut; pushed out of
 * that, they are back inside the body. Two passes settles every pair that actually
 * occurs here — obstacles this far apart cannot trap anything — and a third would only
 * pay for a geometry nobody has built.
 */
const PASSES = 2;

export interface Obstacles {
    /** Fixed geometry for the current site: the blocks and whatever was left here. */
    set(colliders: readonly Collider[]): void;
    /** The one obstacle that moves, and is not there at all while you are driving it. */
    setVehicle(collider: Collider | null): void;
    clear(): void;
    /**
     * Push a body out of anything solid, in place.
     *
     * `feetY` rather than the body's own y, because the caller knows where its feet are
     * and this does not — a walker's position is an eye and a rover's is an axle height.
     * `stepHeight` is how far up it can simply walk.
     *
     * Fills `push` with the unit direction it moved in and returns true if it moved at
     * all; leaves `push` alone otherwise.
     */
    resolve(
        position: Vector3,
        bodyRadius: number,
        feetY: number,
        stepHeight: number,
        push: Vector3
    ): boolean;
}

export function createObstacles(): Obstacles {
    let fixed: readonly Collider[] = [];
    let vehicle: Collider | null = null;
    const total = new Vector3();

    /** One pass over one list. Returns how far it moved the body. */
    function separate(
        list: readonly Collider[],
        position: Vector3,
        bodyRadius: number,
        feetY: number,
        stepHeight: number
    ): void {
        for (const obstacle of list) {
            // Cheap and first: the overwhelming majority of obstacles are nowhere near.
            const reach = obstacle.radius + bodyRadius;
            const dx = position.x - obstacle.x;
            const dz = position.z - obstacle.z;
            const distanceSq = dx * dx + dz * dz;
            if (distanceSq >= reach * reach) continue;
            // Stepping over it, or sailing above it mid-hop.
            if (obstacle.top <= feetY + stepHeight) continue;

            const distance = Math.sqrt(distanceSq);
            if (distance < 1e-4) {
                // Dead centre, which has no direction to be pushed in. Any consistent
                // one will do — this only happens when something is spawned inside
                // something else, and the point is to get out rather than to be right.
                position.x += reach;
                total.x += reach;
                continue;
            }
            const scale = (reach - distance) / distance;
            position.x += dx * scale;
            position.z += dz * scale;
            total.x += dx * scale;
            total.z += dz * scale;
        }
    }

    return {
        set(colliders) {
            fixed = colliders;
        },

        setVehicle(collider) {
            vehicle = collider;
        },

        clear() {
            fixed = [];
            vehicle = null;
        },

        resolve(position, bodyRadius, feetY, stepHeight, push) {
            total.set(0, 0, 0);
            for (let pass = 0; pass < PASSES; pass++) {
                separate(fixed, position, bodyRadius, feetY, stepHeight);
                if (vehicle) separate([vehicle], position, bodyRadius, feetY, stepHeight);
            }
            if (total.lengthSq() < 1e-12) return false;
            push.copy(total).normalize();
            return true;
        },
    };
}
