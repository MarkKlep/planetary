# Brand marks

Logo marks for the Planetary LinkedIn organisation page. Compare them at real
display sizes in `marks.html` (also published as an Artifact).

| File | Notes |
| --- | --- |
| `planetary-logo-orbit.svg` | **Recommended.** The direct evolution of `public/favicon.svg`. |
| `planetary-logo-ringed.svg` | Alternate — the clearest read at feed size, but drops the amber. |
| `planetary-logo-system.svg` | Alternate — the truest description of the app, but mushes below ~56 px. |
| `*-1000.png`, `*-400.png` | Rendered from the SVG. Upload the 1000 px one; LinkedIn wants ≥ 300 × 300. |
| `marks.html` | The comparison page. Self-contained; the SVGs are inlined. |

## Why these shapes

Every mark is built from the same facts the scene is:

- The star is **limb-darkened from the centre out**, never shaded from one side —
  the correction `src/nav-panel/planet-icons.tsx` makes for the Sun and
  Betelgeuse, since a dark edge is a terminator and that is the one thing a star
  cannot have.
- Each body carries a **terminator lit from the star's actual direction**, with
  the elliptical boundary a point light really casts on a sphere.
- The orbit **ramps dim-to-bright into the body on it**, the way
  `src/iss-trajectory.ts` draws an orbit — the only thing that says which way
  round it is being flown.
- Colours are `--signal` (#ff8a3d), `--void` (#08080a) and `--ink` from
  `src/variables.scss`, unchanged.

## Regenerating

The SVG is the source — edit it directly. To re-render the PNGs, any SVG
rasteriser will do; these were rendered through the repo's own Playwright
install at 400 and 1000 px on a `#08080a` ground.

The dark ground is part of the mark rather than a placeholder, so there is no
transparent variant.
