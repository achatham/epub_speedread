
import { X, RefreshCw, Type } from 'lucide-react';
import { useState, useEffect } from 'react';

interface BookSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTitle: string;
  onUpdateTitle: (newTitle: string) => void;
  onRecomputeRealEnd: () => void;
  isProcessing: boolean;
}

export function BookSettingsModal({
  isOpen,
  onClose,
  currentTitle,
  onUpdateTitle,
  onRecomputeRealEnd,
  isProcessing
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
                onClick={() => onUpdateTitle(newTitle)}
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
        </div>
      </div>
    </div>
  );
}
