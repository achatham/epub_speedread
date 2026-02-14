import { useState, useMemo } from 'react';
import type { RefObject } from 'react';
import { BookOpen, Moon, Settings, Sun, Sunset, Trash2, Upload, DownloadCloud, BarChart2, Info, Github, Search, Archive, Plus, Inbox, X, ChevronRight, Clock } from 'lucide-react';
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
  onToggleArchive: (id: string, archived: boolean) => void;
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
  onToggleArchive,
  onFileUpload,
  fileInputRef,
  onFileInputClick,
  onStatsClick,
  onLoadDemoBook,
  onAboutClick
}: LibraryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

  const filteredBooks = useMemo(() => {
    return library.filter(book => {
      const matchesSearch = book.meta.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTab = activeTab === 'archived' ? book.archived === true : !book.archived;
      return matchesSearch && matchesTab;
    });
  }, [library, searchQuery, activeTab]);

  const bgClass = theme === 'bedtime' ? 'bg-black' : 'bg-white dark:bg-zinc-900';
  const textClass = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-900 dark:text-zinc-100';
  const cardBgClass = theme === 'bedtime' ? 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600' : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600';

  return (
    <div className={`flex flex-col items-center min-h-dvh font-sans transition-colors duration-300 p-4 md:p-8 ${bgClass} ${textClass}`}>
      <div className="w-full max-w-5xl">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-light">Library</h1>
          <div className="flex gap-1 sm:gap-2">
            <button
              onClick={onAboutClick}
              className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="About Speed Reader"
            >
              <Info size={22} />
            </button>
            <button
              onClick={onStatsClick}
              className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Reading Stats"
            >
              <BarChart2 size={22} />
            </button>
            <button
              onClick={onSettingsClick}
              className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Settings"
            >
              <Settings size={22} />
            </button>
            <button
              onClick={onToggleTheme}
              className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title={`Theme: ${theme}`}
            >
              {theme === 'light' ? <Sun size={22} /> : theme === 'dark' ? <Moon size={22} /> : <Sunset size={22} className="text-amber-600" />}
            </button>
          </div>
        </header>

        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={18} />
            <input
              type="text"
              placeholder="Search your library..."
              className={`w-full pl-10 pr-10 py-2.5 rounded-xl border transition-all focus:ring-2 focus:ring-blue-500/20 outline-none ${theme === 'bedtime' ? 'bg-zinc-900/50 border-zinc-800' : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-800'}`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100">
                <X size={18} />
              </button>
            )}
          </div>

          <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl self-start sm:self-auto">
            <button
              onClick={() => setActiveTab('active')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'active' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'opacity-50'}`}
            >
              <Inbox size={16} />
              Active
            </button>
            <button
              onClick={() => setActiveTab('archived')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'archived' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'opacity-50'}`}
            >
              <Archive size={16} />
              Archived
            </button>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-5 py-2.5 rounded-xl flex items-center gap-2 hover:opacity-90 transition-opacity font-medium shadow-sm"
          >
            <Plus size={20} />
            Add Book
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileUpload}
            accept=".epub,.pdf"
            className="hidden"
            onClick={onFileInputClick}
          />
        </div>

        {filteredBooks.length === 0 && !isLoading && (
          <div className="text-center opacity-70 my-20 flex flex-col items-center gap-4">
            <p className="text-lg">
              {searchQuery ? 'No books match your search.' : activeTab === 'archived' ? 'No archived books.' : 'Your library is empty.'}
            </p>
            {library.length === 0 && onLoadDemoBook && activeTab === 'active' && (
              <button
                onClick={onLoadDemoBook}
                className="text-base font-medium px-6 py-3 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 transition-opacity flex items-center gap-3 shadow-md mt-4"
              >
                <DownloadCloud size={20} />
                Try "Frankenstein" Demo
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {filteredBooks.map(book => {
            const isGhost = !book.storage.localFile;
            const progress = Math.min(100, Math.round((book.progress.wordIndex / (book.analysis.realEndIndex || book.meta.totalWords || 1)) * 100));

            return (
              <div
                key={book.id}
                onClick={() => onSelectBook(book.id)}
                className={`group border rounded-xl p-4 hover:shadow-md transition-all cursor-pointer relative ${cardBgClass} flex flex-col gap-3`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <BookOpen size={20} className={`transition-opacity ${isGhost ? 'opacity-20' : 'opacity-60 group-hover:opacity-100'}`} />
                    {isGhost && (
                      <DownloadCloud size={12} className="absolute -bottom-1 -right-1 text-blue-500" />
                    )}
                  </div>
                  <h3 className="font-semibold text-sm line-clamp-1 flex-1">{book.meta.title}</h3>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleArchive(book.id, !book.archived); }}
                      className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-all"
                      title={book.archived ? "Unarchive" : "Archive"}
                    >
                      {book.archived ? <Inbox size={16} /> : <Archive size={16} />}
                    </button>
                    <button
                      onClick={(e) => onDeleteBook(e, book.id)}
                      className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-lg transition-all"
                      title="Delete book"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-end mb-1.5">
                    <p className="text-[10px] font-medium opacity-40 uppercase tracking-wider flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(book.progress.lastReadAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-[10px] font-mono font-bold opacity-60">
                      {progress}%
                    </p>
                  </div>
                  <div className={`w-full h-1 rounded-full overflow-hidden ${theme === 'bedtime' ? 'bg-zinc-800' : 'bg-zinc-200 dark:bg-zinc-700'}`}>
                    <div
                      className={`h-full transition-all duration-500 ${theme === 'bedtime' ? 'bg-amber-700' : 'bg-blue-500'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <footer className="mt-auto py-12 text-center border-t border-zinc-100 dark:border-zinc-800 w-full">
          <a
            href="https://github.com/achatham/epub_speedread"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 opacity-40 hover:opacity-100 transition-opacity text-sm font-medium"
          >
            <Github size={18} />
            View on GitHub
          </a>
        </footer>
      </div>
    </div>
  );
}
