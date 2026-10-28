export type ViewId = 'build' | 'groups' | 'blocks' | 'settings';

let current: ViewId = 'build';
const listeners = new Set<(view: ViewId) => void>();

export function getView(): ViewId {
  return current;
}

export function setView(view: ViewId): void {
  if (current === view) return;
  current = view;
  for (const listener of listeners) listener(current);
}

export function onViewChange(listener: (view: ViewId) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
