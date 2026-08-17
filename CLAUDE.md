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

`initScene()` is the imperative core of the app — plain Three.js (not react-three-fiber). React (`App.tsx`) only mounts a container div and calls `initScene()` once on mount; all rendering, animation loop, camera control, and interaction (click/hover raycasting, keyboard shortcuts `0`–`9` to focus Earth-reset/Earth/Moon/ISS/Mars/Phobos/Deimos/Analemma/Venus/Mercury, `J` for Jupiter, `F`/`Esc` for free flight, `L` to land on the Moon) live outside React state. The digit row is full, and free flight owns `W`/`A`/`S`/`D`/`Q`/`E`, which rules out the obvious mnemonics for three of the four Galilean moons — so those are reachable from the nav panel and by clicking them, not from the keyboard. Don't add a Shift+digit scheme for them: `event.key` for a shifted digit is keyboard-layout dependent. `NavPanel` (`src/nav-panel/nav-panel.tsx`) is a separate React component whose buttons work via DOM `data-target` attributes and `getElementById` lookups that `script.ts` queries directly — it is *not* wired through React props/state or callbacks into `script.ts`. When adding new focusable objects or nav actions, follow this existing DOM-bridge pattern rather than introducing new state plumbing between the two.

Scene objects are each defined in their own module and imported into `script.ts` as pre-built Three.js objects (not factories):
- `src/planets/earth/earth.ts` — Earth mesh. `MeshStandardMaterial` with day/height/land-mask maps, plus an `onBeforeCompile` patch that adds night-side city lights (the night texture is added to `totalEmissiveRadiance` masked by the surface's angle to the sun, since a plain `emissiveMap` would also glow through the daylit face). Exports `earthSunDirectionView`, which the render loop must keep updated in **view** space.
- `src/planets/earth/clouds.ts`, `src/planets/earth/atmosphere.ts` — separate shells at radius 1.006 / 1.035. The atmosphere is a `BackSide` additive Fresnel shell, scaled by sun alignment so it only glows on the lit limb.
- `src/planets/earth/moon.ts` — Moon mesh. Orbital motion is computed per-frame in `script.ts`, not inside this module. Lit by the same sun, so it runs through real phases. `moonTidalRotation(orbitalAngle)` returns the spin that keeps the near side facing Earth — the mesh must be rotated every frame or it holds a fixed world orientation and slowly turns its far side toward us. It is also the one body you can *land on* — see "Standing on the Moon" below, and note that the surface mode deliberately renders none of this mesh.
- `src/craters.ts` — the bowl-and-rim profile of an impact crater, shared by the Martian moons and the lunar surface patch. Deliberately **scale-free**: it uses only distance/radius, so the same curve draws Stickney across a quarter of Phobos in radians and a 12-metre bowl beside a lander in metres. Craters are close enough to self-similar over that range to make the reuse honest rather than convenient.
- `src/planets/earth/analemma.ts` — the figure-8 the Sun traces over a year at a fixed observer and clock time, built once at module load from the same ephemeris as everything else here (no separate equation-of-time formula — it falls out of the real Sun position the same way the seasons do). The one trick worth knowing before touching it: the curve and its ground marker are parented directly to the `earth` **mesh**, not to `earthTilt`, specifically so the scene graph's existing per-frame spin carries a shape built in `earth`'s own *unrotated* local frame into world space for free. That only works because altitude/azimuth are horizon-relative, frame-agnostic quantities — reconstructing them via a *local* north/east/up basis and letting the graph rotate the result lands in exactly the same place as computing a fresh basis in world space every frame, without the per-frame cost. Verified against real equation-of-time figures: altitude range 21.56°–68.44° at 45°N (real: 21.6°/68.4°), azimuth swing peaking near Feb 17/Oct 27 (real extrema: Feb 11/Nov 3, ~3.5–4°).
- `src/planets/mars/mars.ts`, `src/planets/mars/atmosphere.ts` — Mars mesh (Viking colour + MOLA relief) and its much thinner limb haze. Deliberately carries *no* albedo correction, unlike the Moon: see the comment there, the arithmetic is not the obvious one.
- `src/planets/mercury/mercury.ts` — Mercury mesh (MESSENGER colour + DEM). The only planet here with **no atmosphere shell**, which is deliberate: at under 5×10⁻¹⁵ bar there is nothing to scatter light, so its limb ends hard like the Moon's — don't "fix" it by adding a glow. Its albedo is derived by comparison against the Moon rather than in the abstract, since both wear brightness-normalised mosaics; the comment there explains why the answer is to tint it *up*.
- `src/planets/jupiter/jupiter.ts` — the only body here that is **not drawn as a sphere**, and the only colour map that is a *snapshot rather than a survey*. Jupiter's oblateness is 0.0649 — a ten-hour day on a body with no solid surface to resist it — so the mesh is scaled on its polar axis; 6.5% is visible in a backyard telescope and skipping it makes Jupiter read as a beach ball. It carries no height map (what looks like relief is cloud tops, five parts in ten thousand of the radius) and no atmosphere shell (its limb *darkens*, it does not glow). Don't tint it for albedo: unlike the Moon's and Mercury's brightness-normalised mosaics, this is ordinary visible-light imagery that already carries its 0.538.
- `src/planets/jupiter/moons.ts` — Io, Europa, Ganymede and Callisto: the exact inverse of the Martian moons. Those are generated because there is nothing to wrap a map onto; these are worlds (Ganymede is wider than Mercury) with real Voyager/Galileo mosaics, so they go back to sphere-plus-texture. They share `satelliteState` with Phobos and Deimos unchanged, which is not a coincidence worth glossing over — all six are tidally locked, and the IAU puts a synchronous satellite's prime meridian at its sub-planetary point, so "longitude 0 faces the planet" is at once the texture convention `geo.ts` uses and the physical state. Their albedos span 0.22 to 0.67, the widest range of any family here, and Europa's ×1.5 conversion runs *past* 1.0 — the Lambert model genuinely runs out of room for the most reflective large surface in the solar system. The tints hold the true ratios instead; see the table there.
- `src/planets/venus/venus.ts`, `clouds.ts`, `atmosphere.ts` — the one body here made of **two** visible shells rather than a surface with a veil over it. `venus.ts` is the ground Magellan mapped through the clouds by radar, so its map is *backscatter, not colour* — it ships greyscale and the hue comes from a material tint taken from the Venera landers. `clouds.ts` is what Venus actually looks like: an opaque, generated deck that hides the surface completely (no `transparent`, no `depthWrite: false` — it is a solid surface to the renderer). It is generated because in visible light there is nothing to map; the famous dark markings are ultraviolet. The deck is toggleable from the nav panel, which is the only way to see the surface at all. Its albedo runs through the same geometric→hemispherical conversion as the Martian moons, at the opposite extreme — 0.975, which looks wrong and isn't.
- `src/noise.ts` — seeded value noise / fBm sampled from a **3D direction** rather than uv, which is what keeps it seam-free at the 180° meridian and unpinched at the poles. Shared by the Martian moons' relief and Venus's cloud deck.
- `src/planets/mars/moons.ts` — Phobos and Deimos, the only bodies here that are **generated rather than textured**. They are not spheres, so there is nothing to wrap an equirectangular map onto; the measured triaxial radii are scaled into the mesh and the relief on top is fractal noise plus a synthetic crater population (with Stickney placed at its real coordinates). Deimos runs the same generator shallower, because its craters really are buried in regolith. Both are lit through their real geometric albedo of 0.068, converted to a diffuse reflectance — the two are not the same quantity, and using the quoted figure directly makes them a third too dark.
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
├── mercurySystem           innermost; no shells at all
│   └── mercuryAxis         fixed IAU pole, all but upright
│       └── mercury         3 turns per 2 orbits, and nothing enforces it
├── venusSystem             same shape, one orbit in
│   ├── venusAxis           fixed IAU pole orientation; never touched
│   │   ├── venus           spins *backwards* inside it
│   │   └── venusClouds     and 60× faster — the deck laps the planet every 4 days
│   └── venusAtmosphere
├── earthSystem             moves along the orbit
│   ├── earthTilt           fixed −23.44° about X; never touched again
│   │   ├── earth           spins inside the tilt
│   │   ├── clouds
│   │   └── iss
│   ├── atmosphere
│   └── moonOrbitPlane      5.14° to the ecliptic, not to the equator
│       └── moon
├── marsSystem              same shape, one orbit out
│   ├── marsAxis            fixed IAU pole orientation; likewise never touched
│   │   ├── mars            spins inside it
│   │   ├── phobos          Mars's *equatorial* plane, not the ecliptic
│   │   └── deimos
│   └── marsAtmosphere
└── jupiterSystem           5.2 AU out — further than everything above combined
    └── jupiterAxis         fixed IAU pole, leaning only 3.1°
        ├── jupiter         870.5°/day, the fastest spin here, on the largest disc
        ├── io              all four in Jupiter's *equatorial* plane, and locked
        ├── europa            4:2:1 without anything in the source saying so
        ├── ganymede
        └── callisto
```

Venus is the proof that the shape generalises: it is the strangest rotator in the
solar system — retrograde, 243 days, axis 177° over — and *none* of that is
special-cased. The pole goes into `venusAxis` like Mars's, the spin rate that goes
inside it happens to be negative, and everything else follows. `venusClouds` hangs off
the **axis** rather than off `venus` because it does not travel with the planet; it
gets its own rotation against the same fixed pole.

Mercury is the same argument from the other end — the simplest body here, and the one
that shows the model is producing physics rather than reproducing it. Its 3:2
spin-orbit resonance is nowhere in the source: the IAU rotation rate and the Standish
mean longitude come from unrelated tables, and three rotations land on 175.938 days
against two orbits' 175.939. The 176-day solar day, the 0.03° obliquity and the
574″/century perihelion precession (including the 43″ that needed general relativity
to explain) all fall out the same way.

Jupiter makes the same argument a third time and adds the payoff. It is 450 times
Mercury's volume and carries four moons, and the graph does not grow to accommodate any
of it — a system node, an axis node, children inside. The **Laplace resonance** is
nowhere in the source: Io, Europa and Ganymede are locked 4:2:1, and the three mean
motions were fitted from three separate ephemeris files with no knowledge of each other,
coming to `n_Io − 3·n_Europa + 2·n_Ganymede = −1.0×10⁻⁶ °/day`, five parts in a billion
of Io's own mean motion. Io's and Europa's apsidal rates land on −0.7395070 and
−0.7395126 °/day from independent fits. The 0.0649 oblateness, the 3.12° obliquity and
the 9h 55m day all fall out the same way.

Note where the two Martian moons hang, and that it is not where the Moon hangs. The Moon is far enough out that the Sun rules it, so its orbit stays near the ecliptic and `moonOrbitPlane` tilts to *that*. Phobos and Deimos are deep in Mars's gravity well, where the equatorial bulge rules instead and forces them into the plane of the equator — so they go under `marsAxis` and inherit its fixed lean. Their planes also precess (2.3 years for Phobos), fast enough that it cannot be baked into a pivot, so `satelliteState()` applies the node rotation per frame instead. The four Galileans go under `jupiterAxis` for exactly the same reason, and they show the transition: Io's and Europa's Laplace planes sit within 0.04° of Jupiter's equator, while Callisto — four times further out — has its plane dragged 0.29° toward Jupiter's orbit by the Sun, which accounts for most of the inclination usually quoted for it.

`defineSatellite()` takes the host planet's inverted axis quaternion, so it serves both systems; there is no Mars-specific satellite path any more.

The tilt living *above* the spin, and never being updated, is the whole mechanism: the axis stays pointing at a fixed direction in space while the planet goes round, so the seasons fall out of the geometry. Verified — Earth's solstice declination of ±23.44° is not imposed anywhere, it emerges and matches the almanac formula to 0.004°; likewise Mars's 25.19° obliquity emerges from its pole direction alone. **Add new planets by copying this shape**, not by rotating a system node per frame.

`src/orbits.ts` owns the maths. World layout is: ecliptic = XZ plane, +Y = ecliptic north, longitudes via `eclipticDirection()` which uses the same negative-z handedness as `geo.ts` so the two compose without a sign fix. `earthSpinAngle()` solves for the spin that puts the subsolar point under the Sun given the tilt — read the comment there before touching it.

Two traps when adding a body to `orbits.ts`, both already hit:

- **Frames.** Earth's position comes from an almanac series, which is referred to the *equinox of date*; orbital elements are referred to *J2000*. Mixing them silently is a 0.37° error today, growing forever. `marsOrbitPosition()` ends with a `precessionSinceJ2000()` rotation for exactly this reason — any new body built from elements needs the same.
- **Axes.** Textbook coordinates are z-up; this scene is y-up. `eclipticToScene()` / `equatorialToScene()` do the conversion; don't hand-roll the sign juggling.
- **Eccentricity is not optional, even when it sounds small.** Phobos's 0.0151 looks like a rounding error and is in fact the largest term after the orbit plane: dropping it left Phobos 2.3° and 371 km out of position, three times everything else combined. Carrying it costs one call to the `eccentricAnomaly()` solver that is already in the file.

Every body's elements were fitted to JPL's own ephemeris and then run back against Horizons over 2000–2030; the residuals are recorded in the comments beside each one. Do the same for anything new rather than trusting a table transcription — the published node angles in particular are measured from a different reference direction than this scene uses.

Two known systematic residuals apply to every body built this way, and are documented at the head of the Mars/Venus section in `orbits.ts`. Neither is worth fixing (both are far under a pixel), but **don't chase them as bugs**: `earthOrbitPosition` puts Earth on a perfect 1 AU circle, which tilts the direction *to* Earth by up to a degree at Venus's range; and positions are precessed onto the equinox of date while the axis quaternions stay on J2000, which leaves a constant 0.373° longitude offset on every body's prime meridian.

That second one is also the thing most likely to make a verification script lie to you. `keplerianPosition` returns positions on the **equinox of date**; Horizons' `REF_PLANE='ECLIPTIC'` output is **J2000**. Comparing the two directly charges the model a 0.373° rotation it applies deliberately — which is larger than every real residual in the file, and will read as a catastrophic regression on a body that is in fact fine. Drop the precession term when checking against Horizons.

Jupiter is the one body whose heliocentric residual is genuinely worse than its neighbours': 0.044° RMS against the inner planets' 0.006°. That is the **Jupiter–Saturn great inequality** — a ~0.33°, 883-year term that Standish's single 1800–2050 Keplerian fit necessarily averages out. Carrying JPL's own correction terms for it was tried and improves RMS while making the worst case worse, so it is not carried. Don't treat the gap as a transcription error.

`src/geo.ts` is still the single source of truth for latitude/longitude: **`(cos·cos, sin(lat), −cos·sin(lon))`**, derived from three.js's `SphereGeometry` UV layout. Note the negative z.

Sunlight is geometric rather than constructed: each planet's direction is simply `normalize(-planetWorldPosition)`. It feeds consumers in **different spaces** — `atmosphereSunDirection` and `marsAtmosphereSunDirection` (world) and `earthSunDirectionView` (view space, via `.transformDirection(camera.matrixWorldInverse)`, because the Earth shader compares it against a view-space normal).

`sunLight` is a **`PointLight` at the origin, not a directional light**. A directional light has one direction for the entire scene, which was fine while Earth and the Moon shared a spot in the sky but lights a second planet from a direction up to 180° wrong. Its intensity is scaled by the square of an AU so the 1/d² falloff reproduces the old Earth lighting exactly — meaning **the intensity constant is not in ordinary units**, and outer planets get correctly dimmer for free. Do not "fix" a dim distant planet by raising it.

The fix for a dim distant planet is `updateExposure()` in `script.ts`, which is a different thing in the right place: the light keeps falling off as 1/d², and what adapts is the **exposure the scene is developed at**, as d² of the nearest body's distance from the Sun, clamped below at 1 and eased over ~0.7 s. That is what an observer would do — sunlight at Jupiter is about 4,700 lux, an overcast afternoon on Earth, which any adapted eye reads as perfectly bright — and it is the same argument the lunar surface module already makes, where the sunlight constant is openly an f-stop and only the albedo under it is measured. Rendering Jupiter as a near-black disc was the artefact, from developing the whole solar system at Earth's one exposure.

Two things this depends on, both easy to undo by accident:
- **It is measured at `nearestBody`, not at the camera.** In the system view the camera is 7.6 AU out while the frame is full of the inner system; exposing for the camera's own distance would wash that out.
- **The backdrop must stay out of tone mapping.** The star layers and the galaxy dome in `background.ts` carry `toneMapped: false` for the same reason they carry `sizeAttenuation: false` — they are at effectively infinite distance and neither their size nor their brightness should track where you are. Without it, Jupiter's 27× lift turns the Milky Way into a white sheet. The markers, orbit lines and the Sun's corona were already exempt for their own reasons, so in practice **only lit geometry moves**, which is the only thing that should.

Surface mode sets the exposure back to 1 itself, because it returns early before `updateExposure` and would otherwise inherit whatever the solar system left behind.

`src/simulation.ts` is the clock: starts at the real current date, advances by real elapsed time × a multiplier, and pause stops it (which halts spin *and* orbits).

### Scale, and why bodies have markers

**Everything is at true scale** — body sizes, the Earth–Moon distance, and the orbits (`EARTH_ORBIT_RADIUS` = a real AU, 23,481 units; Mars ranges over 1.38–1.67 of those, Jupiter over 4.95–5.45). Nothing is fudged, which is what makes apparent sizes come out right for free: from Earth the Sun subtends 0.5329° and the Moon 0.5179° (real: 0.533° / 0.518°), a ratio of 1.03 — the near-coincidence that makes total solar eclipses just barely possible.

The cost is that Earth is 1 unit against a 23,481-unit orbit, so it falls far below a pixel whenever the orbit is in frame — and even the Sun is only ~3px there, ~5px from Earth. `src/body-marker.ts` handles this the way Celestia and NASA's Eyes do: a small additive dot that fades in only once the body itself drops below a few pixels, so the geometry stays honest. **Do not "fix" invisible bodies by scaling the meshes up.**

The huge far plane (400,000) costs nothing: depth resolution goes as `z²/(near · 2²⁴)` and so is set by the *near* plane, not the far one.

Three traps at this scale, all already hit once:
- **Label offsets must be in screen pixels, not world units.** A world-space offset shrinks with distance, so labels collapsed onto their bodies and their opaque backgrounds hid the very thing they labelled. `createLabel()` anchors a zero-size div and offsets the visible chip with CSS.
- **Marker/glow textures need flat-topped gradients.** Drawn at ~10px, a gradient that starts falling off at the centre leaves a solid core barely 2px wide and reads as a smudge.
- **A moon's marker has to fade out as well as in.** Markers hold a fixed pixel size at any distance, so once a moon's whole orbit is narrower than that, its dot and its planet's land on the same pixels — and they blend additively, so the pair reads as one body that is brighter and fatter than it should be. Phobos and Deimos make it obvious: their orbits are 1.5 and 3.7 units wide against the 23,481 it takes to frame Mars's own. Pass `orbitRadius` to `createBodyMarker()` for anything that orbits something else.

Adding Jupiter moved two camera constants, and they are load-bearing rather than taste. `SYSTEM_VIEW_DISTANCE` went from 2.6 AU to 7.6 (a 75° vertical field sees 0.77 AU per AU, and Jupiter's aphelion is 5.45), and `controls.maxDistance` from 4 AU to 12, which previously stopped the user short of ever seeing Jupiter's orbit whole. The result is the honest picture and a startling one: everything the scene contained before fits inside a third of the radius of the one orbit added.

Because bodies move, the camera **follows**: `focusOnObject()` stores the target object plus an offset and re-derives its endpoint every frame (a snapshot would miss, since the body moves during the fly-to), and `followTarget` then translates the camera by the body's per-frame delta so the user's orbit angle survives. Anything comparing positions must use `getWorldPosition()` — `.position` is now a local coordinate for everything under `earthSystem`. The star dome is pinned to the camera each frame, otherwise travelling 1500 units along the orbit flies you out of your own starfield.

### The two camera modes

`OrbitControls` (guided) and `src/free-flight.ts` (fly it yourself) are **mutually exclusive**, and `setFreeFlight()` in `script.ts` is the only thing that switches between them. They cannot both be live: `OrbitControls.update()` ends by aiming the camera at its pivot, so it is disabled *and* its `update()` is skipped while flying, or it would overwrite the direction free flight just set. Coming back, the pivot is re-parked straight ahead of the camera so the handover is invisible — which is also why free flight has no roll, since `lookAt` assumes the world up vector.

`updateNearestBody()` answers "what am I nearest, and by how much" once per frame, and three separate things depend on it:

- **Flight speed** is proportional to the clearance to the nearest surface. At true scale there is no workable fixed speed — inspecting the ISS wants ~0.01 units/s and reaching Mars wants ~1000 — so making it scale-invariant is the only thing that works. **Don't replace this with a constant.** The one constant it does have, `MIN_CLEARANCE`, is the floor that keeps you moving when parked on a surface, and it therefore also sets the slowest you can ever go: it has to stay well under the smallest body in the scene. It is derived from `DEIMOS_RADIUS` for that reason. Adding a body smaller than Deimos means revisiting it — at the old flat value the floor alone carried you clean across a moon in about a second.
- **The near plane** is derived from it too, in `updateNearPlane()`. A fixed 0.1 clipped everything within 640 km, so you could never actually reach a surface; but depth resolution goes as `z²/(near · 2²⁴)`, so a permanently tiny near plane would wreck the depth buffer at solar-system range. Only the nearest thing matters, so scaling it is what satisfies both.
- **The reference frame** you fly in. Free flight sets `followTarget` to the nearest body, so parking beside a planet inherits its motion instead of watching it leave at 30 km/s (much more at high time multipliers).

Free flight must also use **real** elapsed time, not the simulated clock — it has to keep working while the simulation is paused, and must not speed up because the user picked a larger time multiplier.

### Standing on the Moon (`src/planets/earth/moon-surface/`)

The third mode, and the only one that is not a camera. It **replaces** the solar-system render rather than adding to it — `script.ts`'s loop runs the ephemeris, then returns early before the markers, the labels, the orbit camera and `renderer.render(scene, camera)`. That is why it costs *less* than the view it interrupts, not more.

**Why it cannot be done by flying the existing camera down.** An astronaut's eye is 1.7 m up, which is 2.7 × 10⁻⁷ scene units, and the horizon from there is √(2Rh) = 2,430 m. Against that: one texel of `moon_color.jpg` is 2,665 m, one texel of the height map is 7,580 m, and one facet of the 128-segment sphere is 85 km. **The entire visible world from down there is a single flat triangle inside a single texel.** No camera position fixes that. So the mode builds its own scene, in **metres**, and takes the line `moons.ts` takes with Phobos: real measurements where they exist, generated below their resolution.

- `terrain.ts` — the ground. A **polar grid** (160 rings × 320 spokes, geometrically spaced from 0.35 m to 6 km) so triangles hold a roughly constant *screen* size at every distance; 102,080 of them do what tens of millions of uniform ones would. Each vertex is dropped by the sphere's sagitta `r²/2R`, so **the horizon is not a setting** — it emerges at 2,430 m because it cannot be anywhere else (Earth's, from the same height, is 4,654 m). Craters get a distance-scaled minimum size, which makes the field scale-free the same way the grid is and its total *logarithmic* rather than quadratic in the patch radius: ~700 craters cover 3 km where a uniform field would need three million. A radial sweep keeps the O(vertices × craters) build to a few tens of milliseconds. Sub-grid relief is a generated tileable normal map, not geometry.
- `site-samples.ts` — reads the two lunar maps as **data**, through a canvas, for the one thing they can still say at this scale: which kind of ground this is. Mare basalt is albedo 0.07, Tycho's ejecta nearly 0.25, and getting that wrong makes every site the same grey field. The mosaic is brightness-normalised, so samples are read as a *ratio* against the map's own mean — the same correction `moon.ts` applies globally with its `0x8a8a8a` tint.
- `sky.ts` — a **separate scene with its own camera**, rendered first, then `clearDepth()`, then the ground on top. One depth buffer cannot hold a 0.1 m near plane and a 400 km star dome; drawing the ground second also gets the occlusion right for free. Earth hangs at a fixed point set purely by the site's coordinates (overhead at 0°,0°, on the horizon at 90° of longitude, never up at all on the far side) because the Moon is tidally locked — none of which is imposed, it falls out of expressing the real Moon→Earth direction in the observer's horizon frame, built the way `analemma.ts` builds its basis. Earth runs the **opposite phase** to the Moon's, from one light and one sphere. The main scene's starfield is *borrowed* (reparented and scaled) rather than duplicated.
- `walk.ts` / `drive.ts` — the two ways to get about. Both run on **real** elapsed seconds, for the same reason free flight does.
- `rover.ts` — the LRV, built from primitives like `iss.ts` builds the station, merged to one buffer per material. Every dimension is the flown one (3.05 m long, 1.83 m track, 2.286 m wheelbase, 1.14 m tall, 36 cm of ground clearance on 81 cm wheels), which is what makes it read: it is nearly as wide as it is long and barely taller than its own tyres. Four details carry the recognisability and are worth their geometry — the **see-through woven-wire wheels** with the 65 cm titanium bump-stop frame visible through them, the **chevron treads over half the contact area** (half, so the mesh between could still sink into the regolith), the **open tube frame with the double-wishbone suspension exposed**, and the **high-gain dish**, which tracks Earth as the crews did by hand at every stop and thereby also keeps a metre of parabola out of the driver's face.
- `dust.ts` — the grains a boot or a wheel throws up. See below; it is the one place where the physics and the optimisation turn out to be the same argument.
- `artefacts.ts` — what was left behind, and **only at the two sites where anyone has been**. Tranquility Base and Hadley get a descent stage, a flag and an experiments package; Copernicus, Tycho, Shackleton and Moscoviense get nothing, because nobody has been to any of them. That asymmetry is the feature, not an omission — `createArtefacts` returns `null` for a site with no `artefacts` record and builds nothing at all.
- `tracks.ts` — the ground's memory: bootprints and LRV ruts, accumulated into one world-anchored render target that the surface shader samples. A first attempt at this lived here as alpha-blended decals and was pulled — a flat quad lying on generated terrain z-fights it, and a separately-lit decal reads as a sticker. The fix was to stop putting a second surface on top and make the print a **property of the same fragment**, so it is lit by the same light through the same photometric function. Three things worth knowing before touching it: prints are dark mainly because compaction *destroys the porosity that produces the opposition surge*, not because of shadow, which is why they show at zero phase where nothing casts one; the field is blended with `MaxEquation` so a rut is idempotent rather than accumulating one frame's worth per frame; and the relief is deliberately spread over two texels rather than one, because a 6.25 cm texel cannot hold a real 2 cm-wide print wall and preserving its 45° slope over three times its true width turns every print into a black trench.

Things worth knowing before touching it:

- **Sunlight intensity is an exposure, not a measurement.** The albedo under it is real (0.12 geometric → 0.18 diffuse); the light level is the f-stop. `EARTHSHINE_INTENSITY` is the one number deliberately off scale, and its comment says by how much (twenty stops, recovered as dark adaptation).
- **The opposition surge is not decoration.** Hapke's shadow-hiding term in an `onBeforeCompile` patch, using the same view-space-sun-direction trick `earth.ts` uses. The washed-out halo around the observer's own shadow is most of why Apollo photographs look the way they do, and plain Lambert shading reads as a video game without it.
- **...and away from opposition the ground is not Lambertian either.** The same patch carries the **lunar-Lambert** function — McEwen's phase-weighted mix of Lommel-Seeliger and Lambert, the one every published lunar mosaic (including the LROC one `site-samples.ts` reads) was photometrically normalised with. It needs no albedo recalibration, because at normal incidence and emission it is exactly 1, which is the geometry a normal albedo is *defined* at. Two things not to undo: the effective cosines are floored at `sin 20°` because Hapke's macroscopic-roughness term is otherwise missing and μ → 0 over nearly the whole frame (a ground plane from 1.7 m is past 89° of emission by 100 m), which collapses the model to *uniform brightness regardless of the Sun*; and `SUNLIGHT_INTENSITY` was divided by 1.4 to pay for the rest, measured over twelve first-person views. The patch had to move from `<color_fragment>` to just before `<lights_physical_fragment>`, because that is the first point in three.js's chain where the shading normal exists and `diffuseColor` has not yet been consumed.
- **The track field is sampled behind a branch, and that branch is the whole of its cost.** Measured on SwiftShader, the photometry above is free and the track fetches were the entire regression — 116 ms/frame to 166. Two things brought it back: the ground runs to a 2,430 m horizon while the field is 128 m across, so most of the frame is ground that can have nothing on it and skips every fetch; and the relief taps are dropped past 30 m, where a 2 cm bowl subtends two thirds of a pixel. Compaction is deliberately *not* dropped with the relief — it is an area average and stays meaningful at any distance, which is why a trail still reads to the horizon after its relief has mipped away. Stamping itself costs nothing measurable, and nothing at all while standing still.
- **Both controllers and the terrain share one `heightAt`.** A foot and a wheel have to land on exactly the surface the eye sees, and two implementations of that would drift apart the first time either was touched. The LRV's attitude is four samples of it, one per wheel.
- **The regional slope has to be tapered.** Two degrees of slope beats the sphere's curvature out to 150 km, so carried to the patch rim it lifts the edge 400 m into the sky and leaves a hard line with nothing above it.
- **The Apollo details are load-bearing, not decoration.** Only the *descent stage* is still there — the ascent stage is what left. **Apollo 11's flag is lying flat**, knocked over by the ascent engine on liftoff; it is the only one of the six that fell, and Aldrin watched it go. All six have been bleached near-white by fifty years of unfiltered UV, so the canvas-drawn flag is rendered heavily faded rather than in fresh red and blue.
- **Sampled albedo needs a ceiling.** It comes out of a *ratio* against the mosaic's mean, and a ratio has no upper bound while the Moon does — roughly 0.06 to 0.24 geometric across the whole surface. Uncapped, Tycho samples at a reflectance no lunar material has, and every slope facing a low Sun clips to white. Four multiplicative brightenings stack there (albedo × N·L × opposition surge × fresh-ejecta tint), so the cap is what keeps the brightest site from reading as snow.
- **The CSS2D labels must be hidden, not just left unrendered.** They are a DOM overlay; skipping `labelRenderer.render()` freezes them on screen — "Earth" hanging in the lunar sky, 384,000 km from what it labels.
- **Never hand a live array to `Float32BufferAttribute`.** Its constructor runs `new Float32Array(array)`, which *copies*. `dust.ts` writes into its buffers every frame, so it uses plain `BufferAttribute`, which keeps the reference. Getting this wrong leaves the emitter writing into detached memory the GPU never sees and the whole system silently renders nothing — no error, no warning, just no dust.

#### Dust, and why it is nearly free (`dust.ts`)

There is no air, so **every grain is a projectile**. Dust kicked up on Earth hangs, because drag decouples it from gravity and turbulence smears it into a cloud; here it leaves the surface on a ballistic arc, follows a clean parabola, and lands — and the whole sheet lands together. That is the striking thing in the Apollo footage: the rooster tails are not plumes, they are sharp arcs of individual grains.

**A parabola is a closed form, so no particle is ever simulated on the CPU.** The vertex shader evaluates `p₀ + v₀t − ½gt²ŷ` for every grain every frame; the CPU's whole job is to write seven floats when a grain is *born* and then leave it alone. No integration loop, no per-frame buffer upload (only the newly written slots are flagged via `addUpdateRange`), no sort, no allocation. A system with air drag has no closed form, would have to be integrated step by step, and would cost exactly what this does not.

Two consequences worth keeping:

- **Lifetime needs no attribute.** A grain is back at its launch height at `t = 2·v_y/g`, and nothing else can end its flight — the velocity already says how long it lives. The CPU's sleep test uses the same expression, so it can never disagree with what is on screen.
- **The size clamp is the load-bearing optimisation, not the particle count.** Particle systems burn laptops on *fill rate*: alpha-blended sprites overdraw with depth writes off, so there is no early-Z. The full 6,000-grain budget at the 11 px cap is about 570k fragments — half a screen. The same budget at 80 px a grain would be 38 million. Measured on SwiftShader (CPU rasterization, far more fill-rate sensitive than any real GPU), driving flat out with full tails runs at 107 ms/frame against 109 ms parked with no dust at all.

Emission is keyed to **distance travelled**, never to a timer — so the spray holds its density whatever the frame rate is doing, and standing still emits nothing and skips the draw call entirely. Grains leave the wheel going up *and forward* (the mesh lets go up the rear of the wheel, where the rim is climbing); the tail only ends up behind the rover because the rover drives out from under it.

#### Drawing only what is looked at

The patch is a disc centred on the observer, so as a **single mesh it can never be frustum-culled** — its bounding sphere always contains the camera, and every triangle is submitted every frame regardless of which way you face. Two structural changes fix that, and between them they buy the budget that pays for the finer grid:

- **The disc is cut into 16 angular wedges**, each with its own bounds. An 85° horizontal field keeps five or six of them; the rest cost nothing. Crucially the wedges **share one vertex buffer** and differ only in their index — split buffers would have `computeVertexNormals` averaging over different triangle sets either side of each boundary, and a lighting crease every 22.5° out to the horizon. Their bounding spheres have to be computed by hand over each wedge's own indices, because the built-in walks the whole shared position attribute and would hand every wedge the bounds of the entire 6 km disc, undoing the split in one line.
- **The ground casts shadows through a decimated proxy** on its own layer (`SHADOW_ONLY_LAYER`, enabled on `sunLight.shadow.camera.layers`). Wedge bounds are kilometres wide and always intersect the shadow frustum, so letting the wedges cast means drawing the whole grid into a depth map covering a fraction of a percent of its area — and no amount of splitting helps, because the shadow region genuinely surrounds you. The map is 1024 texels over the box, so detail finer than one texel cannot be represented in it at all: every fourth ring and every second spoke gives an identical shadow for 8,000 triangles instead of 102,080.
- **The shadow box tracks the Sun, and cannot be one number.** A shadow is its caster's height over `tan(altitude)`, which on the Moon spans four orders of magnitude in a day — 3 m at noon, 170 m at one degree up. `updateShadow()` sizes the box to the near field plus the longest shadow, quantised, which parks it at its 55 m floor for any Sun above about 8° and so more than doubles the texel density where the boulders and the rover actually are. Three things ride on that and are worth keeping together: the frustum is **snapped to whole texels in the light's own basis** (three.js's `lookAt` convention — x = up × z, y = z × x) or every shadow edge crawls as you walk; the near/far planes are fitted to the depth actually in the box rather than spanning the 900 m to the light, so a unit of `shadow.bias` buys four times less peter-panning; and the bias itself is *derived* as `texel / tan(altitude)` rather than dialled in. Below 6° the ground **stops casting entirely** — a texel spans metres of depth there and near-flat ground can only shadow itself in stripes, while boulders, the rover and a descent stage are not remotely parallel to the light and go on casting fine. Shackleton spends its whole existence under that line.

Measured in the running app: 18–28 draw calls and 114k–128k triangles depending on where you look, against ~178k with culling disabled. **Boulders are split into two `InstancedMesh`es by size** for the same reason — a power law means nearly all of them are 20 cm chips a few pixels across, well served by a bare icosahedron's twenty faces, while the handful of metre-plus blocks you actually walk up to get the subdivided one. Subdividing all of them cost four times the whole field, twice over.

### Textures

Live in `public/textures/` (NASA, public domain — see `CREDITS.md` there), referenced by absolute URL like `/textures/earth_day.jpg`. They must stay under `public/` — Vite only copies `public/` into `dist/`, so assets elsewhere in the project root work in dev but silently 404 in a production build. Colour maps need `texture.colorSpace = SRGBColorSpace`; height maps and masks must **not** get it, as they carry data rather than colour.

### Styling

SCSS (`sass-embedded`), one file per component co-located with its `.tsx` (e.g. `src/nav-panel/nav-panel.scss`), plus a global `src/styles.scss`.
