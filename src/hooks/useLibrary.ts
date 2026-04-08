import { useEffect, useCallback, useRef } from 'react';
import type { FirestoreStorage } from '../utils/storage';
import { ref, getBytes } from 'firebase/storage';
import { storage } from '../utils/firebase';
import { useLibraryStore } from '../stores/useLibraryStore';

export function useLibrary(
    storageProvider: FirestoreStorage | null,
    currentBookId: string | null,
    handleSelectBook: (id: string) => void,
    isSettingsLoading: boolean,
    lastBookId: string | null | undefined
) {
    const setLibrary = useLibraryStore((state) => state.setLibrary);
    const setSessions = useLibraryStore((state) => state.setSessions);
    const setIsLoadingLibrary = useLibraryStore((state) => state.setIsLoadingLibrary);
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

                // Auto-open logic, only once per app session
                if (!isSettingsLoading && books.length > 0 && !currentBookId && !hasAutoOpenedRef.current) {
                    hasAutoOpenedRef.current = true;
                    if (lastBookId === null) {
                        // User closed on library page, do nothing
                    } else if (typeof lastBookId === 'string') {
                        // Try to open the specific book they had open
                        const target = books.find(b => b.id === lastBookId);
                        if (target) {
                            handleSelectBook(target.id);
                        }
                    } else if (lastBookId === undefined) {
                        // Legacy behavior: open most recent
                        handleSelectBook(books[0].id);
                    }
                }
            } catch (err) {
                console.error('Failed to load library/history', err);
            } finally {
                setIsLoadingLibrary(false);
            }
        };

        loadLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageProvider, isSettingsLoading, lastBookId, handleSelectBook]);

    const handleUpdateBookTitle = useCallback(async (id: string, newTitle: string) => {
        if (!storageProvider) return;
        try {
            await storageProvider.updateBookTitle(id, newTitle);
            setLibrary(await storageProvider.getAllBooks());
        } catch (err) {
            console.error("Failed to update book title:", err);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageProvider, handleSelectBook]);

    const handleDeleteBook = useCallback(async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!storageProvider) return;
        if (confirm('Delete this book?')) {
            await storageProvider.deleteBook(id);
            setLibrary(await storageProvider.getAllBooks());
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageProvider]);

    const handleToggleArchive = useCallback(async (id: string, archived: boolean) => {
        if (!storageProvider) return;
        await storageProvider.updateBookArchived(id, archived);
        setLibrary(await storageProvider.getAllBooks());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageProvider]);

    const refreshSessions = useCallback(async () => {
        if (storageProvider) {
            await storageProvider.aggregateSessions();
            setSessions(await storageProvider.getAggregatedSessions());
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageProvider]);

    return {
        handleUpdateBookTitle,
        handleUpdateBookFinishedDate,
        handleFileUpload,
        handleLoadDemoBook,
        handleDeleteBook,
        handleToggleArchive,
        refreshSessions
    };
}
