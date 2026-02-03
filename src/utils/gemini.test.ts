import { describe, it, expect, vi, beforeEach } from 'vitest';
import { summarizeRecent } from './gemini';

const generateContentMock = vi.fn();
const getGenerativeModelMock = vi.fn().mockReturnValue({
  generateContent: generateContentMock,
});

// Mock the GoogleGenerativeAI class
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: class {
      constructor(apiKey: string) {}
      getGenerativeModel = getGenerativeModelMock
    },
  };
});

describe('gemini utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('summarizeRecent should return a summary', async () => {
    generateContentMock.mockResolvedValue({
      response: {
        text: () => 'Mock summary',
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
        },
      },
    });

    // Setup API key
    localStorage.setItem('gemini_api_key', 'test-key');

    const context = 'This is some context from a book.';
    const summary = await summarizeRecent(context);

    expect(summary).toBe('Mock summary');
    expect(getGenerativeModelMock).toHaveBeenCalledWith({ model: "gemini-3-flash-preview" });
  });

  it('summarizeRecent should handle missing API key', async () => {
    const summary = await summarizeRecent('context');
    expect(summary).toContain('API Key not found');
  });
});
