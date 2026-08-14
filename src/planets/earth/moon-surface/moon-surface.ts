import {
    DirectionalLight,
    HemisphereLight,
    MathUtils,
    Object3D,
    PCFShadowMap,
    PerspectiveCamera,
    Quaternion,
    Scene,
    Vector3,
    WebGLRenderer,
} from 'three';
import { MOON_HORIZON_M } from '../../../constants/planets.const';
import { buildTerrain, regolithSunDirectionView, type Terrain } from './terrain';
import { primeSiteSamples, sampleSite } from './site-samples';
import { createSky, SKY_ZOOM_FOV, SURFACE_FOV, type Sky, type SkyState } from './sky';
import { createWalker, type Walker } from './walk';
import { DEFAULT_SITE, type LandingSite } from './sites';

/**
 * Standing on the Moon.
 *
 * A mode, not an object in the scene — while it is active it *replaces* the
 * solar-system render rather than adding to it, which is the single reason this is
 * cheaper to draw than the view it interrupts. Five draw calls: the ground, the
 * boulders, Earth, the Sun, and the borrowed starfield.
 *
 * The orbital model keeps running underneath regardless, because it has to: the Sun's
 * position in this sky, Earth's position and Earth's phase are all read straight out
 * of it every frame. Turn the time multiplier up and the shadows sweep across the
 * crater field at the real rate — the lunar solar day is 29.53 of ours, so the Sun
 * crawls a mere half-degree an hour and a landing at dawn stays at dawn for a week.
 *
 * ## Light, and why there is so little of it
 *
 * There is no atmosphere, and that is nearly the whole aesthetic:
 *
 *  - The sky is black at noon. Ambient is as close to nothing as makes no difference;
 *    the only fill is light bounced off the regolith, which a hemisphere light lit
 *    from *below* gets the shape of exactly right.
 *  - Shadows have hard edges, because the only softening is the Sun's own 0.53° of
 *    angular width.
 *  - The far side of the terminator is genuinely black, so the night side is lit by
 *    earthshine and nothing else — the one place here where the numbers are traded
 *    for legibility, and the comment on `EARTHSHINE_INTENSITY` says by how much.
 */

/**
 * Sunlight. The albedo underneath it is real — 0.12 geometric, converted for a
 * diffuse material — so this is the *exposure*, and it is no more arbitrary than the
 * f-stop on the Hasselblads the crews actually carried. Everything on the surface is
 * lit by one light of one strength; the choice is only how bright to develop it.
 */
const SUNLIGHT_INTENSITY = 6.0;
/**
 * Bounce off the ground. Real, and the reason the shadowed side of a boulder is not
 * simply black in the Apollo photography — with nothing in the sky to scatter light,
 * every photon that reaches a shaded surface came off the regolith first. Lit from
 * below with a black sky above, which is the correct shape for that.
 */
const BOUNCE_INTENSITY = 0.35;
/**
 * Earthshine, which is the only light on the near side at night.
 *
 * The one number here that is deliberately not to scale, so it is worth being exact
 * about the size of the lie. A full Earth throws roughly 0.2 lux onto the Moon
 * against sunlight's 133,000 — a ratio of 1.5 x 10⁻⁶, about twenty stops. Rendered at
 * that ratio against `SUNLIGHT_INTENSITY` it would be 9 x 10⁻⁶ and the screen would
 * be black.
 *
 * What it should be measured against is not the daylight exposure but a dark-adapted
 * eye, which recovers most of those stops: earthshine on the Moon is some fifty times
 * brighter than full moonlight is here, and full moonlight is enough to walk by. This
 * sits a thirteenth of the way below the sunlit exposure, which puts the ground at a
 * dim, navigable blue-grey — about what standing there would actually look like once
 * your eyes had adjusted, and nothing like what a camera set for noon would record.
 *
 * Scaled by Earth's phase and cut off when Earth is down, so the far-side sites stay
 * as black as they really are.
 */
const EARTHSHINE_INTENSITY = 0.45;

/**
 * Half-width of the shadow map's footprint, metres. Only the near field: at 1024²
 * this resolves 23 cm, which carries the boulders and the crater rims you are
 * standing among. Further out the low Sun and the surface normals do the work — a
 * crater wall turned away from the Sun is dark because of its normal, not because
 * something shadowed it.
 */
const SHADOW_EXTENT_M = 120;
/** How far up-Sun the shadow camera sits. Must clear the tallest thing it can see. */
const SHADOW_DISTANCE_M = 900;

/** Seconds for the field of view to travel between standing and the long lens. */
const ZOOM_SECONDS = 0.28;

