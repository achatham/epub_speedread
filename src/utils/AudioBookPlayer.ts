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
    
    console.log(`[AudioPlayer] Starting playback. Chapter Start: ${globalChapterStart}, Current UI Index: ${initialWordIndex}`);

    // Start Session Tracking
    this.sessionStart = { index: initialWordIndex, time: Date.now() };

    let nextStartTime = this.audioCtx.currentTime;
    let hasStarted = false;

    // Filter chunks to start from where the user is
    const relevantChunks = chunks.filter(chunk => {
        const chunkEndIndex = globalChapterStart + chunk.startIndex + chunk.wordCount;
        const isRelevant = chunkEndIndex > initialWordIndex;
        if (!isRelevant) {
            console.log(`[AudioPlayer] Skipping chunk (${chunk.startIndex}-${chunk.startIndex + chunk.wordCount}) - already passed.`);
        }
        return isRelevant;
    });

    if (relevantChunks.length === 0) {
        console.log(`[AudioPlayer] No relevant chunks found after index ${initialWordIndex}.`);
        this.stop(callbacks);
        return;
    }

    console.log(`[AudioPlayer] Playing ${relevantChunks.length} chunks starting from global index ${globalChapterStart + relevantChunks[0].startIndex}`);

    for (const chunk of relevantChunks) {
      if (this.stopRequested) break;
      
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
          console.log(`[AudioPlayer] Syncing UI to word index: ${chunkGlobalIndex}`);
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
      console.log(`[AudioPlayer] Stopping. Total duration: ${Math.round(durationMs / 1000)}s`);

      // Only log if duration is significant (> 10s)
      if (durationMs >= 10000) {
        callbacks.onSessionFinished({
            startTime: this.sessionStart.time,
            endTime,
            startWordIndex: this.sessionStart.index,
            endWordIndex: -1, // App will fill this with its current state
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
