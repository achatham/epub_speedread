import React, { useState, useEffect, useRef, useCallback } from 'react';
import ePub from 'epubjs';
import { addBook, getAllBooks, getBook, deleteBook, updateBookProgress, updateBookWpm, type BookRecord } from './utils/storage';
import { extractWordsFromDoc, type WordData } from './utils/text-processing';
import { calculateNavigationTarget, findSentenceStart, type NavigationType } from './utils/navigation';
import { getGeminiApiKey, setGeminiApiKey as saveGeminiApiKey, findRealEndOfBook, askAboutBook } from './utils/gemini';
import { LibraryView } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { SettingsModal } from './components/SettingsModal';
import { AiModal } from './components/AiModal';

type Theme = 'light' | 'dark' | 'bedtime';

// Helper function to detect real end index
const detectRealEnd = async (currentSections: { label: string }[], currentWords: WordData[]) => {
  const fullTextContext = currentWords.map(w => w.text).join(' ');
  const quote = await findRealEndOfBook(currentSections.map(s => s.label), fullTextContext);
  if (quote) {
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
  const [geminiApiKey, setGeminiApiKey] = useState(getGeminiApiKey() || '');
  const [realEndIndex, setRealEndIndex] = useState<number | null>(null);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

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
  
  const timerRef = useRef<number | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  const wordsReadInSessionRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const root = document.documentElement;
    root.classList.remove('dark', 'bedtime');
    
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'bedtime') {
      root.classList.add('dark'); // Bedtime uses dark mode UI basics
      root.classList.add('bedtime');
    }
    
    localStorage.setItem('theme', theme);
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

  const handleAskAi = async () => {
    if (!aiQuestion.trim() || isAiLoading) return;
    setIsAiLoading(true);
    try {
      const context = words.slice(0, currentIndex + 1).map(w => w.text).join(' ');
      const response = await askAboutBook(aiQuestion, context);
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
  
              let contents = await book.load(item.href);
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

        // Try to find real end if API key is present
        const apiKey = getGeminiApiKey();
        if (apiKey && loadedSections.length > 0) {
            detectRealEnd(loadedSections, allWords).then(idx => {
                if (idx !== null) setRealEndIndex(idx);
            });
        }

      } catch (innerError) {
        console.error('Error processing book:', innerError);
        alert('Failed to parse EPUB file.');
        setCurrentBookId(null);
      }
  }, []);

  useEffect(() => {
    if (currentBookId) {
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
  }, [currentIndex]);

  // Fullscreen Logic
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
      const currentWord = words[currentIndex].text || '';
      let multiplier = 1;
      
      if (currentWord.endsWith('.') || currentWord.endsWith('!') || currentWord.endsWith('?')) {
        multiplier = 2;
      } else if (currentWord.endsWith(',') || currentWord.endsWith(';') || currentWord.endsWith(':')) {
        multiplier = 1.5;
      }
      
      if (currentWord.length > 8) {
        multiplier *= 1.2;
      }

      const interval = (60000 / wpm) * multiplier;
      timerRef.current = window.setTimeout(nextWord, interval);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, wpm, words.length, currentIndex, nextWord, words]); 

  const handleSetIsPlaying = (playing: boolean) => {
    if (playing && !isPlaying) {
      const newIndex = findSentenceStart(currentIndex, words);
      setCurrentIndex(newIndex);
    }
    setIsPlaying(playing);
  }; 



  return (
    <>
       <SettingsModal 
         isOpen={isSettingsOpen} 
         onClose={() => setIsSettingsOpen(false)}
         apiKey={geminiApiKey}
         setApiKey={setGeminiApiKey}
         onSave={() => {
             saveGeminiApiKey(geminiApiKey);
             setIsSettingsOpen(false);
             // Trigger real end detection logic
             if (geminiApiKey && sections.length > 0 && words.length > 0) {
                 detectRealEnd(sections, words).then(idx => {
                    if (idx !== null) setRealEndIndex(idx);
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
         />
       )}
    </>
  );
}

export default App;
