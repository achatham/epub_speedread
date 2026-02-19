import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FirestoreStorage,
  type BookRecord,
  type ReadingSession,
  type RsvpSettings
} from './utils/storage';
import { auth, storage } from './utils/firebase';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, getRedirectResult, signOut, type User } from 'firebase/auth';
import { ref, getBytes } from 'firebase/storage';
import { type WordData, calculateRsvpInterval } from './utils/text-processing';
import { calculateNavigationTarget, type NavigationType } from './utils/navigation';
import { getResumeIndex } from './utils/playback';
import { getGeminiApiKey, setGeminiApiKey as saveGeminiApiKey, askAboutBook, summarizeRecent, summarizeWhatJustHappened } from './utils/gemini';

import { processBook, analyzeRealEndOfBook } from './utils/ebook';
import { AudioBookPlayer } from './utils/AudioBookPlayer';
import { LibraryView } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { SettingsModal, type FontFamily } from './components/SettingsModal';
import { AiModal } from './components/AiModal';
import { StatsView } from './components/StatsView';
import { AboutView, AboutContent } from './components/AboutView';
import { OnboardingModal } from './components/OnboardingModal';
import { BookSettingsModal } from './components/BookSettingsModal';
import { ConsoleLogger } from './components/ConsoleLogger';
import { AI_QUESTIONS, WPM_VANITY_RATIO, DEFAULT_RSVP_SETTINGS } from './constants';
import { LogIn, BookOpen } from 'lucide-react';
import { useDeviceLogic } from './hooks/useDeviceLogic';

type Theme = 'light' | 'dark' | 'bedtime';

const MOCK_USER = { uid: 'mock-user' };
let mockSettings: any = { onboardingCompleted: true }; // Default to completed for tests
const MOCK_STORAGE = {
  getSettings: async () => mockSettings,
  getAllBooks: async () => [],
  getSessions: async () => [],
  getAggregatedSessions: async () => [],
  updateBookProgress: async () => {},
  updateBookWpm: async () => {},
  updateSettings: async (s: any) => { mockSettings = { ...mockSettings, ...s }; },
  logReadingSession: async () => {},
  updateBookRealEndIndex: async () => {},
  updateBookRealEndQuote: async () => {},
  updateBookTotalWords: async () => {},
  updateBookArchived: async () => {},
  aggregateSessions: async () => {},
  getChapterAudio: async () => null,
  saveChapterAudio: async () => {},
  deleteBook: async () => {},
  getBook: async () => null,
};

