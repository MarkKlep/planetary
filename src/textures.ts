import { quality } from './quality';

/**
 * Where to load a texture from.
 *
 * `public/textures` holds the originals and two reduced sets beside them, in `half/` and
 * `quarter/`, written by `scripts/generate-texture-variants.sh`. Which one a session gets
 * is a property of the device, so it belongs in exactly one place rather than in
 * twenty-six string literals scattered through the planet modules.
 *
 * **Everything that loads a map must go through this**, including the two places that
 * read a map as *data* rather than as a texture (`site-samples.ts`, and Earth's height
 * and land-mask maps). Not for correctness — they would work fine on any of the three —
 * but because the browser's cache is keyed on the URL, and a module that reached past
 * this for `moon_color.jpg` while `moon.ts` asked for `quarter/moon_color.jpg` would
 * quietly download and decode the mosaic a second time, at four times the size, which is
 * precisely the cost this exists to avoid.
 *
 * The file name is passed bare — `texturePath('earth_day.jpg')` — because the directory
 * is the part that varies.
 */
export function texturePath(file: string): string {
    return `/textures/${quality.textureDirectory}${file}`;
}
