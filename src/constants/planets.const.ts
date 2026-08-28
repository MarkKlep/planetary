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

// --- Lunar Roving Vehicle -------------------------------------------------
//
// Boeing/Delco, flown on Apollo 15, 16 and 17. Every figure here is the real one, and
// between them they are why it handles the way it does: 2.29 m of wheelbase against
// 1.83 m of track is nearly square, which is exactly why the crews kept getting the
// back end loose, and why Young managed to get all four wheels off the ground at once
// on the "Grand Prix" run.

/** 7.5 ft. */
export const LRV_WHEELBASE_M = 2.286;
/** Wheel centre to wheel centre across the vehicle. */
export const LRV_TRACK_M = 1.83;
/** 10 ft over the wheels, and only 3.6 ft tall — it is nearly as wide as it is long. */
export const LRV_LENGTH_M = 3.05;
/**
 * 3.6 ft, to the top of the seat backs. Everything above that — the antenna mast, the
 * TV camera — was deployed on the surface and is not part of the packaged height.
 */
export const LRV_HEIGHT_M = 1.14;
/** 14 in. The chassis clears the ground by less than half a wheel radius. */
export const LRV_GROUND_CLEARANCE_M = 0.36;
/** 32 in diameter, woven from 0.84 mm zinc-coated steel strand. */
export const LRV_WHEEL_RADIUS_M = 0.4064;
/** 9 in. */
export const LRV_WHEEL_WIDTH_M = 0.23;
/**
 * The titanium bump-stop frame *inside* the mesh, 25.5 in across. Wire this fine
 * deflects flat under load, and the frame is what it lands on when it does — visible
 * straight through the tyre, which is most of why an LRV wheel looks like nothing
 * else.
 */
export const LRV_BUMP_STOP_RADIUS_M = 0.3239;
/**
 * Design top speed, 13 km/h. Both axles steer, in opposite directions, which is what
 * gets a 3.1 m turning circle out of a 3.1 m vehicle.
 */
export const LRV_TOP_SPEED_MS = 13 / 3.6;
/**
 * 18 km/h, downhill, Cernan on Apollo 17 — the lunar land speed record, and still
 * standing. Not a limit the driving model imposes; it is simply what the slope gives
 * you if you point it downhill, the same way it did then.
 */
export const LRV_RECORD_SPEED_MS = 18 / 3.6;
/** Both axles turn this far, in opposite senses. */
export const LRV_MAX_STEER_RAD = (22 * Math.PI) / 180;

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

// Jupiter constants
//
// The first body here big enough that its own shape matters. Everything else in this
// scene is round enough to draw as a sphere; Jupiter is not, and the difference is
// visible rather than academic — see JUPITER_FLATTENING below.
export const JUPITER_EQUATORIAL_RADIUS_KM = 71492;
/** 6.5% shorter than the equatorial one, and that gap is the whole point. */
export const JUPITER_POLAR_RADIUS_KM = 66854;
/** Volumetric mean, 69911 km — the figure the mass and density are quoted against. */
export const JUPITER_RADIUS_KM = 69911;
/** ~10.97 units. Eleven Earths across, and 318 Earths in mass. */
export const JUPITER_RADIUS = JUPITER_RADIUS_KM / EARTH_RADIUS_KM;
export const JUPITER_EQUATORIAL_RADIUS = JUPITER_EQUATORIAL_RADIUS_KM / EARTH_RADIUS_KM;
/**
 * Oblateness, (a−b)/a = 0.0649 — by far the largest of any planet, and the one
 * physical property here that a plain `SphereGeometry` simply cannot express.
 *
 * It is a straight consequence of the two numbers above it: a ten-hour day on a body
 * eleven Earths wide puts the equator at 12.6 km/s, and having no solid surface to
 * resist it, the whole planet bulges. Saturn is more oblate still by this measure
 * (0.098); Earth manages 0.0034 and is drawn round here without anyone noticing.
 *
 * At 0.065 it is emphatically not invisible: Jupiter's disc is a twentieth wider than
 * it is tall, which is obvious in any photograph and in a backyard telescope. See
 * `jupiter.ts`, which scales the mesh rather than pretending otherwise.
 */
export const JUPITER_FLATTENING =
    (JUPITER_EQUATORIAL_RADIUS_KM - JUPITER_POLAR_RADIUS_KM) / JUPITER_EQUATORIAL_RADIUS_KM;
/**
 * IAU rotational elements, same form as the inner planets'.
 *
 * The pole sits 3.12° from Jupiter's own orbit normal, so like Mercury and Venus it
 * has essentially no seasons — but for a third reason again: not an upright axis
 * (Mercury) nor an upside-down one (Venus), just a mild lean on a body whose weather
 * is driven by internal heat rather than by sunlight anyway. Jupiter radiates roughly
 * 1.7 times the energy it receives.
 */
