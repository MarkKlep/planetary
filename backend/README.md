# Planetary chat backend

Streams the assistant's replies as NDJSON over `POST /api/chat`, proxying a chat model
served by [Ollama]. The tool calls it emits are executed by the *browser*, not here — the
camera only exists in the tab — so this stays stateless: every turn posts the whole
history back.

## Layout

| File | What it is |
| --- | --- |
| `api/index.ts` | The Express app and all of the handling, exported as the function's default. Never binds a port. |
| `src/server.ts` | Local development only: imports that app and calls `listen()`. |

The split exists because a Vercel function is *handed* a request rather than listening for
one. Keeping `listen()` in a file that only `npm run dev` loads is what lets one app serve
both.

**Nothing under `api/` may import across directories.** Vercel builds `api/**` by
transpiling each file on its own rather than bundling, so a relative specifier has to
survive to runtime exactly as written — and under `"type": "module"` TypeScript wants that
spelled `../src/app.js`, which is a file no build ever emits. The deployment builds
cleanly and then dies on first invocation with `FUNCTION_INVOCATION_FAILED`. That is why
the app lives in `api/index.ts` and the dev server imports *it*, rather than the more
natural arrangement: the dev server only runs under tsx, which resolves the specifier back
to the source.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | **Must be set in any deployment.** See below. |
| `OLLAMA_API_KEY` | *(unset)* | Sent as `Authorization: Bearer …` when present. |
| `OLLAMA_MODEL` | `qwen2.5:7b` | Must be a tool-calling model. |
| `CHAT_ALLOWED_ORIGINS` | *(open)* | Comma-separated origin allowlist for CORS. |
| `PORT` | `3003` | Local server only; Vercel ignores it. |

## Local

```sh
ollama pull qwen2.5:7b
npm install
npm run dev            # or, from the repo root: npm run dev:chat
```

`GET /api/health` reports the host it is pointed at, the model, and whether that model is
actually installed there.

## Deploying to Vercel

Create the project with **Root Directory = `backend`**, then set `OLLAMA_HOST` (and
`OLLAMA_API_KEY` if the host needs one) in the project's environment variables. Nothing
needs building: `vercel.json` rewrites every unmatched path to the one function, and
`public/index.html` is served at `/`.

When something goes wrong, `vercel logs <deployment-url>` names it — a function that
crashes returns only an opaque `FUNCTION_INVOCATION_FAILED` to the browser, and the
runtime log has the actual stack.

### The part that is not a configuration problem

**Vercel does not run Ollama, and it cannot.** A function has no GPU, no model weights and
no persistent process; `127.0.0.1` inside it is the function's own loopback, so the default
host will refuse the connection on every request. The deployment will build and serve
cleanly and then fail the moment anyone types into the chat — which is exactly what
`/api/health` exists to make visible before that happens.

So `OLLAMA_HOST` has to name a machine that is *reachable from the public internet* and is
running Ollama. In practice that is one of:

- **A tunnel to a machine you control** (`cloudflared`, `ngrok`, or Tailscale Funnel) —
  fine for a demo, but the model is only up while that machine is. Put a key in front of it
  with `OLLAMA_API_KEY`; an open Ollama endpoint is an open invitation.
- **A hosted GPU box** running Ollama behind a reverse proxy — a real deployment, at the
  price of a GPU instance.
- **Not Ollama at all.** If this is meant to run unattended, the honest answer is a hosted
  inference API. Ollama's `/api/chat` and the streaming/tool-call handling in `src/app.ts`
  would be replaced; the NDJSON protocol the browser speaks, and everything in
  `src/chat-widget/`, would not change.

## The front end

The widget's API base comes from `VITE_CHAT_API_URL` at build time, falling back to
same-origin in production. If this backend is its own Vercel project — which is what the
setup above describes — set that variable on the *front end's* project to this
deployment's URL, and add that URL's origin to `CHAT_ALLOWED_ORIGINS` here.

[Ollama]: https://ollama.com
