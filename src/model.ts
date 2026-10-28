export type BlockType = 'work' | 'rest' | 'prep';
export type PresetId = 'beep' | 'gentle' | 'gym' | 'minimal' | 'off';

export interface Block {
  id: string;
  type: BlockType;
  label: string;
  durationSec: number;
  /** Optional per-block sound preset override. */
  sound?: PresetId | null;
}

export interface Group {
  id: string;
  name: string;
  blocks: Block[];
  updatedAt: number;
}

export interface BlockEntry {
  kind: 'block';
  id: string;
  repeatCount: number;
  block: Block;
  /** Set when the block came from the block library. */
  savedBlockId: string | null;
}

export interface GroupEntry {
  kind: 'group';
  id: string;
  repeatCount: number;
  groupId: string;
  linked: boolean;
  /** True once the source group was deleted; entry keeps last-known snapshot. */
  broken?: boolean;
  snapshot: Group;
}

export type SessionEntry = BlockEntry | GroupEntry;

export interface Session {
  id: string;
  name: string;
  entries: SessionEntry[];
  updatedAt: number;
}

export interface Settings {
  preset: PresetId;
  volume: number;
  muted: boolean;
  vibrate: boolean;
  countdownTicks: boolean;
  finalWarning: boolean;
  transitionMatrix: boolean;
}

export interface AppState {
  version: number;
  settings: Settings;
  blockLibrary: Block[];
  groupLibrary: Group[];
  session: Session;
}

export interface Step {
  key: string;
  entryId: string;
  repeatIndex: number;
  repeatCount: number;
  blockIndex: number;
  blockCount: number;
  block: Block;
  entryLabel: string;
}

export const PRESET_LABELS: Record<PresetId, string> = {
  beep: 'Beep',
  gentle: 'Gentle',
  gym: 'Gym',
  minimal: 'Minimal',
  off: 'Off',
};

export const TYPE_LABELS: Record<BlockType, string> = {
  work: 'Work',
  rest: 'Rest',
  prep: 'Prep',
};

export function uid(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Seconds -> M:SS (or H:MM:SS past an hour). */
export function fmtDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Milliseconds -> remaining-time clock, rounded up so a fresh 3:00 reads 3:00. */
export function fmtRemaining(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return fmtDuration(sec);
}

export function totalMinutesLabel(sec: number): string {
  if (sec < 60) return `${Math.max(1, Math.round(sec))} sec`;
  const minutes = sec / 60;
  if (minutes < 10) return `${(Math.round(minutes * 10) / 10).toString()} min`;
  return `${Math.round(minutes)} min`;
}

export function newSession(): Session {
  return { id: uid(), name: 'Session', entries: [], updatedAt: Date.now() };
}

export const DEFAULT_SETTINGS: Settings = {
  preset: 'beep',
  volume: 0.7,
  muted: false,
  vibrate: true,
  countdownTicks: true,
  finalWarning: true,
  transitionMatrix: true,
};

export function defaultState(): AppState {
  return {
    version: 1,
    settings: clone(DEFAULT_SETTINGS),
    blockLibrary: [],
    groupLibrary: [],
    session: newSession(),
  };
}

export function makeBlock(type: BlockType, label: string, durationSec: number, sound: PresetId | null = null): Block {
  return { id: uid(), type, label, durationSec: clamp(Math.round(durationSec), 1, 60 * 60 * 6), sound };
}

export function resolveEntryGroup(
  entry: GroupEntry,
  groups: Group[],
): { name: string; blocks: Block[]; broken: boolean } {
  if (!entry.linked || entry.broken) {
    return { name: entry.snapshot.name, blocks: entry.snapshot.blocks, broken: Boolean(entry.broken) };
  }
  const live = groups.find((g) => g.id === entry.groupId);
  if (!live) return { name: entry.snapshot.name, blocks: entry.snapshot.blocks, broken: true };
  return { name: live.name, blocks: live.blocks, broken: false };
}

export function entryBlocks(entry: SessionEntry, groups: Group[]): Block[] {
  if (entry.kind === 'block') return [entry.block];
  return resolveEntryGroup(entry, groups).blocks;
}

export function entryName(entry: SessionEntry, groups: Group[]): string {
  if (entry.kind === 'block') return entry.block.label;
  return resolveEntryGroup(entry, groups).name;
}

/** Duration of one pass of the entry. */
export function entryPassDuration(entry: SessionEntry, groups: Group[]): number {
  return entryBlocks(entry, groups).reduce((sum, b) => sum + b.durationSec, 0);
}

export function entryTotalDuration(entry: SessionEntry, groups: Group[]): number {
  return entryPassDuration(entry, groups) * entry.repeatCount;
}

export function sessionDuration(session: Session, groups: Group[]): number {
  return session.entries.reduce((sum, e) => sum + entryTotalDuration(e, groups), 0);
}

export function countGroupUsage(groupId: string, session: Session): number {
  return session.entries.filter((e) => e.kind === 'group' && e.linked && e.groupId === groupId).length;
}

export function compileSession(session: Session, groups: Group[]): Step[] {
  const steps: Step[] = [];
  for (const entry of session.entries) {
    const resolved = entry.kind === 'group' ? resolveEntryGroup(entry, groups) : null;
    const blocks = entry.kind === 'block' ? [entry.block] : resolved!.blocks;
    const label = entry.kind === 'block' ? entry.block.label : resolved!.name;
    const repeats = clamp(Math.round(entry.repeatCount), 1, 999);
    for (let r = 0; r < repeats; r++) {
      blocks.forEach((block, blockIndex) => {
        steps.push({
          key: `${entry.id}:${r}:${blockIndex}:${block.id}`,
          entryId: entry.id,
          repeatIndex: r,
          repeatCount: repeats,
          blockIndex,
          blockCount: blocks.length,
          block,
          entryLabel: label,
        });
      });
    }
  }
  return steps;
}

export function stepDurationMs(step: Step): number {
  return Math.max(1, step.block.durationSec) * 1000;
}
