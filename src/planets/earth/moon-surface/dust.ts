import {
    BufferAttribute,
    BufferGeometry,
    Color,
    DynamicDrawUsage,
    NormalBlending,
    Points,
    ShaderMaterial,
    Vector3,
} from 'three';
import { MOON_SURFACE_GRAVITY } from '../../../constants/planets.const';

/**
 * Moon dust — the grains a boot or a wheel throws up.
 *
 * ## Every grain is a projectile
 *
 * This is the whole feature, and it is entirely a consequence of there being no air.
 * Dust kicked up on Earth *hangs*: drag decouples the grains from gravity and
 * turbulence smears them into a cloud that drifts and settles over seconds. None of
 * that happens here. With nothing to push against, every grain leaves the surface on a
 * ballistic arc, follows a clean parabola, and lands — and the whole sheet of them
 * lands at once. It is the most alien thing in the Apollo footage: the rooster tails
 * off the rover's wheels are not plumes, they are sharp arcs of individual grains that
 * rise, turn over, and drop dead onto the surface.
 *
 * ## Which is also why it is nearly free
 *
 * A parabola is a closed form. Given a launch point, a launch velocity and a launch
 * time, a grain's position at any later moment is one multiply-add away — so **no
 * particle is ever simulated on the CPU**. The vertex shader evaluates
 * `p₀ + v₀t − ½gt²ŷ` for every grain every frame, and the CPU's entire job is to write
 * seven floats when a grain is *born* and then leave it alone. There is no per-frame
 * buffer upload, no integration loop, no sort, and no allocation.
 *
 * The physics is why that works. A system with air drag has no closed form, has to be
 * integrated step by step, and would cost exactly what this does not.
 *
 * ## Where the heat would actually come from
 *
 * Not the vertex count — a few thousand points is nothing. Particle systems burn
 * laptops on **fill rate**: soft, alpha-blended sprites overdraw the same pixels over
 * and over with blending on, which means no early-Z rejection. The whole budget here, every grain on
 * screen at the clamp below, is about 570k fragments — half of one 1280x800 screen.
 * The same budget at 80 px a grain would be 38 million, and *that* is what spins the
 * fans up.
 *
 * So the size clamp below is the load-bearing optimisation, not the particle count.
 * Everything else follows from it: grains are small because they are grains.
 */

/**
 * Fixed budget, allocated once and recycled as a ring. Steady-state demand at full speed is about
 * 2,300 — four wheels throwing every 10 cm, each grain staying up the four-odd seconds
 * its launch velocity buys it — so this leaves headroom for a hop landing on top
 * without ever growing.
 */
const CAPACITY = 6000;

/**
 * Apparent grain size, metres. These are not single particles of regolith, which are
 * microns across and individually invisible; each one stands for the clump or streak
 * that the eye actually resolves.
 */
const GRAIN_SIZE_M = 0.07;
/**
 * The clamp that matters. See the note on fill rate above: at this cap the entire
 * budget, all of it on screen at once, covers well under one screen of fragments.
 */
const MAX_GRAIN_PIXELS = 11;

/** Metres of travel between bursts from a single wheel. */
const WHEEL_BURST_SPACING_M = 0.1;
const GRAINS_PER_WHEEL_BURST = 4;
const GRAINS_PER_FOOTFALL = 30;
const GRAINS_PER_IMPACT = 26;

