import {
    BufferGeometry,
    BufferAttribute,
    Points,
    PointsMaterial,
    CanvasTexture,
    Group,
    Mesh,
    SphereGeometry,
    ShaderMaterial,
    BackSide,
    AdditiveBlending,
    Color,
    Vector3,
} from 'three';
import { quality } from '../quality';

/**
 * Deep-space background built the way real sky-survey viewers build it: everything
 * is organized around the *galactic plane*. Stars are concentrated into a band, the
 * band brightens and warms toward the galactic centre, and dark dust lanes cut
 * through it. A uniform sprinkle of stars reads as noise; this reads as the sky.
 */

// --- Galactic frame -------------------------------------------------------
// Orthonormal basis: gNorth = pole of the galactic disc, gCenter = direction of
// the galactic core, gEast = the third axis. The dome shader and the star
// distribution share this basis, so the painted band and the stars line up.
// Tilt chosen for composition: the band sweeps diagonally across the frame just
// below Earth at the default camera, rather than sitting flat or off-screen.
const gNorth = new Vector3(0.46, 0.85, -0.20).normalize();
// Seed the core direction toward -Z so the bulge sits in frame at the default
// camera position, then Gram-Schmidt it against the pole.
const gCenter = new Vector3(0.92, 0.0, -0.4);
gCenter.addScaledVector(gNorth, -gCenter.dot(gNorth)).normalize();
const gEast = new Vector3().crossVectors(gNorth, gCenter).normalize();

const SKY_RADIUS = 960;

// --- Star sprites ---------------------------------------------------------

type SpriteProfile = 'compact' | 'soft' | 'flare';

/**
 * Star sprites. The halo is what makes a star read as *bright* rather than just
 * *big* — but a wide halo is wasted on a 2px point, where almost the whole quad
 * lands in the transparent falloff. So small stars get a `compact` profile that
 * keeps its alpha concentrated, and only the large stars get the wide glow.
 */
