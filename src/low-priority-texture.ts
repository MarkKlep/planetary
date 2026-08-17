import { SRGBColorSpace, Texture } from 'three';

/**
 * Loads a colour map the way `TextureLoader` does — sRGB, anisotropic — except with
 * `fetchPriority: 'low'` set on the underlying `<img>` before its `src` is assigned.
 *
 * `TextureLoader.load()` cannot do this: three.js's own `ImageLoader` sets `image.src`
 * synchronously the instant `.load()` is called, with no hook to mark the request
 * low-priority first. Delaying *when* `.load()` runs — via `requestIdleCallback`, say —
 * does not fix that either, because the call itself is nearly free (it only assigns
 * `.src`); by the time any idle callback fires, the request just joins the same queue
 * a few milliseconds later, still racing everything else at the same priority. What
 * actually keeps a rarely-viewed mosaic from contending with a body's own textures for
 * one of a handful of HTTP/1.1 connections is a scheduling hint the *browser* honours,
 * which a same-tick JS timing difference cannot be. `fetchPriority` is that hint, and
 * it works with the fetch starting immediately: the browser can open the connection
 * right away and simply service it after anything marked higher priority.
 *
 * Used for the Saturn system's rarely-visited icy moons and Titan's ground map, which
 * is normally hidden entirely under its haze — see `saturn/moons.ts` and
 * `saturn/titan.ts` for why those specifically, not every texture in the scene.
 */
export function loadLowPriorityColorMap(
    url: string,
    onLoad: (texture: Texture) => void,
    anisotropy = 8
): void {
    const image = new Image();
    // Not yet in TypeScript's DOM lib as of this project's target; the property is
    // real and supported in every evergreen browser, so a narrow cast beats bumping
    // the whole project's lib target for one field.
    (image as unknown as { fetchPriority: string }).fetchPriority = 'low';
    image.onload = () => {
        const texture = new Texture(image);
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = anisotropy;
        texture.needsUpdate = true;
        onLoad(texture);
    };
    image.src = url;
}
