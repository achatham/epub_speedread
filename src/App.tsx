import React, { useState, useEffect, useRef, useCallback } from 'react';
import ePub from 'epubjs';
import { Play, Pause, SkipBack, Upload, Settings2, Moon, Sun, Trash2, BookOpen, Sunset } from 'lucide-react';
import { splitWord } from './utils/orp';
import { addBook, getAllBooks, getBook, deleteBook, updateBookProgress, updateBookWpm, type BookRecord } from './utils/storage';
import { extractWordsFromDoc, type WordData } from './utils/text-processing';

type Theme = 'light' | 'dark' | 'bedtime';

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
      // Basic EPUB validation/metadata extraction could happen here, 
      // but we'll trust epubjs to parse it later.
      // We use filename as initial title, but could extract real title 
      // by temporarily parsing it. For speed, just use filename.
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
       // Refresh library to show updated progress/timestamp
       const books = await getAllBooks();
       setLibrary(books);
    }
    
    setWords([]);
    setSections([]);
    setCurrentIndex(0);
    setBookTitle('');
    setCurrentBookId(null);
  };

  // --- Book Loading Logic ---
  const processBook = useCallback(async (bookRecord: BookRecord) => {
      try {
        const arrayBuffer = await bookRecord.file.arrayBuffer();
        if (!arrayBuffer) throw new Error('No array buffer');

        const book = ePub(arrayBuffer);
        await book.ready;
        
        const metadata = await book.loaded.metadata;
        setBookTitle(metadata.title || bookRecord.title); // Prefer metadata title
        
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
  
        // TOC Parsing
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
      } catch (innerError) {
        console.error('Error processing book:', innerError);
        alert('Failed to parse EPUB file.');
        setCurrentBookId(null); // Go back to library on error
      }
  }, []);

  useEffect(() => {
    if (currentBookId) {
        setIsLoading(true);
        const bookRecord = library.find(b => b.id === currentBookId);
        if (bookRecord) {
            processBook(bookRecord).then(() => setIsLoading(false));
        } else {
            // Book not found in library (maybe deleted?)
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
  }, [currentBookId, processBook]); // Library dependency removed to avoid re-loading on library updates

  // --- Reading Logic ---

  // Save progress when pausing
  useEffect(() => {
    if (!isPlaying && currentBookId) {
        // Debounce or just save
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


  const navigate = (type: 'book' | 'chapter' | 'prev-paragraph' | 'prev-sentence' | 'next-paragraph' | 'next-sentence') => {
    if (!words.length) return;
    let targetIndex = currentIndex;

    switch (type) {
        case 'book':
            targetIndex = 0;
            break;
        case 'chapter':
             const currentSection = sections.reduce((prev, curr) => {
                 return (curr.startIndex <= currentIndex && curr.startIndex > prev.startIndex) ? curr : prev;
             }, sections[0] || { startIndex: 0 });
             targetIndex = currentSection.startIndex;
             break;
        case 'prev-paragraph':
             if (words[currentIndex].isParagraphStart) {
                 for (let i = currentIndex - 1; i >= 0; i--) {
                     if (words[i].isParagraphStart) {
                         targetIndex = i;
                         break;
                     }
                 }
             } else {
                 for (let i = currentIndex; i >= 0; i--) {
                     if (words[i].isParagraphStart) {
                         targetIndex = i;
                         break;
                     }
                 }
             }
             break;
        case 'prev-sentence':
             if (words[currentIndex].isSentenceStart) {
                 for (let i = currentIndex - 1; i >= 0; i--) {
                     if (words[i].isSentenceStart) {
                         targetIndex = i;
                         break;
                     }
                 }
             } else {
                 for (let i = currentIndex; i >= 0; i--) {
                     if (words[i].isSentenceStart) {
                         targetIndex = i;
                         break;
                     }
                 }
             }
             break;
        case 'next-paragraph':
             for (let i = currentIndex + 1; i < words.length; i++) {
                 if (words[i].isParagraphStart) {
                     targetIndex = i;
                     break;
                 }
             }
             break;
        case 'next-sentence':
             for (let i = currentIndex + 1; i < words.length; i++) {
                 if (words[i].isSentenceStart) {
                     targetIndex = i;
                     break;
                 }
             }
             break;
    }
    
    targetIndex = Math.max(0, Math.min(words.length - 1, targetIndex));
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

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentBookId) return; // Only if reading

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          setIsPlaying(p => !p);
          break;
        case 'ArrowLeft':
          setCurrentIndex(prev => Math.max(0, prev - 10));
          break;
        case 'ArrowRight':
          setCurrentIndex(prev => Math.min(words.length - 1, prev + 10));
          break;
        case 'ArrowUp':
          setWpm(prev => {
              const next = Math.min(1500, prev + 50);
              updateBookWpm(currentBookId, next);
              return next;
          });
          break;
        case 'ArrowDown':
          setWpm(prev => {
              const next = Math.max(100, prev - 50);
              updateBookWpm(currentBookId, next);
              return next;
          });
          break;
        case 'Escape':
           if (isPlaying) setIsPlaying(false);
           else if (isNavOpen) setIsNavOpen(false);
           else if (isTocOpen) setIsTocOpen(false);
           else handleCloseBook();
           break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentBookId, isPlaying, isNavOpen, isTocOpen, words.length]);


  // --- Render: Library View ---
  if (!currentBookId) {
     const bgClass = theme === 'bedtime' ? 'bg-black' : 'bg-white dark:bg-zinc-900';
     const textClass = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-900 dark:text-zinc-100';
     const cardBgClass = theme === 'bedtime' ? 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600' : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600';

     return (
        <div className={`flex flex-col items-center min-h-screen font-sans transition-colors duration-300 p-8 ${bgClass} ${textClass}`}>
            <button 
                onClick={toggleTheme}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title={`Theme: ${theme}`}
            >
                {theme === 'light' ? <Sun size={24} /> : theme === 'dark' ? <Moon size={24} /> : <Sunset size={24} className="text-amber-600" />}
            </button>
            
            <h1 className="text-3xl font-light mb-8 mt-12">Your Library</h1>

            {library.length === 0 && !isLoading && (
                <div className="text-center opacity-50 mb-12">
                    <p>No books yet. Upload one to get started.</p>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl mb-12">
                {library.map(book => (
                    <div 
                        key={book.id} 
                        onClick={() => handleSelectBook(book.id)}
                        className={`group border rounded-lg p-6 hover:shadow-lg transition-all cursor-pointer relative ${cardBgClass}`}
                    >
                        <div className="flex items-start justify-between mb-4">
                            <BookOpen size={32} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                            <button 
                                onClick={(e) => handleDeleteBook(e, book.id)}
                                className="p-2 -mr-2 -mt-2 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-full transition-all"
                                title="Delete book"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                        <h3 className="font-semibold text-lg line-clamp-2 h-14">{book.title}</h3>
                        <p className="text-sm opacity-60 mt-2">
                             Last read: {new Date(book.timestamp).toLocaleDateString()}
                        </p>
                    </div>
                ))}
                
                {/* Upload Card */}
                <div 
                  className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors min-h-[200px] ${theme === 'bedtime' ? 'border-zinc-800 hover:bg-zinc-900' : 'border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/30'}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                    <Upload size={32} className="opacity-50 mb-4" />
                    <span className="font-medium">Add a new book</span>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        accept=".epub" 
                        style={{ display: 'none' }} 
                        onClick={onFileInputClick}
                    />
                </div>
            </div>
        </div>
     );
  }

  // --- Render: Reader View ---
  if (words.length === 0) {
      return (
        <div className={`flex flex-col items-center justify-center h-screen ${theme === 'bedtime' ? 'bg-black text-stone-400' : 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100'}`}>
            <div className="animate-pulse flex flex-col items-center">
                <div className={`h-4 w-48 rounded mb-4 ${theme === 'bedtime' ? 'bg-zinc-800' : 'bg-zinc-200 dark:bg-zinc-800'}`}></div>
                <div className={`h-4 w-32 rounded ${theme === 'bedtime' ? 'bg-zinc-800' : 'bg-zinc-200 dark:bg-zinc-800'}`}></div>
            </div>
            <button onClick={handleCloseBook} className="mt-8 text-sm opacity-50 hover:opacity-100 underline">Cancel</button>
        </div>
      );
  }

  const { prefix, focus, suffix } = splitWord(words[currentIndex].text || '');

  // Theme-derived classes
  const mainBg = theme === 'bedtime' ? 'bg-black' : 'bg-white dark:bg-zinc-900';
  const mainText = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-900 dark:text-zinc-100';
  
  const rsvpFocusColor = theme === 'bedtime' ? 'text-amber-600' : (theme === 'dark' ? 'text-red-500' : 'text-red-600');
  const rsvpContextClass = theme === 'bedtime' ? 'text-stone-600' : 'opacity-90';
  const guidelinesClass = theme === 'bedtime' ? 'bg-amber-900/30' : 'bg-red-600 dark:bg-red-500 opacity-30';

  // Progress Calculations
  const getProgressStats = () => {
    if (isPlaying || words.length === 0) return null;

    const percentage = Math.round(((currentIndex + 1) / words.length) * 100);
    
    // Find current chapter
    let currentChapterIdx = -1;
    for (let i = 0; i < sections.length; i++) {
        if (sections[i].startIndex <= currentIndex) {
            currentChapterIdx = i;
        } else {
            break;
        }
    }
    
    const nextChapterStartIndex = sections[currentChapterIdx + 1]?.startIndex || words.length;
    const wordsLeftInChapter = nextChapterStartIndex - currentIndex;
    const wordsLeftInBook = words.length - currentIndex;
    
    // Heuristic: +20% for punctuation/pauses
    const effectiveWpm = wpm / 1.2; 
    
    const formatDuration = (wordCount: number) => {
        const minutes = wordCount / effectiveWpm;
        const h = Math.floor(minutes / 60);
        const m = Math.floor(minutes % 60);
        const s = Math.floor((minutes * 60) % 60);
        
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    };

    return (
        <div className={`mt-4 text-xs space-y-1 ${theme === 'bedtime' ? 'text-stone-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
            <div className="flex gap-4 justify-center">
                <span>{percentage}% Complete</span>
                <span>•</span>
                <span>Page {Math.floor(currentIndex / 300) + 1} of {Math.ceil(words.length / 300)}</span>
            </div>
            <div className="flex gap-4 justify-center font-mono opacity-80">
                <span>Chapter: {formatDuration(wordsLeftInChapter)} left</span>
                <span>Book: {formatDuration(wordsLeftInBook)} left</span>
            </div>
        </div>
    );
  };
  
  return (
    <div className={`flex flex-col items-center justify-center h-screen font-sans transition-colors duration-300 relative ${mainBg} ${mainText}`}>
      {isPlaying && (
        <div 
          className="fixed inset-0 z-40 bg-transparent cursor-pointer"
          onClick={() => setIsPlaying(false)}
          title="Click to pause"
        />
      )}
      
      <div className="absolute top-8 text-center w-full px-4">
        <h3 className="m-0 font-normal opacity-60 text-lg truncate max-w-2xl mx-auto">{bookTitle}</h3>
        <p className="my-2 text-sm opacity-40">
          {currentIndex + 1} / {words.length} words
        </p>
        {!isPlaying && getProgressStats()}
      </div>

      <button 
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors z-10"
        title={`Theme: ${theme}`}
      >
        {theme === 'light' ? <Sun size={24} /> : theme === 'dark' ? <Moon size={24} /> : <Sunset size={24} className="text-amber-600" />}
      </button>

      {/* RSVP Display or Text Preview */}
      <div className={`relative flex items-center justify-center w-full max-w-2xl border-t border-b my-8 ${theme === 'bedtime' ? 'border-zinc-900' : 'border-zinc-200 dark:border-zinc-800'}`} style={{ height: '120px' }}>
        {isPlaying ? (
          <>
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-6 ${guidelinesClass}`}></div>
            <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-6 ${guidelinesClass}`}></div>

            <div className="flex w-full items-baseline justify-center text-5xl font-medium">
              <div className={`text-right whitespace-pre ${rsvpContextClass} flex-1`}>{prefix}</div>
              <div className={`${rsvpFocusColor} font-bold text-center px-0.5`}>{focus}</div>
              <div className={`text-left whitespace-pre ${rsvpContextClass} flex-1`}>{suffix}</div>
            </div>
          </>
        ) : (
          <div className={`text-xl leading-relaxed text-center px-8 ${theme === 'bedtime' ? 'text-stone-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
            {words.slice(currentIndex, currentIndex + 15).map(w => w.text).join(' ')}...
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-6 items-center w-full max-w-md px-4 relative z-50">
        <div 
          className={`w-full h-1 rounded-sm cursor-pointer relative group ${theme === 'bedtime' ? 'bg-zinc-900' : 'bg-zinc-200 dark:bg-zinc-800'}`}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / rect.width;
            setCurrentIndex(Math.floor(percentage * words.length));
          }}
        >
          <div 
            className={`h-full rounded-sm ${theme === 'bedtime' ? 'bg-stone-500' : 'bg-zinc-900 dark:bg-zinc-100'}`}
            style={{ width: `${(currentIndex / words.length) * 100}%` }}
          />
          <div className="absolute inset-y-0 -left-2 -right-2 bg-transparent opacity-0 group-hover:opacity-100 cursor-pointer" />
        </div>

        <div className="flex gap-4 items-center">
          {/* Navigation Menu */}
          <div className="relative">
            <button 
              className={`bg-transparent border p-2 px-4 rounded-md cursor-pointer flex items-center gap-2 transition-all ${theme === 'bedtime' ? 'border-zinc-800 text-stone-400 hover:bg-zinc-900' : 'border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100'} ${isNavOpen ? (theme === 'bedtime' ? 'bg-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800') : ''}`}
              onClick={toggleNav}
            >
              <SkipBack size={20} />
            </button>
            {isNavOpen && (
              <div className={`absolute bottom-14 left-0 w-64 border rounded-lg shadow-xl z-50 flex flex-col p-1 overflow-hidden ${theme === 'bedtime' ? 'bg-black border-zinc-800' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700'}`}>
                <div className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b mb-1 ${theme === 'bedtime' ? 'text-stone-600 border-zinc-900' : 'text-zinc-500 dark:text-zinc-400 border-zinc-100 dark:border-zinc-800'}`}>
                  Navigate
                </div>
                <button onClick={() => navigate('prev-paragraph')} className={`text-left px-3 py-2 text-sm rounded flex justify-between items-center group ${theme === 'bedtime' ? 'text-stone-400 hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}>
                   <span>Previous Paragraph</span>
                   <span className="opacity-50 text-xs group-hover:opacity-100">Paragraph</span>
                </button>
                <button onClick={() => navigate('prev-sentence')} className={`text-left px-3 py-2 text-sm rounded flex justify-between items-center group ${theme === 'bedtime' ? 'text-stone-400 hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}>
                   <span>Previous Sentence</span>
                   <span className="opacity-50 text-xs group-hover:opacity-100">Sentence</span>
                </button>
                <div className={`border-t my-1 ${theme === 'bedtime' ? 'border-zinc-900' : 'border-zinc-100 dark:border-zinc-800'}`}></div>
                 <button onClick={() => navigate('next-sentence')} className={`text-left px-3 py-2 text-sm rounded flex justify-between items-center ${theme === 'bedtime' ? 'text-stone-400 hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}>
                   <span>Next Sentence</span>
                </button>
                <button onClick={() => navigate('next-paragraph')} className={`text-left px-3 py-2 text-sm rounded flex justify-between items-center ${theme === 'bedtime' ? 'text-stone-400 hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}>
                   <span>Next Paragraph</span>
                </button>
                <div className={`border-t my-1 ${theme === 'bedtime' ? 'border-zinc-900' : 'border-zinc-100 dark:border-zinc-800'}`}></div>
                <button onClick={() => navigate('chapter')} className={`text-left px-3 py-2 text-sm rounded ${theme === 'bedtime' ? 'text-stone-400 hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}>
                  Restart Chapter
                </button>
                <button onClick={() => navigate('book')} className={`text-left px-3 py-2 text-sm rounded font-semibold ${theme === 'bedtime' ? 'text-amber-700 hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-red-600 dark:text-red-400'}`}>
                  Restart Book
                </button>
              </div>
            )}
          </div>

          <button 
            className={`border-none p-2 px-4 rounded-md cursor-pointer flex items-center gap-2 transition-all ${theme === 'bedtime' ? 'bg-stone-800 text-stone-200 hover:bg-stone-700' : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200'}`} 
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>
          
          <div className="relative">
            <button 
              className={`bg-transparent border p-2 px-4 rounded-md cursor-pointer flex items-center gap-2 transition-all ${theme === 'bedtime' ? 'border-zinc-800 text-stone-400 hover:bg-zinc-900' : 'border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100'} ${isTocOpen ? (theme === 'bedtime' ? 'bg-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800') : ''}`}
              onClick={toggleToc}
            >
              <Settings2 size={20} />
            </button>
            
            {isTocOpen && (
              <div className={`absolute bottom-14 right-0 w-80 max-h-[60vh] overflow-y-auto border rounded-lg shadow-xl z-50 flex flex-col p-2 gap-1 ${theme === 'bedtime' ? 'bg-black border-zinc-800' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700'}`}>
                <div className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b mb-1 sticky top-0 z-10 ${theme === 'bedtime' ? 'text-stone-600 border-zinc-900 bg-black' : 'text-zinc-500 dark:text-zinc-400 border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900'}`}>
                  Table of Contents
                </div>
                {sections.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-center text-zinc-400">No chapters found</div>
                ) : (
                  sections.map((section, idx) => (
                    <button
                      key={idx}
                      className={`text-left px-3 py-2.5 text-sm rounded-md transition-colors leading-normal ${theme === 'bedtime' ? 'text-stone-400 hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}
                      onClick={() => {
                        setCurrentIndex(section.startIndex);
                        setIsTocOpen(false);
                      }}
                    >
                      {section.label}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className={`flex items-center gap-4 w-full ${theme === 'bedtime' ? 'text-stone-500' : 'text-zinc-900 dark:text-zinc-100'}`}>
          <span className="min-w-[5rem] text-right">{wpm} WPM</span>
          <input 
            type="range" 
            min="100" 
            max="1200" 
            step="50" 
            value={wpm} 
            onChange={(e) => {
                const newWpm = parseInt(e.target.value);
                setWpm(newWpm);
                if (currentBookId) {
                    updateBookWpm(currentBookId, newWpm);
                }
            }} 
            className={`flex-1 h-2 rounded-lg appearance-none cursor-pointer ${theme === 'bedtime' ? 'accent-amber-700 bg-zinc-900' : 'accent-zinc-900 dark:accent-zinc-100 bg-zinc-200 dark:bg-zinc-700'}`}
          />
        </div>
      </div>
      
      <button 
        className="absolute bottom-8 opacity-30 hover:opacity-60 transition-opacity background-none border-none cursor-pointer text-inherit"
        onClick={handleCloseBook}
      >
        Close Book
      </button>
    </div>
  );
}

export default App;