export const JUPITER_POLE_RA_DEG = 268.056595;
export const JUPITER_POLE_DEC_DEG = 64.495303;
export const JUPITER_PRIME_MERIDIAN_DEG = 284.95;
/**
 * System III, the magnetic rotation — and the only honest choice, because Jupiter has
 * no surface to time.
 *
 * A gas giant does not rotate as one body. The equatorial cloud deck (System I) laps
 * the mid-latitudes (System II) by a full turn every ~50 days, so neither can define a
 * prime meridian. System III tracks the tilted magnetic field, which is anchored deep
 * in the metallic-hydrogen interior and is the closest thing to the *planet's* own
 * rotation there is. 870.536°/day is 9h 55m 29.7s — the shortest day in the solar
 * system, on much the largest planet.
 *
 * Nothing in the scene models the differential rotation on top of this. The bands
 * would shear apart a texture that is a single snapshot, and the map is exactly that.
 */
export const JUPITER_ROTATION_DEG_PER_DAY = 870.536;
export const JUPITER_SIDEREAL_DAY = (360 / JUPITER_ROTATION_DEG_PER_DAY) * 86400;
export const JUPITER_ORBITAL_PERIOD_DAYS = 4332.589;

// The Galilean moons
//
// Discovered in January 1610, and the first objects ever seen orbiting something that
// was not Earth — which is most of why the Copernican argument stopped being abstract.
// Any of the four would be a planet in its own right if it orbited the Sun instead;
// Ganymede is larger than Mercury, which is in this scene to be compared against.
export const IO_RADIUS_KM = 1821.6;
export const EUROPA_RADIUS_KM = 1560.8;
/** 2634.1 km — the largest moon in the solar system, and 8% wider than Mercury. */
export const GANYMEDE_RADIUS_KM = 2634.1;
export const CALLISTO_RADIUS_KM = 2410.3;

export const IO_RADIUS = IO_RADIUS_KM / EARTH_RADIUS_KM;
export const EUROPA_RADIUS = EUROPA_RADIUS_KM / EARTH_RADIUS_KM;
export const GANYMEDE_RADIUS = GANYMEDE_RADIUS_KM / EARTH_RADIUS_KM;
export const CALLISTO_RADIUS = CALLISTO_RADIUS_KM / EARTH_RADIUS_KM;

/**
 * Orbit semi-major axes, fitted to JPL's JUP365 ephemeris (see `orbits.ts`).
 *
 * The three inner ones are locked in the **Laplace resonance**: Io goes round exactly
 * four times for Europa's two and Ganymede's one. It is the only three-body mean-motion
 * resonance known in the solar system, and it is not decorative — being held eccentric
 * by the other two is what keeps Io's interior kneaded and makes it the most
 * volcanically active body there is, and what most likely keeps Europa's ocean liquid.
 *
 * As with Mercury's 3:2, nothing here imposes it. The three mean motions in `orbits.ts`
 * were fitted from three separate ephemeris files and land on
 * n_Io − 3·n_Europa + 2·n_Ganymede = −5.6×10⁻⁶ °/day, which is 3×10⁻⁸ of Io's own
 * mean motion. The resonance is a result, not an input.
 */
export const IO_ORBIT_RADIUS = 421765.7 / EARTH_RADIUS_KM;
export const EUROPA_ORBIT_RADIUS = 671061.0 / EARTH_RADIUS_KM;
export const GANYMEDE_ORBIT_RADIUS = 1070429.8 / EARTH_RADIUS_KM;
export const CALLISTO_ORBIT_RADIUS = 1882744.4 / EARTH_RADIUS_KM;

/**
 * Geometric albedos, and the widest spread of any family of bodies here.
 *
 * Io is repaved with sulphur dioxide frost faster than space weathering can darken it;
 * Europa is young water ice, the most reflective solid surface in the solar system
 * after Enceladus. Callisto at 0.22 is the other extreme — the oldest, most cratered
 * surface known, with four billion years of accumulated dark residue on it. Ganymede
 * sits between the two because it is literally both: bright young grooved terrain
 * cutting across ancient dark plates.
 *
 * These are geometric albedos, so they need the same conversion to diffuse reflectance
 * that the Martian moons and Venus need. `moons.ts` does it — see the comment there,
 * which also explains why only two of the four get to use the figure directly.
 */
export const IO_GEOMETRIC_ALBEDO = 0.63;
export const EUROPA_GEOMETRIC_ALBEDO = 0.67;
export const GANYMEDE_GEOMETRIC_ALBEDO = 0.43;
export const CALLISTO_GEOMETRIC_ALBEDO = 0.22;

