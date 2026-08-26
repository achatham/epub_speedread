import { ArrowLeft, Sparkles, Volume2, Square, Image as ImageIcon, MessageSquare, Download, Loader2, ListChecks, CheckSquare, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useState, useRef, useEffect } from 'react';
import { synthesizeSpeech, type AudioController } from '../utils/tts';
import { AI_QUESTIONS } from '../constants';
import type { IllustrationRecord } from '../utils/storage';

interface AiViewProps {
  isOpen: boolean;
  onClose: () => void;
  aiTab: 'ask' | 'illustrate';
  setAiTab: (tab: 'ask' | 'illustrate') => void;
  aiResponse: string;
  setAiResponse: (response: string) => void;
  aiQuestion: string;
  setAiQuestion: (q: string) => void;
  aiContextMode: 'recent' | 'full';
  setAiContextMode: (mode: 'recent' | 'full') => void;
  illustrationQuery: string;
  setIllustrationQuery: (q: string) => void;
  handleAskAi: (q?: string) => void;
  isAiLoading: boolean;
  illustrationPrompt: string;
  setIllustrationPrompt: (prompt: string) => void;
  illustrationImage: string | null;
  setIllustrationImage: (image: string | null) => void;
  isIllustrationLoading: boolean;
  handleGenerateIllustration: (description?: string) => void;
  illustrations: IllustrationRecord[];
  illustrationSuggestions: string[];
  setIllustrationSuggestions: React.Dispatch<React.SetStateAction<string[]>>;
  selectedSuggestions: string[];
  setSelectedSuggestions: React.Dispatch<React.SetStateAction<string[]>>;
  isSuggesting: boolean;
  handleSuggestIllustrations: () => void;
  handleGenerateMultipleIllustrations: () => void;
  ttsSpeed: number;
}

const CANNED_QUESTIONS = [
  AI_QUESTIONS.JUST_HAPPENED,
  AI_QUESTIONS.RECENT_SUMMARY
];

const CANNED_ILLUSTRATIONS = [
  "Current setting",
  "The protagonist",
  "A recent key entity",
  "Atmospheric landscape"
];

