# Repository Guidelines

## Project Structure & Module Organization

The root app is a Vite, React, and Three.js solar-system visualization. Its entry flow is `index.html` → `src/main.tsx` → `src/App.tsx`; imperative scene setup and animation live in `src/script.ts`. Keep celestial-body modules under `src/planets/<body>/`, shared scene utilities in `src/`, and constants in `src/constants/planets.const.ts`. Component SCSS is co-located with its `.tsx` file; global styles are in `src/styles.scss`.

`public/textures/` contains production texture assets and credits. The separate heatmap micro-frontends live in `external/heatmap-client/` (Create React App) and `external/heatmap-server/` (Express); each has independent dependencies and lockfiles.

## Build, Test, and Development Commands

- `npm run dev:planetary` starts the main app at port 5173.
- `npm run dev:mf:full` starts the main app, heatmap client (3001), and API (3002) for end-to-end work.
- `npm run setup:heatmap` and `npm run setup:heatmap:server` install dependencies for the respective subprojects.
- `npm run build` builds both Vite entry points; use `npm run preview` to inspect the output.
- `npx tsc --noEmit` checks root TypeScript. The root `npm test` is intentionally a failing placeholder.

## Coding Style & Naming Conventions

Use TypeScript for new root code, semicolons, and the indentation/import style of the file you edit. Export React components in PascalCase (`NavPanel`); component files currently use lowercase names such as `nav-panel.tsx`. Keep SCSS beside its component and utility modules in kebab/lowercase form (`free-flight.ts`). Preserve scene units: one unit is one Earth radius. Add orbital constants centrally rather than scattering numeric literals.

## Testing Guidelines

Run `npm run build` and `npx tsc --noEmit` for root changes. For the heatmap client, run `npm --prefix external/heatmap-client test`; its tests use React Testing Library and follow `*.test.tsx`. Run `npm --prefix external/heatmap-server run build` after server TypeScript changes. Manually verify camera, focus, and animation interactions for scene edits.

## Commit & Pull Request Guidelines

Recent history uses short, imperative messages such as `feat: add Mercury` and `Refactor simulation and celestial mechanics`. Follow `type: concise summary` when practical; keep commits focused. PRs should state the user-visible change, list validation commands, link relevant issues, and include screenshots or a short recording for visual/UI changes. Do not commit generated `dist/` output or large uncredited texture assets.