// Saturn constants
//
// The second gas giant, and the one that makes the case for the shape a sixth time —
// but it is also the first body here whose defining feature is not the body. Saturn
// without its rings is a smaller, blander Jupiter; the rings are 99.9% of why anyone
// has ever pointed a telescope at it, and they get their own section below.
export const SATURN_EQUATORIAL_RADIUS_KM = 60268;
/** Very nearly 10% shorter than the equatorial one. */
export const SATURN_POLAR_RADIUS_KM = 54364;
/** Volumetric mean, 58232 km — the figure the mass and density are quoted against. */
export const SATURN_RADIUS_KM = 58232;
/** ~9.14 units. Nine Earths across, and 95 Earths in mass. */
export const SATURN_RADIUS = SATURN_RADIUS_KM / EARTH_RADIUS_KM;
export const SATURN_EQUATORIAL_RADIUS = SATURN_EQUATORIAL_RADIUS_KM / EARTH_RADIUS_KM;
/**
 * Oblateness, (a−b)/a = 0.098 — **the largest of any planet**, half again Jupiter's
 * already-conspicuous 0.065, and a tenth of the disc.
 *
 * Saturn spins nearly as fast as Jupiter on a body nearly as wide, but with a third
 * of the mass holding it together: mean density 0.687 g/cm³, the only planet that
 * would float. Less gravity against the same centrifugal throw means more bulge. At
 * this figure it is not a subtlety to be argued for — Saturn is visibly an ellipse in
 * any photograph, and `saturn.ts` scales the mesh for it exactly as `jupiter.ts` does.
 */
export const SATURN_FLATTENING =
    (SATURN_EQUATORIAL_RADIUS_KM - SATURN_POLAR_RADIUS_KM) / SATURN_EQUATORIAL_RADIUS_KM;
/**
 * IAU rotational elements, same form as everything else here.
 *
 * The pole leans **26.73°** from Saturn's orbit normal — the largest obliquity of the
 * four bodies in this scene that have any worth mentioning, a shade more than Earth's
 * 23.44°. That figure is stated nowhere in this project; it falls out of the pole
 * direction below, the same way Mars's 25.19° does.
 *
 * It is also the single reason the rings are worth watching over time rather than
 * looking at once. Saturn holds that lean fixed in space through a 29½-year orbit, so
 * we see the ring plane open to 27° and close to edge-on twice a year of Saturn's —
 * about every 15 years, most recently in March 2025. At the crossing the rings vanish
 * completely for a body 270,000 km across, because they are some tens of metres thick.
 */
export const SATURN_POLE_RA_DEG = 40.589;
export const SATURN_POLE_DEC_DEG = 83.537;
export const SATURN_PRIME_MERIDIAN_DEG = 38.90;
/**
 * System III again, and for the same reason it is used for Jupiter: a gas giant has no
 * surface to time, and the visible cloud decks shear past one another.
 *
 * Saturn makes that problem far worse than Jupiter does. Its equatorial jet blows at
 * some 470 m/s — four times Jupiter's — so System I and System III disagree by minutes
 * per rotation, and worse, Saturn's magnetic field is very nearly *axisymmetric*, which
 * means it gives almost no rotational signal at all. Estimates of the true interior
 * period have moved by six minutes since Voyager. 810.7939°/day is 10h 39m 22.4s, the
 * long-standing IAU value; Cassini's ring-seismology result argues for 10h 33m 38s.
 * The scene is not in a position to adjudicate that, and at any time multiplier where
 * the spin is visible, six minutes in ten hours is not.
 */
export const SATURN_ROTATION_DEG_PER_DAY = 810.7939024;
export const SATURN_SIDEREAL_DAY = (360 / SATURN_ROTATION_DEG_PER_DAY) * 86400;
export const SATURN_ORBITAL_PERIOD_DAYS = 10755.698;

// The rings
//
// Given as radii from Saturn's *centre*, which is the convention every ring table uses
// and the only one that makes sense — a ring's position is set by its orbital radius,
// and the planet's surface is not involved. Divided through by the equatorial radius
// they run 1.11 to 2.33, so the whole system sits closer to Saturn than the Moon does
// to Earth by a factor of six.
//
// Boundaries are Cassini-era values, good to a few kilometres. The optical depths that
// go with them live in `saturn/rings.ts`, because unlike these they are a *profile*
// rather than a set of edges.
export const SATURN_RING_INNER_KM = 66900; // inner edge of the D ring
/**
 * The F ring, and where this model stops.
 *
 * There is more beyond it — the G ring, and the Phoebe ring out at 13 million km,
 * which is a quarter the width of the sky from Saturn and was only found in 2009. None
 * of it is visible: the E ring's optical depth is 10⁻⁵ and the Phoebe ring's is 10⁻⁸.
 * Drawing them would be drawing something nobody has ever seen with an eye.
 */
export const SATURN_RING_OUTER_KM = 140180;
export const SATURN_RING_INNER = SATURN_RING_INNER_KM / EARTH_RADIUS_KM;
export const SATURN_RING_OUTER = SATURN_RING_OUTER_KM / EARTH_RADIUS_KM;
/**
 * The rings are ~10 m thick, which is 1.6×10⁻⁶ scene units — four orders of magnitude
 * under a pixel at any distance, and under the depth buffer's resolution besides. So
 * they are drawn as a mathematical plane, with no thickness at all, and the edge-on
 * disappearance comes out right for free rather than being modelled.
 *
 * For scale: at the ring system's true proportions, a sheet of paper standing in for
 * the rings would have to be four kilometres across.
 */

