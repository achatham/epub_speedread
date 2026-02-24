import { useState, useEffect, useCallback, useRef } from 'react';
import type { FirestoreStorage, BookRecord, ReadingSession } from '../utils/storage';
import { ref, getBytes } from 'firebase/storage';
import { storage } from '../utils/firebase';

export function useLibrary(
    storageProvider: FirestoreStorage | null,
    currentBookId: string | null,
    handleSelectBook: (id: string) => void
) {
    const [library, setLibrary] = useState<BookRecord[]>([]);
    const [sessions, setSessions] = useState<ReadingSession[]>([]);
    const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
    const hasAutoOpenedRef = useRef(false);

    // Initial Data Load
    useEffect(() => {
        if (!storageProvider) {
            setIsLoadingLibrary(false);
            return;
        }

        const loadLibrary = async () => {
            try {
                const [books, history] = await Promise.all([
                    storageProvider.getAllBooks(),
                    storageProvider.getAggregatedSessions()
                ]);

                setLibrary(books);
                setSessions(history);

                // Auto-open most recent book if any, but only once per app session
                if (books.length > 0 && !currentBookId && !hasAutoOpenedRef.current) {
                    const mostRecent = books[0];
                    hasAutoOpenedRef.current = true;
                    handleSelectBook(mostRecent.id);
                }
            } catch (err) {
                console.error('Failed to load library/history', err);
            } finally {
                setIsLoadingLibrary(false);
            }
        };

        loadLibrary();
    }, [storageProvider]);

    const handleUpdateBookTitle = useCallback(async (id: string, newTitle: string) => {
        if (!storageProvider) return;
        try {
            await storageProvider.updateBookTitle(id, newTitle);
            setLibrary(await storageProvider.getAllBooks());
        } catch (err) {
            console.error("Failed to update book title:", err);
        }
    }, [storageProvider]);

    const handleUpdateBookFinishedDate = useCallback(async (updates: { id: string, date: number }[]) => {
        if (!storageProvider) return;
        try {
            for (const update of updates) {
                await storageProvider.updateBookFinishedDate(update.id, update.date);
            }
            setLibrary(await storageProvider.getAllBooks());
        } catch (err) {
            console.error("Failed to update book finished date:", err);
        }
    }, [storageProvider]);

    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!storageProvider) return;
        const file = e.target.files?.[0];
        if (!file) return;
        setIsLoadingLibrary(true);
        try {
            const title = file.name.replace(/\.(epub|pdf)$/i, '');
            const id = await storageProvider.addBook(file, title);
            setLibrary(await storageProvider.getAllBooks());
            handleSelectBook(id);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingLibrary(false);
        }
    }, [storageProvider, handleSelectBook]);

    const handleLoadDemoBook = useCallback(async () => {
        if (!storageProvider || !storage) return;
        setIsLoadingLibrary(true);
        try {
            const demoRef = ref(storage, 'epubs/Frankenstein.epub');
            const bytes = await getBytes(demoRef);
            const blob = new Blob([bytes], { type: 'application/epub+zip' });
            const file = new File([blob], 'Frankenstein.epub', { type: 'application/epub+zip' });
            const id = await storageProvider.addBook(file, 'Frankenstein');
            setLibrary(await storageProvider.getAllBooks());
            handleSelectBook(id);
        } catch (e) {
            console.error("Failed to load demo book", e);
            alert("Failed to load the demo book. Please try again or upload your own.");
        } finally {
            setIsLoadingLibrary(false);
        }
    }, [storageProvider, handleSelectBook]);

    const handleDeleteBook = useCallback(async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!storageProvider) return;
        if (confirm('Delete this book?')) {
            await storageProvider.deleteBook(id);
            setLibrary(await storageProvider.getAllBooks());
        }
    }, [storageProvider]);

    const handleToggleArchive = useCallback(async (id: string, archived: boolean) => {
        if (!storageProvider) return;
        await storageProvider.updateBookArchived(id, archived);
        setLibrary(await storageProvider.getAllBooks());
    }, [storageProvider]);

    const refreshSessions = useCallback(async () => {
        if (storageProvider) {
            await storageProvider.aggregateSessions();
            setSessions(await storageProvider.getAggregatedSessions());
        }
    }, [storageProvider]);

    return {
        library,
        setLibrary,
        sessions,
        setSessions,
        isLoadingLibrary,
        setIsLoadingLibrary,
        handleUpdateBookTitle,
        handleUpdateBookFinishedDate,
        handleFileUpload,
        handleLoadDemoBook,
        handleDeleteBook,
        handleToggleArchive,
        refreshSessions
    };
}
