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
  const settings = useSettingsStore();
  const reader = useReaderStore();
  const library = useLibraryStore();
  const ui = useUIStore();

  const currentBookIdRef = useRef<string | null>(null);
  const lastLoadedBookIdRef = useRef<string | null>(null);

  useEffect(() => {
    currentBookIdRef.current = library.currentBookId;
  }, [library.currentBookId]);

  const [isLoading, setIsLoading] = useState(true);
  const { user, setUser, storageProvider, setStorageProvider, handleSignIn, handleSignOut, isMockModeRef, MOCK_USER, MOCK_STORAGE } = useAuth();

  const [showAbout, setShowAbout] = useState(false);
  const [isRecomputingEnd, setIsRecomputingEnd] = useState(false);

  // Fullscreen helper
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioPlayerRef = useRef<AudioBookPlayer | null>(null);

  // Synchronizers that watch Zustand stores and sync with backend
  useSettingsSync(storageProvider, settings.onboardingCompleted);

  const {
    handleSetIsPlaying,
    navigate
  } = usePlayback(audioPlayerRef);

  useDeviceLogic({
    isPlaying: reader.isPlaying,
    isReadingAloud: reader.isReadingAloud,
    isSynthesizing: reader.isSynthesizing
  });

  const handleAskAi = async (qOverride?: string) => {
    const q = qOverride || ui.aiQuestion;
    if (!q.trim() || ui.isAiLoading) return;
    ui.setIsAiLoading(true);
    ui.setAiResponse('');
    try {
      let currentChapterIdx = 0;
      for (let i = 0; i < reader.sections.length; i++) if (reader.sections[i].startIndex <= reader.currentIndex) currentChapterIdx = i; else break;

      let context = '';
      if (ui.aiContextMode === 'recent') {
        const startIdx = currentChapterIdx > 0 ? reader.sections[currentChapterIdx - 1].startIndex : 0;
        context = reader.words.slice(startIdx, reader.currentIndex + 1).map(w => w.text).join(' ');
      } else {
        context = reader.words.slice(0, reader.currentIndex + 1).map(w => w.text).join(' ');
      }
      ui.setAiResponse(await askAboutBook(q, context));
    } catch { ui.setAiResponse('Error'); } finally { ui.setIsAiLoading(false); }
  };

  const performIllustrationGeneration = async (description: string) => {
    const context = reader.words.slice(0, reader.currentIndex + 1).map(w => w.text).join(' ');
    const prompt = await generateIllustrationPrompt(description, context);
    ui.setIllustrationPrompt(prompt);

    const base64Image = await generateIllustration(prompt);
    ui.setIllustrationImage(base64Image);

    if (library.currentBookId && storageProvider) {
      const record = await storageProvider.addIllustration(library.currentBookId, prompt, base64Image, reader.currentIndex);
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
      const context = reader.words.slice(0, reader.currentIndex + 1).map(w => w.text).join(' ');
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

  const handleSelectBook = async (id: string) => {
    library.setCurrentBookId(id);
    if (settings.autoLandscape) {
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
    handleUpdateBookTitle,
    handleUpdateBookFinishedDate,
    handleFileUpload,
    handleLoadDemoBook,
    handleDeleteBook,
    handleToggleArchive,
    refreshSessions
  } = useLibrary(storageProvider, library.currentBookId, handleSelectBook);

  useReadingSession(storageProvider);

  const handleRecomputeRealEnd = async () => {
    if (!library.currentBookId || !storageProvider || !settings.geminiApiKey) return;
    setIsRecomputingEnd(true);
    try {
      const result = await analyzeRealEndOfBook(
        library.currentBookId,
        reader.sections.map(s => s.label),
        reader.words,
        storageProvider
      );
      if (result !== null) {
        reader.setRealEndIndex(result);
        library.setLibrary(await storageProvider.getAllBooks());
      }
    } catch (err) {
      console.error("Failed to recompute real end:", err);
    } finally {
      setIsRecomputingEnd(false);
    }
  };

  const handleClearFutureSessions = async () => {
    if (!library.currentBookId || !storageProvider) return;
    try {
      await storageProvider.clearFutureSessions(library.currentBookId, reader.currentIndex);
      reader.setFurthestIndex(reader.currentIndex);
      await refreshSessions();
      library.setLibrary(await storageProvider.getAllBooks());
    } catch (err) {
      console.error("Failed to clear future sessions:", err);
    }
  };

  const handleClearRecentSessions = async () => {
    if (!library.currentBookId || !storageProvider) return;
    try {
      await storageProvider.deleteRecentSessions(library.currentBookId, 1);
      await refreshSessions();
      library.setLibrary(await storageProvider.getAllBooks());
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
        library.setLibrary([]);
        library.setCurrentBookId(null);
        setIsLoading(false);
        return;
      }

      const processedWords = mockWords.map((w: any) => ({
        text: w.text,
        isParagraphStart: typeof w.isParagraphStart === 'boolean' ? w.isParagraphStart : (w.paragraphIndex === 0 && w.sentenceIndex === 0),
        isSentenceStart: typeof w.isSentenceStart === 'boolean' ? w.isSentenceStart : w.sentenceIndex === 0
      }));

      reader.setWords(processedWords);
      reader.setSections(mockSections || [{ label: 'Mock Chapter', startIndex: 0 }]);
      if (mockSessions) library.setSessions(mockSessions);
      reader.setCurrentIndex(0);
      library.setCurrentBookId('mock');
      handleSetIsPlaying(false);
      setUser((u: any) => u || (MOCK_USER as any));
      setStorageProvider((p: any) => p || (MOCK_STORAGE as any));
      setIsLoading(false);
    };

    (window as any).__setWpm = (newWpm: number) => {
      settings.setWpm(newWpm);
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
      library.setLibrary(mockBooks);
      setIsLoading(false);
      library.setCurrentBookId(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Initialize Player
  useEffect(() => {
    if (storageProvider) {
      audioPlayerRef.current = new AudioBookPlayer(storageProvider, settings.geminiApiKey, settings.deepgramApiKey);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageProvider]);

  // Update API Keys
  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.updateGeminiApiKey(settings.geminiApiKey);
      audioPlayerRef.current.updateDeepgramApiKey(settings.deepgramApiKey);
    }
  }, [settings.geminiApiKey, settings.deepgramApiKey]);


  // --- Load Data ---
  useEffect(() => {
    if (!storageProvider) return;

    const init = async () => {
      // Keep loading true while fetching initial data
      try {
        const s = await storageProvider.getSettings();
        if (s) {
          if (s.syncApiKey !== undefined) settings.setSyncApiKey(s.syncApiKey);

          // Only load API key from Firestore if syncing is enabled
          if (s.syncApiKey !== false) {
            if (s.geminiApiKey) {
              settings.setGeminiApiKey(s.geminiApiKey);
            }
            if (s.deepgramApiKey) {
              settings.setDeepgramApiKey(s.deepgramApiKey);
            }
          }
          if (s.theme) settings.setTheme(s.theme as any);
          if (s.fontFamily) settings.setFontFamily(s.fontFamily as any);
          if (s.ttsSpeed) settings.setTtsSpeed(s.ttsSpeed);
          if (s.autoLandscape !== undefined) settings.setAutoLandscape(s.autoLandscape);
          if (s.rsvp) settings.setRsvpSettings({ ...settings.rsvpSettings, ...s.rsvp });
          if (s.readingMode) settings.setReadingMode(s.readingMode);
          if (s.paginatedFontSize) settings.setPaginatedFontSize(s.paginatedFontSize);

          if (s.onboardingCompleted) {
            settings.setOnboardingCompleted(true);
          } else if (!settings.onboardingCompleted) {
            // Show onboarding if not completed and no API key set
            if (!s.geminiApiKey) {
              ui.setIsOnboardingOpen(true);
            }
          }
        } else if (!settings.onboardingCompleted) {
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
    if (library.currentBookId && storageProvider) {
      await storageProvider.updateBookProgress(library.currentBookId, reader.currentIndex);
      library.setLibrary(await storageProvider.getAllBooks());
    }
    reader.setWords([]); reader.setSections([]); reader.setCurrentIndex(0); reader.setBookTitle('');
    library.setCurrentBookId(null); lastLoadedBookIdRef.current = null;
    reader.setRealEndIndex(null); reader.setFurthestIndex(null);

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
      reader.setBookTitle(result.title);
      reader.setWords(result.words);
      reader.setSections(result.sections);
      reader.setCurrentIndex(result.wordIndex);

      let targetWpm = Math.round(result.wpm);
      // Sanity check to recover from corrupted data
      if (targetWpm > 1200 || targetWpm < 100) {
        targetWpm = 300;
      }
      if (targetWpm !== result.wpm) {
        storageProvider.updateBookWpm(bookRecord.id, targetWpm).catch(e => console.error("Failed to recover WPM:", e));
      }
      settings.setWpm(targetWpm);

      reader.setRealEndIndex(result.realEndIndex);
      reader.setFurthestIndex(bookRecord.progress.furthestWordIndex ?? bookRecord.progress.wordIndex);

      if (result.realEndQuote) {
        // Just to update the local library state if needed
        library.setLibrary(prev => prev.map(b => b.id === bookRecord.id ? { ...b, analysis: { ...b.analysis, realEndQuote: result.realEndQuote } } : b));
      }

      // Background AI analysis if real end is unknown
      if (result.realEndIndex === null && settings.geminiApiKey) {
        analyzeRealEndOfBook(
          bookRecord.id,
          result.sections.map(s => s.label),
          result.words,
          storageProvider
        ).then(newIndex => {
          if (newIndex !== null && currentBookIdRef.current === bookRecord.id) {
            reader.setRealEndIndex(newIndex);
            library.setLibrary(prev => prev.map(b => b.id === bookRecord.id ? {
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
      library.setCurrentBookId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageProvider, settings.geminiApiKey]);

  useEffect(() => {
    if (library.currentBookId && library.currentBookId !== 'mock' && storageProvider) {
      if (library.currentBookId === lastLoadedBookIdRef.current) {
        // Book already loaded, don't re-process to avoid resetting currentIndex
        return;
      }
      setIsLoading(true);
      const record = library.library.find(b => b.id === library.currentBookId);
      if (record) handleProcessBook(record).then(() => setIsLoading(false));
      else storageProvider.getBook(library.currentBookId).then((f: any) => {
        if (f) handleProcessBook(f).then(() => setIsLoading(false));
        else { library.setCurrentBookId(null); setIsLoading(false); }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.currentBookId, handleProcessBook, storageProvider]);

  useEffect(() => {
    if (!reader.isPlaying && library.currentBookId && storageProvider) {
      storageProvider.updateBookProgress(library.currentBookId, reader.currentIndex);
    }
    if (reader.furthestIndex !== null && reader.currentIndex > reader.furthestIndex) {
      reader.setFurthestIndex(reader.currentIndex);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader.isPlaying, reader.currentIndex, library.currentBookId, storageProvider, reader.furthestIndex]);



  if (user === undefined || (storageProvider && isLoading) || library.isLoadingLibrary) {
    return (
      <div className={`flex flex-col items-center justify-center min-h-dvh ${settings.theme === 'bedtime' ? 'bg-black text-stone-400' : 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100'}`}>
        <div className="animate-pulse flex flex-col items-center">
          <BookOpen size={48} className="mb-4 opacity-20" />
          <p className="text-sm font-light opacity-50 tracking-widest uppercase">Loading</p>
        </div>
      </div>
    );
  }

  if (user === null || !storageProvider) {
    return (
      <div className={`min-h-dvh flex flex-col ${settings.theme === 'bedtime' ? 'bg-black text-stone-400' : 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100'}`}>
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
    return <AboutView onBack={() => setShowAbout(false)} theme={settings.theme} />;
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
        defaultSpeed={settings.ttsSpeed}
      />

      <ConsoleLogger />
    </>
  );
}

export default App;