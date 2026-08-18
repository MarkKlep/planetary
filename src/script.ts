import { PerspectiveCamera, Quaternion, Scene, WebGLRenderer, Vector3, Object3D, Raycaster, Vector2, AmbientLight, ACESFilmicToneMapping, MathUtils } from 'three';
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
import { venus } from './planets/venus/venus';
import { venusClouds } from './planets/venus/clouds';
import { venusAtmosphere, venusAtmosphereSunDirection } from './planets/venus/atmosphere';
import { mercury } from './planets/mercury/mercury';
import { jupiter } from './planets/jupiter/jupiter';
import { callisto, europa, ganymede, io } from './planets/jupiter/moons';
import { saturn, saturnSunDirectionLocal } from './planets/saturn/saturn';
import {
    ringCameraPositionLocal,
    ringSolarDistance,
    ringSunDirectionLocal,
    saturnRings,
} from './planets/saturn/rings';
import { dione, enceladus, iapetus, mimas, rhea, tethys } from './planets/saturn/moons';
import { titan } from './planets/saturn/titan';
import { titanHaze } from './planets/saturn/haze';
import { createMoonSurface, prepareMoonSurface } from './planets/earth/moon-surface/moon-surface';
import { DEFAULT_SITE, findSite, nearestSite, type LandingSite } from './planets/earth/moon-surface/sites';
import { advanceClock, getSimulatedDate, getTimeSpeed, isPaused, setPaused, setTimeSpeed } from './simulation';
import { createBodyMarker, updateBodyMarker } from './body-marker';
import { createAdaptiveResolution, initialPixelRatio, quality } from './quality';
import { orbitPaths } from './orbit-paths';
import { createFreeFlight } from './free-flight';
import {
    CALLISTO,
    DEIMOS,
    DIONE,
    EARTH_OBLIQUITY,
    ENCELADUS,
    EUROPA,
    GANYMEDE,
    IAPETUS,
    IO,
    jupiterOrbitPosition,
    jupiterSpinAngle,
    JUPITER_AXIS_ORIENTATION,
    earthOrbitPosition,
    earthSpinAngle,
    marsOrbitPosition,
    marsSpinAngle,
    MARS_AXIS_ORIENTATION,
    MIMAS,
    moonEclipticLongitude,
    moonOrbitPosition,
    PHOBOS,
    RHEA,
    satelliteState,
    saturnOrbitPosition,
    saturnSpinAngle,
    SATURN_AXIS_ORIENTATION,
    TETHYS,
    TITAN,
    mercuryOrbitPosition,
    mercurySpinAngle,
    MERCURY_AXIS_ORIENTATION,
    venusCloudAngle,
    venusOrbitPosition,
    venusSpinAngle,
    VENUS_AXIS_ORIENTATION,
} from './orbits';
import {
    ISS_UPDATE_INTERVAL,
    CALLISTO_ORBIT_RADIUS,
    CALLISTO_RADIUS,
    CLOUD_ANGULAR_VELOCITY_SCALE,
    DEIMOS_ORBIT_RADIUS,
    DEIMOS_RADIUS,
    DIONE_ORBIT_RADIUS,
    DIONE_RADIUS,
    EARTH_RADIUS_KM,
    ENCELADUS_ORBIT_RADIUS,
    ENCELADUS_RADIUS,
    EUROPA_ORBIT_RADIUS,
    EUROPA_RADIUS,
    GANYMEDE_ORBIT_RADIUS,
    GANYMEDE_RADIUS,
    IAPETUS_ORBIT_RADIUS,
    IAPETUS_RADIUS,
    IO_ORBIT_RADIUS,
    IO_RADIUS,
    JUPITER_RADIUS,
    JUPITER_EQUATORIAL_RADIUS,
    MARS_RADIUS,
    MERCURY_RADIUS,
    MIMAS_ORBIT_RADIUS,
    MIMAS_RADIUS,
    MOON_ORBIT_INCLINATION_DEG,
    MOON_RADIUS,
    EARTH_ORBIT_RADIUS,
    PHOBOS_ORBIT_RADIUS,
    PHOBOS_RADIUS,
    RHEA_ORBIT_RADIUS,
    RHEA_RADIUS,
    SATURN_EQUATORIAL_RADIUS,
    SATURN_RADIUS,
    SATURN_RING_OUTER,
    SUN_RADIUS,
    TETHYS_ORBIT_RADIUS,
    TETHYS_RADIUS,
    TITAN_HAZE_RADIUS,
    TITAN_ORBIT_RADIUS,
    TITAN_RADIUS,
    VENUS_RADIUS,
} from './constants/planets.const';

/**
 * @param onFirstFrame Called once the scene has actually been drawn to the canvas for
 * the first time — not when this function returns, which happens the instant the
 * synchronous setup below finishes and says nothing about whether a single pixel has
 * been painted. `App.tsx` uses this to time the splash's removal: dismissing it on
 * return alone raced the real first frame, which stalls on GPU work this function only
 * *schedules* — shader compilation in particular is typically paid synchronously on
 * whichever `renderer.render()` call first uses a given material, not before, and a
 * scene with several custom `ShaderMaterial`s (the rings among them) can lose that race
 * by a couple of seconds even though `initScene()` itself returns in milliseconds.
 */
