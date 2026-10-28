import Sortable from 'sortablejs';

export function moveItem<T>(items: T[], from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
}

export function makeSortable(
  list: HTMLElement,
  onMove: (from: number, to: number) => void,
): Sortable {
  return Sortable.create(list, {
    animation: 170,
    handle: '.drag-handle',
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    fallbackOnBody: true,
    swapThreshold: 0.6,
    delay: 110,
    delayOnTouchOnly: true,
    touchStartThreshold: 4,
    onEnd(event) {
      const from = event.oldIndex;
      const to = event.newIndex;
      if (from === undefined || to === undefined || from === to) return;
      onMove(from, to);
    },
  });
}
