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
