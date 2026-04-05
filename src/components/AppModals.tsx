import React from 'react';
import type { Theme, FontFamily } from '../hooks/useSettings';
import type { RsvpSettings, IllustrationRecord } from '../utils/storage';
import { SettingsModal } from './SettingsModal';
import { OnboardingModal } from './OnboardingModal';
import { AiModal } from './AiModal';
import { StatsView } from './StatsView';
import { BookSettingsModal } from './BookSettingsModal';

interface AppModalsProps {
    isSettingsOpen: boolean;
    setIsSettingsOpen: (open: boolean) => void;
    geminiApiKey: string;
    setGeminiApiKey: (key: string) => void;
    deepgramApiKey: string;
    setDeepgramApiKey: (key: string) => void;
    syncApiKey: boolean;
    setSyncApiKey: (sync: boolean) => void;
    ttsSpeed: number;
    setTtsSpeed: (speed: number) => void;
    autoLandscape: boolean;
    setAutoLandscape: (auto: boolean) => void;
    fontFamily: FontFamily;
    setFontFamily: React.Dispatch<React.SetStateAction<FontFamily>>;
    readerMode: 'rsvp' | 'paginated';
    setReaderMode: (mode: 'rsvp' | 'paginated') => void;
    rsvpSettings: RsvpSettings;
    setRsvpSettings: React.Dispatch<React.SetStateAction<RsvpSettings>>;
    user: any;
    handleSignIn: () => void;
    handleSignOut: () => void;

    isOnboardingOpen: boolean;
    setIsOnboardingOpen: (open: boolean) => void;
    storageProvider: any;
    setOnboardingCompleted: (completed: boolean) => void;
    saveGeminiApiKey: (key: string) => void;

    isAskAiOpen: boolean;
    setIsAskAiOpen: (open: boolean) => void;
    aiTab: 'ask' | 'illustrate';
    setAiTab: (tab: 'ask' | 'illustrate') => void;
    aiResponse: string;
    aiQuestion: string;
    setAiQuestion: (question: string) => void;
    aiContextMode: 'recent' | 'full';
    setAiContextMode: (mode: 'recent' | 'full') => void;
    illustrationQuery: string;
    setIllustrationQuery: (q: string) => void;
    handleAskAi: (qOverride?: string) => void;
    isAiLoading: boolean;
    illustrationPrompt: string;
    setIllustrationPrompt: (prompt: string) => void;
    illustrationImage: string | null;
    setIllustrationImage: (image: string | null) => void;
    isIllustrationLoading: boolean;
    handleGenerateIllustration: (description?: string) => void;
    illustrations: IllustrationRecord[];
    illustrationSuggestions: string[];
    setIllustrationSuggestions: React.Dispatch<React.SetStateAction<string[]>>;
    selectedSuggestions: string[];
    setSelectedSuggestions: React.Dispatch<React.SetStateAction<string[]>>;
    isSuggesting: boolean;
    handleSuggestIllustrations: () => void;
    handleGenerateMultipleIllustrations: () => void;

    isStatsOpen: boolean;
    setIsStatsOpen: (open: boolean) => void;
    sessions: any[];
    library: any[];
    currentBookId: string | null;
    theme: Theme;
    handleUpdateBookFinishedDate: (updates: { id: string, date: number }[]) => Promise<void>;

    isBookSettingsOpen: boolean;
    setIsBookSettingsOpen: (open: boolean) => void;
    bookTitle: string;
    handleUpdateBookTitle: (bookId: string, title: string) => Promise<void>;
    handleRecomputeRealEnd: () => Promise<void>;
    isRecomputingEnd: boolean;
    currentIndex: number;
    onClearFutureSessions: () => Promise<void>;
}