function App() {
  const [library, setLibrary] = useState<BookRecord[]>([]);
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const currentBookIdRef = useRef<string | null>(null);
  const lastLoadedBookIdRef = useRef<string | null>(null);
  const hasAutoOpenedRef = useRef(false);

  useEffect(() => {
    currentBookIdRef.current = currentBookId;
  }, [currentBookId]);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [storageProvider, setStorageProvider] = useState<FirestoreStorage | null>(null);

  const [words, setWords] = useState<WordData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wpm, setWpm] = useState(300 * WPM_VANITY_RATIO);
  const [bookTitle, setBookTitle] = useState('');
  const [sections, setSections] = useState<{ label: string; startIndex: number }[]>([]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAskAiOpen, setIsAskAiOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [sessions, setSessions] = useState<ReadingSession[]>([]);

  const [ttsSpeed, setTtsSpeed] = useState(() => {
    try {
      const saved = localStorage.getItem('user_settings');
      if (saved) return JSON.parse(saved).ttsSpeed || 2.0;
    } catch { }
    return 2.0;
  });

  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    return getGeminiApiKey() || '';
  });

  const [syncApiKey, setSyncApiKey] = useState(true);
  const [autoLandscape, setAutoLandscape] = useState(() => {
    try {
      const saved = localStorage.getItem('user_settings');
      if (saved) return JSON.parse(saved).autoLandscape ?? true;
    } catch { }
    return true;
  });

  const [realEndIndex, setRealEndIndex] = useState<number | null>(null);
  const [furthestIndex, setFurthestIndex] = useState<number | null>(null);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isChapterBreak, setIsChapterBreak] = useState(false);
  const [playbackStartTime, setPlaybackStartTime] = useState<number | null>(null);

  const [isTocOpen, setIsTocOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(() => {
    try {
      const saved = localStorage.getItem('user_settings');
      if (saved) return !!JSON.parse(saved).onboardingCompleted;
    } catch { }
    return false;
  });

  const [isBookSettingsOpen, setIsBookSettingsOpen] = useState(false);
  const [isRecomputingEnd, setIsRecomputingEnd] = useState(false);

  const handleUpdateBookTitle = async (newTitle: string) => {
    if (!currentBookId || !storageProvider) return;
    try {
      await storageProvider.updateBookTitle(currentBookId, newTitle);
      setBookTitle(newTitle);
      // Refresh library list
      setLibrary(await storageProvider.getAllBooks());
    } catch (err) {
      console.error("Failed to update book title:", err);
    }
  };

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

  const { rotationTrigger, lastRotationTime } = useDeviceLogic({ 
    isPlaying, 
    isReadingAloud, 
    isSynthesizing 
  });

  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('user_settings');
      if (saved) {
        const theme = JSON.parse(saved).theme;
        if (theme) return theme as Theme;
      }
    } catch { }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  const [fontFamily, setFontFamily] = useState<FontFamily>('system');

  const [rsvpSettings, setRsvpSettings] = useState<RsvpSettings>(() => {
    try {
      const saved = localStorage.getItem('user_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.rsvp) return { ...DEFAULT_RSVP_SETTINGS, ...parsed.rsvp };
      }
    } catch { }
    return { ...DEFAULT_RSVP_SETTINGS };
  });

  // --- Auto-save Settings ---
  useEffect(() => {
    const settings = {
      ttsSpeed,
      autoLandscape,
      theme,
      fontFamily,
      syncApiKey,
      geminiApiKey: syncApiKey ? geminiApiKey : undefined,
      rsvp: rsvpSettings,
      onboardingCompleted
    };
    localStorage.setItem('user_settings', JSON.stringify(settings));
  }, [ttsSpeed, autoLandscape, theme, fontFamily, syncApiKey, geminiApiKey, rsvpSettings, onboardingCompleted]);

  useEffect(() => {
    if (!storageProvider) return;
    const timer = setTimeout(() => {
      storageProvider.updateSettings({
        ttsSpeed,
        autoLandscape,
        theme,
        fontFamily,
        syncApiKey,
        geminiApiKey: syncApiKey ? geminiApiKey : undefined,
        rsvp: rsvpSettings,
        onboardingCompleted
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [ttsSpeed, autoLandscape, theme, fontFamily, syncApiKey, geminiApiKey, rsvpSettings, storageProvider, onboardingCompleted]);

  // Test Hook for Playwright
  useEffect(() => {
    (window as any).__loadMockWords = (mockWords: any[], mockSections?: any[], mockSessions?: any[], initialIndex?: number) => {
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
      setCurrentIndex(initialIndex || 0);
      setCurrentBookId('mock');
      setIsPlaying(false);
      setUser(u => u || (MOCK_USER as any));
      setStorageProvider(p => p || (MOCK_STORAGE as any));
      setIsLoading(false);
    };

    (window as any).__setWpm = (newWpm: number) => {
      setWpm(newWpm * WPM_VANITY_RATIO);
    };

    (window as any).__setMockSettings = (settings: any) => {
      mockSettings = { ...mockSettings, ...settings };
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

  const timerRef = useRef<number | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  const wordsReadInSessionRef = useRef<number>(0);
  const sessionStartIndexRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const audioPlayerRef = useRef<AudioBookPlayer | null>(null);
  const isMockModeRef = useRef(false);

  // Initialize Player
  useEffect(() => {
    if (storageProvider) {
      audioPlayerRef.current = new AudioBookPlayer(storageProvider, geminiApiKey);
    }
  }, [storageProvider, geminiApiKey]);

  // Update API Key
  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.updateApiKey(geminiApiKey);
    }
  }, [geminiApiKey, audioPlayerRef]);

  // --- Auth & Storage Init ---
  useEffect(() => {
    if (!auth) {
      setIsLoading(false);
      return;
    }

    // Handle redirect result
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          console.log("Redirect sign-in successful for:", result.user.email);
        } else {
          console.log("Redirect sign-in result: null (No redirect detected or state lost)");
        }
      })
      .catch((error) => {
        console.error("Redirect sign-in error:", error);
      });

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (isMockModeRef.current) return;
      setUser(u);
      if (u) {
        const provider = new FirestoreStorage(u.uid);
        setStorageProvider(provider);
      } else {
        setStorageProvider(null);
        setLibrary([]);
        setSessions([]);
        setIsLoading(false);
      }
    });
    return unsubscribe;
  }, []);

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
          if (settings.syncApiKey !== false && settings.geminiApiKey) {
            setGeminiApiKey(settings.geminiApiKey);
            saveGeminiApiKey(settings.geminiApiKey);
          }
          if (settings.theme) setTheme(settings.theme as Theme);
          if (settings.fontFamily) setFontFamily(settings.fontFamily as FontFamily);
          if (settings.ttsSpeed) setTtsSpeed(settings.ttsSpeed);
          if (settings.autoLandscape !== undefined) setAutoLandscape(settings.autoLandscape);
          if (settings.rsvp) setRsvpSettings(prev => ({ ...prev, ...settings.rsvp }));
          
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

      try {
        const [books, history] = await Promise.all([
            storageProvider.getAllBooks(),
            storageProvider.getAggregatedSessions()
        ]);
        
        setLibrary(books);
        setSessions(history);

        // Auto-open most recent book if any, but only once per app session
        if (books.length > 0 && !currentBookId && !hasAutoOpenedRef.current) {
          const mostRecent = books[0];
          hasAutoOpenedRef.current = true;
          handleSelectBook(mostRecent.id);
        }
      } catch (err) {
        console.error('Failed to load library/history', err);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [storageProvider]);

  useEffect(() => {
    if (theme === 'dark' || theme === 'bedtime') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'bedtime' : 'light';
    setTheme(nextTheme);
    storageProvider?.updateSettings({ theme: nextTheme });
  };

  const handleOpenStats = async () => {
    if (storageProvider) {
      await storageProvider.aggregateSessions();
      setSessions(await storageProvider.getAggregatedSessions());
    }
    setIsStatsOpen(true);
  };

  const handleSignIn = async () => {
    if (!auth) {
      console.error("Firebase Auth not initialized");
      return alert("Firebase not configured");
    }
    console.log("Attempting popup sign-in from origin:", window.location.origin);
    try { 
      // specific error handling for popup blocking
      await signInWithPopup(auth, new GoogleAuthProvider()); 
      console.log("Popup sign-in completed. Waiting for auth state change...");
    } catch (e: any) { 
      console.error("Popup sign-in failed:", e);
      if (e.code === 'auth/popup-blocked') {
        alert("Popup was blocked. Please allow popups for this site.");
      } else if (e.code === 'auth/popup-closed-by-user') {
        console.log("User closed the popup");
      } else if (e.code === 'auth/unauthorized-domain') {
        alert(`Domain Unauthorized: ${window.location.hostname} is not in Firebase Console > Auth > Settings > Authorized Domains.`);
      } else {
        alert(`Sign in error: ${e.code} - ${e.message}`);
      }
    }
  };

  const handleSignOut = async () => {
    if (auth) await signOut(auth);
  };

  const onFileInputClick = (e: React.MouseEvent<HTMLInputElement>) => { (e.target as HTMLInputElement).value = ''; };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!storageProvider) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
      const title = file.name.replace(/\.(epub|pdf)$/i, '');
      const id = await storageProvider.addBook(file, title);
      setLibrary(await storageProvider.getAllBooks());
      handleSelectBook(id);
    } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  const handleLoadDemoBook = async () => {
    if (!storageProvider || !storage) return;
    setIsLoading(true);
    try {
      const demoRef = ref(storage, 'epubs/Frankenstein.epub');
      const bytes = await getBytes(demoRef);
      const blob = new Blob([bytes], { type: 'application/epub+zip' });
      const file = new File([blob], 'Frankenstein.epub', { type: 'application/epub+zip' });
      const id = await storageProvider.addBook(file, 'Frankenstein');
      setLibrary(await storageProvider.getAllBooks());
      handleSelectBook(id);
    } catch (e) {
      console.error("Failed to load demo book", e);
      alert("Failed to load the demo book. Please try again or upload your own.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBook = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!storageProvider) return;
    if (confirm('Delete this book?')) {
      await storageProvider.deleteBook(id);
      setLibrary(await storageProvider.getAllBooks());
    }
  };

  const handleToggleArchive = async (id: string, archived: boolean) => {
    if (!storageProvider) return;
    await storageProvider.updateBookArchived(id, archived);
    setLibrary(await storageProvider.getAllBooks());
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

  const handleCloseBook = async () => {
    setIsPlaying(false);
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
      
      lastLoadedBookIdRef.current = bookRecord.id;
      setBookTitle(result.title);
      setWords(result.words);
      setSections(result.sections);
      setCurrentIndex(result.wordIndex);
      setWpm(result.wpm);
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
        }).catch(err => {
          console.error("[App] Background real end detection failed:", err);
        });
      }
    } catch (e) {
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
      else storageProvider.getBook(currentBookId).then(f => {
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

  const handleSetIsPlaying = useCallback((playing: boolean) => {
    if (playing && !isPlaying) {
      setPlaybackStartTime(Date.now());

      const nextIndex = getResumeIndex(currentIndex, words, sections, isChapterBreak);
      if (isChapterBreak) {
        setIsChapterBreak(false);
      }
      setCurrentIndex(nextIndex);

      if (isReadingAloud) {
        audioPlayerRef.current?.stop();
        setIsReadingAloud(false);
      }

      // Attempt immediate trigger for Wake Lock and Fullscreen
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then(lock => {
          wakeLockRef.current = lock;
          console.log('Wake Lock acquired via gesture');
        }).catch(e => console.warn('Wake Lock failed via gesture', e));
      }
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
          if (autoLandscape && (screen.orientation as any)?.lock) {
            (screen.orientation as any).lock('landscape').catch((e: any) => console.warn('Orientation lock failed', e));
          }
        }).catch(e => console.warn('Fullscreen failed via gesture', e));
      } else {
        if (autoLandscape && (screen.orientation as any)?.lock) {
          (screen.orientation as any).lock('landscape').catch((e: any) => console.warn('Orientation lock failed', e));
        }
      }
    } else if (!playing && isPlaying) {
      setPlaybackStartTime(null);
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    }
    setIsPlaying(playing);
  }, [isPlaying, currentIndex, words, isReadingAloud, autoLandscape, isChapterBreak, sections]);

  useEffect(() => {
    if (isPlaying) {
      if (sessionStartTimeRef.current === null) {
        sessionStartTimeRef.current = Date.now();
        wordsReadInSessionRef.current = 0;
        sessionStartIndexRef.current = currentIndex;
      }
    } else if (sessionStartTimeRef.current !== null && currentBookId && storageProvider) {
      const savedBookId = currentBookId;
      const savedIndex = currentIndex;
      const savedWpm = wpm;
      const savedStartTime = sessionStartTimeRef.current;
      const savedStartIndex = sessionStartIndexRef.current || 0;
      const savedBookTitle = bookTitle;

      const durationMs = Date.now() - savedStartTime;
      const durationMins = durationMs / 60000;
      const wordsRead = wordsReadInSessionRef.current;
      const avgWpm = durationMins > 0 ? Math.round(wordsRead / durationMins) : 0;

      console.log(`Session Summary:
- Duration: ${(durationMs / 1000).toFixed(1)}s
- Words Read: ${wordsRead}
- Set WPM: ${savedWpm}
- Effective Avg WPM: ${avgWpm}`);

      // Log Session to Storage (only if longer than 10 seconds)
      if (durationMs >= 10000) {
        storageProvider.logReadingSession({
          bookId: savedBookId,
          bookTitle: savedBookTitle,
          startTime: savedStartTime,
          endTime: Date.now(),
          startWordIndex: savedStartIndex,
          endWordIndex: savedIndex,
          wordsRead: wordsRead,
          durationSeconds: Math.round(durationMs / 1000),
          type: 'reading'
        }).then(async () => {
            // Trigger aggregation to ensure stats are up to date
            await storageProvider.aggregateSessions();
            setSessions(await storageProvider.getAggregatedSessions());

            // Update book statistics and vanity ratio
            const bookRecord = library.find(b => b.id === savedBookId);
            if (bookRecord) {
              const expectedWordsThisSession = savedWpm * (durationMs / 60000);
              const cumulativeWords = (bookRecord.progress.cumulativeWordsRead || 0) + wordsRead;
              const cumulativeExpected = (bookRecord.progress.cumulativeExpectedWords || 0) + expectedWordsThisSession;
              const cumulativeDuration = (bookRecord.progress.cumulativeDurationSeconds || 0) + Math.round(durationMs / 1000);

              const newVanityRatio = cumulativeWords > 0 ? cumulativeExpected / cumulativeWords : (bookRecord.settings.vanityWpmRatio || rsvpSettings.vanityWpmRatio);
              const oldVanityRatio = bookRecord.settings.vanityWpmRatio || rsvpSettings.vanityWpmRatio;

              // Maintain same targetWpm
              const targetWpm = savedWpm / oldVanityRatio;
              const newBoostedWpm = targetWpm * newVanityRatio;

              await storageProvider.updateBookStats(savedBookId, {
                cumulativeWordsRead: cumulativeWords,
                cumulativeExpectedWords: cumulativeExpected,
                cumulativeDurationSeconds: cumulativeDuration,
                vanityWpmRatio: newVanityRatio,
                wpm: newBoostedWpm
              });

              // Update local state
              setLibrary(prev => prev.map(b => b.id === savedBookId ? {
                ...b,
                progress: {
                  ...b.progress,
                  wordIndex: savedIndex,
                  cumulativeWordsRead: cumulativeWords,
                  cumulativeExpectedWords: cumulativeExpected,
                  cumulativeDurationSeconds: cumulativeDuration
                },
                settings: {
                  ...b.settings,
                  vanityWpmRatio: newVanityRatio,
                  wpm: newBoostedWpm
                }
              } : b));

              if (currentBookIdRef.current === savedBookId) {
                setWpm(newBoostedWpm);
              }
            }
        }).catch(e => console.error("Failed to log session", e));
      } else {
        console.log("Session too short to log (< 10s)");
      }
      
      sessionStartTimeRef.current = null;
      wordsReadInSessionRef.current = 0;
      sessionStartIndexRef.current = null;
    }
  }, [isPlaying, wpm, currentBookId, storageProvider, currentIndex, bookTitle]);

  // Track words read
  useEffect(() => {
    if (isPlaying) {
      wordsReadInSessionRef.current += 1;
    }
  }, [currentIndex, isPlaying]);

  const navigate = (type: NavigationType) => {
    setIsChapterBreak(false);
    setCurrentIndex(calculateNavigationTarget(currentIndex, words, sections, type));
  };

  const nextWord = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev >= words.length - 1) { setIsPlaying(false); return prev; }
      return prev + 1;
    });
  }, [words.length]);

  useEffect(() => {
    if (isPlaying && words.length > 0) {
      const timeSinceRotation = Date.now() - lastRotationTime;
      if (timeSinceRotation < rsvpSettings.orientationDelay) {
        // Just let the effect re-run naturally since it depends on rotationTrigger
        return;
      }

      let interval: number; let callback: () => void;
      if (isChapterBreak) {
        interval = rsvpSettings.chapterBreakDelay; callback = () => setIsChapterBreak(false);
      } else {
        const currentWord = words[currentIndex].text || '';

        let effectiveWpm = wpm;
        if (playbackStartTime && rsvpSettings.wpmRampDuration > 0) {
          const elapsed = Date.now() - playbackStartTime;
          if (elapsed < rsvpSettings.wpmRampDuration) {
            const progress = elapsed / rsvpSettings.wpmRampDuration;
            // Ramp from 0.5 to 1.0
            effectiveWpm = wpm * (0.5 + 0.5 * progress);
          }
        }

        interval = calculateRsvpInterval(currentWord, effectiveWpm, rsvpSettings);

        if (sections.some(s => s.startIndex === currentIndex + 1)) callback = () => { setCurrentIndex(prev => prev + 1); setIsChapterBreak(true); };
        else callback = nextWord;
      }
      timerRef.current = window.setTimeout(callback, interval);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isPlaying, wpm, words, currentIndex, nextWord, sections, isChapterBreak, rotationTrigger, lastRotationTime, rsvpSettings, playbackStartTime]);

  if (isLoading || user === undefined) {
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
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKey={geminiApiKey}
        setApiKey={(k) => { 
          setGeminiApiKey(k); 
          saveGeminiApiKey(k); 
        }}
        syncApiKey={syncApiKey}
        setSyncApiKey={setSyncApiKey}
        ttsSpeed={ttsSpeed}
        setTtsSpeed={setTtsSpeed}
        autoLandscape={autoLandscape}
        setAutoLandscape={setAutoLandscape}
        fontFamily={fontFamily}
        setFontFamily={setFontFamily}
        rsvpSettings={rsvpSettings}
        setRsvpSettings={setRsvpSettings}
        user={user}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onSave={() => setIsSettingsOpen(false)}
      />

      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => {
          setIsOnboardingOpen(false);
          setOnboardingCompleted(true);
          storageProvider.updateSettings({ onboardingCompleted: true });
        }}
        apiKey={geminiApiKey}
        setApiKey={(k) => { 
          setGeminiApiKey(k); 
          saveGeminiApiKey(k);
        }}
        syncApiKey={syncApiKey}
        setSyncApiKey={setSyncApiKey}
        onComplete={() => {
          setIsOnboardingOpen(false);
          setOnboardingCompleted(true);
          storageProvider.updateSettings({ 
            onboardingCompleted: true,
            syncApiKey: syncApiKey,
            geminiApiKey: syncApiKey ? geminiApiKey : "" 
          });
        }}
      />

      <AiModal
        isOpen={isAskAiOpen}
        onClose={() => setIsAskAiOpen(false)}
        aiResponse={aiResponse}
        aiQuestion={aiQuestion}
        setAiQuestion={setAiQuestion}
        handleAskAi={async (qOverride) => {
          const q = typeof qOverride === 'string' ? qOverride : aiQuestion;
          if (!q.trim() || isAiLoading) return;
          setIsAiLoading(true);
          try {
            let currentChapterIdx = 0;
            for (let i = 0; i < sections.length; i++) if (sections[i].startIndex <= currentIndex) currentChapterIdx = i; else break;
            let context = ''; let useSum = false; let useWh = false;
            if (q === AI_QUESTIONS.JUST_HAPPENED || q === AI_QUESTIONS.RECENT_SUMMARY) {
              context = words.slice(currentChapterIdx > 0 ? sections[currentChapterIdx - 1].startIndex : 0, currentIndex + 1).map(w => w.text).join(' ');
              if (q === AI_QUESTIONS.JUST_HAPPENED) useWh = true; else useSum = true;
            } else if (q === AI_QUESTIONS.CHAPTER_SUMMARY) {
              context = words.slice(sections[currentChapterIdx]?.startIndex || 0, currentIndex + 1).map(w => w.text).join(' ');
              useSum = true;
            } else context = words.slice(0, currentIndex + 1).map(w => w.text).join(' ');
            setAiResponse(useWh ? await summarizeWhatJustHappened(context) : useSum ? await summarizeRecent(context) : await askAboutBook(q, context));
          } catch { setAiResponse('Error'); } finally { setIsAiLoading(false); }
        }}
        isAiLoading={isAiLoading}
        ttsSpeed={ttsSpeed}
      />

      <StatsView 
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        sessions={sessions}
        books={library}
        activeBookId={currentBookId}
        theme={theme}
      />

      <BookSettingsModal
        isOpen={isBookSettingsOpen}
        onClose={() => setIsBookSettingsOpen(false)}
        currentTitle={bookTitle}
        onUpdateTitle={handleUpdateBookTitle}
        onRecomputeRealEnd={handleRecomputeRealEnd}
        isProcessing={isRecomputingEnd}
      />

      {!currentBookId ? (
        <LibraryView
          library={library} isLoading={isLoading} theme={theme}
          onSettingsClick={() => setIsSettingsOpen(true)}
          onToggleTheme={toggleTheme}
          onSelectBook={handleSelectBook}
          onDeleteBook={handleDeleteBook}
          onToggleArchive={handleToggleArchive}
          onFileUpload={handleFileUpload}
          fileInputRef={fileInputRef}
          onFileInputClick={onFileInputClick}
          onStatsClick={handleOpenStats}
          onLoadDemoBook={handleLoadDemoBook}
          onAboutClick={() => setShowAbout(true)}
        />
      ) : (
        <ReaderView
          words={words} currentIndex={currentIndex} effectiveTotalWords={realEndIndex || words.length}
          realEndIndex={realEndIndex} 
          furthestIndex={furthestIndex}
          isPlaying={isPlaying}
          setIsPlaying={handleSetIsPlaying}
          wpm={Math.round(wpm / (library.find(b => b.id === currentBookId)?.settings.vanityWpmRatio || rsvpSettings.vanityWpmRatio))}
          onWpmChange={(targetWpm) => { 
              const currentRatio = library.find(b => b.id === currentBookId)?.settings.vanityWpmRatio || rsvpSettings.vanityWpmRatio;
              const boosted = targetWpm * currentRatio;
              setWpm(boosted); 
              storageProvider.updateBookWpm(currentBookId!, boosted); 
          }}
          vanityWpmRatio={library.find(b => b.id === currentBookId)?.settings.vanityWpmRatio || rsvpSettings.vanityWpmRatio}
          theme={theme} fontFamily={fontFamily} bookTitle={bookTitle}
          onCloseBook={handleCloseBook} onSettingsClick={() => setIsSettingsOpen(true)}
          onBookSettingsClick={() => setIsBookSettingsOpen(true)}
          onToggleTheme={toggleTheme} onAskAiClick={() => { setAiResponse(''); setIsAskAiOpen(true); }}
          isAskAiOpen={isAskAiOpen} sections={sections} setCurrentIndex={setCurrentIndex}
          navigate={navigate}
          isTocOpen={isTocOpen} toggleToc={() => setIsTocOpen(!isTocOpen)}
          onReadChapter={async () => {
            if (audioPlayerRef.current?.isActive) {
              audioPlayerRef.current.stop();
              return;
            }

            let cIdx = -1; 
            for (let i = 0; i < sections.length; i++) {
              if (sections[i].startIndex <= currentIndex) cIdx = i; else break;
            }
            
            const cStart = sections[cIdx]?.startIndex || 0; 
            const cEnd = sections[cIdx + 1]?.startIndex || words.length;
            const cWords = words.slice(cStart, cEnd); 
            
            if (cWords.length === 0) return;
            
            setIsPlaying(false);
            
            audioPlayerRef.current?.playChapter(
              currentBookId!,
              cIdx,
              cWords,
              cStart,
              currentIndex,
              ttsSpeed,
              {
                onProgress: (idx) => setCurrentIndex(idx),
                onStateChange: (state) => {
                  setIsSynthesizing(state.isSynthesizing);
                  setIsReadingAloud(state.isPlaying);
                },
                onSessionFinished: (stats) => {
                  if (storageProvider && currentBookId) {
                    console.log(`[App] Finalizing listening session. End Word Index: ${stats.endWordIndex}`);
                    storageProvider.logReadingSession({
                      bookId: currentBookId,
                      bookTitle: bookTitle,
                      startTime: stats.startTime,
                      endTime: stats.endTime,
                      startWordIndex: stats.startWordIndex,
                      endWordIndex: stats.endWordIndex, 
                      wordsRead: Math.max(0, stats.endWordIndex - stats.startWordIndex),
                      durationSeconds: stats.durationSeconds,
                      type: 'listening'
                    }).then(async () => {
                        await storageProvider.aggregateSessions();
                        setSessions(await storageProvider.getAggregatedSessions());
                    });
                  }
                },
                onError: (msg) => alert(msg)
              }
            );
          }}
          isReadingAloud={isReadingAloud} isSynthesizing={isSynthesizing} isChapterBreak={isChapterBreak}
          upcomingChapterTitle={isChapterBreak
            ? (sections.slice().reverse().find(s => s.startIndex <= currentIndex)?.label || '')
            : (sections.find(s => s.startIndex === currentIndex + 1)?.label || '')}
          onStatsClick={handleOpenStats}
        />
      )}
      <ConsoleLogger />
    </>
  );
}

export default App;