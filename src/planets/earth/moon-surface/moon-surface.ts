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
import {
    buildTerrain,
    regolithSunDirectionView,
    SHADOW_ONLY_LAYER,
    SHADOW_PROXY_RADIUS_M,
    type Terrain,
} from './terrain';
import { createTracks } from './tracks';
import { primeSiteSamples, sampleSite } from './site-samples';
import { createSky, SKY_ZOOM_FOV, SURFACE_FOV, type Sky, type SkyState } from './sky';
import { createWalker, type Walker } from './walk';
import { createDust } from './dust';
import { createArtefacts, type Artefacts } from './artefacts';
import { createObstacles } from './colliders';
import { createRover } from './rover';
import { createDriver, type Driver } from './drive';
import { DEFAULT_SITE, type LandingSite } from './sites';
import { quality } from '../../../quality';

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
 *
 * Stopped down by 1.4 when the ground stopped being Lambertian. `terrain.ts`'s
 * lunar-Lambert term brightens the average first-person view by about that much —
 * measured over twelve of them, across four Sun elevations and three directions of
 * look — so the same number comes back out here to leave the overall level where it
 * was. What the change actually buys is not brightness but *distribution*: the views
 * down-Sun brighten and the views into the Sun darken, which is the phase contrast
 * that Lambert had been flattening away.
 */
const SUNLIGHT_INTENSITY = 6.1;
/**
 * Bounce off the ground. Real, and the reason the shadowed side of a boulder is not
 * simply black in the Apollo photography — with nothing in the sky to scatter light,
 * every photon that reaches a shaded surface came off the regolith first. Lit from
 * below with a black sky above, which is the correct shape for that.
 *
 * Stopped down by the same 1.4 as the Sun, so the fill *ratio* is untouched. It has to
 * move with it: the photometric function is applied by multiplying `diffuseColor`,
 * which every light then sees, so the fills ride along with the Sun whether or not that
 * is strictly right for them. At 4% of the Sun's strength the error in doing so is well
 * under anything visible, and bounce off a rough surface is closer to Lommel-Seeliger
 * than to Lambert anyway.
 */
const BOUNCE_INTENSITY = 0.25;
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
const EARTHSHINE_INTENSITY = 0.32;

const SHADOW_MAP_SIZE = quality.shadowMapSize;
/** How far up-Sun the shadow camera sits. Must clear the tallest thing it can see. */
const SHADOW_DISTANCE_M = 900;

/**
 * Half-width of the shadow map's footprint — and it cannot be one number, because the
 * only thing that sets it is how low the Sun is.
 *
 * A shadow is as long as its caster is tall over the tangent of the Sun's altitude, and
 * on the Moon that spans four orders of magnitude across a single day: a 3 m mast
 * throws 3 m of shadow at noon and 170 m at one degree above the horizon. Sizing the
 * box for the worst case, which is what a fixed 120 m was doing, spends the whole map
 * on empty ground every time the Sun is up properly — 23 cm a texel when the shadows
 * being drawn are two metres long.
 *
 * So it tracks the Sun. Near field plus whatever the longest shadow needs, quantised so
 * the projection is not rebuilt every frame, and clamped at both ends. In practice it
 * sits at the floor for any Sun above about 8°, which is 10.7 cm a texel — better than
 * twice the resolution it used to have, exactly where the boulders you are standing
 * among are.
 */
const SHADOW_NEAR_EXTENT_M = 40;
/** Tallest thing that casts: the LRV's antenna mast, and the biggest boulders. */
const SHADOW_TALLEST_M = 3;
const SHADOW_MIN_EXTENT_M = 55;
const SHADOW_MAX_EXTENT_M = 240;
const SHADOW_EXTENT_STEP_M = 5;

