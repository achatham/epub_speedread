import { getDeepgramApiKey } from './deepgram';
import { chunkTextByParagraph, chunkWordsByParagraph, type WordData } from './text-processing';
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
        ? chunkTextByParagraph(wordsOrText, 300)
        : chunkWordsByParagraph(wordsOrText, 300);

    if (chunks.length === 0) return [];

    // Note: Caching is disabled as requested, but synthesizeChapterAudio is used by AudioBookPlayer 
    // which expects a list of chunks. We fetch them all.
    const controller = { state: { isStopped: false } };

    const tasks = chunks.map(async (chunk, index) => {
        const audio = await fetchDeepgramAudio(apiKey, chunk.text, index, controller);
        if (!audio) return null;
        return {
            audio,
            startIndex: chunk.startIndex,
            wordCount: chunk.wordCount
        };
    });
    const results = await Promise.all(tasks);

    return results.filter((b): b is AudioChunk => b !== null);
}

async function getAudioContext(): Promise<AudioContext | null> {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
        console.error("Web Audio API not supported");
        return null;
    }
    const ctx = new AudioContextClass({ sampleRate: 48000 }); // Deepgram Aura uses 48kHz by default
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

async function fetchDeepgramAudio(apiKey: string, text: string, index: number, controller: any): Promise<ArrayBuffer | null> {
    if (controller.state.isStopped) return null;

    const cleanText = text
        .replace(/[#*`_~]/g, '')
        .replace(/\b\[([^\]]+)\]\(([^)]+)\)\b/g, '$1')
        .replace(/\n+/g, '. ');

    if (!cleanText.trim()) return null;

    const startTime = performance.now();
    try {
        const response = await fetch("https://api.deepgram.com/v1/speak?model=aura-asteria-en", {
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
        console.log(`Chunk ${index} fetched from Deepgram in ${(performance.now() - startTime).toFixed(0)}ms, size: ${buffer.byteLength}`);
        return buffer;
    } catch (e) {
        console.error(`Error fetching Deepgram audio for chunk ${index}`, e);
        return null;
    }
}

async function processChunks(fullText: string, apiKey: string, audioCtx: AudioContext, controller: any, _speed: number = 1.0) {
    // Deepgram /v1/speak doesn't support a simple 'speed' param in the same way, 
    // although Aura is very fast. For now ignoring speed or could be handled via AudioContext playbackRate.
    
    const chunks = chunkTextByParagraph(fullText, 300);
    if (chunks.length === 0) return;

    // Sequential playback loop
    let allChunksPlayed = false;

    for (let i = 0; i < chunks.length; i++) {
        if (controller.state.isStopped) break;

        try {
            const chunk = chunks[i];
            const audioData = await fetchDeepgramAudio(apiKey, chunk.text, i, controller);

            if (controller.state.isStopped) break;
            if (audioData) {
                if (audioCtx.state === 'suspended') await audioCtx.resume();

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

                const duration = await playEncodedChunk(audioCtx, audioData, controller.state.nextStartTime);
                controller.state.nextStartTime += duration;
                controller.state.hasStarted = true;
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

export async function playEncodedChunk(audioCtx: AudioContext, audioData: ArrayBuffer, startTime: number): Promise<number> {
    const audioBuffer = await audioCtx.decodeAudioData(audioData);
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.start(startTime);
    return audioBuffer.duration;
}
