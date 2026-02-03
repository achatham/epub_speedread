import React, { useState, useEffect, useRef, useCallback } from 'react';
import ePub from 'epubjs';
import {
  addBook,
  getAllBooks,
  getBook,
  deleteBook,
  updateBookProgress,
  updateBookWpm,
  updateBookRealEndQuote,
  updateBookRealEndIndex,
  saveChapterAudio,
  getChapterAudio,
  type BookRecord
} from './utils/storage';
import { extractWordsFromDoc, type WordData } from './utils/text-processing';
import { calculateNavigationTarget, findSentenceStart, type NavigationType } from './utils/navigation';
import { getGeminiApiKey, setGeminiApiKey as saveGeminiApiKey, findRealEndOfBook, askAboutBook, summarizeRecent } from './utils/gemini';
import { synthesizeChapterAudio, schedulePcmChunk, type AudioController } from './utils/tts';
import { splitWord } from './utils/orp';
import { LibraryView } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { SettingsModal, type FontFamily } from './components/SettingsModal';
import { AiModal } from './components/AiModal';

type Theme = 'light' | 'dark' | 'bedtime';

// Helper to find index of quote
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
  // Global State
  const [library, setLibrary] = useState<BookRecord[]>([]);
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Reader State
  const [words, setWords] = useState<WordData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wpm, setWpm] = useState(300);
  const [bookTitle, setBookTitle] = useState('');
  const [sections, setSections] = useState<{ label: string; startIndex: number }[]>([]);
  
  // AI & Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAskAiOpen, setIsAskAiOpen] = useState(false);
  const [ttsSpeed, setTtsSpeed] = useState<number>(() => {
    const saved = localStorage.getItem('ttsSpeed');
    return saved ? parseFloat(saved) : 2.0;
  });
  const [geminiApiKey, setGeminiApiKey] = useState(getGeminiApiKey() || '');
  const [realEndIndex, setRealEndIndex] = useState<number | null>(null);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isChapterBreak, setIsChapterBreak] = useState(false);

  // UI State
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme') as Theme;
    if (saved) return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });
  const [fontFamily, setFontFamily] = useState<FontFamily>(() => {
    return (localStorage.getItem('fontFamily') as FontFamily) || 'system';
  });
  
  const timerRef = useRef<number | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  const wordsReadInSessionRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const chapterAudioControllerRef = useRef<AudioController | null>(null);

  // For testing
  useEffect(() => {
    (window as any).__loadMockWords = (mockWords: WordData[], sectionsList: {label: string, startIndex: number}[] = []) => {
      setWords(mockWords);
      setBookTitle("Mock Book");
      setSections(sectionsList.length > 0 ? sectionsList : [{ label: 'Start', startIndex: 0 }]);
      setCurrentBookId("mock");
      setIsLoading(false);
    };
  }, []);

  // --- Initial Load ---
  useEffect(() => {
    const loadLibrary = async () => {
      try {
        const books = await getAllBooks();
        setLibrary(books);
        
        // Auto-open last read book if available
        if (books.length > 0) {
            setCurrentBookId(books[0].id);
        }
      } catch (err) {
        console.error('Failed to load library', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadLibrary();
  }, []);

  // --- Theme Effect ---
  useEffect(() => {
    localStorage.setItem('ttsSpeed', ttsSpeed.toString());
  }, [ttsSpeed]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('fontFamily', fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    if (theme === 'dark' || theme === 'bedtime') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'bedtime';
      return 'light';
    });
  };

  // --- Library Actions ---
  const onFileInputClick = (e: React.MouseEvent<HTMLInputElement, MouseEvent>) => {
    (e.target as HTMLInputElement).value = '';
  };

  const toggleToc = () => {
    setIsTocOpen(!isTocOpen);
    if (isNavOpen) setIsNavOpen(false);
  };

  const toggleNav = () => {
    setIsNavOpen(!isNavOpen);
    if (isTocOpen) setIsTocOpen(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const id = await addBook(file, file.name.replace(/\.epub$/i, ''));
      const books = await getAllBooks();
      setLibrary(books);
      setCurrentBookId(id); // Auto-open new book
    } catch (error) {
      console.error('Error adding book:', error);
      alert('Error reading file.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBook = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this book?')) {
      await deleteBook(id);
      const books = await getAllBooks();
      setLibrary(books);
    }
  };

  const handleSelectBook = (id: string) => {
    setCurrentBookId(id);
  };

  const handleCloseBook = async () => {
    setIsPlaying(false);
    // Save final progress
    if (currentBookId) {
       await updateBookProgress(currentBookId, currentIndex);
       const books = await getAllBooks();
       setLibrary(books);
    }
    
    setWords([]);
    setSections([]);
    setCurrentIndex(0);
    setBookTitle('');
    setCurrentBookId(null);
    setRealEndIndex(null);
  };

  const handleAskAi = async (questionOverride?: string) => {
    const questionToUse = typeof questionOverride === 'string' ? questionOverride : aiQuestion;
    if (!questionToUse.trim() || isAiLoading) return;
    setIsAiLoading(true);
    try {
      let context = '';
      let useSummaryCall = false;

      // Find current chapter index
      let currentChapterIdx = 0;
      for (let i = 0; i < sections.length; i++) {
        if (sections[i].startIndex <= currentIndex) {
          currentChapterIdx = i;
        } else {
          break;
        }
      }

      if (questionToUse === "Remind me what happened recently") {
        // From start of previous chapter (if exists) to now
        const startIdx = currentChapterIdx > 0 ? sections[currentChapterIdx - 1].startIndex : 0;
        context = words.slice(startIdx, currentIndex + 1).map(w => w.text).join(' ');
        useSummaryCall = true;
      } else if (questionToUse === "Remind me what happened in this chapter so far") {
        // From start of current chapter to now
        const startIdx = sections[currentChapterIdx]?.startIndex || 0;
        context = words.slice(startIdx, currentIndex + 1).map(w => w.text).join(' ');
        useSummaryCall = true;
      } else {
        // Full context for other questions
        context = words.slice(0, currentIndex + 1).map(w => w.text).join(' ');
      }

      const response = useSummaryCall
        ? await summarizeRecent(context)
        : await askAboutBook(questionToUse, context);

      setAiResponse(response);
    } catch {
      setAiResponse('Failed to get response from AI.');
    } finally {
      setIsAiLoading(false);
    }
  };

  // --- Book Loading Logic ---
  const processBook = useCallback(async (bookRecord: BookRecord) => {
      try {
        const arrayBuffer = await bookRecord.file.arrayBuffer();
        if (!arrayBuffer) throw new Error('No array buffer');

        const book = ePub(arrayBuffer);
        await book.ready;
        
        const metadata = await book.loaded.metadata;
        setBookTitle(metadata.title || bookRecord.title);
        
        // @ts-ignore
        await book.loaded.navigation; 
  
        let allWords: WordData[] = [];
        const spine = book.spine as any;
        const hrefToStartIndex: Record<string, number> = {};
        
        const sectionsToLoad = spine.length || 0;
        
        for (let i = 0; i < sectionsToLoad; i++) {
          // @ts-ignore
          const item = spine.get(i);
          if (item) {
            try {
              const cleanHref = item.href.split('#')[0];
              if (!(cleanHref in hrefToStartIndex)) {
                hrefToStartIndex[cleanHref] = allWords.length;
              }
  
              const contents = await book.load(item.href);
              let doc: Document | null = null;
              
              if (typeof contents === 'string') {
                const parser = new DOMParser();
                doc = parser.parseFromString(contents, 'application/xhtml+xml');
              } else if (contents instanceof Document) {
                doc = contents;
              } else if (typeof contents === 'object' && contents !== null) {
                if ('body' in contents || 'documentElement' in contents) {
                    doc = contents as Document;
                }
              }
  
              if (doc && doc.body) {
                  const sectionWords = extractWordsFromDoc(doc);
                  if (sectionWords.length > 0) {
                      allWords = [...allWords, ...sectionWords];
                  }
              }
            } catch (sectionError) {
              console.error(`Error loading section ${i}:`, sectionError);
            }
          }
        }
  
        const loadedSections: { label: string; startIndex: number }[] = [];
        // @ts-ignore
        const toc = book.navigation.toc;
        
        const flattenToc = (items: any[]) => {
          items.forEach(item => {
            if (item.href && item.label) {
              const cleanHref = item.href.split('#')[0];
              const startIndex = hrefToStartIndex[cleanHref];
              
              if (startIndex !== undefined) {
                loadedSections.push({
                  label: item.label.trim(),
                  startIndex: startIndex
                });
              }
            }
            if (item.subitems && item.subitems.length > 0) {
              flattenToc(item.subitems);
            }
          });
        };
  
        if (toc && toc.length > 0) {
          flattenToc(toc);
        } else {
          loadedSections.push({ label: 'Start of Book', startIndex: 0 });
        }
  
        setWords(allWords);
        setSections(loadedSections);
        setCurrentIndex(bookRecord.lastPosition || 0);
        if (bookRecord.wpm) {
            setWpm(bookRecord.wpm);
        }

        // Logic for Real End Detection
        if (bookRecord.realEndIndex !== undefined) {
            setRealEndIndex(bookRecord.realEndIndex);
        } else if (bookRecord.realEndQuote) {
            // If we have the quote cached but not the index, find it and save index
            const idx = findQuoteIndex(bookRecord.realEndQuote, allWords);
            if (idx !== null) {
                 setRealEndIndex(idx);
                 updateBookRealEndIndex(bookRecord.id, idx);
            }
        } else {
            // Otherwise, if we have an API key, try to find it
            const apiKey = getGeminiApiKey();
            if (apiKey && loadedSections.length > 0) {
                const fullTextContext = allWords.map(w => w.text).join(' ');
                findRealEndOfBook(loadedSections.map(s => s.label), fullTextContext).then(quote => {
                    if (quote) {
                        updateBookRealEndQuote(bookRecord.id, quote); // Save quote
                        const idx = findQuoteIndex(quote, allWords);
                        if (idx !== null) {
                            setRealEndIndex(idx);
                            updateBookRealEndIndex(bookRecord.id, idx); // Save index
                        }
                    }
                });
            }
        }

      } catch (innerError) {
        console.error('Error processing book:', innerError);
        alert('Failed to parse EPUB file.');
        setCurrentBookId(null);
      }
  }, []);

  useEffect(() => {
    if (currentBookId && currentBookId !== 'mock') {
        setIsLoading(true);
        const bookRecord = library.find(b => b.id === currentBookId);
        if (bookRecord) {
            processBook(bookRecord).then(() => setIsLoading(false));
        } else {
            getBook(currentBookId).then(fetched => {
                if (fetched) {
                    processBook(fetched).then(() => setIsLoading(false));
                } else {
                    console.error('Book not found');
                    setCurrentBookId(null);
                    setIsLoading(false);
                }
            });
        }
    }
  }, [currentBookId, processBook, library]);

  // --- Reading Logic ---

  // Save progress when pausing
  useEffect(() => {
    if (!isPlaying && currentBookId) {
        updateBookProgress(currentBookId, currentIndex);
        setIsChapterBreak(false);
    }
  }, [isPlaying, currentIndex, currentBookId]);

  // Session Logging
  useEffect(() => {
    if (isPlaying) {
      if (sessionStartTimeRef.current === null) {
        sessionStartTimeRef.current = Date.now();
        wordsReadInSessionRef.current = 0;
      }
    } else if (sessionStartTimeRef.current !== null) {
      const durationMs = Date.now() - sessionStartTimeRef.current;
      const durationMins = durationMs / 60000;
      const wordsRead = wordsReadInSessionRef.current;
      const avgWpm = durationMins > 0 ? Math.round(wordsRead / durationMins) : 0;

      console.log(`Session Summary:
- Duration: ${(durationMs / 1000).toFixed(1)}s
- Words Read: ${wordsRead}
- Set WPM: ${wpm}
- Effective Avg WPM: ${avgWpm}`);
      
      sessionStartTimeRef.current = null;
      wordsReadInSessionRef.current = 0;
    }
  }, [isPlaying, wpm]);

  // Track words read
  useEffect(() => {
    if (isPlaying) {
      wordsReadInSessionRef.current += 1;
    }
  }, [currentIndex, isPlaying]);

  // Wake Lock & Fullscreen Logic
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isPlaying) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('Wake Lock is active');
        } catch (err) {
          if (err instanceof Error) {
            console.error(`${err.name}, ${err.message}`);
          }
        }
      }
    };

    const handleVisibilityChange = async () => {
      if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
      }
    };

    if (isPlaying) {
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn(`Error attempting to enable fullscreen mode: ${err.message}`);
        });
      }
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
    }
  }, [isPlaying]);


  const navigate = (type: NavigationType) => {
    setIsChapterBreak(false);
    const targetIndex = calculateNavigationTarget(currentIndex, words, sections, type);
    setCurrentIndex(targetIndex);
    setIsNavOpen(false);
  };

  const nextWord = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev >= words.length - 1) {
        setIsPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, [words.length]);

  useEffect(() => {
    if (isPlaying && words.length > 0) {
      let interval: number;
      let callback: () => void;

      if (isChapterBreak) {
          interval = 3000;
          callback = () => {
              setIsChapterBreak(false);
              nextWord();
          };
      } else {
          const currentWord = words[currentIndex].text || '';
          let multiplier = 1;

          if (currentWord.endsWith('.') || currentWord.endsWith('!') || currentWord.endsWith('?')) {
            multiplier = 2;
          } else if (currentWord.endsWith(',') || currentWord.endsWith(';') || currentWord.endsWith(':')) {
            multiplier = 1.5;
          }

          // Dynamic scaling timing adjustment
          const { prefix, suffix } = splitWord(currentWord);
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const idealFontSize = vh * 0.25;
          const maxSideChars = Math.max(prefix.length + 0.5, suffix.length + 0.5);
          const fittingFontSize = (vw * 0.9) / (1.2 * maxSideChars);

          if (fittingFontSize < idealFontSize) {
            multiplier *= 1.5;
          } else if (currentWord.length > 8) {
            multiplier *= 1.2;
          }

          interval = (60000 / wpm) * multiplier;

          const isNextChapterStart = sections.some(s => s.startIndex === currentIndex + 1);
          if (isNextChapterStart) {
              callback = () => setIsChapterBreak(true);
          } else {
              callback = nextWord;
          }
      }
      
      timerRef.current = window.setTimeout(callback, interval);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, wpm, words.length, currentIndex, nextWord, words, sections, isChapterBreak]);

  const handleSetIsPlaying = (playing: boolean) => {
    if (!playing && isPlaying && isChapterBreak) {
      // If pausing during chapter break, advance to next chapter
      const nextChapterIndex = currentIndex + 1;
      if (nextChapterIndex < words.length) {
        setCurrentIndex(nextChapterIndex);
      }
      setIsChapterBreak(false);
    }

    if (playing && !isPlaying) {
      const newIndex = findSentenceStart(currentIndex, words);
      setCurrentIndex(newIndex);
    }
    if (playing) {
        stopReadingAloud();
    }
    setIsPlaying(playing);
  }; 

  const stopReadingAloud = () => {
    if (chapterAudioControllerRef.current) {
      chapterAudioControllerRef.current.stop();
      chapterAudioControllerRef.current = null;
    }
    setIsReadingAloud(false);
    setIsSynthesizing(false);
  };

  const handleReadChapter = async () => {
    if (isReadingAloud || isSynthesizing) {
        stopReadingAloud();
        return;
    }

    if (!currentBookId || words.length === 0) return;

    // 1. Identify current chapter
    let currentChapterIdx = -1;
    for (let i = 0; i < sections.length; i++) {
        if (sections[i].startIndex <= currentIndex) {
            currentChapterIdx = i;
        } else {
            break;
        }
    }

    const chapterStart = sections[currentChapterIdx]?.startIndex || 0;
    const chapterEnd = sections[currentChapterIdx + 1]?.startIndex || words.length;
    const chapterWords = words.slice(chapterStart, chapterEnd);

    if (chapterWords.length === 0) return;

    setIsPlaying(false); // Stop RSVP

    try {
        // 2. Check Cache
        let audioChunks = await getChapterAudio(currentBookId, currentChapterIdx, ttsSpeed);

        if (!audioChunks) {
            setIsSynthesizing(true);
            const apiKey = getGeminiApiKey();
            if (!apiKey) {
                alert("Please set your Gemini API key in settings to use TTS.");
                setIsSynthesizing(false);
                return;
            }
            audioChunks = await synthesizeChapterAudio(chapterWords, ttsSpeed, apiKey);
            if (audioChunks.length > 0) {
                await saveChapterAudio(currentBookId, currentChapterIdx, ttsSpeed, audioChunks);
            }
            setIsSynthesizing(false);
        }

        if (audioChunks && audioChunks.length > 0) {
            playChapterAudio(audioChunks);
        }
    } catch (error) {
        console.error("Failed to read chapter aloud", error);
        setIsSynthesizing(false);
        setIsReadingAloud(false);
    }
  };

  const playChapterAudio = async (chunks: ArrayBuffer[]) => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass({ sampleRate: 24000 });

    setIsReadingAloud(true);

    const state = {
        isStopped: false,
        nextStartTime: audioCtx.currentTime,
        hasStarted: false,
    };

    const controller: AudioController = {
        stop: () => {
            state.isStopped = true;
            audioCtx.close();
        }
    };
    chapterAudioControllerRef.current = controller;

    for (let i = 0; i < chunks.length; i++) {
        if (state.isStopped) break;

        const pcmData = chunks[i];
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        if (state.nextStartTime < audioCtx.currentTime) {
            state.nextStartTime = audioCtx.currentTime;
        }

        const duration = schedulePcmChunk(audioCtx, pcmData, state.nextStartTime);
        state.nextStartTime += duration;
        state.hasStarted = true;
    }

    const checkEnded = setInterval(() => {
        if (state.isStopped) {
            clearInterval(checkEnded);
            return;
        }
        if (state.hasStarted && audioCtx.currentTime >= state.nextStartTime) {
            clearInterval(checkEnded);
            setIsReadingAloud(false);
            audioCtx.close();
            chapterAudioControllerRef.current = null;
        }
    }, 200);
  };



  return (
    <>
       <SettingsModal 
         isOpen={isSettingsOpen} 
         onClose={() => setIsSettingsOpen(false)}
         apiKey={geminiApiKey}
         setApiKey={setGeminiApiKey}
         ttsSpeed={ttsSpeed}
         setTtsSpeed={setTtsSpeed}
         fontFamily={fontFamily}
         setFontFamily={setFontFamily}
         onSave={() => {
             saveGeminiApiKey(geminiApiKey);
             setIsSettingsOpen(false);
             // Trigger real end detection logic if we don't have it yet and have a book loaded
             if (geminiApiKey && sections.length > 0 && words.length > 0 && currentBookId && !realEndIndex) {
                 const fullTextContext = words.map(w => w.text).join(' ');
                 findRealEndOfBook(sections.map(s => s.label), fullTextContext).then(quote => {
                    if (quote) {
                        updateBookRealEndQuote(currentBookId, quote);
                        const idx = findQuoteIndex(quote, words);
                        if (idx !== null) {
                            setRealEndIndex(idx);
                            updateBookRealEndIndex(currentBookId, idx);
                        }
                    }
                 });
             }
         }}
       />

       <AiModal 
         isOpen={isAskAiOpen}
         onClose={() => setIsAskAiOpen(false)}
         aiResponse={aiResponse}
         aiQuestion={aiQuestion}
         setAiQuestion={setAiQuestion}
         handleAskAi={handleAskAi}
         isAiLoading={isAiLoading}
         ttsSpeed={ttsSpeed}
       />
       
       {!currentBookId ? (
         <LibraryView 
           library={library}
           isLoading={isLoading}
           theme={theme}
           onSettingsClick={() => setIsSettingsOpen(true)}
           onToggleTheme={toggleTheme}
           onSelectBook={handleSelectBook}
           onDeleteBook={handleDeleteBook}
           onFileUpload={handleFileUpload}
           fileInputRef={fileInputRef}
           onFileInputClick={onFileInputClick}
         />
       ) : (
         <ReaderView 
            words={words}
            currentIndex={currentIndex}
            effectiveTotalWords={realEndIndex || words.length}
            realEndIndex={realEndIndex}
            isPlaying={isPlaying}
            setIsPlaying={handleSetIsPlaying}
            wpm={wpm}
            onWpmChange={(newWpm) => {
                setWpm(newWpm);
                if (currentBookId) updateBookWpm(currentBookId, newWpm);
            }}
            theme={theme}
            fontFamily={fontFamily}
            bookTitle={bookTitle}
            onCloseBook={handleCloseBook}
            onSettingsClick={() => setIsSettingsOpen(true)}
            onToggleTheme={toggleTheme}
            onAskAiClick={() => {
              setAiResponse('');
              setIsAskAiOpen(true);
            }}
            isAskAiOpen={isAskAiOpen}
            sections={sections}
            setCurrentIndex={setCurrentIndex}
            navigate={navigate}
            isNavOpen={isNavOpen}
            toggleNav={toggleNav}
            isTocOpen={isTocOpen}
            toggleToc={toggleToc}
            onReadChapter={handleReadChapter}
            isReadingAloud={isReadingAloud}
            isSynthesizing={isSynthesizing}
            isChapterBreak={isChapterBreak}
            upcomingChapterTitle={sections.find(s => s.startIndex === currentIndex + 1)?.label || ''}
         />
       )}
    </>
  );
}

export default App;
