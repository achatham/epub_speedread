import type { RefObject } from 'react';
import { BookOpen, Moon, Settings, Sun, Sunset, Trash2, Upload, DownloadCloud, BarChart2 } from 'lucide-react';
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
  onLoadDemoBook
}: LibraryViewProps) {
     const bgClass = theme === 'bedtime' ? 'bg-black' : 'bg-white dark:bg-zinc-900';
     const textClass = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-900 dark:text-zinc-100';
     const cardBgClass = theme === 'bedtime' ? 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600' : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600';

     return (
        <div className={`flex flex-col items-center min-h-screen font-sans transition-colors duration-300 p-8 ${bgClass} ${textClass}`}>
            <div className="absolute top-4 right-4 flex gap-2">
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
                <div className="text-center opacity-50 mb-12 flex flex-col items-center gap-4">
                    <p>No books yet. Upload one to get started.</p>
                    {onLoadDemoBook && (
                        <button
                            onClick={onLoadDemoBook}
                            className="text-sm px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
                        >
                            <DownloadCloud size={16} />
                            Try "Frankenstein"
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
                            <div className="flex justify-between items-center mt-2">
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