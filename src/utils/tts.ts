import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGeminiApiKey } from './gemini';
import { calculateCost } from './pricing';

export interface AudioController {
    stop: () => void;
    onEnded?: () => void;
}

export async function synthesizeSpeech(text: string, speed: number = 2.0): Promise<AudioController | null> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        console.error("No API key found for TTS");
        return null;
    }

    const audioCtx = await getAudioContext();
    if (!audioCtx) return null;

    const controller = createAudioController(audioCtx);

    // Start processing in background
    processChunks(text, apiKey, audioCtx, controller, speed).catch(err => {
        console.error("TTS processing error", err);
        controller.stop();
    });

    return controller;
}

export async function synthesizeChapterAudio(text: string, speed: number, apiKey: string): Promise<ArrayBuffer[]> {
    const chunks = text.split(/(?=\n#|^#)/).filter(c => c.trim().length > 0);
    if (chunks.length === 0) return [];

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-tts" });

    // Dummy controller that is never stopped
    const controller = { state: { isStopped: false } };

    const tasks = chunks.map((chunkText, index) => fetchChunkAudio(model, chunkText, index, controller, speed));
    const results = await Promise.all(tasks);

    return results.filter((b): b is ArrayBuffer => b !== null);
}

async function getAudioContext(): Promise<AudioContext | null> {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
        console.error("Web Audio API not supported");
        return null;
    }
    const ctx = new AudioContextClass({ sampleRate: 24000 });
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

async function fetchChunkAudio(model: any, chunkText: string, index: number, controller: any, speed: number = 2.0): Promise<ArrayBuffer | null> {
    if (controller.state.isStopped) return null;

    const cleanText = chunkText
        .replace(/[#*`_~]/g, '')
        .replace(/\b\[([^\]]+)\]\(([^)]+)\)\b/g, '$1')
        .replace(/\n+/g, '. ');

    if (!cleanText.trim()) return null;

    const startTime = performance.now();
    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: `Pacing: Speak at ${speed}x the normal speed.\n` + cleanText }] }],
            generationConfig: {
                responseModalities: ["AUDIO"] as any,
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } }
                }
            } as any
        });

        if (controller.state.isStopped) return null;

        const response = result.response;
        if (response.usageMetadata) {
            const cost = calculateCost("gemini-2.5-flash-preview-tts",
                response.usageMetadata.promptTokenCount,
                response.usageMetadata.candidatesTokenCount || 0);
            console.log(`Gemini Cost (TTS Chunk ${index}): $${cost.toFixed(6)}`);
        }

        const candidate = response.candidates?.[0];
        const audioPart = candidate?.content?.parts?.find((p: any) => p.inlineData);

        if (audioPart?.inlineData?.data) {
            console.log(`Chunk ${index} fetched in ${(performance.now() - startTime).toFixed(0)}ms, size: ${audioPart.inlineData.data.length}`);
            return base64ToArrayBuffer(audioPart.inlineData.data);
        }

        return null;
    } catch (e) {
        console.error(`Error processing chunk ${index}`, e);
        return null;
    }
}

async function processChunks(fullText: string, apiKey: string, audioCtx: AudioContext, controller: any, speed: number = 2.0) {
    // 1. Split text by headers (markdown style)
    const chunks = fullText.split(/(?=\n#|^#)/).filter(c => c.trim().length > 0);

    if (chunks.length === 0) return;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-tts" });

    // 2. Create promise tasks for all chunks
    const tasks = chunks.map((chunkText, index) => fetchChunkAudio(model, chunkText, index, controller, speed));

    // 3. Sequential playback loop
    // No monitor interval needed here, we check in the loop and final check

    // Override stop
    const originalStop = controller.stop;
    controller.stop = () => {
        originalStop();
    };

    let allChunksPlayed = false;

    // Loop through tasks sequentially for playback
    for (let i = 0; i < tasks.length; i++) {
        if (controller.state.isStopped) break;

        try {
            const pcmData = await tasks[i];

            if (controller.state.isStopped) break;
            if (pcmData) {
                // Check context state
                if (audioCtx.state === 'suspended') {
                    await audioCtx.resume();
                }

                // Schedule this chunk
                // If it's the first chunk, start now (or nextStartTime which is initialized to audioCtx.currentTime)
                // Ensure nextStartTime is at least currentTime
                if (controller.state.nextStartTime < audioCtx.currentTime) {
                    controller.state.nextStartTime = audioCtx.currentTime;
                }

                console.log(`Scheduling chunk ${i} at ${controller.state.nextStartTime.toFixed(2)}s`);
                const duration = schedulePcmChunk(audioCtx, pcmData, controller.state.nextStartTime);
                controller.state.nextStartTime += duration;
                controller.state.hasStarted = true;
            }
        } catch (e) {
            console.error(`Error waiting for chunk ${i}`, e);
        }
    }

    allChunksPlayed = true;

    // Final check for end
    const finalCheck = setInterval(() => {
        if (controller.state.isStopped) {
            clearInterval(finalCheck);
            return;
        }
        // If we haven't started yet (e.g. all fetches failed), we should probably exit too
        // But assuming at least one played:
        if (allChunksPlayed && controller.state.hasStarted && audioCtx.currentTime >= controller.state.nextStartTime) {
            clearInterval(finalCheck);
            if (controller.onEnded) controller.onEnded();
            audioCtx.close();
        } else if (allChunksPlayed && !controller.state.hasStarted) {
            // Nothing played
            clearInterval(finalCheck);
            if (controller.onEnded) controller.onEnded();
            audioCtx.close();
        }
    }, 200);
}

export function schedulePcmChunk(audioCtx: AudioContext, pcmData: ArrayBuffer, startTime: number): number {
    const float32 = new Float32Array(pcmData.byteLength / 2);
    const view = new DataView(pcmData);
    for (let i = 0; i < pcmData.byteLength / 2; i++) {
        float32[i] = view.getInt16(i * 2, true) / 32768.0;
    }

    const audioBuffer = audioCtx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);

    source.start(startTime);
    return audioBuffer.duration;
}

function base64ToArrayBuffer(base64: string) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}
