// Scene units: 1 unit = 1 Earth radius.
//
// Everything here is now at true scale — body sizes, the Earth-Moon distance and the
// Earth's orbit alike. Nothing is fudged.
//
// The payoff is that apparent sizes come out right for free: the Sun is 109 Earth
// radii across and sits 23,481 away, so from Earth it subtends 0.53° — exactly what
// you see from the ground. The cost is that Earth is 1 unit against a 23,481-unit
// orbit, so it falls far below a pixel whenever the orbit is in frame. That is what
// `body-marker.ts` exists to handle; do not "fix" it by scaling the meshes up.

// Earth constants
export const EARTH_SIDEREAL_DAY = 86164.0905; // seconds — one rotation in inertial space
export const EARTH_RADIUS_KM = 6371; // kilometers
/** Axial tilt. This is the entire reason the seasons exist, and it must stay fixed in
 *  inertial space as Earth goes round, not follow the planet. */
export const EARTH_OBLIQUITY_DEG = 23.4393;
export const EARTH_ORBITAL_PERIOD_DAYS = 365.256363;

// Sun constants
export const SUN_RADIUS_KM = 695700;
/** True relative size: the Sun really is ~109x Earth's radius. */
export const SUN_RADIUS = SUN_RADIUS_KM / EARTH_RADIUS_KM;
export const ASTRONOMICAL_UNIT_KM = 149597870.7;
/** True 1 AU, ~23,481 Earth radii. */
export const EARTH_ORBIT_RADIUS = ASTRONOMICAL_UNIT_KM / EARTH_RADIUS_KM;
export const SUN_INTENSITY = 3.2;
/** Equatorial rotation period. The Sun is fluid, so the poles lag well behind this. */
export const SUN_ROTATION_PERIOD_DAYS = 25.38;
// How far past the terminator city lights keep glowing. A hard cut at the
// terminator looks like a seam; real twilight fades over several degrees.
export const NIGHT_LIGHTS_FALLOFF = 0.22;

// Moon constants
export const MOON_RADIUS_KM = 1737.4; // kilometers
export const MOON_RADIUS = MOON_RADIUS_KM / EARTH_RADIUS_KM; // relative to Earth radius (1 unit)
export const MOON_DISTANCE_KM = 384400; // kilometers from Earth
/** Left at true scale, unlike the Earth's orbit — otherwise the Moon would sit 3.9
 *  units out and be impossible to watch orbiting. */
export const MOON_DISTANCE = MOON_DISTANCE_KM / EARTH_RADIUS_KM; // relative to Earth radius
export const MOON_ORBITAL_PERIOD_DAYS = 27.321661; // sidereal
/** Inclination to the ecliptic — not to Earth's equator. It is why we do not get an
 *  eclipse every single month. */
export const MOON_ORBIT_INCLINATION_DEG = 5.145;

// --- Standing on the Moon -------------------------------------------------
//
// The one place in this project that does *not* work in Earth radii. A scene unit is
// 6371 km, and an astronaut's eye is 1.7 m off the ground — 2.7e-7 of a unit. Rather
// than try to render that, `planets/earth/moon-surface/` builds its own scene in
// metres; these are the numbers that cross between the two.

export const MOON_RADIUS_M = MOON_RADIUS_KM * 1000;
/** Surface gravity, m/s². A sixth of Earth's, and the whole reason a hop hangs. */
export const MOON_SURFACE_GRAVITY = 1.62;
/** Eye height of a standing astronaut in an EVA suit, metres. */
export const MOON_EYE_HEIGHT_M = 1.7;
/**
 * Distance to the horizon from that eye height: √(2Rh), 2,430 m.
 *
 * Not a view-distance setting — it is a consequence of the radius above, and it is
 * why the ground patch is built with the sphere's real curvature baked into it rather
 * than as a flat plane with fog. Earth's horizon from the same height is 4,654 m, so
 * the Moon's is 1.9x closer; every Apollo crew remarked on it.
 */
