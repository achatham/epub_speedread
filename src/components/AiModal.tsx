import { Bot, Sparkles, X, Volume2, Square } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useState, useRef, useEffect } from 'react';
import { synthesizeSpeech, type AudioController } from '../utils/tts';

interface AiModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiResponse: string;
  aiQuestion: string;
  setAiQuestion: (q: string) => void;
  handleAskAi: (q?: string) => void;
  isAiLoading: boolean;
  ttsSpeed: number;
}

const CANNED_QUESTIONS = [
  "Remind me what happened recently",
  "Remind me what happened in this chapter so far",
  "Give me the dramatis personae so far"
];

export function AiModal({
  isOpen,
  onClose,
  aiResponse,
  aiQuestion,
  setAiQuestion,
  handleAskAi,
  isAiLoading,
  ttsSpeed
}: AiModalProps) {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<AudioController | null>(null);

  const stopAudio = () => {
      if (audioRef.current) {
          audioRef.current.stop();
          audioRef.current = null;
      }
      setIsPlayingAudio(false);
  };

  useEffect(() => {
      if (!isOpen || aiResponse) {
          if (audioRef.current) {
              audioRef.current.stop();
              audioRef.current = null;
          }
          setIsPlayingAudio(false);
      }
  }, [isOpen, aiResponse]);

  const handleToggleAudio = async () => {
      if (isPlayingAudio) {
          stopAudio();
      } else {
          if (!aiResponse) return;
          setIsPlayingAudio(true); 
          const controller = await synthesizeSpeech(aiResponse, ttsSpeed);
          if (controller) {
              audioRef.current = controller;
              controller.onEnded = () => {
                  setIsPlayingAudio(false);
                  audioRef.current = null;
              };
          } else {
              setIsPlayingAudio(false);
          }
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 text-zinc-900 dark:text-zinc-100">
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <Bot className="text-zinc-500" />
            <h2 className="text-xl font-semibold">Ask AI about the book</h2>
            {aiResponse && !isAiLoading && (
                <button 
                    onClick={handleToggleAudio}
                    className={`ml-2 p-1.5 rounded-full transition-colors ${isPlayingAudio ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500'}`}
                    title={isPlayingAudio ? "Stop reading" : "Read aloud"}
                >
                    {isPlayingAudio ? <Square size={18} fill="currentColor" /> : <Volume2 size={18} />}
                </button>
            )}
          </div>
          <button onClick={onClose} className="opacity-50 hover:opacity-100">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto mb-6 space-y-4 min-h-[200px] p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-100 dark:border-zinc-800">
          {aiResponse ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap prose dark:prose-invert max-w-none">
              <ReactMarkdown>{aiResponse}</ReactMarkdown>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <Sparkles size={48} className="mb-4 opacity-30" />
              <p className="mb-6 opacity-50">Ask a question about what you've read so far.</p>
              
              <div className="flex flex-wrap gap-2 justify-center max-w-lg mb-4">
                {CANNED_QUESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => {
                      setAiQuestion(q);
                      handleAskAi(q);
                    }}
                    className="text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-3 py-1.5 rounded-full transition-colors border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
                  >
                    {q}
                  </button>
                ))}
              </div>

              <p className="text-xs opacity-30">The AI only sees text up to your current position.</p>
            </div>
          )}
          {isAiLoading && (
            <div className="flex items-center gap-2 text-sm opacity-50 animate-pulse">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:0.2s]"></div>
                <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:0.4s]"></div>
              </div>
              Thinking...
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAskAi()}
            className="flex-1 p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:ring-2 focus:ring-zinc-500 outline-none transition-all"
            placeholder="How does the protagonist feel about...?"
            disabled={isAiLoading}
          />
          <button
            onClick={() => handleAskAi()}
            disabled={isAiLoading || !aiQuestion.trim()}
            className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-6 py-2 rounded-lg font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