// The seven major moons
//
// Saturn has 274 confirmed moons, more than every other planet put together. These
// seven are the ones that are *worlds* — round, named before 1790 except Mimas and
// Enceladus (1789, both by Herschel), and every one of them larger than the largest
// body that is not. There is a real gap below Mimas: the next moon down, Hyperion, is
// a tumbling 135 km lump that is not round and does not even rotate predictably.
export const MIMAS_RADIUS_KM = 198.8;
export const ENCELADUS_RADIUS_KM = 252.3;
export const TETHYS_RADIUS_KM = 536.3;
export const DIONE_RADIUS_KM = 562.5;
export const RHEA_RADIUS_KM = 764.5;
/** 2575.5 km — the second largest moon in the solar system, and larger than Mercury. */
export const TITAN_RADIUS_KM = 2575.5;
export const IAPETUS_RADIUS_KM = 734.5;

export const MIMAS_RADIUS = MIMAS_RADIUS_KM / EARTH_RADIUS_KM;
export const ENCELADUS_RADIUS = ENCELADUS_RADIUS_KM / EARTH_RADIUS_KM;
export const TETHYS_RADIUS = TETHYS_RADIUS_KM / EARTH_RADIUS_KM;
export const DIONE_RADIUS = DIONE_RADIUS_KM / EARTH_RADIUS_KM;
export const RHEA_RADIUS = RHEA_RADIUS_KM / EARTH_RADIUS_KM;
export const TITAN_RADIUS = TITAN_RADIUS_KM / EARTH_RADIUS_KM;
export const IAPETUS_RADIUS = IAPETUS_RADIUS_KM / EARTH_RADIUS_KM;

/**
 * Titan's haze deck, and the reason Titan needs two shells the way Venus does.
 *
 * Titan is the only moon in the solar system with a real atmosphere — 1.45 bar at the
 * surface, half again Earth's, on a body a third of Earth's radius. It is opaque in
 * visible light: an unbroken orange photochemical smog that hid the surface from
 * Voyager entirely and was only seen through by Cassini, at 938 nm, through a window
 * between methane absorption bands.
 *
 * So the map in `titan.ts` is near-infrared, not colour — the same situation as Venus's
 * radar map, and the same treatment: the deck is what Titan *looks* like, and the
 * surface underneath is what has to be revealed. 150 km up is where the main haze
 * becomes optically thick; the detached haze layer above it reaches 500 km.
 */
export const TITAN_HAZE_RADIUS = (TITAN_RADIUS_KM + 150) / EARTH_RADIUS_KM;

/**
 * Orbit semi-major axes, fitted to JPL's SAT441 ephemeris (see `orbits.ts`).
 *
 * The inner five are packed inside 8.75 Saturn radii — for comparison, Jupiter's
 * outermost Galilean sits at 26 Jupiter radii, and our own Moon at 60 Earth radii.
 * Then the system stops, and Titan is out at 20 radii with 96% of all the mass that
 * orbits Saturn, and Iapetus at 59.
 */
export const MIMAS_ORBIT_RADIUS = 185536.3 / EARTH_RADIUS_KM;
export const ENCELADUS_ORBIT_RADIUS = 238034.0 / EARTH_RADIUS_KM;
export const TETHYS_ORBIT_RADIUS = 294673.1 / EARTH_RADIUS_KM;
export const DIONE_ORBIT_RADIUS = 377415.2 / EARTH_RADIUS_KM;
export const RHEA_ORBIT_RADIUS = 527067.7 / EARTH_RADIUS_KM;
export const TITAN_ORBIT_RADIUS = 1221865.0 / EARTH_RADIUS_KM;
export const IAPETUS_ORBIT_RADIUS = 3560839.9 / EARTH_RADIUS_KM;

/**
 * Geometric albedos, and the brightest family of surfaces anywhere.
 *
 * Five of the seven are over 0.9 and Enceladus is over 1, which is not a mistake: a
 * geometric albedo is a comparison against a perfect diffusing disc, and a surface
 * that backscatters — as fresh, fluffy, sub-micron ice frost does — beats it. Enceladus
 * is the most reflective body in the solar system, and it is that way because it is
 * *repainting itself*: its south-polar jets feed the E ring, and the E ring snows back
 * onto Enceladus and onto everything near it. Mimas, Tethys, Dione and Rhea are all
 * inside that snowstorm, which is most of why they are so bright.
 *
 * Iapetus is the exception and the famous one. It is not one albedo but two — 0.05 on
 * the leading hemisphere, 0.6 on the trailing — a contrast of more than ten, the
 * largest on any body in the solar system. Cassini found the cause: the dark side is
 * sweeping up dust from the Phoebe ring, warms in the Sun, and its ice sublimates away
 * to refreeze on the cold bright side, which runs away until the two hemispheres are
 * what they are now. That contrast is *in the map*, so unlike everything else here
 * Iapetus's figure is only its bright half; see `saturn/moons.ts`.
 *
 * These are Verbiscer et al. (2007) for the five icy moons — Horizons rounds four of
 * them to a flat 0.6 — and Horizons for Titan and Iapetus. As everywhere else in this
 * project they are *geometric* albedos and need converting before a diffuse material
 * can use them; `saturn/moons.ts` does it by comparison, the way the Galileans' are.
 */
