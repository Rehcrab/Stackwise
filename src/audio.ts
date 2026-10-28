import { clamp, type PresetId } from './model';

export type CueKey =
  | 'work'
  | 'rest'
  | 'prep'
  | 'workAgain'
  | 'restAgain'
  | 'end'
  | 'tick'
  | 'warning'
  | 'complete';

interface NoteSpec {
  /** Frequency in Hz. */
  f: number;
  /** Offset inside the cue, in seconds. */
  at: number;
  /** Note length in seconds. */
  dur: number;
  /** Relative level 0..1. */
  gain: number;
}

const PATTERNS: Record<CueKey, NoteSpec[]> = {
  work: [
    { f: 880, at: 0, dur: 0.1, gain: 0.9 },
    { f: 1175, at: 0.14, dur: 0.14, gain: 0.9 },
  ],
  rest: [
    { f: 880, at: 0, dur: 0.1, gain: 0.8 },
    { f: 659, at: 0.14, dur: 0.16, gain: 0.75 },
  ],
  prep: [
    { f: 660, at: 0, dur: 0.09, gain: 0.7 },
    { f: 660, at: 0.13, dur: 0.09, gain: 0.7 },
    { f: 880, at: 0.26, dur: 0.12, gain: 0.8 },
  ],
  workAgain: [{ f: 988, at: 0, dur: 0.2, gain: 0.8 }],
  restAgain: [{ f: 587, at: 0, dur: 0.22, gain: 0.7 }],
  end: [{ f: 440, at: 0, dur: 0.13, gain: 0.65 }],
  tick: [{ f: 1250, at: 0, dur: 0.045, gain: 0.35 }],
  warning: [
    { f: 1046, at: 0, dur: 0.07, gain: 0.85 },
    { f: 1046, at: 0.1, dur: 0.07, gain: 0.85 },
    { f: 1046, at: 0.2, dur: 0.07, gain: 0.85 },
  ],
  complete: [
    { f: 523, at: 0, dur: 0.16, gain: 0.8 },
    { f: 659, at: 0.18, dur: 0.16, gain: 0.8 },
    { f: 784, at: 0.36, dur: 0.18, gain: 0.85 },
    { f: 1046, at: 0.56, dur: 0.45, gain: 0.9 },
  ],
};

/** Minimal is deliberately one soft tick for almost everything. */
const MINIMAL_PATTERNS: Partial<Record<CueKey, NoteSpec[]>> = {
  complete: [
    { f: 660, at: 0, dur: 0.06, gain: 0.5 },
    { f: 990, at: 0.14, dur: 0.12, gain: 0.55 },
  ],
  warning: [
    { f: 900, at: 0, dur: 0.05, gain: 0.5 },
    { f: 900, at: 0.11, dur: 0.05, gain: 0.5 },
  ],
};

interface Voice {
  wave: OscillatorType;
  gain: number;
  durMul: number;
  release: number;
  /** Adds a sine an octave down for body. */
  sub: boolean;
}

const VOICES: Record<Exclude<PresetId, 'off'>, Voice> = {
  beep: { wave: 'square', gain: 0.42, durMul: 1, release: 0.02, sub: false },
  gentle: { wave: 'sine', gain: 0.7, durMul: 2.1, release: 0.55, sub: false },
  gym: { wave: 'sawtooth', gain: 0.5, durMul: 0.95, release: 0.04, sub: true },
  minimal: { wave: 'sine', gain: 0.5, durMul: 1, release: 0.015, sub: false },
};

function cueNotes(preset: PresetId, cue: CueKey): NoteSpec[] {
  if (preset === 'off') return [];
  if (preset === 'minimal') {
    return MINIMAL_PATTERNS[cue] ?? [{ f: 1050, at: 0, dur: 0.03, gain: 0.4 }];
  }
  return PATTERNS[cue];
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  get unlocked(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Must be called from a user gesture (the Start button). */
  async unlock(): Promise<boolean> {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    return this.ctx.state === 'running';
  }

  /** Play one or more cues back-to-back. Silently no-ops until unlocked. */
  play(cues: CueKey[], preset: PresetId, volume: number, muted: boolean): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== 'running') return;
    const level = muted ? 0 : clamp(volume, 0, 1);
    if (level <= 0 || preset === 'off') return;

    const voice = VOICES[preset];
    master.gain.value = 0.55;
    let start = ctx.currentTime + 0.012;
    for (const cue of cues) {
      const notes = cueNotes(preset, cue);
      for (const note of notes) this.schedule(ctx, master, voice, note, start, level);
      const tail = notes.reduce((max, n) => Math.max(max, n.at + n.dur), 0);
      start += tail + 0.06;
    }
  }

  private schedule(
    ctx: AudioContext,
    out: AudioNode,
    voice: Voice,
    note: NoteSpec,
    start: number,
    level: number,
  ): void {
    const when = start + note.at;
    const dur = Math.max(0.03, note.dur * voice.durMul);
    const peak = note.gain * voice.gain * level;

    const osc = ctx.createOscillator();
    osc.type = voice.wave;
    osc.frequency.setValueAtTime(note.f, when);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur + voice.release);
    osc.connect(env).connect(out);
    osc.start(when);
    osc.stop(when + dur + voice.release + 0.05);

    if (voice.sub) {
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(note.f / 2, when);
      const subEnv = ctx.createGain();
      subEnv.gain.setValueAtTime(0.0001, when);
      subEnv.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.45), when + 0.008);
      subEnv.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.08);
      sub.connect(subEnv).connect(out);
      sub.start(when);
      sub.stop(when + dur + 0.12);
    }
  }
}

export function vibrate(pattern: number | number[], enabled: boolean): void {
  if (!enabled) return;
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* unsupported */
  }
}

export function hapticFor(type: 'work' | 'rest' | 'prep', enabled: boolean): void {
  if (type === 'work') vibrate([45], enabled);
  else if (type === 'rest') vibrate([20], enabled);
  else vibrate([20, 45, 20], enabled);
}

export function hapticComplete(enabled: boolean): void {
  vibrate([160, 70, 160, 70, 240], enabled);
}
