export interface ModelPricing {
  input: {
    text: number; // per 1M tokens
    audio?: number; // per 1M tokens
  };
  output: {
    text?: number; // per 1M tokens
    audio?: number; // per 1M tokens
  };
}

export const GEMINI_PRICING: Record<string, ModelPricing> = {
  // Promotional pricing through 2026-12-31; reverts to $1.50 in / $7.50 out on 2027-01-01.
  "gemini-3.7-flash": {
    input: { text: 0.75 },
    output: { text: 3.75 } // Includes thinking tokens
  },
  "gemini-3.1-flash-image": {
    input: { text: 0.50 },
    output: { text: 60.00 } // Image output tokens, roughly $0.067 for a 1024x1024 image
  },
  "gemini-3.1-flash-tts-preview": {
    input: { text: 1.00 },
    output: { audio: 20.00 }
  },
  // Legacy models, kept so previously recorded usage still prices correctly.
  "gemini-3-flash-preview": {
    input: { text: 0.50, audio: 1.00 },
    output: { text: 3.00 }
  },
  "gemini-3.1-flash-image-preview": {
    input: { text: 0.50 },
    output: { text: 3.00 }
  },
  "gemini-2.5-flash-preview-tts": {
    input: { text: 0.50 },
    output: { audio: 10.00 }
  },
  "gemini-2.0-flash": {
    input: { text: 0.10, audio: 0.70 },
    output: { text: 0.40 }
  }
};

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = GEMINI_PRICING[model];
    if (!pricing) {
        // Try to fuzzy match or default
        console.warn(`Pricing not found for model: ${model}`);
        return 0;
    }
    
    let inputCost = 0;
    let outputCost = 0;

    // For TTS models, output is audio
    if (model.includes('tts')) {
        inputCost = (inputTokens / 1_000_000) * (pricing.input.text || 0);
        outputCost = (outputTokens / 1_000_000) * (pricing.output.audio || 0);
    } else {
        // Standard text/multimodal models
        // Assuming text input for now as primary driver in this app
        inputCost = (inputTokens / 1_000_000) * (pricing.input.text || 0);
        outputCost = (outputTokens / 1_000_000) * (pricing.output.text || 0);
    }
    
    return inputCost + outputCost;
}
