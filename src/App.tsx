import React, { useState, useEffect, useRef, useCallback } from 'react';

import { type BookRecord, type IllustrationRecord } from './utils/storage';
import { processBook, analyzeRealEndOfBook } from './utils/ebook';
import { AudioBookPlayer } from './utils/AudioBookPlayer';
import { AuthenticatedApp } from './components/AuthenticatedApp';
import { AboutView, AboutContent } from './components/AboutView';
import { ConsoleLogger } from './components/ConsoleLogger';
import { TtsDebug } from './components/TtsDebug';
import { AppModals } from './components/AppModals';
import { LogIn, BookOpen } from 'lucide-react';
import { askAboutBook, generateIllustrationPrompt, generateIllustration, suggestIllustrations } from './utils/gemini';
import { useDeviceLogic } from './hooks/useDeviceLogic';
import { useAuth } from './hooks/useAuth';
import { useSettings, type Theme, type FontFamily } from './hooks/useSettings';
import { useLibrary } from './hooks/useLibrary';
import { usePlayback } from './hooks/usePlayback';
import { useReadingSession } from './hooks/useReadingSession';
import type { WordData } from './utils/text-processing';

function App() {
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const currentBookIdRef = useRef<string | null>(null);
  const lastLoadedBookIdRef = useRef<string | null>(null);

  useEffect(() => {
    currentBookIdRef.current = currentBookId;
  }, [currentBookId]);
  const [isLoading, setIsLoading] = useState(true);
  const { user, setUser, storageProvider, setStorageProvider, handleSignIn, handleSignOut, isMockModeRef, MOCK_USER, MOCK_STORAGE } = useAuth();

  const [words, setWords] = useState<WordData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [wpm, setWpm] = useState(300);
  const [bookTitle, setBookTitle] = useState('');
  const [sections, setSections] = useState<{ label: string; startIndex: number }[]>([]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAskAiOpen, setIsAskAiOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isTtsDebugOpen, setIsTtsDebugOpen] = useState(false);

  const [realEndIndex, setRealEndIndex] = useState<number | null>(null);
  const [furthestIndex, setFurthestIndex] = useState<number | null>(null);
  const [illustrations, setIllustrations] = useState<IllustrationRecord[]>([]);
  const [aiTab, setAiTab] = useState<'ask' | 'illustrate'>('ask');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiContextMode, setAiContextMode] = useState<'recent' | 'full'>('recent');
  const [illustrationQuery, setIllustrationQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [illustrationPrompt, setIllustrationPrompt] = useState('');
  const [illustrationImage, setIllustrationImage] = useState<string | null>(null);
  const [isIllustrationLoading, setIsIllustrationLoading] = useState(false);
  const [illustrationSuggestions, setIllustrationSuggestions] = useState<string[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  const [showAbout, setShowAbout] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(() => {
    try {
      const saved = localStorage.getItem('user_settings');
      if (saved) return !!JSON.parse(saved).onboardingCompleted;
    } catch { }
    return false;
  });

  const {
    ttsSpeed, setTtsSpeed,
    geminiApiKey, setGeminiApiKey,
    deepgramApiKey, setDeepgramApiKey,
    syncApiKey, setSyncApiKey,
    autoLandscape, setAutoLandscape,
    theme, setTheme, toggleTheme,
    fontFamily, setFontFamily,
    rsvpSettings, setRsvpSettings,
    readingMode, setReadingMode,
    paginatedFontSize, setPaginatedFontSize
  } = useSettings(storageProvider, onboardingCompleted);
  const saveGeminiApiKey = (k: string) => {
    setGeminiApiKey(k);
    if (storageProvider) {
      storageProvider.updateSettings({ geminiApiKey: k }).catch(console.error);
    }
  };

  const [isBookSettingsOpen, setIsBookSettingsOpen] = useState(false);
  const [isRecomputingEnd, setIsRecomputingEnd] = useState(false);

  // Fullscreen helper
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioPlayerRef = useRef<AudioBookPlayer | null>(null);

  const {
    isPlaying,
    handleSetIsPlaying,
    navigate,
    isChapterBreak,
    isHoldPaused,
    setIsHoldPaused
  } = usePlayback(
    words,
    sections,
    wpm,
    rsvpSettings,
    autoLandscape,
    isReadingAloud,
    setIsReadingAloud,
    audioPlayerRef,
    currentIndex,
    setCurrentIndex
  );

  useDeviceLogic({
    isPlaying,
    isReadingAloud,
    isSynthesizing
  });

  const handleAskAi = async (qOverride?: string) => {
    const q = qOverride || aiQuestion;
    if (!q.trim() || isAiLoading) return;
    setIsAiLoading(true);
    setAiResponse('');
    try {
      let currentChapterIdx = 0;
      for (let i = 0; i < sections.length; i++) if (sections[i].startIndex <= currentIndex) currentChapterIdx = i; else break;

      let context = '';
      if (aiContextMode === 'recent') {
        const startIdx = currentChapterIdx > 0 ? sections[currentChapterIdx - 1].startIndex : 0;
        context = words.slice(startIdx, currentIndex + 1).map(w => w.text).join(' ');
      } else {
        context = words.slice(0, currentIndex + 1).map(w => w.text).join(' ');
      }
      setAiResponse(await askAboutBook(q, context));
    } catch { setAiResponse('Error'); } finally { setIsAiLoading(false); }
  };

  const performIllustrationGeneration = async (description: string) => {
    const context = words.slice(0, currentIndex + 1).map(w => w.text).join(' ');
    const prompt = await generateIllustrationPrompt(description, context);
    setIllustrationPrompt(prompt);

    const base64Image = await generateIllustration(prompt);
    setIllustrationImage(base64Image);

    if (currentBookId && storageProvider) {
      const record = await storageProvider.addIllustration(currentBookId, prompt, base64Image, currentIndex);
      setIllustrations(prev => [record, ...prev]);
    }
  };

  const handleGenerateIllustration = async (descriptionOverride?: string) => {
    const description = descriptionOverride || illustrationQuery;
    if (!description.trim() || isIllustrationLoading) return;
    setIsIllustrationLoading(true);
    setIllustrationPrompt('');
    setIllustrationImage(null);

    try {
      await performIllustrationGeneration(description);
    } catch (err) {
      console.error("Illustration generation failed:", err);
      setIllustrationPrompt("Error generating illustration.");
    } finally {
      setIsIllustrationLoading(false);
    }
  };

  const handleSuggestIllustrations = async () => {
    if (isSuggesting) return;
    setIsSuggesting(true);
    setIllustrationSuggestions([]);
    setSelectedSuggestions([]);
    try {
      const context = words.slice(0, currentIndex + 1).map(w => w.text).join(' ');
      const suggestions = await suggestIllustrations(context, illustrations.map(i => i.prompt.split('\n')[0]));
      setIllustrationSuggestions(suggestions);
      setSelectedSuggestions(suggestions);
    } catch (err) {
      console.error("Failed to suggest illustrations:", err);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleGenerateMultipleIllustrations = async () => {
    if (selectedSuggestions.length === 0 || isIllustrationLoading) return;
    const toGenerate = [...selectedSuggestions];
    setIllustrationSuggestions([]);
    setSelectedSuggestions([]);

    setIsIllustrationLoading(true);
    try {
      for (const suggestion of toGenerate) {
        setIllustrationPrompt('');
        setIllustrationImage(null);
        await performIllustrationGeneration(suggestion);
      }
    } catch (err) {
      console.error("Multiple illustration generation failed:", err);
    } finally {
      setIsIllustrationLoading(false);
    }
  };

  const handleSelectBook = async (id: string) => {
    setCurrentBookId(id);
    if (autoLandscape) {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
          if ((screen.orientation as any)?.lock) {
            (screen.orientation as any).lock('landscape').catch((e: any) => console.warn('Orientation lock failed', e));
          }
        }).catch(e => console.warn('Fullscreen failed via gesture', e));
      } else {
        if ((screen.orientation as any)?.lock) {
          (screen.orientation as any).lock('landscape').catch((e: any) => console.warn('Orientation lock failed', e));
        }
      }
    }
  };

  const {
    library,
    setLibrary,
    sessions,
    setSessions,
    isLoadingLibrary,
    handleUpdateBookTitle,
    handleUpdateBookFinishedDate,
    handleFileUpload,
    handleLoadDemoBook,
    handleDeleteBook,
    handleToggleArchive,
    refreshSessions
  } = useLibrary(storageProvider, currentBookId, handleSelectBook);

  useReadingSession(
    storageProvider,
    isPlaying,
    isHoldPaused,
    isChapterBreak,
    currentBookId,
    currentIndex,
    words,
    bookTitle,
    rsvpSettings,
    library,
    setLibrary,
    setSessions,
    wpm
  );

  const handleRecomputeRealEnd = async () => {
    if (!currentBookId || !storageProvider || !geminiApiKey) return;
    setIsRecomputingEnd(true);
    try {
      const result = await analyzeRealEndOfBook(
        currentBookId,
        sections.map(s => s.label),
        words,
        storageProvider
      );
      if (result !== null) {
        setRealEndIndex(result);
        setLibrary(await storageProvider.getAllBooks());
      }
    } catch (err) {
      console.error("Failed to recompute real end:", err);
    } finally {
      setIsRecomputingEnd(false);
    }
  };

  const handleClearFutureSessions = async () => {
    if (!currentBookId || !storageProvider) return;
    try {
      await storageProvider.clearFutureSessions(currentBookId, currentIndex);
      setFurthestIndex(currentIndex);
      await refreshSessions();
      setLibrary(await storageProvider.getAllBooks());
    } catch (err) {
      console.error("Failed to clear future sessions:", err);
    }
  };

  const handleClearRecentSessions = async () => {
    if (!currentBookId || !storageProvider) return;
    try {
      await storageProvider.deleteRecentSessions(currentBookId, 1);
      await refreshSessions();
      setLibrary(await storageProvider.getAllBooks());
    } catch (err) {
      console.error("Failed to clear recent sessions:", err);
    }
  };



  // Test Hook for Playwright
  useEffect(() => {
    (window as any).__loadMockWords = (mockWords: any[], mockSections?: any[], mockSessions?: any[]) => {
      isMockModeRef.current = true;
      if (mockWords === null) {
        // Special case: Simulate logged-in Library View with empty library
        setUser(u => u || (MOCK_USER as any));
        setStorageProvider(p => p || (MOCK_STORAGE as any));
        setLibrary([]);
        setCurrentBookId(null);
        setIsLoading(false);
        return;
      }

      const processedWords = mockWords.map((w: any) => ({
        text: w.text,
        isParagraphStart: typeof w.isParagraphStart === 'boolean' ? w.isParagraphStart : (w.paragraphIndex === 0 && w.sentenceIndex === 0),
        isSentenceStart: typeof w.isSentenceStart === 'boolean' ? w.isSentenceStart : w.sentenceIndex === 0
      }));

      setWords(processedWords);
      setSections(mockSections || [{ label: 'Mock Chapter', startIndex: 0 }]);
      if (mockSessions) setSessions(mockSessions);
      setCurrentIndex(0);
      setCurrentBookId('mock');
      handleSetIsPlaying(false);
      setUser((u: any) => u || (MOCK_USER as any));
      setStorageProvider((p: any) => p || (MOCK_STORAGE as any));
      setIsLoading(false);
    };

    (window as any).__setWpm = (newWpm: number) => {
      setWpm(newWpm);
    };

    (window as any).__setMockSettings = () => {
      MOCK_STORAGE.updateSettings();
    };

    (window as any).__setLibrary = (mockBooks: BookRecord[]) => {
      isMockModeRef.current = true;
      const provider = { ...MOCK_STORAGE } as any;
      provider.getAllBooks = async () => mockBooks;
      setUser(MOCK_USER as any);
      setStorageProvider(provider);
      setLibrary(mockBooks);
      setIsLoading(false);
      setCurrentBookId(null);
    };
  }, []);



  // Initialize Player
  useEffect(() => {
    if (storageProvider) {
      audioPlayerRef.current = new AudioBookPlayer(storageProvider, geminiApiKey, deepgramApiKey);
    }
  }, [storageProvider]);

  // Update API Keys
  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.updateGeminiApiKey(geminiApiKey);
      audioPlayerRef.current.updateDeepgramApiKey(deepgramApiKey);
    }
  }, [geminiApiKey, deepgramApiKey]);



  // --- Load Data ---
  useEffect(() => {
    if (!storageProvider) return;

    const init = async () => {
      // Keep loading true while fetching initial data
      try {
        const settings = await storageProvider.getSettings();
        if (settings) {
          if (settings.syncApiKey !== undefined) setSyncApiKey(settings.syncApiKey);

          // Only load API key from Firestore if syncing is enabled
          if (settings.syncApiKey !== false) {
            if (settings.geminiApiKey) {
              setGeminiApiKey(settings.geminiApiKey);
            }
            if (settings.deepgramApiKey) {
              setDeepgramApiKey(settings.deepgramApiKey);
            }
          }
          if (settings.theme) setTheme(settings.theme as Theme);
          if (settings.fontFamily) setFontFamily(settings.fontFamily as FontFamily);
          if (settings.ttsSpeed) setTtsSpeed(settings.ttsSpeed);
          if (settings.autoLandscape !== undefined) setAutoLandscape(settings.autoLandscape);
          if (settings.rsvp) setRsvpSettings(prev => ({ ...prev, ...settings.rsvp }));
          if (settings.readingMode) setReadingMode(settings.readingMode);
          if (settings.paginatedFontSize) setPaginatedFontSize(settings.paginatedFontSize);

          if (settings.onboardingCompleted) {
            setOnboardingCompleted(true);
          } else if (!onboardingCompleted) {
            // Show onboarding if not completed and no API key set
            if (!settings.geminiApiKey) {
              setIsOnboardingOpen(true);
            }
          }
        } else if (!onboardingCompleted) {
          // New user (no settings doc yet) and not marked as completed locally
          setIsOnboardingOpen(true);
        }
      } catch (err) {
        console.error('Failed to load settings', err);
        // Don't show onboarding on error if we haven't confirmed it's needed
      }
      setIsLoading(false);
    };
    init();
  }, [storageProvider]);



  const handleOpenStats = async () => {
    await refreshSessions();
    setIsStatsOpen(true);
  };

  const onFileInputClick = (e: React.MouseEvent<HTMLInputElement>) => { (e.target as HTMLInputElement).value = ''; };

  const handleCloseBook = async () => {
    handleSetIsPlaying(false);
    if (currentBookId && storageProvider) {
      await storageProvider.updateBookProgress(currentBookId, currentIndex);
      setLibrary(await storageProvider.getAllBooks());
    }
    setWords([]); setSections([]); setCurrentIndex(0); setBookTitle('');
    setCurrentBookId(null); lastLoadedBookIdRef.current = null;
    setRealEndIndex(null); setFurthestIndex(null);

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { });
    }
    if ((screen.orientation as any)?.unlock) {
      (screen.orientation as any).unlock();
    }
  };

  const handleProcessBook = useCallback(async (bookRecord: BookRecord) => {
    if (!storageProvider) return;
    try {
      const result = await processBook(bookRecord, storageProvider);

      const illusts = await storageProvider.getIllustrations(bookRecord.id);
      setIllustrations(illusts);

      lastLoadedBookIdRef.current = bookRecord.id;
      setBookTitle(result.title);
      setWords(result.words);
      setSections(result.sections);
      setCurrentIndex(result.wordIndex);

      let targetWpm = Math.round(result.wpm);
      // Sanity check to recover from corrupted data
      if (targetWpm > 1200 || targetWpm < 100) {
        targetWpm = 300;
      }
      if (targetWpm !== result.wpm) {
        storageProvider.updateBookWpm(bookRecord.id, targetWpm).catch(e => console.error("Failed to recover WPM:", e));
      }
      setWpm(targetWpm);

      setRealEndIndex(result.realEndIndex);
      setFurthestIndex(bookRecord.progress.furthestWordIndex ?? bookRecord.progress.wordIndex);

      if (result.realEndQuote) {
        // Just to update the local library state if needed
        setLibrary(prev => prev.map(b => b.id === bookRecord.id ? { ...b, analysis: { ...b.analysis, realEndQuote: result.realEndQuote } } : b));
      }

      // Background AI analysis if real end is unknown
      if (result.realEndIndex === null && geminiApiKey) {
        analyzeRealEndOfBook(
          bookRecord.id,
          result.sections.map(s => s.label),
          result.words,
          storageProvider
        ).then(newIndex => {
          if (newIndex !== null && currentBookIdRef.current === bookRecord.id) {
            setRealEndIndex(newIndex);
            setLibrary(prev => prev.map(b => b.id === bookRecord.id ? {
              ...b,
              analysis: { ...b.analysis, realEndIndex: newIndex }
            } : b));
          }
        }).catch((err: any) => {
          console.error("[App] Background real end detection failed:", err);
        });
      }
      setIsLoading(false);
    } catch (e: any) {
      console.error("Book processing failed", e);
      setCurrentBookId(null);
    }
  }, [storageProvider, geminiApiKey]);

  useEffect(() => {
    if (currentBookId && currentBookId !== 'mock' && storageProvider) {
      if (currentBookId === lastLoadedBookIdRef.current) {
        // Book already loaded, don't re-process to avoid resetting currentIndex
        return;
      }
      setIsLoading(true);
      const record = library.find(b => b.id === currentBookId);
      if (record) handleProcessBook(record).then(() => setIsLoading(false));
      else storageProvider.getBook(currentBookId).then((f: any) => {
        if (f) handleProcessBook(f).then(() => setIsLoading(false));
        else { setCurrentBookId(null); setIsLoading(false); }
      });
    }
  }, [currentBookId, handleProcessBook, library, storageProvider]);

  useEffect(() => {
    if (!isPlaying && currentBookId && storageProvider) storageProvider.updateBookProgress(currentBookId, currentIndex);
    if (furthestIndex !== null && currentIndex > furthestIndex) {
      setFurthestIndex(currentIndex);
    }
  }, [isPlaying, currentIndex, currentBookId, storageProvider, furthestIndex]);



  if (user === undefined || (storageProvider && isLoading)) {
    return (
      <div className={`flex flex-col items-center justify-center min-h-dvh ${theme === 'bedtime' ? 'bg-black text-stone-400' : 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100'}`}>
        <div className="animate-pulse flex flex-col items-center">
          <BookOpen size={48} className="mb-4 opacity-20" />
          <p className="text-sm font-light opacity-50 tracking-widest uppercase">Loading</p>
        </div>
      </div>
    );
  }

  if (user === null || !storageProvider) {
    return (
      <div className={`min-h-dvh flex flex-col ${theme === 'bedtime' ? 'bg-black text-stone-400' : 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100'}`}>
        <div className="flex flex-col items-center justify-center pt-24 pb-12 px-6">
          <h1 className="text-5xl font-light mb-8">Speed Reader</h1>
          <p className="mb-12 opacity-70 text-lg">Please sign in to access your library.</p>
          <div className="flex flex-col gap-4 w-full max-w-sm">
            <button
              onClick={handleSignIn}
              className="flex items-center justify-center gap-3 px-8 py-4 text-base font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl hover:opacity-90 transition-opacity shadow-lg"
            >
              <LogIn size={24} />
              Sign In with Google
            </button>
          </div>
        </div>

        <div className="border-t border-zinc-100 dark:border-zinc-800 pt-24">
          <AboutContent onSignIn={handleSignIn} />
        </div>
      </div>
    );
  }

  if (showAbout) {
    return <AboutView onBack={() => setShowAbout(false)} theme={theme} />;
  }

  return (
    <>
      <AppModals
        isSettingsOpen={isSettingsOpen} setIsSettingsOpen={setIsSettingsOpen}
        geminiApiKey={geminiApiKey} setGeminiApiKey={setGeminiApiKey}
        deepgramApiKey={deepgramApiKey} setDeepgramApiKey={setDeepgramApiKey}
        syncApiKey={syncApiKey} setSyncApiKey={setSyncApiKey}
        ttsSpeed={ttsSpeed} setTtsSpeed={setTtsSpeed}
        autoLandscape={autoLandscape} setAutoLandscape={setAutoLandscape}
        fontFamily={fontFamily} setFontFamily={setFontFamily}
        rsvpSettings={rsvpSettings} setRsvpSettings={setRsvpSettings}
        user={user} handleSignIn={handleSignIn} handleSignOut={handleSignOut}

        isOnboardingOpen={isOnboardingOpen} setIsOnboardingOpen={setIsOnboardingOpen}
        storageProvider={storageProvider} setOnboardingCompleted={setOnboardingCompleted}
        saveGeminiApiKey={saveGeminiApiKey}

        isAskAiOpen={isAskAiOpen} setIsAskAiOpen={setIsAskAiOpen}
        aiTab={aiTab} setAiTab={setAiTab}
        aiResponse={aiResponse} aiQuestion={aiQuestion}
        setAiQuestion={setAiQuestion}
        aiContextMode={aiContextMode} setAiContextMode={setAiContextMode}
        illustrationQuery={illustrationQuery} setIllustrationQuery={setIllustrationQuery}
        handleAskAi={handleAskAi}
        isAiLoading={isAiLoading}
        illustrationPrompt={illustrationPrompt}
        setIllustrationPrompt={setIllustrationPrompt}
        illustrationImage={illustrationImage}
        setIllustrationImage={setIllustrationImage}
        isIllustrationLoading={isIllustrationLoading}
        handleGenerateIllustration={handleGenerateIllustration}
        illustrations={illustrations}
        illustrationSuggestions={illustrationSuggestions}
        setIllustrationSuggestions={setIllustrationSuggestions}
        selectedSuggestions={selectedSuggestions}
        setSelectedSuggestions={setSelectedSuggestions}
        isSuggesting={isSuggesting}
        handleSuggestIllustrations={handleSuggestIllustrations}
        handleGenerateMultipleIllustrations={handleGenerateMultipleIllustrations}

        isStatsOpen={isStatsOpen} setIsStatsOpen={setIsStatsOpen}
        sessions={sessions} library={library} currentBookId={currentBookId}
        theme={theme} handleUpdateBookFinishedDate={handleUpdateBookFinishedDate}

        isBookSettingsOpen={isBookSettingsOpen} setIsBookSettingsOpen={setIsBookSettingsOpen}
        bookTitle={bookTitle} handleUpdateBookTitle={handleUpdateBookTitle}
        handleRecomputeRealEnd={handleRecomputeRealEnd} isRecomputingEnd={isRecomputingEnd}
        currentIndex={currentIndex} onClearFutureSessions={handleClearFutureSessions}
        onClearRecentSessions={handleClearRecentSessions}
      />

      <AuthenticatedApp
        currentBookId={currentBookId} library={library} isLoading={isLoadingLibrary} theme={theme}
        setIsSettingsOpen={setIsSettingsOpen} toggleTheme={toggleTheme} handleSelectBook={handleSelectBook}
        handleDeleteBook={handleDeleteBook} handleToggleArchive={handleToggleArchive} handleFileUpload={handleFileUpload}
        fileInputRef={fileInputRef} onFileInputClick={onFileInputClick} handleOpenStats={handleOpenStats}
        handleLoadDemoBook={handleLoadDemoBook} setShowAbout={setShowAbout} words={words} currentIndex={currentIndex}
        realEndIndex={realEndIndex} furthestIndex={furthestIndex} isPlaying={isPlaying} handleSetIsPlaying={handleSetIsPlaying}
        setIsHoldPaused={setIsHoldPaused} wpm={wpm} setWpm={setWpm} storageProvider={storageProvider}
        rsvpSettings={rsvpSettings} fontFamily={fontFamily} bookTitle={bookTitle} handleCloseBook={handleCloseBook}
        setIsBookSettingsOpen={setIsBookSettingsOpen} setAiResponse={setAiResponse} setIsAskAiOpen={setIsAskAiOpen}
        sections={sections} setCurrentIndex={setCurrentIndex} navigate={navigate} audioPlayerRef={audioPlayerRef}
        ttsSpeed={ttsSpeed} setIsSynthesizing={setIsSynthesizing} setIsReadingAloud={setIsReadingAloud}
        setSessions={setSessions} isReadingAloud={isReadingAloud} isSynthesizing={isSynthesizing} isChapterBreak={isChapterBreak}
        onTtsDebugClick={() => setIsTtsDebugOpen(true)}
        readingMode={readingMode} onReadingModeChange={setReadingMode}
        paginatedFontSize={paginatedFontSize} onPaginatedFontSizeChange={setPaginatedFontSize}
      />

      <TtsDebug
        isOpen={isTtsDebugOpen}
        onClose={() => setIsTtsDebugOpen(false)}
        defaultSpeed={ttsSpeed}
      />

      <ConsoleLogger />
    </>
  );
}

export default App;