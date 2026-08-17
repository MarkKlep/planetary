import {
    CanvasTexture,
    ClampToEdgeWrapping,
    DoubleSide,
    LinearMipmapLinearFilter,
    Mesh,
    RingGeometry,
    SRGBColorSpace,
    ShaderMaterial,
    Vector3,
} from 'three';
import {
    EARTH_ORBIT_RADIUS,
    EARTH_RADIUS_KM,
    SATURN_EQUATORIAL_RADIUS,
    SATURN_POLAR_RADIUS_KM,
    SATURN_EQUATORIAL_RADIUS_KM,
    SATURN_RING_INNER,
    SATURN_RING_INNER_KM,
    SATURN_RING_OUTER,
    SATURN_RING_OUTER_KM,
    SUN_INTENSITY,
} from '../../constants/planets.const';

/**
 * Saturn's rings.
 *
 * The one structure in this project that is genuinely **one-dimensional**. Every other
 * surface here is a function of latitude and longitude and wants an equirectangular
 * map; the rings are a function of orbital radius and nothing else. There is no
 * longitude structure to speak of — the particles are on independent circular orbits
 * and shear any azimuthal feature out within hours — so what is drawn here is a radial
 * profile 8,192 samples wide and one sample tall, which is not a simplification of the
 * subject but the shape of it.
 *
 * That is also why this is generated rather than photographed, and why that is the
 * *stronger* option here rather than a fallback. A photograph of the rings is taken at
 * one illumination and one viewing angle, and the rings change completely with both —
 * the B ring is the brightest thing in the system from the sunlit side and the darkest
 * from the unlit side. Baking one of those into a texture would fix the answer to a
 * question this scene can actually ask. So the profile carries measured *optical
 * depths*, and the appearance comes out of them.
 *
 * ## Thickness
 *
 * There isn't any. The rings are around ten metres thick against 270,000 km across —
 * an aspect ratio of 3×10⁷, which is to say that a sheet of paper standing in for them
 * would need to be four kilometres wide. Ten metres is 1.6×10⁻⁶ scene units, four
 * orders of magnitude below a pixel at any distance you could see the rings from. So
 * this is a mathematical plane with no thickness at all, and the fact that the whole
 * system vanishes when Saturn's 26.7° tilt carries it edge-on — every ~15 years, most
 * recently in March 2025 — falls out for free instead of being modelled.
 */

// ---------------------------------------------------------------------------
// The radial profile
//
// Boundaries are Cassini-era values in km from Saturn's centre, good to a few km.
// Optical depths are *normal* optical depths from Cassini UVIS and RSS occultations,
// which is the quantity that actually determines how a ring looks: everything below
// works from tau and a single-scattering albedo, and nothing is drawn from a picture.
//
// `albedo` is the single-scattering albedo of the particles, and it is the second
// measured quantity here rather than a colour choice. The B ring's particles are
// nearly pure water ice and throw back most of what hits them; the C ring's and the
// Cassini Division's are visibly dirtier, which is why those two regions read as grey
// and dim next to the B ring even where the geometry is similar.
// ---------------------------------------------------------------------------

interface RingBand {
    name: string;
    /** km from Saturn's centre. */
    inner: number;
    outer: number;
    /** Normal optical depth at the inner and outer edges, interpolated across. */
    tau: [number, number];
    /** Single-scattering albedo of the particles. */
    albedo: number;
    /**
     * How red the band is, 0 to 1. Water ice is neutral; the reddening is tholins and
     * silicate contamination, and it tracks purity — the B ring is both the reddest
     * and the cleanest, which sounds contradictory and is not: the reddening agent is
     * *in* the ice, while the darkening agent is meteoritic dust ground into the dirty
     * regions. Cassini's colour photometry separates the two.
     */
    redness: number;
    /** Amplitude of the sub-table ringlet structure, as a fraction of tau. */
    texture: number;
}

