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
const SPHERE_IDS = new Set(['sun', 'mercury', 'venus', 'earth', 'mars', 'moon', 'system']);

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
