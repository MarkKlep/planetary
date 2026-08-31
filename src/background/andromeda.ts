import {
    AdditiveBlending,
    Group,
    Matrix4,
    Mesh,
    PlaneGeometry,
    ShaderMaterial,
    Vector3,
} from 'three';
import { equatorialToScene } from '../orbits';
import { SKY_RADIUS } from './background';

/**
 * The Andromeda galaxy, M31 — and the second object in this sky that is a *thing*
 * rather than a statistic, after `betelgeuse.ts`.
 *
 * It is at a measured right ascension and declination, it is the size its measured
 * distance and diameter make it, it lies at the angle its measured position angle puts
 * it at, and it is as flat as its measured inclination makes it. Nothing about it is
 * chosen for the frame except how brightly it is developed — see the brightness
 * section below, which is the whole of the difference between this and a photograph.
 *
 * ## Why it is faint, which is the interesting part
 *
 * M31 is magnitude 3.44 — integrated, that is brighter than most of the stars anyone
 * can name. And it is nearly invisible, for a reason that is pure arithmetic: that
 * light is spread over 190′ × 60′ of sky. The ellipse is 3.2 × 10⁷ square arcseconds,
 * which is 18.8 magnitudes' worth of area, so the *mean* surface brightness inside it
 * is 22.2 mag/arcsec² — **fainter than the night sky itself**, which even at a genuinely
 * dark site glows at about 21.8. Averaged over its own outline the galaxy is dimmer
 * than the darkness it sits in.
 *
 * What is actually seen, then, is only the inner region where the bulge lifts it above
 * the sky glow: an oval about 1° × 0.5°, no detail, no colour, no arms. That is the
 * default here, and it is why the default looks like so much less than the photographs
 * — the photographs are minutes of exposure, and an eye integrates for about a tenth of
 * a second. Turning `setAndromedaBrightness` up is the only honest way to see the rest
 * of it, and is exactly the operation a longer exposure performs.
 *
 * ## Where it goes
 *
 * Through `equatorialToScene`, like the star, since a catalogue quotes J2000 equatorial
 * coordinates. Verified the same way — against an independent rotation of the same
 * numbers into the galactic frame, which comes out at l = 121.174°, b = −21.573°
 * against the published 121.17° and −21.57°.
 *
 * Unlike the star it also needs an *orientation*, because it is not a point: 3.2° of
 * sky, six times the Moon's width, and the largest galaxy anywhere in the northern
 * sky. So the module builds the sky-plane basis at that direction — north, east, and
 * the line of sight — and lays the disc into it at the measured position angle. Two
 * things fall out of doing it that way rather than by eye. Position angles are quoted
 * from north through *east*, and east is to the *left* when you face the sky, which is
 * the sort of mirror-image error that is invisible until someone recognises the object;
 * building real 3D basis vectors and letting `equatorialToScene` (a proper rotation, so
 * handedness survives) carry them over cannot get that backwards. And the projected
 * axis ratio is not imposed at all — the disc is drawn round and inclined by 77°, and
 * cos 77° = 0.225 is what flattens it.
 *
 * That last one is worth stating precisely, because the quoted extent is 60/190 = 0.316
 * rather than 0.225, and the difference is not an error in either number. A razor-thin
 * disc at 77° really would be that thin, and the measured outline is fatter because the
 * bulge is a spheroid rather than a disc and the disc itself has thickness. Both are
 * drawn here, so the rendered object is thin at the ends and fat in the middle, which
 * is what the measured ellipse is an average of.
 *
 * ## One caveat, the same one the star carries
 *
 * The galaxy is real and the sky behind it is not. `background.ts`'s galactic frame is
 * a composition choice, so M31 is in its true place relative to the ecliptic, the
 * planets and the Sun, but not relative to the painted Milky Way. In reality it is
 * 21.6° off the galactic plane — which is *why* it can be seen at all, since the plane
 * itself is opaque with dust.
 */