/**
 * Below this the ground stops casting, and that is a fix rather than a limitation.
 *
 * One shadow texel spans `texel / tan(altitude)` of *depth* across a near-flat surface,
 * so at 3° the 11 cm texel covers 2 m of depth and the ground can only ever shadow
 * itself in stripes. No bias setting resolves that — enough to suppress the stripes is
 * enough to detach every shadow in the scene from the thing casting it.
 *
 * What matters is that this only afflicts surfaces nearly *parallel* to the light. A
 * boulder, the rover and a descent stage are not, so they go on casting their long
 * shadows perfectly well; all that is dropped is the ground's ability to shadow itself,
 * which at a grazing Sun is already carried by N·L — a crater wall turned away from the
 * Sun is dark because of its normal, not because something shadowed it. Shackleton, at
 * 89.9° south, spends its entire existence below this line and looks the better for it.
 */
const GROUND_SHADOW_MIN_ALTITUDE = MathUtils.degToRad(6);
/** How far either side of the light the depth range has to reach. */
const SHADOW_DEPTH_MARGIN_M = SHADOW_PROXY_RADIUS_M + 60;

/** Seconds for the field of view to travel between standing and the long lens. */
const ZOOM_SECONDS = 0.28;

/**
 * How close you have to be to climb aboard. Generous — the LRV is 3.1 m long and you
 * are aiming at it with a mouse.
 *
 * Exported because the chrome has to agree with it exactly: both the HUD's rover row
 * and the centre-screen prompt change what they say at the moment boarding becomes
 * possible, and a second copy of this number would put the offer on screen a step
 * before or after the key actually works.
 */
