import {
    Mesh,
    SphereGeometry,
    MeshStandardMaterial,
    TextureLoader,
    SRGBColorSpace,
    Vector3,
    RepeatWrapping,
    Texture,
} from 'three';
import { NIGHT_LIGHTS_FALLOFF } from '../../constants/planets.const';

const textureLoader = new TextureLoader();

/**
 * Colour maps carry sRGB-encoded data and must be tagged as such — `TextureLoader`
 * defaults to no colour space, which leaves the renderer skipping the decode and
 * rendering visibly wrong mid-tones. Data maps (height, masks) are *not* colour and
 * must stay linear.
 */
function loadColorMap(url: string): Texture {
    const texture = textureLoader.load(url);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8; // keeps the surface sharp at the limb, where it is near-grazing
    texture.wrapS = RepeatWrapping;
    return texture;
}

function loadDataMap(url: string): Texture {
    const texture = textureLoader.load(url);
    texture.anisotropy = 4;
    texture.wrapS = RepeatWrapping;
    return texture;
}

const dayMap = loadColorMap('/textures/earth_day.jpg');
const nightMap = loadColorMap('/textures/earth_night.jpg');
const heightMap = loadDataMap('/textures/earth_height.jpg');
// NASA's bathymetry doubles as a land/water mask: land is pure white, ocean is a
// depth ramp. Driving roughness with it makes oceans glossy and land matte, which
// is what produces a specular glint on the sea near the subsolar point.
const landMask = loadDataMap('/textures/earth_landmask.jpg');

/** Sun direction in *view* space, kept up to date by the render loop. */
export const earthSunDirectionView = new Vector3(1, 0, 0);

const material = new MeshStandardMaterial({
    map: dayMap,
    bumpMap: heightMap,
    bumpScale: 6,
    roughnessMap: landMask,
    roughness: 1,
    metalness: 0,
});

/**
 * City lights on the night side.
 *
 * Setting `emissiveMap` alone would make the lights glow through the daylit face
 * too, so the night texture is added manually and masked by the surface's own
 * angle to the sun.
 */
material.onBeforeCompile = (shader) => {
    shader.uniforms.uNightMap = { value: nightMap };
    shader.uniforms.uNightIntensity = { value: 1.6 };
    shader.uniforms.uSunDirectionView = { value: earthSunDirectionView };

    shader.fragmentShader =
        `
        uniform sampler2D uNightMap;
        uniform float uNightIntensity;
        uniform vec3 uSunDirectionView;
        ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `
        #include <emissivemap_fragment>
        {
            // Uses the bump-perturbed view-space normal, so the city lights fade
            // along exactly the same terminator the surface shading uses.
            float sunAlignment = dot(normalize(normal), normalize(uSunDirectionView));
            float nightAmount = smoothstep(${NIGHT_LIGHTS_FALLOFF.toFixed(3)}, -${NIGHT_LIGHTS_FALLOFF.toFixed(3)}, sunAlignment);

            // Black Marble is not black outside the cities: every landmass carries a
            // dim blue-grey base. Emitting that as-is makes whole continents glow
            // blue at night, so lift the floor off and renormalise what remains.
            vec3 raw = texture2D(uNightMap, vMapUv).rgb;
            vec3 cityLights = max(raw - 0.035, vec3(0.0)) * 1.7;

            // The Antarctic ice sheet is rendered bright blue-white in the source
            // and survives the threshold above, leaving a glowing blue cap. City
            // light is warm and ice is cold, so separate them by hue rather than
            // brightness: keep red-leaning pixels, drop blue-leaning ones.
            cityLights *= clamp((raw.r - raw.b) * 3.0 + 0.55, 0.0, 1.0);

            totalEmissiveRadiance += cityLights * nightAmount * uNightIntensity;
        }
        `
    );
};

// 128 segments: at 32 the silhouette showed obvious polygonal faceting against the
// dark sky, which no amount of texture detail can hide.
const geometry = new SphereGeometry(1, 128, 128);

export const earth = new Mesh(geometry, material);
