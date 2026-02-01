import React, { useState, useEffect, useRef, useCallback } from 'react';
import ePub from 'epubjs';
import { Play, Pause, SkipBack, Upload, Settings2, Moon, Sun } from 'lucide-react';
import { splitWord } from './utils/orp';
import { saveCurrentBook, loadCurrentBook, clearCurrentBook } from './utils/storage';
import { extractWordsFromDoc, type WordData } from './utils/text-processing';

function App() {
  const [words, setWords] = useState<WordData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wpm, setWpm] = useState(300);
  const [bookTitle, setBookTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sections, setSections] = useState<{ label: string; startIndex: number }[]>([]);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return true;
    }
    return false;
  });
  
  const timerRef = useRef<number | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  const wordsReadInSessionRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Track words read during session
  useEffect(() => {
    if (isPlaying) {
      wordsReadInSessionRef.current += 1;
    }
  }, [currentIndex]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const processBook = async (arrayBuffer: ArrayBuffer) => {
    try {
      if (!arrayBuffer) {
          throw new Error('No array buffer provided');
      }
      
      const book = ePub(arrayBuffer);
      await book.ready;
      
      const metadata = await book.loaded.metadata;
      setBookTitle(metadata.title);
      
      // Ensure navigation is loaded for TOC labels
      // @ts-ignore
      await book.loaded.navigation; 

      let allWords: WordData[] = [];
      const spine = book.spine as any;
      const hrefToStartIndex: Record<string, number> = {};
      
      // Load all sections
      const sectionsToLoad = spine.length || 0;
      
      for (let i = 0; i < sectionsToLoad; i++) {
        // @ts-ignore - epubjs types are tricky
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

      // Build sections list from the official Table of Contents (TOC)
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
      setCurrentIndex(0);
    } catch (innerError) {
      console.error('Error processing book:', innerError);
      alert('Failed to parse EPUB file. See console for details.');
    }
  };

  useEffect(() => {
    const checkStoredBook = async () => {
      try {
        const storedBook = await loadCurrentBook();
        if (storedBook && storedBook.file) {
          const arrayBuffer = await storedBook.file.arrayBuffer();
          await processBook(arrayBuffer);
          if (storedBook.lastPosition) {
             setCurrentIndex(storedBook.lastPosition);
          }
        }
      } catch (err) {
        console.error('Failed to load stored book', err);
      } finally {
        setIsLoading(false);
      }
    };
    checkStoredBook();
  }, []);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  const onFileInputClick = (e: React.MouseEvent<HTMLInputElement, MouseEvent>) => {
    (e.target as HTMLInputElement).value = '';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      await processBook(arrayBuffer);
      await saveCurrentBook(file, file.name);
    } catch (error) {
      console.error('Error starting file load:', error);
      alert('Error reading file.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetBook = async () => {
    await clearCurrentBook();
    setWords([]);
    setSections([]);
    setCurrentIndex(0);
    setBookTitle('');
  };

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const toggleToc = () => {
    setIsTocOpen(!isTocOpen);
    if (isNavOpen) setIsNavOpen(false);
  };

  const toggleNav = () => {
    setIsNavOpen(!isNavOpen);
    if (isTocOpen) setIsTocOpen(false);
  };

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
    
    // Safety clamp
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
  }, [isPlaying, wpm, words.length, currentIndex, nextWord, words]); // Added words to dependency

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (words.length === 0) return;
      
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          setCurrentIndex(prev => Math.max(0, prev - 10));
          break;
        case 'ArrowRight':
          setCurrentIndex(prev => Math.min(words.length - 1, prev + 10));
          break;
        case 'ArrowUp':
          setWpm(prev => Math.min(1500, prev + 50));
          break;
        case 'ArrowDown':
          setWpm(prev => Math.max(100, prev - 50));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [words.length, isPlaying, togglePlay]);

  if (words.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen font-sans bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
         <button 
          onClick={toggleTheme}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          title="Toggle theme"
        >
          {isDark ? <Sun size={24} /> : <Moon size={24} />}
        </button>
        <div 
          className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-12 text-center cursor-pointer transition-all hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          onClick={() => {
            fileInputRef.current?.click();
          }}
        >
          <Upload size={48} strokeWidth={1} className="mb-4 opacity-50 mx-auto" />
          <h2 className="text-2xl font-semibold mb-2">{isLoading ? 'Loading Ebook...' : 'Load an EPUB file'}</h2>
          <p className="text-zinc-500 dark:text-zinc-400">Click or drag and drop your ebook here to start reading</p>
          <input 
            type="file" 
            ref={fileInputRef} 
            onClick={onFileInputClick}
            onChange={handleFileUpload} 
            accept=".epub" 
            style={{ display: 'none' }} 
          />
        </div>
      </div>
    );
  }

  const { prefix, focus, suffix } = splitWord(words[currentIndex].text || '');

  return (
    <div className="flex flex-col items-center justify-center h-screen font-sans bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 transition-colors duration-300 relative">
      <div className="absolute top-8 text-center w-full px-4">
        <h3 className="m-0 font-normal opacity-60 text-lg truncate max-w-2xl mx-auto">{bookTitle}</h3>
        <p className="my-2 text-sm opacity-40">
          {currentIndex + 1} / {words.length} words
        </p>
      </div>

      <button 
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors z-10"
        title="Toggle theme"
      >
        {isDark ? <Sun size={24} /> : <Moon size={24} />}
      </button>

      <div className="relative text-5xl font-medium h-[120px] flex items-center justify-center w-full max-w-2xl border-t border-b border-zinc-200 dark:border-zinc-800 my-8">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-red-600 dark:bg-red-500 opacity-30"></div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-red-600 dark:bg-red-500 opacity-30"></div>

        <div className="grid grid-cols-[1fr_2rem_1fr] w-full items-center">
          <div className="text-right opacity-90 whitespace-pre">{prefix}</div>
          <div className="text-red-600 dark:text-red-500 font-bold text-center w-8">{focus}</div>
          <div className="text-left opacity-90 whitespace-pre">{suffix}</div>
        </div>
      </div>

      <div className="flex flex-col gap-6 items-center w-full max-w-md px-4">
        <div 
          className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-sm cursor-pointer relative group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / rect.width;
            setCurrentIndex(Math.floor(percentage * words.length));
          }}
        >
          <div 
            className="h-full bg-zinc-900 dark:bg-zinc-100 rounded-sm"
            style={{ width: `${(currentIndex / words.length) * 100}%` }}
          />
          <div className="absolute inset-y-0 -left-2 -right-2 bg-transparent opacity-0 group-hover:opacity-100 cursor-pointer" />
        </div>

        <div className="flex gap-4 items-center">
          {/* Navigation Menu Button */}
          <div className="relative">
            <button 
              className={`bg-transparent border border-zinc-300 dark:border-zinc-700 p-2 px-4 rounded-md cursor-pointer flex items-center gap-2 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 ${isNavOpen ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
              onClick={toggleNav}
              title="Navigation / Rewind"
            >
              <SkipBack size={20} />
            </button>
            {isNavOpen && (
              <div className="absolute bottom-14 left-0 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl z-50 flex flex-col p-1 overflow-hidden">
                <div className="px-3 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800 mb-1">
                  Navigate
                </div>
                <button onClick={() => navigate('prev-paragraph')} className="text-left px-3 py-2 text-sm rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex justify-between items-center group">
                   <span>Previous Paragraph</span>
                   <span className="opacity-50 text-xs group-hover:opacity-100">Paragraph</span>
                </button>
                <button onClick={() => navigate('prev-sentence')} className="text-left px-3 py-2 text-sm rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex justify-between items-center group">
                   <span>Previous Sentence</span>
                   <span className="opacity-50 text-xs group-hover:opacity-100">Sentence</span>
                </button>
                <div className="border-t border-zinc-100 dark:border-zinc-800 my-1"></div>
                 <button onClick={() => navigate('next-sentence')} className="text-left px-3 py-2 text-sm rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex justify-between items-center">
                   <span>Next Sentence</span>
                </button>
                <button onClick={() => navigate('next-paragraph')} className="text-left px-3 py-2 text-sm rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex justify-between items-center">
                   <span>Next Paragraph</span>
                </button>
                <div className="border-t border-zinc-100 dark:border-zinc-800 my-1"></div>
                <button onClick={() => navigate('chapter')} className="text-left px-3 py-2 text-sm rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                  Restart Chapter
                </button>
                <button onClick={() => navigate('book')} className="text-left px-3 py-2 text-sm rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold text-red-600 dark:text-red-400">
                  Restart Book
                </button>
              </div>
            )}
          </div>

          <button 
            className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-none p-2 px-4 rounded-md cursor-pointer flex items-center gap-2 transition-all hover:bg-zinc-800 dark:hover:bg-zinc-200" 
            onClick={togglePlay}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>
          
          <div className="relative">
            <button 
              className={`bg-transparent border border-zinc-300 dark:border-zinc-700 p-2 px-4 rounded-md cursor-pointer flex items-center gap-2 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 ${isTocOpen ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
              onClick={toggleToc}
              title="Table of Contents"
            >
              <Settings2 size={20} />
            </button>
            
            {isTocOpen && (
              <div className="absolute bottom-14 right-0 w-64 max-h-80 overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl z-50 flex flex-col p-1">
                <div className="px-3 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800 mb-1">
                  Table of Contents
                </div>
                {sections.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-center text-zinc-400">No chapters found</div>
                ) : (
                  sections.map((section, idx) => (
                    <button
                      key={idx}
                      className="text-left px-3 py-2 text-sm rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 truncate transition-colors"
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

        <div className="flex items-center gap-4 w-full text-zinc-900 dark:text-zinc-100">
          <span className="min-w-[5rem] text-right">{wpm} WPM</span>
          <input 
            type="range" 
            min="100" 
            max="1200" 
            step="50" 
            value={wpm} 
            onChange={(e) => setWpm(parseInt(e.target.value))} 
            className="flex-1 accent-zinc-900 dark:accent-zinc-100 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>
      
      <button 
        className="absolute bottom-8 opacity-30 hover:opacity-60 transition-opacity background-none border-none cursor-pointer text-zinc-900 dark:text-zinc-100"
        onClick={handleResetBook}
        title="Load a new file"
      >
        Load different book
      </button>
    </div>
  );
}

export default App;