const DEG = Math.PI / 180;

// --- Position and orientation ---------------------------------------------

/** M31, J2000.0 (NED/SIMBAD). RA 00h 42m 44.330s. */
const RIGHT_ASCENSION_DEG = (0 + 42 / 60 + 44.33 / 3600) * 15;
/** Dec +41° 16′ 09.4″. */
const DECLINATION_DEG = 41 + 16 / 60 + 9.4 / 3600;

/**
 * The angle the major axis makes on the sky, measured from north through east, as
 * every catalogue quotes it. 35° puts the long axis running north-east to south-west.
 */
const POSITION_ANGLE_DEG = 35;

/**
 * How far the disc is tipped from face-on. 77° is close enough to edge-on that M31 is
 * the textbook example of a galaxy seen at a steep angle — nearly a streak, and still
 * plainly a disc.
 */
const INCLINATION_DEG = 77;

/**
 * 2.537 million light years, 778 kpc — usually quoted as the furthest thing a naked eye
 * can reach. It is also the number the rest of this module's arithmetic runs on: at
 * that range one degree of sky is 13.58 kpc, so every angle here is a real distance.
 */
const DISTANCE_MLY = 2.537;
const DISTANCE_KPC = 778;
/** Kiloparsecs across the galaxy per degree of sky, which is the conversion above. */
const KPC_PER_DEGREE = DISTANCE_KPC * DEG;

const ra = RIGHT_ASCENSION_DEG * DEG;
const dec = DECLINATION_DEG * DEG;

// The equatorial triad at M31's position: the line of sight, the direction of
// increasing declination (north on the sky), and the direction of increasing right
// ascension (east). The last two are the tangent plane — the sky as drawn on it.
const lineOfSight = new Vector3(
    Math.cos(dec) * Math.cos(ra),
    Math.cos(dec) * Math.sin(ra),
    Math.sin(dec)
);
const skyNorth = new Vector3(
    -Math.sin(dec) * Math.cos(ra),
    -Math.sin(dec) * Math.sin(ra),
    Math.cos(dec)
);
const skyEast = new Vector3(-Math.sin(ra), Math.cos(ra), 0);

[lineOfSight, skyNorth, skyEast].forEach((v) => equatorialToScene(v));

const pa = POSITION_ANGLE_DEG * DEG;
/** The long axis of the ellipse, PA degrees round from north toward east. */
const majorAxis = new Vector3()
    .addScaledVector(skyNorth, Math.cos(pa))
    .addScaledVector(skyEast, Math.sin(pa));
/** And the short one, a quarter turn further round. */
const minorAxis = new Vector3()
    .addScaledVector(skyNorth, -Math.sin(pa))
    .addScaledVector(skyEast, Math.cos(pa));

// --- Size on the sky ------------------------------------------------------

/**
 * The catalogue extent, 190′ × 60′ — 3.167° along the major axis. Six full Moons laid
 * end to end, which is the fact people refuse to believe about an object they have
 * never managed to see.
 */
export const ANDROMEDA_MAJOR_AXIS_DEG = 190 / 60;

/**
 * How much sky the quad covers, comfortably past the catalogue outline so that the
 * outer disc has somewhere to fade out in — at the top of the brightness range there
 * is still light out past 2°, and a hard edge on a galaxy is not a subtle artefact.
 * The shader fades the last quarter of it to zero regardless, so no gain can find one.
 */
const QUAD_WIDTH_DEG = 6.4;
const QUAD_HEIGHT_DEG = 3.8;

/**
 * World units per degree on the backdrop shell. The geometry below is built in
 * *degrees* and the mesh carries this as its scale, which keeps every number in the
 * shader an angle and means the one place the scene's units appear is here.
 */
const UNITS_PER_DEGREE = 2 * SKY_RADIUS * Math.tan(0.5 * DEG);

// --- Brightness -----------------------------------------------------------

