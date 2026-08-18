import {
    ClampToEdgeWrapping,
    InstancedBufferAttribute,
    InstancedBufferGeometry,
    BufferAttribute,
    Color,
    DynamicDrawUsage,
    LinearFilter,
    LinearMipmapLinearFilter,
    Mesh,
    MaxEquation,
    NoColorSpace,
    OrthographicCamera,
    RGBAFormat,
    Scene,
    ShaderMaterial,
    CustomBlending,
    OneFactor,
    Texture,
    UnsignedByteType,
    WebGLRenderTarget,
    WebGLRenderer,
} from 'three';
import { LRV_WHEEL_WIDTH_M } from '../../../constants/planets.const';
import { quality } from '../../../quality';

/**
 * The ground remembers.
 *
 * Nothing else on the Moon does. There is no wind to drift a print over, no rain to
 * wash it out and no biology to grow through it, so the only thing that ever removes a
 * bootprint is the next impact large enough to turn the regolith over — which at
 * Tranquility Base means the prints Armstrong left are expected to still be legible in
 * something like ten million years. A surface that takes no impression is the one
 * detail that most gives away a lunar render, and it is the reason Apollo's most
 * reproduced photograph is of a footprint rather than of a person.
 *
 * ## Why a print is dark, which is not the obvious reason
 *
 * The instinct is that it is a shadow, and at a low Sun part of it is. But prints are
 * plainly visible in the Apollo photography at *zero* phase, looking straight down-Sun
 * where nothing casts a shadow toward the camera at all, and they are darkest exactly
 * there. The cause is the same microstructure `terrain.ts` invokes for the opposition
 * surge, read backwards.
 *
 * Undisturbed regolith is a fairy-castle structure — grains bridged into an absurdly
 * porous open froth, some 45% void. That porosity is what produces the surge: at zero
 * phase every grain hides its own shadow and the surface flares. Stepping on it
 * collapses the froth. A boot leaves ground that is *denser*, and denser ground has
 * fewer hidden shadows to hide, so it loses most of its surge and goes dark against a
 * neighbourhood that still has all of it.
 *
 * So compaction here does three things at once, which is why it is one number:
 *
 *  - it **suppresses the surge**, which is most of the contrast and all of it at low
 *    phase — the print is a hole in the halo around your own shadow;
 *  - it **darkens the albedo** a little, from the packing itself;
 *  - it carries a **bowl and a rim**, which is the part that casts shadows and takes
 *    over as the Sun drops.
 *
 * Together they behave the way prints actually do: strongest looking down-Sun, still
 * there in cross light, mostly relief when the Sun is on the horizon.
 *
 * ## Where it lives
 *
 * Not in the geometry. `terrain.ts`'s polar grid spaces its rings 6.3% apart, so vertex
 * spacing is 2 cm underfoot but 63 cm by the time you are 10 m out and 2.8 m at the far
 * edge of the boulder field — a 34 cm print falls clean between two rings almost
 * everywhere it could be left. Displacing that mesh cannot represent a footprint, and
 * neither can a decal laid on top of it, which was tried: a flat quad on generated
 * ground z-fights it, and a separate material lit separately from the surface it sits
 * on reads as a sticker rather than as the ground.
 *
 * What works is putting it in the *same fragment*. This is a world-anchored field that
 * the ground's own shader samples, so a print is not a thing lying on the surface — it
 * is a property of the surface, lit by the same light through the same photometric
 * function, and there is no second surface to fight for depth.
 *
 * ## What it costs, which is almost nothing
 *
 * Stamps are accumulated on the GPU. A boot or a wheel writes one instanced quad into a
 * render target that is never cleared, and the target is only drawn into on frames
 * where somebody actually moved — standing still costs a comparison. There is no
 * CPU-side height field, no per-frame texture upload, and no history to walk: the
 * accumulated field *is* the history, in one texture, at a fixed cost whether you have
 * taken four steps or driven for an hour.
 *
 * `MaxEquation` is what makes that safe. Blending stamps with the usual source-alpha
 * mix would make the result depend on how many frames a wheel happened to be drawn in,
 * so a laggy frame would leave a fainter rut; taking the maximum instead makes every
 * channel monotonic and order-independent — deeper wins, more compacted wins, and
 * driving over your own tracks twice is idempotent rather than cumulative. All three
 * channels are stored positive for that reason, and the signed relief is reassembled as
 * `rim − bowl` on the way out.
 */

