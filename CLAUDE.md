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

`initScene()` is the imperative core of the app — plain Three.js (not react-three-fiber). React (`App.tsx`) only mounts a container div and calls `initScene()` once on mount; all rendering, animation loop, camera control, and interaction (click/hover raycasting, keyboard shortcuts `0`/`1`/`2`/`3` to focus Earth/Earth-reset/Moon/ISS) live outside React state. `NavPanel` (`src/nav-panel/nav-panel.tsx`) is a separate React component whose buttons work via DOM `data-target` attributes and `getElementById` lookups that `script.ts` queries directly — it is *not* wired through React props/state or callbacks into `script.ts`. When adding new focusable objects or nav actions, follow this existing DOM-bridge pattern rather than introducing new state plumbing between the two.

Scene objects are each defined in their own module and imported into `script.ts` as pre-built Three.js objects (not factories):
- `src/planets/earth/earth.ts` — Earth mesh. `MeshStandardMaterial` with day/height/land-mask maps, plus an `onBeforeCompile` patch that adds night-side city lights (the night texture is added to `totalEmissiveRadiance` masked by the surface's angle to the sun, since a plain `emissiveMap` would also glow through the daylit face). Exports `earthSunDirectionView`, which the render loop must keep updated in **view** space.
- `src/planets/earth/clouds.ts`, `src/planets/earth/atmosphere.ts` — separate shells at radius 1.006 / 1.035. The atmosphere is a `BackSide` additive Fresnel shell, scaled by sun alignment so it only glows on the lit limb.
- `src/planets/earth/moon.ts` — Moon mesh. Orbital motion is computed per-frame in `script.ts`, not inside this module. Lit by the same directional sun, so it runs through real phases. `moonTidalRotation(orbitalAngle)` returns the spin that keeps the near side facing Earth — the mesh must be rotated every frame or it holds a fixed world orientation and slowly turns its far side toward us.
- `src/iss.ts` — ISS model (built from primitives) plus `updateISSPosition()`, which polls `http://api.open-notify.org/iss-now.json` on an interval (`ISS_UPDATE_INTERVAL`) and converts lat/lon to a 3D position accounting for Earth's current rotation. Position updates are interpolated (lerp) between fetches in the animation loop rather than snapping.
- `src/background/background.ts` — procedural starfield (`Points`).
- `src/constants/planets.const.ts` — single source of truth for orbital/rotation constants, all derived from real-world values (sidereal day, km radii/distances) then scaled relative to Earth's radius = 1 unit. Add new celestial-body constants here rather than inlining magic numbers.

Units: 1 scene unit = 1 Earth radius. Distances/sizes for new objects should be computed from real km values divided by `EARTH_RADIUS_KM`, matching the existing constants.

### Geographic coordinates and the sun (important, easy to get wrong)

`src/geo.ts` is the single source of truth for placing anything by latitude/longitude. The mapping is derived from three.js `SphereGeometry`'s UV layout and is **`(cos·cos, sin(lat), −cos·sin(lon))`** — note the negative z. Anything positioned geographically must then be carried into the Earth mesh's spinning frame with `toWorldFrame(dir, earth.rotation.y)` (positive angle). Both the ISS and the sun go through this; if you add anything else geographic, use it too rather than re-deriving the trig.

`src/sun.ts` computes the real subsolar point from the current date (low-precision Astronomical Almanac formulae), so the daylight terminator matches actual geography. The render loop calls `updateSunPosition(new Date(), earth.rotation.y)` every frame and then feeds the resulting `sunDirection` to two consumers in different spaces:
- `atmosphereSunDirection` — **world** space
- `earthSunDirectionView` — **view** space (`.transformDirection(camera.matrixWorldInverse)`), because the Earth shader compares it against a view-space normal

The Earth mesh spins ~60× real time (`EARTH_ANGULAR_VELOCITY` is applied per *frame*, not per second). That's fine and self-consistent: because the sun is placed geographically and then rotated by the same `earth.rotation.y`, the terminator stays locked to the correct continents.

### Textures

Live in `public/textures/` (NASA, public domain — see `CREDITS.md` there), referenced by absolute URL like `/textures/earth_day.jpg`. They must stay under `public/` — Vite only copies `public/` into `dist/`, so assets elsewhere in the project root work in dev but silently 404 in a production build. Colour maps need `texture.colorSpace = SRGBColorSpace`; height maps and masks must **not** get it, as they carry data rather than colour.

### Styling

SCSS (`sass-embedded`), one file per component co-located with its `.tsx` (e.g. `src/nav-panel/nav-panel.scss`), plus a global `src/styles.scss`.
