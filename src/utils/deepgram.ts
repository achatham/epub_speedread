const API_KEY_STORAGE_KEY = 'deepgram_api_key';

export function getDeepgramApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

export function setDeepgramApiKey(key: string) {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}
