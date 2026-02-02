import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGeminiApiKey } from './gemini';
import { calculateCost } from './pricing';

export interface AudioController {
  stop: () => void;
  onEnded?: () => void;
}

export async function synthesizeSpeech(text: string): Promise<AudioController | null> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    console.error("No API key found for TTS");
    return null;
  }

  const audioCtx = await getAudioContext();
  if (!audioCtx) return null;

  const controller = createAudioController(audioCtx);
  
  // Start processing in background
  processStream(text, apiKey, audioCtx, controller).catch(err => {
      console.error("TTS processing error", err);
      controller.stop();
  });

  return controller;
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
        chunkCount: 0
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

async function processStream(text: string, apiKey: string, audioCtx: AudioContext, controller: any) {
    const cleanText = text
        .replace(/[#*`_~]/g, '') 
        .replace(/\b\[([^\]]+)\]\(([^)]+)\)\b/g, '$1') 
        .replace(/\n+/g, '. '); 

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-tts" });

    let streamConsumed = false;

    // Monitor playback end
    const checkEnded = setInterval(() => {
        if (controller.state.isStopped) {
            clearInterval(checkEnded);
            return;
        }
        // Only trigger onEnded if the stream is fully consumed AND audio has finished playing
        if (streamConsumed && controller.state.hasStarted && audioCtx.currentTime >= controller.state.nextStartTime) {
            clearInterval(checkEnded);
            if (controller.onEnded) controller.onEnded();
            audioCtx.close();
        }
    }, 200);

    // Override stop to clean up interval
    const originalStop = controller.stop;
    controller.stop = () => {
        clearInterval(checkEnded);
        originalStop();
        // The loop below will break on next iteration because isStopped is true
    };

    try {
        const result = await model.generateContentStream({
            contents: [{ role: "user", parts: [{ text: cleanText }] }],
            generationConfig: {
                responseModalities: ["AUDIO"] as any,
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } }
                }
            } as any
        });

        for await (const item of result.stream) {
            if (controller.state.isStopped) break;

            if (item.usageMetadata) {
                const cost = calculateCost("gemini-2.5-flash-preview-tts", 
                    item.usageMetadata.promptTokenCount,
                    item.usageMetadata.candidatesTokenCount || 0);
                console.log(`Gemini Cost (TTS): $${cost.toFixed(6)}`);
            }
            
            const candidate = item.candidates?.[0];
            if (!candidate) continue;
            
            const audioPart = candidate.content?.parts?.find((p: any) => p.inlineData);
            
            if (audioPart?.inlineData?.data) {
                controller.state.chunkCount++;
                console.log(`Received chunk ${controller.state.chunkCount}, size: ${audioPart.inlineData.data.length}`);
                
                const pcmData = base64ToArrayBuffer(audioPart.inlineData.data);
                const duration = schedulePcmChunk(audioCtx, pcmData, controller.state.nextStartTime);
                
                if (controller.state.nextStartTime < audioCtx.currentTime) {
                    controller.state.nextStartTime = audioCtx.currentTime;
                }
                controller.state.nextStartTime += duration;
                controller.state.hasStarted = true;
            }
        }
        streamConsumed = true;

    } catch (e) {
        console.error("TTS Error:", e);
        controller.stop();
    }
}

function schedulePcmChunk(audioCtx: AudioContext, pcmData: ArrayBuffer, startTime: number): number {
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
    
    // Ensure we don't schedule in the past if possible, but startTime is managed by caller
    // If caller's startTime is < currentTime, context plays immediately.
    // However, for smooth streaming, caller tracks cumulative time.
    
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
