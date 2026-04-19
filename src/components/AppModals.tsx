
import { SettingsModal } from './SettingsModal';
import { OnboardingModal } from './OnboardingModal';
import { AiModal } from './AiModal';
import { StatsView } from './StatsView';
import { BookSettingsModal } from './BookSettingsModal';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useUIStore } from '../stores/useUIStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useReaderStore } from '../stores/useReaderStore';

interface AppModalsProps {
    user: any;
    handleSignIn: () => void;
    handleSignOut: () => void;
    storageProvider: any;
    handleAskAi: (qOverride?: string) => void;
    isAiLoading: boolean;
    isIllustrationLoading: boolean;
    handleGenerateIllustration: (description?: string) => void;
    isSuggesting: boolean;
    handleSuggestIllustrations: () => void;
    handleGenerateMultipleIllustrations: () => void;
    handleUpdateBookFinishedDate: (updates: { id: string, date: number }[]) => Promise<void>;
    handleUpdateBookTitle: (bookId: string, title: string) => Promise<void>;
    handleRecomputeRealEnd: () => Promise<void>;
    isRecomputingEnd: boolean;
    onClearFutureSessions: () => Promise<void>;
    onClearRecentSessions: () => Promise<void>;
}

export function AppModals({
    user, handleSignIn, handleSignOut, storageProvider,
    handleAskAi, isAiLoading,
    isIllustrationLoading, handleGenerateIllustration,
    isSuggesting, handleSuggestIllustrations, handleGenerateMultipleIllustrations,
    handleUpdateBookFinishedDate, handleUpdateBookTitle, handleRecomputeRealEnd, isRecomputingEnd,
    onClearFutureSessions, onClearRecentSessions
}: AppModalsProps) {
    const settings = useSettingsStore();
    const ui = useUIStore();
    const library = useLibraryStore();
    const reader = useReaderStore();

    return (
        <>
            <SettingsModal
                isOpen={ui.isSettingsOpen}
                onClose={() => ui.setIsSettingsOpen(false)}
                apiKey={settings.geminiApiKey}
                setApiKey={settings.setGeminiApiKey}
                deepgramApiKey={settings.deepgramApiKey}
                setDeepgramApiKey={settings.setDeepgramApiKey}
                syncApiKey={settings.syncApiKey}
                setSyncApiKey={settings.setSyncApiKey}
                ttsSpeed={settings.ttsSpeed}
                setTtsSpeed={settings.setTtsSpeed}
                autoLandscape={settings.autoLandscape}
                setAutoLandscape={settings.setAutoLandscape}
                apiSyncToken={settings.apiSyncToken}
                setApiSyncToken={(token) => {
                    settings.setApiSyncToken(token);
                    storageProvider?.updateSettings({ apiSyncToken: token }).catch(console.error);
                }}
                fontFamily={settings.fontFamily}
                setFontFamily={settings.setFontFamily as any}
                rsvpSettings={settings.rsvpSettings}
                setRsvpSettings={settings.setRsvpSettings as any}
                user={user}
                onSignIn={handleSignIn}
                onSignOut={handleSignOut}
                onSave={() => ui.setIsSettingsOpen(false)}
                onViewLogs={() => { ui.setIsLogsOpen(true); ui.setIsSettingsOpen(false); }}
            />

            <OnboardingModal
                isOpen={ui.isOnboardingOpen}
                onClose={() => {
                    ui.setIsOnboardingOpen(false);
                    settings.setOnboardingCompleted(true);
                    storageProvider.updateSettings({ onboardingCompleted: true });
                }}
                apiKey={settings.geminiApiKey}
                setApiKey={(k) => {
                    settings.setGeminiApiKey(k);
                    storageProvider?.updateSettings({ geminiApiKey: k }).catch(console.error);
                }}
                syncApiKey={settings.syncApiKey}
                setSyncApiKey={settings.setSyncApiKey}
                onComplete={() => {
                    ui.setIsOnboardingOpen(false);
                    settings.setOnboardingCompleted(true);
                    storageProvider.updateSettings({
                        onboardingCompleted: true,
                        syncApiKey: settings.syncApiKey,
                        geminiApiKey: settings.syncApiKey ? settings.geminiApiKey : ""
                    });
                }}
            />

            <AiModal
                isOpen={ui.isAskAiOpen}
                onClose={() => ui.setIsAskAiOpen(false)}
                aiTab={ui.aiTab}
                setAiTab={ui.setAiTab}
                aiResponse={ui.aiResponse}
                aiQuestion={ui.aiQuestion}
                setAiQuestion={ui.setAiQuestion}
                aiContextMode={ui.aiContextMode}
                setAiContextMode={ui.setAiContextMode}
                illustrationQuery={ui.illustrationQuery}
                setIllustrationQuery={ui.setIllustrationQuery}
                handleAskAi={handleAskAi}
                isAiLoading={isAiLoading}
                illustrationPrompt={ui.illustrationPrompt}
                setIllustrationPrompt={ui.setIllustrationPrompt}
                illustrationImage={ui.illustrationImage}
                setIllustrationImage={ui.setIllustrationImage}
                isIllustrationLoading={isIllustrationLoading}
                handleGenerateIllustration={handleGenerateIllustration}
                illustrations={ui.illustrations as any}
                illustrationSuggestions={ui.illustrationSuggestions}
                setIllustrationSuggestions={ui.setIllustrationSuggestions as any}
                selectedSuggestions={ui.selectedSuggestions}
                setSelectedSuggestions={ui.setSelectedSuggestions as any}
                isSuggesting={isSuggesting}
                handleSuggestIllustrations={handleSuggestIllustrations}
                handleGenerateMultipleIllustrations={handleGenerateMultipleIllustrations}
                ttsSpeed={settings.ttsSpeed}
            />

            <StatsView
                isOpen={ui.isStatsOpen}
                onClose={() => ui.setIsStatsOpen(false)}
                sessions={library.sessions}
                books={library.library}
                activeBookId={reader.currentBookId}
                theme={settings.theme}
                onUpdateBookFinishedDate={handleUpdateBookFinishedDate}
            />

            <BookSettingsModal
                isOpen={ui.isBookSettingsOpen}
                onClose={() => ui.setIsBookSettingsOpen(false)}
                currentTitle={reader.bookTitle}
                onUpdateTitle={(title) => reader.currentBookId ? handleUpdateBookTitle(reader.currentBookId, title) : Promise.resolve()}
                onRecomputeRealEnd={handleRecomputeRealEnd}
                isProcessing={isRecomputingEnd}
                currentIndex={reader.currentIndex}
                onClearFutureSessions={onClearFutureSessions}
                onClearRecentSessions={onClearRecentSessions}
            />
        </>
    );
}
