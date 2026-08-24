import { BODY_IDS, BODY_LABELS, focusBody, type BodyId } from '../scene-bridge';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    /** Set on a `tool` message, naming the call it answers. */
    tool_name?: string;
    /** Carried back verbatim so the model sees its own call in the history. */
    tool_calls?: unknown[];
}

// Vite's own env convention (`import.meta.env.VITE_*`), not the CRA-style
// `process.env.REACT_APP_*` the heatmap sub-app uses — the two apps are built by
// different tools and don't share an env mechanism.
const CHAT_API_URL = import.meta.env.VITE_CHAT_API_URL ?? 'http://localhost:3003';

/**
 * How many times the model may call a tool and be asked again within one send.
 *
 * A tool call is answered by re-posting the whole conversation, which the model can in
 * principle answer with another tool call. Three is enough for "fly there, then say so"
 * with room to spare, and it means a confused model stops rather than looping.
 */
const MAX_ROUNDS = 3;

export interface ToolAction {
    /** Past-tense line for the transcript, e.g. "Flying to Titan". */
    label: string;
}

interface StreamHandlers {
    onDelta: (chunk: string) => void;
    /** Called when a tool actually ran, so the widget can show what happened. */
    onAction?: (action: ToolAction) => void;
}

/** Runs a tool call against the scene and returns what to tell the model. */
function runTool(name: string, args: Record<string, unknown>, handlers: StreamHandlers): string {
    if (name !== 'focus_body') return `There is no tool called ${name}.`;

    const body = String(args.body ?? '') as BodyId;
    if (!BODY_IDS.includes(body)) {
        return `"${args.body}" is not a body in this simulation. Valid values: ${BODY_IDS.join(', ')}.`;
    }

    // False means the nav button was missing, which would mean the panel had not
    // mounted — reported rather than swallowed, so the model does not claim a move
    // that never happened.
    if (!focusBody(body)) {
        return `Could not move the camera to ${BODY_LABELS[body]}.`;
    }

    handlers.onAction?.({ label: `Flying to ${BODY_LABELS[body]}` });
    return `The camera is now flying to ${BODY_LABELS[body]}.`;
}

async function postChat(messages: ChatMessage[], sceneContext: string): Promise<Response> {
    let response: Response;
    try {
        response = await fetch(`${CHAT_API_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, sceneContext }),
        });
    } catch {
        throw new Error("Couldn't reach the chat backend — is it running (npm run dev:chat:server)?");
    }

    if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error ?? `Chat backend returned ${response.status}`);
    }
    return response;
}

/**
 * Posts the conversation, streams the reply, and services any tool calls the model
 * makes along the way.
 *
 * The tools run *here* rather than on the server because what they touch — the camera —
 * only exists in this tab. The backend stays stateless: each round re-posts the whole
 * history, exactly as the plain-text version did.
 */
export async function streamChat(
    messages: ChatMessage[],
    sceneContext: string,
    handlers: StreamHandlers
): Promise<ChatMessage[]> {
    const history = [...messages];

    for (let round = 0; round < MAX_ROUNDS; round++) {
        const response = await postChat(history, sceneContext);
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        let buffered = '';
        let assistantText = '';
        const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];

        // NDJSON: a chunk can split a line anywhere, so whatever follows the last
        // newline is held back until the rest of it arrives.
        const consume = (line: string) => {
            if (!line.trim()) return;
            const event = JSON.parse(line);
            if (event.type === 'text') {
                assistantText += event.delta;
                handlers.onDelta(event.delta);
            } else if (event.type === 'tool_call') {
                toolCalls.push({ name: event.name, arguments: event.arguments ?? {} });
            } else if (event.type === 'error') {
                throw new Error(event.message);
            }
        };

        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffered += decoder.decode(value, { stream: true });
            const lines = buffered.split('\n');
            buffered = lines.pop() ?? '';
            for (const line of lines) consume(line);
        }
        consume(buffered);

        if (toolCalls.length === 0) {
            history.push({ role: 'assistant', content: assistantText });
            return history;
        }

        // Replay the model's own call into the history, then answer it. Both are
        // required: a `tool` message with no matching call above it reads as an
        // orphan and models handle it badly.
        history.push({ role: 'assistant', content: assistantText, tool_calls: toolCalls.map((call) => ({ function: call })) });
        for (const call of toolCalls) {
            history.push({
                role: 'tool',
                tool_name: call.name,
                content: runTool(call.name, call.arguments, handlers),
            });
        }
    }

    return history;
}
