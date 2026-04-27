import { getGeminiApiKey } from './gemini';
import { getTtsPrompt } from './ttsPrompt';
import { chunkTextByCharLimit, chunkWordsByCharLimit, type WordData } from './text-processing';
import type { AudioChunk } from './storage';

export interface AudioController {
    stop: () => void;
    onEnded?: () => void;
    onChunkStarted?: (metadata: { startIndex: number, wordCount: number }) => void;
}

export async function synthesizeSpeech(text: string, speed: number = 1.0): Promise<AudioController | null> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        console.error("No Gemini API key found for TTS");
        return null;
    }

    const audioCtx = await getAudioContext();
    if (!audioCtx) return null;

    const controller = createAudioController(audioCtx);

    // Start processing in background
    processChunks(text, apiKey, audioCtx, controller, speed).catch(err => {
        console.error("Gemini TTS processing error", err);
        controller.stop();
    });

    return controller;
}

export async function* synthesizeChapterAudio(wordsOrText: WordData[] | string, _speed: number, apiKey: string, initialWordIndex: number = 0, globalChapterStart: number = 0): AsyncGenerator<AudioChunk, void, unknown> {
    const allChunks = typeof wordsOrText === 'string'
        ? chunkTextByCharLimit(wordsOrText, 1900)
        : chunkWordsByCharLimit(wordsOrText, 1900);

    if (allChunks.length === 0) return;

    const chunks = allChunks.filter(chunk => {
        const chunkEndIndex = globalChapterStart + chunk.startIndex + chunk.wordCount;
        return chunkEndIndex > initialWordIndex;
    });

    if (chunks.length === 0) return;

    const controller = { state: { isStopped: false } };

    // Fetch chunks sequentially to avoid 429 rate limits
    for (let i = 0; i < chunks.length; i++) {
        if (controller.state.isStopped) break;
        const chunk = chunks[i];
        const audio = await fetchGeminiAudio(apiKey, chunk.text, i, controller, _speed);
        if (audio) {
            yield {
                audio,
                startIndex: chunk.startIndex,
                wordCount: chunk.wordCount
            };
        }
    }
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

async function fetchGeminiAudio(apiKey: string, text: string, index: number, controller: any, speed: number = 1.0): Promise<ArrayBuffer | null> {
    if (controller.state.isStopped) return null;

    const cleanText = text
        .replace(/[#*`_~]/g, '')
        .replace(/\b\[([^\]]+)\]\(([^)]+)\)\b/g, '$1')
        .replace(/\n+/g, '. ');

    if (!cleanText.trim()) return null;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${apiKey}`;
    const promptText = getTtsPrompt(cleanText, speed);

    const body = {
        contents: [{
            parts: [{ text: promptText }]
        }],
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName: "Aoede" // Using a nice default voice
                    }
                }
            }
        }
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} ${errorText}`);
        }

        if (controller.state.isStopped) return null;

        const data = await response.json();
        const part = data.candidates?.[0]?.content?.parts?.[0];
        if (part?.inlineData?.data) {
            const binaryString = atob(part.inlineData.data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
        } else {
            console.error(`No audio data returned from Gemini for chunk ${index}.`);
            return null;
        }
    } catch (e) {
        console.error(`Error fetching Gemini audio for chunk ${index}`, e);
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
            const audioData = await fetchGeminiAudio(apiKey, chunk.text, i, controller, speed);

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
    const int16Array = new Int16Array(audioData);
    const sampleRate = 24000;
    const audioBuffer = audioCtx.createBuffer(1, int16Array.length, sampleRate);
    const channelData = audioBuffer.getChannelData(0);

    for (let i = 0; i < int16Array.length; i++) {
        channelData[i] = int16Array[i] / 32768.0;
    }

    return audioBuffer;
}

export function playDecodedChunk(audioCtx: AudioContext, audioBuffer: AudioBuffer, startTime: number, _speed: number = 1.0): number {
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;

    // We requested Gemini to read at the set speed multiplier via the prompt.
    // If we wanted to adjust further locally we could, but let's trust the prompt.
    const localResamplingRate = 1.0;
    source.playbackRate.value = localResamplingRate;

    source.connect(audioCtx.destination);
    source.start(startTime);
    return audioBuffer.duration / localResamplingRate;
}

export async function playEncodedChunk(audioCtx: AudioContext, audioData: ArrayBuffer, startTime: number, speed: number = 1.0): Promise<number> {
    const audioBuffer = await decodeAudioData(audioCtx, audioData);
    return playDecodedChunk(audioCtx, audioBuffer, startTime, speed);
}