export interface MoonSurfaceOptions {
    renderer: WebGLRenderer;
    domElement: HTMLElement;
    /** The main scene's starfield, borrowed while landed and handed back on exit. */
    stars: Object3D;
    /** Where to put it back. */
    starsHome: Scene;
}

export interface MoonSurfaceContext {
    moonPosition: Vector3;
    moonQuaternion: Quaternion;
    earthPosition: Vector3;
    earthQuaternion: Quaternion;
}

export interface MoonSurface {
    readonly active: boolean;
    readonly site: LandingSite;
    readonly state: SkyState | null;
    readonly walker: Walker;
    enter(site: LandingSite): void;
    exit(): void;
    /** Move to another site without leaving the surface. */
    landAt(site: LandingSite): void;
    update(realDeltaSeconds: number, context: MoonSurfaceContext): void;
    render(): void;
    resize(width: number, height: number): void;
}

/**
 * The starfield is built for a scene measured in Earth radii and this one is measured
 * in metres, so it has to be pushed out to sit behind Earth at 100 km and in front of
 * the sky camera's far plane. Nothing about it changes in the process — the stars are
 * `sizeAttenuation: false`, so they hold their pixel size at any distance.
 */
const STAR_SCALE = 400;

export function createMoonSurface(options: MoonSurfaceOptions): MoonSurface {
    const { renderer, domElement, stars, starsHome } = options;

    const scene = new Scene();
    // Far plane just past the patch; near plane close enough to see your own boots.
    // Both are possible at once here only because the sky is a separate pass — a
    // single buffer spanning 0.1 m to the star dome would have no precision left.
    const camera = new PerspectiveCamera(SURFACE_FOV, 1, 0.1, 8000);

    const sunLight = new DirectionalLight(0xfff6e8, SUNLIGHT_INTENSITY);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.left = -SHADOW_EXTENT_M;
    sunLight.shadow.camera.right = SHADOW_EXTENT_M;
    sunLight.shadow.camera.top = SHADOW_EXTENT_M;
    sunLight.shadow.camera.bottom = -SHADOW_EXTENT_M;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = SHADOW_DISTANCE_M * 2;
    // Grazing light on a near-flat surface is the worst case for shadow acne, and on
    // the Moon the light is grazing most of the time.
    sunLight.shadow.bias = -0.0006;
    sunLight.shadow.normalBias = 0.05;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // Sky black, ground warm grey: all the fill light down here came off the regolith.
    const bounce = new HemisphereLight(0x000000, 0xb08d6a, BOUNCE_INTENSITY);
    scene.add(bounce);

    const earthLight = new DirectionalLight(0x9fc4ff, 0);
    scene.add(earthLight);
    scene.add(earthLight.target);

    const walker = createWalker(camera, domElement);

    let sky: Sky | null = null;
    let terrain: Terrain | null = null;
    let site = DEFAULT_SITE;
    let state: SkyState | null = null;
    let active = false;
    let fieldOfView = SURFACE_FOV;
    let shadowsConfigured = false;
    /** Aim the first look somewhere worth looking, once the sky is known. */
    let needsFacing = false;

    const sunPosition = new Vector3();

    function teardown(): void {
        if (terrain) {
            scene.remove(terrain.ground);
            scene.remove(terrain.boulders);
            terrain.dispose();
            terrain = null;
        }
        if (sky) {
            sky.dispose();
            sky = null;
        }
    }

    function build(next: LandingSite): void {
        teardown();
        site = next;

        terrain = buildTerrain(site, sampleSite(site.latitude, site.longitude));
        scene.add(terrain.ground);
        scene.add(terrain.boulders);

        sky = createSky(site);
        // The starfield comes along, at whatever scale this scene needs. `add` detaches
        // it from wherever it was, which is how it gets away with being a singleton.
        stars.scale.setScalar(STAR_SCALE);
        stars.position.set(0, 0, 0);
        sky.scene.add(stars);

        walker.setGround(terrain.heightAt);
        state = null;
        needsFacing = true;
    }

    return {
        get active() {
            return active;
        },
        get site() {
            return site;
        },
        get state() {
            return state;
        },
        walker,

        enter(next) {
            if (active) {
                this.landAt(next);
                return;
            }

            if (!shadowsConfigured) {
                // Hard-edged, because the only thing softening a lunar shadow is the
                // Sun's own half-degree of width. The soft variant would be both
                // slower and wrong.
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.type = PCFShadowMap;
                shadowsConfigured = true;
            }

            build(next);
            walker.enable();
            fieldOfView = SURFACE_FOV;
            active = true;
        },

        landAt(next) {
            build(next);
            if (active) walker.enable();
        },

        exit() {
            if (!active) return;
            active = false;
            walker.disable();

            // Hand the stars back the way they were found.
            stars.scale.setScalar(1);
            starsHome.add(stars);

            teardown();
            state = null;
            renderer.shadowMap.enabled = false;
        },

        update(realDeltaSeconds, context) {
            if (!active || !sky || !terrain) return;

            // Real seconds, never simulated ones: walking has to work while the
            // simulation is paused, and picking a larger time multiplier to watch the
            // shadows move must not also make the astronaut sprint.
            const targetFov = walker.zoomed ? SKY_ZOOM_FOV : SURFACE_FOV;
            const blend = 1 - Math.exp(-realDeltaSeconds / ZOOM_SECONDS);
            fieldOfView += (targetFov - fieldOfView) * blend;

            walker.update(realDeltaSeconds, fieldOfView);
            camera.updateMatrixWorld();

            // The sky rides the same orientation from the origin — it is the same view
            // through a different pair of clipping planes.
            sky.camera.quaternion.copy(camera.quaternion);
            sky.camera.fov = camera.fov;
            sky.camera.aspect = camera.aspect;
            sky.camera.updateProjectionMatrix();

            state = sky.update(context);

            // The sky is only known after the first update, so the opening view is
            // aimed here rather than at build time. Earth if there is one — it is what
            // anyone would turn to look at — and the Sun on the far side, where there
            // is nothing else to orient by.
            if (needsFacing) {
                needsFacing = false;
                walker.face(
                    state.earthVisible ? state.earthAzimuth : state.sunAzimuth,
                    state.earthVisible ? state.earthAltitude : state.sunAltitude
                );
                walker.update(0, fieldOfView);
                camera.updateMatrixWorld();
                sky.camera.quaternion.copy(camera.quaternion);
                state = sky.update(context);
            }

            // --- lights ---
            sunLight.target.position.set(walker.position.x, 0, walker.position.z);
            sunPosition
                .copy(state.sunDirection)
                .multiplyScalar(SHADOW_DISTANCE_M)
                .add(sunLight.target.position);
            sunLight.position.copy(sunPosition);
            // Below the horizon is below the horizon. Without this the Sun would go on
            // lighting the ground from underneath through the whole lunar night.
            sunLight.intensity = state.sunAltitude > 0 ? SUNLIGHT_INTENSITY : 0;
            sunLight.castShadow = state.sunAltitude > 0;

            // Bounce is light off the ground, so it goes out with the Sun.
            bounce.intensity = state.sunAltitude > 0 ? BOUNCE_INTENSITY : 0.02;

            earthLight.target.position.set(walker.position.x, 0, walker.position.z);
            earthLight.position
                .copy(state.earthDirection)
                .multiplyScalar(SHADOW_DISTANCE_M)
                .add(earthLight.target.position);
            earthLight.intensity = state.earthVisible
                ? EARTHSHINE_INTENSITY *
                  state.earthPhase *
                  MathUtils.clamp(Math.sin(state.earthAltitude) * 4, 0, 1)
                : 0;

            // The opposition surge needs the Sun where the shader can compare it
            // against `vViewPosition`, which is view space.
            regolithSunDirectionView
                .copy(state.sunDirection)
                .transformDirection(camera.matrixWorldInverse);
        },

        render() {
            if (!active || !sky) return;

            const previousAutoClear = renderer.autoClear;
            renderer.autoClear = false;
            // One clear for the whole frame, to black — which is also the sky, since
            // there is no atmosphere to paint anything else onto.
            renderer.clear();
            renderer.render(sky.scene, sky.camera);
            // The ground goes down over the top with a fresh depth buffer, so it hides
            // Earth exactly when Earth is below the horizon and never fights it for
            // depth precision.
            renderer.clearDepth();
            renderer.render(scene, camera);
            renderer.autoClear = previousAutoClear;
        },

        resize(width, height) {
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        },
    };
}

/**
 * Decode the lunar maps ahead of anyone asking for them.
 *
 * Kicked off at idle, because it is several megabytes of decode that nothing needs
 * until someone presses Land, and it must not land on the intro fly-in. Safari has no
 * `requestIdleCallback`, so it gets a timer instead — by which point the opening
 * animation is long finished either way.
 */
export function prepareMoonSurface(): void {
    const start = () => void primeSiteSamples();
    const idle = (window as unknown as { requestIdleCallback?: (callback: () => void) => void })
        .requestIdleCallback;
    if (idle) idle(start);
    else window.setTimeout(start, 3000);
}

export { MOON_HORIZON_M };