/**
 * The control the user actually has, and the one thing here that is a choice.
 *
 * Everything else in this module is a measurement, but *how brightly to develop it* is
 * not a property of the galaxy at all — it is a property of the exposure, and the same
 * object is a barely-there smudge to an eye and a bright spiral to a camera left open
 * for ten minutes. So the gain is exposed rather than settled, and the slider position
 * that means "as the eye actually has it" is marked rather than implied.
 *
 * The mapping is a power law rather than a straight line because brightness is
 * perceived logarithmically — the same reason astronomers measure it in magnitudes.
 * The exponent is not a taste value: it is whatever makes the true appearance land at
 * `ANDROMEDA_BRIGHTNESS_DEFAULT` and the top of the travel land at `MAX_GAIN`, so
 * moving either of those two ends moves it on its own.
 */
export const ANDROMEDA_BRIGHTNESS_DEFAULT = 0.3;
/** About what a long exposure shows: the arms out to the ends, and colour in them. */
const MAX_GAIN = 6;
const GAIN_EXPONENT = -Math.log(MAX_GAIN) / Math.log(ANDROMEDA_BRIGHTNESS_DEFAULT);

/** Slider position → gain, with 0 fully off and `ANDROMEDA_BRIGHTNESS_DEFAULT` → 1. */
function gainAt(position: number): number {
    if (position <= 0) return 0;
    return MAX_GAIN * Math.pow(Math.min(1, position), GAIN_EXPONENT);
}

// --- The shader -----------------------------------------------------------

