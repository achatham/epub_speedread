import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY_STORAGE_KEY = 'gemini_api_key';

export function getGeminiApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

export function setGeminiApiKey(key: string) {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

export async function findRealEndOfBook(chapters: string[], endOfBookText: string): Promise<string | null> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const prompt = `Given the following table of contents and the full text of a book, identify the "real" end of the main story (including epilogue, but excluding appendix, notes, references, bibliography, etc.).
Quote the LAST 10 WORDS of the main story.
Return ONLY these 10 words, without punctuation.

Table of Contents:
${chapters.join('\n')}

Full Text of Book:
${endOfBookText}

Last 10 words of main story:`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();
    // Clean up response to just words
    return text.toLowerCase().replace(/[^\w\s]/g, '');
  } catch (error) {
    console.error("Error finding real end of book:", error);
  }
  return null;
}

export async function askAboutBook(question: string, context: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return "API Key not found. Please set it in settings.";

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `The following is the text of a book read so far. Please answer the user's question based on this context.
Do not provide spoilers for anything that might happen later in the book if you happen to know the book.
If the information is not in the provided context, say you don't know based on what has been read so far.

Context:
${context}

User Question: ${question}`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error: unknown) {
    console.error("Error asking Gemini:", error);
    return `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`;
  }
}
