# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Three.js/React solar-system visualization (Earth, Moon, ISS with live position) plus a separate heatmap sub-app for sea-surface-temperature data. The root project ("planetary") and the heatmap sub-app are wired together as a micro-frontend: the heatmap app is embedded via `<iframe>` in the main app and can also be built as a standalone artifact served under `/heatmap/`.

## Commands

Run from the repo root unless noted.

- `npm run dev:planetary` — Vite dev server for the main 3D scene only (port 5173, strict).
- `npm run dev:heatmap` — heatmap-client (Create React App) dev server on port 3001. Requires `npm run setup:heatmap` once first (installs `external/heatmap-client`'s own deps).
- `npm run dev:heatmap:server` — heatmap API server on port 3002. Requires `npm run setup:heatmap:server` once first.
- `npm run dev:mf` — planetary + heatmap-client together (no API server).
- `npm run dev:mf:full` — all three (planetary + heatmap-client + heatmap API server) concurrently. Use this for full end-to-end heatmap testing.
- `npm run build` — Vite build; builds both `index.html` (main) and `heatmap.html` (iframe host page) as separate entry points (see `vite.config.ts`).
- `npm run preview` — preview the Vite production build.
- No test suite is configured at the root (`npm test` is a stub). `external/heatmap-server/test` has its own `package.json`/`test.js`.

There is no lint or typecheck script defined; `tsc` runs implicitly via Vite during dev/build (`noEmit: true` in `tsconfig.json`, so type errors don't block builds by default — check manually with `npx tsc --noEmit` if needed).

## Architecture

### Two independent apps sharing one repo

1. **Main app** (`src/`, entry `index.html` → `src/main.tsx` → `App.tsx`): the 3D scene.
2. **Heatmap sub-app** (`external/heatmap-client`, `external/heatmap-server`): a *separate* Create React App + Express project, each with its own `package.json`, node_modules, and lockfile. They are not part of the root npm workspace — they're launched as sibling dev servers and proxied/iframed in.
   - `src/HeatmapPage.tsx` (served via `heatmap.html` → `src/heatmap-main.tsx`) is the bridge: it renders an `<iframe>` pointing at `http://localhost:3001` in dev, or `/heatmap/` in production.
   - `external/heatmap-client` fetches image data from `external/heatmap-server`'s `/api/data` endpoint (`external/heatmap-client/src/api/api-client.ts`, default `http://localhost:3002/api/data`).
   - `external/heatmap-server` (`src/api/api-server.ts`) reads a binary SST grid file (`sst.grid`, 36000×17999 cells, gitignored/not checked in) and rasterizes it onto `empty-map.jpg` using `node-canvas`, downsampling to 3600×1800 and applying a color palette (`viridis` | `turbo` | `spectral`, chosen via `?palette=` query param). Results are cached in-memory per palette; `?refresh=1` forces regeneration.

When changing anything heatmap-related, check whether the edit belongs in the root project or in `external/heatmap-client`/`external/heatmap-server` — they build and run independently.

### Main 3D scene (`src/script.ts`)

`initScene()` is the imperative core of the app — plain Three.js (not react-three-fiber). React (`App.tsx`) only mounts a container div and calls `initScene()` once on mount; all rendering, animation loop, camera control, and interaction (click/hover raycasting, keyboard shortcuts `0`/`1`/`2`/`3`/`4` to focus Earth-reset/Earth/Moon/ISS/Mars) live outside React state. `NavPanel` (`src/nav-panel/nav-panel.tsx`) is a separate React component whose buttons work via DOM `data-target` attributes and `getElementById` lookups that `script.ts` queries directly — it is *not* wired through React props/state or callbacks into `script.ts`. When adding new focusable objects or nav actions, follow this existing DOM-bridge pattern rather than introducing new state plumbing between the two.

Scene objects are each defined in their own module and imported into `script.ts` as pre-built Three.js objects (not factories):
- `src/planets/earth/earth.ts` — Earth mesh. `MeshStandardMaterial` with day/height/land-mask maps, plus an `onBeforeCompile` patch that adds night-side city lights (the night texture is added to `totalEmissiveRadiance` masked by the surface's angle to the sun, since a plain `emissiveMap` would also glow through the daylit face). Exports `earthSunDirectionView`, which the render loop must keep updated in **view** space.
- `src/planets/earth/clouds.ts`, `src/planets/earth/atmosphere.ts` — separate shells at radius 1.006 / 1.035. The atmosphere is a `BackSide` additive Fresnel shell, scaled by sun alignment so it only glows on the lit limb.
- `src/planets/earth/moon.ts` — Moon mesh. Orbital motion is computed per-frame in `script.ts`, not inside this module. Lit by the same sun, so it runs through real phases. `moonTidalRotation(orbitalAngle)` returns the spin that keeps the near side facing Earth — the mesh must be rotated every frame or it holds a fixed world orientation and slowly turns its far side toward us.
- `src/planets/mars/mars.ts`, `src/planets/mars/atmosphere.ts` — Mars mesh (Viking colour + MOLA relief) and its much thinner limb haze. Deliberately carries *no* albedo correction, unlike the Moon: see the comment there, the arithmetic is not the obvious one.
- `src/iss.ts` — ISS model (built from primitives) plus `updateISSPosition()`, which polls `http://api.open-notify.org/iss-now.json` on an interval (`ISS_UPDATE_INTERVAL`) and converts lat/lon to a 3D position accounting for Earth's current rotation. Position updates are interpolated (lerp) between fetches in the animation loop rather than snapping.
- `src/background/background.ts` — procedural starfield (`Points`).
- `src/constants/planets.const.ts` — single source of truth for orbital/rotation constants, all derived from real-world values (sidereal day, km radii/distances) then scaled relative to Earth's radius = 1 unit. Add new celestial-body constants here rather than inlining magic numbers.

Units: 1 scene unit = 1 Earth radius. Distances/sizes for new objects should be computed from real km values divided by `EARTH_RADIUS_KM`, matching the existing constants.

### The orbital model (important, easy to get wrong)

The Sun is at the world origin and the planets orbit it. **Nothing accumulates per-frame angles** — every body's transform is a pure function of the simulated date, which is what keeps the spin, the orbits and the seasons in step at any time multiplier, and makes it frame-rate independent.

Scene graph, built in `initScene()`:

```
scene
├── sun                     (origin)
├── earthSystem             moves along the orbit
│   ├── earthTilt           fixed −23.44° about X; never touched again
│   │   ├── earth           spins inside the tilt
│   │   ├── clouds
│   │   └── iss
│   ├── atmosphere
│   └── moonOrbitPlane      5.14° to the ecliptic, not to the equator
│       └── moon
└── marsSystem              same shape, one orbit out
    ├── marsAxis            fixed IAU pole orientation; likewise never touched
    │   └── mars            spins inside it
    └── marsAtmosphere
```

The tilt living *above* the spin, and never being updated, is the whole mechanism: the axis stays pointing at a fixed direction in space while the planet goes round, so the seasons fall out of the geometry. Verified — Earth's solstice declination of ±23.44° is not imposed anywhere, it emerges and matches the almanac formula to 0.004°; likewise Mars's 25.19° obliquity emerges from its pole direction alone. **Add new planets by copying this shape**, not by rotating a system node per frame.

`src/orbits.ts` owns the maths. World layout is: ecliptic = XZ plane, +Y = ecliptic north, longitudes via `eclipticDirection()` which uses the same negative-z handedness as `geo.ts` so the two compose without a sign fix. `earthSpinAngle()` solves for the spin that puts the subsolar point under the Sun given the tilt — read the comment there before touching it.

Two traps when adding a body to `orbits.ts`, both already hit:

- **Frames.** Earth's position comes from an almanac series, which is referred to the *equinox of date*; orbital elements are referred to *J2000*. Mixing them silently is a 0.37° error today, growing forever. `marsOrbitPosition()` ends with a `precessionSinceJ2000()` rotation for exactly this reason — any new body built from elements needs the same.
- **Axes.** Textbook coordinates are z-up; this scene is y-up. `eclipticToScene()` / `equatorialToScene()` do the conversion; don't hand-roll the sign juggling.

`src/geo.ts` is still the single source of truth for latitude/longitude: **`(cos·cos, sin(lat), −cos·sin(lon))`**, derived from three.js's `SphereGeometry` UV layout. Note the negative z.

Sunlight is geometric rather than constructed: each planet's direction is simply `normalize(-planetWorldPosition)`. It feeds consumers in **different spaces** — `atmosphereSunDirection` and `marsAtmosphereSunDirection` (world) and `earthSunDirectionView` (view space, via `.transformDirection(camera.matrixWorldInverse)`, because the Earth shader compares it against a view-space normal).

`sunLight` is a **`PointLight` at the origin, not a directional light**. A directional light has one direction for the entire scene, which was fine while Earth and the Moon shared a spot in the sky but lights a second planet from a direction up to 180° wrong. Its intensity is scaled by the square of an AU so the 1/d² falloff reproduces the old Earth lighting exactly — meaning **the intensity constant is not in ordinary units**, and outer planets get correctly dimmer for free. Do not "fix" a dim distant planet by raising it.

`src/simulation.ts` is the clock: starts at the real current date, advances by real elapsed time × a multiplier, and pause stops it (which halts spin *and* orbits).

### Scale, and why bodies have markers

**Everything is at true scale** — body sizes, the Earth–Moon distance, and the orbits (`EARTH_ORBIT_RADIUS` = a real AU, 23,481 units; Mars ranges over 1.38–1.67 of those). Nothing is fudged, which is what makes apparent sizes come out right for free: from Earth the Sun subtends 0.5329° and the Moon 0.5179° (real: 0.533° / 0.518°), a ratio of 1.03 — the near-coincidence that makes total solar eclipses just barely possible.

The cost is that Earth is 1 unit against a 23,481-unit orbit, so it falls far below a pixel whenever the orbit is in frame — and even the Sun is only ~3px there, ~5px from Earth. `src/body-marker.ts` handles this the way Celestia and NASA's Eyes do: a small additive dot that fades in only once the body itself drops below a few pixels, so the geometry stays honest. **Do not "fix" invisible bodies by scaling the meshes up.**

The huge far plane (400,000) costs nothing: depth resolution goes as `z²/(near · 2²⁴)` and so is set by the *near* plane, not the far one.

Two traps at this scale, both already hit once:
- **Label offsets must be in screen pixels, not world units.** A world-space offset shrinks with distance, so labels collapsed onto their bodies and their opaque backgrounds hid the very thing they labelled. `createLabel()` anchors a zero-size div and offsets the visible chip with CSS.
- **Marker/glow textures need flat-topped gradients.** Drawn at ~10px, a gradient that starts falling off at the centre leaves a solid core barely 2px wide and reads as a smudge.

Because bodies move, the camera **follows**: `focusOnObject()` stores the target object plus an offset and re-derives its endpoint every frame (a snapshot would miss, since the body moves during the fly-to), and `followTarget` then translates the camera by the body's per-frame delta so the user's orbit angle survives. Anything comparing positions must use `getWorldPosition()` — `.position` is now a local coordinate for everything under `earthSystem`. The star dome is pinned to the camera each frame, otherwise travelling 1500 units along the orbit flies you out of your own starfield.

### Textures

Live in `public/textures/` (NASA, public domain — see `CREDITS.md` there), referenced by absolute URL like `/textures/earth_day.jpg`. They must stay under `public/` — Vite only copies `public/` into `dist/`, so assets elsewhere in the project root work in dev but silently 404 in a production build. Colour maps need `texture.colorSpace = SRGBColorSpace`; height maps and masks must **not** get it, as they carry data rather than colour.

### Styling

SCSS (`sass-embedded`), one file per component co-located with its `.tsx` (e.g. `src/nav-panel/nav-panel.scss`), plus a global `src/styles.scss`.
