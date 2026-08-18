import {
    Mesh,
    MeshStandardMaterial,
    SRGBColorSpace,
    SphereGeometry,
    TextureLoader,
    Vector3,
} from 'three';
import {
    SATURN_EQUATORIAL_RADIUS,
    SATURN_FLATTENING,
    SATURN_RING_INNER,
    SATURN_RING_OUTER,
} from '../../constants/planets.const';
import { RING_TAU_MAX, ringProfileTexture } from './rings';
import { quality } from '../../quality';
import { texturePath } from '../../textures';

const textureLoader = new TextureLoader();

/**
 * Saturn's globe, which is the part of Saturn nobody looks at.
 *
 * The banding is Jupiter's, run through a much deeper haze: Saturn is 4.6 AU further
 * out and correspondingly colder, so its ammonia clouds condense far below a thick
 * photochemical smog, and everything below is seen through it. The belts and zones are
 * genuinely there and genuinely the same physics, but the contrast is roughly a fifth
 * of Jupiter's, and there is nothing here like the Great Red Spot to fix on. What that
 * buys the model is a map that is very nearly a function of latitude alone, which is
 * why longitude registration matters even less here than it does for Jupiter.
 */
const colorMap = textureLoader.load(texturePath('saturn_color.jpg'));
colorMap.colorSpace = SRGBColorSpace;
colorMap.anisotropy = 8;

/**
 * No height map, for Jupiter's reason exactly: there is no ground, and what looks like
 * relief is cloud tops separated by a few tens of kilometres on a body 120,000 km
 * across.
 *
 * No atmosphere shell either. Saturn's limb darkens rather than glowing, the same as
 * Jupiter's — a haze deep enough to mute the belts is also deep enough that there is no
 * thin bright rind to catch the light at the edge.
 */

// 192 x 128, matching Jupiter's: these two have much the largest discs in the scene, so
// they are the only silhouettes where a polygonal limb would be visible against the sky.
const geometry = new SphereGeometry(SATURN_EQUATORIAL_RADIUS, quality.gasGiantSegments[0], quality.gasGiantSegments[1]);
/**
 * The oblateness, applied as a scale on the polar axis so the mesh stays a unit sphere
 * for raycasting and the constant above stays the equatorial radius it is named for.
 *
 * 0.098 is the largest of any planet and half again Jupiter's — a full tenth of the
 * disc. On Jupiter this is a detail worth arguing for; on Saturn, drawing a sphere is
 * simply drawing the wrong planet.
 */
geometry.scale(1, 1 - SATURN_FLATTENING, 1);

/** Sun direction in the *mesh's own* local frame, kept current by the render loop.
 *  Local rather than world because the ring plane is exactly the mesh's local XZ
 *  plane — the spin is about local Y — which is what makes the shadow test below three
 *  lines of arithmetic instead of a change of basis. */
export const saturnSunDirectionLocal = new Vector3(1, 0, 0);

const material = new MeshStandardMaterial({
    map: colorMap,
    /**
     * No albedo tint, for Jupiter's reason: this is ordinary visible-light imagery of a
     * body whose geometric albedo is 0.499, and the map already carries that. The
     * Moon's, Mercury's and the icy moons' maps are brightness-normalised products that
     * mean nothing in absolute terms and have to be corrected; this one is not.
     */
    roughness: 1,
    metalness: 0,
});

/**
 * The rings' shadow on the planet.
 *
 * The other half of the pair — `rings.ts` casts Saturn onto the rings, this casts the
 * rings onto Saturn — and between them they are most of what makes the system read as
 * one object rather than a ball with a decal round it. It is also the thing you cannot
 * get from a shadow map: the rings are a *translucent* caster with an optical depth
 * that varies over four orders of magnitude across their width, so what lands on the
 * cloud tops is not a silhouette but a photograph of the ring profile, with the Cassini
 * Division showing as a bright line inside a dark band.
 *
 * Cheap, because the geometry is trivial in this frame: the ring plane is local y = 0,
 * so the ray from a cloud top to the Sun crosses it at a radius that is one division,
 * and the transmitted fraction is `exp(-tau / |sin(solar elevation)|)` — Beer's law
 * through a slab, with the slant path falling straight out of the same sine.
 *
 * The season falls out too. Saturn's 26.7° tilt means the shadow band sweeps from deep
 * in one hemisphere to deep in the other over a 29½-year orbit, and disappears entirely
 * at the equinox, when the Sun is in the ring plane and the rings shadow nothing but
 * their own edge.
 */
material.onBeforeCompile = (shader) => {
    shader.uniforms.uRingProfile = { value: ringProfileTexture };
    shader.uniforms.uRingInner = { value: SATURN_RING_INNER };
    shader.uniforms.uRingOuter = { value: SATURN_RING_OUTER };
    shader.uniforms.uRingTauMax = { value: RING_TAU_MAX };
    shader.uniforms.uSunLocal = { value: saturnSunDirectionLocal };

    shader.vertexShader = `varying vec3 vObjectPosition;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vObjectPosition = position;
        `
    );

    shader.fragmentShader =
        `
        uniform sampler2D uRingProfile;
        uniform float uRingInner;
        uniform float uRingOuter;
        uniform float uRingTauMax;
        uniform vec3 uSunLocal;
        varying vec3 vObjectPosition;
        ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
            float elevation = uSunLocal.y;
            // Guarded rather than branched away: at equinox the Sun lies in the ring
            // plane, the slant path through the rings goes to infinity, and the shadow
            // correctly vanishes because the ray never reaches the plane at all.
            if (abs(elevation) > 1e-4) {
                float t = -vObjectPosition.y / elevation;
                if (t > 0.0) {
                    vec3 crossing = vObjectPosition + t * uSunLocal;
                    float radius = length(crossing.xz);
                    float u = (radius - uRingInner) / (uRingOuter - uRingInner);
                    if (u > 0.0 && u < 1.0) {
                        float tau = texture2D(uRingProfile, vec2(u, 0.5)).a;
                        tau = tau * tau * uRingTauMax;
                        // Scaling the albedo rather than the light is exact here: this
                        // material has no emissive and no specular worth the name, so
                        // every term it contributes is proportional to diffuseColor.
                        diffuseColor.rgb *= exp(-tau / abs(elevation));
                    }
                }
            }
        }
        `
    );
};

export const saturn = new Mesh(geometry, material);
