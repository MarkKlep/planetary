import { Mesh, SphereGeometry, ShaderMaterial, BackSide, AdditiveBlending, Vector3 } from 'three';
import { MARS_ATMOSPHERE_RADIUS } from '../../constants/planets.const';

/** Sun direction in world space, kept up to date by the render loop. */
export const marsAtmosphereSunDirection = new Vector3(1, 0, 0);

/**
 * Mars's limb haze — the same inside-out Fresnel shell as Earth's, tuned for a much
 * thinner and dustier atmosphere.
 *
 * It is worth having even though it is barely there: without *some* haze the limb of
 * an airless-looking sphere ends in a hard cut against the sky, which is the tell
 * that gave the Moon its silhouette. Mars's air is 0.6% of Earth's pressure, so this
 * is deliberately faint and hugs the surface far more closely.
 *
 * The colour is the interesting part. Suspended dust dominates the low haze and
 * scatters long wavelengths, giving the butterscotch tone familiar from surface
 * photographs; but the thin, high CO2 and water-ice haze above it scatters blue, and
 * limb images from orbit show exactly that — a pale blue-white fringe sitting on top
 * of a warmer band. Both are here, keyed off how far through the shell the view
 * grazes.
 */
const material = new ShaderMaterial({
    side: BackSide,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    uniforms: {
        uSunDirection: { value: marsAtmosphereSunDirection },
    },
    vertexShader: /* glsl */ `
        varying vec3 vWorldNormal;
        varying vec3 vViewDirection;

        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldNormal = normalize(mat3(modelMatrix) * normal);
            vViewDirection = normalize(cameraPosition - worldPosition.xyz);
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
    `,
    fragmentShader: /* glsl */ `
        precision highp float;

        uniform vec3 uSunDirection;

        varying vec3 vWorldNormal;
        varying vec3 vViewDirection;

        void main() {
            // As on Earth's shell: this is the authored outward normal. three.js only
            // flips normals for back faces inside its built-in materials.
            vec3 normal = normalize(vWorldNormal);

            float rim = 1.0 - abs(dot(normal, normalize(vViewDirection)));
            // A tighter exponent than Earth's 3.2 — a shallower falloff would draw
            // the haze far further up than 11 km of scale height can justify.
            float glow = pow(clamp(rim, 0.0, 1.0), 4.5);

            float sunAlignment = dot(normal, normalize(uSunDirection));
            float daylight = smoothstep(-0.08, 0.28, sunAlignment);

            // Dust below, ice haze above: the deepest sight lines through the shell
            // are the ones that stay low, so they carry the warm colour.
            vec3 dust = vec3(1.0, 0.68, 0.42);
            vec3 highHaze = vec3(0.62, 0.76, 1.0);
            vec3 color = mix(highHaze, dust, smoothstep(0.35, 0.9, rim));

            // A third of the strength of Earth's, which is roughly where a limb this
            // thin reads as air rather than as an outline.
            gl_FragColor = vec4(color * glow * daylight * 0.5, glow * daylight * 0.55);
        }
    `,
});

export const marsAtmosphere = new Mesh(
    new SphereGeometry(MARS_ATMOSPHERE_RADIUS, 96, 96),
    material
);
