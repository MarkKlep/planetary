import cors from 'cors';
import express from 'express';
import ollama, { type Tool } from 'ollama';

const PORT = Number(process.env.PORT) || 3003;
// A general model, not the coder-tuned one: this assistant answers questions about the
// solar system and picks tool calls, and `qwen2.5-coder` is tuned away from both.
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';

interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_name?: string;
    tool_calls?: unknown[];
}

/** The nav panel's own `data-target` vocabulary — see `src/scene-bridge.ts`. */
const BODY_IDS = [
    'sun', 'mercury', 'venus', 'earth', 'moon', 'iss', 'analemma',
    'mars', 'phobos', 'deimos',
    'jupiter', 'io', 'europa', 'ganymede', 'callisto',
    'saturn', 'mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan', 'iapetus',
    'system',
];

/**
 * Exactly one tool, deliberately.
 *
 * Every extra tool is another thing a 7B model can reach for at the wrong moment, and
 * moving the camera is the only action worth that risk — everything else the scene can
 * do is a click away in the nav panel anyway. Live figures are supplied as context
 * instead, so nothing here needs a "look up a distance" call.
 */
const TOOLS: Tool[] = [
    {
        type: 'function',
        function: {
            name: 'focus_body',
            description:
                'Fly the camera to a body in the solar system view. Use this only when the user asks to go somewhere, look at something, or be shown a body. Do not use it to answer questions about a body.',
            parameters: {
                type: 'object',
                required: ['body'],
                properties: {
                    body: {
                        type: 'string',
                        description: 'Which body to fly to. "system" means the wide view of every orbit.',
                        enum: BODY_IDS,
                    },
                },
            },
        },
    },
];

const SYSTEM_PROMPT = `You are the assistant inside Planetary, a real-time 3D solar system simulation the user is looking at right now.

You can fly the camera for them with the focus_body tool, and you are told the live state of the simulation before each message.

Rules:
- The "Live simulation state" below is authoritative. When it gives a figure, use that figure rather than one you remember, and never contradict it.
- When the user asks to be taken somewhere, call focus_body, then say in one short sentence where you are taking them.
- When they ask a question, just answer it. Do not call the tool.
- Be concise and concrete. Two or three sentences unless asked for more.`;

/**
 * Recovering tool calls the model emits as plain text.
 *
 * Roughly one request in eight, qwen2.5 writes its call as
 * `<tool_call>{"name": …}</tool_call>` in the content stream and Ollama fails to lift it
 * into `message.tool_calls`, usually mangling the opening tag into a junk token on the
 * way through. Left alone that renders the raw JSON in the chat and the camera never
 * moves, so the text is checked before any of it is sent.
 *
 * This is a model/template quirk rather than something a prompt fixes, and it costs
 * nothing when the call arrives properly — which is the usual case.
 */

/** Enough characters to tell prose from JSON, and few enough not to stall the stream. */
const PROSE_PROBE_CHARS = 24;

const looksLikeToolCall = (text: string) => text.includes('{') || text.includes('<');

const stripToolTags = (text: string) => text.replace(/<\/?tool_call>/g, '').trim();

function parseLeakedToolCall(text: string): { name: string; arguments: Record<string, unknown> } | null {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;

    try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        // The arguments are trusted no further than the client's own validation, which
        // checks the body id against the same list this file advertises.
        if (parsed && typeof parsed.name === 'string') {
            return { name: parsed.name, arguments: parsed.arguments ?? {} };
        }
    } catch {
        // Prose that merely happened to contain a brace; fall through and show it.
    }
    return null;
}

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
    const messages = req.body?.messages as ChatMessage[] | undefined;
    const sceneContext = typeof req.body?.sceneContext === 'string' ? req.body.sceneContext : '';

    if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'messages must be a non-empty array' });
        return;
    }

    // The scene block is rebuilt from scratch each turn and injected here rather than
    // stored in the history, so a long conversation carries exactly one copy of it —
    // the current one — instead of a trail of stale snapshots the model has to
    // disambiguate.
    const system: ChatMessage = {
        role: 'system',
        content: sceneContext ? `${SYSTEM_PROMPT}\n\nLive simulation state:\n${sceneContext}` : SYSTEM_PROMPT,
    };

    try {
        const stream = await ollama.chat({
            model: MODEL,
            messages: [system, ...messages] as never,
            tools: TOOLS,
            stream: true,
        });

        // NDJSON rather than the plain text this used to stream: text deltas and tool
        // calls now share one response and have to stay distinguishable.
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        const write = (event: unknown) => res.write(`${JSON.stringify(event)}\n`);

        // Text is held back until it can be shown *not* to be a leaked tool call — see
        // `looksLikeToolCall`. Once that is settled the buffer is flushed and everything
        // after it streams straight through, so the delay is a few tokens at most.
        let pending = '';
        let flushing = false;

        const flushPending = () => {
            if (pending) write({ type: 'text', delta: stripToolTags(pending) });
            pending = '';
            flushing = true;
        };

        for await (const part of stream) {
            // Anything that fails past this first write can only be logged — the status
            // line is already gone.
            for (const call of part.message.tool_calls ?? []) {
                write({
                    type: 'tool_call',
                    name: call.function.name,
                    arguments: call.function.arguments,
                });
            }

            const content = part.message.content;
            if (!content) continue;

            if (flushing) {
                write({ type: 'text', delta: content });
                continue;
            }

            pending += content;
            // No brace and no angle bracket after a couple of dozen characters means
            // this is prose, not a mangled call — let it flow from here on.
            if (!looksLikeToolCall(pending) && pending.length >= PROSE_PROBE_CHARS) {
                flushPending();
            }
        }

        // Whatever is still held back at the end is either a short reply that never hit
        // the probe length, or the leak itself.
        if (!flushing && pending) {
            const recovered = parseLeakedToolCall(pending);
            if (recovered) {
                console.warn('Recovered a tool call the model emitted as text:', pending.trim());
                write({ type: 'tool_call', ...recovered });
            } else {
                flushPending();
            }
        }

        res.end();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (res.headersSent) {
            console.error('Ollama stream failed mid-response:', message);
            res.write(`${JSON.stringify({ type: 'error', message })}\n`);
            res.end();
        } else {
            res.status(502).json({ error: `Could not reach Ollama: ${message}` });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Chat backend listening on http://localhost:${PORT} (model: ${MODEL})`);
});
