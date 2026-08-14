/**
 * The shape of an impact crater, shared by everything here that has to build one.
 *
 * Deliberately scale-free: it takes a distance from the centre and a radius, and only
 * ever uses their *ratio*, so the same function draws Stickney across a quarter of
 * Phobos (where the units are radians on a sphere) and a 12-metre bowl beside a
 * lander (where they are metres on a tangent plane). Craters are close to
 * self-similar over that whole range, which is the one thing that makes the reuse
 * honest rather than convenient.
 */

/**
 * How far past the rim the profile still contributes, in crater radii. Anything
 * beyond this returns zero, which is what lets callers reject most crater/vertex
 * pairs with a single squared-distance test.
 */
export const CRATER_REACH = 1.7;

/**
 * Height offset at `distance` from the centre of a crater of the given `radius` and
 * `depth`, in whatever unit `depth` is given in.
 *
 * A parabolic floor that reaches the surrounding surface exactly at the rim, plus the
 * ejecta piled just outside it. The rim is shallow, but it is what stops overlapping
 * craters from reading as one dented region.
 */
export function craterProfile(distance: number, radius: number, depth: number): number {
    const s = distance / radius;
    if (s > CRATER_REACH) return 0;

    const bowl = s < 1 ? -depth * (1 - s * s) : 0;
    const rim = depth * 0.34 * Math.exp(-(((s - 1) * 2.6) ** 2));
    return bowl + rim;
}

/**
 * Diameter drawn from the crater size-frequency distribution, given a uniform
 * `roll` in [0, 1).
 *
 * Small craters vastly outnumber large ones, and on airless bodies the count obeys a
 * power law closely enough to be worth sampling properly rather than biasing a
 * uniform draw by eye. For a cumulative slope of −2 (N(≥D) ∝ D⁻², about right for
 * lunar mare below a kilometre) the inverse-CDF draw between two bounds is the
 * expression below.
 */
export function craterDiameter(roll: number, minimum: number, maximum: number): number {
    const lo = 1 / (minimum * minimum);
    const hi = 1 / (maximum * maximum);
    return 1 / Math.sqrt(lo + roll * (hi - lo));
}
