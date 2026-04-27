export function getTtsPrompt(text: string, speedMultiplier: number): string {
    return `Read this text at a speed multiplier of ${speedMultiplier}, as if narrating an audio book:\n\n${text}`;
}