const vertexShader = /* glsl */ `
    varying vec2 vDeg;
    void main() {
        // The geometry is in degrees of sky and the mesh's scale converts it, so this
        // is the object's own coordinate: x along the major axis, y along the minor.
        vDeg = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fragmentShader = /* glsl */ `
    precision highp float;

    uniform float uGain;

    varying vec2 vDeg;

    float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }

    float noise2(vec2 x) {
        vec2 i = floor(x);
        vec2 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
            mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x),
            f.y
        );
    }

    float sq(float x) { return x * x; }

    float fbm2(vec2 p) {
        float v = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 3; i++) {
            v += amp * noise2(p);
            p *= 2.13;
            amp *= 0.5;
        }
        return v;
    }

    /** asinh, which GLSL ES 1.00 does not have. The stretch below says why it wants one. */
    float asinh1(float x) { return log(x + sqrt(x * x + 1.0)); }

    void main() {
        // Deprojection. The disc is a circle seen at 77°, so the minor-axis coordinate
        // is the one that has been foreshortened, and dividing it back out recovers the
        // position *within the galaxy* — which is the frame every profile below is
        // written in, and the frame the clumping has to be noised in if the star clouds
        // are to lie in the disc rather than be painted on the sky.
        float along = vDeg.x * KPC_PER_DEGREE;
        float across = vDeg.y * KPC_PER_DEGREE / COS_INCLINATION;
        float discRadius = length(vec2(along, across));

        // Everything from here is in units of the disc's own central surface
        // brightness, which is what leaves the one free parameter in this shader the
        // exposure rather than the galaxy.

        // The bulge is a spheroid, not a disc, so it is *not* deprojected — it is very
        // nearly round on the sky, and drawing it flattened like the disc is what makes
        // a galaxy read as a cigar. A de Vaucouleurs profile, floored at a radius that
        // is a fraction of a pixel wide: the real nucleus is a double one five light
        // years across, so every cut-off here is arbitrary and none of them is visible.
        float bulgeRadius = length(vec2(vDeg.x, vDeg.y / BULGE_AXIS_RATIO)) * KPC_PER_DEGREE;
        float bulge = BULGE_PEAK
            * exp(-7.669 * (pow(max(bulgeRadius, BULGE_FLOOR_KPC) / BULGE_EFFECTIVE_KPC, 0.25) - 1.0));

        // The old disc: an exponential in radius, which is what every disc galaxy is.
        float disc = exp(-discRadius / DISC_SCALE_KPC);

        // And the young one. M31's star formation is concentrated into a ring about
        // 10 kpc out rather than into grand-design arms — the ring is the single most
        // distinctive thing about this galaxy in the infrared, and the reason its arms
        // look like circles. What spiral there is, is wound at a pitch angle of about
        // 10°, so it wraps a full turn between the ring's inner and outer edge.
        float theta = atan(across, along);
        float arm = cos(2.0 * (theta - log(max(discRadius, 1.0)) / ARM_PITCH_TANGENT));
        float ring = RING_PEAK * exp(-sq((discRadius - RING_RADIUS_KPC) / RING_WIDTH_KPC));
        ring *= 0.62 + 0.38 * arm;

        // Star clouds, noised in the galaxy's own plane. Without them the disc is an
        // airbrushed ellipse — the same argument background.ts makes about the Milky
        // Way band, and the same fix. Only the young population is clumped: the bulge
        // is ten billion years of orbits, and they have long since smoothed it out.
        float clumps = 0.62 + 0.85 * fbm2(vec2(along, across) * 0.22 + 7.0);
        float young = (disc + ring) * clumps;

        // The dust lanes, on the near side, which is the north-west one — the side the
        // minor axis runs *away* from, PA + 90° being the south-east. They are the
        // other half of why M31 reads as a disc rather than as a smudge: dust sits in
        // the plane, so seeing it silhouetted on one side only is the direct evidence
        // that that edge is the near one.
        float nearSide = smoothstep(0.12, -0.30, vDeg.y / HALF_MINOR);
        float lanes = exp(-sq((discRadius - 7.6) / 1.3))
                    + 0.85 * exp(-sq((discRadius - 11.0) / 1.5));
        lanes *= nearSide * (0.55 + 0.6 * fbm2(vec2(along, across) * 0.5 - 3.0));
        float dust = 1.0 - 0.6 * clamp(lanes, 0.0, 1.0);

        float light = (bulge + young) * dust;

        // The quad's own edge, faded to nothing over its outer quarter so that no
        // amount of gain can produce a straight line across the sky.
        vec2 edge = abs(vDeg) / vec2(HALF_WIDTH, HALF_HEIGHT);
        light *= smoothstep(1.0, 0.74, max(edge.x, edge.y));

        // The stretch, and the whole of what the brightness control does.
        //
        // The galaxy spans four orders of magnitude of surface brightness between its
        // nucleus and its outer disc, and no linear scaling shows both: set the level
        // so the arms appear and the core is a white hole, set it so the core holds and
        // there is nothing around it. So this is the asinh stretch every astronomical
        // image processor uses — linear through the faint parts, where it is the honest
        // thing to be, and logarithmic past the knee, which is what folds a nucleus back
        // onto a screen. uGain moves the whole profile through that knee, which is
        // what a longer exposure does, and is why turning it up makes the galaxy *grow*
        // rather than simply brighten.
        float stretched = min(asinh1(light * uGain * EXPOSURE) / STRETCH_NORM, 1.0);

        // Colour, and the reason it is not simply applied. Colour vision is cone
        // vision, and a surface this faint does not deliver enough light to fire them —
        // which is why nobody has ever seen this object as anything but grey, and why
        // every photograph of it has a yellow core and blue arms. Both are true, and
        // which one is true depends on the exposure, which is what uGain is. So the
        // saturation rides the gain: grey at the eye's setting, coloured once the
        // exposure is long enough that a camera would have found the colour.
        vec3 tint = mix(DISC_TINT, BULGE_TINT, bulge / max(bulge + young, 1e-6));
        tint = mix(vec3(dot(tint, vec3(0.2126, 0.7152, 0.0722))), tint, clamp((uGain - 0.4) / 2.2, 0.0, 1.0));

        vec3 color = tint * stretched;

        // Dither, for the same reason the dome carries one — 8-bit output bands
        // visibly across a gradient this dark and this wide.
        color += (hash12(vDeg * 91.7) - 0.5) / 255.0;

        gl_FragColor = vec4(max(color, 0.0), 1.0);
    }