export const MIMAS_GEOMETRIC_ALBEDO = 0.962;
export const ENCELADUS_GEOMETRIC_ALBEDO = 1.375;
export const TETHYS_GEOMETRIC_ALBEDO = 1.229;
export const DIONE_GEOMETRIC_ALBEDO = 0.998;
export const RHEA_GEOMETRIC_ALBEDO = 0.949;
export const TITAN_GEOMETRIC_ALBEDO = 0.22;
/** The *bright* hemisphere only. The leading side is 0.05, and the map carries it. */
export const IAPETUS_GEOMETRIC_ALBEDO = 0.6;

// Uranus constants
//
// The third gas giant, the seventh planet, and the first one nobody knew was there.
// Mercury through Saturn have been watched since prehistory; Uranus sits at magnitude
// 5.6 at opposition, which is naked-eye only in the sense that it is technically above
// the threshold, and it had been catalogued as a star at least twenty times before
// Herschel noticed in 1781 that it had a disc. That is what doubled the known radius of
// the solar system in a single evening, and it is why its marker here is a small dim
// dot rather than one of the generous ones Venus and Jupiter get.
export const URANUS_EQUATORIAL_RADIUS_KM = 25559;
/** 2.3% shorter than the equatorial one. */
export const URANUS_POLAR_RADIUS_KM = 24973;
/** Volumetric mean, 25362 km — the figure the mass and density are quoted against. */
export const URANUS_RADIUS_KM = 25362;
/** ~3.98 units. Four Earths across, and 14.5 Earths in mass. */
export const URANUS_RADIUS = URANUS_RADIUS_KM / EARTH_RADIUS_KM;
export const URANUS_EQUATORIAL_RADIUS = URANUS_EQUATORIAL_RADIUS_KM / EARTH_RADIUS_KM;
/**
 * Oblateness, (a−b)/a = 0.0229 — a third of Jupiter's and a quarter of Saturn's, and
 * the marginal case of the three.
 *
 * Uranus turns in 17.24 hours, only two thirds slower than Jupiter, but on a body
 * two fifths the width, so the equator is thrown at 2.6 km/s rather than 12.6. At 2.3%
 * it is well past Earth's 0.0034 — which is drawn round here and rightly — and it is
 * about a dozen pixels on the disc as `URANUS_VIEW_DISTANCE` frames it. It is applied,
 * on the same one line `jupiter.ts` and `saturn.ts` use, mostly because on a planet
 * with nothing on its face the silhouette is the only thing there is to look at.
 */
export const URANUS_FLATTENING =
    (URANUS_EQUATORIAL_RADIUS_KM - URANUS_POLAR_RADIUS_KM) / URANUS_EQUATORIAL_RADIUS_KM;
/**
 * IAU rotational elements, and the pair that produce the strangest thing about Uranus
 * without either of them mentioning it.
 *
 * The obliquity is **97.77°** — the planet is tipped past its side and rolls along its
 * orbit rather than spinning upright in it. Nothing here says so. What is here is a
 * pole direction and, below, a rotation rate that happens to be negative, exactly as
 * Venus's is; the 97.77° is the angle between the orbit normal and the direction the
 * planet actually turns, and it falls out of those two the way Earth's 23.44° and
 * Saturn's 26.73° fall out of theirs. Checked against JPL Horizons: 97.770°.
 *
 * Note the declination is *negative* while the pole still sits 7.7° **north** of the
 * ecliptic — those are consistent, not contradictory. The IAU picks whichever pole
 * lies north of the invariable plane regardless of which way the body turns, so for a
 * retrograde rotator the angular velocity points down the pole rather than up it, and
 * the obliquity comes out obtuse. Venus is the same arrangement carried further:
 * pole 2.6° from the orbit normal, spin negative, obliquity 177.36°.
 *
 * The consequence is the most extreme seasons in the solar system, and they are
 * geometry rather than weather. For a quarter of the 84-year orbit each pole points
 * very nearly at the Sun, so it gets 42 years of continuous daylight while the other
 * gets 42 years of night, and at the equinoxes — 2007, next in 2049 — the Sun crosses
 * the equator and the whole planet runs 17-hour days. The scene produces all of it from
 * the fixed-pole node, the same mechanism behind Earth's seasons and Saturn's rings
 * opening and closing.
 */
