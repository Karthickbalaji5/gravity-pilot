import { VRMManager } from '../avatar/VRMManager';
import type { EmotionType } from '../types/nila';

interface QueueEntry {
  text: string;
  emotion?: EmotionType;
}

class TTSService {
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private isSpeaking = false;
  private queue: QueueEntry[] = [];
  private isProcessing = false;
  private cancelled = false;
  private sentenceBuffer = '';
  private onEmotionChange: ((e: EmotionType) => void) | null = null;
  private vrmManager: VRMManager | null = null;
  private voiceOptions: { voice?: string; rate?: number; pitch?: number } = {};
  private onSpeakingEnd: (() => void) | null = null;

  private initAudioContext(): AudioContext {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  public cancel(vrmManager?: VRMManager | null): void {
    this.cancelled = true;
    this.queue = [];
    this.sentenceBuffer = '';
    this.isProcessing = false;

    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {}
      this.currentSource = null;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    this.isSpeaking = false;
    const mgr = vrmManager ?? this.vrmManager;
    if (mgr) {
      mgr.setAudioAnalyser(null);
    }
    this.onSpeakingEnd?.();
  }

  /**
   * Start a streaming TTS session. Call pushTokens() as tokens arrive,
   * and flush() when the message is complete.
   */
  public startStream(
    vrmManager: VRMManager | null,
    options?: {
      voice?: string;
      rate?: number;
      pitch?: number;
      onEmotionChange?: (e: EmotionType) => void;
      onEnd?: () => void;
    }
  ): void {
    this.cancel(vrmManager);
    this.cancelled = false;
    this.vrmManager = vrmManager;
    this.sentenceBuffer = '';
    this.queue = [];
    this.isProcessing = false;
    this.onEmotionChange = options?.onEmotionChange ?? null;
    this.onSpeakingEnd = options?.onEnd ?? null;
    this.voiceOptions = {
      voice: options?.voice,
      rate: options?.rate,
      pitch: options?.pitch,
    };
  }

  /**
   * Feed tokens as they arrive. Sentences are extracted on . ! ? or newline
   * and queued for immediate playback.
   */
  public pushTokens(text: string, currentEmotion?: EmotionType): void {
    if (this.cancelled) return;
    this.sentenceBuffer += text;

    const sentences = this.sentenceBuffer.split(/(?<=[.!?\n])\s*/);
    if (sentences.length > 1) {
      for (let i = 0; i < sentences.length - 1; i++) {
        const s = sentences[i].trim();
        if (s) {
          this.queue.push({ text: s, emotion: currentEmotion });
          this.processQueue();
        }
      }
      this.sentenceBuffer = sentences[sentences.length - 1];
    }
  }

  /**
   * Flush any remaining buffered text as a final sentence.
   */
  public flush(): void {
    if (this.cancelled) return;
    const remaining = this.sentenceBuffer.trim();
    this.sentenceBuffer = '';
    if (remaining) {
      this.queue.push({ text: remaining });
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.cancelled) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && !this.cancelled) {
      const entry = this.queue.shift()!;

      if (entry.emotion && this.onEmotionChange) {
        this.onEmotionChange(entry.emotion);
      }

      this.isSpeaking = true;
      if (this.vrmManager) {
        this.vrmManager.setSpeaking(true);
      }

      await this.speakSentence(entry.text);
    }

    this.isProcessing = false;
    if (!this.cancelled && this.queue.length === 0) {
      this.isSpeaking = false;
      if (this.vrmManager) {
        this.vrmManager.setSpeaking(false);
        this.vrmManager.setAudioAnalyser(null);
      }
      this.onSpeakingEnd?.();
    }
  }

  private async speakSentence(rawText: string): Promise<void> {
    const cleanText = rawText
      .replace(/\[(happy|sad|surprised|relaxed|angry|neutral|shy)\]/gi, '')
      .replace(/[*_#`]/g, '')
      .trim();

    if (!cleanText) return;

    try {
      const voice = this.voiceOptions.voice || 'en-US-AnaNeural';
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText.slice(0, 1000),
          voice,
          rate: '+0%',
          pitch: '+0Hz',
        }),
      });

      if (this.cancelled) return;

      if (response.ok) {
        const audioData = await response.arrayBuffer();
        if (this.cancelled) return;

        const ctx = this.initAudioContext();
        const audioBuffer = await ctx.decodeAudioData(audioData);
        if (this.cancelled) return;

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.5;

        source.connect(analyser);
        analyser.connect(ctx.destination);

        this.analyser = analyser;
        this.currentSource = source;

        if (this.vrmManager) {
          this.vrmManager.setAudioAnalyser(analyser);
        }

        return new Promise<void>((resolve) => {
          source.onended = () => {
            resolve();
          };
          source.start(0);
        });
      }
    } catch (err) {
      if (this.cancelled) return;
      console.warn('TTS sentence failed:', err);
    }

    // Fallback: browser speech
    if ('speechSynthesis' in window && !this.cancelled) {
      return new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = this.voiceOptions.rate || 1.0;
        utterance.pitch = this.voiceOptions.pitch || 1.0;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      });
    }
  }

  /**
   * Speak a complete text (non-streaming, legacy compatibility).
   */
  public async speak(
    text: string,
    vrmManager: VRMManager | null,
    options?: {
      voice?: string;
      rate?: number;
      pitch?: number;
      lang?: string;
      onEnd?: () => void;
    }
  ): Promise<void> {
    this.startStream(vrmManager, {
      voice: options?.voice,
      rate: options?.rate,
      pitch: options?.pitch,
      onEnd: options?.onEnd,
    });
    this.pushTokens(text);
    this.flush();
  }
}

export const ttsService = new TTSService();