function createStarSprite(profile: SpriteProfile): CanvasTexture {
    const size = 128;
    const c = size / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const core = ctx.createRadialGradient(c, c, 0, c, c, c);
    if (profile === 'compact') {
        core.addColorStop(0.0, 'rgba(255,255,255,1)');
        core.addColorStop(0.30, 'rgba(255,255,255,1)');
        core.addColorStop(0.55, 'rgba(255,255,255,0.6)');
        core.addColorStop(0.80, 'rgba(255,255,255,0.15)');
        core.addColorStop(1.0, 'rgba(255,255,255,0)');
    } else {
        core.addColorStop(0.0, 'rgba(255,255,255,1)');
        core.addColorStop(0.10, 'rgba(255,255,255,0.98)');
        core.addColorStop(0.22, 'rgba(255,255,255,0.62)');
        core.addColorStop(0.38, 'rgba(255,255,255,0.20)');
        core.addColorStop(0.65, 'rgba(255,255,255,0.05)');
        core.addColorStop(1.0, 'rgba(255,255,255,0)');
    }
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, size, size);

    if (profile === 'flare') {
        // Subtle four-point diffraction flare, only on the handful of brightest stars.
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 2; i++) {
            const grad = ctx.createLinearGradient(i === 0 ? 0 : c, i === 0 ? c : 0, i === 0 ? size : c, i === 0 ? c : size);
            grad.addColorStop(0.0, 'rgba(255,255,255,0)');
            grad.addColorStop(0.42, 'rgba(255,255,255,0.10)');
            grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
            grad.addColorStop(0.58, 'rgba(255,255,255,0.10)');
            grad.addColorStop(1.0, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            if (i === 0) ctx.fillRect(0, c - 1.5, size, 3);
            else ctx.fillRect(c - 1.5, 0, 3, size);
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    return new CanvasTexture(canvas);
}

const compactSprite = createStarSprite('compact');
const softSprite = createStarSprite('soft');
const flareSprite = createStarSprite('flare');

// --- Star colour ----------------------------------------------------------

/** Tanner Helland's blackbody approximation — gives naturally-related star hues. */
function kelvinToColor(kelvin: number): Color {
    const t = kelvin / 100;
    let r: number;
    let g: number;
    let b: number;

    if (t <= 66) {
        r = 255;
        g = 99.4708025861 * Math.log(t) - 161.1195681661;
    } else {
        r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
        g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    }

    if (t >= 66) {
        b = 255;
    } else if (t <= 19) {
        b = 0;
    } else {
        b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    }

    const clamp255 = (v: number) => Math.max(0, Math.min(255, v)) / 255;
    const color = new Color(clamp255(r), clamp255(g), clamp255(b));
    // The eye desaturates faint point sources, so pull everything toward white.
    return color.lerp(new Color(1, 1, 1), 0.45);
}

/** Skewed toward hot blue-white, with a warm minority — matches the naked-eye sky. */
function randomStarColor(): Color {
    const roll = Math.random();
    const kelvin =
        roll < 0.07 ? 2600 + Math.random() * 1200 // rare orange/red
        : roll < 0.25 ? 3800 + Math.random() * 1700 // yellow-white
        : roll < 0.62 ? 5500 + Math.random() * 2000 // white
        : 7500 + Math.random() * 6500; // blue-white
    return kelvinToColor(kelvin);
}

// --- Star distribution ----------------------------------------------------

function gaussian(): number {
    // Box-Muller
    let u = 0;
    while (u === 0) u = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

/**
 * Direction sampled with galactic-latitude concentration. `spread` is the
 * standard deviation in radians away from the plane; small values hug the band.
 */
function galacticDirection(spread: number, target: Vector3): Vector3 {
    const lon = Math.random() * Math.PI * 2;
    const lat = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, gaussian() * spread));
    const cosLat = Math.cos(lat);

    return target
        .set(0, 0, 0)
        .addScaledVector(gCenter, cosLat * Math.cos(lon))
        .addScaledVector(gEast, cosLat * Math.sin(lon))
        .addScaledVector(gNorth, Math.sin(lat));
}

/** Uniform over the sphere — the halo population that fills the rest of the sky. */
function uniformDirection(target: Vector3): Vector3 {
    const theta = Math.random() * Math.PI * 2;
    const z = Math.random() * 2 - 1;
    const r = Math.sqrt(1 - z * z);
    return target.set(r * Math.cos(theta), r * Math.sin(theta), z);
}

interface StarLayerOptions {
    count: number;
    size: number;
    /** Fraction of stars that belong to the galactic band vs. the uniform halo. */
    bandFraction: number;
    /** Angular thickness (radians) of the band for this layer. */
    bandSpread: number;
    /** Overall brightness multiplier for the layer. */
    brightness: number;
    profile: SpriteProfile;
}

/**
 * The tier's share of a layer's population.
 *
 * Points are the cheapest thing in the scene per *vertex* and among the most expensive
 * per *pixel*: every one of the 17,760 is an alpha-blended sprite drawn with depth
 * writes off, so there is no early-Z and every star costs its full area in fragments
 * whether or not something is already in front of it. Thinning the field is therefore a
 * fill-rate saving rather than a geometry one, which is why it is worth doing at all.
 *
 * The floor of 12 is there so that the flare layer — 60 stars at the top tier — does not
 * thin to a handful and leave the sky visibly missing its brightest points, which is the
 * one part of the field the eye keeps a count of.
 */
function population(count: number): number {
    return quality.starFraction >= 1 ? count : Math.max(12, Math.round(count * quality.starFraction));
}

