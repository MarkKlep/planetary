import {
    DirectionalLight,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    PerspectiveCamera,
    Quaternion,
    Scene,
    SphereGeometry,
    SRGBColorSpace,
    TextureLoader,
    Vector3,
} from 'three';
import { latLonToDirection } from '../../../geo';
import { NIGHT_LIGHTS_FALLOFF, SUN_RADIUS } from '../../../constants/planets.const';
import type { LandingSite } from './sites';

/**
 * The sky over the landing site.
 *
 * Two things hang in it, and between them they are most of the reason to stand here.
 *
 * **Earth does not move.** The Moon is tidally locked, so from a given spot on the
 * near side Earth sits at a fixed point in the sky and stays there — it does not rise,
 * it does not set, and over a month it wanders only the few degrees of libration.
 * Where it sits is set entirely by the observer's coordinates: overhead at (0°, 0°),
 * on the horizon at 90° of longitude, and below it forever on the far side. None of
 * that is imposed here. It falls out of taking the real direction from the Moon to
 * the Earth and expressing it in the observer's own horizon frame.
 *
 * **And it runs the opposite phase.** Earth is lit by the same Sun as the ground
 * underfoot, so a full Moon seen from Earth is a new Earth seen from the Moon.
 * Nothing here computes a phase; there is a light and there is a sphere.
 *
 * ## Why the sky is a separate scene
 *
 * One depth buffer cannot hold a 0.1 m near plane and a 400 km star dome at the same
 * time — precision goes as z²/(near·2²⁴), so terrain 6 km out would z-fight itself
 * into confetti. So the sky is rendered first, with its own camera and its own
 * near/far, the depth buffer is cleared, and the ground is drawn over the top. Which
 * incidentally gets the occlusion right for nothing: the ground goes down second, so
 * it covers Earth exactly when Earth is below the horizon.
 */

/**
 * How far out the sky objects are placed. Arbitrary — they are angular objects, and
 * only the ratio of their size to this matters — but it has to sit comfortably inside
 * the sky camera's planes and inside the borrowed starfield.
 */
const SKY_DISTANCE = 100000;

/** Standing field of view. Wider than this and a first-person view starts to distort. */
export const SURFACE_FOV = 60;
/** A long look at Earth — roughly Apollo's 500 mm lens on 70 mm film. */
export const SKY_ZOOM_FOV = 11;

const textureLoader = new TextureLoader();

/** Sun direction at *Earth*, in the sky camera's view space. See `buildEarth`. */
const earthSunDirectionView = new Vector3(0, 0, 1);

export interface SkyContext {
    /** Where the Moon is, in the main scene's world frame. */
    moonPosition: Vector3;
    moonQuaternion: Quaternion;
    earthPosition: Vector3;
    earthQuaternion: Quaternion;
}

export interface SkyState {
    /** Unit vectors in the local scene frame: +X east, +Y up, -Z north. */
    sunDirection: Vector3;
    sunAltitude: number;
    sunAzimuth: number;
    earthDirection: Vector3;
    earthAltitude: number;
    earthAzimuth: number;
    /** Lit fraction of Earth's disc, 0 (new) to 1 (full). */
    earthPhase: number;
    /** Radians. Swings 14% over a month, because the Moon's orbit is an ellipse. */
    earthAngularDiameter: number;
    earthVisible: boolean;
}

export interface Sky {
    readonly scene: Scene;
    readonly camera: PerspectiveCamera;
    update(context: SkyContext): SkyState;
    dispose(): void;
}

