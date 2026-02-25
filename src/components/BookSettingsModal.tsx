
import { X, RefreshCw, Type, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';

interface BookSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTitle: string;
  onUpdateTitle: (id: string, newTitle: string) => Promise<void>;
  onRecomputeRealEnd: () => void;
  isProcessing: boolean;
  currentIndex: number;
  onClearFutureSessions: () => Promise<void>;
}

export function BookSettingsModal({
  isOpen,
  onClose,
  currentTitle,
  onUpdateTitle,
  onRecomputeRealEnd,
  isProcessing,
  currentIndex,
  onClearFutureSessions
}: BookSettingsModalProps) {
  const [newTitle, setNewTitle] = useState(currentTitle);

  useEffect(() => {
    setNewTitle(currentTitle);
  }, [currentTitle, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4 text-zinc-900 dark:text-zinc-100">
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl w-full max-w-md shadow-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Book Settings</h2>
          <button onClick={onClose} className="opacity-50 hover:opacity-100">
            <X size={24} />
          </button>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider opacity-50 flex items-center gap-2">
              <Type size={14} />
              Book Title
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="flex-1 p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:ring-2 focus:ring-zinc-500 outline-none transition-all"
                placeholder="Enter new title..."
              />
              <button
                onClick={async () => {
                  const currentBookId = (window as any)._currentBookId || ''; // Getting around not having bookId in this specific modal without prop drilling yet. Better approach: Pass bookId as prop.
                  await onUpdateTitle(currentBookId, newTitle); // We'll update the prop inside App.tsx to pass the ID directly.
                  onClose();
                }}
                disabled={newTitle === currentTitle || !newTitle.trim()}
                className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                Update
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider opacity-50">
                Analysis
              </label>
              <button
                onClick={onRecomputeRealEnd}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all text-sm font-medium disabled:opacity-50"
              >
                <RefreshCw size={18} className={isProcessing ? 'animate-spin' : ''} />
                {isProcessing ? 'Re-computing Real End...' : 'Re-compute Real End'}
              </button>
              <p className="text-[10px] opacity-40 leading-relaxed text-center">
                This will use Gemini AI to scan the book and identify where the main story actually ends, ignoring backmatter like appendices or notes.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider opacity-50">
                Data Management
              </label>
              <button
                onClick={async () => {
                  if (window.confirm(`Delete all reading records beyond word ${currentIndex}? This will also reset your reading speed calibration for this book.`)) {
                    await onClearFutureSessions();
                  }
                }}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-red-200 dark:border-red-900/30 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all text-sm font-medium text-red-600 dark:text-red-400"
              >
                <Trash2 size={18} />
                Clear Future Records
              </button>
              <p className="text-[10px] opacity-40 leading-relaxed text-center">
                Use this if the app thinks you've read further than you actually have. It will remove all logs after your current position.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