/**
 * How much ground remembers, metres across, centred on the landing point.
 *
 * The trade is against texel size and it is a hard one. Prints want resolution and the
 * rover wants area: a 128 m field at 2048² gives 6.25 cm a texel, which puts three
 * texels across a 23 cm wheel rut — a clean line — and about five along a boot. That is
 * enough for a print to read as a print in a line of prints at the two to five metres
 * you actually look at your own, and not enough for tread. Which is the same trade
 * `terrain.ts` makes with its crater field and `moons.ts` makes with Phobos: the sole's
 * cleats are below the resolution of what is being stored, so they are not claimed.
 *
 * Drive past 64 m from where you landed and the field fades out rather than ending on a
 * square edge. Ground nobody has crossed has nothing on it, which is the correct
 * picture everywhere on the Moon except six small patches.
 */
export const TRACK_FIELD_M = 128;
const TRACK_TEXELS = quality.trackTexels;
const TRACK_TEXEL_M = TRACK_FIELD_M / TRACK_TEXELS;

/**
 * Depth of the bowl a boot presses in, metres. Apollo 11 found the surface firmer than
 * the pre-flight estimates and left prints a centimetre or so deep; the crews at the
 * later, dustier sites sank several. Two centimetres is the middle of that, and it is
 * a third of a texel — deep enough that the gradient across one texel is a real 18° of
 * tilt, which is what makes the relief catch a low Sun.
 */
export const TRACK_BOWL_M = 0.02;
/**
 * The rim of displaced regolith pushed up around it — and much lower than the bowl is
 * deep, because most of what a boot does to regolith is *compact* it rather than shift
 * it sideways. Set anywhere near the bowl depth it stops reading as a rim and starts
 * reading as a berm running the length of the trail.
 */
export const TRACK_RIM_M = 0.005;

/** How much of the opposition surge compacted ground loses. See the note above. */
export const TRACK_SURGE_LOSS = 0.75;
/**
 * ...and the plain darkening that goes with the packing, which is the term that has to
 * carry a print when nothing else can.
 *
 * Set at 0.84 first, and a Sun sweep over one fixed trail showed why that is not
 * enough: prints were sharp at 24° of Sun elevation and had vanished completely by 59°.
 * That is the right *direction* — every Apollo landing was flown at a Sun between 10°
 * and 15° precisely so the crews could read relief, and lunar features famously wash
 * out toward full Moon — but not the right magnitude, because a 16% darkening is the
 * same size as the vertex mottle already scattered over the ground and simply
 * disappears into it. The traverses at the Apollo sites are still legible from orbit at
 * illuminations where the relief is long gone.
 *
 * A quarter darker is at the strong end of what is reported for disturbed regolith
 * (10–30%), and is what makes the trail survive a high Sun without ever reading as
 * paint.
 */
export const TRACK_ALBEDO_FACTOR = 0.74;

/**
 * Stamps buffered between commits. Driving flat out lays 45 wheel-segments a second per
 * wheel, so four wheels at 60 fps is three quads a frame; this is two seconds of that,
 * which is more headroom than a dropped frame can use.
 */
const CAPACITY = 256;

const KIND_BOOT = 0;
const KIND_WHEEL = 1;

/** Apollo's lunar overshoe, which is a good deal bigger than the boot inside it. */
const BOOT_LENGTH_M = 0.34;
const BOOT_WIDTH_M = 0.16;
/**
 * The quad is drawn larger than the sole it carries, because the rim of thrown-up
 * regolith lies *outside* the print and would otherwise be clipped at the corners.
 */
const SOLE_INSET = 0.68;
/** Length of one rut segment. Stamped closer together than this, so segments merge. */
const WHEEL_SEGMENT_M = 0.18;
const WHEEL_INSET = 0.7;

const vertexShader = /* glsl */ `
    attribute vec2 aCentre;
    /** Unit heading in world XZ — passed as a vector, so no angle convention crosses over. */
    attribute vec2 aForward;
    /** Half-extent of the quad: along the heading, then across it. */
    attribute vec2 aSize;
    attribute float aKind;
    attribute float aStrength;

    uniform float uFieldExtent;

    varying vec2 vLocal;
    varying float vKind;
    varying float vStrength;
    varying vec2 vSeed;

    void main() {
        vLocal = position.xy;
        vKind = aKind;
        vStrength = aStrength;
        vSeed = aCentre;

        vec2 across = vec2(-aForward.y, aForward.x);
        vec2 world = aCentre + aForward * (position.x * aSize.x) + across * (position.y * aSize.y);

        // Straight to clip space. The field is an axis-aligned square in world XZ, so
        // going through a camera would only be a chance to get a convention wrong:
        // texture u is world x and texture v is world z, and the ground shader
        // reconstructs exactly this.
        gl_Position = vec4((world / (uFieldExtent * 0.5)), 0.0, 1.0);
    }
`;

