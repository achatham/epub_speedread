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
  "gemini-3-flash-preview": {
    input: { text: 0.50, audio: 1.00 },
    output: { text: 3.00 }
  },
  "gemini-2.5-flash-preview-tts": {
    input: { text: 0.50 },
    output: { audio: 10.00 }
  },
  // Fallbacks or others
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