function createStarLayer({
    count,
    size,
    bandFraction,
    bandSpread,
    brightness,
    profile,
}: StarLayerOptions): Points {
    count = population(count);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const dir = new Vector3();
    const color = new Color();

    for (let i = 0; i < count; i++) {
        if (Math.random() < bandFraction) galacticDirection(bandSpread, dir);
        else uniformDirection(dir);

        // Jitter the shell radius so layers never form a visible hard sphere.
        const radius = SKY_RADIUS * (0.86 + Math.random() * 0.14);
        positions[i * 3] = dir.x * radius;
        positions[i * 3 + 1] = dir.y * radius;
        positions[i * 3 + 2] = dir.z * radius;

        // Apparent magnitude follows a power law — many faint, few brilliant — but
        // keep a high floor: below ~0.3 luminance an additive point on black is
        // effectively invisible, which is what made earlier versions look empty.
        const magnitude = Math.pow(Math.random(), 1.5);
        color.copy(randomStarColor()).multiplyScalar(brightness * (0.45 + magnitude * 0.55));
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));

    const material = new PointsMaterial({
        size,
        map: profile === 'compact' ? compactSprite : profile === 'flare' ? flareSprite : softSprite,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        // Held out of tone mapping, for the same reason `sizeAttenuation` is off: this
        // is a backdrop at effectively infinite distance, and neither its size nor its
        // brightness has any business changing as you move about the solar system.
        // It matters now that the exposure adapts with distance from the Sun — at
        // Jupiter that is a 27x lift, which would otherwise turn the Milky Way into a
        // white sheet behind the planet it exists to set off.
        toneMapped: false,
    });

    const points = new Points(geometry, material);
    points.renderOrder = -1;
    return points;
}

// --- Milky Way dome -------------------------------------------------------

const galaxyVertexShader = /* glsl */ `
    varying vec3 vDir;
    void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const galaxyFragmentShader = /* glsl */ `
    precision highp float;

    uniform vec3 uGNorth;
    uniform vec3 uGCenter;
    uniform vec3 uGEast;

    varying vec3 vDir;

    float hash13(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.zyx + 31.32);
        return fract((p.x + p.y) * p.z);
    }

    float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x),
                mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
                mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y),
            f.z);
    }

    float fbm(vec3 p) {
        float v = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
            v += amp * noise(p);
            p *= 2.07;
            amp *= 0.5;
        }
        return v;
    }

    void main() {
        vec3 dir = normalize(vDir);

        // Galactic coordinates.
        float w = clamp(dot(dir, uGNorth), -1.0, 1.0);
        float lat = asin(w);                       // 0 at the plane
        float u = dot(dir, uGCenter);
        float v = dot(dir, uGEast);
        float angFromCenter = acos(clamp(u, -1.0, 1.0));

        // Noise domain. (u,v) trace a unit circle around the band, so the stretch
        // on w must stay mild — push it too far and every feature elongates into a
        // parallel smear instead of a star cloud.
        vec3 q = vec3(u, v, w * 1.6);

        // Cheap domain warp, reusing two single-octave samples. This is what turns
        // smooth blobs into the filamentary, turbulent structure real star clouds
        // have; without it the band always looks airbrushed.
        float wx = noise(q * 2.4 + 3.0);
        float wy = noise(q * 2.4 + 17.0);
        vec3 warp = (vec3(wx, wy, wx * wy) - 0.5) * 0.55;

        float clouds = fbm((q + warp) * 5.5 + 11.0);
        float fine   = fbm((q + warp * 1.7) * 13.0 - 5.0);
        float dust   = fbm((q + warp * 1.3) * 8.0 + 27.0);

        // Three nested bands: a wide faint halo, the main milky band, a thin core.
        float wide = exp(-(lat * lat) / (2.0 * 0.42 * 0.42));
        float band = exp(-(lat * lat) / (2.0 * 0.135 * 0.135));
        float core = exp(-(lat * lat) / (2.0 * 0.052 * 0.052));

        // Central bulge around the galactic core direction.
        float bulge = exp(-(angFromCenter * angFromCenter) / (2.0 * 0.40 * 0.40));

        // Mottled star clouds. Fine granularity on top of the broad clumps keeps
        // the band from smearing into featureless streaks.
        float clumps = 0.35 + 1.05 * clouds;
        clumps *= 0.80 + 0.40 * fine;
        // High-frequency grain breaks up the smooth interpolation of the value
        // noise, which otherwise leaves the band looking airbrushed.
        clumps *= 0.86 + 0.28 * noise((q + warp) * 34.0);

        // Dust extinction, plus a pronounced Great Rift hugging the plane. Dark
        // lanes need to go nearly black — the contrast against the star clouds is
        // what makes the band read as structure rather than haze.
        float dustMask = 1.0 - 0.95 * smoothstep(0.36, 0.70, dust);
        float rift = smoothstep(0.30, 0.62, fbm(vec3(u, v, w * 3.0) * 3.0 + 3.7));
        dustMask *= mix(1.0, 0.10, rift * core);

        float milky = (core * 1.05 + band * 0.75 + wide * 0.14) * clumps * dustMask;
        milky += bulge * 0.42 * dustMask * (0.55 + 0.7 * fine);

        // Highlight rolloff. Without it the dense regions clip to a flat wash of
        // colour and every trace of cloud structure disappears into a smear.
        milky = milky / (1.0 + milky * 0.85);

        // Warm, dense star clouds toward the core; cooler blue in the outer arms.
        float centerProx = smoothstep(1.35, 0.10, angFromCenter);
        vec3 tint = mix(vec3(0.52, 0.68, 1.0), vec3(1.0, 0.91, 0.76), centerProx);

        // Faint H-alpha emission knots confined to the plane.
        float halpha = smoothstep(0.66, 0.88, fine) * band;

        vec3 sky = vec3(0.004, 0.006, 0.016);
        vec3 color = sky + tint * milky * 0.55;
        color += vec3(0.62, 0.12, 0.17) * halpha * 0.22;

        // Dither: 8-bit output bands badly across these very dark gradients.
        color += (hash13(vec3(gl_FragCoord.xy, 1.0)) - 0.5) / 255.0;

        gl_FragColor = vec4(color, 1.0);
    }