export function initScene(onFirstFrame?: () => void) {
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

    const renderer = new WebGLRenderer({
        antialias: quality.antialias,
        // Asking for the discrete GPU on a machine that has one. Without it a browser is
        // entitled to run a WebGL page on the integrated part, which is the right default
        // for a page with a spinning cube on it and the wrong one for a scene made of
        // overdrawing shells.
        powerPreference: 'high-performance',
    });
    renderer.setSize(initialWidth, initialHeight);
    // Fragment cost is quadratic in pixel ratio, and this scene spends most of a
    // frame in fragment shaders: several transparent, additively blended shells
    // (the atmospheres, the corona, the clouds) overdraw the same pixels more than
    // once with no early-Z rejection, since blending needs depth writes off. A
    // Retina display's devicePixelRatio of 2 was asking for that four times over
    // for a sharpness difference that is barely visible.
    //
    // The ceiling now comes from `quality.ts` rather than being one number here, and
    // `adaptiveResolution` below moves a scale underneath it as the measured frame time
    // asks — which is the only part of the system that can respond to a device that is
    // thermally throttling, since nothing about that is visible to a capability check.
    renderer.setPixelRatio(initialPixelRatio());
    const adaptiveResolution = createAdaptiveResolution((ratio) => {
        renderer.setPixelRatio(ratio);
        // `setPixelRatio` alone does not resize the drawing buffer — three.js reads the
        // ratio on the next `setSize`, so without this the new value is stored and never
        // applied. The CSS size is unchanged, so nothing else has to be told: the camera
        // aspect, the label overlay and the surface mode's own camera all key off that
        // rather than off the buffer.
        const { width, height } = getSize();
        renderer.setSize(width, height);
    });
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

    // The far plane has to clear the camera's own pull-back plus the width of the
    // system, and Saturn moved both: framing its orbit puts the camera 14 AU out
    // (328,700 units) while the far side of that orbit is another 10.07 AU (236,400)
    // beyond the Sun, so 400,000 would have clipped the whole far half of the outermost
    // orbit line. Depth precision is set by the *near* plane, not this — resolution
    // goes as z^2/(near * 2^24) — so doubling it costs nothing at all.
    const camera = new PerspectiveCamera(75, initialWidth / initialHeight, 0.1, 800000);

    // Scene graph. The Sun is at the world origin; each planet hangs off a single
    // moving node so its orbit only has to be applied in one place.
    //
    //   scene
    //   ├── sun
    //   ├── mercurySystem          <- innermost, and the only planet with no shells
    //   │   └── mercuryAxis        <- fixed IAU pole, all but upright
    //   │       └── mercury        <- 3 turns per 2 orbits, and nothing enforces it
    //   ├── venusSystem            <- one orbit further in
    //   │   ├── venusAxis          <- fixed IAU pole direction, never touched
    //   │   │   ├── venus          <- spins *backwards* inside it
    //   │   │   └── venusClouds    <- and sixty times faster than the planet does
    //   │   └── venusAtmosphere
    //   ├── earthSystem            <- moves along the orbit
    //   │   ├── earthTilt          <- fixed 23.44° lean, never follows the orbit
    //   │   │   ├── earth          <- spins inside the tilt
    //   │   │   ├── clouds
    //   │   │   └── iss
    //   │   ├── atmosphere
    //   │   └── moonOrbitPlane     <- inclined to the ecliptic, not to the equator
    //   │       └── moon
    //   ├── marsSystem             <- same shape, one orbit further out
    //   │   ├── marsAxis           <- fixed IAU pole direction, likewise never touched
    //   │   │   ├── mars           <- spins inside the tilt
    //   │   │   ├── phobos         <- in Mars's *equatorial* plane, not the ecliptic
    //   │   │   └── deimos
    //   │   └── marsAtmosphere
    //   ├── jupiterSystem          <- 5.2 AU out, further than everything else combined
    //   │   └── jupiterAxis        <- fixed IAU pole, leaning only 3.1°
    //   │       ├── jupiter        <- 870.5°/day, the fastest spin in the scene
    //   │       ├── io             <- all four in Jupiter's *equatorial* plane, and
    //   │       ├── europa            locked 4:2:1 without anything here saying so
    //   │       ├── ganymede
    //   │       └── callisto
    //   └── saturnSystem           <- 9.5 AU, and 1.83x Jupiter's again
    //       └── saturnAxis         <- fixed IAU pole, leaning 26.7° — the biggest here,
    //           ├── saturn            and the only one you can *see*, because...
    //           ├── saturnRings    <- ...the rings lie in the plane this node defines
    //           ├── mimas          <- all seven in Saturn's equatorial plane
    //           ├── enceladus
    //           ├── tethys
    //           ├── dione
    //           ├── rhea
    //           ├── titan          <- and Titan alone carries a second shell
    //           ├── titanHaze
    //           └── iapetus
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

    // Venus is built the same way again, which is the point of the shape: the axis
    // node takes a fixed IAU pole and is never touched, and everything peculiar about
    // Venus falls out of the two numbers fed to it. The pole is almost upright, so
    // there is barely any lean and barely any season; the spin applied *inside* it is
    // negative, so the planet turns backwards. Neither needed a special case.
    const venusSystem = new Object3D();
    const venusAxis = new Object3D();
    venusAxis.quaternion.copy(VENUS_AXIS_ORIENTATION);

    venusAxis.add(venus);
    // The deck is a child of the axis rather than of the planet, because it does not
    // travel with it: it laps the surface every four days, so it needs its own
    // rotation applied against the same fixed pole.
    venusAxis.add(venusClouds);
    venusSystem.add(venusAxis);
    venusSystem.add(venusAtmosphere);

    // And once more, minus the shells. Mercury is the simplest body in the scene —
    // no clouds, no haze, no moons — which makes it the clearest demonstration that
    // the pattern is carrying the physics: a pole, a spin rate, and a set of
    // elements are the whole of it.
    const mercurySystem = new Object3D();
    const mercuryAxis = new Object3D();
    mercuryAxis.quaternion.copy(MERCURY_AXIS_ORIENTATION);

    mercuryAxis.add(mercury);
    mercurySystem.add(mercuryAxis);

    // And the same shape a fifth time, at the other end of the scale from Mercury.
    // Jupiter is 450 times its volume and carries four moons, but the graph does not
    // grow to accommodate any of that: a system node, an axis node holding a fixed
    // IAU pole, and children hanging inside it. The moons go under the *axis*, for
    // exactly the reason Phobos and Deimos do — Jupiter's equatorial bulge rules them,
    // not the Sun, so they lie in the plane of the equator and inherit its lean.
    const jupiterSystem = new Object3D();
    const jupiterAxis = new Object3D();
    jupiterAxis.quaternion.copy(JUPITER_AXIS_ORIENTATION);

    jupiterAxis.add(jupiter);
    jupiterAxis.add(io);
    jupiterAxis.add(europa);
    jupiterAxis.add(ganymede);
    jupiterAxis.add(callisto);
    jupiterSystem.add(jupiterAxis);

    // A sixth time, and the first body whose defining feature is not the body. The graph
    // still does not grow: a system node, an axis node holding a fixed IAU pole, and
    // children inside it. The rings go under the *axis* for exactly the reason the moons
    // do — they lie in the equatorial plane and inherit its 26.7° lean, which is what
    // makes them open and close over the 29½-year orbit without anything animating them.
    const saturnSystem = new Object3D();
    const saturnAxis = new Object3D();
    saturnAxis.quaternion.copy(SATURN_AXIS_ORIENTATION);

    saturnAxis.add(saturn);
    saturnAxis.add(saturnRings);
    saturnAxis.add(mimas);
    saturnAxis.add(enceladus);
    saturnAxis.add(tethys);
    saturnAxis.add(dione);
    saturnAxis.add(rhea);
    // Titan's two shells are siblings under the axis rather than parent and child, the
    // same way Venus's ground and deck are: the haze is what Titan looks like, so it has
    // to be removable without taking the moon with it. Both are moved by the one
    // `satelliteState` call below.
    saturnAxis.add(titan);
    saturnAxis.add(titanHaze);
    saturnAxis.add(iapetus);
    saturnSystem.add(saturnAxis);

    scene.add(mercurySystem);
    scene.add(venusSystem);
    scene.add(earthSystem);
    scene.add(marsSystem);
    scene.add(jupiterSystem);
    scene.add(saturnSystem);
    scene.add(sun);
    scene.add(backgroundTexture);
    // Added to the scene root, not to the system nodes they belong to: an orbit is
    // the path a body traces *through* the Sun's frame, so it has to stay put while
    // the body moves along it. Parenting each one to the node that carries its planet
    // would drag the whole curve around with the planet.
    orbitPaths.forEach((path) => scene.add(path));

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
        // CSS custom properties resolve fine in inline styles, same as in a
        // stylesheet, so this chip stays on the one token source in variables.scss
        // rather than carrying its own hardcoded copy of "the panel colour" that
        // silently drifts from the real one. Built imperatively rather than in
        // nav-panel.scss because CSS2DObject content has to exist as real DOM
        // nodes attached to a Three.js object, not JSX.
        element.style.color = 'var(--ink)';
        element.style.fontFamily = 'var(--font-body)';
        element.style.fontSize = '13px';
        element.style.padding = '3px 7px';
        element.style.background = 'rgba(8, 8, 10, 0.72)';
        element.style.border = '1px solid var(--hairline)';
        element.style.borderRadius = 'var(--radius-sm)';
        element.style.backdropFilter = 'blur(6px)';
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
        { ...createLabel('Mercury', mercurySystem, MERCURY_RADIUS * 1.25), body: mercurySystem, radius: MERCURY_RADIUS, hideBeyond: Infinity },
        { ...createLabel('Venus', venusSystem, VENUS_RADIUS * 1.25), body: venusSystem, radius: VENUS_RADIUS, hideBeyond: Infinity },
        { ...createLabel('Mars', marsSystem, MARS_RADIUS * 1.25), body: marsSystem, radius: MARS_RADIUS, hideBeyond: Infinity },
        // Scaled from the Moon's cutoff by orbit radius, so each label survives to
        // roughly the same *apparent* separation from its planet before the two
        // chips would start sitting on top of each other.
        { ...createLabel('Phobos', phobos, PHOBOS_RADIUS * 2), body: phobos, radius: PHOBOS_RADIUS, hideBeyond: 10 },
        { ...createLabel('Deimos', deimos, DEIMOS_RADIUS * 2), body: deimos, radius: DEIMOS_RADIUS, hideBeyond: 24 },
        { ...createLabel('Jupiter', jupiterSystem, JUPITER_EQUATORIAL_RADIUS * 1.2), body: jupiterSystem, radius: JUPITER_RADIUS, hideBeyond: Infinity },
        // Scaled from their orbit radii the same way the Martian pair's are, so each
        // chip survives to roughly the same apparent separation from Jupiter. These
        // are far more generous because the orbits genuinely are — Callisto's is 295
        // units across against Deimos's 3.7.
        { ...createLabel('Io', io, IO_RADIUS * 2), body: io, radius: IO_RADIUS, hideBeyond: 420 },
        { ...createLabel('Europa', europa, EUROPA_RADIUS * 2), body: europa, radius: EUROPA_RADIUS, hideBeyond: 670 },
        { ...createLabel('Ganymede', ganymede, GANYMEDE_RADIUS * 2), body: ganymede, radius: GANYMEDE_RADIUS, hideBeyond: 1070 },
        { ...createLabel('Callisto', callisto, CALLISTO_RADIUS * 2), body: callisto, radius: CALLISTO_RADIUS, hideBeyond: 1880 },
        // Measured off the ring system rather than the planet: the rings reach 2.33
        // equatorial radii, so a chip placed at the globe's own limb would sit inside
        // them. This is the one body here whose label has to clear something that is not
        // the body.
        { ...createLabel('Saturn', saturnSystem, SATURN_RING_OUTER * 1.05), body: saturnSystem, radius: SATURN_RADIUS, hideBeyond: Infinity },
        // Scaled from their orbit radii the way the Martian and Galilean moons' are. The
        // inner five are packed inside 83 units, so their chips have to go early or they
        // pile up on each other; Iapetus's orbit is 559 units and its chip survives to
        // nearly the range Callisto's does.
        { ...createLabel('Mimas', mimas, MIMAS_RADIUS * 2), body: mimas, radius: MIMAS_RADIUS, hideBeyond: 30 },
        { ...createLabel('Enceladus', enceladus, ENCELADUS_RADIUS * 2), body: enceladus, radius: ENCELADUS_RADIUS, hideBeyond: 38 },
        { ...createLabel('Tethys', tethys, TETHYS_RADIUS * 2), body: tethys, radius: TETHYS_RADIUS, hideBeyond: 46 },
        { ...createLabel('Dione', dione, DIONE_RADIUS * 2), body: dione, radius: DIONE_RADIUS, hideBeyond: 59 },
        { ...createLabel('Rhea', rhea, RHEA_RADIUS * 2), body: rhea, radius: RHEA_RADIUS, hideBeyond: 83 },
        // Anchored on the haze shell, which is the outer of Titan's two surfaces.
        { ...createLabel('Titan', titan, TITAN_HAZE_RADIUS * 2), body: titan, radius: TITAN_RADIUS, hideBeyond: 192 },
        { ...createLabel('Iapetus', iapetus, IAPETUS_RADIUS * 2), body: iapetus, radius: IAPETUS_RADIUS, hideBeyond: 560 },
        // A local Earth-surface feature, not a findable body — meaningful only once
        // you're already close, so this gets a short `hideBeyond` like the ISS's
        // framing rather than the "visible across the whole system" bodies above.
        { ...createLabel('Analemma', analemmaAnchor, 0.05), body: analemmaAnchor, radius: ANALEMMA_RADIUS, hideBeyond: 15 },
    ];

    // --- per-frame label scratch ------------------------------------------
    //
    // Allocated once, at the size the label list actually is, and reused every frame.
    // See the block in `animate()` that fills them.

    const labelCount = labels.length;
    const labelDistance = new Float64Array(labelCount);
    const labelX = new Float64Array(labelCount);
    const labelY = new Float64Array(labelCount);
    const labelObserving = new Uint8Array(labelCount);
    const labelForcedHidden = new Uint8Array(labelCount);
    /** Indices of the labels on screen this frame, filled from 0 to `onScreenCount`. */
    const labelOnScreen = new Int32Array(labelCount);
    /**
     * Each label's current opacity, held here rather than read back out of the DOM.
     * `parseFloat(element.style.opacity)` per label per frame was doing a string parse
     * to recover a number this loop had itself written a frame earlier — and reading a
     * style property is the sort of thing that is cheap right up until it is not.
     * Starts at zero because `createLabel` writes `opacity: 0`.
     */
    const labelOpacity = new Float64Array(labelCount);

    /** Pixels between two label chips before the further one gives way. */
    const LABEL_OVERLAP_PX = 90;

    /**
     * Step one label's fade toward `target` and push the result to the DOM.
     *
     * The write is skipped when the rounded value has not moved, which is most frames
     * for most labels: an exponential approach spends its whole tail inside one
     * hundredth, and every one of those writes was invalidating the element's style
     * for a value identical to the one already there.
     */
    function fadeLabel(index: number, target: number) {
        const label = labels[index];
        const next = labelOpacity[index] + (target - labelOpacity[index]) * 0.15;
        labelOpacity[index] = next;
        const text = next.toFixed(2);
        if (label.element.style.opacity !== text) label.element.style.opacity = text;
        label.object.visible = next > 0.02;
    }

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
        // A touch larger than the others, which is the one honest exception here:
        // Venus really is the brightest point of light in the sky after the Sun and
        // Moon, and a dot the same size as Mars's would have it read as the dimmer of
        // the two when it is some fifty times the brighter.
        createBodyMarker(0xfff0c4, VENUS_RADIUS, 9),
        // Back to the default size, and a dim grey to match: Mercury is the faintest
        // of the naked-eye planets and the hardest to catch, which the dot may as
        // well say.
        createBodyMarker(0xbfb6a8, MERCURY_RADIUS),
        // Jupiter gets a larger dot for the same honest reason Venus does: it is the
        // brightest planet in our sky after Venus, and outshines Mars at every
        // opposition despite being four times further away.
        createBodyMarker(0xf3ddb4, JUPITER_RADIUS, 9),
        // The Galileans get their orbit radii so they fade out rather than piling
        // additively onto Jupiter's marker. They earn slightly bigger dots than the
        // Martian moons because they are bodies you can genuinely resolve — all four
        // are visible in binoculars, and Galileo found them with far less.
        createBodyMarker(0xffe7a8, IO_RADIUS, 5, IO_ORBIT_RADIUS),
        createBodyMarker(0xfff2e2, EUROPA_RADIUS, 5, EUROPA_ORBIT_RADIUS),
        createBodyMarker(0xd8cfc0, GANYMEDE_RADIUS, 6, GANYMEDE_ORBIT_RADIUS),
        createBodyMarker(0xb0a08c, CALLISTO_RADIUS, 5, CALLISTO_ORBIT_RADIUS),
        // Saturn's dot is sized against its *rings*, not its globe: the system is 2.33
        // equatorial radii across, so the disc stops being sub-pixel a good deal later
        // than the planet alone would. Sized between Jupiter's and Mars's, which is
        // where it sits in our sky — brighter than Mars at opposition, and never
        // Jupiter's match.
        createBodyMarker(0xf0dcae, SATURN_RING_OUTER, 8),
        // The inner five are tiny and packed inside 83 units, so they fade out early —
        // the whole of Rhea's orbit is a third the width of Io's. Titan earns a larger
        // dot for the reason Venus and Jupiter do: it is the one here you could find in
        // binoculars, and Huygens did find it, in 1655, with a lens he ground himself.
        createBodyMarker(0xf2f2f4, MIMAS_RADIUS, 4, MIMAS_ORBIT_RADIUS),
        createBodyMarker(0xffffff, ENCELADUS_RADIUS, 5, ENCELADUS_ORBIT_RADIUS),
        createBodyMarker(0xf4f4f6, TETHYS_RADIUS, 5, TETHYS_ORBIT_RADIUS),
        createBodyMarker(0xeeeef0, DIONE_RADIUS, 5, DIONE_ORBIT_RADIUS),
        createBodyMarker(0xe8e8ea, RHEA_RADIUS, 5, RHEA_ORBIT_RADIUS),
        createBodyMarker(0xe2a869, TITAN_RADIUS, 7, TITAN_ORBIT_RADIUS),
        createBodyMarker(0xbfae95, IAPETUS_RADIUS, 5, IAPETUS_ORBIT_RADIUS),
    ];
    earthSystem.add(markers[0].sprite);
    moon.add(markers[1].sprite);
    sun.add(markers[2].sprite);
    marsSystem.add(markers[3].sprite);
    phobos.add(markers[4].sprite);
    deimos.add(markers[5].sprite);
    venusSystem.add(markers[6].sprite);
    mercurySystem.add(markers[7].sprite);
    jupiterSystem.add(markers[8].sprite);
    io.add(markers[9].sprite);
    europa.add(markers[10].sprite);
    ganymede.add(markers[11].sprite);
    callisto.add(markers[12].sprite);
    saturnSystem.add(markers[13].sprite);
    mimas.add(markers[14].sprite);
    enceladus.add(markers[15].sprite);
    tethys.add(markers[16].sprite);
    dione.add(markers[17].sprite);
    rhea.add(markers[18].sprite);
    titan.add(markers[19].sprite);
    iapetus.add(markers[20].sprite);

    // Start a little closer than the full-system wide shot so the planets stay readable
    // without being hidden by a wall of labels. The zoom controls let the user move out
    // again to inspect the entire system when desired.
    const SYSTEM_VIEW_DISTANCE = EARTH_ORBIT_RADIUS * 9;
    const SYSTEM_VIEW_DIRECTION = new Vector3(0.3, 0.78, 0.55).normalize();
    // Longer than any nav fly-to: this one crosses 2.6 AU to end up 3 Earth-radii out,
    // and the nav buttons' 1.5–2.5s over that range reads as a jump rather than a move.
    // Not longer still, though — the fly-to eases out over a distance ratio of 20,000,
    // so the last fifth of it covers well under a percent of the way and is already
    // sub-pixel. Time past that point is not slower movement, it is the camera being
    // held against the user while nothing visibly happens.
    const INTRO_FLIGHT_DURATION = 2500;
    // Covers the splash's 400ms fade with a beat to spare, so the opening shot is
    // actually seen before the camera starts moving.
    const INTRO_HOLD_DURATION = 800;

    // Open on the whole system with the Sun centred, which the intro fly-to at the end
    // of initScene then leaves for Earth. The bodies still need placing first: the
    // fly-to reads Earth's world position, and it is only correct once the orbit has
    // been evaluated for the current date and the matrices flushed.
    earthOrbitPosition(getSimulatedDate(), earthSystem.position);
    scene.updateMatrixWorld(true);
    camera.position.copy(SYSTEM_VIEW_DIRECTION).multiplyScalar(SYSTEM_VIEW_DISTANCE);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(sun.position);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    // 0.1 units is 640 km, which was fine while the smallest thing you could focus on
    // was the ISS, and is hopeless for a 6 km moon — it would park the camera a
    // hundred Deimos-radii away and leave it a speck. The floor now comes from the
    // smallest body in the scene, which is also what the dynamic near plane assumes.
    controls.minDistance = DEIMOS_RADIUS;
    // Framing Saturn's orbit needs roughly 10.07 AU/tan(fov/2) ~ 13.1 AU, so this
    // leaves comfortable headroom past that. It was 12 AU when Jupiter was the outermost
    // body, which would now stop the user short of ever seeing Saturn's orbit whole.
    controls.maxDistance = EARTH_ORBIT_RADIUS * 22;
    controls.enablePan = true;

    const setZoomFromButtons = (direction: 'in' | 'out') => {
        if (freeFlight.enabled) return;

        const distance = camera.position.distanceTo(controls.target);
        const scale = direction === 'in' ? 0.82 : 1.2;
        const nextDistance = Math.min(Math.max(distance * scale, controls.minDistance), controls.maxDistance);
        const offset = camera.position.clone().sub(controls.target).normalize().multiplyScalar(nextDistance);
        camera.position.copy(controls.target).add(offset);
        controls.update();
    };

    document.getElementById('zoom-in')?.addEventListener('click', () => setZoomFromButtons('in'));
    document.getElementById('zoom-out')?.addEventListener('click', () => setZoomFromButtons('out'));

    // The buttons only make sense as a way to move between "the whole system" and
    // "somewhere in it", so they only show up in the former — everywhere else, the
    // nav panel and mouse wheel already own zooming. Default hidden in CSS so there
    // is no flash of the buttons before the first frame runs.
    const viewportZoom = document.querySelector<HTMLElement>('.viewport-zoom');
    const setZoomButtonsVisible = (visible: boolean) => {
        viewportZoom?.classList.toggle('viewport-zoom--visible', visible);
    };

    // Earth is framed from 3 of its radii; Mars is barely half the size, so matching
    // that framing means measuring the distance in *its* radii rather than reusing
    // the number.
    const MARS_VIEW_DISTANCE = MARS_RADIUS * 3.5;
    // Venus is within 5% of Earth's size, so it gets Earth's framing measured in its
    // own radii — the two should look the same size from the same relative distance,
    // because they very nearly are.
    const VENUS_VIEW_DISTANCE = VENUS_RADIUS * 3;
    const MERCURY_VIEW_DISTANCE = MERCURY_RADIUS * 3.5;
    // The moons need a wider berth in their own radii, because they are not round:
    // framing on the mean radius would crop the long axis, which on Phobos is 18%
    // longer again.
    const PHOBOS_VIEW_DISTANCE = PHOBOS_RADIUS * 4.5;
    const DEIMOS_VIEW_DISTANCE = DEIMOS_RADIUS * 4.5;
    // Measured off the *equatorial* radius, which is the one that sets the silhouette:
    // framing Jupiter on its mean radius would crop the limb it bulges past.
    const JUPITER_VIEW_DISTANCE = JUPITER_EQUATORIAL_RADIUS * 3.2;
    // These four are round, so unlike the Martian moons they need no extra allowance
    // over the planets' own framing.
    const IO_VIEW_DISTANCE = IO_RADIUS * 3.5;
    const EUROPA_VIEW_DISTANCE = EUROPA_RADIUS * 3.5;
    const GANYMEDE_VIEW_DISTANCE = GANYMEDE_RADIUS * 3.5;
    const CALLISTO_VIEW_DISTANCE = CALLISTO_RADIUS * 3.5;
    // The one framing here measured off something that is not the body. Every other
    // planet is framed at a few of its own radii; do that to Saturn and the rings run
    // off both edges, because they reach 2.33 equatorial radii and are the thing you
    // came to look at. 1.6 ring-radii puts the whole system in frame with a margin.
    const SATURN_VIEW_DISTANCE = SATURN_RING_OUTER * 1.6;
    const MIMAS_VIEW_DISTANCE = MIMAS_RADIUS * 3.5;
    const ENCELADUS_VIEW_DISTANCE = ENCELADUS_RADIUS * 3.5;
    const TETHYS_VIEW_DISTANCE = TETHYS_RADIUS * 3.5;
    const DIONE_VIEW_DISTANCE = DIONE_RADIUS * 3.5;
    const RHEA_VIEW_DISTANCE = RHEA_RADIUS * 3.5;
    // Measured off the haze rather than the ground, which is the outer of Titan's two
    // surfaces and the one that sets the silhouette.
    const TITAN_VIEW_DISTANCE = TITAN_HAZE_RADIUS * 3.5;
    const IAPETUS_VIEW_DISTANCE = IAPETUS_RADIUS * 3.5;
    // The loop itself already reaches ANALEMMA_RADIUS (1.4) out from Earth's centre,
    // so framing it "3 radii out" the way Earth is would put the camera practically
    // inside the curve. Measuring from its own radius instead keeps the whole
    // figure-8 in frame with headroom.
    const ANALEMMA_VIEW_DISTANCE = ANALEMMA_RADIUS * 1.8;
    // Earth is framed from 3 of its radii — named because the opening fly-in has to
    // land on exactly the framing the Earth nav button gives you.
    const EARTH_VIEW_DISTANCE = 3;

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
        { name: 'Mercury', object: mercurySystem, radius: MERCURY_RADIUS },
        { name: 'Venus', object: venusSystem, radius: VENUS_RADIUS },
        { name: 'Mars', object: marsSystem, radius: MARS_RADIUS },
        // Without these, flying near Phobos would take its speed from Mars — nearly
        // a whole Mars radius of clearance away — and carry you past an 11 km rock
        // at several thousand km/s before you saw it.
        { name: 'Phobos', object: phobos, radius: PHOBOS_RADIUS },
        { name: 'Deimos', object: deimos, radius: DEIMOS_RADIUS },
        { name: 'Jupiter', object: jupiterSystem, radius: JUPITER_RADIUS },
        { name: 'Io', object: io, radius: IO_RADIUS },
        { name: 'Europa', object: europa, radius: EUROPA_RADIUS },
        { name: 'Ganymede', object: ganymede, radius: GANYMEDE_RADIUS },
        { name: 'Callisto', object: callisto, radius: CALLISTO_RADIUS },
        // Saturn's clearance is measured from the *equatorial* radius, not the rings.
        // This figure sets the flight speed and the near plane, and both want the
        // distance to the nearest thing you could hit — the rings are a plane you can
        // fly straight through, and taking the clearance from their outer edge would
        // have you crawling at ring speed while still 140,000 km from the planet.
        { name: 'Saturn', object: saturnSystem, radius: SATURN_EQUATORIAL_RADIUS },
        { name: 'Mimas', object: mimas, radius: MIMAS_RADIUS },
        { name: 'Enceladus', object: enceladus, radius: ENCELADUS_RADIUS },
        { name: 'Tethys', object: tethys, radius: TETHYS_RADIUS },
        { name: 'Dione', object: dione, radius: DIONE_RADIUS },
        { name: 'Rhea', object: rhea, radius: RHEA_RADIUS },
        { name: 'Titan', object: titan, radius: TITAN_HAZE_RADIUS },
        { name: 'Iapetus', object: iapetus, radius: IAPETUS_RADIUS },
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
     * Exposure, which adapts to how much sunlight is actually falling where you are.
     *
     * This is the counterpart to `sunLight` being a real inverse-square point light,
     * not a retreat from it. The falloff stays exactly as it is — Jupiter at 5.2 AU
     * really does receive a twenty-seventh of Earth's sunlight, and nothing here
     * touches that. What changes is the *exposure* the scene is developed at, which is
     * a property of the observer rather than of the light.
     *
     * And exposing for it is what an observer would actually do. Sunlight at Jupiter
     * is about 4,700 lux, which is an overcast afternoon on Earth — a level any
     * dark-adapted eye reads as perfectly bright, and one every camera ever sent out
     * there was stopped for. Rendering Jupiter as a near-black disc was the artefact;
     * it came of developing the whole solar system at the one exposure that suits
     * Earth. Same argument the lunar surface makes in `moon-surface/`, where the
     * sunlight constant is openly an f-stop and only the albedo under it is measured.
     *
     * Irradiance goes as 1/d², so compensating for it goes as d². Clamped below at 1
     * so the inner system keeps the exposure everything there was tuned against —
     * Venus at 0.72 AU is genuinely over-lit and does not want darkening.
     *
     * Note what this deliberately does *not* rescue: the body markers, the orbit
     * lines, the Sun's own corona and the starfield are all `toneMapped: false`, so
     * they hold a fixed brightness through all of it. Only lit geometry moves, which
     * is the only thing that should.
     */
    /**
     * The ceiling had to move for Saturn, and it is worth saying why it is not a fudge.
     *
     * This number is `d²` at the furthest body in the scene, because that is exactly
     * what cancels the light's own 1/d² falloff. It was 32 when Jupiter's 5.2 AU needed
     * 27; Saturn's aphelion is 10.07 AU and needs 101. Leaving it at 32 would not have
     * been a conservative choice — it would have rendered Saturn three times darker than
     * the model says it is, which is precisely the artefact `updateExposure` exists to
     * remove. Sunlight at Saturn is about 1,400 lux, which is an overcast day; it is
     * dimmer than Jupiter and it is nothing like dark.
     */
    const MAX_EXPOSURE = 110;
    /** Seconds to cover most of an exposure change. Slow enough to read as an eye
     *  adjusting rather than a light switch, quick enough to settle inside a fly-to. */
    const EXPOSURE_ADAPT_SECONDS = 0.7;
    const exposureScratch = new Vector3();
    let exposure = 1;

    function updateExposure(delta: number) {
        // Measured at the body you are with rather than at the camera: in the system
        // view the camera is 7.6 AU out while what fills the frame is the inner system,
        // and exposing for the camera's own distance would wash it out.
        const solarDistance = nearestBody.object.getWorldPosition(exposureScratch).length();
        const target = MathUtils.clamp(
            (solarDistance / EARTH_ORBIT_RADIUS) ** 2,
            1,
            MAX_EXPOSURE
        );
        // Frame-rate independent easing, so the adaptation takes the same real time
        // whatever the display is doing.
        exposure += (target - exposure) * (1 - Math.exp(-delta / EXPOSURE_ADAPT_SECONDS));
        renderer.toneMappingExposure = exposure;
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

    // Same shape as the analemma toggle above, and for the same reason: the orbit
    // paths are diagram, not scenery, so their visibility is state this file owns and
    // the button merely reflects.
    let orbitsVisible = true;
    const toggleOrbitsBtn = document.getElementById('toggle-orbits');

    function setOrbitsVisible(visible: boolean) {
        orbitsVisible = visible;
        orbitPaths.forEach((path) => (path.visible = visible));
        toggleOrbitsBtn?.classList.toggle('nav-visibility-btn--off', !visible);
        if (toggleOrbitsBtn) {
            toggleOrbitsBtn.textContent = visible ? 'Hide' : 'Show';
        }
    }

    toggleOrbitsBtn?.addEventListener('click', () => setOrbitsVisible(!orbitsVisible));

    // Same shape again, for the one body here that is hiding something.
    //
    // The other two toggles switch a diagram on and off. This one is not a diagram —
    // it is the difference between the two things "Venus" can mean. With the deck on
    // you get the planet as it appears, an almost blank white-gold disc; with it off
    // you get the ground Magellan mapped through it by radar, which no eye has ever
    // seen and no camera has ever photographed from orbit. Both are Venus. Being able
    // to peel one off the other seemed a better answer than picking one.
    let venusCloudsVisible = true;
    const toggleVenusCloudsBtn = document.getElementById('toggle-venus-clouds');

    function setVenusCloudsVisible(visible: boolean) {
        venusCloudsVisible = visible;
        venusClouds.visible = visible;
        // The haze belongs to the deck, not to the rock: it is the top of the same
        // atmosphere, so stripping the clouds away and leaving a glow around a bare
        // radar globe would be the one incoherent combination of the two.
        venusAtmosphere.visible = visible;
        toggleVenusCloudsBtn?.classList.toggle('nav-visibility-btn--off', !visible);
        if (toggleVenusCloudsBtn) {
            toggleVenusCloudsBtn.textContent = visible ? 'Hide' : 'Show';
        }
    }

    toggleVenusCloudsBtn?.addEventListener('click', () =>
        setVenusCloudsVisible(!venusCloudsVisible)
    );

    // The same shape once more, for the only other body in the solar system whose
    // surface is hidden by its own air. Titan's haze is opaque in visible light, so with
    // it on you get what Voyager 1 got in 1980 — a blank orange ball, for which it gave
    // up its shot at Pluto — and with it off you get the ground Cassini mapped through
    // it at 938 nm, which no eye has ever seen. Both are Titan.
    let titanHazeVisible = true;
    const toggleTitanHazeBtn = document.getElementById('toggle-titan-haze');

    function setTitanHazeVisible(visible: boolean) {
        titanHazeVisible = visible;
        titanHaze.visible = visible;
        toggleTitanHazeBtn?.classList.toggle('nav-visibility-btn--off', !visible);
        if (toggleTitanHazeBtn) {
            toggleTitanHazeBtn.textContent = visible ? 'Hide' : 'Show';
        }
    }

    toggleTitanHazeBtn?.addEventListener('click', () => setTitanHazeVisible(!titanHazeVisible));
    setTitanHazeVisible(true);
    // On by default, unlike the other two — this is what Venus looks like, so it is
    // scenery rather than an overlay, and the surface underneath is the thing you opt
    // into. Still routed through the setter so the flags and the button label cannot
    // start out disagreeing.
    setVenusCloudsVisible(true);
    // Hidden on first load so the app opens cleanly. Orbit paths are only shown when
    // the user explicitly chooses the Solar system view.
    setOrbitsVisible(false);

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
    const scratchSaturnSun = new Vector3();
    const scratchQuaternion = new Quaternion();

    function focusOnObject(
        target: Object3D,
        distance = 5,
        duration = 2000,
        approachFrom?: Vector3
    ) {
        const isSystemView =
            target === sun &&
            !!approachFrom &&
            approachFrom.lengthSq() > 0 &&
            distance >= SYSTEM_VIEW_DISTANCE * 0.8;

        if (isSystemView) {
            setOrbitsVisible(true);
        } else {
            setOrbitsVisible(false);
        }

        // Asking to be taken somewhere is the opposite of flying yourself there.
        // This has to happen *first*: leaving free flight re-parks the orbit pivot,
        // and the animation below captures that pivot as its starting point.
        setFreeFlight(false);
        // And it is equally the opposite of standing on a surface. Any nav button or
        // keyboard shortcut therefore lifts off on its own, without needing to know
        // that the surface mode exists.
        exitMoonSurface();

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

    // --- Standing on the Moon ---------------------------------------------
    //
    // The third camera mode, and the only one that is not a camera at all: it swaps
    // the whole render for a scene measured in metres. Nothing here could be done by
    // flying the existing camera down, because at true scale an astronaut's eye sits
    // 2.7e-7 units off the ground and the Moon mesh has one texel every 2.7 km — the
    // entire visible world from down there falls inside a single texel of a single
    // triangle. See `moon-surface/terrain.ts`.
    //
    // The orbital model keeps running while it is up, because the Sun's position in
    // that sky, Earth's position and Earth's phase are all read out of it.
    const moonSurface = createMoonSurface({
        renderer,
        domElement: renderer.domElement,
        // Borrowed, not duplicated: the starfield is a singleton, and standing under
        // the real Milky Way with no atmosphere in the way is half the reason to go.
        stars: backgroundTexture,
        starsHome: scene,
    });
    moonSurface.resize(initialWidth, initialHeight);

    const surfaceMoonPosition = new Vector3();
    const surfaceMoonQuaternion = new Quaternion();
    const surfaceEarthPosition = new Vector3();
    const surfaceEarthQuaternion = new Quaternion();

    const surfaceHud = document.getElementById('surface-hud');
    const surfaceSunValue = document.getElementById('surface-sun');
    const surfaceEarthValue = document.getElementById('surface-earth');
    const surfaceRoverValue = document.getElementById('surface-rover');
    const surfaceSpeedValue = document.getElementById('surface-speed');
    const surfaceTripValue = document.getElementById('surface-trip');
    const surfaceHomeValue = document.getElementById('surface-home');
    const surfaceNote = document.getElementById('surface-note');
    const surfaceSiteSelect = document.getElementById('surface-site') as HTMLSelectElement | null;
    const toggleMoonSurfaceBtn = document.getElementById('toggle-moon-surface');

    function updateSurfaceChrome(landed: boolean, site?: LandingSite) {
        surfaceHud?.classList.toggle('surface-hud--visible', landed);
        // The CSS2D labels are a DOM overlay, not something the renderer draws, so
        // skipping `labelRenderer.render()` while landed leaves them frozen on screen
        // at whatever opacity they last had — "Earth" hanging in the lunar sky, 384,000
        // km from the thing it labels. They have to be hidden outright.
        labelRenderer.domElement.style.display = landed ? 'none' : '';
        // CSS2D labels are rendered into their own DOM layer. Surface mode swaps the
        // WebGL scene, so they are not re-rendered there — but their last positions
        // would otherwise remain painted over the lunar horizon. Hide that layer for
        // the whole time we are standing on the Moon, then restore it on exit.
        labelRenderer.domElement.style.display = landed ? 'none' : 'block';
        toggleMoonSurfaceBtn?.classList.toggle('nav-visibility-btn--off', !landed);
        if (toggleMoonSurfaceBtn) {
            toggleMoonSurfaceBtn.textContent = landed ? 'Leave' : 'Land';
        }
        if (site) {
            if (surfaceSiteSelect) surfaceSiteSelect.value = site.id;
            if (surfaceNote) {
                // Two of the six sites have hardware on them. The other four get their
                // own line and nothing else, which is the honest thing to say.
                surfaceNote.textContent = site.artefacts
                    ? `${site.note} ${site.artefacts.note}`
                    : site.note;
            }
        }
    }

    /**
     * Leave without deciding where to look next.
     *
     * Split out from `setMoonSurface` because `focusOnObject` has to call it — asking
     * to be taken anywhere at all means the surface is over — and `setMoonSurface`
     * calls `focusOnObject` on the way out. One of the two has to be the half that
     * does not aim the camera, or they would call each other forever.
     */
    function exitMoonSurface() {
        if (!moonSurface.active) return;
        moonSurface.exit();
        updateSurfaceChrome(false);
    }

    function setMoonSurface(landed: boolean, site: LandingSite = DEFAULT_SITE) {
        if (landed) {
            setFreeFlight(false);
            focusAnimation = null;
            moonSurface.enter(site);
            updateSurfaceChrome(true, site);
            // The surface branch returns before the per-frame visibility check runs,
            // so it would otherwise stay stuck showing if it was up when we landed.
            setZoomButtonsVisible(false);
        } else {
            if (!moonSurface.active) return;
            exitMoonSurface();
            // Come back out looking at the body just left, rather than at wherever the
            // camera happened to be parked when it was entered.
            focusOnObject(moon, 3, 1200);
        }
    }

    toggleMoonSurfaceBtn?.addEventListener('click', () => setMoonSurface(!moonSurface.active));
    surfaceSiteSelect?.addEventListener('change', () => {
        const site = findSite(surfaceSiteSelect.value);
        moonSurface.landAt(site);
        updateSurfaceChrome(true, site);
    });

    document.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event && (event.target as HTMLElement).tagName === 'INPUT' || (event.target as HTMLElement).tagName === 'TEXTAREA') {
            return;
        }

        switch (event.key.toLowerCase()) {
            case 'f':
                setFreeFlight(!freeFlight.enabled);
                break;
            case 'l':
                setMoonSurface(!moonSurface.active);
                break;
            case 'escape':
                // Whichever mode is up, Escape is the way out of it. They are mutually
                // exclusive, so there is never a question of which one it means.
                if (moonSurface.active) setMoonSurface(false);
                else setFreeFlight(false);
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
        // Two entries, because which one the ray actually lands on depends on whether
        // the deck is switched on — and they are siblings, so neither walks up to the
        // other. Both aim the camera at the same place.
        { hit: venusClouds, focus: venus, distance: VENUS_VIEW_DISTANCE },
        { hit: venus, focus: venus, distance: VENUS_VIEW_DISTANCE },
        { hit: mercury, focus: mercury, distance: MERCURY_VIEW_DISTANCE },
        { hit: mars, focus: mars, distance: MARS_VIEW_DISTANCE },
        { hit: phobos, focus: phobos, distance: PHOBOS_VIEW_DISTANCE },
        { hit: deimos, focus: deimos, distance: DEIMOS_VIEW_DISTANCE },
        { hit: analemmaAnchor, focus: analemmaAnchor, distance: ANALEMMA_VIEW_DISTANCE },
        { hit: jupiter, focus: jupiter, distance: JUPITER_VIEW_DISTANCE },
        { hit: io, focus: io, distance: IO_VIEW_DISTANCE },
        { hit: europa, focus: europa, distance: EUROPA_VIEW_DISTANCE },
        { hit: ganymede, focus: ganymede, distance: GANYMEDE_VIEW_DISTANCE },
        { hit: callisto, focus: callisto, distance: CALLISTO_VIEW_DISTANCE },
        { hit: saturn, focus: saturn, distance: SATURN_VIEW_DISTANCE },
        // The rings are pickable too, and they aim at the planet — clicking a ring means
        // "take me to Saturn", not "take me to a point 120,000 km off its equator". They
        // are also the larger target by area from almost every angle.
        { hit: saturnRings, focus: saturn, distance: SATURN_VIEW_DISTANCE },
        { hit: mimas, focus: mimas, distance: MIMAS_VIEW_DISTANCE },
        { hit: enceladus, focus: enceladus, distance: ENCELADUS_VIEW_DISTANCE },
        { hit: tethys, focus: tethys, distance: TETHYS_VIEW_DISTANCE },
        { hit: dione, focus: dione, distance: DIONE_VIEW_DISTANCE },
        { hit: rhea, focus: rhea, distance: RHEA_VIEW_DISTANCE },
        // Two entries, like Venus's pair, because which one the ray lands on depends on
        // whether the haze is switched on — and they are siblings, so neither walks up
        // to the other. Both aim at the same place.
        { hit: titanHaze, focus: titan, distance: TITAN_VIEW_DISTANCE },
        { hit: titan, focus: titan, distance: TITAN_VIEW_DISTANCE },
        { hit: iapetus, focus: iapetus, distance: IAPETUS_VIEW_DISTANCE },
    ];

    // Hoisted: `pickTarget` runs on every hover event, and rebuilding this array per
    // event allocated garbage on the mouse's own event rate. The set never changes.
    const clickTargetMeshes = clickTargets.map((t) => t.hit);

    function pickTarget(event: MouseEvent) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(clickTargetMeshes, true);
        if (intersects.length === 0) return null;

        // Walk up to whichever registered target owns the mesh that was hit. The hit
        // point comes back too, because a click on the Moon while already parked at it
        // means "put me down *there*".
        for (let node: Object3D | null = intersects[0].object; node; node = node.parent) {
            const match = clickTargets.find((t) => t.hit === node);
            if (match) return { ...match, point: intersects[0].point };
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
    //
    // The hover is throttled because a pick is not cheap — it raycasts against the
    // real 128×128 spheres, so any cursor actually over a planet is tested against
    // 32k triangles in JS — while `mousemove` fires as fast as the pointer reports,
    // which on a trackpad is well past the frame rate. 30Hz is quicker than anyone
    // notices a cursor change and does a fraction of the work. The click path below
    // is deliberately not throttled: that one has to be exact.
    let hoverPickDue = 0;
    renderer.domElement.addEventListener('mousemove', (event: MouseEvent) => {
        if (freeFlight.enabled || moonSurface.active) return;
        const nowMs = performance.now();
        if (nowMs < hoverPickDue) return;
        hoverPickDue = nowMs + 33;
        const picked = pickTarget(event);
        // The Moon stays clickable even once you are parked at it, because there the
        // click means something else — see below.
        const focusable =
            picked !== null &&
            (!isAlreadyObserving(picked.focus, picked.distance) || picked.focus === moon);
        renderer.domElement.style.cursor = focusable ? 'pointer' : 'default';
    });

    renderer.domElement.addEventListener('click', (event: MouseEvent) => {
        if (freeFlight.enabled || moonSurface.active) return;
        const picked = pickTarget(event);

        // Click the Moon from across the system and you fly to it. Click it again once
        // you are there and you land on it, at whichever site is nearest the spot
        // under the cursor — the same gesture reading as "closer" both times.
        if (picked?.focus === moon && isAlreadyObserving(moon, picked.distance)) {
            const local = moon.worldToLocal(picked.point.clone()).normalize();
            setMoonSurface(true, nearestSite(local));
            return;
        }

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

    // Decode the lunar maps into canvases so a landing can read the site's real albedo
    // without stalling on it. Deferred to idle: it is several megabytes of decode that
    // nothing needs until someone presses Land, and it must not land on the intro.
    prepareMoonSurface();

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
                    focusOnObject(earth, EARTH_VIEW_DISTANCE, 1500);
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
                case 'mercury':
                    focusOnObject(mercury, MERCURY_VIEW_DISTANCE, 2500);
                    break;
                case 'venus':
                    focusOnObject(venus, VENUS_VIEW_DISTANCE, 2500);
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
                case 'jupiter':
                    focusOnObject(jupiter, JUPITER_VIEW_DISTANCE, 3000);
                    break;
                case 'io':
                    focusOnObject(io, IO_VIEW_DISTANCE, 3000);
                    break;
                case 'europa':
                    focusOnObject(europa, EUROPA_VIEW_DISTANCE, 3000);
                    break;
                case 'ganymede':
                    focusOnObject(ganymede, GANYMEDE_VIEW_DISTANCE, 3000);
                    break;
                case 'callisto':
                    focusOnObject(callisto, CALLISTO_VIEW_DISTANCE, 3000);
                    break;
                case 'saturn':
                    focusOnObject(saturn, SATURN_VIEW_DISTANCE, 3500);
                    break;
                case 'mimas':
                    focusOnObject(mimas, MIMAS_VIEW_DISTANCE, 3500);
                    break;
                case 'enceladus':
                    focusOnObject(enceladus, ENCELADUS_VIEW_DISTANCE, 3500);
                    break;
                case 'tethys':
                    focusOnObject(tethys, TETHYS_VIEW_DISTANCE, 3500);
                    break;
                case 'dione':
                    focusOnObject(dione, DIONE_VIEW_DISTANCE, 3500);
                    break;
                case 'rhea':
                    focusOnObject(rhea, RHEA_VIEW_DISTANCE, 3500);
                    break;
                case 'titan':
                    focusOnObject(titan, TITAN_VIEW_DISTANCE, 3500);
                    break;
                case 'iapetus':
                    focusOnObject(iapetus, IAPETUS_VIEW_DISTANCE, 3500);
                    break;
                case 'sun':
                    focusOnObject(sun, SUN_RADIUS * 4, 2500);
                    break;
                case 'system':
                    setOrbitsVisible(true);
                    focusOnObject(sun, SYSTEM_VIEW_DISTANCE, 2500, SYSTEM_VIEW_DIRECTION.clone());
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
    let firstFrameRendered = false;
    /** Whether the previous drawn frame was also a target-rate one. */
    let wasChanging = false;

    // Nothing here needs more than 60fps — camera moves are either an eased fly-to
    // or a scale-invariant drift, neither of which reads any smoother at 120. A
    // ProMotion display drives `requestAnimationFrame` at up to 120Hz regardless,
    // which would otherwise run every one of those overdrawn shells twice as often
    // as the scene has any use for. The 1ms slack keeps a 60Hz display from
    // occasionally dropping a frame to timer jitter sitting right at the threshold.
    //
    // The rate itself is the tier's rather than a constant, and it only ever differs on
    // the low tier: 30 there, because on a device that selects it the alternative is not
    // a smoother 60 but a stuttering 40 that also heats the thing up.
    const TARGET_FRAME_INTERVAL_MS = 1000 / quality.targetFps - 1;

    // ...and most of the time it does not need 60 either. At the default "Real" rate
    // Earth turns 0.0042°/s and the Sun's granules evolve off the same clock, so with
    // the camera parked the whole frame is identical to the last one to far under a
    // pixel — and the profile says ~99% of a frame is fragment work, not JS. Redrawing
    // that still image 60 times a second is what keeps a laptop's fans up. So the
    // scene falls back to 15fps whenever nothing is actually changing, and returns to
    // 60 on the first sign that something is: a quarter of the GPU work for an image
    // no different from the one it replaces.
    const IDLE_FRAME_INTERVAL_MS = 1000 / quality.idleFps - 1;
    // Long enough to cover OrbitControls' damping tail and the label opacity fades
    // that follow a camera move, so neither finishes at the idle rate.
    const INPUT_GRACE_MS = 1200;
    // "Real" is 1; the next step up is 3600 (1 hr/s), which spins Earth at 15°/s and
    // genuinely needs the frames. Anything at or below this is static to the eye.
    const STATIC_TIME_SPEED = 60;

    // Only input that can actually change the image counts. A bare hover does not —
    // it moves the cursor and nothing else. `pointerdown` on the document also catches
    // every nav-panel click (toggling the cloud deck, the orbit lines, the time rate),
    // which change the scene without going through a fly-to.
    let lastInputMs = performance.now();
    const markInput = () => { lastInputMs = performance.now(); };
    document.addEventListener('keydown', markInput, { passive: true });
    document.addEventListener('wheel', markInput, { passive: true });

    // A held pointer is tracked as a state rather than inferred from `buttons` on each
    // pointermove, because a drag has to hold the full frame rate for as long as it
    // lasts and a missed event would drop it back to the idle rate mid-gesture — which
    // is the one moment the smoothness is actually being watched. `pointerup` is on the
    // window, not the canvas: release the button off the edge of the canvas after a
    // drag and the canvas never hears about it, leaving the scene pinned at 60fps for
    // the rest of the session.
    let pointerHeld = false;
    document.addEventListener('pointerdown', () => { pointerHeld = true; markInput(); }, { passive: true });
    window.addEventListener('pointerup', () => { pointerHeld = false; markInput(); }, { passive: true });
    window.addEventListener('pointercancel', () => { pointerHeld = false; }, { passive: true });
    // A drag interrupted by a tab switch never delivers its pointerup.
    window.addEventListener('blur', () => { pointerHeld = false; });

    // The nav panel's live clock — the one piece of chrome that prints an actual
    // simulation value rather than a label. `Intl.DateTimeFormat` is built once,
    // not per frame, since constructing one is not free and the format never
    // changes.
    const navClockFormatter = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: 'UTC',
    });
    const navClockValue = document.getElementById('nav-clock-value');
    let navClockRefreshDue = 0;

    function updateNavClock(nowMs: number, simulatedDate: Date) {
        if (!navClockValue || nowMs < navClockRefreshDue) return;
        navClockRefreshDue = nowMs + 200; // 5 Hz — a clock does not need 60.
        // en-CA's default order is already YYYY-MM-DD; `format` still interleaves
        // it with a comma before the time, which reads wrong for a UTC stamp.
        const parts = navClockFormatter.formatToParts(simulatedDate);
        const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
        navClockValue.textContent =
            `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} UTC`;
    }

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

    let surfaceHudRefreshDue = 0;

    function updateSurfaceHud(nowMs: number) {
        const state = moonSurface.state;
        if (!state || nowMs < surfaceHudRefreshDue) return;
        surfaceHudRefreshDue = nowMs + 250; // the Sun moves 0.5° an *hour* up here

        const degrees = (radians: number) => (radians * 180) / Math.PI;

        if (surfaceSunValue) {
            const altitude = degrees(state.sunAltitude);
            surfaceSunValue.textContent =
                altitude >= 0
                    ? `${altitude.toFixed(1)}° up`
                    : `${(-altitude).toFixed(1)}° below`;
        }
        if (surfaceEarthValue) {
            // Phase and altitude together, because between them they are the whole
            // answer to "where is home from here" — and on the far side there is no
            // answer at all.
            surfaceEarthValue.textContent = state.earthVisible
                ? `${Math.round(state.earthPhase * 100)}% lit · ${degrees(state.earthAltitude).toFixed(0)}° up`
                : 'never rises';
        }

        // The panel swaps which half of itself is showing, so only one of these two
        // branches is ever on screen.
        surfaceHud?.classList.toggle('surface-hud--driving', moonSurface.driving);

        if (moonSurface.driving) {
            const { driver } = moonSurface;
            if (surfaceSpeedValue) {
                surfaceSpeedValue.textContent = `${(Math.abs(driver.speed) * 3.6).toFixed(1)} km/h`;
            }
            if (surfaceTripValue) {
                surfaceTripValue.textContent = formatRange(driver.odometer);
            }
            if (surfaceHomeValue) {
                // Range and bearing back to where you were set down — the LRV's own
                // navigation box, which is the only reason it was safe to drive out of
                // sight of the lunar module. Dead reckoned, because there is no GPS up
                // there and no magnetic field to hang a compass on.
                const range = Math.hypot(driver.position.x, driver.position.z);
                const bearing = Math.atan2(-driver.position.x, driver.position.z);
                surfaceHomeValue.textContent =
                    range < 1 ? 'you are here' : `${formatRange(range)} ${compass(bearing)}`;
            }
        } else if (surfaceRoverValue) {
            const distance = moonSurface.roverDistance;
            surfaceRoverValue.textContent =
                distance <= 4.5 ? 'press R to board' : `${formatRange(distance)} away`;
        }
    }

    function formatRange(metres: number): string {
        return metres >= 1000 ? `${(metres / 1000).toFixed(2)} km` : `${Math.round(metres)} m`;
    }

    /** Radians east of north to a point of the compass. */
    function compass(bearing: number): string {
        const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const index = Math.round(((bearing * 180) / Math.PI / 45 + 8) % 8);
        return points[index % 8];
    }

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);

        // rAF is already throttled in a backgrounded tab, but a window that is merely
        // occluded by another one is not reliably covered — and that is exactly the
        // case where the scene is burning a GPU nobody is looking at.
        if (document.hidden) {
            return;
        }

        const frameMs = performance.now();
        // The two first-person modes are the ones the eye actually tracks, and a fly-to
        // is a moving camera by definition. Past those, it comes down to whether the
        // user has touched anything recently and whether the clock is running fast
        // enough for the motion to show.
        const sceneIsChanging =
            freeFlight.enabled ||
            moonSurface.active ||
            focusAnimation !== null ||
            pointerHeld ||
            frameMs - lastInputMs < INPUT_GRACE_MS ||
            (!isPaused() && getTimeSpeed() > STATIC_TIME_SPEED);

        // Skip the whole frame — physics and all — until the interval has passed,
        // rather than let a high-refresh display drive it faster. `lastFrameMs` only
        // advances on a frame that actually proceeds, so realDelta below still
        // measures real elapsed time between rendered frames, not between rAF ticks.
        const frameInterval = sceneIsChanging ? TARGET_FRAME_INTERVAL_MS : IDLE_FRAME_INTERVAL_MS;
        if (frameMs - lastFrameMs < frameInterval) {
            return;
        }

        // Clamped for the same reason the simulated clock is: a backgrounded tab
        // should not resume by hurling the camera across the solar system.
        const frameGapMs = frameMs - lastFrameMs;
        const realDelta = Math.min(frameGapMs / 1000, 0.1);
        lastFrameMs = frameMs;

        // Only the run of frames drawn back-to-back at the *target* rate says anything
        // about what the GPU can manage: the gap out of an idle frame is the idle
        // interval by construction, and the first target-rate frame after one is
        // measuring the wait rather than the work. See `createAdaptiveResolution`.
        if (sceneIsChanging && wasChanging) adaptiveResolution.sample(frameGapMs);
        else adaptiveResolution.reset();
        wasChanging = sceneIsChanging;

        // Everything below is a pure function of this one date, which is what keeps
        // the spin, both orbits and the seasons consistent at any time speed.
        const now = advanceClock();
        // Ahead of the surface-mode branch below, since the clock reads the same
        // whichever render path the rest of the frame takes.
        updateNavClock(frameMs, now);

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

        venusOrbitPosition(now, venusSystem.position);
        // Same call as Mars's above, and it runs backwards purely because the rate
        // constant behind it is negative. At "1 day/s" you can watch the deck stream
        // round the planet while the ground under it barely stirs — four days against
        // 243, and both turning the wrong way.
        venus.rotation.y = venusSpinAngle(now);
        venusClouds.rotation.y = venusCloudAngle(now);

        mercuryOrbitPosition(now, mercurySystem.position);
        mercury.rotation.y = mercurySpinAngle(now);

        jupiterOrbitPosition(now, jupiterSystem.position);
        // 870.5°/day. At "1 hr/s" Jupiter visibly turns — two and a half rotations per
        // Earth day, on the largest disc in the scene.
        jupiter.rotation.y = jupiterSpinAngle(now);

        // The same call the Martian moons use, four more times. Io comes round every
        // 42 hours and Callisto takes 16.7 days, so at "1 day/s" the inner three
        // visibly beat against each other in the 4:2:1 rhythm nothing here imposes.
        satelliteState(IO, now, io.position, io.quaternion);
        satelliteState(EUROPA, now, europa.position, europa.quaternion);
        satelliteState(GANYMEDE, now, ganymede.position, ganymede.quaternion);
        satelliteState(CALLISTO, now, callisto.position, callisto.quaternion);

        saturnOrbitPosition(now, saturnSystem.position);
        saturn.rotation.y = saturnSpinAngle(now);

        // The same call a third time, seven more. Mimas gets round in 22.6 hours and
        // Iapetus takes 79 days, so at "1 day/s" the inner five blur while Titan and
        // Iapetus crawl — which is the actual shape of this system, and the reason the
        // resonances among the inner five took so long to be noticed.
        satelliteState(MIMAS, now, mimas.position, mimas.quaternion);
        satelliteState(ENCELADUS, now, enceladus.position, enceladus.quaternion);
        satelliteState(TETHYS, now, tethys.position, tethys.quaternion);
        satelliteState(DIONE, now, dione.position, dione.quaternion);
        satelliteState(RHEA, now, rhea.position, rhea.quaternion);
        satelliteState(TITAN, now, titan.position, titan.quaternion);
        // Position only, never orientation. The deck is a fluid with no prime meridian
        // to lock to the ground, and Titan's stratosphere superrotates besides, so it
        // would not keep step even if it had one. Venus's deck answers the same problem
        // the other way, with a rotation rate of its own; here there is nothing on the
        // haze sharp enough for a rate to be visible, so it is simply not claimed.
        titanHaze.position.copy(titan.position);
        satelliteState(IAPETUS, now, iapetus.position, iapetus.quaternion);

        // Position and facing together — both moons are tidally locked, so the
        // direction back to Mars that places them is also the direction that aims
        // them. Phobos gets round three times a sol, which is fast enough to watch
        // even at the "Real" time setting.
        satelliteState(PHOBOS, now, phobos.position, phobos.quaternion);
        satelliteState(DEIMOS, now, deimos.position, deimos.quaternion);

        // Standing on the Moon *replaces* the render rather than adding to it, which
        // is the one reason it costs less than the view it interrupts. The orbital
        // block above still had to run — the Sun's place in that sky, Earth's place
        // and Earth's phase all come out of it — but the markers, the labels, the
        // orbit camera and the main render are all skipped from here.
        if (moonSurface.active) {
            // The surface scene sets its own light levels and is always at 1 AU, so it
            // must not inherit an exposure raised for somewhere out at Jupiter — which
            // it otherwise would, since this branch returns before `updateExposure`.
            exposure = 1;
            renderer.toneMappingExposure = 1;
            scene.updateMatrixWorld(true);
            moonSurface.update(realDelta, {
                moonPosition: moon.getWorldPosition(surfaceMoonPosition),
                moonQuaternion: moon.getWorldQuaternion(surfaceMoonQuaternion),
                earthPosition: earth.getWorldPosition(surfaceEarthPosition),
                earthQuaternion: earth.getWorldQuaternion(surfaceEarthQuaternion),
            });
            moonSurface.render();
            updateSurfaceHud(frameMs);
            return;
        }

        // Sunlight direction, now genuinely geometric: each planet sits somewhere on
        // its orbit and the Sun is at the origin, so this is simply the way back.
        const earthWorldPosition = earthSystem.getWorldPosition(scratchA);
        const sunDirection = scratchB.copy(earthWorldPosition).negate().normalize();

        atmosphereSunDirection.copy(sunDirection);
        // The Earth shader compares the sun against a view-space normal, so the
        // direction has to be carried into view space alongside it.
        earthSunDirectionView.copy(sunDirection).transformDirection(camera.matrixWorldInverse);

        // Mars needs its own: it is a whole orbit away, so the direction back to the
        // Sun is nothing like Earth's. Venus likewise, one orbit the other way.
        marsAtmosphereSunDirection.copy(marsSystem.position).negate().normalize();
        venusAtmosphereSunDirection.copy(venusSystem.position).negate().normalize();

        // Saturn needs the sun direction in two *local* frames rather than in world
        // space, which is what keeps both shadow tests to a few lines of arithmetic:
        // in the ring mesh's frame the ring normal is exactly +Z, and in the planet
        // mesh's frame the pole is exactly +Y, so each test reduces to one component of
        // one vector. The alternative is passing a change of basis into both shaders and
        // doing the work per fragment.
        //
        // The matrices are current: the block above moved the whole system, and the
        // orbit camera's own `updateMatrixWorld` has not run yet, so these are flushed
        // here rather than relying on the later one.
        saturnSystem.updateMatrixWorld(true);
        scratchSaturnSun.copy(saturnSystem.position).negate().normalize();
        ringSolarDistance.value = saturnSystem.position.length();
        // Directions, so only the rotation matters — hence the world quaternion rather
        // than `worldToLocal`, which would apply the translation as well.
        ringSunDirectionLocal
            .copy(scratchSaturnSun)
            .applyQuaternion(saturnRings.getWorldQuaternion(scratchQuaternion).invert());
        saturnSunDirectionLocal
            .copy(scratchSaturnSun)
            .applyQuaternion(saturn.getWorldQuaternion(scratchQuaternion).invert());
        // A position, not a direction, so this one really does need the full inverse
        // transform. It is what tells the ring shader which side of the plane you are on
        // — the difference between the B ring being the brightest thing in the system
        // and the darkest.
        ringCameraPositionLocal.copy(camera.position);
        saturnRings.worldToLocal(ringCameraPositionLocal);

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

        const systemWideView = camera.position.distanceTo(sun.position) > EARTH_ORBIT_RADIUS * 8;
        setZoomButtonsVisible(systemWideView && !freeFlight.enabled);

        // Every label's world position, distance and screen point, read exactly once.
        //
        // This used to be derived where it was needed, which meant `getWorldPosition`
        // was called 22 times in the first pass, up to 22 more in the second, and up to
        // 22 x 22 inside the second pass's overlap test — some five hundred times a
        // frame for twenty-two positions. It is not a cheap call: it walks the object's
        // parent chain recomputing world matrices on the way down, and half of these
        // objects are three deep. The projection also allocated a `Vector3` per label
        // per frame and the pass allocated an object literal per label on screen, all of
        // which the collector then had to pick up sixty times a second.
        const clientWidth = renderer.domElement.clientWidth;
        const clientHeight = renderer.domElement.clientHeight;
        let onScreenCount = 0;

        for (let i = 0; i < labelCount; i++) {
            const label = labels[i];
            const position = label.body.getWorldPosition(scratchTarget);
            const cameraDistance = camera.position.distanceTo(position);
            labelDistance[i] = cameraDistance;
            labelObserving[i] =
                controls.target.distanceTo(position) < label.radius * 1.2 &&
                cameraDistance < label.radius * 12
                    ? 1
                    : 0;
            // Everything else here is a body you can always find; the analemma is an
            // overlay you might have switched off, and its chip shouldn't linger
            // once the curve it's labelling is gone.
            labelForcedHidden[i] = label.body === analemmaAnchor && !analemmaVisible ? 1 : 0;
            // Projected in place rather than into a clone — `project` mutates, and both
            // things the unprojected position was wanted for have already been read.
            position.project(camera);
            labelX[i] = (position.x * 0.5 + 0.5) * clientWidth;
            labelY[i] = (-position.y * 0.5 + 0.5) * clientHeight;
            if (position.z >= -1 && position.z <= 1) labelOnScreen[onScreenCount++] = i;
        }

        for (let i = 0; i < labelCount; i++) {
            const label = labels[i];
            fadeLabel(
                i,
                labelForcedHidden[i] || labelObserving[i] || labelDistance[i] > label.hideBeyond
                    ? 0
                    : 1
            );
        }

        for (let n = 0; n < onScreenCount; n++) {
            const i = labelOnScreen[n];
            const x = labelX[i];
            const y = labelY[i];
            const thisDistance = labelDistance[i];
            let overlap = false;
            for (let m = 0; m < onScreenCount; m++) {
                const other = labelOnScreen[m];
                if (other === i) continue;
                const dx = x - labelX[other];
                const dy = y - labelY[other];
                // Compared squared, which keeps `Math.hypot` out of the one genuinely
                // quadratic loop in the frame. It is carefully written to avoid
                // intermediate overflow and correspondingly slow — several times the
                // cost of the multiply it replaces, for a threshold test that never
                // needed the exact distance.
                if (dx * dx + dy * dy < LABEL_OVERLAP_PX * LABEL_OVERLAP_PX) {
                    if (thisDistance <= labelDistance[other]) overlap = true;
                    break;
                }
            }
            const hiddenBySystem = systemWideView || thisDistance > labels[i].hideBeyond;
            fadeLabel(
                i,
                labelForcedHidden[i] || labelObserving[i] || overlap || hiddenBySystem ? 0 : 1
            );
        }

        // --- Camera ---
        // The scene graph has moved this frame, so world positions must be current
        // before the camera reads them.
        scene.updateMatrixWorld(true);

        updateNearestBody();
        updateNearPlane();
        updateExposure(realDelta);

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

        // The one thing worth reporting exactly once: draw calls for a real frame have
        // now been issued, which is where shader compilation actually stalls (paid
        // synchronously, inside this very `render()` call, the first time each material
        // is used) — everything before this point was setup, not pixels.
        if (!firstFrameRendered) {
            firstFrameRendered = true;
            onFirstFrame?.();

            // Open on the whole system, then fly straight in to Earth, so the first
            // thing you see is where Earth actually sits before the camera commits to
            // it. Routed through the same `focusOnObject` as the nav buttons rather
            // than a bespoke path: it re-derives Earth's position every frame, which
            // matters here more than anywhere else, since Earth moves a long way along
            // its orbit during a fly-to this long.
            //
            // Scheduled from *this* moment rather than from `initScene()` returning,
            // which is what it did before `onFirstFrame` existed. That version's clock
            // started at setup-complete, before a pixel had been drawn, so on a scene
            // slow enough to stall the splash it could equally stall this: the 800ms
            // hold would elapse while the canvas was still blank, and the fly-to could
            // be mid-flight or already finished by the time the splash lifted — the
            // exact "system view, then Earth" shot this hold exists to guarantee would
            // never be seen. Tied to the real first frame, the hold and the splash's
            // fade always start from the same moment, however long getting there took.
            window.setTimeout(() => {
                // A nav button or a click on a body during the hold has already started
                // its own fly-to, and free flight means the user is driving: either way
                // the intro is no longer what they asked for.
                if (focusAnimation || freeFlight.enabled) return;

                // Marked active only now, with the flight, because until it starts the
                // honest answer to "where is the camera" is the system view, not Earth.
                document.querySelector('.nav-btn[data-target="earth"]')?.classList.add('active');
                focusOnObject(earth, EARTH_VIEW_DISTANCE, INTRO_FLIGHT_DURATION);
            }, INTRO_HOLD_DURATION);
        }
    }

    // Handle window resize
    window.addEventListener('resize', () => {
        const { width, height } = getSize();
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        labelRenderer.setSize(width, height);
        // The surface mode keeps its own camera — same canvas, different scene.
        moonSurface.resize(width, height);
        // A resize reallocates the drawing buffer and stalls a frame or two doing it,
        // which is not the GPU telling us anything about how hard the scene is.
        adaptiveResolution.reset();
    });

    animate();
}
