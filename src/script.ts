import { PerspectiveCamera, Scene, WebGLRenderer, Vector3, Object3D, Raycaster, Vector2, AmbientLight, ACESFilmicToneMapping, MathUtils } from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { earth, earthSunDirectionView } from './planets/earth/earth';
import { clouds } from './planets/earth/clouds';
import { atmosphere, atmosphereSunDirection } from './planets/earth/atmosphere';
import { sun, sunLight, updateSun } from './sun';
import { backgroundTexture } from './background/background';
import { iss, updateISSPosition, issCurrentPos, issTargetPos, issLastUpdateTime } from './iss';
import { moon, moonTidalRotation } from './planets/earth/moon';
import { ANALEMMA_RADIUS, analemmaAnchor, analemmaLine } from './planets/earth/analemma';
import { mars } from './planets/mars/mars';
import { deimos, phobos } from './planets/mars/moons';
import { marsAtmosphere, marsAtmosphereSunDirection } from './planets/mars/atmosphere';
import { advanceClock, getSimulatedDate, setPaused, setTimeSpeed } from './simulation';
import { createBodyMarker, updateBodyMarker } from './body-marker';
import { createFreeFlight } from './free-flight';
import {
    DEIMOS,
    EARTH_OBLIQUITY,
    earthOrbitPosition,
    earthSpinAngle,
    marsOrbitPosition,
    marsSpinAngle,
    MARS_AXIS_ORIENTATION,
    moonEclipticLongitude,
    moonOrbitPosition,
    PHOBOS,
    satelliteState,
} from './orbits';
import {
    ISS_UPDATE_INTERVAL,
    CLOUD_ANGULAR_VELOCITY_SCALE,
    DEIMOS_ORBIT_RADIUS,
    DEIMOS_RADIUS,
    EARTH_RADIUS_KM,
    MARS_RADIUS,
    MOON_ORBIT_INCLINATION_DEG,
    MOON_RADIUS,
    EARTH_ORBIT_RADIUS,
    PHOBOS_ORBIT_RADIUS,
    PHOBOS_RADIUS,
    SUN_RADIUS,
} from './constants/planets.const';