`;

function createGalaxyDome(): Mesh {
    const material = new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: {
            uGNorth: { value: gNorth },
            uGCenter: { value: gCenter },
            uGEast: { value: gEast },
        },
        vertexShader: galaxyVertexShader,
        fragmentShader: galaxyFragmentShader,
        // Same reasoning as the star layers above — the dome is the backdrop the
        // adaptive exposure is exposing *against*, so it has to hold still.
        toneMapped: false,
    });

    const dome = new Mesh(new SphereGeometry(SKY_RADIUS * 1.05, 32, 24), material);
    dome.renderOrder = -2;
    return dome;
}

// --- Assembled background -------------------------------------------------

const backgroundTexture = new Group();

backgroundTexture.add(createGalaxyDome());

// Dense faint field, tightly bound to the galactic plane — this is what visually
// "fills in" the Milky Way band alongside the painted dome.
backgroundTexture.add(
    createStarLayer({ count: 14000, size: 1.7, bandFraction: 0.72, bandSpread: 0.16, brightness: 0.9, profile: 'compact' })
);
// Mid-brightness stars, looser to the plane.
backgroundTexture.add(
    createStarLayer({ count: 3200, size: 2.6, bandFraction: 0.55, bandSpread: 0.30, brightness: 1.15, profile: 'compact' })
);
// Foreground bright stars, spread across the whole sky.
backgroundTexture.add(
    createStarLayer({ count: 500, size: 5.0, bandFraction: 0.35, bandSpread: 0.55, brightness: 1.4, profile: 'soft' })
);
// A few brilliant flare stars.
backgroundTexture.add(
    createStarLayer({ count: 60, size: 18, bandFraction: 0.25, bandSpread: 0.7, brightness: 1.0, profile: 'flare' })
);

export { backgroundTexture };