export const MOON_HORIZON_M = Math.sqrt(2 * MOON_RADIUS_M * MOON_EYE_HEIGHT_M);
/**
 * Bond-style diffuse reflectance of lunar regolith.
 *
 * Same conversion the Martian moons need, for the same reason: the quoted geometric
 * albedo (0.12) is a full-phase disc comparison, and a Lambert material wants the
 * hemispherical reflectance, which for a sphere is 3/2 of it. Using 0.12 directly
 * makes the ground a third too dark.
 */
export const MOON_REGOLITH_ALBEDO = 0.12 * 1.5;

// Mercury constants
export const MERCURY_RADIUS_KM = 2439.4; // volumetric mean radius
/** Barely a third of Earth's, and smaller than two of the moons in the solar system. */
export const MERCURY_RADIUS = MERCURY_RADIUS_KM / EARTH_RADIUS_KM;
/**
 * IAU rotational elements, in the same form as Mars's and Venus's.
 *
 * The pole sits within 0.03° of *its own orbit's* normal — the smallest obliquity of
 * any planet, and effectively bolt upright. Mercury therefore has no seasons at all
 * from its tilt. What it has instead comes entirely from the eccentricity below.
 */
export const MERCURY_POLE_RA_DEG = 281.0103;
export const MERCURY_POLE_DEC_DEG = 61.4155;
export const MERCURY_PRIME_MERIDIAN_DEG = 329.5988;
/**
 * 6.1385108°/day is one turn every 58.646 days — and the orbit takes 87.969, which is
 * exactly 3:2. Mercury is locked into spinning three times for every two years.
 *
 * Nothing in this file imposes that ratio. The rate here is the IAU's, measured from
 * the planet's own orientation, and the orbital period falls out of the Standish mean
 * longitude in `orbits.ts`; the two were sourced independently and land on
 * 175.938 vs 175.939 days. The resonance is a result, not an input.
 *
 * The consequence is the strangest clock in the scene: sunrise to sunrise takes 176
 * days, so a **solar day on Mercury is two of its years long**. Watch it at "10 d/s"
 * and the planet visibly turns while the terminator barely moves.
 */
export const MERCURY_ROTATION_DEG_PER_DAY = 6.1385108;
export const MERCURY_SIDEREAL_DAY = (360 / MERCURY_ROTATION_DEG_PER_DAY) * 86400;
export const MERCURY_ORBITAL_PERIOD_DAYS = 87.969257;
/**
 * As dark as the Moon and then some — 0.106 against 0.12. Both are old, airless,
 * space-weathered rock, and neither reflects much of anything; Mercury only looks
 * bright from Earth because of where it sits, not what it is made of.
 *
 * Geometric albedo again, so it needs the same conversion as everything else here.
 * See `mercury.ts`, which does it by comparison with the Moon rather than in the
 * abstract, because both bodies are textured with brightness-normalised mosaics.
 */
export const MERCURY_GEOMETRIC_ALBEDO = 0.106;

// Venus constants
export const VENUS_RADIUS_KM = 6051.84; // volumetric mean radius
/** Within 5% of Earth's, so ~0.95 units. Venus is very nearly our twin in size. */
export const VENUS_RADIUS = VENUS_RADIUS_KM / EARTH_RADIUS_KM;
/**
 * Orientation of Venus in space, from the IAU working group's rotational elements,
 * given the same way Mars's are: a fixed pole direction in the J2000 *equatorial*
 * frame, plus a prime-meridian angle W measured east from the node of its equator.
 *
 * The pole points within 1.3° of ecliptic *north*, so the axis node below is very
 * nearly upright — Venus has essentially no seasons. What it has instead is in the
 * sign of the rotation rate.
 */
export const VENUS_POLE_RA_DEG = 272.76;
export const VENUS_POLE_DEC_DEG = 67.16;
export const VENUS_PRIME_MERIDIAN_DEG = 160.20;
/**
 * **Negative, and that is the whole point.** Venus turns backwards: the only planet
 * here whose W decreases with time, so the mesh spins the other way inside its pivot
 * and the Sun rises in the west. Nothing special-cases this — a negative rate runs
 * through exactly the same machinery as Mars's positive one.
 *
 * Quoted as an obliquity of 177.3° rather than as retrograde rotation, which says the
 * same thing: an axis tipped almost completely over. This scene never states that
 * figure anywhere; it falls out of the pole direction above, and measures 177.36°.
 */
