// Earth constants
export const EARTH_SIDEREAL_DAY = 86164.1; // seconds
export const EARTH_RADIUS_KM = 6371; // kilometers
export const EARTH_ANGULAR_VELOCITY = (2 * Math.PI) / EARTH_SIDEREAL_DAY;

// Moon constants
export const MOON_RADIUS_KM = 1737.4; // kilometers
export const MOON_RADIUS = MOON_RADIUS_KM / EARTH_RADIUS_KM; // relative to Earth radius (1 unit)
export const MOON_DISTANCE_KM = 384400; // kilometers from Earth
export const MOON_DISTANCE = MOON_DISTANCE_KM / EARTH_RADIUS_KM; // relative to Earth radius
export const MOON_ORBITAL_PERIOD = 3600; // 1 hour
export const MOON_ANGULAR_VELOCITY = (2 * Math.PI) / MOON_ORBITAL_PERIOD; // radians per second

// ISS constants
export const ISS_ALTITUDE_KM = 408; // kilometers above Earth's surface
export const ISS_ORBITAL_RADIUS = 1 + (ISS_ALTITUDE_KM / EARTH_RADIUS_KM); // relative to Earth radius (1 unit)
export const ISS_UPDATE_INTERVAL = 1500; // milliseconds (1.5 seconds)
