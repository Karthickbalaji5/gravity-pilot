import type { ActionName } from './ClipLibrary';
import type { EmotionType } from '../types/nila';

const PET_LINES = [
  "Ehehe~", "Hmm?", "Huh?", "Nyah~", "Yay!", "Mhm!", "Zzz...",
  "La la la~", "Hey!", "Uwah!", "Tehe~", "Nn...",
];

export class PetBrain {
  public onAction: ((action: ActionName) => void) | null = null;
  public onEmotion: ((emotion: EmotionType) => void) | null = null;
  public onSpeak: ((text: string) => void) | null = null;
  public onMoveBy: ((dx: number, dy: number) => void) | null = null;
  public onFacingLeft: ((left: boolean) => void) | null = null;

  private quietMode = false;
  private running = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private walkTimer: ReturnType<typeof setTimeout> | null = null;
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private state: 'idle' | 'walking' | 'sitting' | 'sleeping' | 'posing' = 'idle';
  private facingLeft = false;
  private walkSteps = 0;
  private walkDir = 1;
  private lastUserInput = Date.now();

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.lastUserInput = Date.now();
    this.scheduleIdleAction();
    this.startIdleCheck();
  }

  public stop(): void {
    this.running = false;
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    if (this.walkTimer) { clearTimeout(this.walkTimer); this.walkTimer = null; }
    if (this.idleCheckTimer) { clearInterval(this.idleCheckTimer); this.idleCheckTimer = null; }
  }

  public setQuietMode(q: boolean): void {
    this.quietMode = q;
    if (q && this.state === 'walking') {
      this.stopWalking();
    }
  }

  public handleClick(region: 'head' | 'body'): void {
    this.lastUserInput = Date.now();
    if (this.state === 'sitting' || this.state === 'sleeping') {
      this.wakeUp();
      return;
    }
    if (region === 'head') {
      this.onEmotion?.('shy');
      if (!this.quietMode) {
        this.onSpeak?.(PET_LINES[Math.floor(Math.random() * PET_LINES.length)]);
      }
    } else {
      this.onAction?.('wave');
    }
  }

  public onDragStart(): void {
    this.lastUserInput = Date.now();
    this.onAction?.('falling');
    this.state = 'idle';
  }

  public onDrop(): void {
    this.onAction?.('stretch');
    setTimeout(() => {
      if (this.running) {
        this.onAction?.('idle');
        this.state = 'idle';
        this.scheduleIdleAction();
      }
    }, 1200);
  }

  private scheduleIdleAction(): void {
    if (!this.running || this.state !== 'idle') return;
    const delay = (60 + Math.random() * 120) * 1000;
    this.idleTimer = setTimeout(() => {
      if (!this.running || this.state !== 'idle') return;
      const roll = Math.random();
      if (roll < 0.5 && !this.quietMode) {
        this.startWalking();
      } else if (roll < 0.8) {
        this.playCutePose();
      } else {
        this.scheduleIdleAction();
      }
    }, delay);
  }

  private startWalking(): void {
    if (this.quietMode || this.state !== 'idle') return;
    this.state = 'walking';
    this.walkDir = Math.random() < 0.5 ? -1 : 1;
    this.facingLeft = this.walkDir < 0;
    this.onFacingLeft?.(this.facingLeft);
    this.onAction?.('walk');
    this.walkSteps = 0;
    const maxSteps = 15 + Math.floor(Math.random() * 25);

    const step = () => {
      if (!this.running || this.state !== 'walking') return;
      this.walkSteps++;
      this.onMoveBy?.(this.walkDir * 4, 0);

      if (this.walkSteps >= maxSteps) {
        this.stopWalking();
        return;
      }
      this.walkTimer = setTimeout(step, 60);
    };
    this.walkTimer = setTimeout(step, 60);
  }

  private stopWalking(): void {
    if (this.walkTimer) { clearTimeout(this.walkTimer); this.walkTimer = null; }
    this.state = 'idle';
    this.facingLeft = false;
    this.onFacingLeft?.(false);
    this.onAction?.('idle');
    this.scheduleIdleAction();
  }

  private playCutePose(): void {
    this.state = 'posing';
    this.onAction?.('cute_pose');
    setTimeout(() => {
      if (!this.running) return;
      this.state = 'idle';
      this.onAction?.('idle');
      this.scheduleIdleAction();
    }, 3000 + Math.random() * 2000);
  }

  private startIdleCheck(): void {
    this.idleCheckTimer = setInterval(() => {
      if (!this.running) return;
      const idle = Date.now() - this.lastUserInput;

      if (idle >= 15 * 60 * 1000 && this.state !== 'sleeping') {
        this.state = 'sleeping';
        this.onAction?.('sleep');
        this.onEmotion?.('relaxed');
      } else if (idle >= 5 * 60 * 1000 && this.state === 'idle') {
        this.state = 'sitting';
        this.onAction?.('sit');
        this.onEmotion?.('relaxed');
      }
    }, 5000);
  }

  private wakeUp(): void {
    this.state = 'idle';
    this.onAction?.('stretch');
    this.onEmotion?.('happy');
    setTimeout(() => {
      if (!this.running || this.state !== 'idle') return;
      this.onAction?.('wave');
      setTimeout(() => {
        if (!this.running) return;
        this.onAction?.('idle');
        this.scheduleIdleAction();
      }, 1500);
    }, 1500);
  }

  public destroy(): void {
    this.stop();
  }
}
