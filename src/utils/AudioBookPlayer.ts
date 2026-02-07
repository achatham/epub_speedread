import { type FirestoreStorage, type AudioChunk } from './storage';
import { synthesizeChapterAudio, schedulePcmChunk } from './tts';
import type { WordData } from './text-processing';

export interface PlayerCallbacks {
  onProgress: (index: number) => void;
  onStateChange: (state: { isSynthesizing: boolean; isPlaying: boolean }) => void;
  onSessionFinished: (stats: {
    startTime: number;
    endTime: number;
    startWordIndex: number;
    endWordIndex: number;
    durationSeconds: number;
  }) => void;
  onError: (error: string) => void;
}

export class AudioBookPlayer {
  private audioCtx: AudioContext | null = null;
  private stopRequested = false;
  private sessionStart: { index: number; time: number } | null = null;
  private monitorInterval: number | null = null;
  private activeTimeouts: number[] = [];
  
  // Track state internally to prevent race conditions
  private _isSynthesizing = false;
  private _isPlaying = false;

  private storage: FirestoreStorage;
  private apiKey: string;

  constructor(
    storage: FirestoreStorage,
    apiKey: string
  ) {
    this.storage = storage;
    this.apiKey = apiKey;
  }

  get isActive() {
    return this._isSynthesizing || this._isPlaying;
  }

  updateApiKey(key: string) {
    this.apiKey = key;
  }

  async playChapter(
    bookId: string,
    chapterIndex: number,
    chapterWords: WordData[],
    globalStartIndex: number,
    currentWordIndex: number,
    speed: number,
    callbacks: PlayerCallbacks
  ) {
    // Reset state
    this.stop();
    this.stopRequested = false;
    this.updateState(true, false, callbacks);

    try {
      // 1. Check Cache
      let chunks = await this.storage.getChapterAudio(bookId, chapterIndex, speed);

      // 2. Synthesize if needed
      if (!chunks) {
        if (!this.apiKey) {
          throw new Error("API Key required for TTS");
        }
        
        chunks = await synthesizeChapterAudio(chapterWords, speed, this.apiKey);
        
        if (this.stopRequested) return; // Check cancel

        if (chunks.length > 0) {
          await this.storage.saveChapterAudio(bookId, chapterIndex, speed, chunks);
        }
      }

      this.updateState(false, true, callbacks);

      // 3. Playback
      if (chunks && chunks.length > 0) {
        await this.playAudioChunks(chunks, globalStartIndex, currentWordIndex, callbacks);
      } else {
        // No audio generated?
        this.stop(callbacks);
      }

    } catch (e: any) {
      console.error("AudioPlayer Error:", e);
      callbacks.onError(e.message || "Failed to play audio");
      this.stop(callbacks);
    }
  }

  private async playAudioChunks(
    chunks: AudioChunk[], 
    globalChapterStart: number, 
    initialWordIndex: number,
    callbacks: PlayerCallbacks
  ) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioCtx = new AudioContextClass({ sampleRate: 24000 });
    
    // Start Session Tracking
    this.sessionStart = { index: initialWordIndex, time: Date.now() };

    let nextStartTime = this.audioCtx.currentTime;
    let hasStarted = false;

    // Filter chunks to start from approximately where the user is (if they are mid-chapter)
    // Find the first chunk that contains or follows the current index
    // However, for simplicity and ensuring continuity, we usually play from start of chapter 
    // OR we could find the chunk that corresponds to 'currentWordIndex'.
    // Given the current UI behavior (Read Chapter), it usually starts from the beginning of the chapter 
    // unless we implement specific logic. The previous implementation passed `cWords` which was the WHOLE chapter.
    // If we want to resume mid-chapter, we should filter `chunks` based on `startIndex`.
    
    // Let's iterate and schedule
    for (const chunk of chunks) {
      if (this.stopRequested) break;

      // Skip chunks that are completely before our current position if we wanted to support resume.
      // But the current 'onReadChapter' logic in App.tsx always passed the full chapter words.
      // To support resuming, we'd check: if (globalChapterStart + chunk.startIndex + chunk.wordCount < initialWordIndex) continue;
      // For now, mirroring previous behavior: Play all.
      
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      if (nextStartTime < this.audioCtx.currentTime) {
        nextStartTime = this.audioCtx.currentTime;
      }

      // Schedule Progress Update
      const chunkGlobalIndex = globalChapterStart + chunk.startIndex;
      const delay = (nextStartTime - this.audioCtx.currentTime) * 1000;
      
      const timeoutId = window.setTimeout(() => {
        if (!this.stopRequested) {
          callbacks.onProgress(chunkGlobalIndex);
        }
      }, Math.max(0, delay));
      this.activeTimeouts.push(timeoutId);

      // Schedule Audio
      const duration = schedulePcmChunk(this.audioCtx, chunk.audio, nextStartTime);
      nextStartTime += duration;
      hasStarted = true;
    }

    // Monitor for completion
    this.monitorInterval = window.setInterval(() => {
      if (this.stopRequested) {
        this.cleanup();
        return;
      }

      if (hasStarted && this.audioCtx && this.audioCtx.currentTime >= nextStartTime) {
        // Finished naturally
        this.stop(callbacks);
      }
    }, 200);
  }

  stop(callbacks?: PlayerCallbacks) {
    this.stopRequested = true;
    
    // Log Session if valid
    if (this.sessionStart && callbacks) {
      const endTime = Date.now();
      const durationMs = endTime - this.sessionStart.time;
      // Only log if duration is significant (> 10s)
      if (durationMs >= 10000) {
        // We need the LAST played index. 
        // The App tracks currentIndex via onProgress. 
        // We can pass `endTime` and let App handle logic, OR pass calculated stats.
        // But `endWordIndex` depends on where we stopped.
        // The `onProgress` updated the App's index. So App has the `currentIndex`.
        // We pass the session START info, App combines with CURRENT info.
        
        // Actually, the class doesn't know the final `currentIndex` unless we track it internally 
        // or ask for it. The cleaner way is for `onSessionFinished` to provide the start/time info
        // and let the consumer (App) finalize it with its current state, OR we track the last `onProgress` value.
        // Let's rely on the callbacks structure.
        callbacks.onSessionFinished({
            startTime: this.sessionStart.time,
            endTime,
            startWordIndex: this.sessionStart.index,
            endWordIndex: -1, // Consumer should fill this with current index
            durationSeconds: Math.round(durationMs / 1000)
        });
      }
    }

    this.cleanup();
    if (callbacks) {
        this.updateState(false, false, callbacks);
    }
  }

  private cleanup() {
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch {}
      this.audioCtx = null;
    }
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.activeTimeouts.forEach(t => clearTimeout(t));
    this.activeTimeouts = [];
    this.sessionStart = null;
    this._isPlaying = false;
    this._isSynthesizing = false;
  }

  private updateState(synthesizing: boolean, playing: boolean, callbacks: PlayerCallbacks) {
    this._isSynthesizing = synthesizing;
    this._isPlaying = playing;
    callbacks.onStateChange({ isSynthesizing: synthesizing, isPlaying: playing });
  }
}
