import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ReaderMenu } from './ReaderMenu';
import type { WordData } from '../utils/text-processing';
import { type Theme, type FontFamily } from '../hooks/useSettings';
import type { RsvpSettings } from '../utils/storage';
import { getFitRange } from '../utils/layout';

interface PaginatedReaderViewProps {
    words: WordData[];
    currentIndex: number;
    effectiveTotalWords: number;
    realEndIndex: number | null;
    furthestIndex: number | null;
    wpm: number;
    onWpmChange: (wpm: number) => void;
    theme: Theme;
    fontFamily: FontFamily;
    bookTitle: string;
    onCloseBook: () => void;
    onSettingsClick: () => void;
    onToggleTheme: () => void;
    onAskAiClick: () => void;
    onBookSettingsClick: () => void;
    sections: { label: string; startIndex: number }[];
    setCurrentIndex: (index: number) => void;
    navigate: (type: 'book' | 'chapter' | 'prev-paragraph' | 'prev-sentence' | 'next-paragraph' | 'next-sentence') => void;
    onReadChapter: () => void;
    isReadingAloud: boolean;
    isSynthesizing: boolean;
    onStatsClick?: () => void;
    vanityWpmRatio: number;
    rsvpSettings: RsvpSettings;
}

export function PaginatedReaderView({
    words,
    currentIndex,
    effectiveTotalWords,
    furthestIndex,
    wpm,
    onWpmChange,
    theme,
    fontFamily,
    bookTitle,
    onCloseBook,
    onSettingsClick,
    onToggleTheme,
    onAskAiClick,
    onBookSettingsClick,
    sections,
    setCurrentIndex,
    navigate,
    onReadChapter,
    isReadingAloud,
    isSynthesizing,
    onStatsClick
}: PaginatedReaderViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [pageRange, setPageRange] = useState({ start: 0, end: 0 });

    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerSize({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    const fontClasses: Record<FontFamily, string> = {
        system: 'ui-sans-serif, system-ui, sans-serif',
        serif: 'font-serif',
        mono: 'font-mono',
        opendyslexic: 'font-opendyslexic',
        atkinson: 'font-hyperlegible'
    };

    const fontStyle = fontClasses[fontFamily];
    const fontSize = 20; // Base font size
    const lineHeight = 32;

    // Use memo to find the page start. We want to find the largest range starting at or before currentIndex that fits and includes currentIndex.
    // Simplification: the page starts at some index and ends at some index.
    // When navigating next, we set currentIndex to current pageRange.end.
    // When navigating prev, it's harder - we need to layout backwards.

    // For now, let's keep it simple: the current page ALWAYS starts at a cached pageStart.
    const [pageStart, setPageStart] = useState(0);

    useEffect(() => {
        if (currentIndex < pageRange.start || currentIndex >= pageRange.end) {
            // If we jumped or navigated, we need to find a new pageStart.
            // Simplification: if we're moving forward, use the old end. If jumping, just use currentIndex as start.
            setPageStart(currentIndex);
        }
    }, [currentIndex, pageRange]);

    useEffect(() => {
        if (containerSize.width > 0 && containerSize.height > 0) {
            const font = `${fontSize}px ${fontStyle}`;
            const { endIndex } = getFitRange(words, pageStart, containerSize.width, containerSize.height, font, lineHeight);
            setPageRange({ start: pageStart, end: endIndex });
        }
    }, [pageStart, containerSize, words, fontSize, fontStyle]);

    const handleNextPage = () => {
        if (pageRange.end < words.length) {
            setCurrentIndex(pageRange.end);
            setPageStart(pageRange.end);
        }
    };

    const handlePrevPage = () => {
        if (pageStart > 0) {
            // Find a start index that ends exactly at pageStart.
            // Rough estimate: back up by a page's worth of words.
            const wordsPerPage = pageRange.end - pageRange.start;
            const estimatedStart = Math.max(0, pageStart - wordsPerPage);

            // For a better result, we could iterate to find a start that fits perfectly,
            // but for now let's just jump back.
            setPageStart(estimatedStart);
            setCurrentIndex(estimatedStart);
        }
    };

    const mainBg = theme === 'bedtime' ? 'bg-black' : 'bg-white dark:bg-zinc-900';
    const mainText = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-900 dark:text-zinc-100';

    // Find current chapter
    let activeChapterIdx = -1;
    for (let i = 0; i < sections.length; i++) {
        if (sections[i].startIndex <= currentIndex) {
            activeChapterIdx = i;
        } else {
            break;
        }
    }

    const percentage = Math.round((Math.min(currentIndex + 1, effectiveTotalWords) / effectiveTotalWords) * 100);

    return (
        <div className={`flex flex-col h-dvh relative ${mainBg} ${mainText}`} style={{ fontFamily: fontStyle }}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
                <button onClick={onCloseBook} className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
                    <ChevronLeft size={20} />
                    <span className="hidden sm:inline">Library</span>
                </button>
                <div className="text-center truncate px-4">
                    <h3 className="text-sm font-medium opacity-80 truncate max-w-[200px] sm:max-w-md">{bookTitle}</h3>
                    <div className="text-[10px] opacity-40 uppercase tracking-widest">{sections[activeChapterIdx]?.label}</div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-medium opacity-60">{percentage}%</span>
                </div>
            </div>

            {/* Page Content */}
            <div
                ref={containerRef}
                className="flex-1 p-6 sm:p-12 overflow-hidden relative select-none"
                onClick={(e) => {
                    // Tap left side for prev, right for next
                    const x = e.clientX;
                    const w = window.innerWidth;
                    if (x < w * 0.3) handlePrevPage();
                    else if (x > w * 0.7) handleNextPage();
                }}
            >
                {words.length > 0 && containerSize.width > 0 && (
                    <div className="leading-[32px] text-[20px]">
                        {words.slice(pageRange.start, pageRange.end).map((word, i) => {
                            const idx = pageRange.start + i;
                            const isCurrent = idx === currentIndex;
                            return (
                                <React.Fragment key={idx}>
                                    {word.isParagraphStart && idx !== pageRange.start && <div className="h-4" />}
                                    <span
                                        className={`cursor-pointer px-0.5 rounded transition-colors ${
                                            isCurrent
                                                ? (theme === 'bedtime' ? 'bg-amber-900/40 text-amber-500' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold underline decoration-red-500/50')
                                                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                        }`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setCurrentIndex(idx);
                                        }}
                                    >
                                        {word.text}
                                    </span>
                                    {' '}
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer Navigation */}
            <div className="flex items-center justify-between p-4 border-t border-zinc-100 dark:border-zinc-800 shrink-0 select-none">
                <button
                    onClick={handlePrevPage}
                    disabled={pageStart === 0}
                    className="p-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-20 transition-colors"
                >
                    <ChevronLeft size={24} />
                </button>

                <div className="flex items-center gap-4">
                    <div className="h-1.5 w-32 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                            className={`h-full ${theme === 'bedtime' ? 'bg-amber-700' : 'bg-zinc-400 dark:bg-zinc-600'}`}
                            style={{ width: `${percentage}%` }}
                        />
                    </div>
                </div>

                <button
                    onClick={handleNextPage}
                    disabled={pageRange.end >= words.length}
                    className="p-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-20 transition-colors"
                >
                    <ChevronRight size={24} />
                </button>
            </div>

            {/* Menu Button Integrated */}
            <ReaderMenu
                readerMode="paginated"
                wpm={wpm}
                onWpmChange={onWpmChange}
                onSettingsClick={onSettingsClick}
                onBookSettingsClick={onBookSettingsClick}
                onStatsClick={onStatsClick || (() => { })}
                onToggleTheme={onToggleTheme}
                theme={theme}
                bookTitle={bookTitle}
                sections={sections}
                activeChapterIdx={activeChapterIdx}
                setCurrentIndex={setCurrentIndex}
                onCloseBook={onCloseBook}
                onAskAiClick={onAskAiClick}
                onReadChapter={onReadChapter}
                isReadingAloud={isReadingAloud}
                isSynthesizing={isSynthesizing}
                navigate={navigate}
                furthestIndex={furthestIndex}
                effectiveTotalWords={effectiveTotalWords}
                currentIndex={currentIndex}
            />
        </div>
    );
}
