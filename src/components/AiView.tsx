import { ArrowLeft, Sparkles, Volume2, Square, Image as ImageIcon, MessageSquare, Download, Loader2, ListChecks, CheckSquare, RotateCcw, X, ChevronLeft, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useState, useRef, useEffect } from 'react';
import { synthesizeSpeech, type AudioController } from '../utils/tts';
import { AI_QUESTIONS } from '../constants';
import type { IllustrationRecord } from '../utils/storage';
import type { AiExchange, PendingIllustration } from '../stores/useUIStore';

interface AiViewProps {
  isOpen: boolean;
  onClose: () => void;
  aiTab: 'ask' | 'illustrate';
  setAiTab: (tab: 'ask' | 'illustrate') => void;
  aiExchanges: AiExchange[];
  clearAiExchanges: () => void;
  pendingAiQuestion: string;
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
  pendingIllustrations: PendingIllustration[];
  retryPendingIllustration: (id: string) => void;
  dismissPendingIllustration: (id: string) => void;
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

// Illustration prompts start with a short title line (see generateIllustrationPrompt).
const promptName = (prompt: string) => prompt.split('\n')[0];

/** How far a drag must travel horizontally before it counts as a lightbox swipe. */
const SWIPE_THRESHOLD_PX = 50;

export function AiView({
  isOpen,
  onClose,
  aiTab,
  setAiTab,
  aiExchanges,
  clearAiExchanges,
  pendingAiQuestion,
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
  pendingIllustrations,
  retryPendingIllustration,
  dismissPendingIllustration,
  ttsSpeed
}: AiViewProps) {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<AudioController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Gallery lightbox tracks the record id, not the index: new images are
  // prepended while a batch runs, so indices shift under us.
  const [viewerId, setViewerId] = useState<string | null>(null);
  const viewerIndex = viewerId !== null ? illustrations.findIndex(i => i.id === viewerId) : -1;
  const viewerRecord = viewerIndex >= 0 ? illustrations[viewerIndex] : null;
  // A freshly generated single image lives in store state until it's viewed from the gallery.
  const viewerImage = viewerRecord ? viewerRecord.url : illustrationImage;
  const viewerPrompt = viewerRecord ? viewerRecord.prompt : illustrationPrompt;
  const isViewerOpen = Boolean(viewerImage);

  const closeViewer = () => {
    setViewerId(null);
    setIllustrationImage(null);
  };
  const showPrev = () => {
    if (viewerIndex > 0) setViewerId(illustrations[viewerIndex - 1].id);
  };
  const showNext = () => {
    if (viewerIndex >= 0 && viewerIndex < illustrations.length - 1) setViewerId(illustrations[viewerIndex + 1].id);
  };

  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);

  const handleViewerPointerDown = (e: React.PointerEvent) => {
    swipeStartXRef.current = e.clientX;
    swipeStartYRef.current = e.clientY;
  };

