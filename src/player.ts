import { AudioEngine, hapticComplete, hapticFor, type CueKey } from './audio';
import { clamp, stepDurationMs, type Settings, type Step } from './model';

export type PlayerStatus = 'idle' | 'running' | 'paused' | 'done';

export interface PlayerPosition {
  entryId: string;
  repeatIndex: number;
  blockIndex: number;
  blockId: string;
}

export interface PlayerSnapshot {
  status: PlayerStatus;
  index: number;
  total: number;
  step: Step | null;
  next: Step | null;
  remainingMs: number;
  stepTotalMs: number;
  sessionElapsedMs: number;
  sessionTotalMs: number;
  position: PlayerPosition | null;
}

interface PlayerDeps {
  getSettings: () => Settings;
  audio: AudioEngine;
}

type Listener = (snapshot: PlayerSnapshot) => void;

const TICK_MS = 100;

export class Player {
  private steps: Step[] = [];
  private index = 0;
  private status: PlayerStatus = 'idle';
  /** Absolute epoch ms when the current block ends (source of truth while running). */
  private endAt = 0;
  private pausedRemaining = 0;
  private lastTickSecond = Number.POSITIVE_INFINITY;
  private timer: number | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private listeners = new Set<Listener>();

  constructor(private deps: PlayerDeps) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get currentStep(): Step | null {
    return this.steps[this.index] ?? null;
  }

  snapshot(): PlayerSnapshot {
    const step = this.currentStep;
    const remainingMs =
      this.status === 'running' ? Math.max(0, this.endAt - Date.now()) : this.pausedRemaining;
    const sessionTotalMs = this.steps.reduce((sum, s) => sum + stepDurationMs(s), 0);
    const before = this.steps
      .slice(0, this.index)
      .reduce((sum, s) => sum + stepDurationMs(s), 0);
    const stepTotalMs = step ? stepDurationMs(step) : 0;
    const elapsed =
      this.status === 'done'
        ? sessionTotalMs
        : before + Math.max(0, stepTotalMs - remainingMs);
    return {
      status: this.status,
      index: this.index,
      total: this.steps.length,
      step,
      next: this.steps[this.index + 1] ?? null,
      remainingMs,
      stepTotalMs,
      sessionElapsedMs: clamp(elapsed, 0, sessionTotalMs),
      sessionTotalMs,
      position: step
        ? {
            entryId: step.entryId,
            repeatIndex: step.repeatIndex,
            blockIndex: step.blockIndex,
            blockId: step.block.id,
          }
        : null,
    };
  }

  /** Begin playback. Resolves once the audio context is unlocked. */
  async start(steps: Step[], opts: { index?: number; remainingMs?: number } = {}): Promise<void> {
    if (!steps.length) return;
    await this.deps.audio.unlock();
    this.steps = steps;
    this.index = clamp(opts.index ?? 0, 0, steps.length - 1);
    this.status = 'running';
    const duration = stepDurationMs(this.steps[this.index]);
    const remaining = clamp(opts.remainingMs ?? duration, 1, duration);
    this.endAt = Date.now() + remaining;
    this.pausedRemaining = remaining;
    this.lastTickSecond = Number.POSITIVE_INFINITY;
    this.emit();
    this.announce(this.index);
    this.startLoop();
    void this.requestWakeLock();
  }

  pause(): void {
    if (this.status !== 'running') return;
    this.pausedRemaining = Math.max(0, this.endAt - Date.now());
    this.status = 'paused';
    this.stopLoop();
    void this.releaseWakeLock();
    this.emit();
  }

  /** Resume from the current step with a (possibly new) remaining time. */
  async resume(steps: Step[], index: number, remainingMs: number): Promise<void> {
    if (!steps.length) return;
    this.steps = steps;
    this.index = clamp(index, 0, steps.length - 1);
    this.status = 'running';
    const duration = stepDurationMs(this.steps[this.index]);
    this.pausedRemaining = clamp(remainingMs, 1, duration);
    this.endAt = Date.now() + this.pausedRemaining;
    this.lastTickSecond = Number.POSITIVE_INFINITY;
    this.emit();
    this.announce(this.index);
    this.startLoop();
    void this.requestWakeLock();
  }

