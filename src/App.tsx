import React, { useState, useEffect, useRef, useCallback } from 'react';
import ePub from 'epubjs';
import {
  FirestoreStorage,
  type BookRecord,
  type ReadingSession
} from './utils/storage';
import { auth, storage } from './utils/firebase';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, type User } from 'firebase/auth';
import { ref, getBytes } from 'firebase/storage';
import { extractWordsFromDoc, type WordData } from './utils/text-processing';
import { calculateNavigationTarget, findSentenceStart, type NavigationType } from './utils/navigation';
import { getGeminiApiKey, setGeminiApiKey as saveGeminiApiKey, findRealEndOfBook, askAboutBook, summarizeRecent, summarizeWhatJustHappened } from './utils/gemini';
import { synthesizeChapterAudio, schedulePcmChunk, type AudioController } from './utils/tts';
import { splitWord } from './utils/orp';
import { LibraryView } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { SettingsModal, type FontFamily } from './components/SettingsModal';
import { AiModal } from './components/AiModal';
import { StatsView } from './components/StatsView';
import { AboutView } from './components/AboutView';
import { AI_QUESTIONS, WPM_VANITY_RATIO } from './constants';
import { LogIn, Info, BookOpen } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

type Theme = 'light' | 'dark' | 'bedtime';

const MOCK_USER = { uid: 'mock-user' };
const MOCK_STORAGE = {
  getSettings: async () => ({}),
  getAllBooks: async () => [],
  getSessions: async () => [],
  updateBookProgress: async () => {},
  updateBookWpm: async () => {},
  updateSettings: async () => {},
  logReadingSession: async () => {},
  updateBookRealEndIndex: async () => {},
  updateBookRealEndQuote: async () => {},
  getChapterAudio: async () => null,
  saveChapterAudio: async () => {},
  deleteBook: async () => {},
  getBook: async () => null,
};