const BANDS: RingBand[] = [
    // The D ring, which for practical purposes is not there: tau of a thousandth, and
    // it was only detected at all in forward-scattered light. Carried because it is the
    // inner boundary of the system and leaving it out would put a hard edge where the
    // real thing fades.
    { name: 'D', inner: 66900, outer: 74510, tau: [0.0005, 0.002], albedo: 0.30, redness: 0.3, texture: 0.6 },

    // The C ring — "crepe ring" to the 19th-century observers who could just make it
    // out against the planet. Optically thin, dirty, and full of narrow structure.
    { name: 'C inner', inner: 74658, outer: 77760, tau: [0.07, 0.10], albedo: 0.26, redness: 0.25, texture: 0.45 },
    { name: 'Colombo Gap', inner: 77760, outer: 77915, tau: [0.02, 0.02], albedo: 0.26, redness: 0.25, texture: 0.1 },
    { name: 'C middle', inner: 77915, outer: 87360, tau: [0.09, 0.12], albedo: 0.26, redness: 0.25, texture: 0.45 },
    { name: 'Maxwell Gap', inner: 87360, outer: 87630, tau: [0.01, 0.01], albedo: 0.26, redness: 0.25, texture: 0.1 },
    { name: 'C outer', inner: 87630, outer: 91975, tau: [0.14, 0.22], albedo: 0.28, redness: 0.25, texture: 0.4 },

    // The B ring: the brightest, thickest, most massive and least understood. Its
    // irregular radial structure — hundreds of alternating bands, the "record grooves"
    // — is real, is not at any resonance, and has no accepted explanation.
    { name: 'B inner', inner: 91975, outer: 98500, tau: [0.5, 2.2], albedo: 0.62, redness: 1.0, texture: 0.28 },
    { name: 'B middle', inner: 98500, outer: 104500, tau: [2.2, 4.5], albedo: 0.65, redness: 1.0, texture: 0.22 },
    { name: 'B outer', inner: 104500, outer: 117507, tau: [3.6, 1.6], albedo: 0.62, redness: 0.95, texture: 0.3 },

    // The Cassini Division, found in 1675 and not actually empty — it is C-ring-like
    // material at a tenth of the B ring's depth, cleared by Mimas's 2:1 resonance.
    { name: 'Huygens Gap', inner: 117507, outer: 118183, tau: [0.03, 0.03], albedo: 0.25, redness: 0.25, texture: 0.5 },
    { name: 'Cassini Division', inner: 118183, outer: 122340, tau: [0.08, 0.12], albedo: 0.25, redness: 0.25, texture: 0.4 },

    // The A ring. Threaded with spiral density waves at Janus, Prometheus and Pandora
    // resonances, which is most of its fine structure.
    { name: 'A inner', inner: 122340, outer: 133410, tau: [0.62, 0.48], albedo: 0.55, redness: 0.8, texture: 0.2 },
    // Encke: 325 km, held open by Pan orbiting inside it — a 28 km moon that clears a
    // lane ten times its own width.
    { name: 'Encke Gap', inner: 133410, outer: 133745, tau: [0.012, 0.012], albedo: 0.5, redness: 0.8, texture: 0.2 },
    { name: 'A middle', inner: 133745, outer: 136505, tau: [0.50, 0.45], albedo: 0.55, redness: 0.8, texture: 0.2 },
    // Keeler: 42 km, held open by Daphnis, a 7 km moon. At the texture width below this
    // gap is under five texels across, which is why the width was chosen as it was.
    { name: 'Keeler Gap', inner: 136505, outer: 136550, tau: [0.02, 0.02], albedo: 0.5, redness: 0.8, texture: 0.1 },
    { name: 'A edge', inner: 136550, outer: 136780, tau: [0.42, 0.35], albedo: 0.55, redness: 0.8, texture: 0.2 },

    // The Roche Division, then the F ring: a 100 km strand shepherded by Prometheus and
    // Pandora, kinked and braided and different every time anyone looks at it.
    { name: 'Roche Division', inner: 136780, outer: 140130, tau: [0.002, 0.002], albedo: 0.4, redness: 0.6, texture: 0.5 },
    { name: 'F', inner: 140130, outer: 140230, tau: [0.12, 0.12], albedo: 0.6, redness: 0.7, texture: 0.3 },
];

/**
 * 8,192 samples across 73,280 km — one texel every 8.9 km.
 *
 * Set by the narrowest feature worth keeping rather than by taste: the Keeler Gap is
 * 42 km wide, so this puts not quite five texels across it, which is the minimum that
 * survives a linear filter as a gap rather than a smudge. Halving it would lose Keeler
 * entirely and start to soften Encke.
 */
