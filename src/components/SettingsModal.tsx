import { useState } from 'react';
import { X, Minus, Plus, Type, LogIn, LogOut, Cloud, Settings2 } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { RsvpSettings } from '../utils/storage';

export type FontFamily = 'system' | 'inter' | 'roboto' | 'merriweather' | 'mono';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  deepgramApiKey: string;
  setDeepgramApiKey: (key: string) => void;
  syncApiKey: boolean;
  setSyncApiKey: (sync: boolean) => void;
  ttsSpeed: number;
  setTtsSpeed: (speed: number) => void;
  autoLandscape: boolean;
  setAutoLandscape: (auto: boolean) => void;
  fontFamily: FontFamily;
  setFontFamily: (font: FontFamily) => void;
  rsvpSettings: RsvpSettings;
  setRsvpSettings: (settings: RsvpSettings) => void;
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
  deepgramApiKey,
  setDeepgramApiKey,
  syncApiKey,
  setSyncApiKey,
  ttsSpeed,
  setTtsSpeed,
  autoLandscape,
  setAutoLandscape,
  fontFamily,
  setFontFamily,
  rsvpSettings,
  setRsvpSettings,
  onSave,
  user,
  onSignIn,
  onSignOut
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'rsvp'>('general');

  if (!isOpen) return null;

  const updateRsvp = (key: keyof RsvpSettings, value: number) => {
    setRsvpSettings({ ...rsvpSettings, [key]: value });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 text-zinc-900 dark:text-zinc-100">
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl w-full max-w-md landscape:max-w-4xl shadow-2xl border border-zinc-200 dark:border-zinc-800 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Settings</h2>
          <button onClick={onClose} className="opacity-50 hover:opacity-100">
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 mb-6">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'general'
              ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('rsvp')}
            className={`flex-1 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'rsvp'
              ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
          >
            RSVP Delays
          </button>
        </div>

        <div className="space-y-6">
          {activeTab === 'general' ? (
            <div className="space-y-6 landscape:grid landscape:grid-cols-2 landscape:gap-6 landscape:space-y-0">
              {/* Account Section */}
          <div className="landscape:col-span-2">
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
            <div className="flex items-start gap-3">
              <input
                id="auto-landscape"
                type="checkbox"
                checked={autoLandscape}
                onChange={(e) => setAutoLandscape(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 focus:ring-zinc-500"
              />
              <label htmlFor="auto-landscape" className="text-sm opacity-70 leading-normal">
                <strong>Auto-landscape when reading</strong><br />
                <span className="text-xs">Automatically switch to landscape mode on mobile devices when you start reading.</span>
              </label>
            </div>
          </div>

          <div className="landscape:row-span-2">
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

          <div className="landscape:col-span-2 space-y-4">
            <div>
              <label htmlFor="api-key" className="block text-sm font-medium mb-1.5 opacity-70">Gemini API Key</label>
              <input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:ring-2 focus:ring-zinc-500 outline-none transition-all"
                placeholder="Enter your Gemini API key"
              />
            </div>
            <div>
              <label htmlFor="deepgram-api-key" className="block text-sm font-medium mb-1.5 opacity-70">Deepgram API Key (for TTS)</label>
              <input
                id="deepgram-api-key"
                type="password"
                value={deepgramApiKey}
                onChange={(e) => setDeepgramApiKey(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:ring-2 focus:ring-zinc-500 outline-none transition-all"
                placeholder="Enter your Deepgram API key"
              />
            </div>
            <div className="mt-3 flex items-start gap-3">
              <input
                id="sync-api-key"
                type="checkbox"
                checked={syncApiKey}
                onChange={(e) => setSyncApiKey(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 focus:ring-zinc-500"
              />
              <label htmlFor="sync-api-key" className="text-xs opacity-70 leading-normal">
                <strong>Sync API Keys to Firestore</strong><br />
                Enabling this syncs your keys across devices. If you're uncomfortable sharing your keys with this service, disable this to keep them stored only on this device.
              </label>
            </div>
          </div>

            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-200">
              <div>
                <label className="block text-sm font-medium mb-4 opacity-70 flex items-center gap-2">
                  <Settings2 size={16} />
                  RSVP Timing
                </label>
                <div className="space-y-5 landscape:grid landscape:grid-cols-2 landscape:gap-6 landscape:space-y-0">
                  <RsvpControl
                    label="Period Multiplier"
                    description="Delay after . ! ?"
                    value={rsvpSettings.periodMultiplier}
                    min={1} max={5} step={0.1}
                    unit="x"
                    onChange={(v) => updateRsvp('periodMultiplier', v)}
                  />
                  <RsvpControl
                    label="Comma Multiplier"
                    description="Delay after , ; :"
                    value={rsvpSettings.commaMultiplier}
                    min={1} max={5} step={0.1}
                    unit="x"
                    onChange={(v) => updateRsvp('commaMultiplier', v)}
                  />
                  <RsvpControl
                    label="Long Word Multiplier"
                    description="Delay for words > 8 chars or numbers > 2 digits"
                    value={rsvpSettings.longWordMultiplier}
                    min={1} max={5} step={0.1}
                    unit="x"
                    onChange={(v) => updateRsvp('longWordMultiplier', v)}
                  />
                  <RsvpControl
                    label="Too-Wide Multiplier"
                    description="Delay when word scales down"
                    value={rsvpSettings.tooWideMultiplier}
                    min={1} max={5} step={0.1}
                    unit="x"
                    onChange={(v) => updateRsvp('tooWideMultiplier', v)}
                  />
                  <RsvpControl
                    label="Chapter Break Delay"
                    description="Pause between chapters"
                    value={rsvpSettings.chapterBreakDelay}
                    min={0} max={10000} step={500}
                    unit="ms"
                    onChange={(v) => updateRsvp('chapterBreakDelay', v)}
                  />
                  <RsvpControl
                    label="Orientation Delay"
                    description="Pause after rotating screen"
                    value={rsvpSettings.orientationDelay}
                    min={0} max={2000} step={100}
                    unit="ms"
                    onChange={(v) => updateRsvp('orientationDelay', v)}
                  />
                  <RsvpControl
                    label="WPM Ramp Duration"
                    description="Time to reach full speed on resume"
                    value={rsvpSettings.wpmRampDuration}
                    min={0} max={10000} step={500}
                    unit="ms"
                    onChange={(v) => updateRsvp('wpmRampDuration', v)}
                  />
                  <RsvpControl
                    label="Vanity WPM Ratio"
                    description="Padding to match target WPM"
                    value={rsvpSettings.vanityWpmRatio}
                    min={1} max={2} step={0.05}
                    unit="x"
                    onChange={(v) => updateRsvp('vanityWpmRatio', v)}
                  />
                  <RsvpControl
                    label="Preview Word Count"
                    description="Words shown when paused"
                    value={rsvpSettings.previewWordCount}
                    min={10} max={200} step={10}
                    unit=" words"
                    onChange={(v) => updateRsvp('previewWordCount', v)}
                  />
                </div>
              </div>
            </div>
          )}

          <button
            onClick={onSave}
            className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-2.5 rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            Close Settings
          </button>
        </div>
      </div>
    </div>
  );
}

function RsvpControl({
  label,
  description,
  value,
  min,
  max,
  step,
  onChange,
  unit
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  unit: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-end">
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-[10px] opacity-50">{description}</div>
        </div>
        <div className="text-sm font-mono font-bold">{value.toFixed(unit === 'ms' ? 0 : 2)}{unit}</div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-900 dark:accent-zinc-100"
      />
    </div>
  );
}