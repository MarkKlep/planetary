import {
    AdditiveBlending,
    BufferAttribute,
    BufferGeometry,
    Color,
    Points,
    PointsMaterial,
    Vector3,
} from 'three';
import { daysSinceJ2000, equatorialToScene } from '../orbits';
import { SKY_RADIUS, flareSprite, kelvinToColor } from './background';

/**
 * Betelgeuse — the one star in this sky that is a *star* rather than a statistic.
 *
 * Everything in `background.ts` is a population: 17,760 points drawn from a
 * distribution, no one of which is anything in particular. This is the opposite. It
 * is at a measured right ascension and declination, it is the colour its measured
 * temperature makes it, and it is as bright as it is because of how far away it is.
 * Nothing about it is chosen for the frame.
 *
 * ## Where it goes
 *
 * A star catalogue quotes J2000 equatorial coordinates, which is the same frame the
 * IAU quotes a planet's pole in — so it lands through `equatorialToScene`, exactly
 * like `mars.ts`'s axis, rather than through hand-rolled sign juggling. Verified the
 * way the rest of this project verifies a frame conversion, against an independent
 * rotation of the same numbers: run through the galactic transform the result comes
 * out at l = 199.787°, b = -8.959°, against the published 199.79° and -8.96°. That
 * is the check that catches a sign error, because a mirrored longitude would not
 * survive it.
 *
 * It stays on J2000 rather than being precessed onto the equinox of date, and that
 * is deliberate. The scene's frame *is* J2000 — it is the planets that carry the
 * 0.373° offset documented in `orbits.ts`, because their positions are precessed
 * while the axis quaternions built alongside them are not. A star fixed at J2000 is
 * therefore in exactly the same frame as every axis node in the scene graph, and
 * costs nothing per frame to keep there.
 *
 * ## Why it does not need a distance
 *
 * It has one — about 548 light years, and `DISTANCE_LIGHT_YEARS` says why that
 * figure is unsettled — and it is 8×10¹¹ scene units. Flying from one edge of
 * this model to the other is 66 AU, and the parallax that buys against Betelgeuse
 * is 0.0001°: a ten-thousandth of a pixel. So the star sits on the backdrop shell
 * that already follows the camera, and the whole solar system is a point as far as
 * it is concerned. That is the honest picture, not a shortcut — it is also why the
 * user does not need to be able to travel to it.
 *
 * It also does not twinkle. Scintillation is the atmosphere, and there isn't one
 * anywhere in this project.
 *
 * ## One caveat worth stating
 *
 * The star is real; the sky behind it is not. `background.ts`'s galactic frame is a
 * composition choice — its own comment says so — so Betelgeuse is at its true place
 * relative to the ecliptic, the planets and the Sun, but *not* relative to the
 * painted Milky Way. In reality it sits 9° off the galactic plane, out toward the
 * anticentre, on the near shoulder of Orion.
 */

// --- Position -------------------------------------------------------------

/** α Orionis, J2000.0 (Hipparcos 27989 / SIMBAD). RA 05h 55m 10.30536s. */
const RIGHT_ASCENSION_DEG = (5 + 55 / 60 + 10.30536 / 3600) * 15;
/** Dec +07° 24' 25.4304". */
const DECLINATION_DEG = 7 + 24 / 60 + 25.4304 / 3600;

/**
 * The distance, and the one figure here that is genuinely unsettled: Hipparcos gives
 * 152 pc, radio astrometry 222 pc, asteroseismology 168 pc. A star this large has no
 * clean photocentre to measure a parallax against — its own convection cells move the
 * apparent centre around by a measurable fraction of the disc. 548 ly is the
 * asteroseismic value and the one usually quoted; it is used below only for the
 * figure the read-out prints, and nothing about where the star is *drawn* depends on
 * it — the direction is fixed whatever the range turns out to be.
 */
const DISTANCE_LIGHT_YEARS = 548;

// Proper motion is not carried: at 27 mas/yr this star moves 0.0000075° a year, so
// even wound forward a century the position is unchanged to five decimal places.
const DEG = Math.PI / 180;
const ra = RIGHT_ASCENSION_DEG * DEG;
const dec = DECLINATION_DEG * DEG;
const direction = equatorialToScene(
    // Standard equatorial: +x to the vernal equinox, +z to the celestial pole.
    new Vector3(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec))
);

// --- Colour ---------------------------------------------------------------