const PROFILE_SAMPLES = 8192;

/**
 * Optical depths run to 4.5 in the middle B ring. Stored as `sqrt(tau / TAU_MAX)` and
 * squared back in the shader: eight bits spread linearly over 0–4.5 would quantise the
 * C ring's 0.1 into five levels and turn a smooth ramp into visible terracing, while
 * the square root spends its precision where the values actually are.
 */
const TAU_MAX = 5.0;

/** Deterministic value noise in one dimension, for the sub-table ringlet structure. */
function hash(n: number): number {
    const s = Math.sin(n * 127.1) * 43758.5453123;
    return s - Math.floor(s);
}

function noise1(x: number): number {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return hash(i) * (1 - u) + hash(i + 1) * u;
}

/**
 * Structure below the resolution of the table above.
 *
 * The bands carry the boundaries and the mean depths, which are measured. Between them
 * the real rings are not smooth — the B ring alone has several hundred distinct
 * features and the C ring is threaded with narrow ringlets and plateaux — and drawing
 * a smooth ramp there reads as a painted gradient rather than as a ring. This is
 * fractal rather than surveyed, and it is the same bargain `mars/moons.ts` strikes for
 * Phobos: measured where measurements exist, generated below them.
 */
function ringletDetail(radiusKm: number): number {
    // Wavelengths of roughly 3,000 km down to 90 km, which brackets the range the real
    // structure occupies.
    let value = 0;
    let amplitude = 1;
    let frequency = 1 / 3000;
    for (let octave = 0; octave < 5; octave++) {
        value += amplitude * (noise1(radiusKm * frequency) * 2 - 1);
        amplitude *= 0.55;
        frequency *= 2.3;
    }
    return value;
}

function bandAt(radiusKm: number): RingBand | null {
    for (const band of BANDS) {
        if (radiusKm >= band.inner && radiusKm < band.outer) return band;
    }
    return null;
}

/** Water ice, reddened by tholins. Endpoints from Cassini ISS colour photometry. */
const CLEAN = [1.0, 0.92, 0.78];
const DIRTY = [0.78, 0.76, 0.72];

function buildProfileTexture(): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = PROFILE_SAMPLES;
    canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(PROFILE_SAMPLES, 1);

    const span = SATURN_RING_OUTER_KM - SATURN_RING_INNER_KM;

    for (let i = 0; i < PROFILE_SAMPLES; i++) {
        const radiusKm = SATURN_RING_INNER_KM + ((i + 0.5) / PROFILE_SAMPLES) * span;
        const band = bandAt(radiusKm);

        let tau = 0;
        let albedo = 0;
        let redness = 0;

        if (band) {
            const t = (radiusKm - band.inner) / (band.outer - band.inner);
            tau = band.tau[0] + (band.tau[1] - band.tau[0]) * t;
            tau *= 1 + band.texture * ringletDetail(radiusKm);
            tau = Math.max(tau, 0);
            albedo = band.albedo;
            redness = band.redness;
        }

        // sRGB-encoded so the 8-bit channel spends its precision the way the eye does;
        // the texture is tagged SRGBColorSpace, so the GPU decodes it on sample.
        const encode = (linear: number) =>
            linear <= 0.0031308
                ? linear * 12.92
                : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;

        for (let c = 0; c < 3; c++) {
            const tint = DIRTY[c] + (CLEAN[c] - DIRTY[c]) * redness;
            image.data[i * 4 + c] = Math.round(255 * encode(Math.min(albedo * tint, 1)));
        }
        image.data[i * 4 + 3] = Math.round(255 * Math.sqrt(Math.min(tau / TAU_MAX, 1)));
    }

    ctx.putImageData(image, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    // 8192x1 is a power of two in both dimensions, so mipmaps generate normally — and
    // they are not optional. Seen from anywhere near Saturn's own orbit the whole
    // profile compresses into a handful of pixels, and without mip levels the gaps
    // strobe on and off as the camera moves.
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    return texture;
}

/** Shared with `saturn.ts`, which samples the same optical depths to cast the rings'
 *  shadow onto the planet. */
export const ringProfileTexture = buildProfileTexture();
export const RING_TAU_MAX = TAU_MAX;

// ---------------------------------------------------------------------------
// The mesh
// ---------------------------------------------------------------------------

