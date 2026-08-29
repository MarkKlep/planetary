# Repository Guidelines

## Project Structure & Module Organization

The root app is a Vite, React, and Three.js solar-system visualization. Its entry flow is `index.html` → `src/main.tsx` → `src/App.tsx`; imperative scene setup and animation live in `src/script.ts`. Keep celestial-body modules under `src/planets/<body>/`, shared scene utilities in `src/`, and constants in `src/constants/planets.const.ts`. Component SCSS is co-located with its `.tsx` file; global styles are in `src/styles.scss`.

`public/textures/` contains production texture assets and credits. `backend/` is a separate Express service behind the in-app chat widget, with its own dependencies and lockfile; it is not part of the root workspace.

## Build, Test, and Development Commands

- `npm run dev:planetary` starts the main app at port 5173.
- `npm run dev:chat` starts the main app together with the chat backend (3003) for end-to-end work.
- `npm run setup:chat` installs the chat backend's dependencies.
- `npm run build` builds the single Vite entry point; use `npm run preview` to inspect the output.
- `npx tsc --noEmit` checks root TypeScript. The root `npm test` is intentionally a failing placeholder.

## Coding Style & Naming Conventions

Use TypeScript for new root code, semicolons, and the indentation/import style of the file you edit. Export React components in PascalCase (`NavPanel`); component files currently use lowercase names such as `nav-panel.tsx`. Keep SCSS beside its component and utility modules in kebab/lowercase form (`free-flight.ts`). Preserve scene units: one unit is one Earth radius. Add orbital constants centrally rather than scattering numeric literals.

## Testing Guidelines

Run `npm run build` and `npx tsc --noEmit` for root changes. Manually verify camera, focus, and animation interactions for scene edits.

## Commit & Pull Request Guidelines

Recent history uses short, imperative messages such as `feat: add Mercury` and `Refactor simulation and celestial mechanics`. Follow `type: concise summary` when practical; keep commits focused. PRs should state the user-visible change, list validation commands, link relevant issues, and include screenshots or a short recording for visual/UI changes. Do not commit generated `dist/` output or large uncredited texture assets.
