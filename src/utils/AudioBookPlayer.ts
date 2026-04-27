import { type FirestoreStorage, type AudioChunk } from './storage';
import { synthesizeChapterAudio, playDecodedChunk, decodeAudioData } from './tts';
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
  private lastReportedIndex: number = -1;
  private activeCallbacks: PlayerCallbacks | null = null;
  private scheduledChunks: {
    startTime: number;
    endTime: number;
    globalStartIndex: number;
    wordCount: number
  }[] = [];

  private geminiApiKey: string;

  // Track state internally to prevent race conditions
  private _isSynthesizing = false;
  private _isPlaying = false;

  constructor(
    _storage: FirestoreStorage,
    geminiApiKey: string
  ) {
    this.geminiApiKey = geminiApiKey;
  }

  get isActive() {
    return this._isSynthesizing || this._isPlaying;
  }

  updateGeminiApiKey(key: string) {
    this.geminiApiKey = key;
  }

  async playChapter(
    _bookId: string,
    _chapterIndex: number,
    chapterWords: WordData[],
    globalStartIndex: number,
    currentWordIndex: number,
    speed: number,
    callbacks: PlayerCallbacks
  ) {
    // Reset state
    this.stop();
    this.stopRequested = false;
    this.activeCallbacks = callbacks;
    this.lastReportedIndex = currentWordIndex;
    this.updateState(true, false, callbacks);

    try {
      // 1. Synthesize (No caching as requested)
      if (!this.geminiApiKey) {
        throw new Error("Gemini API Key required for TTS");
      }

      const chunkGenerator = synthesizeChapterAudio(chapterWords, speed, this.geminiApiKey, currentWordIndex, globalStartIndex);

      if (this.stopRequested) return; // Check cancel

      this.updateState(false, true, callbacks);

      // 2. Playback
      await this.playAudioChunks(chunkGenerator, globalStartIndex, currentWordIndex, speed, callbacks);

    } catch (e: any) {
      console.error("AudioPlayer Error:", e);
      callbacks.onError(e.message || "Failed to play audio");
      this.stop();
    }
  }

  private async playAudioChunks(
    chunkGenerator: AsyncGenerator<AudioChunk, void, unknown>,
    globalChapterStart: number,
    initialWordIndex: number,
    speed: number,
    callbacks: PlayerCallbacks
  ) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    // Gemini Audio is typical 24kHz or similar, the AudioContext will resample.
    this.audioCtx = new AudioContextClass();

    console.log(`[AudioPlayer] Starting playback. Chapter Start: ${globalChapterStart}, Current UI Index: ${initialWordIndex}`);

    // Start Session Tracking
    this.sessionStart = { index: initialWordIndex, time: Date.now() };

    let nextStartTime = this.audioCtx.currentTime;
    let hasStarted = false;
    let isScheduling = true;

    this.scheduledChunks = [];

    // Lazy decoding and scheduling loop
    // We want to decode and schedule chunks ahead of time, but not all at once to avoid locking up
    const scheduleChunks = async () => {
      try {
        for await (const chunk of chunkGenerator) {
          if (this.stopRequested || !this.audioCtx) break;

          if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
          }

          // Decode
          const audioBuffer = await decodeAudioData(this.audioCtx, chunk.audio);

          if (this.stopRequested || !this.audioCtx) break;

          if (nextStartTime < this.audioCtx.currentTime) {
            nextStartTime = this.audioCtx.currentTime;
          }

          // Schedule
          const duration = playDecodedChunk(this.audioCtx, audioBuffer, nextStartTime, speed);

          this.scheduledChunks.push({
            startTime: nextStartTime,
            endTime: nextStartTime + duration,
            globalStartIndex: globalChapterStart + chunk.startIndex,
            wordCount: chunk.wordCount
          });

          nextStartTime += duration;
          hasStarted = true;
        }
      } finally {
        isScheduling = false;
        if (!hasStarted && !this.stopRequested) {
          // If no chunks were generated at all
          this.stop();
        }
      }
    };

    // Start scheduling asynchronously so we don't block the monitor interval
    scheduleChunks().catch(e => {
        console.error("Error in scheduleChunks", e);
        this.stop();
    });

    // Monitor for completion and granular progress
    this.monitorInterval = window.setInterval(() => {
      if (this.stopRequested || !this.audioCtx) {
        this.cleanup();
        return;
      }

      const now = this.audioCtx.currentTime;

      // 1. Calculate Granular Progress
      const active = this.scheduledChunks.find(c => now >= c.startTime && now < c.endTime);
      if (active) {
        const elapsed = now - active.startTime;
        const duration = active.endTime - active.startTime;
        const subIndex = Math.floor((elapsed / duration) * active.wordCount);
        const granularIndex = active.globalStartIndex + subIndex;

        if (granularIndex !== this.lastReportedIndex) {
          this.lastReportedIndex = granularIndex;
          callbacks.onProgress(granularIndex);
        }
      }

      // 2. Check for natural completion
      if (hasStarted && !isScheduling && now >= nextStartTime) {
        this.stop();
      }
    }, 1000);
  }

  stop() {
    this.stopRequested = true;
    const callbacks = this.activeCallbacks;

    // Log Session if valid
    if (this.sessionStart && callbacks) {
      const endTime = Date.now();
      const durationMs = endTime - this.sessionStart.time;
      console.log(`[AudioPlayer] Stopping. Final index: ${this.lastReportedIndex}, duration: ${Math.round(durationMs / 1000)}s`);

      // Only log if duration is significant (> 10s)
      if (durationMs >= 10000) {
        callbacks.onSessionFinished({
          startTime: this.sessionStart.time,
          endTime,
          startWordIndex: this.sessionStart.index,
          endWordIndex: this.lastReportedIndex,
          durationSeconds: Math.round(durationMs / 1000)
        });
      }
    }

    this.cleanup();
    if (callbacks) {
      this.updateState(false, false, callbacks);
    }
    this.activeCallbacks = null;
  }

  private cleanup() {
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch { /* ignore close errors */ }
      this.audioCtx = null;
    }
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.activeTimeouts.forEach(t => clearTimeout(t));
    this.activeTimeouts = [];
    this.scheduledChunks = [];
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
