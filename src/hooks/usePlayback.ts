import { useState, useCallback, useRef, useEffect } from 'react';
import { calculateNavigationTarget, type NavigationType } from '../utils/navigation';
import { getResumeIndex } from '../utils/playback';
import { calculateRsvpInterval } from '../utils/text-processing';
import { AudioBookPlayer } from '../utils/AudioBookPlayer';
import { useReaderStore } from '../stores/useReaderStore';
import { useSettingsStore } from '../stores/useSettingsStore';

export function usePlayback(audioPlayerRef: React.MutableRefObject<AudioBookPlayer | null>) {
    const { 
        words, sections, currentIndex, setCurrentIndex, 
        isPlaying, setIsPlaying, 
        isHoldPaused, setIsHoldPaused, 
        isChapterBreak, setIsChapterBreak,
        isReadingAloud, setIsReadingAloud
    } = useReaderStore();
    
    const { wpm, rsvpSettings, autoLandscape } = useSettingsStore();

    const [playbackStartTime, setPlaybackStartTime] = useState<number | null>(null);

    const rotationTriggerRef = useRef(0);
    const lastRotationTimeRef = useRef(0);
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);
    const timerRef = useRef<number | null>(null);

    // Expose these as simple state equivalents to components above to allow
    // rotation/hold pause handling in App
    const setRotationTrigger = useCallback((val: number) => { rotationTriggerRef.current = val; }, []);
    const setLastRotationTime = useCallback((val: number) => { lastRotationTimeRef.current = val; }, []);

    const handleSetIsPlaying = useCallback((playing: boolean) => {
        if (playing && !isPlaying) {
            setPlaybackStartTime(Date.now());

            const nextIndex = getResumeIndex(currentIndex, words, sections, isChapterBreak);
            if (isChapterBreak) setIsChapterBreak(false);

            setCurrentIndex(nextIndex);

            if (isReadingAloud && audioPlayerRef.current) {
                audioPlayerRef.current.stop();
                setIsReadingAloud(false);
            }

            // Attempt immediate trigger for Wake Lock and Fullscreen
            if ('wakeLock' in navigator) {
                navigator.wakeLock.request('screen').then(lock => {
                    wakeLockRef.current = lock;
                    console.log('Wake Lock acquired via gesture');
                }).catch(e => console.warn('Wake Lock failed via gesture', e));
            }
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().then(() => {
                    if (autoLandscape && (screen.orientation as any)?.lock) {
                        (screen.orientation as any).lock('landscape').catch((e: any) => console.warn('Orientation lock failed', e));
                    }
                }).catch(e => console.warn('Fullscreen failed via gesture', e));
            } else {
                if (autoLandscape && (screen.orientation as any)?.lock) {
                    (screen.orientation as any).lock('landscape').catch((e: any) => console.warn('Orientation lock failed', e));
                }
            }
        } else if (!playing && isPlaying) {
            setPlaybackStartTime(null);
            setIsHoldPaused(false);
            if (wakeLockRef.current) {
                wakeLockRef.current.release();
                wakeLockRef.current = null;
            }
        }
        setIsPlaying(playing);
    }, [isPlaying, currentIndex, words, sections, isChapterBreak, isReadingAloud, autoLandscape, setIsReadingAloud, setCurrentIndex, audioPlayerRef, setIsChapterBreak, setIsHoldPaused, setIsPlaying]);

    const navigate = useCallback((type: NavigationType) => {
        setIsChapterBreak(false);
        setCurrentIndex(calculateNavigationTarget(currentIndex, words, sections, type));
    }, [currentIndex, words, sections, setCurrentIndex, setIsChapterBreak]);

    const nextWord = useCallback(() => {
        setCurrentIndex((prev: number) => {
            if (prev >= words.length - 1) { setIsPlaying(false); return prev; }
            return prev + 1;
        });
    }, [words.length, setCurrentIndex, setIsPlaying]);

    // Track playback time
    useEffect(() => {
        if (isPlaying && !isHoldPaused && playbackStartTime) {
            // Do nothing, already tracking
        } else if (isPlaying && !isHoldPaused && !playbackStartTime) {
            setPlaybackStartTime(Date.now());
        } else if (playbackStartTime) {
            setPlaybackStartTime(null);
        }
    }, [isHoldPaused, isPlaying, playbackStartTime]);

    // Main RSVP Timer loop
    useEffect(() => {
        if (isPlaying && !isHoldPaused && playbackStartTime && words.length > 0) {
            const timeSinceRotation = Date.now() - lastRotationTimeRef.current;
            if (timeSinceRotation < rsvpSettings.orientationDelay) {
                return;
            }

            let interval: number;
            let callback: () => void;

            if (isChapterBreak) {
                interval = rsvpSettings.chapterBreakDelay;
                callback = () => setIsChapterBreak(false);
            } else {
                const currentWord = words[currentIndex]?.text || '';
                let effectiveWpm = wpm * rsvpSettings.vanityWpmRatio;

                if (playbackStartTime && rsvpSettings.wpmRampDuration > 0) {
                    const elapsed = Date.now() - playbackStartTime;
                    if (elapsed < rsvpSettings.wpmRampDuration) {
                        const progress = elapsed / rsvpSettings.wpmRampDuration;
                        effectiveWpm = (wpm * rsvpSettings.vanityWpmRatio) * (0.5 + 0.5 * progress);
                    }
                }

                interval = calculateRsvpInterval(currentWord, effectiveWpm, rsvpSettings);

                if (sections.some(s => s.startIndex === currentIndex + 1)) {
                    callback = () => {
                        setCurrentIndex((prev: number) => prev + 1);
                        setIsChapterBreak(true);
                    };
                } else {
                    callback = nextWord;
                }
            }

            timerRef.current = window.setTimeout(callback, interval);
        }
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [isPlaying, isHoldPaused, wpm, words, currentIndex, nextWord, sections, isChapterBreak, rsvpSettings, playbackStartTime, setCurrentIndex, setIsChapterBreak]);

    return {
        handleSetIsPlaying,
        setRotationTrigger,
        setLastRotationTime,
        navigate,
        wakeLockRef
    };
}

