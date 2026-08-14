import { Vector3 } from 'three';

/**
 * Deterministic value noise on the sphere.
 *
 * Seeded, so anything built from it is identical on every load — a moon that
 * re-rolled its craters on refresh would be a strange thing to look at twice.
 *
 * Everything here is sampled from a *3D direction* rather than from texture
 * coordinates, which is what keeps it seam-free: an equirectangular map evaluated in
 * uv space has to be made to match at the 180° meridian by hand, and pinches at the
 * poles where the whole top row is one point. Feeding it a direction sidesteps both.
 */

function hash(i: number, j: number, k: number): number {
    let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smootherstep = (t: number) => t * t * (3 - 2 * t);

/** Value noise on the integer lattice, trilinearly blended. Returns [-1, 1]. */
export function noise(x: number, y: number, z: number): number {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const k = Math.floor(z);
    const fx = smootherstep(x - i);
    const fy = smootherstep(y - j);
    const fz = smootherstep(z - k);

    let total = 0;
    for (let dx = 0; dx <= 1; dx++) {
        for (let dy = 0; dy <= 1; dy++) {
            for (let dz = 0; dz <= 1; dz++) {
                const weight =
                    (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
                total += weight * hash(i + dx, j + dy, k + dz);
            }
        }
    }
    return total * 2 - 1;
}

/** Several octaves of the above, which is what turns smooth blobs into terrain. */
export function fbm(direction: Vector3, seed: number, octaves: number): number {
    let sum = 0;
    let amplitude = 1;
    let weight = 0;
    let frequency = 2.4;

    for (let octave = 0; octave < octaves; octave++) {
        sum +=
            amplitude *
            noise(
                direction.x * frequency + seed * 1.7,
                direction.y * frequency + seed * 3.1,
                direction.z * frequency + seed * 5.3
            );
        weight += amplitude;
        amplitude *= 0.5;
        frequency *= 2.13;
    }
    return sum / weight;
}

export function mulberry32(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
