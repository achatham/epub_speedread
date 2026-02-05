import React, { useState, useEffect, useRef, useCallback } from 'react';
import ePub from 'epubjs';
import {
  LocalStorage,
  CloudStorage,
  type StorageProvider,
  type BookRecord
} from './utils/storage';
import { auth } from './utils/firebase';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, type User } from 'firebase/auth';
import { extractWordsFromDoc, type WordData } from './utils/text-processing';
import { calculateNavigationTarget, findSentenceStart, type NavigationType } from './utils/navigation';
import { getGeminiApiKey, setGeminiApiKey as saveGeminiApiKey, findRealEndOfBook, askAboutBook, summarizeRecent, summarizeWhatJustHappened } from './utils/gemini';
import { synthesizeChapterAudio, schedulePcmChunk, type AudioController } from './utils/tts';
import { splitWord } from './utils/orp';
import { LibraryView } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { SettingsModal, type FontFamily } from './components/SettingsModal';
import { AiModal } from './components/AiModal';
import { AI_QUESTIONS } from './constants';

type Theme = 'light' | 'dark' | 'bedtime';

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
  const [library, setLibrary] = useState<BookRecord[]>([]);
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [storageProvider, setStorageProvider] = useState<StorageProvider>(() => new LocalStorage());

  const [words, setWords] = useState<WordData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wpm, setWpm] = useState(300);
  const [bookTitle, setBookTitle] = useState('');
  const [sections, setSections] = useState<{ label: string; startIndex: number }[]>([]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAskAiOpen, setIsAskAiOpen] = useState(false);

  // Initialize from localStorage immediately
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

  const [realEndIndex, setRealEndIndex] = useState<number | null>(null);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isChapterBreak, setIsChapterBreak] = useState(false);

  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);

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

  const [fontFamily, setFontFamily] = useState<FontFamily>(() => {
    try {
      const saved = localStorage.getItem('user_settings');
      if (saved) return JSON.parse(saved).fontFamily || 'system';
    } catch (e) { }
    return 'system';
  });

  const timerRef = useRef<number | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  const wordsReadInSessionRef = useRef<number>(0);
  const sessionStartIndexRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chapterAudioControllerRef = useRef<AudioController | null>(null);

  useEffect(() => {
    (window as any).__loadMockWords = (mockWords: WordData[], sectionsList: { label: string, startIndex: number }[] = []) => {
      setWords(mockWords);
      setBookTitle("Mock Book");
      setSections(sectionsList.length > 0 ? sectionsList : [{ label: 'Start', startIndex: 0 }]);
      setCurrentBookId("mock");
      setIsLoading(false);
    };
  }, []);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setStorageProvider(u ? new CloudStorage(new LocalStorage(), u.uid) : new LocalStorage());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        const settings = await storageProvider.getSettings();
        if (settings) {
          if (settings.geminiApiKey) {
            setGeminiApiKey(settings.geminiApiKey);
            saveGeminiApiKey(settings.geminiApiKey);
          }
          if (settings.theme) setTheme(settings.theme as Theme);
          if (settings.fontFamily) setFontFamily(settings.fontFamily as FontFamily);
          if (settings.ttsSpeed) setTtsSpeed(settings.ttsSpeed);
        }

        const books = await storageProvider.getAllBooks();
        setLibrary(books);
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
    storageProvider.updateSettings({ theme: nextTheme });
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
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
      const id = await storageProvider.addBook(file, file.name.replace(/\.epub$/i, ''));
      setLibrary(await storageProvider.getAllBooks());
      setCurrentBookId(id);
    } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  const handleDeleteBook = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Delete this book?')) {
      await storageProvider.deleteBook(id);
      setLibrary(await storageProvider.getAllBooks());
    }
  };

  const handleCloseBook = async () => {
    setIsPlaying(false);
    if (currentBookId) {
      await storageProvider.updateBookProgress(currentBookId, currentIndex);
      setLibrary(await storageProvider.getAllBooks());
    }
    setWords([]); setSections([]); setCurrentIndex(0); setBookTitle('');
    setCurrentBookId(null); setRealEndIndex(null);
  };

  const processBook = useCallback(async (bookRecord: BookRecord) => {
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
    if (currentBookId && currentBookId !== 'mock') {
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
    if (!isPlaying && currentBookId) storageProvider.updateBookProgress(currentBookId, currentIndex);
  }, [isPlaying, currentIndex, currentBookId, storageProvider]);

  useEffect(() => {
    if (isPlaying) {
      if (sessionStartTimeRef.current === null) {
        sessionStartTimeRef.current = Date.now();
        wordsReadInSessionRef.current = 0;
        sessionStartIndexRef.current = currentIndex;
      }
    } else if (sessionStartTimeRef.current !== null && currentBookId) {
      const durationMs = Date.now() - sessionStartTimeRef.current;
      const durationMins = durationMs / 60000;
      const wordsRead = wordsReadInSessionRef.current;
      const avgWpm = durationMins > 0 ? Math.round(wordsRead / durationMins) : 0;

      console.log(`Session Summary:
- Duration: ${(durationMs / 1000).toFixed(1)}s
- Words Read: ${wordsRead}
- Set WPM: ${wpm}
- Effective Avg WPM: ${avgWpm}`);

      // Log Session to Storage
      storageProvider.logReadingSession({
        bookId: currentBookId,
        startTime: sessionStartTimeRef.current,
        endTime: Date.now(),
        startWordIndex: sessionStartIndexRef.current || 0,
        endWordIndex: currentIndex,
        durationSeconds: Math.round(durationMs / 1000)
      }).catch(e => console.error("Failed to log session", e));

      sessionStartTimeRef.current = null;
      wordsReadInSessionRef.current = 0;
      sessionStartIndexRef.current = null;
    }
  }, [isPlaying, wpm, currentBookId, storageProvider, currentIndex]);

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
      let interval: number; let callback: () => void;
      if (isChapterBreak) {
        interval = 3000; callback = () => { setIsChapterBreak(false); nextWord(); };
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
        // We end up adding delays for long words and punctuation, and this makes it so the wpm
        // the user thinks they're selecting more closely matches what they'll actually do.
        const baseWpm = wpm / 1.15;
        interval = (60000 / baseWpm) * multiplier;

        if (sections.some(s => s.startIndex === currentIndex + 1)) callback = () => setIsChapterBreak(true);
        else callback = nextWord;
      }
      timerRef.current = window.setTimeout(callback, interval);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isPlaying, wpm, words, currentIndex, nextWord, sections, isChapterBreak]);

  return (
    <>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKey={geminiApiKey}
        setApiKey={(k) => { setGeminiApiKey(k); saveGeminiApiKey(k); storageProvider.updateSettings({ geminiApiKey: k }); }}
        ttsSpeed={ttsSpeed}
        setTtsSpeed={(s) => { setTtsSpeed(s); storageProvider.updateSettings({ ttsSpeed: s }); }}
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
        />
      ) : (
        <ReaderView
          words={words} currentIndex={currentIndex} effectiveTotalWords={realEndIndex || words.length}
          realEndIndex={realEndIndex} isPlaying={isPlaying}
          setIsPlaying={(p) => {
            if (p && !isPlaying) setCurrentIndex(findSentenceStart(currentIndex, words));
            if (p && isReadingAloud) { if (chapterAudioControllerRef.current) chapterAudioControllerRef.current.stop(); setIsReadingAloud(false); }
            setIsPlaying(p);
          }}
          wpm={wpm} onWpmChange={(n) => { setWpm(n); storageProvider.updateBookWpm(currentBookId, n); }}
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
          upcomingChapterTitle={sections.find(s => s.startIndex === currentIndex + 1)?.label || ''}
        />
      )}
    </>
  );
}

export default App;
