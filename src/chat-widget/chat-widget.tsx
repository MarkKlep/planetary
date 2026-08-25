import { useEffect, useRef, useState } from 'react';
import { checkHealth, streamChat, type ChatMessage } from './chat-api';
import { buildSceneContext } from './scene-context';
import './chat-widget.scss';

/** A rendered turn: the message, plus any scene actions that ran during it. */
interface Turn extends ChatMessage {
    actions?: string[];
}

const SUGGESTIONS = ['Take me to Titan', 'What am I looking at?', 'How far is Mars right now?'];

/**
 * The assistant, wired to the scene.
 *
 * Plain React state — unlike the HUDs, `script.ts` has no stake in any of this, so
 * there is nothing for a DOM bridge to keep in sync. The traffic runs the other way:
 * this widget reads `sceneState` and clicks nav buttons, both through `scene-bridge.ts`.
 */
export function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Turn[]>([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const streamingIndex = useRef<number | null>(null);

    /**
     * The model's view of the conversation, which is deliberately *not* the rendered
     * one: it also carries the tool calls and their results.
     *
     * Sending the transcript instead was the first attempt and it quietly broke
     * navigation. With the calls stripped out, the model saw nothing but
     * "user asks to go somewhere → assistant replies in prose", concluded that was the
     * whole job, and from the second request on it stopped calling the tool and simply
     * asserted the camera had moved. Keeping its own calls in front of it is what makes
     * it go on making them.
     */
    const conversation = useRef<ChatMessage[]>([]);

    /**
     * The model runs on a developer's own machine, tunnelled in — it is online only when
     * that machine is. Checked fresh each time the panel opens rather than continuously,
     * since "was it up a minute ago" is not what a user opening the panel wants to know.
     */
    const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setServerStatus('checking');
        void checkHealth().then((ok) => {
            if (!cancelled) setServerStatus(ok ? 'online' : 'offline');
        });
        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    const send = async (text: string) => {
        if (!text.trim() || isStreaming) return;

        setError(null);
        setInput('');

        const question = { role: 'user', content: text.trim() } satisfies ChatMessage;
        const transcript = [...messages, question];
        const outgoing = [...conversation.current, question];

        streamingIndex.current = transcript.length;
        setMessages([...transcript, { role: 'assistant', content: '' }]);
        setIsStreaming(true);

        // Snapshotted at send time rather than inside the stream: the camera may well be
        // moving by the time the reply lands (a fly-to runs 1.5-3.5s), and the answer
        // should describe the scene the question was asked about.
        const sceneContext = buildSceneContext();

        const updateStreaming = (change: (turn: Turn) => Turn) => {
            const index = streamingIndex.current;
            if (index === null) return;
            setMessages((prev) => {
                if (!prev[index]) return prev;
                const next = prev.slice();
                next[index] = change(next[index]);
                return next;
            });
        };

        try {
            conversation.current = await streamChat(outgoing, sceneContext, {
                onDelta: (delta) =>
                    updateStreaming((turn) => ({ ...turn, content: turn.content + delta })),
                onAction: (action) =>
                    updateStreaming((turn) => ({
                        ...turn,
                        actions: [...(turn.actions ?? []), action.label],
                    })),
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            // Drop the placeholder bubble if nothing ever streamed into it — otherwise a
            // request that fails immediately leaves a blank assistant message above the
            // error. An action with no text is still worth keeping: the camera did move.
            setMessages((prev) => {
                const turn = prev[transcript.length];
                return turn && turn.content === '' && !turn.actions ? prev.slice(0, transcript.length) : prev;
            });
        } finally {
            streamingIndex.current = null;
            setIsStreaming(false);
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void send(input);
        }
    };

    return (
        <>
            <button
                type="button"
                className="chat-toggle"
                aria-label={isOpen ? 'Close assistant' : 'Open assistant'}
                onClick={() => setIsOpen((open) => !open)}
            >
                {isOpen ? '×' : '💬'}
            </button>

            <div className={`chat-panel${isOpen ? ' chat-panel--open' : ''}`}>
                <div className="chat-panel__header">
                    <span className="chat-panel__title">Assistant</span>
                </div>

                <div className={`chat-panel__status chat-panel__status--${serverStatus}`}>
                    {serverStatus === 'checking' && 'Checking connection…'}
                    {serverStatus === 'online' &&
                        "Online — this assistant runs on the developer's own machine and is only available while it's on."}
                    {serverStatus === 'offline' &&
                        "Offline — the developer's machine isn't running the assistant right now."}
                </div>

                <div className="chat-panel__messages">
                    {messages.length === 0 && (
                        <div className="chat-panel__empty">
                            <p>Ask about the scene, or ask to be taken somewhere.</p>
                            <div className="chat-panel__suggestions">
                                {SUGGESTIONS.map((suggestion) => (
                                    <button
                                        key={suggestion}
                                        type="button"
                                        onClick={() => void send(suggestion)}
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((message, index) => (
                        <div key={index} className={`chat-turn chat-turn--${message.role}`}>
                            {message.actions?.map((action) => (
                                <div key={action} className="chat-action">{action}</div>
                            ))}
                            {(message.content || (isStreaming && index === streamingIndex.current)) && (
                                <div className={`chat-message chat-message--${message.role}`}>
                                    {message.content || '…'}
                                </div>
                            )}
                        </div>
                    ))}

                    {error && <div className="chat-panel__error">{error}</div>}
                </div>

                <div className="chat-panel__input">
                    <textarea
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={serverStatus === 'offline' ? 'Assistant is offline…' : 'Ask, or say where to go…'}
                        rows={1}
                        disabled={isStreaming || serverStatus === 'offline'}
                    />
                    <button
                        type="button"
                        onClick={() => void send(input)}
                        disabled={isStreaming || !input.trim() || serverStatus === 'offline'}
                    >
                        Send
                    </button>
                </div>
            </div>
        </>
    );
}