export function initScene() {
    const container = document.getElementById('app') as HTMLElement;

    if (!container) {
        return;
    }

    // If React remounts or HMR calls init again, clear previous renderers.
    container.innerHTML = '';

    const getSize = () => {
        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;
        return { width, height };
    };

    const { width: initialWidth, height: initialHeight } = getSize();

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setSize(initialWidth, initialHeight);
    // Fragment cost is quadratic in pixel ratio, and this scene spends most of a
    // frame in fragment shaders: several transparent, additively blended shells
    // (the atmospheres, the corona, the clouds) overdraw the same pixels more than
    // once with no early-Z rejection, since blending needs depth writes off. A
    // Retina display's devicePixelRatio of 2 was asking for that four times over
    // for a sharpness difference that is barely visible. 1.5 keeps it close to
    // native while cutting the fragment workload roughly in half.
    const MAX_PIXEL_RATIO = 1.5;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    // Filmic tone mapping keeps the sunlit face from clipping to flat white where
    // deserts and cloud tops are brightest.
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    // 2D label renderer (for moon label)
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(initialWidth, initialHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.left = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(labelRenderer.domElement);

    const scene = new Scene();

    // The orbit is 23,481 units in radius now, so the far plane has to clear the
    // camera's own pull-back plus the width of the system. Depth precision is set by
    // the *near* plane, not this, so a far plane this large costs nothing:
    // resolution goes as z^2/(near * 2^24), which is unchanged.
    const camera = new PerspectiveCamera(75, initialWidth / initialHeight, 0.1, 400000);

    // Scene graph. The Sun is at the world origin; each planet hangs off a single
    // moving node so its orbit only has to be applied in one place.
    //
    //   scene
    //   ├── sun
    //   ├── earthSystem            <- moves along the orbit
    //   │   ├── earthTilt          <- fixed 23.44° lean, never follows the orbit
    //   │   │   ├── earth          <- spins inside the tilt
    //   │   │   ├── clouds
    //   │   │   └── iss
    //   │   ├── atmosphere
    //   │   └── moonOrbitPlane     <- inclined to the ecliptic, not to the equator
    //   │       └── moon
    //   └── marsSystem             <- same shape, one orbit further out
    //       ├── marsAxis           <- fixed IAU pole direction, likewise never touched
    //       │   ├── mars           <- spins inside the tilt
    //       │   ├── phobos         <- in Mars's *equatorial* plane, not the ecliptic
    //       │   └── deimos
    //       └── marsAtmosphere
    const earthSystem = new Object3D();
    const earthTilt = new Object3D();
    // The tilt is applied here, above the spin, and is never touched again. That is
    // what keeps the axis pointing at a fixed direction in space while Earth goes
    // round — which is the whole mechanism behind the seasons.
    earthTilt.rotation.x = -EARTH_OBLIQUITY;

    const moonOrbitPlane = new Object3D();
    moonOrbitPlane.rotation.x = (MOON_ORBIT_INCLINATION_DEG * Math.PI) / 180;

    earthTilt.add(earth);
    earthTilt.add(clouds);
    earthTilt.add(iss);
    // Children of `earth` itself, not of `earthTilt`: they need to inherit the
    // mesh's own per-frame spin, since the loop's shape was built in that spin's
    // *un-rotated* local frame and relies on the scene graph to carry it into world
    // space — see the comment in analemma.ts for why that trick is what makes the
    // curve hold still relative to the ground point instead of sliding around it.
    earth.add(analemmaLine);
    earth.add(analemmaAnchor);
    moonOrbitPlane.add(moon);
    earthSystem.add(earthTilt);
    earthSystem.add(atmosphere);
    earthSystem.add(moonOrbitPlane);

    // Mars is built exactly like the Earth, for exactly the same reason: the axis
    // node is set once from the IAU pole and then left alone, so Mars leans a fixed
    // way in space and gets its own seasons out of the geometry. Earth's tilt is a
    // single rotation about X because the scene's frame is *defined* by Earth's
    // orbit; Mars's has to be a full orientation, since its pole points somewhere
    // that has nothing to do with our equinox.
    const marsSystem = new Object3D();
    const marsAxis = new Object3D();
    marsAxis.quaternion.copy(MARS_AXIS_ORIENTATION);

    marsAxis.add(mars);
    // Phobos and Deimos hang off the axis node rather than the system node, which is
    // the one structural thing that separates them from the Moon: Mars's equatorial
    // bulge, not the Sun, is what rules their orbits, so they lie in the plane of
    // the equator above them and inherit its fixed lean. Their planes also precess,
    // so the tilt is applied per frame in `satelliteState` rather than by a pivot.
    marsAxis.add(phobos);
    marsAxis.add(deimos);
    marsSystem.add(marsAxis);
    marsSystem.add(marsAtmosphere);

    scene.add(earthSystem);
    scene.add(marsSystem);
    scene.add(sun);
    scene.add(backgroundTexture);

    // A point light sitting inside the Sun, so every body is lit from the direction
    // the Sun really is — and dimmed by however far out it orbits.
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);
    // Just enough fill to keep the night side from crushing to pure black — real
    // night sides catch starlight and, for the Moon, earthshine. Any more than this
    // and the terminator stops reading.
    scene.add(new AmbientLight(0x2a3a55, 0.05));

    // Body labels (CSS2D). Each fades out once the camera is parked on that body,
    // where the label stops informing and starts obstructing.
    function createLabel(text: string, host: Object3D, height: number) {
        // The chip is offset in *screen* pixels, not world units. A world-space
        // offset shrinks with distance, so at solar-system range the label collapsed
        // onto the body and its opaque background hid the very thing it labels.
        const anchor = document.createElement('div');
        anchor.style.position = 'relative';
        anchor.style.pointerEvents = 'none';

        const element = document.createElement('div');
        element.textContent = text;
        element.style.position = 'absolute';
        element.style.left = '50%';
        element.style.bottom = '12px';
        element.style.transform = 'translateX(-50%)';
        element.style.whiteSpace = 'nowrap';
        element.style.color = 'white';
        element.style.fontSize = '14px';
        element.style.padding = '2px 6px';
        element.style.background = 'rgba(0, 0, 0, 0.45)';
        element.style.borderRadius = '4px';
        element.style.opacity = '0';
        element.style.transition = 'opacity 0.1s linear';
        element.style.pointerEvents = 'none';
        anchor.appendChild(element);

        const object = new CSS2DObject(anchor);
        object.position.set(0, height, 0);
        host.add(object);
        return { element, object };
    }

    // `hideBeyond` drops a label once it stops meaning anything: at solar-system
    // range Earth and the Moon collapse into the same pixel, so two overlapping tags
    // are just noise.
    const labels = [
        { ...createLabel('Earth', earthSystem, 1.25), body: earthSystem, radius: 1, hideBeyond: Infinity },
        { ...createLabel('Moon', moon, 0.18), body: moon, radius: MOON_RADIUS, hideBeyond: 400 },
        { ...createLabel('Sun', sun, SUN_RADIUS * 1.15), body: sun, radius: SUN_RADIUS, hideBeyond: Infinity },
        { ...createLabel('Mars', marsSystem, MARS_RADIUS * 1.25), body: marsSystem, radius: MARS_RADIUS, hideBeyond: Infinity },
        // Scaled from the Moon's cutoff by orbit radius, so each label survives to
        // roughly the same *apparent* separation from its planet before the two
        // chips would start sitting on top of each other.
        { ...createLabel('Phobos', phobos, PHOBOS_RADIUS * 2), body: phobos, radius: PHOBOS_RADIUS, hideBeyond: 10 },
        { ...createLabel('Deimos', deimos, DEIMOS_RADIUS * 2), body: deimos, radius: DEIMOS_RADIUS, hideBeyond: 24 },
        // A local Earth-surface feature, not a findable body — meaningful only once
        // you're already close, so this gets a short `hideBeyond` like the ISS's
        // framing rather than the "visible across the whole system" bodies above.
        { ...createLabel('Analemma', analemmaAnchor, 0.05), body: analemmaAnchor, radius: ANALEMMA_RADIUS, hideBeyond: 15 },
    ];

    // Distance markers so the planets stay findable once the whole system is in
    // frame and they are all well under a pixel across.
    // The Sun needs one too: at a true AU its disc is only ~5px from Earth and ~3px
    // from the system view, so without this the brightest object in the scene reads
    // as a dim speck.
    const markers = [
        createBodyMarker(0x9fc4ff, 1),
        createBodyMarker(0xcfcfcf, MOON_RADIUS),
        createBodyMarker(0xfff2d8, SUN_RADIUS, 14),
        createBodyMarker(0xff9c6b, MARS_RADIUS),
        // Smaller dots, and given their orbit radii so they fade out rather than
        // piling additively onto Mars's marker once the orbits shrink to nothing.
        createBodyMarker(0xd9cfc2, PHOBOS_RADIUS, 5, PHOBOS_ORBIT_RADIUS),
        createBodyMarker(0xd9cfc2, DEIMOS_RADIUS, 5, DEIMOS_ORBIT_RADIUS),
    ];
    earthSystem.add(markers[0].sprite);
    moon.add(markers[1].sprite);
    sun.add(markers[2].sprite);
    marsSystem.add(markers[3].sprite);
    phobos.add(markers[4].sprite);
    deimos.add(markers[5].sprite);

    // Start parked next to Earth. Earth is a full AU (23,481 units) from the origin,
    // so the old `camera.position.z = 3` would drop the camera inside the Sun.
    earthOrbitPosition(getSimulatedDate(), earthSystem.position);
    scene.updateMatrixWorld(true);
    camera.position.copy(earthSystem.position).add(new Vector3(0, 0.6, 3));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(earthSystem.position);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    // 0.1 units is 640 km, which was fine while the smallest thing you could focus on
    // was the ISS, and is hopeless for a 6 km moon — it would park the camera a
    // hundred Deimos-radii away and leave it a speck. The floor now comes from the
    // smallest body in the scene, which is also what the dynamic near plane assumes.
    controls.minDistance = DEIMOS_RADIUS;
    // Framing Mars's orbit needs roughly 1.67 AU/tan(fov/2) ~ 2.2 AU, so this leaves
    // comfortable headroom past that.
    controls.maxDistance = EARTH_ORBIT_RADIUS * 4;
    controls.enablePan = true;

    // Earth is framed from 3 of its radii; Mars is barely half the size, so matching
    // that framing means measuring the distance in *its* radii rather than reusing
    // the number.
    const MARS_VIEW_DISTANCE = MARS_RADIUS * 3.5;
    // The moons need a wider berth in their own radii, because they are not round:
    // framing on the mean radius would crop the long axis, which on Phobos is 18%
    // longer again.
    const PHOBOS_VIEW_DISTANCE = PHOBOS_RADIUS * 4.5;
    const DEIMOS_VIEW_DISTANCE = DEIMOS_RADIUS * 4.5;
    // The loop itself already reaches ANALEMMA_RADIUS (1.4) out from Earth's centre,
    // so framing it "3 radii out" the way Earth is would put the camera practically
    // inside the curve. Measuring from its own radius instead keeps the whole
    // figure-8 in frame with headroom.
    const ANALEMMA_VIEW_DISTANCE = ANALEMMA_RADIUS * 1.8;

    /**
     * "What am I nearest, and by how much?" — recomputed every frame.
     *
     * Three separate things need this, which is why it is worth computing once: the
     * flight speed scales with it, the near plane scales with it, and the body it
     * names becomes the frame you fly in.
     */
    const flightBodies: Array<{ name: string; object: Object3D; radius: number }> = [
        { name: 'Sun', object: sun, radius: SUN_RADIUS },
        { name: 'Earth', object: earthSystem, radius: 1 },
        { name: 'Moon', object: moon, radius: MOON_RADIUS },
        { name: 'Mars', object: marsSystem, radius: MARS_RADIUS },
        // Without these, flying near Phobos would take its speed from Mars — nearly
        // a whole Mars radius of clearance away — and carry you past an 11 km rock
        // at several thousand km/s before you saw it.
        { name: 'Phobos', object: phobos, radius: PHOBOS_RADIUS },
        { name: 'Deimos', object: deimos, radius: DEIMOS_RADIUS },
    ];
    let nearestBody = flightBodies[1];
    let nearestClearance = 1;

    function updateNearestBody() {
        let closest = flightBodies[0];
        let clearance = Infinity;

        for (const body of flightBodies) {
            // Clearance to the *surface*, not the centre — otherwise the Sun, 109
            // units of radius, would always read as far away while you skim it.
            const distance =
                camera.position.distanceTo(body.object.getWorldPosition(scratchA)) - body.radius;
            if (distance < clearance) {
                clearance = distance;
                closest = body;
            }
        }

        nearestBody = closest;
        nearestClearance = clearance;
    }

    /**
     * The near plane has to move with us.
     *
     * A fixed 0.1 clips everything within 640 km of the camera, so free flight could
     * never actually reach a surface. But it cannot simply be made tiny either: depth
     * resolution goes as z²/(near·2²⁴), so a near plane small enough to land with
     * would destroy the depth buffer out at solar-system range. Since it is only ever
     * the *nearest* thing that matters, deriving it from the clearance satisfies both
     * — and incidentally makes the far view far more precise than the old constant.
     */
    function updateNearPlane() {
        const near = MathUtils.clamp(nearestClearance * 0.02, 0.0002, 5);
        // Rebuilding the projection matrix every frame for a sub-pixel change is
        // pointless churn; a 5% band is well below anything visible.
        if (Math.abs(near - camera.near) > camera.near * 0.05) {
            camera.near = near;
            camera.updateProjectionMatrix();
        }
    }

    const freeFlight = createFreeFlight(camera, renderer.domElement);
    const flightHud = document.getElementById('flight-hud');
    const flightSpeedValue = document.getElementById('flight-speed');
    const flightFrameValue = document.getElementById('flight-frame');
    const toggleFreeFlightBtn = document.getElementById('toggle-free-flight');
    toggleFreeFlightBtn?.addEventListener('click', () => setFreeFlight(!freeFlight.enabled));

    // The analemma is a permanent overlay rather than a body, so it is the one thing
    // here worth switching off outright. The button's label and dim state are owned
    // here entirely, same reasoning as free flight's button: three separate paths
    // (this button, keyboard `7`, and a direct click in the scene) all need to be
    // able to turn it back *on*, and none of them should have to fight React state
    // to do it.
    let analemmaVisible = true;
    const toggleAnalemmaBtn = document.getElementById('toggle-analemma');

    function setAnalemmaVisible(visible: boolean) {
        analemmaVisible = visible;
        analemmaLine.visible = visible;
        analemmaAnchor.visible = visible;
        toggleAnalemmaBtn?.classList.toggle('nav-visibility-btn--off', !visible);
        if (toggleAnalemmaBtn) {
            toggleAnalemmaBtn.textContent = visible ? 'Hide' : 'Show';
        }
    }

    // This button only ever toggles — it never focuses the camera, so it does not
    // route through `focusOnObject`.
    toggleAnalemmaBtn?.addEventListener('click', () => setAnalemmaVisible(!analemmaVisible));
    // Off by default: it's the one thing in the scene that's a permanent overlay
    // rather than a body, so unlike everything else here it shouldn't just be sitting
    // there on a first visit — routing through the setter keeps the three.js
    // visibility flags, the JS state, and the button's own label in sync from a
    // single call rather than trying to hand-set each one to match.
    setAnalemmaVisible(false);

    /**
     * Camera focus.
     *
     * Nothing sits still any more, so a focus cannot be a snapshot of a position: by
     * the time the animation lands, the body has moved. The animation stores the
     * *object* plus a fixed offset and re-derives its endpoint every frame, and once
     * it finishes `followTarget` keeps the camera glued to the body while preserving
     * whatever orbit angle the user has dragged to.
     */
    let focusAnimation: {
        startPosition: Vector3;
        startTarget: Vector3;
        target: Object3D;
        offset: Vector3;
        startTime: number;
        duration: number;
    } | null = null;

    let followTarget: Object3D | null = earthSystem;
    const followPrevious = new Vector3();
    let followInitialised = false;

    const scratchA = new Vector3();
    const scratchB = new Vector3();
    const scratchTarget = new Vector3();
    const scratchFocus = new Vector3();

    function focusOnObject(
        target: Object3D,
        distance = 5,
        duration = 2000,
        approachFrom?: Vector3
    ) {
        // Asking to be taken somewhere is the opposite of flying yourself there.
        // This has to happen *first*: leaving free flight re-parks the orbit pivot,
        // and the animation below captures that pivot as its starting point.
        setFreeFlight(false);

        const targetPosition = target.getWorldPosition(scratchA).clone();

        // Default to the current line of sight so the framing does not lurch. Callers
        // can override it — pulling back from Earth to the Sun along the existing view
        // would leave Earth silhouetted dead-centre against the Sun.
        const offset = approachFrom
            ? approachFrom.clone()
            : new Vector3().subVectors(camera.position, targetPosition);
        if (offset.lengthSq() < 1e-6) {
            offset.set(0, 0.3, 1);
        }
        offset.normalize().multiplyScalar(distance);

        focusAnimation = {
            startPosition: camera.position.clone(),
            startTarget: controls.target.clone(),
            target,
            offset,
            startTime: Date.now(),
            duration,
        };

        followTarget = target;
        followInitialised = false;
    }

    /**
     * Hand control between the two camera modes.
     *
     * They cannot both be live: `OrbitControls.update()` ends by aiming the camera at
     * its pivot, which would overwrite the direction free flight had just set. So the
     * orbit controls are switched off outright, and `update()` is skipped, while
     * flying.
     */
    function setFreeFlight(enabled: boolean) {
        if (enabled === freeFlight.enabled) return;

        if (enabled) {
            focusAnimation = null;
            controls.enabled = false;
            freeFlight.enable();
            document
                .querySelectorAll('.nav-btn[data-target]')
                .forEach((button) => button.classList.remove('active'));
        } else {
            freeFlight.disable();
            controls.enabled = true;

            // Give the orbit pivot somewhere sensible to be before handing back.
            // Left where it was, the first `update()` would swing the camera round to
            // face whatever it was last locked to. Parking it straight ahead, at
            // roughly whatever we are near, makes the handover invisible.
            const pivotDistance = MathUtils.clamp(
                nearestClearance,
                controls.minDistance,
                controls.maxDistance
            );
            camera.getWorldDirection(scratchA);
            controls.target.copy(camera.position).addScaledVector(scratchA, pivotDistance);

            // Keep drifting with whatever we parked next to, rather than watching it
            // pull away at orbital speed.
            followTarget = nearestBody.object;
            followInitialised = false;
        }

        flightHud?.classList.toggle('flight-hud--visible', enabled);
        toggleFreeFlightBtn?.classList.toggle('active', enabled);
        if (toggleFreeFlightBtn) {
            toggleFreeFlightBtn.textContent = enabled ? 'Exit free flight' : 'Free flight';
        }
    }

    document.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event && (event.target as HTMLElement).tagName === 'INPUT' || (event.target as HTMLElement).tagName === 'TEXTAREA') {
            return;
        }

        switch (event.key.toLowerCase()) {
            case 'f':
                setFreeFlight(!freeFlight.enabled);
                break;
            case 'escape':
                setFreeFlight(false);
                break;
            case '1':
                focusOnObject(earth, 3, 1500);
                break;
            case '2':
                focusOnObject(moon, 3, 1500);
                break;
            case '3':
                focusOnObject(iss, 0.5, 1500);
                break;
            case '4':
                focusOnObject(mars, MARS_VIEW_DISTANCE, 2500);
                break;
            case '5':
                focusOnObject(phobos, PHOBOS_VIEW_DISTANCE, 2500);
                break;
            case '6':
                focusOnObject(deimos, DEIMOS_VIEW_DISTANCE, 2500);
                break;
            case '7':
                setAnalemmaVisible(true);
                focusOnObject(analemmaAnchor, ANALEMMA_VIEW_DISTANCE, 2500);
                break;
            case '0':
                focusOnObject(earth, 70, 2000);
                break;
        }
    });

    // Raycaster for mouse clicks and hover
    const raycaster = new Raycaster();
    const mouse = new Vector2();

    // How close the camera should settle for each body, in its own radii — the Sun is
    // 109 units across, so a one-size-fits-all distance would bury the camera in it.
    const clickTargets: Array<{ hit: Object3D; focus: Object3D; distance: number }> = [
        { hit: earth, focus: earth, distance: 3 },
        { hit: moon, focus: moon, distance: 3 },
        { hit: sun, focus: sun, distance: SUN_RADIUS * 4 },
        { hit: mars, focus: mars, distance: MARS_VIEW_DISTANCE },
        { hit: phobos, focus: phobos, distance: PHOBOS_VIEW_DISTANCE },
        { hit: deimos, focus: deimos, distance: DEIMOS_VIEW_DISTANCE },
        { hit: analemmaAnchor, focus: analemmaAnchor, distance: ANALEMMA_VIEW_DISTANCE },
    ];

    function pickTarget(event: MouseEvent) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(clickTargets.map((t) => t.hit), true);
        if (intersects.length === 0) return null;

        // Walk up to whichever registered target owns the mesh that was hit.
        for (let node: Object3D | null = intersects[0].object; node; node = node.parent) {
            const match = clickTargets.find((t) => t.hit === node);
            if (match) return match;
        }
        return null;
    }

    /** Positions move every frame now, so this has to compare in world space. */
    function isAlreadyObserving(target: Object3D, radius: number) {
        const position = target.getWorldPosition(scratchB);
        return (
            controls.target.distanceTo(position) < radius * 0.4 &&
            camera.position.distanceTo(position) < radius * 4
        );
    }

    // Both of these stand down while flying: the drag is a look-around, not a pick,
    // and free flight owns the cursor.
    renderer.domElement.addEventListener('mousemove', (event: MouseEvent) => {
        if (freeFlight.enabled) return;
        const picked = pickTarget(event);
        const focusable = picked !== null && !isAlreadyObserving(picked.focus, picked.distance);
        renderer.domElement.style.cursor = focusable ? 'pointer' : 'default';
    });

    renderer.domElement.addEventListener('click', (event: MouseEvent) => {
        if (freeFlight.enabled) return;
        const picked = pickTarget(event);
        if (picked && !isAlreadyObserving(picked.focus, picked.distance)) {
            // Raycasting doesn't check `.visible` on its own, so a click landing
            // where the anchor used to be would otherwise focus an overlay the user
            // had just switched off — surfacing it again is the more useful outcome.
            if (picked.focus === analemmaAnchor) {
                setAnalemmaVisible(true);
            }
            focusOnObject(picked.focus, picked.distance, 1500);
        }
    });

    // Update ISS position
    setInterval(updateISSPosition, ISS_UPDATE_INTERVAL);
    updateISSPosition(); // Initial fetch

    // Navigation panel functionality
    let paused = false;

    // Object focus buttons
    const navButtons = document.querySelectorAll('.nav-btn[data-target]');
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const target = button.getAttribute('data-target');

            // Remove active class from all buttons
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            switch (target) {
                case 'earth':
                    focusOnObject(earth, 3, 1500);
                    break;
                case 'moon':
                    focusOnObject(moon, 3, 1500);
                    break;
                case 'iss':
                    focusOnObject(iss, 0.5, 1500);
                    break;
                case 'analemma':
                    setAnalemmaVisible(true);
                    focusOnObject(analemmaAnchor, ANALEMMA_VIEW_DISTANCE, 2500);
                    break;
                case 'mars':
                    focusOnObject(mars, MARS_VIEW_DISTANCE, 2500);
                    break;
                case 'phobos':
                    focusOnObject(phobos, PHOBOS_VIEW_DISTANCE, 2500);
                    break;
                case 'deimos':
                    focusOnObject(deimos, DEIMOS_VIEW_DISTANCE, 2500);
                    break;
                case 'sun':
                    focusOnObject(sun, SUN_RADIUS * 4, 2500);
                    break;
                case 'system':
                    // Far enough back from the Sun to take in the whole system,
                    // viewed obliquely from above the ecliptic so the orbits read as
                    // circles rather than edge-on. Mars reaches 1.67 AU at aphelion
                    // and a 75° vertical field sees 0.77 AU per AU of distance, so
                    // anything under ~2.2 AU back would crop its orbit.
                    focusOnObject(sun, EARTH_ORBIT_RADIUS * 2.6, 2500, new Vector3(0.3, 0.78, 0.55));
                    break;
            }
        });
    });

    // Reset camera button
    const resetCameraBtn = document.getElementById('reset-camera');
    resetCameraBtn?.addEventListener('click', () => {
        navButtons.forEach(btn => btn.classList.remove('active'));
        focusOnObject(earth, 70, 2000);
    });

    // Time speed buttons
    const speedButtons = document.querySelectorAll('.nav-btn[data-speed]');
    speedButtons.forEach(button => {
        button.addEventListener('click', () => {
            speedButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            setTimeSpeed(Number(button.getAttribute('data-speed')));
        });
    });

    // Pause now stops the simulated clock, which halts the spin *and* both orbits.
    const togglePauseBtn = document.getElementById('toggle-rotation');
    togglePauseBtn?.addEventListener('click', () => {
        paused = !paused;
        setPaused(paused);
        if (togglePauseBtn) {
            togglePauseBtn.textContent = paused ? 'Resume' : 'Pause';
        }
    });

    // Real elapsed time, tracked separately from the simulated clock. Flying has to
    // keep working while the simulation is paused, and must not go six times faster
    // because the user picked a six-times time multiplier.
    let lastFrameMs = performance.now();
    let hudRefreshDue = 0;

    // Nothing here needs more than 60fps — camera moves are either an eased fly-to
    // or a scale-invariant drift, neither of which reads any smoother at 120. A
    // ProMotion display drives `requestAnimationFrame` at up to 120Hz regardless,
    // which would otherwise run every one of those overdrawn shells twice as often
    // as the scene has any use for. The 1ms slack keeps a 60Hz display from
    // occasionally dropping a frame to timer jitter sitting right at the threshold.
    const TARGET_FRAME_INTERVAL_MS = 1000 / 60 - 1;

    /**
     * Speeds here are true to scale, so they are genuinely enormous — parked three
     * radii off Earth is already thousands of km/s. Rather than hide that, the
     * read-out switches to AU/s once km/s stops being legible.
     */
    function formatSpeed(unitsPerSecond: number): string {
        const kilometresPerSecond = unitsPerSecond * EARTH_RADIUS_KM;
        if (kilometresPerSecond < 100000) {
            return `${Math.round(kilometresPerSecond).toLocaleString()} km/s`;
        }
        return `${(unitsPerSecond / EARTH_ORBIT_RADIUS).toFixed(3)} AU/s`;
    }

    function updateFlightHud(nowMs: number) {
        if (!freeFlight.enabled || nowMs < hudRefreshDue) return;
        hudRefreshDue = nowMs + 100; // 10 Hz is plenty, and keeps the digits readable

        if (flightSpeedValue) {
            const multiplier = freeFlight.multiplier;
            const scale = multiplier >= 1 ? multiplier.toFixed(1) : `1/${(1 / multiplier).toFixed(1)}`;
            flightSpeedValue.textContent = `${formatSpeed(freeFlight.speed)}  ×${scale}`;
        }
        if (flightFrameValue) {
            flightFrameValue.textContent = nearestBody.name;
        }
    }

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);

        const frameMs = performance.now();
        // Skip the whole frame — physics and all — until roughly a 60Hz interval has
        // passed, rather than let a high-refresh display drive it faster. `lastFrameMs`
        // only advances on a frame that actually proceeds, so realDelta below still
        // measures real elapsed time between rendered frames, not between rAF ticks.
        if (frameMs - lastFrameMs < TARGET_FRAME_INTERVAL_MS) {
            return;
        }

        // Clamped for the same reason the simulated clock is: a backgrounded tab
        // should not resume by hurling the camera across the solar system.
        const realDelta = Math.min((frameMs - lastFrameMs) / 1000, 0.1);
        lastFrameMs = frameMs;

        // Everything below is a pure function of this one date, which is what keeps
        // the spin, both orbits and the seasons consistent at any time speed.
        const now = advanceClock();

        // --- Orbits and rotations ---
        earthOrbitPosition(now, earthSystem.position);

        const spin = earthSpinAngle(now);
        earth.rotation.y = spin;
        clouds.rotation.y = spin * CLOUD_ANGULAR_VELOCITY_SCALE;

        updateSun(now);
        moonOrbitPosition(now, moon.position);
        // Tidal lock: one rotation per orbit, so the near side always faces Earth.
        moon.rotation.y = moonTidalRotation(moonEclipticLongitude(now));

        marsOrbitPosition(now, marsSystem.position);
        // The IAU prime-meridian angle, applied inside the fixed axis node.
        mars.rotation.y = marsSpinAngle(now);

        // Position and facing together — both moons are tidally locked, so the
        // direction back to Mars that places them is also the direction that aims
        // them. Phobos gets round three times a sol, which is fast enough to watch
        // even at the "Real" time setting.
        satelliteState(PHOBOS, now, phobos.position, phobos.quaternion);
        satelliteState(DEIMOS, now, deimos.position, deimos.quaternion);

        // Sunlight direction, now genuinely geometric: each planet sits somewhere on
        // its orbit and the Sun is at the origin, so this is simply the way back.
        const earthWorldPosition = earthSystem.getWorldPosition(scratchA);
        const sunDirection = scratchB.copy(earthWorldPosition).negate().normalize();

        atmosphereSunDirection.copy(sunDirection);
        // The Earth shader compares the sun against a view-space normal, so the
        // direction has to be carried into view space alongside it.
        earthSunDirectionView.copy(sunDirection).transformDirection(camera.matrixWorldInverse);

        // Mars needs its own: it is a whole orbit away, so the direction back to the
        // Sun is nothing like Earth's.
        marsAtmosphereSunDirection.copy(marsSystem.position).negate().normalize();

        // Smooth interpolation between current and target position
        const elapsedTime = Date.now() - issLastUpdateTime;
        const progress = Math.min(elapsedTime / ISS_UPDATE_INTERVAL, 1);
        iss.position.lerpVectors(issCurrentPos, issTargetPos, progress);
        // Keep the station belly-down. Earth's centre is its parent's origin, and
        // lookAt wants world space.
        iss.lookAt(earthWorldPosition);

        const viewportHeight = renderer.domElement.clientHeight || window.innerHeight;
        for (const marker of markers) {
            updateBodyMarker(marker, camera, viewportHeight);
        }

        for (const label of labels) {
            const position = label.body.getWorldPosition(scratchTarget);
            const cameraDistance = camera.position.distanceTo(position);
            const observing =
                controls.target.distanceTo(position) < label.radius * 1.2 &&
                cameraDistance < label.radius * 12;

            // Everything else here is a body you can always find; the analemma is an
            // overlay you might have switched off, and its chip shouldn't linger
            // once the curve it's labelling is gone.
            const forcedHidden = label.body === analemmaAnchor && !analemmaVisible;
            const target = forcedHidden || observing || cameraDistance > label.hideBeyond ? 0 : 1;
            const current = parseFloat(label.element.style.opacity || '0');
            const next = current + (target - current) * 0.15;
            label.element.style.opacity = next.toFixed(2);
            label.object.visible = next > 0.02;
        }

        // --- Camera ---
        // The scene graph has moved this frame, so world positions must be current
        // before the camera reads them.
        scene.updateMatrixWorld(true);

        updateNearestBody();
        updateNearPlane();

        if (freeFlight.enabled) {
            // Fly in the frame of whatever you are nearest. Parked beside Earth in
            // the Sun's frame you would watch it leave at 30 km/s — and at the higher
            // time multipliers, considerably faster than that. Inheriting its motion
            // is what makes "go and hover over Mars" mean anything.
            followTarget = nearestBody.object;
        }

        if (focusAnimation) {
            const elapsed = Date.now() - focusAnimation.startTime;
            const t = Math.min(elapsed / focusAnimation.duration, 1);
            const eased = 1 - Math.pow(1 - t, 3); // Ease out cubic

            // Re-derive the destination every frame: by the time the fly-to lands,
            // the body has moved on along its orbit.
            const destination = focusAnimation.target.getWorldPosition(scratchTarget);
            scratchFocus.copy(destination).add(focusAnimation.offset);

            camera.position.lerpVectors(focusAnimation.startPosition, scratchFocus, eased);
            controls.target.lerpVectors(focusAnimation.startTarget, destination, eased);

            if (t >= 1) {
                focusAnimation = null;
            }
        } else if (followTarget) {
            // Translate the camera by however far the body moved, which holds the
            // user's chosen orbit angle and zoom while still tracking it.
            const position = followTarget.getWorldPosition(scratchTarget);
            if (followInitialised) {
                scratchFocus.subVectors(position, followPrevious);
                camera.position.add(scratchFocus);
                controls.target.add(scratchFocus);
            }
            followPrevious.copy(position);
            followInitialised = true;
        }

        // The user's own movement goes on top of the frame drift above, so that
        // flying and being carried along compose rather than fight.
        if (freeFlight.enabled) {
            freeFlight.update(realDelta, nearestClearance);
            updateFlightHud(frameMs);
        } else {
            // Skipped while flying: `update()` finishes by aiming the camera at the
            // orbit pivot, which would undo the direction just set.
            controls.update();
        }

        // Stars belong at infinity: pin the backdrop to the camera so travelling
        // 1500 units along the orbit does not fly us out of our own starfield.
        backgroundTexture.position.copy(camera.position);

        renderer.render(scene, camera);
        labelRenderer.render(scene, camera);
    }

    // Handle window resize
    window.addEventListener('resize', () => {
        const { width, height } = getSize();
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        labelRenderer.setSize(width, height);
    });

    animate();
}