const findQuoteIndex = (quote: string, currentWords: WordData[]): number | null => {
  const quoteWords = quote.split(/\s+/).filter(w => w.length > 0);
  if (quoteWords.length > 0) {
    for (let i = currentWords.length - quoteWords.length; i >= 0; i--) {
      let match = true;
      for (let j = 0; j < quoteWords.length; j++) {
        const wordText = currentWords[i + j].text.toLowerCase().replace(/[^\w]/g, '');
        if (wordText !== quoteWords[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        return i + quoteWords.length;
      }
    }
  }
  return null;
};

function App() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const [library, setLibrary] = useState<BookRecord[]>([]);
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
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
    } catch (e) { }
    return 2.0;
  });

  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    return getGeminiApiKey() || '';
  });

  const [syncApiKey, setSyncApiKey] = useState(true);
  const [autoLandscape, setAutoLandscape] = useState(() => {
    try {
      const saved = localStorage.getItem('user_settings');
      if (saved) return JSON.parse(saved).autoLandscape || false;
    } catch (e) { }
    return false;
  });

  const [realEndIndex, setRealEndIndex] = useState<number | null>(null);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isChapterBreak, setIsChapterBreak] = useState(false);

  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('user_settings');
      if (saved) {
        const theme = JSON.parse(saved).theme;
        if (theme) return theme as Theme;
      }
    } catch (e) { }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  const [fontFamily, setFontFamily] = useState<FontFamily>('system');

  // Test Hook for Playwright
  useEffect(() => {
    (window as any).__loadMockWords = (mockWords: any[], mockSections?: any[]) => {
      const processedWords = mockWords.map(w => ({
        text: w.text,
        isParagraphStart: typeof w.isParagraphStart === 'boolean' ? w.isParagraphStart : (w.paragraphIndex === 0 && w.sentenceIndex === 0),
        isSentenceStart: typeof w.isSentenceStart === 'boolean' ? w.isSentenceStart : w.sentenceIndex === 0
      }));

      setWords(processedWords);
      setSections(mockSections || [{ label: 'Mock Chapter', startIndex: 0 }]);
      setCurrentIndex(0);
      setCurrentBookId('mock');
      setIsPlaying(false);
      setUser(u => u || (MOCK_USER as any));
      setStorageProvider(p => p || (MOCK_STORAGE as any));
      setIsLoading(false);
    };
  }, []);

  const [rotationTrigger, setRotationTrigger] = useState(0);
  const lastRotationTimeRef = useRef(0);

  useEffect(() => {
    const handleRotation = () => {
      lastRotationTimeRef.current = Date.now();
      setRotationTrigger(prev => prev + 1);
    };

    if (screen.orientation) {
      screen.orientation.addEventListener('change', handleRotation);
    }
    window.addEventListener('orientationchange', handleRotation);

    return () => {
      if (screen.orientation) {
        screen.orientation.removeEventListener('change', handleRotation);
      }
      window.removeEventListener('orientationchange', handleRotation);
    };
  }, []);

  const timerRef = useRef<number | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  const wordsReadInSessionRef = useRef<number>(0);
  const sessionStartIndexRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const chapterAudioControllerRef = useRef<AudioController | null>(null);

  // Background Update: Refresh when app is hidden and idle
  useEffect(() => {
    if (!needRefresh) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && !isPlaying && !isReadingAloud && !isSynthesizing) {
        console.log('[PWA] Updating in background...');
        updateServiceWorker(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [needRefresh, isPlaying, isReadingAloud, isSynthesizing, updateServiceWorker]);

  // --- Auth & Storage Init ---
  useEffect(() => {
    if (!auth) {
      setIsLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
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
        }

        const [books, history] = await Promise.all([
            storageProvider.getAllBooks(),
            storageProvider.getSessions()
        ]);
        
        setLibrary(books);
        setSessions(history);
      } catch (err) {
        console.error('Failed to load storage data', err);
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

  const handleSignIn = async () => {
    if (!auth) return alert("Firebase not configured");
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { console.error(e); }
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
      const id = await storageProvider.addBook(file, file.name.replace(/\.epub$/i, ''));
      setLibrary(await storageProvider.getAllBooks());
      setCurrentBookId(id);
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
      setCurrentBookId(id);
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

  const handleCloseBook = async () => {
    setIsPlaying(false);
    if (currentBookId && storageProvider) {
      await storageProvider.updateBookProgress(currentBookId, currentIndex);
      setLibrary(await storageProvider.getAllBooks());
    }
    setWords([]); setSections([]); setCurrentIndex(0); setBookTitle('');
    setCurrentBookId(null); setRealEndIndex(null);
  };

  const processBook = useCallback(async (bookRecord: BookRecord) => {
    if (!storageProvider) return;
    try {
      let file = bookRecord.storage.localFile;
      if (!file) {
        const fullBook = await storageProvider.getBook(bookRecord.id);
        if (!fullBook?.storage.localFile) throw new Error("File missing");
        file = fullBook.storage.localFile;
      }

      const arrayBuffer = await file.arrayBuffer();
      const book = ePub(arrayBuffer);
      await book.ready;
      const metadata = await book.loaded.metadata;
      setBookTitle(metadata.title || bookRecord.meta.title);

      // @ts-ignore
      await book.loaded.navigation;
      let allWords: WordData[] = [];
      const spine = book.spine as any;
      const hrefToStartIndex: Record<string, number> = {};

      for (let i = 0; i < (spine.length || 0); i++) {
        const item = spine.get(i);
        if (item) {
          const cleanHref = item.href.split('#')[0];
          if (!(cleanHref in hrefToStartIndex)) hrefToStartIndex[cleanHref] = allWords.length;
          const contents = await book.load(item.href);
          let doc: Document | null = null;
          if (typeof contents === 'string') {
            doc = new DOMParser().parseFromString(contents, 'application/xhtml+xml');
          } else if (contents instanceof Document) { doc = contents; }
          if (doc?.body) {
            const sectionWords = extractWordsFromDoc(doc);
            if (sectionWords.length > 0) allWords = [...allWords, ...sectionWords];
          }
        }
      }

      const loadedSections: { label: string; startIndex: number }[] = [];
      // @ts-ignore
      const toc = book.navigation.toc;
      const flattenToc = (items: any[]) => {
        items.forEach(item => {
          const cleanHref = item.href?.split('#')[0];
          const startIndex = hrefToStartIndex[cleanHref];
          if (startIndex !== undefined) loadedSections.push({ label: item.label.trim(), startIndex });
          if (item.subitems?.length > 0) flattenToc(item.subitems);
        });
      };
      if (toc?.length > 0) flattenToc(toc); else loadedSections.push({ label: 'Start', startIndex: 0 });

      setWords(allWords); setSections(loadedSections);
      setCurrentIndex(bookRecord.progress.wordIndex || 0);
      setWpm(bookRecord.settings.wpm || 300);

      if (bookRecord.analysis.realEndIndex !== undefined) {
        setRealEndIndex(bookRecord.analysis.realEndIndex);
      } else if (bookRecord.analysis.realEndQuote) {
        const idx = findQuoteIndex(bookRecord.analysis.realEndQuote, allWords);
        if (idx !== null) { setRealEndIndex(idx); storageProvider.updateBookRealEndIndex(bookRecord.id, idx); }
      } else {
        const apiKey = getGeminiApiKey();
        if (apiKey && loadedSections.length > 0) {
          findRealEndOfBook(loadedSections.map(s => s.label), allWords.map(w => w.text).join(' ')).then(quote => {
            if (quote) {
              storageProvider.updateBookRealEndQuote(bookRecord.id, quote);
              const idx = findQuoteIndex(quote, allWords);
              if (idx !== null) { setRealEndIndex(idx); storageProvider.updateBookRealEndIndex(bookRecord.id, idx); }
            }
          });
        }
      }
    } catch (e) { console.error(e); setCurrentBookId(null); }
  }, [storageProvider]);

  useEffect(() => {
    if (currentBookId && currentBookId !== 'mock' && storageProvider) {
      setIsLoading(true);
      const record = library.find(b => b.id === currentBookId);
      if (record) processBook(record).then(() => setIsLoading(false));
      else storageProvider.getBook(currentBookId).then(f => {
        if (f) processBook(f).then(() => setIsLoading(false));
        else { setCurrentBookId(null); setIsLoading(false); }
      });
    }
  }, [currentBookId, processBook, library, storageProvider]);

  useEffect(() => {
    if (!isPlaying && currentBookId && storageProvider) storageProvider.updateBookProgress(currentBookId, currentIndex);
  }, [isPlaying, currentIndex, currentBookId, storageProvider]);

  const handleSetIsPlaying = useCallback((playing: boolean) => {
    if (playing && !isPlaying) {
      if (isChapterBreak) {
        setIsChapterBreak(false);
      } else {
        setCurrentIndex(findSentenceStart(currentIndex, words));
      }
      if (isReadingAloud) {
        if (chapterAudioControllerRef.current) chapterAudioControllerRef.current.stop();
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
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      if ((screen.orientation as any)?.unlock) {
        (screen.orientation as any).unlock();
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    }
    setIsPlaying(playing);
  }, [isPlaying, currentIndex, words, isReadingAloud, autoLandscape, isChapterBreak]);

  useEffect(() => {
    if (isPlaying) {
      if (sessionStartTimeRef.current === null) {
        sessionStartTimeRef.current = Date.now();
        wordsReadInSessionRef.current = 0;
        sessionStartIndexRef.current = currentIndex;
      }
    } else if (sessionStartTimeRef.current !== null && currentBookId && storageProvider) {
      const durationMs = Date.now() - sessionStartTimeRef.current;
      const durationMins = durationMs / 60000;
      const wordsRead = wordsReadInSessionRef.current;
      const avgWpm = durationMins > 0 ? Math.round(wordsRead / durationMins) : 0;

      console.log(`Session Summary:
- Duration: ${(durationMs / 1000).toFixed(1)}s
- Words Read: ${wordsRead}
- Set WPM: ${wpm}
- Effective Avg WPM: ${avgWpm}`);

      // Log Session to Storage (only if longer than 10 seconds)
      if (durationMs >= 10000) {
        storageProvider.logReadingSession({
          bookId: currentBookId,
          bookTitle: bookTitle,
          startTime: sessionStartTimeRef.current,
          endTime: Date.now(),
          startWordIndex: sessionStartIndexRef.current || 0,
          endWordIndex: currentIndex,
          durationSeconds: Math.round(durationMs / 1000)
        }).then(() => {
            // Refresh sessions list
            storageProvider.getSessions().then(setSessions);
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
    setIsNavOpen(false);
  };

  const nextWord = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev >= words.length - 1) { setIsPlaying(false); return prev; }
      return prev + 1;
    });
  }, [words.length]);

  useEffect(() => {
    if (isPlaying && words.length > 0) {
      const timeSinceRotation = Date.now() - lastRotationTimeRef.current;
      if (timeSinceRotation < 500) {
        timerRef.current = window.setTimeout(() => {
          setRotationTrigger(prev => prev + 1);
        }, 501 - timeSinceRotation);
        return;
      }

      let interval: number; let callback: () => void;
      if (isChapterBreak) {
        interval = 3000; callback = () => setIsChapterBreak(false);
      } else {
        const currentWord = words[currentIndex].text || '';
        let multiplier = 1;
        if (currentWord.endsWith('.') || currentWord.endsWith('!') || currentWord.endsWith('?')) multiplier = 2;
        else if (currentWord.endsWith(',') || currentWord.endsWith(';') || currentWord.endsWith(':')) multiplier = 1.5;
        const { prefix, suffix } = splitWord(currentWord);
        const maxSideChars = Math.max(prefix.length + 0.5, suffix.length + 0.5);
        if (((window.innerWidth * 0.9) / (1.2 * maxSideChars)) < (window.innerHeight * 0.25)) multiplier *= 1.5;
        else if (currentWord.length > 8) multiplier *= 1.2;

        // Shave the WPM: The displayed WPM is 15% higher than the actual base WPM used here.
        const baseWpm = wpm / WPM_VANITY_RATIO;
        interval = (60000 / baseWpm) * multiplier;

        if (sections.some(s => s.startIndex === currentIndex + 1)) callback = () => { setCurrentIndex(prev => prev + 1); setIsChapterBreak(true); };
        else callback = nextWord;
      }
      timerRef.current = window.setTimeout(callback, interval);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isPlaying, wpm, words, currentIndex, nextWord, sections, isChapterBreak, rotationTrigger]);

  if (isLoading && !user) {
    return (
      <div className={`flex flex-col items-center justify-center min-h-screen ${theme === 'bedtime' ? 'bg-black text-stone-400' : 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100'}`}>
        <div className="animate-pulse flex flex-col items-center">
          <BookOpen size={48} className="mb-4 opacity-20" />
          <p className="text-sm font-light opacity-50 tracking-widest uppercase">Loading</p>
        </div>
      </div>
    );
  }

  if (!user || !storageProvider) {
    if (showAbout) {
      return <AboutView onBack={() => setShowAbout(false)} theme={theme} />;
    }

    return (
      <div className={`flex flex-col items-center justify-center min-h-screen ${theme === 'bedtime' ? 'bg-black text-stone-400' : 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100'}`}>
        <h1 className="text-4xl font-light mb-8">Speed Reader</h1>
        <p className="mb-8 opacity-70">Please sign in to access your library.</p>
        <div className="flex flex-col gap-4 w-64">
          <button 
            onClick={handleSignIn}
            className="flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90 transition-opacity shadow-sm"
          >
            <LogIn size={20} />
            Sign In with Google
          </button>
          <button 
            onClick={() => setShowAbout(true)}
            className="flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <Info size={20} />
            Learn more...
          </button>
        </div>
      </div>
    );
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
          storageProvider.updateSettings({ geminiApiKey: syncApiKey ? k : "" }); 
        }}
        syncApiKey={syncApiKey}
        setSyncApiKey={(sync) => {
          setSyncApiKey(sync);
          storageProvider.updateSettings({ 
            syncApiKey: sync,
            geminiApiKey: sync ? geminiApiKey : "" 
          });
        }}
        ttsSpeed={ttsSpeed}
        setTtsSpeed={(s) => { setTtsSpeed(s); storageProvider.updateSettings({ ttsSpeed: s }); }}
        autoLandscape={autoLandscape}
        setAutoLandscape={(a) => { setAutoLandscape(a); storageProvider.updateSettings({ autoLandscape: a }); }}
        fontFamily={fontFamily}
        setFontFamily={(f) => { setFontFamily(f); storageProvider.updateSettings({ fontFamily: f }); }}
        user={user}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onSave={() => setIsSettingsOpen(false)}
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

      {!currentBookId ? (
        <LibraryView
          library={library} isLoading={isLoading} theme={theme}
          onSettingsClick={() => setIsSettingsOpen(true)}
          onToggleTheme={toggleTheme}
          onSelectBook={setCurrentBookId}
          onDeleteBook={handleDeleteBook}
          onFileUpload={handleFileUpload}
          fileInputRef={fileInputRef}
          onFileInputClick={onFileInputClick}
          onStatsClick={() => setIsStatsOpen(true)}
          onLoadDemoBook={handleLoadDemoBook}
        />
      ) : (
        <ReaderView
          words={words} currentIndex={currentIndex} effectiveTotalWords={realEndIndex || words.length}
          realEndIndex={realEndIndex} isPlaying={isPlaying}
          setIsPlaying={handleSetIsPlaying}
          wpm={Math.round(wpm / WPM_VANITY_RATIO)} 
          onWpmChange={(targetWpm) => { 
              const boosted = targetWpm * WPM_VANITY_RATIO;
              setWpm(boosted); 
              storageProvider.updateBookWpm(currentBookId!, boosted); 
          }}
          theme={theme} fontFamily={fontFamily} bookTitle={bookTitle}
          onCloseBook={handleCloseBook} onSettingsClick={() => setIsSettingsOpen(true)}
          onToggleTheme={toggleTheme} onAskAiClick={() => { setAiResponse(''); setIsAskAiOpen(true); }}
          isAskAiOpen={isAskAiOpen} sections={sections} setCurrentIndex={setCurrentIndex}
          navigate={navigate} onDeleteBook={async () => { await storageProvider.deleteBook(currentBookId); setLibrary(await storageProvider.getAllBooks()); setCurrentBookId(null); }}
          isNavOpen={isNavOpen} toggleNav={() => setIsNavOpen(!isNavOpen)}
          isTocOpen={isTocOpen} toggleToc={() => setIsTocOpen(!isTocOpen)}
          onReadChapter={async () => {
            if (isReadingAloud || isSynthesizing) { if (chapterAudioControllerRef.current) chapterAudioControllerRef.current.stop(); setIsReadingAloud(false); setIsSynthesizing(false); return; }
            let cIdx = -1; for (let i = 0; i < sections.length; i++) if (sections[i].startIndex <= currentIndex) cIdx = i; else break;
            const cStart = sections[cIdx]?.startIndex || 0; const cEnd = sections[cIdx + 1]?.startIndex || words.length;
            const cWords = words.slice(cStart, cEnd); if (cWords.length === 0) return;
            setIsPlaying(false);
            try {
              let chunks = await storageProvider.getChapterAudio(currentBookId, cIdx, ttsSpeed);
              if (!chunks) {
                setIsSynthesizing(true); const ak = getGeminiApiKey(); if (!ak) return alert("API Key required");
                chunks = await synthesizeChapterAudio(cWords, ttsSpeed, ak);
                if (chunks.length > 0) await storageProvider.saveChapterAudio(currentBookId, cIdx, ttsSpeed, chunks);
                setIsSynthesizing(false);
              }
              if (chunks?.length) {
                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                setIsReadingAloud(true); const st = { stop: false, next: ctx.currentTime, start: false };
                chapterAudioControllerRef.current = { stop: () => { st.stop = true; ctx.close(); } };
                for (let ch of chunks) { if (st.stop) break; if (ctx.state === 'suspended') await ctx.resume(); if (st.next < ctx.currentTime) st.next = ctx.currentTime; st.next += schedulePcmChunk(ctx, ch, st.next); st.start = true; }
                const iv = setInterval(() => { if (st.stop) return clearInterval(iv); if (st.start && ctx.currentTime >= st.next) { clearInterval(iv); setIsReadingAloud(false); ctx.close(); chapterAudioControllerRef.current = null; } }, 200);
              }
            } catch { setIsSynthesizing(false); setIsReadingAloud(false); }
          }}
          isReadingAloud={isReadingAloud} isSynthesizing={isSynthesizing} isChapterBreak={isChapterBreak}
          upcomingChapterTitle={isChapterBreak
            ? (sections.slice().reverse().find(s => s.startIndex <= currentIndex)?.label || '')
            : (sections.find(s => s.startIndex === currentIndex + 1)?.label || '')}
          onStatsClick={() => setIsStatsOpen(true)}
        />
      )}
    </>
  );
}

export default App;
