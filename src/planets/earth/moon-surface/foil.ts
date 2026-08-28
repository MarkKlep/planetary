import { CanvasTexture, RepeatWrapping, Vector3 } from 'three';
import { fbm } from '../../../noise';

/**
 * Crumpled foil, as a normal map.
 *
 * The lunar module's descent stage is wrapped in aluminised Kapton and H-film, and in
 * every photograph of it the blanket is a mess of creases — it was hand-taped over a
 * structure it did not fit, and there is no air to hold it smooth. That crumple is most
 * of why the thing reads as *foil* rather than as gold-painted plastic, and no amount of
 * getting the colour and the metalness right substitutes for it: a perfectly flat metal
 * surface under a single hard light is a flat shape with one specular smear on it.
 *
 * Two decisions here are worth keeping.
 *
 * **The height field is `|fbm|`, not `fbm`.** Ordinary fractal noise makes rolling dunes,
 * which is what a *dented* surface looks like. Taking the absolute value folds the field
 * at every zero crossing, and a fold in a smooth function is a crease — so the ridges are
 * sharp, they run in long connected lines, and they branch. That is the difference
 * between foil and orange peel, and it costs one call to `Math.abs`.
 *
 * **It is sampled on a torus.** The map is tiled across geometry whose UVs are per-face
 * and arbitrary, so a seam anywhere in it would show up as a hard line down the middle of
 * a blanket. Value noise is only seamless if the sample path closes, so the two texture
 * axes are wound round the two circles of a torus embedded in the 3D lattice `noise.ts`
 * already provides. Both axes then close exactly, with no blend region and no mirrored
 * half.
 */

/**
 * 128 is chosen against how it is used, not against how it looks alone. This is tiled a
 * few times per face on geometry that is metres across and viewed from metres away, so
 * the creases land at a few centimetres — finer than that and they mip away to a uniform
 * sheen at any distance, coarser and they read as dents.
 */
const TILE = 128;
/** How far the surface leans at a crease. Enough to catch the terminator, not to boil. */
const RELIEF = 2.6;

const point = new Vector3();

/**
 * The torus. `major` and `minor` are coprime enough in scale that the field does not
 * repeat visibly along either winding before it comes back round.
 */
function crease(u: number, v: number, seed: number): number {
    const a = u * Math.PI * 2;
    const b = v * Math.PI * 2;
    const major = 2.7;
    const minor = 1.15;
    const ring = major + minor * Math.cos(b);
    point.set(ring * Math.cos(a), minor * Math.sin(b), ring * Math.sin(a));
    return Math.abs(fbm(point, seed, 4));
}

let cached: CanvasTexture | null = null;

/**
 * One texture, shared by every foil surface in the scene. It carries no colour and no
 * scale of its own, so there is nothing for a second copy to differ in.
 */
export function foilNormalMap(): CanvasTexture {
    if (cached) return cached;

    const heights = new Float32Array(TILE * TILE);
    for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
            heights[y * TILE + x] = crease(x / TILE, y / TILE, 31);
        }
    }

    const canvas = document.createElement('canvas');
    canvas.width = TILE;
    canvas.height = TILE;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(TILE, TILE);
    const at = (x: number, y: number) =>
        // Wrapped, which is the whole point of having sampled a closed path.
        heights[((y + TILE) % TILE) * TILE + ((x + TILE) % TILE)];

    for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
            // Central differences. The slope of a folded field is discontinuous at the
            // fold, which is exactly the hard edge a crease is supposed to have.
            const dx = (at(x + 1, y) - at(x - 1, y)) * RELIEF;
            const dy = (at(x, y + 1) - at(x, y - 1)) * RELIEF;
            const inverse = 1 / Math.sqrt(dx * dx + dy * dy + 1);
            const index = (y * TILE + x) * 4;
            image.data[index] = Math.round((-dx * inverse * 0.5 + 0.5) * 255);
            image.data[index + 1] = Math.round((-dy * inverse * 0.5 + 0.5) * 255);
            image.data[index + 2] = Math.round((inverse * 0.5 + 0.5) * 255);
            image.data[index + 3] = 255;
        }
    }
    context.putImageData(image, 0, 0);

    cached = new CanvasTexture(canvas);
    // Data, not colour: no sRGB decode. Repeating because every consumer tiles it.
    cached.wrapS = RepeatWrapping;
    cached.wrapT = RepeatWrapping;
    return cached;
}
