import { X, Minus, Plus, Type, LogIn, LogOut, Cloud } from 'lucide-react';
import type { User } from 'firebase/auth';

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
  user?: User | null;
  onSignIn?: () => void;
  onSignOut?: () => void;
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
  onSave,
  user,
  onSignIn,
  onSignOut
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 text-zinc-900 dark:text-zinc-100">
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl w-full max-w-md shadow-2xl border border-zinc-200 dark:border-zinc-800 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Settings</h2>
          <button onClick={onClose} className="opacity-50 hover:opacity-100">
            <X size={24} />
          </button>
        </div>
        <div className="space-y-6">

          {/* Account Section */}
          <div>
            <label className="block text-sm font-medium mb-3 opacity-70 flex items-center gap-2">
              <Cloud size={16} />
              Sync & Account
            </label>
            <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
              {user ? (
                <div className="flex justify-between items-center">
                  <div className="truncate mr-2">
                    <div className="text-sm font-medium">{user.displayName || 'User'}</div>
                    <div className="text-xs opacity-60 truncate">{user.email}</div>
                  </div>
                  <button
                    onClick={onSignOut}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                  >
                    <LogOut size={14} />
                    Sign Out
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs opacity-70 mb-2">Sign in to sync your library and progress across devices.</p>
                  <button
                    onClick={onSignIn}
                    className="flex w-full items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md hover:opacity-90 transition-opacity"
                  >
                    <LogIn size={16} />
                    Sign In with Google
                  </button>
                </div>
              )}
            </div>
          </div>

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
                  className={`p-3 text-sm rounded-lg border text-left transition-all ${fontFamily === font.id
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