export const VENUS_ROTATION_DEG_PER_DAY = -1.4813688;
/** 243.02 days — longer than Venus's own year, and the slowest spin in the solar system. */
export const VENUS_SIDEREAL_DAY = (360 / Math.abs(VENUS_ROTATION_DEG_PER_DAY)) * 86400;
export const VENUS_ORBITAL_PERIOD_DAYS = 224.700800;
/**
 * The cloud tops, ~65 km up, which is the surface as far as anything you can see is
 * concerned — the deck is completely opaque, and no one saw the ground beneath it
 * until Magellan's radar.
 */
export const VENUS_CLOUD_RADIUS = VENUS_RADIUS * (1 + 65 / VENUS_RADIUS_KM);
/**
 * Superrotation: the deck circles the planet in about four days, some sixty times
 * faster than the body under it turns.
 *
 * Earth's `CLOUD_ANGULAR_VELOCITY_SCALE` is a 15% nudge invented to give a parallax
 * cue. This is not that — it is the measured circulation of the upper cloud deck, and
 * it is the largest such disequilibrium in the solar system. Signed to match the
 * planet's own retrograde direction, because the winds blow the way Venus turns, only
 * very much faster.
 */
export const VENUS_CLOUD_ROTATION_PERIOD_DAYS = 4.2;
export const VENUS_CLOUD_DEG_PER_DAY = -360 / VENUS_CLOUD_ROTATION_PERIOD_DAYS;
/**
 * The haze above the cloud tops, out to ~100 km. Thin compared to the 65 km of opaque
 * deck below it, but it is what gives the limb its soft edge.
 */
export const VENUS_ATMOSPHERE_RADIUS = VENUS_RADIUS * (1 + 100 / VENUS_RADIUS_KM);
/**
 * The most reflective surface of any planet — those clouds are sulphuric acid, and
 * they throw back two thirds of everything that lands on them. Together with being
 * the closest planet to us it is why Venus outshines everything in our sky but the
 * Sun and Moon.
 *
 * As with the Martian moons this is the *geometric* albedo, which is not what a
 * diffuse material's colour means; see `venus/clouds.ts`, which converts.
 */
export const VENUS_GEOMETRIC_ALBEDO = 0.65;

// Mars constants
export const MARS_RADIUS_KM = 3389.5; // volumetric mean radius
/** Just over half Earth's radius, so ~0.53 units. */
export const MARS_RADIUS = MARS_RADIUS_KM / EARTH_RADIUS_KM;
/**
 * Orientation of Mars in space, from the IAU working group's rotational elements.
 *
 * The pole is given as a fixed direction in the J2000 *equatorial* frame, which is
 * what makes the Martian seasons work the same way Earth's do here: point the axis
 * once and leave it alone while the planet goes round. Mars's obliquity is not
 * stated anywhere — it falls out of this pole direction as ~25.2° to its own orbit,
 * which is why Mars has seasons much like Earth's, only twice as long.
 */
export const MARS_POLE_RA_DEG = 317.68143;
export const MARS_POLE_DEC_DEG = 52.88650;
/** Prime meridian angle at J2000, measured east from the node of Mars's equator. */
export const MARS_PRIME_MERIDIAN_DEG = 176.630;
export const MARS_ROTATION_DEG_PER_DAY = 350.89198226;
/** 24h 37m 22s — the reason a Martian sol runs ~40 minutes longer than a day. */
export const MARS_SIDEREAL_DAY = (360 / MARS_ROTATION_DEG_PER_DAY) * 86400;
export const MARS_ORBITAL_PERIOD_DAYS = 686.980;
/**
 * Mars's air is ~0.6% of Earth's pressure and its scale height is 11 km, so the haze
 * is a far thinner rind than Earth's: about 50 km, against Earth's ~220 km here.
 */
