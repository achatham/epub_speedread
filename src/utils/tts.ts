import { getDeepgramApiKey } from './deepgram';
import { chunkTextByCharLimit, chunkWordsByCharLimit, type WordData } from './text-processing';
import type { AudioChunk } from './storage';

export interface AudioController {
    stop: () => void;
    onEnded?: () => void;
    onChunkStarted?: (metadata: { startIndex: number, wordCount: number }) => void;
}

export async function synthesizeSpeech(text: string, speed: number = 1.0): Promise<AudioController | null> {
    const apiKey = getDeepgramApiKey();
    if (!apiKey) {
        console.error("No Deepgram API key found for TTS");
        return null;
    }

    const audioCtx = await getAudioContext();
    if (!audioCtx) return null;

    const controller = createAudioController(audioCtx);

    // Start processing in background
    processChunks(text, apiKey, audioCtx, controller, speed).catch(err => {
        console.error("Deepgram TTS processing error", err);
        controller.stop();
    });

    return controller;
}

export async function synthesizeChapterAudio(wordsOrText: WordData[] | string, _speed: number, apiKey: string): Promise<AudioChunk[]> {
    const chunks = typeof wordsOrText === 'string'
        ? chunkTextByCharLimit(wordsOrText, 1900)
        : chunkWordsByCharLimit(wordsOrText, 1900);

    if (chunks.length === 0) return [];

    const controller = { state: { isStopped: false } };
    const results: AudioChunk[] = [];

    // Fetch chunks sequentially to avoid 429 rate limits
    for (let i = 0; i < chunks.length; i++) {
        if (controller.state.isStopped) break;
        const chunk = chunks[i];
        const audio = await fetchDeepgramAudio(apiKey, chunk.text, i, controller, _speed);
        if (audio) {
            results.push({
                audio,
                startIndex: chunk.startIndex,
                wordCount: chunk.wordCount
            });
        }
    }

    return results;
}

async function getAudioContext(): Promise<AudioContext | null> {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
        console.error("Web Audio API not supported");
        return null;
    }
    const ctx = new AudioContextClass(); // Let browser choose natural sample rate
    if (ctx.state === 'suspended') {
        await ctx.resume();
    }
    return ctx;
}

function createAudioController(audioCtx: AudioContext): AudioController & { state: any } {
    const state = {
        isStopped: false,
        nextStartTime: audioCtx.currentTime,
        hasStarted: false,
    };

    return {
        stop: () => {
            state.isStopped = true;
            audioCtx.close();
        },
        onEnded: undefined,
        state
    };
}

async function fetchDeepgramAudio(apiKey: string, text: string, index: number, controller: any, speed: number = 1.0): Promise<ArrayBuffer | null> {
    if (controller.state.isStopped) return null;

    let cleanText = text
        .replace(/[#*`_~]/g, '')
        .replace(/\b\[([^\]]+)\]\(([^)]+)\)\b/g, '$1')
        .replace(/\n+/g, '. ');

    if (!cleanText.trim()) return null;

    // Safety check: Deepgram REST API has a 2000 character limit
    if (cleanText.length > 2000) {
        console.warn(`Chunk ${index} too long (${cleanText.length} chars), truncating to 2000.`);
        cleanText = cleanText.substring(0, 2000);
    }

    const deepgramSpeed = Math.min(speed, 1.5);
    const url = `https://api.deepgram.com/v1/speak?model=aura-2-asteria-en&speed=${deepgramSpeed}`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Token ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ text: cleanText })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Deepgram API error: ${response.status} ${errorText}`);
        }

        if (controller.state.isStopped) return null;

        const buffer = await response.arrayBuffer();
        return buffer;
    } catch (e) {
        console.error(`Error fetching Deepgram audio for chunk ${index}`, e);
        return null;
    }
}

async function processChunks(fullText: string, apiKey: string, audioCtx: AudioContext, controller: any, speed: number = 1.0) {
    const chunks = chunkTextByCharLimit(fullText, 1900);
    if (chunks.length === 0) return;

    // Sequential playback loop
    let allChunksPlayed = false;

    for (let i = 0; i < chunks.length; i++) {
        if (controller.state.isStopped) break;

        try {
            const chunk = chunks[i];
            const audioData = await fetchDeepgramAudio(apiKey, chunk.text, i, controller, speed);

            if (controller.state.isStopped) break;
            if (audioData) {
                if (audioCtx.state === 'suspended') await audioCtx.resume();

                // Decode
                const audioBuffer = await decodeAudioData(audioCtx, audioData);

                if (controller.state.isStopped) break;

                if (controller.state.nextStartTime < audioCtx.currentTime) {
                    controller.state.nextStartTime = audioCtx.currentTime;
                }

                if (controller.onChunkStarted) {
                    const delay = (controller.state.nextStartTime - audioCtx.currentTime) * 1000;
                    setTimeout(() => {
                        if (!controller.state.isStopped) {
                            controller.onChunkStarted!({
                                startIndex: chunk.startIndex,
                                wordCount: chunk.wordCount
                            });
                        }
                    }, Math.max(0, delay));
                }

                const duration = playDecodedChunk(audioCtx, audioBuffer, controller.state.nextStartTime, speed);
                controller.state.nextStartTime += duration;
                controller.state.hasStarted = true;

                // Thread break
                if (i % 2 === 0) await new Promise(resolve => setTimeout(resolve, 0));
            }
        } catch (e) {
            console.error(`Error processing chunk ${i}`, e);
        }
    }

    allChunksPlayed = true;

    const finalCheck = setInterval(() => {
        if (controller.state.isStopped) {
            clearInterval(finalCheck);
            return;
        }
        if (allChunksPlayed && controller.state.hasStarted && audioCtx.currentTime >= controller.state.nextStartTime) {
            clearInterval(finalCheck);
            if (controller.onEnded) controller.onEnded();
            audioCtx.close();
        } else if (allChunksPlayed && !controller.state.hasStarted) {
            clearInterval(finalCheck);
            if (controller.onEnded) controller.onEnded();
            audioCtx.close();
        }
    }, 200);
}

export async function decodeAudioData(audioCtx: AudioContext, audioData: ArrayBuffer): Promise<AudioBuffer> {
    return await audioCtx.decodeAudioData(audioData);
}

export function playDecodedChunk(audioCtx: AudioContext, audioBuffer: AudioBuffer, startTime: number, speed: number = 1.0): number {
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;

    // If speed > 1.5, we use local resampling for the remaining speedup
    // Deepgram handled up to 1.5x
    const localResamplingRate = speed > 1.5 ? speed / 1.5 : 1.0;
    source.playbackRate.value = localResamplingRate;

    source.connect(audioCtx.destination);
    source.start(startTime);
    return audioBuffer.duration / localResamplingRate;
}

export async function playEncodedChunk(audioCtx: AudioContext, audioData: ArrayBuffer, startTime: number, speed: number = 1.0): Promise<number> {
    const audioBuffer = await decodeAudioData(audioCtx, audioData);
    return playDecodedChunk(audioCtx, audioBuffer, startTime, speed);
}