function buildEarth(): Mesh {
    const dayMap = textureLoader.load('/textures/earth_day.jpg');
    dayMap.colorSpace = SRGBColorSpace;
    const nightMap = textureLoader.load('/textures/earth_night.jpg');
    nightMap.colorSpace = SRGBColorSpace;

    const material = new MeshStandardMaterial({ map: dayMap, roughness: 1, metalness: 0 });

    // The same patch `earth.ts` carries, cut down to what survives at this size, and
    // for the same reason: a plain `emissiveMap` would glow through the daylit face
    // too. Earth is 1.9° across from here — about 34 pixels at the standing field of
    // view — so none of this shows until you zoom, and then it is the whole picture.
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uNightMap = { value: nightMap };
        shader.uniforms.uSunDirectionView = { value: earthSunDirectionView };

        shader.fragmentShader =
            `
            uniform sampler2D uNightMap;
            uniform vec3 uSunDirectionView;
            ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            /* glsl */ `
            #include <emissivemap_fragment>
            {
                float sunAlignment = dot(normalize(normal), normalize(uSunDirectionView));
                float nightAmount = smoothstep(${NIGHT_LIGHTS_FALLOFF.toFixed(3)}, -${NIGHT_LIGHTS_FALLOFF.toFixed(3)}, sunAlignment);

                vec3 raw = texture2D(uNightMap, vMapUv).rgb;
                vec3 cityLights = max(raw - 0.035, vec3(0.0)) * 1.7;
                cityLights *= clamp((raw.r - raw.b) * 3.0 + 0.55, 0.0, 1.0);

                totalEmissiveRadiance += cityLights * nightAmount;
            }
            `
        );
    };

    // A unit sphere; the real angular size goes on as a scale every frame, because
    // the Moon's orbit is eccentric enough that Earth's disc genuinely swells and
    // shrinks by 14% between perigee and apogee.
    return new Mesh(new SphereGeometry(1, 48, 48), material);
}

export function createSky(site: LandingSite): Sky {
    const scene = new Scene();
    // Near and far chosen for the sky alone, which is the entire point of the second
    // pass: nothing here is closer than 100 km or further than the star dome.
    const camera = new PerspectiveCamera(SURFACE_FOV, 1, 1000, 800000);

    // --- the observer's horizon frame -------------------------------------
    //
    // Fixed for a site, and built in the Moon mesh's own local frame — the frame the
    // mosaic is painted in, which is what lets `geo.ts` place it. Same trick
    // `analemma.ts` uses: build the basis once in the body's unrotated frame and let
    // the transform already being applied to that body carry it into world space.
    const localUp = latLonToDirection(site.latitude, site.longitude);
    // (0,1,0) is the Moon mesh's own spin axis in its own frame, by definition.
    const localPole = new Vector3(0, 1, 0);
    const localNorth = localPole.clone().addScaledVector(localUp, -localPole.dot(localUp));
    // Degenerate exactly at the poles, where every direction is north and the
    // projection collapses. The prime meridian is the conventional way out.
    if (localNorth.lengthSq() < 1e-8) {
        localNorth.set(1, 0, 0).addScaledVector(localUp, -localUp.x);
    }
    localNorth.normalize();
    const localEast = new Vector3().crossVectors(localNorth, localUp).normalize();

    // Moon-local to scene: a vector's scene components are its projections onto
    // (east, up, north negated), since the scene puts +X east, +Y up and -Z north.
    // `makeBasis` fills *columns*, which builds the scene-to-local map, so the
    // quaternion is inverted to run the way it is wanted.
    const localToScene = new Quaternion()
        .setFromRotationMatrix(
            new Matrix4().makeBasis(localEast, localUp, localNorth.clone().negate())
        )
        .invert();

    const earth = buildEarth();
    scene.add(earth);

    const sun = new Mesh(
        new SphereGeometry(1, 24, 24),
        // No atmosphere means no glow: from here the Sun is a hard-edged disc on a
        // black sky and nothing softens its rim. `toneMapped: false` stops ACES from
        // rolling the one genuinely blown-out thing in the scene down to grey.
        new MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
    );
    scene.add(sun);

    // Lights Earth and nothing else — the ground has its own, in the other scene.
    const sunLight = new DirectionalLight(0xfff5e8, 3.4);
    scene.add(sunLight);
    scene.add(sunLight.target);

    const worldToMoon = new Quaternion();
    const sunDirection = new Vector3();
    const earthDirection = new Vector3();
    const toSunFromEarth = new Vector3();
    const toMoonFromEarth = new Vector3();

    /** A world direction, rewritten in the observer's horizon frame. */
    function intoScene(direction: Vector3): Vector3 {
        return direction.applyQuaternion(worldToMoon).applyQuaternion(localToScene);
    }

    const altitudeOf = (direction: Vector3) =>
        Math.asin(Math.max(-1, Math.min(1, direction.y)));
    // Azimuth from north, turning through east — the convention `analemma.ts` uses.
    const azimuthOf = (direction: Vector3) => Math.atan2(direction.x, -direction.z);

    function update(context: SkyContext): SkyState {
        worldToMoon.copy(context.moonQuaternion).invert();

        // Sunlight is geometric everywhere in this project: the Sun is at the world
        // origin, so the way to it is simply the way back.
        sunDirection.copy(context.moonPosition).negate().normalize();
        const sunDistance = context.moonPosition.length();
        intoScene(sunDirection);

        earthDirection.subVectors(context.earthPosition, context.moonPosition);
        const earthDistance = earthDirection.length();
        earthDirection.normalize();
        intoScene(earthDirection);

        // Phase angle at Earth, between the Sun and the observer. The lit fraction of
        // a sphere is (1 + cos α)/2 — no phase model, just the geometry.
        toSunFromEarth.copy(context.earthPosition).negate().normalize();
        toMoonFromEarth.subVectors(context.moonPosition, context.earthPosition).normalize();
        const earthPhase = (1 + toSunFromEarth.dot(toMoonFromEarth)) / 2;

        // Angular sizes taken live rather than from a table: both really do vary, the
        // Sun by 3.4% over a year and Earth by 14% over a month.
        const earthAngularRadius = Math.atan(1 / earthDistance);
        const sunAngularRadius = Math.atan(SUN_RADIUS / sunDistance);

        earth.position.copy(earthDirection).multiplyScalar(SKY_DISTANCE);
        earth.scale.setScalar(SKY_DISTANCE * Math.tan(earthAngularRadius));
        // Object-local straight to scene, in one composition: Earth's own orientation
        // carried into the main scene's world frame, out of that into the Moon's
        // frame, and out of that into the observer's horizon frame.
        earth.quaternion
            .copy(localToScene)
            .multiply(worldToMoon)
            .multiply(context.earthQuaternion);

        sun.position.copy(sunDirection).multiplyScalar(SKY_DISTANCE);
        sun.scale.setScalar(SKY_DISTANCE * Math.tan(sunAngularRadius));

        // Earth is lit from where the Sun is relative to *Earth*, which differs from
        // the direction at the Moon by up to 0.15°. Invisible, and it costs nothing.
        earthSunDirectionView.copy(toSunFromEarth);
        intoScene(earthSunDirectionView);
        sunLight.target.position.copy(earth.position);
        sunLight.position.copy(earth.position).addScaledVector(earthSunDirectionView, SKY_DISTANCE);
        // The shader compares it against a view-space normal, so it has to be carried
        // into view space alongside — the caller has already aimed this camera.
        camera.updateMatrixWorld();
        earthSunDirectionView.transformDirection(camera.matrixWorldInverse);

        const earthAltitude = altitudeOf(earthDirection);
        // A disc is up when its *centre* is within its own radius of the horizon.
        const earthVisible = earthAltitude > -earthAngularRadius;
        earth.visible = earthVisible;

        return {
            sunDirection,
            sunAltitude: altitudeOf(sunDirection),
            sunAzimuth: azimuthOf(sunDirection),
            earthDirection,
            earthAltitude,
            earthAzimuth: azimuthOf(earthDirection),
            earthPhase,
            earthAngularDiameter: earthAngularRadius * 2,
            earthVisible,
        };
    }

    return {
        scene,
        camera,
        update,
        dispose() {
            earth.geometry.dispose();
            (earth.material as MeshStandardMaterial).dispose();
            sun.geometry.dispose();
            (sun.material as MeshBasicMaterial).dispose();
        },
    };
}