  skip(delta: number): void {
    if (this.status !== 'running' && this.status !== 'paused') return;
    const target = this.index + delta;
    if (target >= this.steps.length) {
      this.finish();
      return;
    }
    this.index = clamp(target, 0, this.steps.length - 1);
    const duration = stepDurationMs(this.steps[this.index]);
    this.lastTickSecond = Number.POSITIVE_INFINITY;
    if (this.status === 'running') {
      this.endAt = Date.now() + duration;
      this.pausedRemaining = duration;
      this.announce(this.index);
    } else {
      this.pausedRemaining = duration;
    }
    this.emit();
  }

  addTime(seconds: number): void {
    if (this.status === 'running') {
      this.endAt += seconds * 1000;
    } else if (this.status === 'paused') {
      this.pausedRemaining = Math.max(0, this.pausedRemaining + seconds * 1000);
    } else {
      return;
    }
    this.emit();
  }

  stop(): void {
    this.status = 'idle';
    this.pausedRemaining = 0;
    this.index = 0;
    this.steps = [];
    this.stopLoop();
    void this.releaseWakeLock();
    this.emit();
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private startLoop(): void {
    this.stopLoop();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && this.status === 'running') {
        this.tick();
        void this.requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.detachVisibility = () => document.removeEventListener('visibilitychange', onVisibility);
  }

  private detachVisibility: (() => void) | null = null;

  private stopLoop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.detachVisibility?.();
    this.detachVisibility = null;
  }

  private tick(): void {
    if (this.status !== 'running') return;
    const now = Date.now();
    let remaining = this.endAt - now;

    if (remaining <= 0) {
      this.advance(now, -remaining);
      return;
    }

    const settings = this.deps.getSettings();
    const secondsLeft = Math.ceil(remaining / 1000);
    const step = this.currentStep;
    if (
      settings.countdownTicks &&
      step &&
      secondsLeft >= 1 &&
      secondsLeft <= 3 &&
      secondsLeft < this.lastTickSecond
    ) {
      this.lastTickSecond = secondsLeft;
      const warning = secondsLeft === 1 && settings.finalWarning && step.block.type === 'work';
      this.cue(warning ? 'warning' : 'tick');
    }
    this.emit();
  }

  /** Move forward, carrying overrun so backgrounded tabs stay in sync. */
  private advance(now: number, initialOverrun: number): void {
    let overrun = initialOverrun;
    while (true) {
      const nextIndex = this.index + 1;
      if (nextIndex >= this.steps.length) {
        this.finish();
        return;
      }
      this.index = nextIndex;
      const step = this.steps[nextIndex];
      const duration = stepDurationMs(step);
      this.endAt = now + duration - overrun;
      this.pausedRemaining = Math.max(0, duration - overrun);
      this.lastTickSecond = Number.POSITIVE_INFINITY;
      if (this.endAt > now) {
        this.announce(nextIndex);
        this.emit();
        return;
      }
      overrun = now - this.endAt;
    }
  }

  private finish(): void {
    this.status = 'done';
    this.stopLoop();
    void this.releaseWakeLock();
    const settings = this.deps.getSettings();
    this.deps.audio.play(['complete'], settings.preset, settings.volume, settings.muted);
    hapticComplete(settings.vibrate);
    this.emit();
  }

  private announce(index: number): void {
    const step = this.steps[index];
    if (!step) return;
    const settings = this.deps.getSettings();
    const preset = step.block.sound ?? settings.preset;
    const prev = index > 0 ? this.steps[index - 1] : null;
    let cues: CueKey[];
    if (!prev) {
      cues = [step.block.type];
    } else if (settings.transitionMatrix) {
      const from = prev.block.type;
      const to = step.block.type;
      if (to === 'prep') cues = ['prep'];
      else if (to === 'work') cues = [from === 'work' ? 'workAgain' : 'work'];
      else cues = [from === 'rest' ? 'restAgain' : 'rest'];
    } else {
      cues = ['end', step.block.type];
    }
    this.deps.audio.play(cues, preset, settings.volume, settings.muted);
    hapticFor(step.block.type, settings.vibrate);
  }

  private cue(key: CueKey): void {
    const step = this.currentStep;
    if (!step) return;
    const settings = this.deps.getSettings();
    const preset = step.block.sound ?? settings.preset;
    this.deps.audio.play([key], preset, settings.volume, settings.muted);
  }

  private async requestWakeLock(): Promise<void> {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });
    } catch {
      /* denied or unsupported */
    }
  }

  private async releaseWakeLock(): Promise<void> {
    const lock = this.wakeLock;
    this.wakeLock = null;
    try {
      await lock?.release();
    } catch {
      /* already released */
    }
  }
}
