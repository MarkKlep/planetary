import { Mesh, SphereGeometry, ShaderMaterial, BackSide, AdditiveBlending, Vector3 } from 'three';
import { VENUS_ATMOSPHERE_RADIUS } from '../../constants/planets.const';

/** Sun direction in world space, kept up to date by the render loop. */
export const venusAtmosphereSunDirection = new Vector3(1, 0, 0);

/**
 * The haze above the cloud tops — the same inside-out Fresnel shell as Earth's and
 * Mars's, standing in for a very different thing than either.
 *
 * On Earth and Mars this shell is the atmosphere. Here almost all of the atmosphere is
 * *below* it, already drawn as the opaque deck in `clouds.ts`; what is left to render
 * is the thin veil of sulphuric haze in the 30 km above that, which is what softens
 * the limb instead of letting the deck end in a hard edge against the sky.
 *
 * Two things make it look unlike the other two shells. It reaches further round the
 * planet than any of them, because Venus's atmosphere refracts light so strongly that
 * the terminator is genuinely blurred and the crescent's horns reach past 180° — the
 * "ashen light" that observers argued over for two centuries. And it stays pale
 * yellow throughout rather than shifting colour with depth: there is no dust layer
 * and no blue rind, just sulphur all the way up.
 */
const material = new ShaderMaterial({
    side: BackSide,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    uniforms: {
        uSunDirection: { value: venusAtmosphereSunDirection },
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
            // As on the other shells: this is the authored outward normal. three.js
            // only flips normals for back faces inside its built-in materials.
            vec3 normal = normalize(vWorldNormal);

            float rim = 1.0 - abs(dot(normal, normalize(vViewDirection)));
            // Between Earth's 3.2 and Mars's 4.5. The layer being drawn is thin, but
            // the scale height under it is 15.9 km — nearly twice Earth's — so what
            // there is of it stacks up gradually rather than hugging the surface.
            float glow = pow(clamp(rim, 0.0, 1.0), 3.6);

            float sunAlignment = dot(normal, normalize(uSunDirection));
            // Reaching much further past the terminator than Earth's or Mars's, which
            // both cut off close to it. This is the refraction: 90 bars of CO2 bends
            // sunlight right around the limb, so the lit crescent runs on well past
            // where a straight-line terminator would end it.
            float daylight = smoothstep(-0.35, 0.15, sunAlignment);

            // Sulphuric acid haze, lit by a sun twice as strong as the one at Earth.
            vec3 color = vec3(1.0, 0.94, 0.74);

            gl_FragColor = vec4(color * glow * daylight * 1.15, glow * daylight * 0.8);
        }
    `,
});

export const venusAtmosphere = new Mesh(
    new SphereGeometry(VENUS_ATMOSPHERE_RADIUS, 96, 96),
    material
);