export const URANUS_POLE_RA_DEG = 257.311;
export const URANUS_POLE_DEC_DEG = -15.175;
export const URANUS_PRIME_MERIDIAN_DEG = 203.81;
/**
 * Negative, and that single sign is the whole of what makes Uranus retrograde here —
 * no branch, no special case, exactly as with Venus.
 *
 * System III again, the magnetic rotation, for the reason Jupiter's and Saturn's are:
 * a gas giant has no surface to time. Uranus's field is a better clock than Saturn's,
 * being tilted 59° from the spin axis and offset a third of a radius from the centre,
 * so it gives a strong signal — but it was measured over five days of Voyager 2 flyby
 * in January 1986 and has not been measured since, which is why the quoted uncertainty
 * on 17.24 h is still ±0.01 and there is no prospect of narrowing it without going back.
 */
export const URANUS_ROTATION_DEG_PER_DAY = -501.1600928;
/** 17h 14m 24s. `Math.abs` for the same reason Venus's needs it: this is a duration. */
export const URANUS_SIDEREAL_DAY = (360 / Math.abs(URANUS_ROTATION_DEG_PER_DAY)) * 86400;
export const URANUS_ORBITAL_PERIOD_DAYS = 30685.4;
/**
 * Geometric albedo, and unlike Jupiter's and Saturn's this one is used rather than
 * merely recorded.
 *
 * Those two carry real visible-light mosaics that already hold their own brightness.
 * There is no such map of Uranus — see `uranus/uranus.ts` — so the surface here is
 * generated, and the albedo has to be authored the way the Martian moons' and Venus's
 * deck are: taken from the measurement and converted, since a geometric albedo is
 * brightness at full phase against a perfect diffusing disc and a diffuse material
 * wants hemispherical reflectance.
 *
 * Published values run 0.488 (Karkoschka's spectrophotometry) to 0.51 (Horizons, and
 * the NASA fact sheet). The spread is wider than most of the choices made downstream
 * of it, which is worth knowing before anyone tunes against the third decimal.
 */
export const URANUS_GEOMETRIC_ALBEDO = 0.51;

// Neptune constants
//
// The eighth planet, the last one, and the only one that was **found with a pencil**.
// Uranus kept failing to be where it was predicted to be, so Le Verrier and Adams each
// worked backwards from the discrepancy to a body that could be causing it; Galle
// pointed a telescope where Le Verrier said and had it inside an hour, within a degree
// of the prediction, on 23 September 1846. Every planet before it was seen and then
// explained. This one was explained and then seen.
//
// It is also Uranus's twin in every bulk property and its opposite in every visible
// one, which is the useful thing about having both here — see `neptune/neptune.ts`.
export const NEPTUNE_EQUATORIAL_RADIUS_KM = 24766;
/** 1.7% shorter than the equatorial one. */
export const NEPTUNE_POLAR_RADIUS_KM = 24342;
/** Volumetric mean, 24624 km — the figure the mass and density are quoted against. */
export const NEPTUNE_RADIUS_KM = 24624;
/** ~3.87 units. Slightly *smaller* than Uranus and 18% more massive. */
export const NEPTUNE_RADIUS = NEPTUNE_RADIUS_KM / EARTH_RADIUS_KM;
export const NEPTUNE_EQUATORIAL_RADIUS = NEPTUNE_EQUATORIAL_RADIUS_KM / EARTH_RADIUS_KM;
/** Oblateness, 0.0171 — the smallest of the four giants, and still five times Earth's. */
export const NEPTUNE_FLATTENING =
    (NEPTUNE_EQUATORIAL_RADIUS_KM - NEPTUNE_POLAR_RADIUS_KM) / NEPTUNE_EQUATORIAL_RADIUS_KM;
/**
 * IAU rotational elements — and the first pole in this project that **moves**.
 *
 * Every other body here gets two constants and a fixed axis node. Neptune's published
 * pole carries periodic terms:
 *
 *   N  = 357.85 + 52.316 T          (T in Julian centuries — a 688-year cycle)
 *   α₀ = 299.36 + 0.70 sin N
 *   δ₀ = 43.46 − 0.51 cos N
 *
 * The figures below are that model evaluated **at J2000**, which is the frame every axis
 * quaternion in this scene is built in, and they are then held fixed like all the
 * others. What that costs was measured rather than assumed: over 2000-2030 Horizons'
 * own pole moves 0.19° in right ascension and 0.014° in declination, and carried through
 * the whole rotation model that comes to **0.037°** of sub-Earth longitude — a tenth of
 * the constant 0.373° frame offset the scene already carries for precession, and far
 * under a pixel on anything you can see. Adding a per-frame pole for it would mean
 * rebuilding an axis quaternion every frame to chase an angle that moves half a degree
 * a century, which is exactly the trade the Mercury libration note rejects.
 *
 * The obliquity comes out at 28.32°, a shade over Earth's 23.44° and Saturn's 26.73° —
 * so Neptune has ordinary seasons, of a sort. They last 41 years each.
 */