const fragmentShader = /* glsl */ `
    precision highp float;

    varying vec2 vLocal;
    varying float vKind;
    varying float vStrength;
    varying vec2 vSeed;

    float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
    }

    void main() {
        float compaction;
        float bowl;
        float rim;

        // Regolith does not take a clean impression — the edge of a print crumbles as
        // the grains shear. Without this every print is a perfect stencil of the same
        // sole, which reads as a repeated sprite the moment there are three of them.
        //
        // Kept small on purpose. A print is under three texels across its width, so
        // noise on the edge is noise at the *texel* frequency, and past about this it
        // stops looking like crumbling and starts looking like the print was cut with
        // pinking shears.
        float ragged = (hash21(vLocal * 7.0 + vSeed) - 0.5) * 0.05;

        if (vKind < 0.5) {
            // A sole is a rounded rectangle, not an ellipse: the superellipse holds
            // square-ish sides and takes the corners off, which at five texels long is
            // the whole of the shape information there is room for.
            vec2 q = abs(vLocal) / ${SOLE_INSET.toFixed(3)};
            float d = pow(pow(q.x, 3.0) + pow(q.y, 3.0), 0.3333) + ragged;

            compaction = 1.0 - smoothstep(0.84, 1.0, d);
            bowl = compaction;
            // A ring of displaced material just outside the sole.
            rim = smoothstep(0.96, 1.12, d) * (1.0 - smoothstep(1.12, 1.45, d));
        } else {
            // A rut is uniform along its length, so consecutive segments merge into one
            // continuous line with no seam. Only the sides get a rim.
            float across = abs(vLocal.y) / ${WHEEL_INSET.toFixed(3)} + ragged;

            compaction = 1.0 - smoothstep(0.8, 1.0, across);
            bowl = compaction;
            rim = smoothstep(0.96, 1.12, across) * (1.0 - smoothstep(1.12, 1.5, across));
        }

        // Positive, monotonic, and blended with MAX — see the note on the module.
        gl_FragColor = vec4(compaction * vStrength, bowl * vStrength, rim * vStrength, 1.0);
    }
`;

export interface Tracks {
    /** Bound into the surface material; see `terrain.ts`. */
    readonly map: Texture;
    /** A boot going down, at a point on the ground and pointing somewhere. */
    boot(x: number, z: number, forwardX: number, forwardZ: number, strength?: number): void;
    /** One segment of rut under a wheel. */
    wheel(x: number, z: number, forwardX: number, forwardZ: number): void;
    /** Fold everything stamped since the last call into the field. */
    commit(renderer: WebGLRenderer): void;
    /** Untouched ground again — a new landing site, or leaving. */
    reset(renderer: WebGLRenderer): void;
    dispose(): void;
}