const vertexShader = /* glsl */ `
    uniform float uTime;
    uniform float uGravity;
    /** viewportHeight / (2·tan(fov/2)) — turns a world size into pixels. */
    uniform float uPixelScale;
    uniform float uGrainSize;
    uniform float uMaxPixels;

    attribute vec3 aVelocity;
    attribute float aBirth;

    varying float vFade;

    void main() {
        float age = uTime - aBirth;

        // Lifetime needs no attribute of its own: a grain is back at the height it
        // launched from when t = 2·v_y/g, and with no air there is nothing else that
        // could possibly end its flight. The velocity already says how long it lives.
        float life = max(2.0 * aVelocity.y / uGravity, 0.0001);

        if (age < 0.0 || age > life) {
            // Retired grains are pushed outside the clip volume rather than branched
            // around, so the whole buffer stays one draw with no gaps to manage.
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            vFade = 0.0;
            return;
        }

        vec3 flight = aVelocity * age - vec3(0.0, 0.5 * uGravity * age * age, 0.0);
        vec4 viewPosition = modelViewMatrix * vec4(position + flight, 1.0);
        gl_Position = projectionMatrix * viewPosition;

        gl_PointSize = clamp(
            uGrainSize * uPixelScale / max(-viewPosition.z, 0.05),
            1.0,
            uMaxPixels
        );

        // Grains land, they do not evaporate, so this is *not* a lifetime fade — it is
        // the last tenth of the arc only, and it exists solely to keep a grain from
        // blinking out on a single frame. The sheet still hits the ground together.
        vFade = smoothstep(1.0, 0.9, age / life);
    }
`;

const fragmentShader = /* glsl */ `
    uniform vec3 uColor;
    uniform float uBrightness;
    uniform float uForwardScatter;

    varying float vFade;

    void main() {
        // Round grain with a soft edge. The discard is worth it here: blending has
        // depth writes off and therefore no early-Z, so every fragment kept is one
        // that has to be blended.
        vec2 offset = gl_PointCoord - 0.5;
        float radiusSq = dot(offset, offset);
        if (radiusSq > 0.25) discard;

        float alpha = (1.0 - radiusSq * 4.0) * vFade * 0.9;
        gl_FragColor = vec4(uColor * uBrightness * uForwardScatter, alpha);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
    }
`;

export interface Dust {
    readonly object: Points;
    /** Grains alive right now — for the read-out, and to know when to stop drawing. */
    readonly alive: boolean;
    /**
     * Advance the dust clock and refresh the lighting. Constant cost: it sets four
     * uniforms and does nothing per grain.
     *
     * `viewportHeight` and `fieldOfView` are what turn a grain's world size into
     * pixels, and both change (the long lens especially), so they come in per frame.
     */
    update(
        realDeltaSeconds: number,
        options: {
            sunAltitude: number;
            sunDirection: Vector3;
            viewDirection: Vector3;
            viewportHeight: number;
            fieldOfView: number;
        }
    ): void;
    /** A footfall: a low spray, thrown forward off the toe. */
    footfall(position: Vector3, heading: number, speed: number): void;
    /** Landing from a hop: a ring, thrown outward. */
    impact(position: Vector3, force: number): void;
    /**
     * A wheel throwing a rooster tail. `forward` is the vehicle's heading and `speed`
     * its ground speed — the arc scales with both, because the grains leave the mesh
     * tangentially at wheel speed and nothing slows them afterwards.
     */
    wheelSpray(contact: Vector3, forward: Vector3, speed: number): void;
    /** Tint the grains with the site's own regolith. */
    setAlbedo(albedo: Color): void;
    /** Retire every grain — on landing somewhere else, or on leaving. */
    reset(): void;
    dispose(): void;
}

