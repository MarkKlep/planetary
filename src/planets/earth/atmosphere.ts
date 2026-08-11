import { Mesh, SphereGeometry, ShaderMaterial, BackSide, AdditiveBlending, Vector3 } from 'three';
import { ATMOSPHERE_RADIUS } from '../../constants/planets.const';

/** Sun direction in world space, kept up to date by the render loop. */
export const atmosphereSunDirection = new Vector3(1, 0, 0);

/**
 * Rayleigh-ish limb glow.
 *
 * Rendered on the *inside* of a slightly oversized shell: the near hemisphere is
 * skipped, so the glow only appears as a ring beyond Earth's silhouette instead of
 * washing a blue film over the whole disc. Crucially the glow is scaled by how much
 * of the limb faces the sun — a halo that rings the night side just as brightly
 * reads as a neon outline rather than air.
 */
const material = new ShaderMaterial({
    side: BackSide,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    uniforms: {
        uSunDirection: { value: atmosphereSunDirection },
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
            // This is the authored outward normal. three.js only flips normals for
            // back faces inside its built-in materials, not in a raw
            // ShaderMaterial — negating here would invert the day/night test.
            vec3 normal = normalize(vWorldNormal);

            // Fresnel: thickest where the line of sight grazes the shell.
            float rim = 1.0 - abs(dot(normal, normalize(vViewDirection)));
            float glow = pow(clamp(rim, 0.0, 1.0), 3.2);

            // Only air that is actually in sunlight scatters. The wrap term keeps a
            // narrow bright fringe just past the terminator, which is what sunrise
            // looks like from orbit.
            float sunAlignment = dot(normal, normalize(uSunDirection));
            // Kept tight to the lit limb. Letting this bleed far past the
            // terminator rings the night side too and reads as a neon outline.
            float daylight = smoothstep(-0.12, 0.30, sunAlignment);

            vec3 skyBlue = vec3(0.32, 0.55, 1.0);
            // Forward-scattered light warms toward the horizon at the terminator.
            vec3 sunsetWarm = vec3(1.0, 0.62, 0.36);
            float warmth = smoothstep(0.30, -0.10, sunAlignment) * daylight;
            vec3 color = mix(skyBlue, sunsetWarm, warmth);

            gl_FragColor = vec4(color * glow * daylight * 1.5, glow * daylight);
        }
    `,
});

export const atmosphere = new Mesh(new SphereGeometry(ATMOSPHERE_RADIUS, 96, 96), material);