`;

/**
 * How the light is divided between M31's two stellar populations, which is the one
 * thing in the profile that is a *derivation* rather than a measurement.
 *
 * A de Vaucouleurs bulge carries 7.215·π·I_e·Re² of light and an exponential disc
 * carries 2π·I_0·h², so fixing the bulge-to-total ratio at the measured 0.30 and the
 * two scale lengths at their measured values fixes the ratio of the two surface
 * brightnesses — there is nothing left to choose. It comes out at 3.34, meaning the
 * bulge at its own effective radius is a little over three times the surface brightness
 * of the middle of the disc, which is why M31 has a distinct core inside a very much
 * larger smudge rather than fading evenly outward.
 */
const BULGE_TO_TOTAL = 0.3;
/** Courteau et al. (2011): the bulge holds about a third of the light within ~1 kpc. */
const BULGE_EFFECTIVE_KPC = 1.0;
/** The disc's exponential scale length; the catalogue outline is about four of them. */
const DISC_SCALE_KPC = 5.3;

/**
 * The measured quantities the profile is built from, substituted into the shader source
 * rather than passed as uniforms: not one of them can change at runtime, and a uniform
 * would suggest otherwise. Distances are kiloparsecs, as every source quotes them.
 */
const CONSTANTS: Record<string, number> = {
    KPC_PER_DEGREE,
    COS_INCLINATION: Math.cos(INCLINATION_DEG * DEG),
    BULGE_EFFECTIVE_KPC,
    DISC_SCALE_KPC,
    BULGE_PEAK:
        (BULGE_TO_TOTAL / (1 - BULGE_TO_TOTAL)) *
        ((2 * DISC_SCALE_KPC * DISC_SCALE_KPC) / (7.215 * BULGE_EFFECTIVE_KPC * BULGE_EFFECTIVE_KPC)),
    /** Rounder than the disc by far, which is what a spheroid seen at 77° looks like. */
    BULGE_AXIS_RATIO: 0.72,
    /** Well inside a pixel at any field of view this scene has. See the shader. */
    BULGE_FLOOR_KPC: 0.25,
    RING_RADIUS_KPC: 10,
    RING_WIDTH_KPC: 2,
    /** The ring roughly doubles the disc's surface brightness where it sits. */
    RING_PEAK: 0.15,
    ARM_PITCH_TANGENT: Math.tan(10 * DEG),
    HALF_WIDTH: QUAD_WIDTH_DEG / 2,
    HALF_HEIGHT: QUAD_HEIGHT_DEG / 2,
    HALF_MINOR: ANDROMEDA_MAJOR_AXIS_DEG * Math.cos(INCLINATION_DEG * DEG) * 0.5,
    /**
     * The two halves of the exposure, and the only place an absolute level is set —
     * which is unavoidable, because this sky is not photometric: `background.ts`'s
     * Milky Way is painted at a level chosen to look right, so there is no calibrated
     * quantity to hang M31 off. What there is, is the *ordering*, and it is the
     * calibration used here. The two are the only extended sources in this sky; the
     * real M31 is fainter than the real Milky Way everywhere outside its own bulge and
     * brighter than any part of it inside; and at a gain of 1 that is what these two
     * numbers produce.
     *
     * Measured rather than eyeballed, by reading pixels back out of the renderer — and
     * the two are compared *as they land on screen*, which is the only comparison
     * available: three.js appends its output-colour-space conversion to its own
     * materials and not to a raw `ShaderMaterial`, so what both of these shaders write
     * is what the framebuffer gets. Against the dome's brightest painted pixel of
     * 91/255, this at a gain of 1 peaks at 126 and reads over 0.21 deg² — one full
     * Moon, which is what the object is usually described as — of which 0.003 deg², the
     * bulge and nothing else, is brighter than the band. At the top of the slider it
     * covers 0.99 deg².
     *
     * `EXPOSURE` sets where the stretch's knee falls, and so how much of the core is
     * compressed; `STRETCH_NORM` sets the level the result comes out at.
     */
    EXPOSURE: 0.44,
    STRETCH_NORM: 5.6,
};

/** Old stars in the bulge, young ones in the ring — the colours of the two populations. */
const TINTS: Record<string, string> = {
    BULGE_TINT: 'vec3(1.00, 0.84, 0.62)',
    DISC_TINT: 'vec3(0.66, 0.78, 1.00)',
};

function substitute(source: string): string {
    let out = source;
    for (const [name, value] of Object.entries(CONSTANTS)) {
        // GLSL has no implicit int→float conversion, so every one of these has to
        // arrive with a decimal point on it whatever the number happens to be.
        const literal = Number.isInteger(value) ? `${value}.0` : `${value}`;
        out = out.replace(new RegExp(`\\b${name}\\b`, 'g'), literal);
    }
    for (const [name, value] of Object.entries(TINTS)) {
        out = out.replace(new RegExp(`\\b${name}\\b`, 'g'), value);
    }
    return out;
}

const material = new ShaderMaterial({
    uniforms: { uGain: { value: gainAt(ANDROMEDA_BRIGHTNESS_DEFAULT) } },
    vertexShader,
    fragmentShader: substitute(fragmentShader),
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    // Out of tone mapping, like everything else on this backdrop: the adaptive exposure
    // follows the nearest planet's distance from the Sun, and a galaxy 2.5 million light
    // years away has no business getting brighter because the camera flew to Jupiter.
    toneMapped: false,
});

// --- The object -----------------------------------------------------------

/**
 * A `Group` at the galaxy's place with the disc turned inside it, rather than one
 * oriented mesh, and the reason is the label: `script.ts` hangs a CSS2D chip on this at
 * a local height, and in a frame rolled 35° round the line of sight "up" is not up.
 * The group is unrotated, so the chip goes where a chip should and the disc is free to
 * lie at whatever angle the measurement puts it.
 */
export const andromeda = new Group();
andromeda.position.copy(lineOfSight).multiplyScalar(SKY_RADIUS);
andromeda.renderOrder = -1;

const disc = new Mesh(new PlaneGeometry(QUAD_WIDTH_DEG, QUAD_HEIGHT_DEG), material);
// Local +x along the major axis, +y along the minor, +z back down the line of sight to
// the observer — so the plane faces the camera and the two sky axes are where the
// shader assumes they are. `makeBasis` rather than `lookAt`, which fixes one axis and
// leaves the roll to the world up vector: the roll is the position angle, and losing it
// puts a 3° galaxy at the wrong angle in a frame nobody can check by eye.
disc.quaternion.setFromRotationMatrix(
    new Matrix4().makeBasis(majorAxis, minorAxis, lineOfSight.clone().negate())
);
disc.scale.setScalar(UNITS_PER_DEGREE);
disc.renderOrder = -1;
andromeda.add(disc);

// --- What the panel needs -------------------------------------------------

/** The fixed direction in the scene's frame, for aiming the camera at it. */
export const andromedaDirection = lineOfSight.clone();

export const ANDROMEDA_DISTANCE_MLY = DISTANCE_MLY;
/** Integrated over the whole ellipse — see the note at the top on why that misleads. */
export const ANDROMEDA_MAGNITUDE = 3.44;

/**
 * Sets the exposure and reports the gain it landed on, so a read-out beside the control
 * cannot drift from what is being drawn. Zero takes the mesh out of the scene entirely
 * rather than drawing black, which also lets the label above it be hidden with it.
 */
export function setAndromedaBrightness(position: number): number {
    const gain = gainAt(position);
    material.uniforms.uGain.value = gain;
    andromeda.visible = gain > 0;
    return gain;
}