  // Same trick as PaginatedReaderView: act the moment the drag crosses the
  // threshold rather than on release, because a phone browser can claim the
  // gesture mid-drag and fire pointercancel in place of pointerup.
  const tryViewerSwipe = (clientX: number, clientY: number) => {
    if (swipeStartXRef.current === null || swipeStartYRef.current === null) return;
    const deltaX = clientX - swipeStartXRef.current;
    const deltaY = clientY - swipeStartYRef.current;
    if (Math.abs(deltaX) <= SWIPE_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    swipeStartXRef.current = null;
    swipeStartYRef.current = null;
    if (deltaX > 0) showPrev();
    else showNext();
  };

  const handleViewerPointerMove = (e: React.PointerEvent) => {
    tryViewerSwipe(e.clientX, e.clientY);
  };

  const handleViewerPointerEnd = (e: React.PointerEvent) => {
    tryViewerSwipe(e.clientX, e.clientY);
    swipeStartXRef.current = null;
    swipeStartYRef.current = null;
  };

  const latestAnswer = aiExchanges.length > 0 ? aiExchanges[aiExchanges.length - 1].answer : '';

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
  }, [latestAnswer]);

  // Keep the newest exchange in view as the conversation grows.
  useEffect(() => {
      if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
  }, [aiExchanges.length, isAiLoading, aiTab]);

  // Keyboard navigation for the gallery lightbox. No dependency array: the
  // handler is re-bound each render so it always sees current state.
  useEffect(() => {
      if (!isOpen || aiTab !== 'illustrate' || !isViewerOpen) return;
      const onKey = (e: KeyboardEvent) => {
          if (e.key === 'Escape') closeViewer();
          else if (e.key === 'ArrowLeft') showPrev();
          else if (e.key === 'ArrowRight') showNext();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
  });

  if (!isOpen) return null;

  const handleToggleAudio = async () => {
      if (isPlayingAudio) {
          stopAudio();
      } else {
          if (!latestAnswer) return;
          setIsPlayingAudio(true);
          const controller = await synthesizeSpeech(latestAnswer, ttsSpeed);
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
    if (!viewerImage) return;
    const link = document.createElement('a');
    link.href = viewerImage.startsWith('http') ? viewerImage : `data:image/png;base64,${viewerImage}`;
    link.download = `${(promptName(viewerPrompt) || 'illustration').replace(/[^\w -]/g, '').trim() || 'illustration'}.png`;
    link.click();
  };

  const hasAskContent = Boolean(aiExchanges.length || aiQuestion || isAiLoading);
  const hasIllustrateContent = Boolean(isViewerOpen || illustrationQuery || illustrationPrompt || illustrationSuggestions.length);

  const handleReset = () => {
    if (aiTab === 'ask') {
      stopAudio();
      setAiQuestion('');
      clearAiExchanges();
    } else {
      closeViewer();
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
          {aiTab === 'ask' && latestAnswer && !isAiLoading && (
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className={`${aiTab === 'illustrate' ? 'max-w-5xl' : 'max-w-2xl'} mx-auto w-full min-h-full flex flex-col px-4 py-4`}>
          {aiTab === 'ask' ? (
              (aiExchanges.length > 0 || isAiLoading) ? (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {aiExchanges.map((exchange, i) => (
                    <div key={i} className="py-3 first:pt-0 space-y-2">
                      <p className="text-sm font-medium text-zinc-400 dark:text-zinc-500">{exchange.question}</p>
                      <div className="text-sm leading-relaxed whitespace-pre-wrap prose dark:prose-invert max-w-none">
                        <ReactMarkdown>{exchange.answer}</ReactMarkdown>
                      </div>
                    </div>
                  ))}
                  {isAiLoading && (
                    <div className="py-3 first:pt-0 space-y-2">
                      {pendingAiQuestion && (
                        <p className="text-sm font-medium text-zinc-400 dark:text-zinc-500">{pendingAiQuestion}</p>
                      )}
                      <div className="flex items-center gap-2 text-sm opacity-50 animate-pulse">
                        <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></div>
                          <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:0.2s]"></div>
                          <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:0.4s]"></div>
                        </div>
                        Thinking...
                      </div>
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
                        onClick={() => handleAskAi(q)}
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
                {isViewerOpen ? (
                    <div className="flex-1 min-h-0 flex flex-col items-center gap-3 w-full">
                        <div
                            className="relative flex-1 min-h-0 w-full flex items-center justify-center touch-pan-y select-none"
                            onPointerDown={handleViewerPointerDown}
                            onPointerMove={handleViewerPointerMove}
                            onPointerUp={handleViewerPointerEnd}
                            onPointerCancel={handleViewerPointerEnd}
                        >
                            {viewerIndex > 0 && (
                                <button
                                    onClick={showPrev}
                                    className="absolute left-0 z-10 p-2 rounded-full bg-white/90 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 shadow text-zinc-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800"
                                    title="Previous illustration"
                                    aria-label="Previous illustration"
                                >
                                    <ChevronLeft size={22} />
                                </button>
                            )}
                            <div className="relative group max-w-full flex items-center justify-center">
                                <img
                                    src={viewerImage!.startsWith('http') ? viewerImage! : `data:image/png;base64,${viewerImage}`}
                                    alt={promptName(viewerPrompt) || 'Generated illustration'}
                                    draggable={false}
                                    className="max-h-[calc(100dvh-14rem)] max-w-full object-contain rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                                />
                                <button
                                    onClick={handleDownloadImage}
                                    className="absolute bottom-4 right-4 bg-zinc-900/80 hover:bg-zinc-900 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                                    title="Download image"
                                >
                                    <Download size={20} />
                                </button>
                            </div>
                            {viewerIndex >= 0 && viewerIndex < illustrations.length - 1 && (
                                <button
                                    onClick={showNext}
                                    className="absolute right-0 z-10 p-2 rounded-full bg-white/90 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 shadow text-zinc-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800"
                                    title="Next illustration"
                                    aria-label="Next illustration"
                                >
                                    <ChevronRight size={22} />
                                </button>
                            )}
                        </div>
                        <div className="shrink-0 space-y-1 max-w-xl">
                            <p className="text-sm font-medium">
                                {promptName(viewerPrompt)}
                                {viewerIndex >= 0 && illustrations.length > 1 && (
                                    <span className="ml-2 text-xs font-normal opacity-40">{viewerIndex + 1} of {illustrations.length}</span>
                                )}
                            </p>
                            {viewerPrompt && (
                                <p className="text-xs opacity-50 italic line-clamp-2" title={viewerPrompt}>
                                    {viewerPrompt.split('\n').slice(1).join(' ').trim() || viewerPrompt}
                                </p>
                            )}
                            <button
                                onClick={closeViewer}
                                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline"
                            >
                                Back to Gallery
                            </button>
                        </div>
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
                    <div className={`w-full space-y-5 ${illustrations.length === 0 && !pendingIllustrations.length && !illustrationSuggestions.length ? 'flex-1 flex flex-col items-center justify-center' : ''}`}>
                        {(illustrations.length > 0 || pendingIllustrations.length > 0) && (
                            <div className="space-y-2">
                                <h3 className="text-xs font-semibold uppercase tracking-wider opacity-40 text-left px-1">Gallery</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 w-full">
                                {pendingIllustrations.map(p => p.error ? (
                                    <div
                                        key={p.id}
                                        className="relative rounded-lg border border-red-200 dark:border-red-900 overflow-hidden flex flex-col"
                                    >
                                        <button
                                            onClick={() => dismissPendingIllustration(p.id)}
                                            className="absolute top-1.5 right-1.5 p-1 rounded text-red-400 hover:text-red-600 dark:hover:text-red-300"
                                            title="Dismiss"
                                            aria-label="Dismiss failed illustration"
                                        >
                                            <X size={14} />
                                        </button>
                                        <div className="aspect-square flex items-center justify-center bg-red-50 dark:bg-red-950/30 p-3">
                                            <button
                                                onClick={() => retryPendingIllustration(p.id)}
                                                className="text-xs text-red-600 dark:text-red-400 underline"
                                            >
                                                Failed — retry
                                            </button>
                                        </div>
                                        <p className="text-[11px] px-2 py-1.5 text-left line-clamp-1 text-red-600 dark:text-red-400">{promptName(p.description)}</p>
                                    </div>
                                ) : (
                                    <div
                                        key={p.id}
                                        className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden flex flex-col"
                                    >
                                        <div className="aspect-square flex items-center justify-center bg-zinc-50 dark:bg-zinc-800/50">
                                            <Loader2 size={20} className="animate-spin text-zinc-400" />
                                        </div>
                                        <p className="text-[11px] px-2 py-1.5 text-left line-clamp-1 text-zinc-500 dark:text-zinc-400 animate-pulse">{promptName(p.description)}</p>
                                    </div>
                                ))}
                                {illustrations.map(ill => (
                                    <button
                                        key={ill.id}
                                        onClick={() => setViewerId(ill.id)}
                                        className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 hover:scale-[1.02] transition-transform shadow-sm flex flex-col bg-white dark:bg-zinc-900"
                                    >
                                        <img src={ill.url} alt={promptName(ill.prompt)} className="w-full aspect-square object-cover" />
                                        <p className="text-[11px] px-2 py-1.5 text-left line-clamp-1 text-zinc-600 dark:text-zinc-300" title={ill.prompt}>
                                            {promptName(ill.prompt)}
                                        </p>
                                    </button>
                                ))}
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col items-center w-full">
                            {illustrations.length === 0 && !pendingIllustrations.length && !illustrationSuggestions.length && <ImageIcon size={32} className="mb-3 opacity-30" />}

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
              placeholder={aiTab === 'ask'
                ? (aiExchanges.length > 0 ? "Ask a follow-up question..." : "How does the protagonist feel about...?")
                : "Describe a scene or character to illustrate..."}
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
