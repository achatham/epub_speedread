import { GoogleGenerativeAI } from "@google/generative-ai";
import { calculateCost } from "./pricing";

const API_KEY_STORAGE_KEY = 'gemini_api_key';

export function getGeminiApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

export function setGeminiApiKey(key: string) {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

export async function findRealEndOfBook(chapters: string[], fullText: string): Promise<string | null> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-3-flash-preview",
    generationConfig: { responseMimeType: "application/json" }
  });

  const CHUNK_SIZE = 50000;
  const TOC = chapters.join('\n');
  
  // Start from the middle of the book
  let startPos = Math.floor(fullText.length / 2);
  console.log(`[Gemini] Starting real end detection from character ${startPos} (Total length: ${fullText.length})`);
  
  let chunkCount = 0;
  while (startPos < fullText.length) {
    chunkCount++;
    const endPos = Math.min(startPos + CHUNK_SIZE, fullText.length);
    const chunk = fullText.slice(startPos, endPos);
    
    console.log(`[Gemini] Processing chunk #${chunkCount} (${startPos} to ${endPos})...`);
    
    const prompt = `Given the Table of Contents and a slice of text from a book, determine if the "real" end of the main story (including epilogue, but excluding appendix, notes, references, bibliography, etc.) is contained within this slice.
    
    If the slice is still clearly part of the main story, return {"found_end": false}.
    If the slice is already in the backmatter (appendix, notes, etc.) and the real end was in a PREVIOUS slice, return {"past_end": true}.
    If the real end of the story is in THIS slice, return {"end_detected": "QUOTE_LAST_10_WORDS"} where QUOTE_LAST_10_WORDS is the last 10 words of the main story without punctuation.

    Table of Contents:
    ${TOC}

    Text Slice (starting at character ${startPos}):
    ${chunk}
    
    JSON response:`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      
      if (response.usageMetadata) {
          const cost = calculateCost("gemini-3-flash-preview", 
              response.usageMetadata.promptTokenCount, 
              response.usageMetadata.candidatesTokenCount);
          console.log(`Gemini Cost (End Detection Chunk at ${startPos}): $${cost.toFixed(6)}`);
      }

      const jsonResponse = JSON.parse(response.text());
      console.log(`[Gemini] Chunk at ${startPos}:`, jsonResponse);

      if (jsonResponse.end_detected) {
        return jsonResponse.end_detected.toLowerCase().replace(/[^\w\s]/g, '');
      }
      
      if (jsonResponse.past_end) {
        // If we are past the end, we might need to go back, but for now let's just log it.
        // The current implementation moves forward, so being past the end suggests we started too late or missed it.
        console.warn("[Gemini] Past end of story detected. Adjusting search backward.");
        startPos = Math.max(0, startPos - CHUNK_SIZE);
        if (startPos === 0) break; // Avoid infinite loop
        continue;
      }

      // Move to next chunk
      startPos += CHUNK_SIZE;
    } catch (error) {
      console.error("Error finding real end of book in chunk:", error);
      break;
    }
  }
  
  return null;
}

export async function askAboutBook(question: string, context: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return "API Key not found. Please set it in settings.";

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const prompt = `The following is the text of a book read so far. Please answer the user's question based on this context.
Do not provide spoilers for anything that might happen later in the book if you happen to know the book.
If the information is not in the provided context, say you don't know based on what has been read so far.
Please format your response in Markdown. Don't include any leading or closing text, just answer the question.

Context:
${context}

User Question: ${question}`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    if (response.usageMetadata) {
        const cost = calculateCost("gemini-3-flash-preview", 
            response.usageMetadata.promptTokenCount, 
            response.usageMetadata.candidatesTokenCount);
        console.log(`Gemini Cost (Q&A): $${cost.toFixed(6)}`);
    }

    return response.text();
  } catch (error: unknown) {
    console.error("Error asking Gemini:", error);
    return `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`;
  }
}

export async function summarizeWhatJustHappened(context: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return "API Key not found. Please set it in settings.";

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const prompt = `The following is an excerpt from a book that has been read recently.
Focusing ONLY on the very end of this excerpt (the last paragraph or few sentences), please provide a very brief summary of what just happened.
Please format your response in Markdown. Don't include any leading or closing text, just the summary.

Excerpt:
${context}`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;

    if (response.usageMetadata) {
      const cost = calculateCost("gemini-3-flash-preview",
        response.usageMetadata.promptTokenCount,
        response.usageMetadata.candidatesTokenCount);
      console.log(`Gemini Cost (Just Happened): $${cost.toFixed(6)}`);
    }

    return response.text();
  } catch (error: unknown) {
    console.error("Error summarizing with Gemini:", error);
    return `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`;
  }
}

export async function summarizeRecent(context: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return "API Key not found. Please set it in settings.";

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const prompt = `The following is an excerpt from a book that has been read recently.
Please provide a concise summary of what happened in this excerpt to help the reader catch up.
Please format your response in Markdown. Don't include any leading or closing text, just the summary.

Excerpt:
${context}`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;

    if (response.usageMetadata) {
        const cost = calculateCost("gemini-3-flash-preview",
            response.usageMetadata.promptTokenCount,
            response.usageMetadata.candidatesTokenCount);
        console.log(`Gemini Cost (Summary): $${cost.toFixed(6)}`);
    }

    return response.text();
  } catch (error: unknown) {
    console.error("Error summarizing with Gemini:", error);
    return `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`;
  }
}
