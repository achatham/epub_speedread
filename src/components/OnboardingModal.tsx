import { useState } from 'react';
import { X, ExternalLink, Brain, Sparkles, Volume2 } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  syncApiKey: boolean;
  setSyncApiKey: (sync: boolean) => void;
  onComplete: () => void;
}

export function OnboardingModal({
  isOpen,
  onClose, // Used for "Skip"
  apiKey,
  setApiKey,
  syncApiKey,
  setSyncApiKey,
  onComplete
}: OnboardingModalProps) {
  const [step, setStep] = useState(1);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 text-zinc-900 dark:text-zinc-100">
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl w-full max-w-lg shadow-2xl border border-zinc-200 dark:border-zinc-800 max-h-[90vh] overflow-y-auto">
        
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="inline-flex p-3 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 mb-4">
                <Sparkles size={32} />
              </div>
              <h2 className="text-2xl font-bold mb-2">Supercharge Your Reading</h2>
              <p className="opacity-70">Unlock AI-powered features with a free Gemini API key.</p>
            </div>

            <div className="space-y-4">
              <div className="flex gap-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                <div className="p-2 rounded bg-white dark:bg-zinc-800 shadow-sm h-fit">
                  <Brain size={20} className="text-purple-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Ask Questions</h3>
                  <p className="text-xs opacity-70 mt-1">"Who is this character?" or "What just happened?" without spoilers.</p>
                </div>
              </div>

              <div className="flex gap-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                <div className="p-2 rounded bg-white dark:bg-zinc-800 shadow-sm h-fit">
                  <Volume2 size={20} className="text-green-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Listen to Books</h3>
                  <p className="text-xs opacity-70 mt-1">High-quality Text-to-Speech turns any EPUB into an audiobook.</p>
                </div>
              </div>

              <div className="flex gap-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                <div className="p-2 rounded bg-white dark:bg-zinc-800 shadow-sm h-fit">
                  <span className="font-bold text-sm">END</span>
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Smart Completion</h3>
                  <p className="text-xs opacity-70 mt-1">Automatically detects the "real" end of the book, skipping indices and appendices.</p>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setStep(2)}
              className="w-full py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Get Started
            </button>
            <button 
              onClick={onClose}
              className="w-full py-2 text-sm opacity-50 hover:opacity-100 transition-opacity"
            >
              Skip for now
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <h2 className="text-xl font-bold">Enter API Key</h2>
              <button onClick={onClose} className="opacity-50 hover:opacity-100">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-sm">
              <p className="mb-2"><strong>Is it free?</strong></p>
              <p className="opacity-80">Usually yes! Google offers a generous free tier. Heavy usage might cost around $0.01 per action.</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 opacity-70">1. Get your key</label>
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-sm font-medium"
              >
                Open Google AI Studio <ExternalLink size={14} />
              </a>
            </div>

            <div>
              <label htmlFor="onboarding-key" className="block text-sm font-medium mb-2 opacity-70">2. Paste it here</label>
              <input
                id="onboarding-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:ring-2 focus:ring-zinc-500 outline-none transition-all font-mono text-sm"
              />
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <input
                id="onboarding-sync"
                type="checkbox"
                checked={syncApiKey}
                onChange={(e) => setSyncApiKey(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 focus:ring-zinc-500"
              />
              <label htmlFor="onboarding-sync" className="text-xs opacity-70 leading-normal">
                <strong>Sync to Cloud</strong><br />
                Save securely to your account to use on other devices. Uncheck to keep it local-only.
              </label>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={onComplete}
                disabled={!apiKey}
                className="w-full py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save & Continue
              </button>
              <button 
                onClick={onClose}
                className="text-sm opacity-50 hover:opacity-100 transition-opacity"
              >
                I'll do this later
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
