import { app, MODEL, OLLAMA_HOST } from '../api/index.js';

/**
 * The local development server.
 *
 * All the handling lives in `api/index.ts`, which exports the Express app without binding
 * a port — because the deployed copy never binds one. A Vercel function is *handed* a
 * request rather than listening for one, so `app.listen()` there either does nothing or
 * holds the function open.
 *
 * The import points the "wrong" way round for a reason: see the note at the top of
 * `api/index.ts`. This file only ever runs under tsx, which resolves the `.js` specifier
 * back to the `.ts` source; Vercel's per-file transpile of `api/**` would not, which is
 * why nothing under `api/` may import across directories.
 */
const PORT = Number(process.env.PORT) || 3003;

app.listen(PORT, () => {
    console.log(`Chat backend listening on http://localhost:${PORT}`);
    console.log(`  model: ${MODEL}  via ${OLLAMA_HOST}`);
});
