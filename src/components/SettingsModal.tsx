import { X, Minus, Plus, Type } from 'lucide-react';

export type FontFamily = 'system' | 'inter' | 'roboto' | 'merriweather' | 'mono';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  ttsSpeed: number;
  setTtsSpeed: (speed: number) => void;
  fontFamily: FontFamily;
  setFontFamily: (font: FontFamily) => void;
  onSave: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  apiKey,
  setApiKey,
  ttsSpeed,
  setTtsSpeed,
  fontFamily,
  setFontFamily,
  onSave
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 text-zinc-900 dark:text-zinc-100">
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl w-full max-w-md shadow-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Settings</h2>
          <button onClick={onClose} className="opacity-50 hover:opacity-100">
            <X size={24} />
          </button>
        </div>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-3 opacity-70 flex items-center gap-2">
              <Type size={16} />
              Reader Font
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'system', label: 'System (Current)', style: { fontFamily: 'ui-sans-serif, system-ui, sans-serif' } },
                { id: 'inter', label: 'Inter', style: { fontFamily: 'Inter, sans-serif' } },
                { id: 'roboto', label: 'Roboto', style: { fontFamily: 'Roboto, sans-serif' } },
                { id: 'merriweather', label: 'Serif', style: { fontFamily: 'Merriweather, serif' } },
                { id: 'mono', label: 'Monospace', style: { fontFamily: 'monospace' } },
              ].map((font) => (
                <button
                  key={font.id}
                  onClick={() => setFontFamily(font.id as FontFamily)}
                  className={`p-3 text-sm rounded-lg border text-left transition-all ${
                    fontFamily === font.id
                      ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-800/50 ring-1 ring-zinc-900 dark:ring-zinc-100'
                      : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
                  }`}
                  style={font.style}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="block text-sm font-medium opacity-70">TTS Reading Speed (x)</label>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setTtsSpeed(Math.max(0.5, Math.round((ttsSpeed - 0.1) * 10) / 10))}
                className="p-2 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <Minus size={20} />
              </button>
              <span className="text-xl font-medium min-w-[3rem] text-center">{ttsSpeed.toFixed(1)}x</span>
              <button
                onClick={() => setTtsSpeed(Math.min(5.0, Math.round((ttsSpeed + 0.1) * 10) / 10))}
                className="p-2 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="api-key" className="block text-sm font-medium mb-1.5 opacity-70">Gemini API Key</label>
            <input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:ring-2 focus:ring-zinc-500 outline-none transition-all"
              placeholder="Enter your API key"
            />
            <p className="mt-2 text-xs opacity-40">Stored locally in your browser.</p>
          </div>

          <button
            onClick={onSave}
            className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-2.5 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
