import {
    DirectionalLight,
    Mesh,
    ShaderMaterial,
    SphereGeometry,
    Sprite,
    SpriteMaterial,
    CanvasTexture,
    AdditiveBlending,
    BackSide,
    Group,
    Color,
} from 'three';
import { SUN_RADIUS, SUN_INTENSITY, SUN_ROTATION_PERIOD_DAYS } from './constants/planets.const';
import { daysSinceJ2000 } from './orbits';

/**
 * Radial falloff for the glare, drawn once into a canvas.
 *
 * `power` shapes the tail: a high power gives a tight core, a low one a broad haze.
 * Layering two of these is how the glare gets a bright centre without the halo
 * ending in a visible hard edge.
 */
function createGlowTexture(power: number, tint: string): CanvasTexture {
    const size = 256;
    const c = size / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const image = ctx.createImageData(size, size);
    const [r, g, b] = tint.split(',').map(Number);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = (x - c) / c;
            const dy = (y - c) / c;
            const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
            const falloff = Math.pow(1 - d, power);
            const i = (y * size + x) * 4;
            image.data[i] = r;
            image.data[i + 1] = g;
            image.data[i + 2] = b;
            image.data[i + 3] = Math.round(255 * falloff);
        }
    }
    ctx.putImageData(image, 0, 0);

    return new CanvasTexture(canvas);
}

/**
 * The photosphere.
 *
 * Two things do most of the work in making a star read as a star rather than a flat
 * white circle:
 *
 *  - **Limb darkening.** We see shallower, cooler gas near the edge of the disc, so
 *    it is markedly dimmer and redder than the centre — the limb is only about a
 *    third as bright. A uniformly lit disc is the single biggest tell of a fake sun.
 *  - **Granulation.** The surface is the top of a convection layer, so it is tiled
 *    with bright cells separated by darker lanes rather than being smooth.
 */
const photosphereMaterial = new ShaderMaterial({
    // The Sun is the light source, so it is unlit by construction, and it opts out of
    // tone mapping so it stays blazing instead of being rolled off with everything else.
    toneMapped: false,
    uniforms: {
        uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
        varying vec3 vNormalW;
        varying vec3 vViewW;
        varying vec3 vLocal;

        void main() {
            vLocal = normalize(position);
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vNormalW = normalize(mat3(modelMatrix) * normal);
            vViewW = normalize(cameraPosition - worldPosition.xyz);
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
    `,
    fragmentShader: /* glsl */ `
        precision highp float;

        uniform float uTime;

        varying vec3 vNormalW;
        varying vec3 vViewW;
        varying vec3 vLocal;

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
                p *= 2.11;
                amp *= 0.5;
            }
            return v;
        }

        void main() {
            // mu = cos(angle between the surface normal and the line of sight).
            // 1 at the centre of the disc, 0 right at the limb.
            float mu = clamp(dot(normalize(vNormalW), normalize(vViewW)), 0.0, 1.0);

            // Quadratic limb darkening, coefficients roughly those measured for the
            // Sun in visible light. Leaves the limb at ~35% of central brightness.
            float u1 = 0.84;
            float u2 = -0.20;
            float darkening = 1.0 - u1 * (1.0 - mu) - u2 * (1.0 - mu) * (1.0 - mu);
            darkening = clamp(darkening, 0.0, 1.0);

            // Convection cells, plus a slower large-scale supergranulation. Granules
            // churn over minutes, so a little drift keeps it from looking printed on.
            float granules = fbm(vLocal * 90.0 + uTime * 0.35);
            float superGranules = fbm(vLocal * 16.0 - uTime * 0.12);
            float texture = 0.88 + 0.17 * granules + 0.08 * superGranules;

            // Limb darkening is stronger at short wavelengths, so the edge of the
            // disc is not just dimmer but distinctly oranger than the centre.
            vec3 core = vec3(1.00, 0.98, 0.94);
            vec3 limb = vec3(1.00, 0.55, 0.22);
            vec3 color = mix(limb, core, pow(mu, 0.55));

            // Just enough overdrive that the centre clips to white while the limb
            // and the granulation still sit below 1.0 and stay visible. Push this
            // much higher and the whole disc saturates into a flat white sticker.
            gl_FragColor = vec4(color * darkening * texture * 1.35, 1.0);
        }
    `,
});

const photosphere = new Mesh(new SphereGeometry(SUN_RADIUS, 96, 96), photosphereMaterial);

/**
 * Chromosphere — the thin, hot, hydrogen-red layer just above the photosphere. On
 * the disc it is invisible against the glare; at the limb it shows as a fine
 * red-orange fringe, which is what stops the edge looking like a cut-out.
 */
const chromosphere = new Mesh(
    new SphereGeometry(SUN_RADIUS * 1.055, 96, 96),
    new ShaderMaterial({
        side: BackSide,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        vertexShader: /* glsl */ `
            varying vec3 vNormalW;
            varying vec3 vViewW;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vNormalW = normalize(mat3(modelMatrix) * normal);
                vViewW = normalize(cameraPosition - worldPosition.xyz);
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `,
        fragmentShader: /* glsl */ `
            precision highp float;
            varying vec3 vNormalW;
            varying vec3 vViewW;
            void main() {
                float rim = 1.0 - abs(dot(normalize(vNormalW), normalize(vViewW)));
                float edge = pow(clamp(rim, 0.0, 1.0), 3.0);
                gl_FragColor = vec4(vec3(1.0, 0.45, 0.22) * edge * 1.5, edge);
            }
        `,
    })
);

/**
 * Glare. Without a bloom post-process the disc alone reads as a flat sticker, so the
 * halo is faked with two additive sprites: a tight bright one hugging the disc and a
 * broad faint one for the outer wash.
 */
function createGlare(scale: number, power: number, tint: string, opacity: number): Sprite {
    const sprite = new Sprite(
        new SpriteMaterial({
            map: createGlowTexture(power, tint),
            blending: AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
            transparent: true,
            opacity,
            color: new Color(0xffffff),
        })
    );
    // Sprites always face the camera, so the glare stays circular from any angle.
    sprite.scale.setScalar(SUN_RADIUS * scale);
    return sprite;
}

export const sun = new Group();
sun.add(photosphere);
sun.add(chromosphere);
sun.add(createGlare(3.4, 2.6, '255,238,205', 0.85));
sun.add(createGlare(11.0, 3.4, '255,176,96', 0.30));

/**
 * Sunlight.
 *
 * Kept directional rather than a point light: over the Earth-Moon system real
 * sunlight is parallel to within a fraction of a degree, and a directional light
 * gives a predictable intensity with no inverse-square falloff to tune. Its
 * direction is set by aiming `target` at the Earth each frame.
 */
export const sunLight = new DirectionalLight(0xfff6e8, SUN_INTENSITY);

/** Spins the photosphere and drifts its granulation, driven by the simulated clock. */
export function updateSun(date: Date): void {
    const days = daysSinceJ2000(date);
    photosphere.rotation.y = (days / SUN_ROTATION_PERIOD_DAYS) * Math.PI * 2;
    photosphereMaterial.uniforms.uTime.value = days * 24; // hours — granules evolve fast
}
