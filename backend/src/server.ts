import { app, MODEL, OLLAMA_HOST } from './app.js';

/**
 * The local development server.
 *
 * All the actual handling lives in `app.ts`, which exports the Express app without
 * binding a port — because the deployed copy never binds one. A Vercel function is
 * *handed* a request rather than listening for one, so `app.listen()` there either does
 * nothing or holds the function open; keeping it in this file, which only `npm run dev`
 * ever loads, is what lets the same app serve both.
 */
const PORT = Number(process.env.PORT) || 3003;

app.listen(PORT, () => {
    console.log(`Chat backend listening on http://localhost:${PORT}`);
    console.log(`  model: ${MODEL}  via ${OLLAMA_HOST}`);
});
