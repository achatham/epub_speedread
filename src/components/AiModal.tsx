import { Bot, Sparkles, X } from 'lucide-react';

interface AiModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiResponse: string;
  aiQuestion: string;
  setAiQuestion: (q: string) => void;
  handleAskAi: () => void;
  isAiLoading: boolean;
}

export function AiModal({
  isOpen,
  onClose,
  aiResponse,
  aiQuestion,
  setAiQuestion,
  handleAskAi,
  isAiLoading
}: AiModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 text-zinc-900 dark:text-zinc-100">
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <Bot className="text-zinc-500" />
            <h2 className="text-xl font-semibold">Ask AI about the book</h2>
          </div>
          <button onClick={onClose} className="opacity-50 hover:opacity-100">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto mb-6 space-y-4 min-h-[200px] p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-100 dark:border-zinc-800">
          {aiResponse ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {aiResponse}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-30 text-center">
              <Sparkles size={48} className="mb-4" />
              <p>Ask a question about what you've read so far.</p>
              <p className="text-xs mt-2">The AI only sees text up to your current position.</p>
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
            onClick={handleAskAi}
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
