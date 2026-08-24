/**
 * The Vercel entry point.
 *
 * Vercel turns every file under `api/` into a function and calls its default export with
 * a Node request/response pair — which is exactly what an Express app is, so the app can
 * be handed over as-is with no adapter. Note there is no `listen()` anywhere below this
 * line: that is `src/server.ts`'s job and it is only ever loaded in development.
 *
 * `vercel.json` rewrites every unmatched path here, so this one function serves the whole
 * API and Express does the routing, the same as it does locally.
 */
export { app as default } from '../src/app.js';
