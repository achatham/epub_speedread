import type { RefObject } from 'react';
import { BookOpen, Moon, Settings, Sun, Sunset, Trash2, Upload, DownloadCloud, BarChart2, Info } from 'lucide-react';
import type { BookRecord } from '../utils/storage';

type Theme = 'light' | 'dark' | 'bedtime';

interface LibraryViewProps {
  library: BookRecord[];
  isLoading: boolean;
  theme: Theme;
  onSettingsClick: () => void;
  onToggleTheme: () => void;
  onSelectBook: (id: string) => void;
  onDeleteBook: (e: React.MouseEvent, id: string) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileInputClick: (e: React.MouseEvent<HTMLInputElement, MouseEvent>) => void;
  onStatsClick?: () => void;
  onLoadDemoBook?: () => void;
  onAboutClick?: () => void;
}

export function LibraryView({
  library,
  isLoading,
  theme,
  onSettingsClick,
  onToggleTheme,
  onSelectBook,
  onDeleteBook,
  onFileUpload,
  fileInputRef,
  onFileInputClick,
  onStatsClick,
  onLoadDemoBook,
  onAboutClick
}: LibraryViewProps) {
     const bgClass = theme === 'bedtime' ? 'bg-black' : 'bg-white dark:bg-zinc-900';
     const textClass = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-900 dark:text-zinc-100';
     const cardBgClass = theme === 'bedtime' ? 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600' : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600';

     return (
        <div className={`flex flex-col items-center min-h-dvh font-sans transition-colors duration-300 p-8 ${bgClass} ${textClass}`}>
            <div className="absolute top-4 right-4 flex gap-2">
                <button
                    onClick={onAboutClick}
                    className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="About Speed Reader"
                >
                    <Info size={24} />
                </button>
                <button
                    onClick={onStatsClick}
                    className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="Reading Stats"
                >
                    <BarChart2 size={24} />
                </button>
                <button
                    onClick={onSettingsClick}
                    className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="Settings"
                >
                    <Settings size={24} />
                </button>
                <button 
                    onClick={onToggleTheme}
                    className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title={`Theme: ${theme}`}
                >
                    {theme === 'light' ? <Sun size={24} /> : theme === 'dark' ? <Moon size={24} /> : <Sunset size={24} className="text-amber-600" />}
                </button>
            </div>
            
            <h1 className="text-3xl font-light mb-8 mt-12">Your Library</h1>

            {library.length === 0 && !isLoading && (
                <div className="text-center opacity-70 mb-12 flex flex-col items-center gap-6">
                    <p className="text-lg">No books yet. Upload one to get started.</p>
                    {onLoadDemoBook && (
                        <button
                            onClick={onLoadDemoBook}
                            className="text-base font-medium px-6 py-3 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 transition-opacity flex items-center gap-3 shadow-md"
                        >
                            <DownloadCloud size={20} />
                            Try "Frankenstein" Demo
                        </button>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl mb-12">
                {library.map(book => {
                    const isGhost = !book.storage.localFile;
                    return (
                        <div 
                            key={book.id} 
                            onClick={() => onSelectBook(book.id)}
                            className={`group border rounded-lg p-6 hover:shadow-lg transition-all cursor-pointer relative ${cardBgClass}`}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="relative">
                                    <BookOpen size={32} className={`transition-opacity ${isGhost ? 'opacity-20' : 'opacity-50 group-hover:opacity-100'}`} />
                                    {isGhost && (
                                        <DownloadCloud size={16} className="absolute -bottom-1 -right-1 text-blue-500" />
                                    )}
                                </div>
                                <button 
                                    onClick={(e) => onDeleteBook(e, book.id)}
                                    className="p-2 -mr-2 -mt-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-full transition-all"
                                    title="Delete book"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                            <h3 className="font-semibold text-lg line-clamp-2 h-14">{book.meta.title}</h3>

                            {/* Progress Bar */}
                            <div className="mt-4 mb-1">
                                <div className="flex justify-between items-end mb-1">
                                    <p className="text-[10px] font-bold opacity-40 uppercase tracking-wider">
                                        Progress
                                    </p>
                                    <p className="text-[10px] font-mono opacity-60">
                                        {Math.min(100, Math.round((book.progress.wordIndex / (book.analysis.realEndIndex || book.meta.totalWords || 1)) * 100))}%
                                    </p>
                                </div>
                                <div className={`w-full h-1.5 rounded-full overflow-hidden ${theme === 'bedtime' ? 'bg-zinc-800' : 'bg-zinc-200 dark:bg-zinc-700'}`}>
                                    <div
                                        className={`h-full transition-all duration-500 ${theme === 'bedtime' ? 'bg-amber-700' : 'bg-blue-500'}`}
                                        style={{ width: `${Math.min(100, (book.progress.wordIndex / (book.analysis.realEndIndex || book.meta.totalWords || 1)) * 100)}%` }}
                                    />
                                </div>
                                <p className="text-[10px] opacity-40 mt-1 font-mono">
                                    {book.progress.wordIndex.toLocaleString()} / {(book.analysis.realEndIndex || book.meta.totalWords || '?').toLocaleString()} words
                                </p>
                            </div>

                            <div className="flex justify-between items-center mt-4">
                                <p className="text-xs opacity-60">
                                    Last read: {new Date(book.progress.lastReadAt).toLocaleDateString()}
                                </p>
                                {isGhost && (
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500/80 bg-blue-500/10 px-1.5 py-0.5 rounded">
                                        Cloud
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
                
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
                        onChange={onFileUpload} 
                        accept=".epub" 
                        style={{ display: 'none' }} 
                        onClick={onFileInputClick}
                    />
                </div>
            </div>
        </div>
     );
}