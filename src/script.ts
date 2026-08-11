import { PerspectiveCamera, Scene, WebGLRenderer, Vector3, Object3D, Raycaster, Vector2, AmbientLight, ACESFilmicToneMapping } from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { earth, earthSunDirectionView } from './planets/earth/earth';
import { clouds } from './planets/earth/clouds';
import { atmosphere, atmosphereSunDirection } from './planets/earth/atmosphere';
import { sun, sunLight, updateSun } from './sun';
import { backgroundTexture } from './background/background';
import { iss, updateISSPosition, issCurrentPos, issTargetPos, issLastUpdateTime } from './iss';
import { moon, moonTidalRotation } from './planets/earth/moon';
import { advanceClock, getSimulatedDate, setPaused, setTimeSpeed } from './simulation';
import { createBodyMarker, updateBodyMarker } from './body-marker';
import {
    EARTH_OBLIQUITY,
    earthOrbitPosition,
    earthSpinAngle,
    moonEclipticLongitude,
    moonOrbitPosition,
} from './orbits';
import {
    ISS_UPDATE_INTERVAL,
    CLOUD_ANGULAR_VELOCITY_SCALE,
    MOON_ORBIT_INCLINATION_DEG,
    MOON_RADIUS,
    EARTH_ORBIT_RADIUS,
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
    renderer.setPixelRatio(window.devicePixelRatio);
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

    // Scene graph. The Sun is at the world origin; everything Earth-ish hangs off a
    // single moving node so the orbit only has to be applied in one place.
    //
    //   scene
    //   ├── sun
    //   └── earthSystem            <- moves along the orbit
    //       ├── earthTilt          <- fixed 23.44° lean, never follows the orbit
    //       │   ├── earth          <- spins inside the tilt
    //       │   ├── clouds
    //       │   └── iss
    //       ├── atmosphere
    //       └── moonOrbitPlane     <- inclined to the ecliptic, not to the equator
    //           └── moon
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
    moonOrbitPlane.add(moon);
    earthSystem.add(earthTilt);
    earthSystem.add(atmosphere);
    earthSystem.add(moonOrbitPlane);

    scene.add(earthSystem);
    scene.add(sun);
    scene.add(backgroundTexture);

    // Directional light aimed from the Sun at the Earth; the target must be in the
    // scene graph for three to resolve its world position.
    sunLight.position.set(0, 0, 0);
    sunLight.target = earthSystem;
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
    ];

    // Distance markers so Earth and the Moon stay findable once the whole orbit is
    // in frame and they are both well under a pixel across.
    // The Sun needs one too: at a true AU its disc is only ~5px from Earth and ~3px
    // from the system view, so without this the brightest object in the scene reads
    // as a dim speck.
    const markers = [
        createBodyMarker(0x9fc4ff, 1),
        createBodyMarker(0xcfcfcf, MOON_RADIUS),
        createBodyMarker(0xfff2d8, SUN_RADIUS, 14),
    ];
    earthSystem.add(markers[0].sprite);
    moon.add(markers[1].sprite);
    sun.add(markers[2].sprite);

    // Start parked next to Earth. Earth is a full AU (23,481 units) from the origin,
    // so the old `camera.position.z = 3` would drop the camera inside the Sun.
    earthOrbitPosition(getSimulatedDate(), earthSystem.position);
    scene.updateMatrixWorld(true);
    camera.position.copy(earthSystem.position).add(new Vector3(0, 0.6, 3));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(earthSystem.position);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.1;
    // Framing the whole orbit needs roughly radius/tan(fov/2) ~ 30,600 units, so
    // this leaves comfortable headroom past that.
    controls.maxDistance = EARTH_ORBIT_RADIUS * 2.5;
    controls.enablePan = true;

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

    document.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event && (event.target as HTMLElement).tagName === 'INPUT' || (event.target as HTMLElement).tagName === 'TEXTAREA') {
            return;
        }

        switch (event.key.toLowerCase()) {
            case '1':
                focusOnObject(earth, 3, 1500);
                break;
            case '2':
                focusOnObject(moon, 3, 1500);
                break;
            case '3':
                focusOnObject(iss, 0.5, 1500);
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

    renderer.domElement.addEventListener('mousemove', (event: MouseEvent) => {
        const picked = pickTarget(event);
        const focusable = picked !== null && !isAlreadyObserving(picked.focus, picked.distance);
        renderer.domElement.style.cursor = focusable ? 'pointer' : 'default';
    });

    renderer.domElement.addEventListener('click', (event: MouseEvent) => {
        const picked = pickTarget(event);
        if (picked && !isAlreadyObserving(picked.focus, picked.distance)) {
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
                case 'sun':
                    focusOnObject(sun, SUN_RADIUS * 4, 2500);
                    break;
                case 'system':
                    // Far enough back from the Sun to take in the whole orbit, viewed
                    // obliquely from above the ecliptic so the orbit reads as a
                    // circle rather than edge-on.
                    focusOnObject(sun, EARTH_ORBIT_RADIUS * 1.6, 2500, new Vector3(0.3, 0.78, 0.55));
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

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);

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

        // Sunlight direction, now genuinely geometric: Earth sits somewhere on the
        // orbit and the Sun is at the origin, so this is simply the way back.
        const earthWorldPosition = earthSystem.getWorldPosition(scratchA);
        const sunDirection = scratchB.copy(earthWorldPosition).negate().normalize();

        atmosphereSunDirection.copy(sunDirection);
        // The Earth shader compares the sun against a view-space normal, so the
        // direction has to be carried into view space alongside it.
        earthSunDirectionView.copy(sunDirection).transformDirection(camera.matrixWorldInverse);

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

            const target = observing || cameraDistance > label.hideBeyond ? 0 : 1;
            const current = parseFloat(label.element.style.opacity || '0');
            const next = current + (target - current) * 0.15;
            label.element.style.opacity = next.toFixed(2);
            label.object.visible = next > 0.02;
        }

        // --- Camera ---
        // The scene graph has moved this frame, so world positions must be current
        // before the camera reads them.
        scene.updateMatrixWorld(true);

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

        // Stars belong at infinity: pin the backdrop to the camera so travelling
        // 1500 units along the orbit does not fly us out of our own starfield.
        backgroundTexture.position.copy(camera.position);

        controls.update();
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
