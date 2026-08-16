/**
 * Small flat icons for the nav panel's object list, replacing the old astronomical
 * symbols (☿ ♀ ♂ …) with something that actually reads as the body it names. Kept to
 * the same flat-shape language as `public/favicon.svg` — a lit gradient sphere plus a
 * couple of surface blobs — rather than the real equirectangular textures: those are
 * mapped for a sphere, so cropping one into a 20px circle shows a flat, off-centre
 * smear of the map, not a planet. A drawn sphere is legible at icon size; a scaled
 * texture isn't.
 */

interface PlanetIconProps {
  id: string;
}

const SIZE = 20;
const CENTER = SIZE / 2;
const RADIUS = 8.4;

export function PlanetIcon({ id }: PlanetIconProps) {
  const gradientId = `planet-icon-shade-${id}`;

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} aria-hidden="true">
      <defs>
        {/* One shared "lit sphere" shading gradient, reused by every body: a bright
            highlight offset toward the upper-left, falling off to a dark limb. Colour
            comes entirely from each body's own base fill and surface details below,
            so the gradient stays a single, unlit-to-lit ramp. */}
        <radialGradient id={gradientId} cx="35%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="35%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.45" />
        </radialGradient>
      </defs>
      <PlanetBody id={id} />
      <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={`url(#${gradientId})`} />
    </svg>
  );
}

function PlanetBody({ id }: PlanetIconProps) {
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
    case 'system':
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="#7c86c9" strokeWidth="1.1" opacity="0.7" />
          <circle cx={CENTER} cy={CENTER} r={RADIUS - 3.4} fill="none" stroke="#7c86c9" strokeWidth="1" opacity="0.45" />
          <circle cx={CENTER} cy={CENTER} r="2.1" fill="#ffce7a" />
        </>
      );
    default:
      return <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#9aa4c7" />;
  }
}
