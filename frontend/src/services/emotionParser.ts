import type { EmotionType } from '../types/nila';

const EMOTION_REGEX = /\[(happy|sad|surprised|relaxed|angry|neutral|shy)\]/gi;

export interface EmotionParseResult {
  cleanText: string;
  emotions: EmotionType[];
}

/**
 * Extract emotion tags from streaming text and return cleaned text + detected emotions.
 */
export function parseEmotions(text: string): EmotionParseResult {
  const emotions: EmotionType[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(EMOTION_REGEX.source, 'gi');
  while ((match = re.exec(text)) !== null) {
    emotions.push(match[1].toLowerCase() as EmotionType);
  }
  const cleanText = text.replace(EMOTION_REGEX, '').replace(/\s{2,}/g, ' ').trim();
  return { cleanText, emotions };
}

/**
 * Map an emotion to the best matching avatar gesture.
 */
export function emotionToGesture(emotion: EmotionType): string | null {
  switch (emotion) {
    case 'happy': return 'COMPLETED';
    case 'surprised': return 'PRESENTING';
    case 'sad': return 'THINKING';
    case 'shy': return 'NEEDS_INPUT';
    default: return null;
  }
}