export const MARS_ATMOSPHERE_RADIUS = MARS_RADIUS * 1.015;

// Phobos and Deimos
//
// Neither is remotely round: they are too small for gravity to have pulled them into
// spheres, so their shapes are given as triaxial ellipsoids (JPL Horizons physical
// data). Both are tidally locked, and the convention below is the one that fact
// imposes — the longest axis is pulled toward Mars, the shortest ends up along the
// spin axis, and the middle one lies along the direction of travel.
//
//   [ toward Mars, along the spin axis, along the orbit ]
export const PHOBOS_SEMI_AXES_KM = [13.1, 9.3, 11.1] as const;
export const DEIMOS_SEMI_AXES_KM = [7.8, 5.1, 6.0] as const;

/** Volumetric mean radius of a triaxial ellipsoid: the cube root of the product. */
function ellipsoidMeanRadius([a, b, c]: readonly [number, number, number]): number {
    return Math.cbrt(a * b * c) / EARTH_RADIUS_KM;
}

/** ~11.1 km, so 0.0017 units — three thousandths of Earth. */
export const PHOBOS_RADIUS = ellipsoidMeanRadius(PHOBOS_SEMI_AXES_KM);
/** ~6.2 km. Small enough that the Sun's disc would still cover it from Mars. */
export const DEIMOS_RADIUS = ellipsoidMeanRadius(DEIMOS_SEMI_AXES_KM);

/**
 * Orbit semi-major axes, fitted to JPL's ephemeris (see `orbits.ts`).
 *
 * Phobos sits 2.77 Mars radii out — under 6,000 km above the surface, closer to its
 * planet than any other moon in the solar system, and *below* the areostationary
 * radius of ~20,400 km. Deimos, at 6.92 radii, is above it. That is why the two are
 * going opposite ways: Phobos orbits faster than Mars turns and is being dragged
 * down, Deimos slower and is drifting away.
 */
export const PHOBOS_ORBIT_RADIUS = 9378.54 / EARTH_RADIUS_KM;
export const DEIMOS_ORBIT_RADIUS = 23458.95 / EARTH_RADIUS_KM;

/**
 * Among the darkest surfaces in the solar system: about as reflective as fresh
 * asphalt, and little more than half the Moon's already-dark 0.12. Being this sooty
 * is most of the case for both moons being captured outer-belt asteroids rather than
 * anything born at Mars.
 *
 * This is the *geometric* albedo, i.e. brightness at full phase against a perfect
 * diffuse disc, which is the figure that gets quoted but not the one a diffuse
 * material wants — see `moons.ts`, which converts. There is no texture for either
 * body; the surfaces are generated, so unlike every other body here the albedo is
 * authored directly rather than measured off a map.
 */
export const MARTIAN_MOON_GEOMETRIC_ALBEDO = 0.068;

// Atmosphere / cloud constants (multiples of Earth's radius)
export const CLOUD_RADIUS = 1.006;
export const ATMOSPHERE_RADIUS = 1.035;
// Clouds drift slightly faster than the surface, which gives a parallax cue that
// reads as depth between the two shells.
export const CLOUD_ANGULAR_VELOCITY_SCALE = 1.15;

// ISS constants
export const ISS_ALTITUDE_KM = 408; // kilometers above Earth's surface
export const ISS_ORBITAL_RADIUS = 1 + (ISS_ALTITUDE_KM / EARTH_RADIUS_KM); // relative to Earth radius (1 unit)
export const ISS_UPDATE_INTERVAL = 1500; // milliseconds (1.5 seconds)

/**
 * Simulated seconds per real second. A day and a year are 365x apart, so no single
 * rate shows both: the slow settings are for watching the surface and terminator,
 * the fast ones for watching the orbit.
 */
export const TIME_SPEEDS = [
    { label: 'Real', secondsPerSecond: 1 },
    { label: '1 hr/s', secondsPerSecond: 3600 },
    { label: '1 day/s', secondsPerSecond: 86400 },
    { label: '10 d/s', secondsPerSecond: 864000 },
] as const;

export const DEFAULT_TIME_SPEED = 1;