export function AiView({
  isOpen,
  onClose,
  aiTab,
  setAiTab,
  aiResponse,
  setAiResponse,
  aiQuestion,
  setAiQuestion,
  aiContextMode,
  setAiContextMode,
  illustrationQuery,
  setIllustrationQuery,
  handleAskAi,
  isAiLoading,
  illustrationPrompt,
  setIllustrationPrompt,
  illustrationImage,
  setIllustrationImage,
  isIllustrationLoading,
  handleGenerateIllustration,
  illustrations,
  illustrationSuggestions,
  setIllustrationSuggestions,
  selectedSuggestions,
  setSelectedSuggestions,
  isSuggesting,
  handleSuggestIllustrations,
  handleGenerateMultipleIllustrations,
  ttsSpeed
}: AiViewProps) {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<AudioController | null>(null);

  const stopAudio = () => {
      if (audioRef.current) {
          audioRef.current.stop();
          audioRef.current = null;
      }
      setIsPlayingAudio(false);
  };

  // Stop playback when the view closes or the response it was reading changes.
  useEffect(() => {
      if (!isOpen) {
          if (audioRef.current) {
              audioRef.current.stop();
              audioRef.current = null;
          }
          setIsPlayingAudio(false);
      }
  }, [isOpen]);

  useEffect(() => {
      if (audioRef.current) {
          audioRef.current.stop();
          audioRef.current = null;
          setIsPlayingAudio(false);
      }
  }, [aiResponse]);

  if (!isOpen) return null;

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

  const handleDownloadImage = () => {
    if (!illustrationImage) return;
    const link = document.createElement('a');
    link.href = illustrationImage.startsWith('http') ? illustrationImage : `data:image/png;base64,${illustrationImage}`;
    link.download = `illustration-${Date.now()}.png`;
    link.click();
  };

  const hasAskContent = Boolean(aiResponse || aiQuestion || isAiLoading);
  const hasIllustrateContent = Boolean(illustrationImage || illustrationQuery || illustrationPrompt || illustrationSuggestions.length);

  const handleReset = () => {
    if (aiTab === 'ask') {
      stopAudio();
      setAiQuestion('');
      setAiResponse('');
    } else {
      setIllustrationImage(null);
      setIllustrationPrompt('');
      setIllustrationQuery('');
      setIllustrationSuggestions([]);
      setSelectedSuggestions([]);
    }
  };

  const showReset = aiTab === 'ask'
    ? hasAskContent && !isAiLoading
    : hasIllustrateContent && !isIllustrationLoading;

  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all ${active ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
      <header className="shrink-0 flex items-center gap-2 px-2 sm:px-4 h-14 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <button onClick={onClose} className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Back to book" aria-label="Back to book">
          <ArrowLeft size={20} />
        </button>
        <div className="flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg">
          <button onClick={() => setAiTab('ask')} className={tabClass(aiTab === 'ask')}>
            <MessageSquare size={16} />
            Ask AI
          </button>
          <button onClick={() => setAiTab('illustrate')} className={tabClass(aiTab === 'illustrate')}>
            <ImageIcon size={16} />
            Illustrate
          </button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {aiTab === 'ask' && aiResponse && !isAiLoading && (
            <button
                onClick={handleToggleAudio}
                className={`p-2 rounded-lg transition-colors ${isPlayingAudio ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500'}`}
                title={isPlayingAudio ? "Stop reading" : "Read aloud"}
            >
                {isPlayingAudio ? <Square size={18} fill="currentColor" /> : <Volume2 size={18} />}
            </button>
          )}
          {showReset && (
            <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title="Clear and start over"
            >
                <RotateCcw size={14} />
                {aiTab === 'ask' ? 'New question' : 'Start over'}
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full min-h-full flex flex-col px-4 py-4">
          {aiTab === 'ask' ? (
              (aiResponse || isAiLoading) ? (
                <div className="space-y-3">
                  {aiQuestion && (
                    <p className="text-sm font-medium text-zinc-400 dark:text-zinc-500">{aiQuestion}</p>
                  )}
                  {aiResponse ? (
                    <div className="text-sm leading-relaxed whitespace-pre-wrap prose dark:prose-invert max-w-none">
                      <ReactMarkdown>{aiResponse}</ReactMarkdown>
                    </div>
                  ) : (
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
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
                  <Sparkles size={32} className="opacity-30" />
                  <div className="flex flex-wrap gap-2 justify-center max-w-lg">
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
                  <p className="text-xs opacity-40">The AI only sees text up to your current position.</p>
                </div>
              )
          ) : (
            <div className="flex-1 flex flex-col text-center">
                {illustrationImage ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 w-full">
                        <div className="relative group max-w-full">
                            <img
                                src={illustrationImage.startsWith('http') ? illustrationImage : `data:image/png;base64,${illustrationImage}`}
                                alt="Generated illustration"
                                className="rounded-lg shadow-lg max-h-[60vh] object-contain border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                            />
                            <button
                                onClick={handleDownloadImage}
                                className="absolute bottom-4 right-4 bg-zinc-900/80 hover:bg-zinc-900 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Download image"
                            >
                                <Download size={20} />
                            </button>
                        </div>
                        {illustrationPrompt && (
                            <p className="text-xs opacity-50 italic max-w-md line-clamp-2" title={illustrationPrompt}>
                                {illustrationPrompt}
                            </p>
                        )}
                        <button
                            onClick={() => setIllustrationImage(null)}
                            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline"
                        >
                            Back to Gallery
                        </button>
                    </div>
                ) : isIllustrationLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 w-full">
                        <div className="w-full max-w-md p-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-inner">
                            <Loader2 className="w-10 h-10 mb-3 animate-spin text-zinc-400 mx-auto" />
                            {illustrationPrompt ? (
                                <div className="space-y-3">
                                    <p className="text-sm font-medium">Generating image...</p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 italic bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 leading-relaxed text-left">
                                        {illustrationPrompt}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-sm font-medium">Thinking of a visual description...</p>
                                    <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-zinc-900 dark:bg-zinc-100 animate-progress"></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className={`w-full space-y-5 ${illustrations.length === 0 && !illustrationSuggestions.length ? 'flex-1 flex flex-col items-center justify-center' : ''}`}>
                        {illustrations.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-xs font-semibold uppercase tracking-wider opacity-40 text-left px-1">Gallery</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
                                {illustrations.map(ill => (
                                    <button
                                        key={ill.id}
                                        onClick={() => {
                                            setIllustrationImage(ill.url);
                                            setIllustrationPrompt(ill.prompt);
                                        }}
                                        className="relative aspect-square rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 hover:scale-[1.02] transition-transform group shadow-sm"
                                    >
                                        <img src={ill.url} alt={ill.prompt} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                                            <p className="text-[10px] text-white line-clamp-2 text-left italic">
                                                {ill.prompt}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col items-center w-full">
                            {illustrations.length === 0 && !illustrationSuggestions.length && <ImageIcon size={32} className="mb-3 opacity-30" />}

                            {illustrationSuggestions.length > 0 ? (
                                <div className="w-full space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider opacity-40 text-left px-1">Suggested Illustrations</h3>
                                        <button
                                            onClick={() => setSelectedSuggestions(selectedSuggestions.length === illustrationSuggestions.length ? [] : [...illustrationSuggestions])}
                                            className="text-[10px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline"
                                        >
                                            {selectedSuggestions.length === illustrationSuggestions.length ? 'Deselect All' : 'Select All'}
                                        </button>
                                    </div>
                                    <div className="space-y-2 text-left">
                                        {illustrationSuggestions.map(s => (
                                            <button
                                                key={s}
                                                onClick={() => setSelectedSuggestions(prev => prev.includes(s) ? prev.filter(i => i !== s) : [...prev, s])}
                                                className="flex items-start gap-3 w-full p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors group"
                                            >
                                                <div className="mt-0.5 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200">
                                                    {selectedSuggestions.includes(s) ? <CheckSquare size={16} className="text-zinc-900 dark:text-zinc-100" /> : <Square size={16} />}
                                                </div>
                                                <span className="text-sm leading-tight">{s.split('\n')[0]}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        onClick={handleGenerateMultipleIllustrations}
                                        disabled={selectedSuggestions.length === 0 || isIllustrationLoading}
                                        className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-2.5 rounded-lg font-medium disabled:opacity-50 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                                    >
                                        <Sparkles size={18} />
                                        Generate {selectedSuggestions.length} Illustration{selectedSuggestions.length !== 1 ? 's' : ''}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-wrap gap-2 justify-center max-w-lg mb-4">
                                        {CANNED_ILLUSTRATIONS.map(q => (
                                            <button
                                                key={q}
                                                onClick={() => {
                                                    setIllustrationQuery(q);
                                                    handleGenerateIllustration(q);
                                                }}
                                                className="text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-3 py-1.5 rounded-full transition-colors border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
                                            >
                                                {q}
                                            </button>
                                        ))}
                                    </div>

                                    <button
                                        onClick={handleSuggestIllustrations}
                                        disabled={isSuggesting || isIllustrationLoading}
                                        className="flex items-center gap-2 text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                                    >
                                        {isSuggesting ? (
                                            <>
                                                <Loader2 size={18} className="animate-spin" />
                                                Suggesting...
                                            </>
                                        ) : (
                                            <>
                                                <ListChecks size={18} />
                                                Suggest Illustrations
                                            </>
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-100 dark:border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto space-y-2">
          {aiTab === 'ask' && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider opacity-40">Context</span>
              <div className="flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-md">
                <button
                  onClick={() => setAiContextMode('recent')}
                  className={`px-2.5 py-1 text-xs rounded transition-all ${aiContextMode === 'recent' ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                >
                  Recent Chapters
                </button>
                <button
                  onClick={() => setAiContextMode('full')}
                  className={`px-2.5 py-1 text-xs rounded transition-all ${aiContextMode === 'full' ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                >
                  Full Book
                </button>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={aiTab === 'ask' ? aiQuestion : illustrationQuery}
              onChange={(e) => aiTab === 'ask' ? setAiQuestion(e.target.value) : setIllustrationQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (aiTab === 'ask' ? handleAskAi() : handleGenerateIllustration())}
              className="flex-1 p-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:ring-2 focus:ring-zinc-500 outline-none transition-all"
              placeholder={aiTab === 'ask' ? "How does the protagonist feel about...?" : "Describe a scene or character to illustrate..."}
              disabled={isAiLoading || isIllustrationLoading}
            />
            <button
              onClick={() => aiTab === 'ask' ? handleAskAi() : handleGenerateIllustration()}
              disabled={isAiLoading || isIllustrationLoading || (aiTab === 'ask' ? !aiQuestion.trim() : !illustrationQuery.trim())}
              className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-5 py-2 rounded-lg font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {aiTab === 'ask' ? 'Ask' : 'Generate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