export function createTracks(): Tracks {
    const target = new WebGLRenderTarget(TRACK_TEXELS, TRACK_TEXELS, {
        format: RGBAFormat,
        type: UnsignedByteType,
        // Data, not colour — the three channels are a compaction and two heights, and
        // an sRGB transfer on the way out would bend all of them.
        colorSpace: NoColorSpace,
        depthBuffer: false,
        stencilBuffer: false,
        // Mipmapped and anisotropic, which is not a nicety — it is the difference
        // between a trail and a mess. A metre of ground is six pixels wide by the time
        // it is 40 m away, so a point sample lands on a random one of the sixteen
        // texels it should have averaged, and a relief signal reconstructed at a random
        // phase turns a line of prints into hard black slashes that crawl as you move.
        // Averaging is also the physically right answer: a screen pixel covering many
        // prints and the untouched ground between them really is only partly compacted,
        // so the trail fades with distance instead of aliasing — the same argument
        // `terrain.ts` makes for letting the detail normal map mip away.
        //
        // three.js regenerates the chain at the end of every `render()` into a target,
        // so this costs one mipmap pass per committed frame and nothing at all while
        // the observer is standing still.
        generateMipmaps: true,
        minFilter: LinearMipmapLinearFilter,
        magFilter: LinearFilter,
        // Four rather than the detail map's eight. Anisotropy costs its full multiple
        // of taps precisely where the ground is grazing, which down here is most of the
        // frame, and past four the difference on a trail is not visible.
        anisotropy: 4,
        wrapS: ClampToEdgeWrapping,
        wrapT: ClampToEdgeWrapping,
    });

    const centres = new Float32Array(CAPACITY * 2);
    const forwards = new Float32Array(CAPACITY * 2);
    const sizes = new Float32Array(CAPACITY * 2);
    const kinds = new Float32Array(CAPACITY);
    const strengths = new Float32Array(CAPACITY);

    const centreAttribute = new InstancedBufferAttribute(centres, 2);
    const forwardAttribute = new InstancedBufferAttribute(forwards, 2);
    const sizeAttribute = new InstancedBufferAttribute(sizes, 2);
    const kindAttribute = new InstancedBufferAttribute(kinds, 1);
    const strengthAttribute = new InstancedBufferAttribute(strengths, 1);
    for (const attribute of [
        centreAttribute,
        forwardAttribute,
        sizeAttribute,
        kindAttribute,
        strengthAttribute,
    ]) {
        attribute.setUsage(DynamicDrawUsage);
    }

    const geometry = new InstancedBufferGeometry();
    // One quad, corners at +/-1, shaped per instance in the vertex shader.
    geometry.setAttribute(
        'position',
        new BufferAttribute(
            new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
            3
        )
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute('aCentre', centreAttribute);
    geometry.setAttribute('aForward', forwardAttribute);
    geometry.setAttribute('aSize', sizeAttribute);
    geometry.setAttribute('aKind', kindAttribute);
    geometry.setAttribute('aStrength', strengthAttribute);

    const material = new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { uFieldExtent: { value: TRACK_FIELD_M } },
        depthTest: false,
        depthWrite: false,
        blending: CustomBlending,
        // Factors are ignored by GL for MIN/MAX, but they have to be something.
        blendSrc: OneFactor,
        blendDst: OneFactor,
        blendEquation: MaxEquation,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: OneFactor,
        blendEquationAlpha: MaxEquation,
    });

    const mesh = new Mesh(geometry, material);
    // Its bounds are meaningless — the quads are positioned entirely in the shader.
    mesh.frustumCulled = false;

    const stampScene = new Scene();
    stampScene.add(mesh);
    // Any camera will do: the vertex shader writes clip space directly.
    const stampCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const half = TRACK_FIELD_M / 2;
    const clearColour = new Color();
    let pending = 0;
    let cleared = false;

    function stamp(
        x: number,
        z: number,
        forwardX: number,
        forwardZ: number,
        halfAlong: number,
        halfAcross: number,
        kind: number,
        strength: number
    ): void {
        // Silently outside the field, which is most of the Moon.
        if (pending >= CAPACITY || Math.abs(x) > half || Math.abs(z) > half) return;

        const length = Math.hypot(forwardX, forwardZ) || 1;
        centres[pending * 2] = x;
        centres[pending * 2 + 1] = z;
        forwards[pending * 2] = forwardX / length;
        forwards[pending * 2 + 1] = forwardZ / length;
        sizes[pending * 2] = halfAlong;
        sizes[pending * 2 + 1] = halfAcross;
        kinds[pending] = kind;
        strengths[pending] = strength;
        pending++;
    }

    return {
        map: target.texture,

        boot(x, z, forwardX, forwardZ, strength = 1) {
            stamp(
                x,
                z,
                forwardX,
                forwardZ,
                BOOT_LENGTH_M / 2 / SOLE_INSET,
                BOOT_WIDTH_M / 2 / SOLE_INSET,
                KIND_BOOT,
                strength
            );
        },

        wheel(x, z, forwardX, forwardZ) {
            stamp(
                x,
                z,
                forwardX,
                forwardZ,
                WHEEL_SEGMENT_M / 2,
                LRV_WHEEL_WIDTH_M / 2 / WHEEL_INSET,
                KIND_WHEEL,
                1
            );
        },

        commit(renderer) {
            if (pending === 0) return;

            for (const attribute of [
                centreAttribute,
                forwardAttribute,
                sizeAttribute,
                kindAttribute,
                strengthAttribute,
            ]) {
                attribute.addUpdateRange(0, pending * attribute.itemSize);
                attribute.needsUpdate = true;
            }
            geometry.instanceCount = pending;

            const previousTarget = renderer.getRenderTarget();
            const previousAutoClear = renderer.autoClear;
            // Never cleared: the target *is* the accumulated history, and the only
            // thing drawn into it is whatever was stamped since the last frame.
            renderer.autoClear = false;
            renderer.setRenderTarget(target);
            renderer.render(stampScene, stampCamera);
            renderer.setRenderTarget(previousTarget);
            renderer.autoClear = previousAutoClear;

            pending = 0;
            cleared = false;
        },

        reset(renderer) {
            pending = 0;
            if (cleared) return;

            const previousTarget = renderer.getRenderTarget();
            // The clear colour is the renderer's, not this target's, so it has to go
            // back — `moon-surface.ts` clears the frame with it every render.
            const previousClearAlpha = renderer.getClearAlpha();
            renderer.getClearColor(clearColour);
            renderer.setRenderTarget(target);
            renderer.setClearColor(0x000000, 0);
            renderer.clear(true, false, false);
            renderer.setClearColor(clearColour, previousClearAlpha);
            renderer.setRenderTarget(previousTarget);
            cleared = true;
        },

        dispose() {
            target.dispose();
            geometry.dispose();
            material.dispose();
        },
    };
}

export { TRACK_TEXEL_M };
