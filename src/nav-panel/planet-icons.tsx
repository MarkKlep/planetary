/**
 * Small flat icons for the nav panel's object list, replacing the old astronomical
 * symbols (☿ ♀ ♂ …) and bare text rows with something that actually reads as the body
 * it names. Kept to the same flat-shape language as `public/favicon.svg` — a lit
 * gradient sphere plus a couple of surface blobs — rather than the real equirectangular
 * textures: those are mapped for a sphere, so cropping one into a 20px circle shows a
 * flat, off-centre smear of the map, not a planet. A drawn sphere is legible at icon
 * size; a scaled texture isn't.
 *
 * Not every body here is a sphere. Phobos and Deimos are irregular rubble piles (see
 * `mars/moons.ts` — they're generated, not textured, for the same reason), the ISS is
 * built from primitives, and the analemma isn't a body at all but the figure-8 the Sun
 * traces. Those four skip the lit-sphere shading overlay below rather than wearing a
 * circular vignette that implies a roundness none of them has.
 */

interface BodyIconProps {
  id: string;
}

const SIZE = 20;
const CENTER = SIZE / 2;
const RADIUS = 8.4;

// Only bodies actually rendered as a sphere in the scene get the lit-sphere shading
// overlay — applying it to the ISS, the analemma curve, or Phobos/Deimos's lumpy
// outlines would paint a circular highlight that doesn't track their actual shape.
// Saturn is the one deliberate omission from an otherwise round body: the shading
// overlay is a circle, and here the disc is only part of the icon — a circular
// highlight painted over the rings as well would read as a smear across them. Its
// globe carries its own drawn shading below instead.
const SPHERE_IDS = new Set([
    'sun', 'mercury', 'venus', 'earth', 'mars', 'moon', 'system',
    'jupiter', 'io', 'europa', 'ganymede', 'callisto',
    'mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan', 'iapetus',
    'uranus',
]);

export function BodyIcon({ id }: BodyIconProps) {
  const gradientId = `body-icon-shade-${id}`;
  const shaded = SPHERE_IDS.has(id);

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} aria-hidden="true">
      {shaded && (
        <defs>
          {/* One shared "lit sphere" shading gradient, reused by every round body: a
              bright highlight offset toward the upper-left, falling off to a dark
              limb. Colour comes entirely from each body's own base fill and surface
              details below, so the gradient stays a single, unlit-to-lit ramp. */}
          <radialGradient id={gradientId} cx="35%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="35%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.45" />
          </radialGradient>
        </defs>
      )}
      <BodyShape id={id} />
      {shaded && <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={`url(#${gradientId})`} />}
    </svg>
  );
}

