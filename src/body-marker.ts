import {
    Sprite,
    SpriteMaterial,
    CanvasTexture,
    AdditiveBlending,
    PerspectiveCamera,
    Object3D,
    Vector3,
    Color,
} from 'three';

/**
 * Minimum-size markers for distant bodies.
 *
 * Body sizes here are true to scale, which means that once the whole orbit is in
 * frame Earth is 1 unit against 1500 and covers well under a pixel — it simply
 * vanishes. Rather than inflate the planets (and lie about the geometry), each body
 * carries a small additive dot that fades in only once the body itself has shrunk
 * below a few pixels. This is what Celestia and NASA's Eyes do, and it keeps the
 * scale honest while leaving something to look at and click on.
 */

let dotTexture: CanvasTexture | null = null;

function getDotTexture(): CanvasTexture {
    if (dotTexture) return dotTexture;

    const size = 64;
    const c = size / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Deliberately flat-topped. These are drawn at only ~10px, so a gradient that
    // starts falling off immediately leaves a solid core barely 2px across and the
    // marker reads as a faint smudge instead of a body.
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
    gradient.addColorStop(0.0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.34, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.62)');
    gradient.addColorStop(0.78, 'rgba(255,255,255,0.18)');
    gradient.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    dotTexture = new CanvasTexture(canvas);
    return dotTexture;
}

export interface BodyMarker {
    sprite: Sprite;
    /** Radius of the body itself, in world units. */
    bodyRadius: number;
    /** On-screen size the marker settles at, in CSS pixels. */
    pixelSize: number;
}

export function createBodyMarker(color: number, bodyRadius: number, pixelSize = 7): BodyMarker {
    const sprite = new Sprite(
        new SpriteMaterial({
            map: getDotTexture(),
            color: new Color(color),
            blending: AdditiveBlending,
            depthWrite: false,
            // Without this the marker gets rolled off by ACES along with everything
            // else and ends up too dim to notice at distance.
            toneMapped: false,
            opacity: 0,
            transparent: true,
        })
    );
    sprite.visible = false;
    return { sprite, bodyRadius, pixelSize };
}

const markerWorldPosition = new Vector3();

/**
 * Sizes the marker so it holds a constant pixel footprint, and fades it in as the
 * body drops below that size.
 *
 * For a perspective camera, a world length `s` at distance `d` covers
 * `s / (2·d·tan(fov/2)) · viewportHeight` pixels; solving for `s` at a fixed pixel
 * target gives the scale below.
 */
export function updateBodyMarker(
    marker: BodyMarker,
    camera: PerspectiveCamera,
    viewportHeight: number
): void {
    const parent: Object3D | null = marker.sprite.parent;
    if (!parent) return;

    parent.getWorldPosition(markerWorldPosition);
    const distance = camera.position.distanceTo(markerWorldPosition);
    const pixelsPerWorldUnit =
        viewportHeight / (2 * distance * Math.tan((camera.fov * Math.PI) / 360));

    const bodyPixels = marker.bodyRadius * 2 * pixelsPerWorldUnit;

    // Fully on once the body is smaller than the marker, off again by the time it is
    // comfortably resolvable, so the two never visibly overlap.
    const opacity = 1 - smoothstep(marker.pixelSize, marker.pixelSize * 3.5, bodyPixels);

    marker.sprite.material.opacity = opacity;
    marker.sprite.visible = opacity > 0.01;

    if (marker.sprite.visible) {
        marker.sprite.scale.setScalar(marker.pixelSize / pixelsPerWorldUnit);
    }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}
