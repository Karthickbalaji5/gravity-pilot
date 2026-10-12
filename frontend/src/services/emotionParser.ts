import type { EmotionType, ActionTag } from '../types/nila';

export interface EmotionParseResult {
  cleanText: string;
  emotions: EmotionType[];
  actions: ActionTag[];
}

const EMOTIONS: Set<string> = new Set([
  'happy', 'sad', 'surprised', 'relaxed', 'angry', 'neutral', 'shy',
]);

const ACTIONS: Set<string> = new Set([
  'wave', 'nod', 'think', 'shrug', 'happy', 'excited', 'gotit', 'proud', 'present',
]);

/**
 * Streaming-safe tag parser.
 *
 * Accumulates partial tokens across calls. Strips completed [emotion] and
 * {action} tags, but never trims whitespace between tokens (fixing the
 * words-sticking-together bug). Partial tags like "[hap" are held in the
 * buffer until completed or proven not to be tags.
 */
export class StreamingTagParser {
  private buffer = '';

  public push(token: string): EmotionParseResult {
    this.buffer += token;

    const emotions: EmotionType[] = [];
    const actions: ActionTag[] = [];
    let clean = '';
    let i = 0;

    while (i < this.buffer.length) {
      const ch = this.buffer[i];

      // Try emotion tag: [word]
      if (ch === '[') {
        const endBracket = this.buffer.indexOf(']', i + 1);
        if (endBracket === -1) {
          // Incomplete — keep rest in buffer for next push
          break;
        }
        const word = this.buffer.slice(i + 1, endBracket).trim().toLowerCase();
        if (EMOTIONS.has(word)) {
          emotions.push(word as EmotionType);
          i = endBracket + 1;
          continue;
        }
        // Not an emotion tag — emit as text
        clean += this.buffer.slice(i, endBracket + 1);
        i = endBracket + 1;
        continue;
      }

      // Try action tag: {word}
      if (ch === '{') {
        const endBrace = this.buffer.indexOf('}', i + 1);
        if (endBrace === -1) {
          break;
        }
        const word = this.buffer.slice(i + 1, endBrace).trim().toLowerCase();
        if (ACTIONS.has(word)) {
          actions.push(word as ActionTag);
          i = endBrace + 1;
          continue;
        }
        clean += this.buffer.slice(i, endBrace + 1);
        i = endBrace + 1;
        continue;
      }

      clean += ch;
      i++;
    }

    // Keep unconsumed partial tag in buffer
    this.buffer = this.buffer.slice(i);

    return { cleanText: clean, emotions, actions };
  }

  public flush(): EmotionParseResult {
    const leftover = this.buffer;
    this.buffer = '';
    return { cleanText: leftover, emotions: [], actions: [] };
  }

  public reset(): void {
    this.buffer = '';
  }
}

/**
 * One-shot parse (backwards-compatible for non-streaming uses).
 */
export function parseEmotions(text: string): EmotionParseResult {
  const parser = new StreamingTagParser();
  const result = parser.push(text);
  const flushed = parser.flush();
  return {
    cleanText: result.cleanText + flushed.cleanText,
    emotions: [...result.emotions, ...flushed.emotions],
    actions: [...result.actions, ...flushed.actions],
  };
}