export const BOARDING_RANGE_M = 4.5;
/** Where the rover is set down relative to where you land, metres and radians. */
const ROVER_PARK_DISTANCE_M = 8;
const ROVER_PARK_BEARING_OFFSET = 0.38;
/** Parked broadside-on, so the first thing you see of it is its silhouette. */
const ROVER_PARK_HEADING_OFFSET = 1.85;

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
    readonly driver: Driver;
    readonly driving: boolean;
    /** Metres from the observer to the rover, however they are getting about. */
    readonly roverDistance: number;
    /** Board it if you are near enough, or step off it if you are on it. */
    toggleRover(): void;
    enter(site: LandingSite): void;
    exit(): void;
    /**
     * Hold still without leaving: the ground, the sky and the site all stay built and
     * the mode stays active, but nothing responds to the keyboard or the mouse.
     *
     * For while a dialog is up over the scene. A question that has not been answered
     * yet must not be answered by a rover that is still rolling.
     */
    suspend(): void;
    /** Hand control back to whichever of the two was driving. */
    resume(): void;
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
    sunLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    // Depth range fitted to what is actually in the box rather than left spanning the
    // whole distance to the light. The near plane used to sit at 1 m for a light 900 m
    // away, so 99.8% of the depth buffer covered empty space — and since `shadow.bias`
    // is in *normalised* depth, every unit of it bought four times more world-space
    // offset than it needed to, which is peter-panning paid for nothing.
    sunLight.shadow.camera.near = Math.max(1, SHADOW_DISTANCE_M - SHADOW_DEPTH_MARGIN_M);
    sunLight.shadow.camera.far = SHADOW_DISTANCE_M + SHADOW_DEPTH_MARGIN_M;
    // The ground casts through a decimated proxy that lives on its own layer — the
    // depth map is 10 cm a texel, so casting the full-resolution terrain into it is
    // eight times the triangles for the same shadow. Enabling the layer is what lets
    // the shadow camera see it; the colour camera still cannot, and `updateShadow`
    // turns it back off when the Sun gets too low for the ground to shadow itself.
    sunLight.shadow.camera.layers.enable(SHADOW_ONLY_LAYER);
    scene.add(sunLight);
    scene.add(sunLight.target);

    // Sky black, ground warm grey: all the fill light down here came off the regolith.
    const bounce = new HemisphereLight(0x000000, 0xb08d6a, BOUNCE_INTENSITY);
    scene.add(bounce);

    const earthLight = new DirectionalLight(0x9fc4ff, 0);
    scene.add(earthLight);
    scene.add(earthLight.target);

    // One dust system, shared by both ways of getting about — the grains do not care
    // what threw them, and a second buffer would only be a second draw call.
    const dust = createDust();
    scene.add(dust.object);

    // Likewise one track field, and for a stronger reason than the dust: boots and
    // wheels press into the *same ground*, so a rut driven across your own footprints
    // has to overwrite them in the one place both are stored.
    const tracks = createTracks();

    // Everything on this surface that is not the height field: the blocks, whatever was
    // left here, and the rover. One set, shared by both controllers, because a boot and a
    // wheel have to be stopped by the same lander for the same reason they have to stand
    // on the same ground.
    const obstacles = createObstacles();

    const walker = createWalker(camera, domElement, dust, tracks, obstacles);
    const rover = createRover();
    const driver = createDriver(rover, camera, domElement, dust, tracks, obstacles);
    scene.add(rover.object);

    let sky: Sky | null = null;
    let terrain: Terrain | null = null;
    let artefacts: Artefacts | null = null;
    let site = DEFAULT_SITE;
    let state: SkyState | null = null;
    let active = false;
    let fieldOfView = SURFACE_FOV;
    let shadowsConfigured = false;
    let zoomed = false;
    let driving = false;
    let suspended = false;
    /** Aim the first look somewhere worth looking, once the sky is known. */
    let needsFacing = false;

    const shadowTarget = new Vector3();
    const shadowRight = new Vector3();
    const shadowUp = new Vector3();
    const WORLD_UP = new Vector3(0, 1, 0);
    let shadowExtent = 0;
    const dismount = new Vector3();
    const dishAim = new Vector3();
    const roverToLocal = new Quaternion();
    const viewDirection = new Vector3();
    // The grain size is converted to pixels in the vertex shader, which needs the
    // viewport height to do it — so the mode has to remember what it was resized to.
    let viewportHeight = 800;

    // The two mode keys live here rather than in either controller, because each of
    // them concerns *both*: Z is the same long lens whether you are standing or
    // driving, and R is the handover between them.
    function onKeyDown(event: KeyboardEvent): void {
        // The two controllers check their own `enabled` flag; this handler is the
        // mode's rather than either of theirs, so it has to check the mode's.
        if (suspended) return;
        const tag = (event.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (event.code === 'KeyZ') zoomed = !zoomed;
        if (event.code === 'KeyR') surface.toggleRover();
    }

    /**
     * Point the shadow camera at the observer and size it for the Sun.
     *
     * Three things move together here and they are not independent: the box shrinks
     * when shadows are short, which makes the texels finer, which lets the bias come
     * down, which is what stops shadows detaching from what casts them.
     */
    function updateShadow(observer: Vector3, altitude: number, sunDirection: Vector3): void {
        const reach = SHADOW_TALLEST_M / Math.max(Math.tan(Math.max(altitude, 1e-3)), 1e-3);
        const extent = MathUtils.clamp(
            Math.round((SHADOW_NEAR_EXTENT_M + reach) / SHADOW_EXTENT_STEP_M) *
                SHADOW_EXTENT_STEP_M,
            SHADOW_MIN_EXTENT_M,
            SHADOW_MAX_EXTENT_M
        );
        if (extent !== shadowExtent) {
            shadowExtent = extent;
            const box = sunLight.shadow.camera;
            box.left = -extent;
            box.right = extent;
            box.top = extent;
            box.bottom = -extent;
            box.updateProjectionMatrix();
        }

        const texel = (2 * extent) / SHADOW_MAP_SIZE;

        // Snapped to whole texels *in the light's own frame*, because the box follows
        // the observer and an unsnapped one slides under the shadow map continuously:
        // every edge in the scene crawls and fizzes as you walk, which is far more
        // conspicuous than the aliasing it is made of. The basis has to be the one
        // three.js will build — `Matrix4.lookAt` takes x = up x z and y = z x x, with
        // z the direction from the target to the light — or the snap is to the wrong
        // grid and does nothing at all.
        shadowTarget.set(observer.x, 0, observer.z);
        shadowRight.crossVectors(WORLD_UP, sunDirection);
        // Sun at the zenith, where the cross product collapses. Any perpendicular will
        // do; the shadows are directly underneath everything and a texel wide.
        if (shadowRight.lengthSq() < 1e-8) shadowRight.set(1, 0, 0);
        shadowRight.normalize();
        shadowUp.crossVectors(sunDirection, shadowRight).normalize();

        const alongRight = shadowTarget.dot(shadowRight);
        const alongUp = shadowTarget.dot(shadowUp);
        shadowTarget
            .addScaledVector(shadowRight, Math.round(alongRight / texel) * texel - alongRight)
            .addScaledVector(shadowUp, Math.round(alongUp / texel) * texel - alongUp);

        sunLight.target.position.copy(shadowTarget);
        sunLight.position
            .copy(sunDirection)
            .multiplyScalar(SHADOW_DISTANCE_M)
            .add(shadowTarget);

        // Derived rather than dialled in. The depth across one texel of a surface lying
        // at `altitude` to the light is texel/tan(altitude), and that — no more — is
        // what the bias has to cover. Below the ground-casting cut-off there is nothing
        // left that is anywhere near parallel to the light, so it stops growing.
        const grazing = Math.max(Math.tan(altitude), Math.tan(GROUND_SHADOW_MIN_ALTITUDE));
        const depthRange = sunLight.shadow.camera.far - sunLight.shadow.camera.near;
        sunLight.shadow.bias = -MathUtils.clamp(texel / grazing, 0.05, 0.35) / depthRange;
        sunLight.shadow.normalBias = MathUtils.clamp(texel * 1.5, 0.05, 0.3);

        if (altitude > GROUND_SHADOW_MIN_ALTITUDE) {
            sunLight.shadow.camera.layers.enable(SHADOW_ONLY_LAYER);
        } else {
            sunLight.shadow.camera.layers.disable(SHADOW_ONLY_LAYER);
        }
    }

    function teardown(): void {
        obstacles.clear();
        if (terrain) {
            scene.remove(terrain.ground);
            scene.remove(terrain.boulders);
            terrain.dispose();
            terrain = null;
        }
        if (artefacts) {
            scene.remove(artefacts.object);
            artefacts.dispose();
            artefacts = null;
        }
        if (sky) {
            sky.dispose();
            sky = null;
        }
    }

    function build(next: LandingSite): void {
        teardown();
        site = next;

        // Untouched ground. Nobody has walked on Copernicus, and arriving at a site
        // still carrying the last one's footprints would be the loudest possible way of
        // saying so.
        tracks.reset(renderer);

        const sample = sampleSite(site.latitude, site.longitude);
        terrain = buildTerrain(site, sample, tracks);
        // Thrown grains are the same material as the ground they came off, so a landing
        // on Tycho's bright ejecta throws bright dust and one on mare basalt does not.
        dust.setAlbedo(sample.albedo);
        dust.reset();
        scene.add(terrain.ground);
        scene.add(terrain.boulders);

        // Only where somebody has actually been, which is two of the six. Everywhere
        // else this returns null and nothing is built at all.
        artefacts = createArtefacts(site, terrain.heightAt);
        if (artefacts) scene.add(artefacts.object);

        // The solid things, in one flat list. Fixed for the life of the site — the
        // terrain and the artefacts are both rebuilt from scratch on every landing, so
        // there is nothing here that can go stale without this line being reached again.
        obstacles.set(
            artefacts ? [...terrain.obstacles, ...artefacts.obstacles] : terrain.obstacles
        );

        sky = createSky(site);
        // The starfield comes along, at whatever scale this scene needs. `add` detaches
        // it from wherever it was, which is how it gets away with being a singleton.
        stars.scale.setScalar(STAR_SCALE);
        stars.position.set(0, 0, 0);
        sky.scene.add(stars);

        walker.setGround(terrain.heightAt);
        driver.setGround(terrain.heightAt);
        // Provisional: the real spot needs the sky, because the rover is placed relative
        // to wherever the first look ends up pointing, and which way that is depends on
        // where Earth turns out to be. Parked at the right *distance* in an arbitrary
        // direction rather than at the origin, because the origin is where the observer
        // is standing — and the rover is a solid object, so setting it down on top of
        // them shoves them a clear two metres off the landing point on the first frame.
        driver.park(0, -ROVER_PARK_DISTANCE_M, 0);
        driving = false;
        state = null;
        needsFacing = true;
    }

    /**
     * How far the walker is from the rover. Horizontal only — the vertical component
     * is never the question — and always measured from the walker, whose position is
     * simply left where they got on from while they are driving.
     */
    function roverDistance(): number {
        return Math.hypot(
            walker.position.x - driver.position.x,
            walker.position.z - driver.position.z
        );
    }

    // Named, because `onKeyDown` above needs to reach `toggleRover` and the two are
    // mutually recursive by nature: the key handler is the mode's, not either
    // controller's.
    const surface: MoonSurface = {
        get active() {
            return active;
        },
        get site() {
            return site;
        },
        get state() {
            return state;
        },
        get driving() {
            return driving;
        },
        get roverDistance() {
            return roverDistance();
        },
        walker,
        driver,

        toggleRover() {
            if (!active) return;

            if (driving) {
                // Step off on the left, past the wheel, and turn to look back at it.
                // Clear of the vehicle, not beside it: the LRV is 1.83 m across
                // the wheels, so anything under about 2.5 m puts the camera inside its
                // own fender.
                dismount.set(-3.1, 0, 0.5).applyQuaternion(rover.object.quaternion);
                driver.disable();
                driving = false;
                walker.placeAt(driver.position.x + dismount.x, driver.position.z + dismount.z);
                walker.enable();
                // Azimuth of the way back to the rover: the scene points -Z north, so
                // this is the same convention the sky read-outs use.
                walker.face(Math.atan2(-dismount.x, dismount.z));
                return;
            }

            // Out of reach is simply out of reach — there is no summoning it. The
            // read-out says how far, which on foot at 1.1 m/s is the useful number.
            if (roverDistance() > BOARDING_RANGE_M) return;

            walker.disable();
            driver.enable();
            driving = true;
        },

        enter(next) {
            if (active) {
                this.landAt(next);
                return;
            }

            window.addEventListener('keydown', onKeyDown);

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
            zoomed = false;
            suspended = false;
            active = true;
        },

        landAt(next) {
            build(next);
            if (active) walker.enable();
        },

        suspend() {
            if (!active || suspended) return;
            suspended = true;
            // Both, unconditionally: only one of the two was live anyway, and
            // `disable()` is what clears the held keys, drops the velocity to zero and
            // lets go of a look-around drag that was in progress.
            walker.disable();
            driver.disable();
        },

        resume() {
            if (!active || !suspended) return;
            suspended = false;
            // `driving` is untouched by suspending, so you come back to the same seat,
            // in the same place, facing the same way. Two things do reset, both from
            // the controllers' own `enable()`: the rover comes back stopped rather than
            // coasting — the parking brake, which is what the crews pulled at every
            // stop and the right answer for a vehicle nobody was watching — and the
            // driver's free-look re-centres over the bonnet.
            if (driving) driver.enable();
            else walker.enable();
        },

        exit() {
            if (!active) return;
            active = false;
            suspended = false;
            window.removeEventListener('keydown', onKeyDown);
            walker.disable();
            driver.disable();
            driving = false;
            dust.reset();

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
            const targetFov = zoomed ? SKY_ZOOM_FOV : SURFACE_FOV;
            const blend = 1 - Math.exp(-realDeltaSeconds / ZOOM_SECONDS);
            fieldOfView += (targetFov - fieldOfView) * blend;

            if (driving) {
                driver.update(realDeltaSeconds, fieldOfView);
            } else {
                walker.update(realDeltaSeconds, fieldOfView, zoomed);
                // Still called while parked: it is what settles the rover onto the
                // ground under its own four wheels, which has to keep happening or a
                // vehicle you walked away from would sit at whatever attitude it had
                // when you got out of it.
                driver.update(realDeltaSeconds, fieldOfView);
            }
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
                // Somewhere worth looking. At Tranquility Base and Hadley that is the
                // lander — you did not come here for the view — and everywhere else it
                // is Earth, or the Sun on the far side where there is no Earth to find.
                let facing: number;
                let pitch: number;
                if (artefacts) {
                    const { x, z } = artefacts.landerPosition;
                    facing = Math.atan2(x - walker.position.x, -(z - walker.position.z));
                    pitch = 0;
                } else if (state.earthVisible) {
                    facing = state.earthAzimuth;
                    pitch = state.earthAltitude;
                } else {
                    facing = state.sunAzimuth;
                    pitch = state.sunAltitude;
                }
                walker.face(facing, pitch);
                // And the rover goes where it will be seen: off to one side of that
                // first look, turned broadside so it reads as a vehicle rather than as
                // a shape. Parked here rather than in `build` because until the sky has
                // been evaluated there is no telling which way "in front" is.
                const bearing = facing + ROVER_PARK_BEARING_OFFSET;
                driver.park(
                    walker.position.x + Math.sin(bearing) * ROVER_PARK_DISTANCE_M,
                    walker.position.z - Math.cos(bearing) * ROVER_PARK_DISTANCE_M,
                    bearing + ROVER_PARK_HEADING_OFFSET
                );
                walker.update(0, fieldOfView, zoomed);
                camera.updateMatrixWorld();
                sky.camera.quaternion.copy(camera.quaternion);
                state = sky.update(context);
            }

            // The antenna follows Earth, which is what the crews spent part of every
            // stop doing by hand. Earth's direction is known in the *scene* frame, and
            // the dish hangs off a vehicle that is pitched and rolled by the ground
            // under its wheels, so it has to be carried into the rover's own frame
            // first — otherwise it would swing away from Earth every time you crossed
            // a crater rim.
            if (state.earthVisible) {
                roverToLocal.copy(rover.object.quaternion).invert();
                rover.aimDish(dishAim.copy(state.earthDirection).applyQuaternion(roverToLocal));
            } else {
                rover.aimDish(null);
            }

            // Dust is stepped after the controllers, because they are what emits into
            // it, and its whole per-frame cost is the four uniforms below — every grain
            // in flight is evaluated on the GPU from its launch conditions.
            camera.getWorldDirection(viewDirection);
            dust.update(realDeltaSeconds, {
                sunAltitude: state.sunAltitude,
                sunDirection: state.sunDirection,
                viewDirection,
                viewportHeight,
                fieldOfView: camera.fov,
            });

            // --- lights ---
            const observer = driving ? driver.position : walker.position;
            updateShadow(observer, state.sunAltitude, state.sunDirection);
            // Below the horizon is below the horizon. Without this the Sun would go on
            // lighting the ground from underneath through the whole lunar night.
            sunLight.intensity = state.sunAltitude > 0 ? SUNLIGHT_INTENSITY : 0;
            sunLight.castShadow = state.sunAltitude > 0;

            // Bounce is light off the ground, so it goes out with the Sun.
            bounce.intensity = state.sunAltitude > 0 ? BOUNCE_INTENSITY : 0.02;

            earthLight.target.position.set(observer.x, 0, observer.z);
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

            // Whatever was stamped this frame, folded into the field before anything
            // samples it. Costs one draw of a handful of quads while you are moving and
            // nothing whatever while you are not.
            tracks.commit(renderer);

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
            viewportHeight = height;
        },
    };

    return surface;
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