export const NEPTUNE_POLE_RA_DEG = 299.33373;
export const NEPTUNE_POLE_DEC_DEG = 42.95036;
/** W₀ = 249.978 plus the −0.48 sin N term at J2000, for the reason above. */
export const NEPTUNE_PRIME_MERIDIAN_DEG = 249.996;
/**
 * 15.966 hours, **not the 16.11 the fact sheets quote**, and the difference is real
 * rather than a transcription slip. Do not "correct" it.
 *
 * 16.11 h is System III, the rotation of the magnetic field, measured by Voyager 2's
 * radio experiment over five days in August 1989 — the same kind of number Jupiter's and
 * Saturn's prime meridians are built on, and the one Horizons still prints under
 * "Sid. rot. period". It is not what the IAU uses for Neptune any more. Karkoschka
 * (2011) tracked two features — the South Polar Feature and the South Polar Wave — that
 * turned out to be extraordinarily stable over two decades where everything else on the
 * planet shears apart within days, and got 15.9663 h; the IAU adopted it in 2015, which
 * is why Horizons labels Neptune's cartographic system "System II, optically observed
 * features" while Jupiter's, Saturn's and Uranus's are all System III.
 *
 * Verified end to end rather than transcribed. Fed Horizons' own Earth-Neptune vectors,
 * this rate and the fixed pole above reproduce Horizons' sub-Earth longitude to a mean
 * of 0.006° with 0.037° of spread over 2000-2030 — which is also, incidentally, the
 * tightest check any body in this project passes.
 */
export const NEPTUNE_ROTATION_DEG_PER_DAY = 541.1397757;
/** 15h 57m 59s. */
export const NEPTUNE_SIDEREAL_DAY = (360 / NEPTUNE_ROTATION_DEG_PER_DAY) * 86400;
export const NEPTUNE_ORBITAL_PERIOD_DAYS = 60189;
/**
 * Geometric albedo, used the same way Uranus's is: this map is generated, so the number
 * has to be supplied rather than carried by imagery. 0.41 → 0.615 diffuse.
 *
 * Neptune is genuinely darker than Uranus (0.51), and the two are worth stating together
 * because it is the one place their famous colour difference shows up as a measurement.
 * Neptune's haze layer is thinner, so more light goes down into the methane and does not
 * come back — which makes it both bluer and dimmer at once.
 */
export const NEPTUNE_GEOMETRIC_ALBEDO = 0.41;

// --- Pluto -----------------------------------------------------------------
//
// Not a planet since 24 August 2006, and the reason is worth stating precisely because
// it is usually got wrong: Pluto meets two of the IAU's three tests — it orbits the Sun,
// and it is massive enough that gravity has pulled it round — and fails the third, which
// is that it has not cleared its own orbital neighbourhood. It shares that neighbourhood
// with the whole Kuiper belt, and with a moon half its own diameter.
//
// **Charon is not modelled**, and one consequence is worth writing down rather than
// leaving to be discovered. Standish's elements — like Horizons' body 9 against its body
// 999 — describe the Pluto *system barycentre*, not Pluto, because a pair of comparable
// mass has no single position. That barycentre lies 2,126 km from Pluto's centre, which
// is outside the body: 1.79 Pluto radii, and the only such pair in the solar system. With
// Charon absent, Pluto is drawn at the barycentre, so its position carries an error of up
// to that 2,126 km — 0.34 scene units against a radius of 0.187.
//
// That is unobservable here and not a fudge: there is nothing left in the scene to
// measure it against, and Pluto sits exactly on the orbit line drawn from the same
// function. It would stop being unobservable the moment Charon came back.

/**
 * 1188.3 ± 1.6 km, measured by New Horizons on 14 July 2015 and not properly known
 * before that — the pre-flyby figures ranged over 100 km because Pluto's atmosphere
 * refracts starlight during an occultation and nobody could say where the solid edge was.
 *
 * There is **no flattening constant below**, and that is a fact rather than an omission:
 * Pluto turns once every 6.4 days, far too slowly for rotation to raise a bulge, and New
 * Horizons found it spherical to within its own measurement error. The four giants are
 * all drawn squashed; this one is drawn round.
 */
