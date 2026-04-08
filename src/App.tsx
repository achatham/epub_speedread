import React, { useState, useEffect, useRef, useCallback } from 'react';

import { type BookRecord } from './utils/storage';
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
import { useSettingsSync } from './hooks/useSettings';
import { useLibrary } from './hooks/useLibrary';
import { usePlayback } from './hooks/usePlayback';
import { useReadingSession } from './hooks/useReadingSession';

import { useSettingsStore } from './stores/useSettingsStore';
import { useReaderStore } from './stores/useReaderStore';
import { useLibraryStore } from './stores/useLibraryStore';
import { useUIStore } from './stores/useUIStore';

function App() {
  // Settings Store
  const onboardingCompleted = useSettingsStore(state => state.onboardingCompleted);
  const theme = useSettingsStore(state => state.theme);
  const geminiApiKey = useSettingsStore(state => state.geminiApiKey);
  const deepgramApiKey = useSettingsStore(state => state.deepgramApiKey);
  const lastBookId = useSettingsStore(state => state.lastBookId);
  const ttsSpeed = useSettingsStore(state => state.ttsSpeed);
  const rsvpSettings = useSettingsStore(state => state.rsvpSettings);
  
  const setOnboardingCompleted = useSettingsStore(state => state.setOnboardingCompleted);
  const setTheme = useSettingsStore(state => state.setTheme);
  const setAutoLandscape = useSettingsStore(state => state.setAutoLandscape);
  const setGeminiApiKey = useSettingsStore(state => state.setGeminiApiKey);
  const setDeepgramApiKey = useSettingsStore(state => state.setDeepgramApiKey);
  const setLastBookId = useSettingsStore(state => state.setLastBookId);
  const setWpm = useSettingsStore(state => state.setWpm);
  const setTtsSpeed = useSettingsStore(state => state.setTtsSpeed);
  const setSyncApiKey = useSettingsStore(state => state.setSyncApiKey);
  const setFontFamily = useSettingsStore(state => state.setFontFamily);
  const setRsvpSettings = useSettingsStore(state => state.setRsvpSettings);
  const setPaginatedFontSize = useSettingsStore(state => state.setPaginatedFontSize);

  // Reader Store
  const isPlaying = useReaderStore(state => state.isPlaying);
  const isReadingAloud = useReaderStore(state => state.isReadingAloud);
  const isSynthesizing = useReaderStore(state => state.isSynthesizing);
  const currentIndex = useReaderStore(state => state.currentIndex);
  const sections = useReaderStore(state => state.sections);
  const words = useReaderStore(state => state.words);
  const furthestIndex = useReaderStore(state => state.furthestIndex);
  
  const setWords = useReaderStore(state => state.setWords);
  const setSections = useReaderStore(state => state.setSections);
  const setCurrentIndex = useReaderStore(state => state.setCurrentIndex);
  const setBookTitle = useReaderStore(state => state.setBookTitle);
  const setRealEndIndex = useReaderStore(state => state.setRealEndIndex);
  const setFurthestIndex = useReaderStore(state => state.setFurthestIndex);

  // Library Store
  const currentBookId = useLibraryStore(state => state.currentBookId);
  const isLoadingLibrary = useLibraryStore(state => state.isLoadingLibrary);
  const library = useLibraryStore(state => state.library);
  
  const setCurrentBookId = useLibraryStore(state => state.setCurrentBookId);
  const setLibrary = useLibraryStore(state => state.setLibrary);
  const setSessions = useLibraryStore(state => state.setSessions);

  // UI Store
  const ui = useUIStore(); // UI store has few updates, keeping it simple for now, but still using its fields via ui.xxx

  const currentBookIdRef = useRef<string | null>(null);
  const lastLoadedBookIdRef = useRef<string | null>(null);

  useEffect(() => {
    currentBookIdRef.current = currentBookId;
  }, [currentBookId]);

  const [isLoading, setIsLoading] = useState(true);
  const { user, setUser, storageProvider, setStorageProvider, handleSignIn, handleSignOut, isMockModeRef, MOCK_USER, MOCK_STORAGE } = useAuth();

  const [showAbout, setShowAbout] = useState(false);
  const [isRecomputingEnd, setIsRecomputingEnd] = useState(false);

  // Fullscreen helper
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioPlayerRef = useRef<AudioBookPlayer | null>(null);

  // Synchronizers that watch Zustand stores and sync with backend
  useSettingsSync(storageProvider, onboardingCompleted);

  const {
    handleSetIsPlaying,
    navigate
  } = usePlayback(audioPlayerRef);

  useDeviceLogic({
    isPlaying,
    isReadingAloud,
    isSynthesizing
  });

  const handleAskAi = async (qOverride?: string) => {
    const q = qOverride || ui.aiQuestion;
    if (!q.trim() || ui.isAiLoading) return;
    ui.setIsAiLoading(true);
    ui.setAiResponse('');
    try {
      let currentChapterIdx = 0;
      for (let i = 0; i < sections.length; i++) if (sections[i].startIndex <= currentIndex) currentChapterIdx = i; else break;

      let context = '';
      if (ui.aiContextMode === 'recent') {
        const startIdx = currentChapterIdx > 0 ? sections[currentChapterIdx - 1].startIndex : 0;
        context = words.slice(startIdx, currentIndex + 1).map(w => w.text).join(' ');
      } else {
        context = words.slice(0, currentIndex + 1).map(w => w.text).join(' ');
      }
      ui.setAiResponse(await askAboutBook(q, context));
    } catch { ui.setAiResponse('Error'); } finally { ui.setIsAiLoading(false); }
  };

  const performIllustrationGeneration = async (description: string) => {
    const context = words.slice(0, currentIndex + 1).map(w => w.text).join(' ');
    const prompt = await generateIllustrationPrompt(description, context);
    ui.setIllustrationPrompt(prompt);

    const base64Image = await generateIllustration(prompt);
    ui.setIllustrationImage(base64Image);

    if (currentBookId && storageProvider) {
      const record = await storageProvider.addIllustration(currentBookId, prompt, base64Image, currentIndex);
      ui.setIllustrations(prev => [record, ...prev]);
    }
  };

  const handleGenerateIllustration = async (descriptionOverride?: string) => {
    const description = descriptionOverride || ui.illustrationQuery;
    if (!description.trim() || ui.isIllustrationLoading) return;
    ui.setIsIllustrationLoading(true);
    ui.setIllustrationPrompt('');
    ui.setIllustrationImage(null);

    try {
      await performIllustrationGeneration(description);
    } catch (err) {
      console.error("Illustration generation failed:", err);
      ui.setIllustrationPrompt("Error generating illustration.");
    } finally {
      ui.setIsIllustrationLoading(false);
    }
  };

  const handleSuggestIllustrations = async () => {
    if (ui.isSuggesting) return;
    ui.setIsSuggesting(true);
    ui.setIllustrationSuggestions([]);
    ui.setSelectedSuggestions([]);
    try {
      const context = words.slice(0, currentIndex + 1).map(w => w.text).join(' ');
      const suggestions = await suggestIllustrations(context, ui.illustrations.map(i => i.prompt.split('\n')[0]));
      ui.setIllustrationSuggestions(suggestions);
      ui.setSelectedSuggestions(suggestions);
    } catch (err) {
      console.error("Failed to suggest illustrations:", err);
    } finally {
      ui.setIsSuggesting(false);
    }
  };

  const handleGenerateMultipleIllustrations = async () => {
    if (ui.selectedSuggestions.length === 0 || ui.isIllustrationLoading) return;
    const toGenerate = [...ui.selectedSuggestions];
    ui.setIllustrationSuggestions([]);
    ui.setSelectedSuggestions([]);

    ui.setIsIllustrationLoading(true);
    try {
      for (const suggestion of toGenerate) {
        ui.setIllustrationPrompt('');
        ui.setIllustrationImage(null);
        await performIllustrationGeneration(suggestion);
      }
    } catch (err) {
      console.error("Multiple illustration generation failed:", err);
    } finally {
      ui.setIsIllustrationLoading(false);
    }
  };

  const handleSelectBook = useCallback(async (id: string) => {
    useLibraryStore.getState().setCurrentBookId(id);
    useSettingsStore.getState().setLastBookId(id);
    if (useSettingsStore.getState().autoLandscape) {
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
  }, []);

  const {
    handleUpdateBookTitle,
    handleUpdateBookFinishedDate,
    handleFileUpload,
    handleLoadDemoBook,
    handleDeleteBook,
    handleToggleArchive,
    refreshSessions
  } = useLibrary(storageProvider, currentBookId, handleSelectBook, isLoading, lastBookId);

  useReadingSession(storageProvider);

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
        isSentenceStart: typeof w.isSentenceStart === 'boolean' ? w.isSentenceStart : w.sentenceIndex === 0,
        isHeading: w.isHeading
      }));

      setWords(processedWords);
      setSections(mockSections || [{ label: 'Mock Chapter', startIndex: 0 }]);
      if (mockSessions) setSessions(mockSessions);
      setCurrentIndex(0);
      setCurrentBookId('mock');
      // Note: We need a way to set reader's bookId if needed, but App.tsx uses currentBookId from library store for processing
      handleSetIsPlaying(false);
      setUser((u: any) => u || (MOCK_USER as any));
      setStorageProvider((p: any) => p || (MOCK_STORAGE as any));
      (window as any).MOCK_STORAGE = MOCK_STORAGE;
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
      provider._setMockBooks(mockBooks);
      setUser(MOCK_USER as any);
      setStorageProvider(provider);
      setLibrary(mockBooks);
      setIsLoading(false);
      setCurrentBookId(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Initialize Player
  useEffect(() => {
    if (storageProvider) {
      audioPlayerRef.current = new AudioBookPlayer(storageProvider, geminiApiKey, deepgramApiKey);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const s = await storageProvider.getSettings();
        if (s) {
          if (s.syncApiKey !== undefined) setSyncApiKey(s.syncApiKey);

          // Only load API key from Firestore if syncing is enabled
          if (s.syncApiKey !== false) {
            if (s.geminiApiKey) {
              setGeminiApiKey(s.geminiApiKey);
            }
            if (s.deepgramApiKey) {
              setDeepgramApiKey(s.deepgramApiKey);
            }
          }
          if (s.theme) setTheme(s.theme as any);
          if (s.fontFamily) setFontFamily(s.fontFamily as any);
          if (s.ttsSpeed) setTtsSpeed(s.ttsSpeed);
          if (s.autoLandscape !== undefined) setAutoLandscape(s.autoLandscape);
          if (s.rsvp) setRsvpSettings({ ...rsvpSettings, ...s.rsvp });
          if (s.paginatedFontSize) setPaginatedFontSize(s.paginatedFontSize);
          if (s.lastBookId !== undefined) setLastBookId(s.lastBookId);

          if (s.onboardingCompleted) {
            setOnboardingCompleted(true);
          } else if (!onboardingCompleted) {
            // Show onboarding if not completed and no API key set
            if (!s.geminiApiKey) {
              ui.setIsOnboardingOpen(true);
            }
          }
        } else if (!onboardingCompleted) {
          // New user (no settings doc yet) and not marked as completed locally
          ui.setIsOnboardingOpen(true);
        }
      } catch (err) {
        console.error('Failed to load settings', err);
        // Don't show onboarding on error if we haven't confirmed it's needed
      }
      setIsLoading(false);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageProvider]);



  const onFileInputClick = (e: React.MouseEvent<HTMLInputElement>) => { (e.target as HTMLInputElement).value = ''; };

  const handleCloseBook = async () => {
    handleSetIsPlaying(false);
    if (currentBookId && storageProvider) {
      await storageProvider.updateBookProgress(currentBookId, currentIndex);
      setLibrary(await storageProvider.getAllBooks());
    }
    setWords([]); setSections([]); setCurrentIndex(0); setBookTitle('');
    setCurrentBookId(null); lastLoadedBookIdRef.current = null;
    setLastBookId(null);
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
      ui.setIllustrations(illusts);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBookId, handleProcessBook, storageProvider]);

  useEffect(() => {
    if (!isPlaying && currentBookId && storageProvider) {
      storageProvider.updateBookProgress(currentBookId, currentIndex);
    }
    if (furthestIndex !== null && currentIndex > furthestIndex) {
      setFurthestIndex(currentIndex);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentIndex, currentBookId, storageProvider, furthestIndex]);



  if (user === undefined || (storageProvider && isLoading) || isLoadingLibrary) {
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
        user={user}
        handleSignIn={handleSignIn}
        handleSignOut={handleSignOut}
        storageProvider={storageProvider}
        handleAskAi={handleAskAi}
        isAiLoading={ui.isAiLoading}
        isIllustrationLoading={ui.isIllustrationLoading}
        handleGenerateIllustration={handleGenerateIllustration}
        isSuggesting={ui.isSuggesting}
        handleSuggestIllustrations={handleSuggestIllustrations}
        handleGenerateMultipleIllustrations={handleGenerateMultipleIllustrations}
        handleUpdateBookFinishedDate={handleUpdateBookFinishedDate}
        handleUpdateBookTitle={handleUpdateBookTitle}
        handleRecomputeRealEnd={handleRecomputeRealEnd}
        isRecomputingEnd={isRecomputingEnd}
        onClearFutureSessions={handleClearFutureSessions}
        onClearRecentSessions={handleClearRecentSessions}
      />

      <AuthenticatedApp
        fileInputRef={fileInputRef}
        onFileInputClick={onFileInputClick}
        handleSelectBook={handleSelectBook}
        handleToggleArchive={handleToggleArchive}
        handleDeleteBook={handleDeleteBook}
        handleFileUpload={handleFileUpload}
        handleLoadDemoBook={handleLoadDemoBook}
        handleCloseBook={handleCloseBook}
        navigate={navigate}
        setShowAbout={setShowAbout}
        storageProvider={storageProvider}
        audioPlayerRef={audioPlayerRef}
        handleSetIsPlaying={handleSetIsPlaying}
      />

      <TtsDebug
        isOpen={ui.isTtsDebugOpen}
        onClose={() => ui.setIsTtsDebugOpen(false)}
        defaultSpeed={ttsSpeed}
      />

      <ConsoleLogger />
    </>
  );
}

export default App;