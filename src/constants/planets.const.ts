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

export const DEFAULT_TIME_SPEED = 3600;