/** M1-2 Ia — the temperature that puts it among the reddest first-magnitude stars. */
const EFFECTIVE_TEMPERATURE_K = 3600;
/**
 * Far less whitening than the field gets. That correction models the eye failing to
 * see colour in a faint point source, and at magnitude 0.5 Betelgeuse is emphatically
 * not one — its orange is the single most commonly noticed colour in the night sky.
 *
 * And then converted to linear, which is not optional here and is the same trap
 * `saturn/moons.ts` documents from the other end. Helland's approximation returns
 * *display* RGB; a `material.color` is a working-space value that the renderer
 * encodes to sRGB on the way out. Handing the one straight to the other applies the
 * transfer curve a second time, and the curve lifts midtones hard: this star's
 * (1.00, 0.80, 0.64) would reach the screen as (1.00, 0.91, 0.83) — pale cream, and
 * a factual error about a star whose colour is the reason anyone looks at it.
 *
 * `background.ts`'s own field is left alone deliberately rather than overlooked. Its
 * colours are decorative, and after 45% whitening every one of them is close enough
 * to white that the double encoding moves it a percent or two. Betelgeuse's colour is
 * a measurement of a specific star, so it has to be right.
 */
const baseColor = kelvinToColor(EFFECTIVE_TEMPERATURE_K, 0.15).convertSRGBToLinear();

// --- Brightness, and the fact that it changes -----------------------------

/**
 * Betelgeuse is a semiregular variable (type SRc), and it is the only object in this
 * project whose *brightness* is a function of the simulated date rather than only its
 * position. Two periods, both from Kiss, Szabó & Bedding (2006): a 388-day pulsation
 * and a 2050-day long secondary period, the latter still not confidently explained.
 *
 * The epoch is not invented. In early February 2020 the two cycles reached minimum
 * together, which is a documented part of why the Great Dimming went as deep as it
 * did — so anchoring both here is anchoring them to a real, dated observation.
 *
 * What is deliberately *not* modelled is that dimming itself. It bottomed out at
 * magnitude 1.614, roughly 0.6 below what these two cycles alone can reach, and the
 * extra came from a cloud of dust the star had ejected condensing across the line of
 * sight. That was a one-off event, not a period; a model that reproduced it would be
 * reproducing a date rather than a star. Wind the clock to February 2020 and this
 * star dims, but not to the record.
 *
 * The amplitudes are the one pair of numbers here chosen rather than measured: they
 * are set to span the range the star is normally quoted over, about magnitude 0.0 to
 * 1.0, rather than fitted to a light curve.
 */
const MEAN_MAGNITUDE = 0.5;
const PULSATION_PERIOD_DAYS = 388;
const PULSATION_AMPLITUDE_MAG = 0.25;
const LONG_SECONDARY_PERIOD_DAYS = 2050;
const LONG_SECONDARY_AMPLITUDE_MAG = 0.2;
/** 2020-02-07: the coincident minimum of both cycles. */
const MINIMUM_EPOCH = daysSinceJ2000(new Date(Date.UTC(2020, 1, 7, 12)));

/**
 * Screen size at the mean magnitude, in pixels. Above the 18 px the brightest of the
 * procedural flare stars get, because Betelgeuse outshines all of them — it is around
 * the tenth brightest star in the sky and by far the reddest of that group.
 */
const BASE_SIZE_PX = 34;
/**
 * Multiplier on the sprite at mean brightness, and deliberately *not* over 1.
 *
 * The obvious way to make a star look bright is to push its colour past 1 and let
 * the additive blend clip — but clipping is per channel, so the first thing it costs
 * is the hue. Red is already at the top, so everything above 1 lifts only green and
 * blue: at 1.35 this star reaches the screen as (1.00, 0.92, 0.73) instead of its
 * (1.00, 0.80, 0.64), which is cream rather than orange. At exactly 1.0 red saturates
 * and the other two do not, so the core is warm and the halo around it is
 * unmistakably orange. The brightness that was wanted comes from `BASE_SIZE_PX`
 * instead, which costs hue nothing.
 */
const BASE_INTENSITY = 1.0;

/**
 * The flux ratio is split between the sprite's area and its intensity as f^0.25 and
 * f^0.5, which is the one split that conserves the total light on screen: a sprite's
 * contribution goes as intensity × size², and 0.5 + 2×0.25 = 1. Putting it all into
 * intensity would show almost nothing, since the core is already at the top of the
 * red channel and everything above that clips away; putting it all into size would
 * swell the star like a balloon.
 */
const SIZE_EXPONENT = 0.25;
const INTENSITY_EXPONENT = 0.5;

// --- The object -----------------------------------------------------------

/**
 * A one-vertex `Points` rather than a `Sprite`, for the reason the whole field is
 * `Points`: `sizeAttenuation: false` holds a constant pixel size at any distance,
 * which is what a star at infinity does. A sprite is sized in world units and would
 * shrink as the camera pulled back through the solar system.
 *
 * The vertex sits at the origin and the *object* carries the position, so that
 * `getWorldPosition` returns the star rather than the backdrop group's centre —
 * which is what lets it take a CSS2D label like any body in the scene.
 */
const geometry = new BufferGeometry();
geometry.setAttribute('position', new BufferAttribute(new Float32Array(3), 3));