/**
 * Radial divisions are almost irrelevant — everything that varies with radius varies
 * per *fragment*, out of the profile above — so four is plenty. The 512 angular
 * divisions are what stop the inner edge reading as a polygon: at that count the
 * chord's departure from the circle is 5 km on a 66,900 km radius.
 */
const geometry = new RingGeometry(SATURN_RING_INNER, SATURN_RING_OUTER, 512, 4);

/** Sun direction and camera position in the ring mesh's own frame, written per frame
 *  by `script.ts`. Local rather than world so the shader needs no inverse model
 *  matrix, and because in this frame the ring normal is exactly +Z. */
export const ringSunDirectionLocal = new Vector3(1, 0, 0);
export const ringCameraPositionLocal = new Vector3(0, 0, 1);
/** Distance from the Sun to Saturn, scene units — the rings are lit by the same
 *  inverse-square falloff as everything else and have to compute it themselves. */
export const ringSolarDistance = { value: EARTH_ORBIT_RADIUS * 9.5 };

const material = new ShaderMaterial({
    transparent: true,
    side: DoubleSide,
    // Off, for the reason every other transparent shell here has it off: the rings pass
    // both in front of and behind the planet in the same draw, and a depth write from
    // the near half would punch a hole in the far half.
    depthWrite: false,
    // The shader outputs radiance already multiplied by coverage — see the note on
    // `alpha` below — so the blend has to be ONE, ONE_MINUS_SRC_ALPHA rather than
    // three.js's default SRC_ALPHA.
    premultipliedAlpha: true,
    uniforms: {
        uProfile: { value: ringProfileTexture },
        uInner: { value: SATURN_RING_INNER },
        uOuter: { value: SATURN_RING_OUTER },
        uTauMax: { value: TAU_MAX },
        uSunLocal: { value: ringSunDirectionLocal },
        uCameraLocal: { value: ringCameraPositionLocal },
        uSolarDistance: ringSolarDistance,
        uSunIntensity: { value: SUN_INTENSITY * EARTH_ORBIT_RADIUS ** 2 },
        uEquatorial: { value: SATURN_EQUATORIAL_RADIUS },
        uPolarOverEquatorial: {
            value: SATURN_POLAR_RADIUS_KM / SATURN_EQUATORIAL_RADIUS_KM,
        },
    },
    vertexShader: /* glsl */ `
        varying vec3 vLocal;

        void main() {
            vLocal = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */ `
        precision highp float;

        uniform sampler2D uProfile;
        uniform float uInner;
        uniform float uOuter;
        uniform float uTauMax;
        uniform vec3 uSunLocal;
        uniform vec3 uCameraLocal;
        uniform float uSolarDistance;
        uniform float uSunIntensity;
        uniform float uEquatorial;
        uniform float uPolarOverEquatorial;

        varying vec3 vLocal;

        /**
         * Is this bit of ring inside Saturn's shadow?
         *
         * The single most recognisable thing the rings do, and pure geometry: cast a ray
         * from the fragment toward the Sun and see whether it hits the planet. Saturn is
         * an oblate spheroid, so the z axis is scaled to turn it into a sphere first —
         * and the 10% flattening genuinely shows here, since the shadow's width across
         * the rings is set by the *equatorial* radius while its taper near the ansae is
         * set by the polar one.
         *
         * The softness is not decoration either: the Sun is a disc of about 0.056° from
         * Saturn, which spreads the penumbra over roughly a thousand kilometres of ring.
         */
        float planetShadow() {
            vec3 p = vec3(vLocal.x, vLocal.y, 0.0);
            vec3 s = normalize(vec3(uSunLocal.xy, uSunLocal.z / uPolarOverEquatorial));

            float along = dot(p, s);
            // The ring is always outside the planet, so both roots share a sign: the
            // planet can only be in the way if it lies in the +s direction.
            if (along > 0.0) return 1.0;

            float perpendicular = sqrt(max(dot(p, p) - along * along, 0.0));
            return smoothstep(uEquatorial * 0.995, uEquatorial * 1.02, perpendicular);
        }

        void main() {
            float radius = length(vLocal.xy);
            float u = (radius - uInner) / (uOuter - uInner);
            if (u < 0.0 || u > 1.0) discard;

            vec4 profile = texture2D(uProfile, vec2(u, 0.5));
            float tau = profile.a * profile.a * uTauMax;
            if (tau < 1e-5) discard;

            vec3 toCamera = normalize(uCameraLocal - vLocal);

            // Cosines of the solar incidence and the emission angle, measured off the
            // ring plane's own normal — which in this frame is exactly +Z.
            float muSun = abs(uSunLocal.z);
            float muView = abs(toCamera.z);
            // Floored because both go to zero as the rings turn edge-on, and the
            // slant depths below diverge there. At the crossing the rings are under a
            // pixel wide anyway.
            muSun = max(muSun, 0.002);
            muView = max(muView, 0.002);

            // How much of the background this patch of ring hides. Note it is the
            // *slant* depth that matters: the rings are far more opaque seen at a
            // grazing angle than face-on, which is why the ansae look solid.
            float alpha = 1.0 - exp(-tau / muView);

            // Single-scattering radiance, Chandrasekhar's plane-parallel result. Two
            // cases, and the difference between them is the most striking thing about
            // the rings: from the sunlit side you see light *reflected*, and the thick
            // B ring is the brightest thing in the system; from the unlit side you see
            // light *filtered through*, the B ring goes nearly black, and the C ring
            // and the Cassini Division — the parts that look empty from the front —
            // become the brightest things there are. Nothing switches that over; it
            // falls out of which side of the plane the Sun and the camera are on.
            float brightness;
            if (uSunLocal.z * toCamera.z > 0.0) {
                brightness = (muSun / (muSun + muView))
                    * (1.0 - exp(-tau * (1.0 / muView + 1.0 / muSun)));
            } else {
                // Removable singularity at muSun == muView; the limit there is
                // (tau/mu)*exp(-tau/mu), which is what the guarded branch evaluates.
                float difference = muSun - muView;
                if (abs(difference) < 1e-4) {
                    brightness = (tau / muSun) * exp(-tau / muSun);
                } else {
                    brightness = (muSun / difference)
                        * (exp(-tau / muSun) - exp(-tau / muView));
                }
            }

            brightness *= 0.25 * planetShadow();

            // I/F is a ratio against a normally illuminated Lambert surface, so it
            // becomes radiance the same way every other body here does: incident solar
            // irradiance over pi. That keeps the rings on the same photometric footing
            // as the MeshStandardMaterial planets rather than at an invented exposure.
            float irradiance = uSunIntensity / (uSolarDistance * uSolarDistance);
            vec3 radiance = profile.rgb * brightness * irradiance * 0.3183098862;

            // Premultiplied: rgb is the light this patch *adds*, alpha is how much of
            // what is behind it the patch takes away. The two are independent, which is
            // exactly the case a thin scattering layer needs and the case ordinary
            // alpha blending cannot express.
            gl_FragColor = vec4(radiance, alpha);

            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        }
    `,
});

export const saturnRings = new Mesh(geometry, material);
/**
 * RingGeometry is built in the XY plane with its normal along +Z; the parent axis node
 * carries Saturn's pole along +Y. This lays the rings into the equatorial plane.
 *
 * Applied to the **object** rather than baked into the geometry with `rotateX`, which
 * is not a stylistic preference: every calculation in the shader above is written in
 * the mesh's own frame and depends on the ring plane being local XY and the ring normal
 * being exactly local +Z. Baking the rotation moves the vertices into XZ and leaves the
 * shader taking its radius in the wrong plane, which draws two opposed wedges instead of
 * an annulus. `getWorldQuaternion` and `worldToLocal` in script.ts both carry this
 * rotation, so the uniforms arrive in the frame the shader expects.
 */
saturnRings.rotation.x = -Math.PI / 2;
/** Rendered after the planet, so the half of the annulus in front of Saturn blends
 *  over a disc that is already in the depth buffer. */
saturnRings.renderOrder = 1;

/** Radii in km, for anything that needs to reason about the profile in real units. */
export const RING_INNER_KM = SATURN_RING_INNER_KM;
export const RING_OUTER_KM = SATURN_RING_OUTER_KM;
/** Width of the whole system in scene units — used to frame the camera on it. */
export const RING_SPAN = (SATURN_RING_OUTER_KM - SATURN_RING_INNER_KM) / EARTH_RADIUS_KM;