export const PLUTO_RADIUS_KM = 1188.3;
/** ~0.187 units — two thirds of the Moon, and smaller than seven of the moons here. */
export const PLUTO_RADIUS = PLUTO_RADIUS_KM / EARTH_RADIUS_KM;
/**
 * IAU rotational elements (WGCCRE 2015). The declination is a long way south, which is
 * what puts Pluto over on its side.
 *
 * The obliquity is stated nowhere, exactly as Uranus's is not: it is the angle between
 * this pole and the orbit normal `PLUTO_ELEMENTS` implies, and measured out of the model
 * it comes to **119.50°** against the published 119.591° — a gap of 0.087°, which is the
 * constant precession offset the whole scene carries and not a discrepancy. Past 90°, so
 * Pluto rotates backwards relative to its own orbit while this rate stays positive. That
 * is the same one sign that makes Venus and Uranus retrograde and nothing branches on it.
 *
 * (Some fact sheets print 122.53° for this. 119.591° is the figure that follows from the
 * IAU pole above, which is the pole this scene is built on.)
 */
export const PLUTO_POLE_RA_DEG = 132.993;
export const PLUTO_POLE_DEC_DEG = -6.163;
export const PLUTO_PRIME_MERIDIAN_DEG = 302.695;
/**
 * 6.387230 days — and this is a rotation rate that was set by something else.
 *
 * Pluto and Charon are **mutually** tidally locked: each keeps one face permanently
 * toward the other, so Charon hangs motionless in Pluto's sky and half of Pluto never
 * sees it at all. Every other locked pair in this project has the small body stopped by
 * the large one while the large one spins freely; this is the only pair in the solar
 * system where a body of planetary size has been stopped by its own moon.
 *
 * Charon is not drawn here, but this number is still its fingerprint. Charon's measured
 * orbital period is 6.3872304 days and the rate above gives 6.3872230 — two quantities
 * from unrelated measurements, differing by 0.64 seconds, one part in 863,000.
 */
export const PLUTO_ROTATION_DEG_PER_DAY = 56.3625225;
/** 6 d 9 h 17 m. */
export const PLUTO_SIDEREAL_DAY = (360 / PLUTO_ROTATION_DEG_PER_DAY) * 86400;
/** 247.9 years. Discovered 1930; it has not yet been round once since. */
export const PLUTO_ORBITAL_PERIOD_DAYS = 90553;
/**
 * Geometric albedo 0.52, and it is an average over a surface that runs 0.10 to 0.86 —
 * the widest range of any body in the solar system. Sputnik Planitia is fresh nitrogen
 * ice and nearly as bright as snow; Cthulhu Macula, on the equator beside it, is tholin
 * sludge as dark as a fresh asphalt road. Supplied rather than carried by a map for the
 * reason Uranus's and Neptune's are — see `pluto/pluto.ts`.
 */
export const PLUTO_GEOMETRIC_ALBEDO = 0.52;


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
/** Earth's gravitational parameter, km³/s². Every ISS figure below falls out of it. */
export const EARTH_MU_KM3_S2 = 398600.4418;
export const ISS_ORBITAL_RADIUS_KM = EARTH_RADIUS_KM + ISS_ALTITUDE_KM;
/**
 * √(µ/r) — 7.668 km/s, against the 7.66 usually quoted. Derived rather than
 * transcribed, and the period below with it, so the number in the read-out and the rate
 * the station is actually flown round its orbit at cannot drift apart.
 */
export const ISS_ORBITAL_SPEED_KM_S = Math.sqrt(EARTH_MU_KM3_S2 / ISS_ORBITAL_RADIUS_KM);
/** 2π√(r³/µ) — 5,554 s, i.e. 92.6 min against the real 92.68 and 15.55 orbits a day. */
export const ISS_ORBITAL_PERIOD_S =
    2 * Math.PI * Math.sqrt(ISS_ORBITAL_RADIUS_KM ** 3 / EARTH_MU_KM3_S2);
/**
 * The one orbital element that cannot be recovered from a single position fix, and the
 * one that never changes: 51.64° was chosen in the 1990s so that Baikonur, at 45.6°N,
 * could reach the station at all. It is why the ground track never crosses a latitude
 * higher than this, and why the orbit plane is fully determined by the inclination plus
 * wherever the station happens to be — see `orbitNormal()` in `iss.ts`.
 */
export const ISS_INCLINATION_DEG = 51.64;
/** Truss tip to truss tip, metres — the longest dimension of the real station. */
export const ISS_TRUSS_LENGTH_M = 108.5;
/**
 * How wide the station is drawn, in scene units.
 *
 * The one deliberate lie in the model, and it is a large one: 109 m at true scale is
 * 1.7e-5 units, which is a thousandth of a pixel from anywhere you could see Earth from
 * and smaller than the depth buffer can separate. So the station is drawn ~5,000×
 * oversized, at roughly a twelfth of Earth's radius, and *everything inside it* is then
 * built from the real dimensions in metres and scaled by the single factor below. That
 * keeps every proportion honest even though the overall size is not — which is the same
 * bargain `body-marker.ts` makes for the planets, one step further along.
 */
export const ISS_MODEL_SPAN = 0.085;
export const ISS_MODEL_SCALE = ISS_MODEL_SPAN / ISS_TRUSS_LENGTH_M;

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