export function AppModals({
    isSettingsOpen, setIsSettingsOpen, geminiApiKey, setGeminiApiKey, deepgramApiKey, setDeepgramApiKey,
    syncApiKey, setSyncApiKey, ttsSpeed, setTtsSpeed, autoLandscape, setAutoLandscape,
    fontFamily, setFontFamily, readerMode, setReaderMode, rsvpSettings, setRsvpSettings, user, handleSignIn, handleSignOut,

    isOnboardingOpen, setIsOnboardingOpen, storageProvider, setOnboardingCompleted, saveGeminiApiKey,

    isAskAiOpen, setIsAskAiOpen, aiTab, setAiTab, aiResponse, aiQuestion, setAiQuestion,
    aiContextMode, setAiContextMode, illustrationQuery, setIllustrationQuery,
    handleAskAi, isAiLoading,
    illustrationPrompt, setIllustrationPrompt, illustrationImage, setIllustrationImage,
    isIllustrationLoading, handleGenerateIllustration, illustrations,
    illustrationSuggestions, setIllustrationSuggestions, selectedSuggestions, setSelectedSuggestions, isSuggesting,
    handleSuggestIllustrations, handleGenerateMultipleIllustrations,

    isStatsOpen, setIsStatsOpen, sessions, library, currentBookId, theme, handleUpdateBookFinishedDate,

    isBookSettingsOpen, setIsBookSettingsOpen, bookTitle, handleUpdateBookTitle, handleRecomputeRealEnd, isRecomputingEnd,
    currentIndex, onClearFutureSessions
}: AppModalsProps) {
    return (
        <>
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                apiKey={geminiApiKey}
                setApiKey={setGeminiApiKey}
                deepgramApiKey={deepgramApiKey}
                setDeepgramApiKey={setDeepgramApiKey}
                syncApiKey={syncApiKey}
                setSyncApiKey={setSyncApiKey}
                ttsSpeed={ttsSpeed}
                setTtsSpeed={setTtsSpeed}
                autoLandscape={autoLandscape}
                setAutoLandscape={setAutoLandscape}
                fontFamily={fontFamily}
                setFontFamily={setFontFamily}
                readerMode={readerMode}
                setReaderMode={setReaderMode}
                rsvpSettings={rsvpSettings}
                setRsvpSettings={setRsvpSettings}
                user={user}
                onSignIn={handleSignIn}
                onSignOut={handleSignOut}
                onSave={() => setIsSettingsOpen(false)}
            />

            <OnboardingModal
                isOpen={isOnboardingOpen}
                onClose={() => {
                    setIsOnboardingOpen(false);
                    setOnboardingCompleted(true);
                    storageProvider.updateSettings({ onboardingCompleted: true });
                }}
                apiKey={geminiApiKey}
                setApiKey={(k) => {
                    setGeminiApiKey(k);
                    saveGeminiApiKey(k);
                }}
                syncApiKey={syncApiKey}
                setSyncApiKey={setSyncApiKey}
                onComplete={() => {
                    setIsOnboardingOpen(false);
                    setOnboardingCompleted(true);
                    storageProvider.updateSettings({
                        onboardingCompleted: true,
                        syncApiKey: syncApiKey,
                        geminiApiKey: syncApiKey ? geminiApiKey : ""
                    });
                }}
            />

            <AiModal
                isOpen={isAskAiOpen}
                onClose={() => setIsAskAiOpen(false)}
                aiTab={aiTab}
                setAiTab={setAiTab}
                aiResponse={aiResponse}
                aiQuestion={aiQuestion}
                setAiQuestion={setAiQuestion}
                aiContextMode={aiContextMode}
                setAiContextMode={setAiContextMode}
                illustrationQuery={illustrationQuery}
                setIllustrationQuery={setIllustrationQuery}
                handleAskAi={handleAskAi}
                isAiLoading={isAiLoading}
                illustrationPrompt={illustrationPrompt}
                setIllustrationPrompt={setIllustrationPrompt}
                illustrationImage={illustrationImage}
                setIllustrationImage={setIllustrationImage}
                isIllustrationLoading={isIllustrationLoading}
                handleGenerateIllustration={handleGenerateIllustration}
                illustrations={illustrations}
                illustrationSuggestions={illustrationSuggestions}
                setIllustrationSuggestions={setIllustrationSuggestions}
                selectedSuggestions={selectedSuggestions}
                setSelectedSuggestions={setSelectedSuggestions}
                isSuggesting={isSuggesting}
                handleSuggestIllustrations={handleSuggestIllustrations}
                handleGenerateMultipleIllustrations={handleGenerateMultipleIllustrations}
                ttsSpeed={ttsSpeed}
            />

            <StatsView
                isOpen={isStatsOpen}
                onClose={() => setIsStatsOpen(false)}
                sessions={sessions}
                books={library}
                activeBookId={currentBookId}
                theme={theme}
                onUpdateBookFinishedDate={handleUpdateBookFinishedDate}
            />

            <BookSettingsModal
                isOpen={isBookSettingsOpen}
                onClose={() => setIsBookSettingsOpen(false)}
                currentTitle={bookTitle}
                onUpdateTitle={(title) => currentBookId ? handleUpdateBookTitle(currentBookId, title) : Promise.resolve()}
                onRecomputeRealEnd={handleRecomputeRealEnd}
                isProcessing={isRecomputingEnd}
                currentIndex={currentIndex}
                onClearFutureSessions={onClearFutureSessions}
            />
        </>
    );
}