export function createDust(): Dust {
    const origins = new Float32Array(CAPACITY * 3);
    const velocities = new Float32Array(CAPACITY * 3);
    // Far enough in the past that every slot starts retired.
    const births = new Float32Array(CAPACITY).fill(-1e6);

    const geometry = new BufferGeometry();
    // `BufferAttribute`, not `Float32BufferAttribute` — the typed subclasses run
    // `new Float32Array(array)` on their input, which *copies* it. Handing one of
    // those a live array leaves the emitter writing into a detached buffer the GPU
    // never sees, and the whole system silently renders nothing at all. This is a
    // ring buffer written to every frame; it has to be the same memory.
    const originAttribute = new BufferAttribute(origins, 3);
    const velocityAttribute = new BufferAttribute(velocities, 3);
    const birthAttribute = new BufferAttribute(births, 1);
    originAttribute.setUsage(DynamicDrawUsage);
    velocityAttribute.setUsage(DynamicDrawUsage);
    birthAttribute.setUsage(DynamicDrawUsage);

    geometry.setAttribute('position', originAttribute);
    geometry.setAttribute('aVelocity', velocityAttribute);
    geometry.setAttribute('aBirth', birthAttribute);
    // The grains fly a long way from the launch points the bounds would be computed
    // from, and culling a single object saves nothing anyway.
    geometry.boundingSphere = null;

    const material = new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
            uTime: { value: 0 },
            uGravity: { value: MOON_SURFACE_GRAVITY },
            uPixelScale: { value: 600 },
            uGrainSize: { value: GRAIN_SIZE_M },
            uMaxPixels: { value: MAX_GRAIN_PIXELS },
            uColor: { value: new Color(0.18, 0.18, 0.18) },
            uBrightness: { value: 0 },
            uForwardScatter: { value: 1 },
        },
        transparent: true,
        // Depth-tested so grains go behind the rover and into crater shadows, but not
        // depth-*written*, or each grain would punch a hole in the ones behind it.
        depthWrite: false,
        blending: NormalBlending,
    });

    const object = new Points(geometry, material);
    object.frustumCulled = false;
    object.renderOrder = 2;

    let clock = 0;
    let cursor = 0;
    /** When the last grain still in flight will land — nothing to draw past it. */
    let quietAt = -1;

    const spray = new Vector3();
    const lateral = new Vector3();
    const UP = new Vector3(0, 1, 0);

    /**
     * Write one grain and advance the ring.
     *
     * Only the slots actually written are flagged for upload — at a steady 30 bursts a
     * second that is a few dozen floats per frame rather than the whole 112 KB buffer.
     */
    function launch(x: number, y: number, z: number, velocity: Vector3): void {
        const index = cursor;
        origins[index * 3] = x;
        origins[index * 3 + 1] = y;
        origins[index * 3 + 2] = z;
        velocities[index * 3] = velocity.x;
        velocities[index * 3 + 1] = velocity.y;
        velocities[index * 3 + 2] = velocity.z;
        births[index] = clock;

        originAttribute.addUpdateRange(index * 3, 3);
        velocityAttribute.addUpdateRange(index * 3, 3);
        birthAttribute.addUpdateRange(index, 1);
        originAttribute.needsUpdate = true;
        velocityAttribute.needsUpdate = true;
        birthAttribute.needsUpdate = true;

        // Same closed form the shader uses, so the sleep test can never disagree with
        // what is actually on screen.
        quietAt = Math.max(quietAt, clock + (2 * velocity.y) / MOON_SURFACE_GRAVITY);
        cursor = (cursor + 1) % CAPACITY;
    }

    return {
        object,
        get alive() {
            return clock < quietAt;
        },

        update(realDeltaSeconds, options) {
            // Real seconds, never the simulated clock. A rooster tail at "10 days a
            // second" would be a line of grains leaving the solar system.
            clock += realDeltaSeconds;
            material.uniforms.uTime.value = clock;

            // Nothing in flight means nothing to draw. Standing still costs one
            // comparison a frame and no draw call at all.
            const alive = clock < quietAt;
            object.visible = alive;
            if (!alive) return;

            material.uniforms.uPixelScale.value =
                options.viewportHeight / (2 * Math.tan((options.fieldOfView * Math.PI) / 360));

            // Lit by the same Sun as the ground, and out with it: dust thrown at night
            // is as invisible as everything else down there.
            material.uniforms.uBrightness.value =
                options.sunAltitude > 0 ? 2.2 * Math.min(1, Math.sin(options.sunAltitude) * 3) : 0.05;

            // Fine regolith scatters strongly forward, so a rooster tail seen against
            // the Sun flares and the same tail with the Sun behind you is nearly grey.
            // It is the same asymmetry that makes the surge on the ground, one scatter
            // further out.
            // Positive when the camera is looking *toward* the Sun, which is when
            // sunlight scattered onward by a grain carries on into the lens.
            const towardSun = options.viewDirection.dot(options.sunDirection);
            material.uniforms.uForwardScatter.value = 1 + 1.6 * Math.max(0, towardSun) ** 3;
        },

        footfall(position, heading, speed) {
            // Thrown off the toe, so the spray leans the way the boot was going.
            const forwardX = -Math.sin(heading);
            const forwardZ = -Math.cos(heading);

            // A boot scuffing regolith throws it a surprising distance — several
            // metres in a flat arc, because once the grains are moving there is
            // nothing whatever to slow them down. On Earth the same kick raises a puff
            // that goes nowhere.
            for (let i = 0; i < GRAINS_PER_FOOTFALL; i++) {
                const angle = Math.random() * Math.PI * 2;
                const scatter = 0.35 + Math.random() * 0.5;
                const throwSpeed = 1.2 + speed;
                spray.set(
                    forwardX * throwSpeed + Math.cos(angle) * scatter,
                    0.4 + Math.random() * 0.5,
                    forwardZ * throwSpeed + Math.sin(angle) * scatter
                );
                launch(
                    position.x + (Math.random() - 0.5) * 0.3,
                    position.y + 0.02,
                    position.z + (Math.random() - 0.5) * 0.3,
                    spray
                );
            }
        },

        impact(position, force) {
            for (let i = 0; i < GRAINS_PER_IMPACT; i++) {
                // Outward and up, in a ring — a boot landing displaces regolith
                // sideways rather than throwing it ahead.
                const angle = (i / GRAINS_PER_IMPACT) * Math.PI * 2 + Math.random() * 0.4;
                const outward = (0.7 + Math.random() * 0.9) * force;
                spray.set(
                    Math.cos(angle) * outward,
                    (0.5 + Math.random() * 0.7) * force,
                    Math.sin(angle) * outward
                );
                launch(position.x, position.y + 0.02, position.z, spray);
            }
        },

        wheelSpray(contact, forward, speed) {
            // Where a grain leaves the wheel decides the whole shape of the tail, and
            // the intuitive answer is wrong. The mesh picks regolith up at the contact
            // patch and carries it round; it lets go up the *rear* of the wheel, where
            // the rim is climbing. At that point the rim's own motion is straight up
            // and the hub is moving forward, so a grain leaves going up **and forward**
            // — never backward. The tail only ends up behind the rover because the
            // rover drives out from under it while it is still in the air.
            //
            // Adhesion and the give in the mesh mean grains come off at well under rim
            // speed, which is what keeps the arc to a couple of metres instead of
            // throwing it five. Fast enough, though, that the fenders were structural
            // rather than cosmetic: Apollo 17 lost one and had to rebuild it out of
            // laminated lunar maps before the dust buried the radiators.
            lateral.crossVectors(UP, forward);

            for (let i = 0; i < GRAINS_PER_WHEEL_BURST; i++) {
                spray
                    .set(0, 0, 0)
                    .addScaledVector(UP, speed * (0.5 + Math.random() * 0.42))
                    .addScaledVector(forward, speed * (0.2 + Math.random() * 0.4))
                    // A narrow fan, not a cone. The tail is a sheet thrown by a wheel,
                    // and spreading it sideways turns it into a haze.
                    .addScaledVector(lateral, speed * (Math.random() - 0.5) * 0.25);
                launch(contact.x, contact.y + 0.05, contact.z, spray);
            }
        },

        setAlbedo(albedo) {
            // Well above the albedo it is made of, and that is not a cheat. A patch of
            // ground presents one face at one angle to the Sun; a grain in flight is a
            // free particle catching light on every side and throwing it in every
            // direction, and a tail is thousands of them stacked along the line of
            // sight. The tails in the Apollo footage are conspicuously brighter than
            // the surface they came off, and this is why.
            material.uniforms.uColor.value.copy(albedo).multiplyScalar(4.5);
        },

        reset() {
            births.fill(-1e6);
            birthAttribute.clearUpdateRanges();
            birthAttribute.needsUpdate = true;
            quietAt = -1;
            cursor = 0;
            object.visible = false;
        },

        dispose() {
            geometry.dispose();
            material.dispose();
        },
    };
}

export { WHEEL_BURST_SPACING_M, GRAINS_PER_WHEEL_BURST };