function BodyShape({ id }: BodyIconProps) {
  switch (id) {
    case 'sun':
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS + 2.6} fill="#ff9d3f" opacity="0.22" />
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#ffb443" />
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#ffde8a" opacity="0.4" />
        </>
      );
    case 'mercury':
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#9c958c" />
          <circle cx={7.2} cy={7.6} r={2.1} fill="#767068" opacity="0.75" />
          <circle cx={12.8} cy={11.6} r={1.5} fill="#767068" opacity="0.6" />
          <circle cx={9.6} cy={13.4} r="0.9" fill="#c7c1b7" opacity="0.5" />
        </>
      );
    case 'venus':
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#e3c98a" />
          <path
            d="M 3.2 8.6 Q 7.5 5.6 12.6 7.6 Q 16.4 9.1 16.8 12.4"
            fill="none"
            stroke="#c7a55e"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.6"
          />
          <path
            d="M 4 13.4 Q 8.4 12.4 13.4 14.2"
            fill="none"
            stroke="#f2e2b3"
            strokeWidth="1.3"
            strokeLinecap="round"
            opacity="0.55"
          />
        </>
      );
    case 'earth':
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#2e6fd6" />
          <path
            d="M 4 6.4 Q 6.6 4.6 9.4 6 Q 10.6 7 9.2 8.4 Q 7.2 8.8 6.4 10.4 Q 4.6 9.6 4 6.4 Z"
            fill="#4f9c4f"
          />
          <path
            d="M 12.2 11.4 Q 15.4 11 16.6 13.4 Q 15.2 15.6 12.4 15.2 Q 11 13.4 12.2 11.4 Z"
            fill="#4f9c4f"
          />
          <path
            d="M 8.6 12.8 Q 11.2 12 12.6 14.4"
            fill="none"
            stroke="#f4f8ff"
            strokeWidth="1.4"
            strokeLinecap="round"
            opacity="0.55"
          />
        </>
      );
    case 'mars':
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#bd5a34" />
          <path
            d="M 5.4 12.2 Q 8.4 10.4 11.6 12 Q 13.4 13.2 12 14.8 Q 8.6 15.6 6 14 Q 5 13.2 5.4 12.2 Z"
            fill="#8f3e21"
            opacity="0.85"
          />
          <circle cx={11.2} cy={5.6} r={2.1} fill="#f2e9de" opacity="0.85" />
        </>
      );
    case 'moon':
      // Lighter and flatter than Mercury: the maria read as broad soft-edged patches
      // rather than sharp craters, since from this distance that's the one thing that
      // tells the two grey bodies apart.
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#d3d3d6" />
          <path
            d="M 5.6 6.8 Q 8.4 5.4 10.4 7.2 Q 11.2 8.6 9.4 9.6 Q 6.6 9.8 5.2 8.4 Q 4.8 7.4 5.6 6.8 Z"
            fill="#9a9ba3"
            opacity="0.7"
          />
          <path
            d="M 9.8 11.6 Q 13 10.8 14.6 12.8 Q 14.4 15 11.8 15 Q 9.4 14 9.8 11.6 Z"
            fill="#9a9ba3"
            opacity="0.65"
          />
        </>
      );
    case 'iss':
      // Built from primitives the same way `iss.ts` builds the real model: a central
      // module with a truss line and two solar-panel wings, not a sphere.
      return (
        <>
          <rect x="1.2" y="9.1" width="5.6" height="2.4" rx="0.4" fill="#3a68b0" />
          <line x1="2" y1="9.6" x2="2" y2="11" stroke="#1f3f75" strokeWidth="0.5" />
          <line x1="3.4" y1="9.6" x2="3.4" y2="11" stroke="#1f3f75" strokeWidth="0.5" />
          <line x1="4.8" y1="9.6" x2="4.8" y2="11" stroke="#1f3f75" strokeWidth="0.5" />
          <line x1="6.2" y1="9.6" x2="6.2" y2="11" stroke="#1f3f75" strokeWidth="0.5" />
          <rect x="13.2" y="9.1" width="5.6" height="2.4" rx="0.4" fill="#3a68b0" />
          <line x1="14" y1="9.6" x2="14" y2="11" stroke="#1f3f75" strokeWidth="0.5" />
          <line x1="15.4" y1="9.6" x2="15.4" y2="11" stroke="#1f3f75" strokeWidth="0.5" />
          <line x1="16.8" y1="9.6" x2="16.8" y2="11" stroke="#1f3f75" strokeWidth="0.5" />
          <line x1="18.2" y1="9.6" x2="18.2" y2="11" stroke="#1f3f75" strokeWidth="0.5" />
          <rect x="6.4" y="9.9" width="7.2" height="0.7" fill="#cbd3e0" />
          <rect x="8.2" y="7.6" width="3.6" height="4.8" rx="1" fill="#e4e8f2" />
          <rect x="8.9" y="8.4" width="2.2" height="1" rx="0.3" fill="#aeb8cc" />
        </>
      );
    case 'analemma':
      // The figure-8 the Sun traces over a year at a fixed clock time (see
      // `analemma.ts`) — a lemniscate stroke with a bright dot marking the Sun's
      // position at one extreme, rather than a body at all.
      return (
        <>
          <path
            d="M 10 4.2 C 7.3 4.2 7.3 9 10 10 C 12.7 11 12.7 15.8 10 15.8 C 7.3 15.8 7.3 11 10 10 C 12.7 9 12.7 4.2 10 4.2 Z"
            fill="none"
            stroke="#e8b25c"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <circle cx="10" cy="4.2" r="1.3" fill="#ffd98a" />
        </>
      );
    case 'phobos':
      // Irregular, not spherical — the measured triaxial lump `mars/moons.ts`
      // generates, with Stickney as the one crater big enough to read at this size.
      return (
        <>
          <path
            d="M 5.4 8.2 Q 6.6 4.6 10.4 4.8 Q 14.4 5.2 15 8.8 Q 15.4 12.2 12.2 14.4 Q 8.6 15.8 6 13 Q 4.4 10.6 5.4 8.2 Z"
            fill="#8c8578"
          />
          <circle cx="11.6" cy="10.2" r="2.3" fill="#66604f" opacity="0.75" />
          <circle cx="7.4" cy="7.6" r="0.9" fill="#6d6656" opacity="0.6" />
        </>
      );
    case 'deimos':
      // Same generator, run shallower — Deimos's craters are buried in regolith, so
      // the outline is smoother and there's no single dominant feature like Stickney.
      return (
        <path
          d="M 6.4 7.8 Q 8 5.2 11.2 5.6 Q 14.2 6.4 14.4 9.6 Q 14.2 12.8 11 14.2 Q 7.8 14.8 6.2 12 Q 5.2 9.8 6.4 7.8 Z"
          fill="#a49d8c"
        />
      );
    case 'jupiter':
      // Banded rather than blotched, which is the one thing that has to read at this
      // size: alternating light zones and dark belts, plus the Great Red Spot.
      return (
        <>
          {/* The bands are drawn as full-width strips and clipped back to the disc —
              far steadier at 20px than trying to fit each one to the curve by hand. */}
          <defs>
            <clipPath id="planet-icon-jupiter-disc">
              <circle cx={CENTER} cy={CENTER} r={RADIUS} />
            </clipPath>
          </defs>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#e0c9a6" />
          <g clipPath="url(#planet-icon-jupiter-disc)">
            <rect x="1.6" y="5.6" width="16.8" height="1.7" fill="#c49a68" opacity="0.85" />
            <rect x="1.6" y="8.6" width="16.8" height="2.1" fill="#b98a58" opacity="0.85" />
            <rect x="1.6" y="12.2" width="16.8" height="1.6" fill="#c49a68" opacity="0.8" />
            <rect x="1.6" y="15.0" width="16.8" height="1.2" fill="#bd9064" opacity="0.7" />
            <ellipse cx={12.6} cy={11.9} rx={2.0} ry={1.15} fill="#c0532f" opacity="0.9" />
          </g>
        </>
      );
    case 'io':
      // Sulphur yellow with dark volcanic paterae — the only body here with no craters.
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#e8d271" />
          <circle cx={7.4} cy={8.2} r={1.5} fill="#8d6a2a" opacity="0.8" />
          <circle cx={12.6} cy={12.4} r={1.2} fill="#7d5c22" opacity="0.75" />
          <circle cx={12.0} cy={6.6} r="0.9" fill="#c94f2a" opacity="0.65" />
          <circle cx={6.6} cy={13.0} r="0.8" fill="#8d6a2a" opacity="0.6" />
        </>
      );
    case 'europa':
      // Near-white ice, crossed by the linea. The cracks are the whole identity.
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#f0e6d8" />
          <path d="M 2.6 7.4 Q 9 9.2 17.4 7.0" stroke="#b98a72" strokeWidth="0.85" fill="none" opacity="0.75" />
          <path d="M 2.4 11.6 Q 10 9.6 17.6 12.4" stroke="#b98a72" strokeWidth="0.75" fill="none" opacity="0.7" />
          <path d="M 6.0 3.2 Q 8.2 10 5.6 16.6" stroke="#c49a80" strokeWidth="0.7" fill="none" opacity="0.6" />
        </>
      );
    case 'ganymede':
      // Two terrains, which is the thing to show: dark ancient plates and bright
      // grooved bands. Largest moon in the solar system, and wider than Mercury.
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#b3a898" />
          <path
            d="M 3.0 6.0 Q 6.6 4.0 9.6 6.2 Q 10.4 8.4 8.0 9.8 Q 4.6 10.0 3.0 8.0 Z"
            fill="#7d7263" opacity="0.85"
          />
          <path
            d="M 11.4 11.0 Q 15.2 10.4 16.8 13.0 Q 15.6 15.6 12.4 15.2 Q 10.6 13.2 11.4 11.0 Z"
            fill="#7d7263" opacity="0.8"
          />
          <path d="M 4.4 12.6 Q 8.0 11.6 10.2 13.8" stroke="#ddd5c6" strokeWidth="0.9" fill="none" opacity="0.8" />
        </>
      );
    case 'callisto':
      // The darkest of the four, saturated with craters, and Valhalla's bullseye.
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#6e6153" />
          <circle cx={8.2} cy={9.0} r={3.1} fill="none" stroke="#a89a86" strokeWidth="0.5" opacity="0.7" />
          <circle cx={8.2} cy={9.0} r={1.7} fill="none" stroke="#a89a86" strokeWidth="0.5" opacity="0.8" />
          <circle cx={8.2} cy={9.0} r="0.8" fill="#c4b8a4" opacity="0.85" />
          <circle cx={13.4} cy={13.2} r="0.9" fill="#a89a86" opacity="0.7" />
          <circle cx={5.4} cy={14.0} r="0.7" fill="#a89a86" opacity="0.6" />
          <circle cx={14.0} cy={6.4} r="0.6" fill="#a89a86" opacity="0.6" />
        </>
      );
    case 'saturn':
      // The only icon here that is not mostly a disc. The rings *are* the recognition —
      // a banded ball at 20px is Jupiter — so the globe is drawn small enough to leave
      // room for them, with the ellipse crossing in front below the equator and behind
      // above it. That crossing is the whole trick: an ellipse drawn wholly in front
      // reads as a hoop leaning on a ball, and one drawn wholly behind reads as a halo.
      return (
        <>
          <defs>
            {/* Clips the front half of the ring to the lower part of the frame, so the
                upper half can be drawn first and be occluded by the globe. */}
            <clipPath id="planet-icon-saturn-front">
              <rect x="0" y="10" width="20" height="10" />
            </clipPath>
            <radialGradient id="planet-icon-saturn-shade" cx="35%" cy="32%" r="75%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
              <stop offset="35%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.45" />
            </radialGradient>
          </defs>
          {/* Back half of the ring, then the globe over it, then the front half. */}
          <ellipse
            cx={CENTER} cy={CENTER} rx="9.3" ry="2.9"
            fill="none" stroke="#d9c69a" strokeWidth="1.5" opacity="0.9"
            transform="rotate(-14 10 10)"
          />
          <circle cx={CENTER} cy={CENTER} r="5.9" fill="#e5cd9f" />
          <rect x="4.1" y="8.4" width="11.8" height="1.3" fill="#cdae78" opacity="0.75" />
          <rect x="4.1" y="11.0" width="11.8" height="1.0" fill="#d4b783" opacity="0.6" />
          <circle cx={CENTER} cy={CENTER} r="5.9" fill="url(#planet-icon-saturn-shade)" />
          <g clipPath="url(#planet-icon-saturn-front)">
            <ellipse
              cx={CENTER} cy={CENTER} rx="9.3" ry="2.9"
              fill="none" stroke="#e8d5a8" strokeWidth="1.5"
              transform="rotate(-14 10 10)"
            />
          </g>
        </>
      );
    case 'uranus':
      // The hardest one here to draw, because the honest answer is "a plain disc" —
      // Voyager 2 flew past at 81,500 km and came back with a featureless ball, and
      // `uranus/uranus.ts` generates the map rather than pretending otherwise. So the
      // icon does what the planet does: colour first, and almost nothing else.
      //
      // The one structural thing it can say is the tilt, which is the whole story of
      // Uranus. The bands are zonal like Jupiter's, but the axis is 97.77° over, so at
      // most of the orbit they wrap the pole facing you rather than crossing the disc —
      // concentric rather than horizontal. Drawn near-vertical, which is what they look
      // like partway between solstice and equinox, and the brighter polar cap sits at
      // the end of them, where Hubble has been watching the northern one thicken since
      // the mid-2000s. Deliberately faint: the real contrast is a couple of percent.
      return (
        <>
          <defs>
            <clipPath id="planet-icon-uranus-disc">
              <circle cx={CENTER} cy={CENTER} r={RADIUS} />
            </clipPath>
          </defs>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#a6d8de" />
          <g clipPath="url(#planet-icon-uranus-disc)">
            <ellipse cx={6.2} cy={CENTER} rx="2.6" ry="9" fill="#c3e6ea" opacity="0.55" />
            <ellipse cx={11.4} cy={CENTER} rx="1.7" ry="9" fill="#8dc6d0" opacity="0.4" />
            <ellipse cx={14.6} cy={CENTER} rx="1.3" ry="9" fill="#c3e6ea" opacity="0.35" />
          </g>
        </>
      );
    case 'mimas':
      // One crater across a third of the disc. Nothing else is needed — Herschel *is*
      // Mimas at any size.
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#c8c8cb" />
          <circle cx={7.4} cy={8.6} r={2.9} fill="#9d9da3" opacity="0.8" />
          <circle cx={7.4} cy={8.6} r="0.85" fill="#dededf" opacity="0.9" />
          <circle cx={13.2} cy={13.0} r="1.1" fill="#a8a8ae" opacity="0.6" />
        </>
      );
    case 'enceladus':
      // The brightest surface in the solar system, and the four south-polar fractures
      // that keep it that way — drawn at the bottom, where they are.
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#f6f8fa" />
          <path d="M 6.0 14.2 L 9.4 15.8" stroke="#8fb4c9" strokeWidth="0.9" strokeLinecap="round" opacity="0.85" />
          <path d="M 8.4 13.2 L 12.2 15.2" stroke="#8fb4c9" strokeWidth="0.9" strokeLinecap="round" opacity="0.85" />
          <path d="M 11.0 12.6 L 14.4 13.8" stroke="#8fb4c9" strokeWidth="0.8" strokeLinecap="round" opacity="0.75" />
          <path d="M 4.6 12.2 Q 8.0 11.4 11.0 12.0" stroke="#c3d6e2" strokeWidth="0.7" fill="none" opacity="0.7" />
        </>
      );
    case 'tethys':
      // Odysseus, a basin 42% of the moon's own diameter, plus Ithaca Chasma running
      // away from it.
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#dcdcde" />
          <circle cx={8.0} cy={8.2} r={3.4} fill="none" stroke="#a9a9b0" strokeWidth="0.9" opacity="0.85" />
          <circle cx={8.0} cy={8.2} r="0.9" fill="#b6b6bc" opacity="0.8" />
          <path d="M 13.0 4.6 Q 13.8 10 12.4 15.6" stroke="#adadb4" strokeWidth="1.0" fill="none" opacity="0.75" />
        </>
      );
    case 'dione':
      // The wispy terrain: bright ice cliffs on the trailing hemisphere, which Voyager
      // could only resolve as streaks.
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#cfcfd2" />
          <path d="M 12.0 3.6 Q 13.4 9.4 11.4 15.8" stroke="#f4f4f8" strokeWidth="1.0" fill="none" opacity="0.9" />
          <path d="M 14.6 5.6 Q 15.6 10.2 14.0 14.4" stroke="#f4f4f8" strokeWidth="0.8" fill="none" opacity="0.8" />
          <circle cx={6.4} cy={8.4} r={1.7} fill="#a5a5ac" opacity="0.7" />
          <circle cx={8.2} cy={13.0} r="1.0" fill="#a5a5ac" opacity="0.6" />
        </>
      );
    case 'rhea':
      // Heavily cratered ice, with Inktomi's bright rays on the leading side.
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#d6d6d9" />
          <circle cx={12.4} cy={11.8} r={1.5} fill="#f6f6fa" opacity="0.9" />
          <path d="M 12.4 11.8 L 15.8 14.2 M 12.4 11.8 L 15.2 8.6 M 12.4 11.8 L 9.0 14.6"
                stroke="#f0f0f4" strokeWidth="0.6" strokeLinecap="round" opacity="0.7" />
          <circle cx={6.6} cy={7.4} r={2.0} fill="#aaaab1" opacity="0.7" />
          <circle cx={9.0} cy={12.0} r="1.1" fill="#aaaab1" opacity="0.55" />
        </>
      );
    case 'titan':
      // A blank orange ball, which is the honest icon: this is what Titan looks like,
      // and the only structure visible-light imaging shows is the polar hood.
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#d99b4a" />
          <path d="M 2.6 6.6 Q 10 4.6 17.4 6.6 Q 10 8.0 2.6 6.6 Z" fill="#c8873a" opacity="0.55" />
          <path d="M 3.4 13.6 Q 10 15.4 16.6 13.6 Q 10 12.4 3.4 13.6 Z" fill="#b9762f" opacity="0.5" />
        </>
      );
    case 'iapetus':
      // Split down the middle, because that is the entire point: coal on one side,
      // snow on the other, with the boundary you can actually see.
      return (
        <>
          <defs>
            <clipPath id="planet-icon-iapetus-disc">
              <circle cx={CENTER} cy={CENTER} r={RADIUS} />
            </clipPath>
          </defs>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#ececed" />
          <g clipPath="url(#planet-icon-iapetus-disc)">
            <path d="M 1.6 1.6 H 10 Q 13.4 10 10 18.4 H 1.6 Z" fill="#4a3a2c" />
          </g>
          {/* The equatorial ridge, 13 km high and on no other body anywhere. */}
          <path d="M 2.2 10 Q 6 9.2 10 10" stroke="#7a6450" strokeWidth="0.8" fill="none" opacity="0.9" />
        </>
      );
    case 'system':
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="#7c86c9" strokeWidth="1.1" opacity="0.7" />
          <circle cx={CENTER} cy={CENTER} r={RADIUS - 3.4} fill="none" stroke="#7c86c9" strokeWidth="1" opacity="0.45" />
          <circle cx={CENTER} cy={CENTER} r="2.1" fill="#ffce7a" />
        </>
      );
    case 'orbits':
      return (
        <g transform="rotate(-25 10 10)">
          <ellipse
            cx={CENTER}
            cy={CENTER}
            rx="8.2"
            ry="4.2"
            fill="none"
            stroke="#8996ff"
            strokeWidth="1.1"
            opacity="0.75"
          />
          <ellipse
            cx={CENTER}
            cy={CENTER}
            rx="5.2"
            ry="2.7"
            fill="none"
            stroke="#ffd9a0"
            strokeWidth="0.9"
            opacity="0.55"
          />
          <circle cx={CENTER} cy={CENTER} r="1.6" fill="#ffb443" />
          <circle cx={CENTER + 8.2} cy={CENTER} r="1.1" fill="#9fc4ff" />
          <circle cx={CENTER - 5.2} cy={CENTER} r="0.9" fill="#ff9c6b" />
        </g>
      );
    default:
      return <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#9aa4c7" />;
  }
}
