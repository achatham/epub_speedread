import { useState, useRef } from 'react';
import { X, Play, Square, Settings2, Terminal } from 'lucide-react';
import { synthesizeSpeech, type AudioController } from '../utils/tts';

interface TtsDebugProps {
    isOpen: boolean;
    onClose: () => void;
    defaultSpeed: number;
}

const CANNED_TEXTS = [
    { label: "Short", text: "The quick brown fox jumps over the lazy dog." },
    { label: "Medium", text: "Artificial intelligence is a branch of computer science that aims to create machines that can perform tasks that typically require human intelligence, such as visual perception, speech recognition, decision-making, and translation between languages." },
    { label: "Long (Multi-chunk)", text: "This is a much longer piece of text designed to test the chunking behavior of the text-to-speech system. In this application, we break text into chunks of approximately 1900 characters because the API may have limits. Each chunk is fetched independently and then scheduled to play sequentially. If this process isn't handled carefully, it can lead to gaps in playback or even browser performance issues if too many chunks are being processed at once. Testing this with a larger volume of text helps us ensure that the sequential playback logic is working as intended and that the browser remains responsive even when handling complex audio synthesis tasks. We are also testing the playback speed control to ensure that the user's preferred reading pace is accurately reflected in the generated audio. By providing high-quality, low-latency text-to-speech, we can create a more immersive and accessible reading experience for everyone. Let's see how well the system handles this paragraph as it transitions from one chunk to the next, maintaining the flow of speech without interruption or distortion." },
];

export function TtsDebug({ isOpen, onClose, defaultSpeed }: TtsDebugProps) {
    const [text, setText] = useState(CANNED_TEXTS[0].text);
    const [speed, setSpeed] = useState(defaultSpeed);
    const [isPlaying, setIsPlaying] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const controllerRef = useRef<AudioController | null>(null);

    const addLog = (msg: string) => {
        setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`].slice(-10));
    };

    const handlePlay = async () => {
        if (isPlaying) {
            if (controllerRef.current) {
                controllerRef.current.stop();
                controllerRef.current = null;
            }
            setIsPlaying(false);
            addLog("Playback stopped.");
            return;
        }

        setIsPlaying(true);
        addLog(`Starting synthesis at ${speed}x...`);

        try {
            const controller = await synthesizeSpeech(text, speed);
            if (controller) {
                controllerRef.current = controller;
                controller.onEnded = () => {
                    setIsPlaying(false);
                    controllerRef.current = null;
                    addLog("Playback finished.");
                };
            } else {
                setIsPlaying(false);
                addLog("Error: Failed to create audio controller. Check API key.");
            }
        } catch (e: any) {
            setIsPlaying(false);
            addLog(`Error: ${e.message}`);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4 text-zinc-900 dark:text-zinc-100">
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl w-full max-w-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col gap-6">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Terminal className="text-blue-500" />
                        <h2 className="text-xl font-bold">TTS Debugging Panel</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2 opacity-70">Canned Text</label>
                        <div className="flex gap-2 mb-3">
                            {CANNED_TEXTS.map(t => (
                                <button
                                    key={t.label}
                                    onClick={() => setText(t.text)}
                                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${text === t.text ? 'bg-blue-500 border-blue-500 text-white' : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'}`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            className="w-full h-40 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm resize-none"
                            placeholder="Enter text to synthesize..."
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-6">
                        <div className="flex-1 min-w-[200px]">
                            <div className="flex justify-between mb-1.5">
                                <label className="text-sm font-medium opacity-70 flex items-center gap-2">
                                    <Settings2 size={14} />
                                    Playback Speed
                                </label>
                                <span className="text-sm font-mono font-bold">{speed.toFixed(1)}x</span>
                            </div>
                            <input
                                type="range"
                                min="0.5"
                                max="1.5"
                                step="0.1"
                                value={speed}
                                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                                className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>

                        <button
                            onClick={handlePlay}
                            className={`px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg active:scale-95 ${isPlaying ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                        >
                            {isPlaying ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                            {isPlaying ? 'Stop Playback' : 'Start TTS'}
                        </button>
                    </div>
                </div>

                <div className="bg-zinc-950 text-zinc-400 p-4 rounded-xl font-mono text-xs overflow-hidden">
                    <div className="flex items-center gap-2 mb-2 opacity-50 border-b border-zinc-800 pb-1">
                        <Terminal size={12} />
                        <span>Synthesis Logs</span>
                    </div>
                    <div className="space-y-1 h-24 overflow-y-auto">
                        {logs.length === 0 && <div className="opacity-30 italic">No logs yet...</div>}
                        {logs.map((log, i) => (
                            <div key={i}>{log}</div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