const material = new PointsMaterial({
    size: BASE_SIZE_PX,
    map: flareSprite,
    sizeAttenuation: false,
    color: new Color(),
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    // Held out of tone mapping for the same reason the rest of the backdrop is: the
    // adaptive exposure follows the nearest planet's distance from the Sun, and a
    // star 548 light years away has no business getting 27x brighter at Jupiter.
    toneMapped: false,
});

export const betelgeuse = new Points(geometry, material);
betelgeuse.position.copy(direction).multiplyScalar(SKY_RADIUS);
betelgeuse.renderOrder = -1;

// --- The facts, and the one thing they add up to ---------------------------

/**
 * The figures the read-out prints, exported rather than typed into the panel — the
 * same rule `iss-hud.tsx` follows with the station's orbit. Two of them are used by
 * this module and all of them are shown, so what is on screen cannot drift from what
 * the scene is doing.
 *
 * ## Why there is no travelling to it, and why the app says so
 *
 * `BETELGEUSE_DISTANCE_LY` is 8×10¹¹ scene units. The whole model, from the Sun to
 * the furthest the camera can be pulled back, is 66 AU — one twelve-millionth of the
 * way. There is no camera move in this project that changes the star's direction by a
 * ten-thousandth of a pixel, which is why clicking it *points* the camera rather than
 * flying it, and why the panel says the distance rather than counting one down.
 *
 * That is also why the star stays a point. At its true angular diameter it is 0.042
 * arcseconds, five thousandths of one pixel: a point of light is not a stand-in for
 * the star, it is what the star looks like, and the only honest way to draw it.
 *
 * ## The pair that is checkable
 *
 * The radius and the distance are not two numbers off different pages. Together they
 * give 2·atan(3.553 / 3.466e7) = 0.0423″, against the 0.042″ uniform-disc diameter
 * interferometers measure in the visible — so the two are a consistent pair, verified
 * against a third quantity neither of them is.
 */
const SOLAR_RADIUS_KM = 695_700;
const AU_KM = 149_597_870.7;

/** 764 R☉ (Dolan et al. 2016). */
export const BETELGEUSE_RADIUS_SOLAR = 764;
/**
 * 3.553 AU. The figure worth putting on screen, because it is the one that lands:
 * stand this star where the Sun is and its surface swallows Mercury, Venus, Earth and
 * Mars and reaches into the asteroid belt.
 */
export const BETELGEUSE_RADIUS_AU = (BETELGEUSE_RADIUS_SOLAR * SOLAR_RADIUS_KM) / AU_KM;
export const BETELGEUSE_DISTANCE_LY = DISTANCE_LIGHT_YEARS;
export const BETELGEUSE_TEMPERATURE_K = EFFECTIVE_TEMPERATURE_K;
/** 0.042″ — which is why the sprite above is the honest representation. */
export const BETELGEUSE_ANGULAR_DIAMETER_ARCSEC =
    (2 * Math.atan(BETELGEUSE_RADIUS_AU / (DISTANCE_LIGHT_YEARS * 63_241.077))) / DEG * 3600;

/**
 * The one figure here that moves, and the only thing in this project whose
 * *brightness* is a function of the simulated date rather than only its position.
 * Written by `updateBetelgeuse` and read by the panel, in `issTelemetry`'s idiom.
 */
export const betelgeuseTelemetry = {
    magnitude: MEAN_MAGNITUDE,
};

/** The star's fixed direction in the scene's frame, for aiming the camera at it. */
export const betelgeuseDirection = direction.clone();

/**
 * Steps the pulsation.
 *
 * Cheap enough to call unconditionally — two cosines and a `Math.pow` — and it has to
 * run in surface mode too, where the backdrop is borrowed by the lunar sky and this is
 * one of the things hanging in it.
 */
export function updateBetelgeuse(date: Date): void {
    const days = daysSinceJ2000(date) - MINIMUM_EPOCH;
    // Plain cosines, which puts both cycles at *maximum magnitude* on the epoch —
    // and a larger magnitude is a fainter star, so that is the minimum of light.
    const magnitude =
        MEAN_MAGNITUDE +
        PULSATION_AMPLITUDE_MAG * Math.cos((2 * Math.PI * days) / PULSATION_PERIOD_DAYS) +
        LONG_SECONDARY_AMPLITUDE_MAG *
            Math.cos((2 * Math.PI * days) / LONG_SECONDARY_PERIOD_DAYS);

    // Pogson's relation: five magnitudes is a factor of a hundred in received flux.
    const flux = Math.pow(10, -0.4 * (magnitude - MEAN_MAGNITUDE));

    material.size = BASE_SIZE_PX * Math.pow(flux, SIZE_EXPONENT);
    material.color
        .copy(baseColor)
        .multiplyScalar(BASE_INTENSITY * Math.pow(flux, INTENSITY_EXPONENT));

    betelgeuseTelemetry.magnitude = magnitude;
}
