import {
  clamp,
  compileSession,
  entryPassDuration,
  fmtDuration,
  resolveEntryGroup,
  sessionDuration,
  totalMinutesLabel,
  TYPE_LABELS,
  uid,
  type BlockEntry,
  type Group,
  type SessionEntry,
} from '../model';
import { getState, update } from '../state';
import { el, iconButton, toast, confirmDialog } from '../dom';
import { icon } from '../icons';
import {
  blockDialog,
  chooseGroupDialog,
  openGroupEditor,
  pickBlockDialog,
  pickGroupDialog,
  repeatSummary,
} from '../dialogs';
import { startSession } from '../playback';
import { makeSortable, moveItem } from '../sortable';

const expanded = new Set<string>();

export function renderBuilder(container: HTMLElement): void {
  const state = getState();
  const groups = state.groupLibrary;
  const entries = state.session.entries;
  const totalSeconds = sessionDuration(state.session, groups);
  const stepCount = compileSession(state.session, groups).length;

  const addBlock = async (): Promise<void> => {
    const result = await blockDialog({ title: 'Add block', allowSaveToLibrary: true });
    if (!result) return;
    update((draft) => {
      if (result.saveToLibrary) draft.blockLibrary.push(structuredClone(result.block));
      const entry: BlockEntry = {
        kind: 'block',
        id: uid(),
        repeatCount: 1,
        block: structuredClone(result.block),
        savedBlockId: result.saveToLibrary ? result.block.id : null,
      };
      draft.session.entries.push(entry);
    });
  };

  const addFromLibrary = async (): Promise<void> => {
    const picked = await pickBlockDialog();
    if (!picked) return;
    update((draft) => {
      const entry: BlockEntry = {
        kind: 'block',
        id: uid(),
        repeatCount: 1,
        block: { ...structuredClone(picked), id: uid() },
        savedBlockId: picked.id,
      };
      draft.session.entries.push(entry);
    });
    toast(`Added “${picked.label}”`);
  };

  const addGroup = async (): Promise<void> => {
    const picked = await pickGroupDialog();
    if (!picked) return;
    let message = '';
    update((draft) => {
      const group = draft.groupLibrary.find((g) => g.id === picked.group.id) ?? picked.group;
      draft.session.entries.push({
        kind: 'group',
        id: uid(),
        repeatCount: 1,
        groupId: group.id,
        linked: picked.linked,
        snapshot: structuredClone(group),
      });
      message = picked.linked ? `Added “${group.name}” linked` : `Added “${group.name}” as a detached copy`;
    });
    toast(message);
  };

  const header = el('section', { class: 'page-head' }, [
    el('div', { class: 'head-main' }, [
      el('p', { class: 'eyebrow', text: 'Session stack' }),
      el('div', { class: 'total-row' }, [
        el('span', { class: 'total-time', text: fmtDuration(totalSeconds) }),
        el('span', {
          class: 'total-note',
          text: stepCount ? `${stepCount} block${stepCount === 1 ? '' : 's'} · ${totalMinutesLabel(totalSeconds)}` : 'Empty stack',
        }),
      ]),
    ]),
    el('button', {
      type: 'button',
      class: 'btn btn--primary btn--start',
      disabled: entries.length === 0,
      on: { click: () => void startSession() },
      html: `${icon('play', 18)}<span>Start</span>`,
    }),
  ]);

  const list = el('div', { class: 'entry-list' });

  if (!entries.length) {
    list.appendChild(
      el('div', { class: 'empty-state' }, [
        el('div', { class: 'empty-art', html: icon('grip', 30) }),
        el('h2', { text: 'Build your first stack' }),
        el('p', {
          text: 'Add timed blocks one by one, or stack a saved circuit. Groups can follow their library copy or detach into a snapshot.',
        }),
        el('div', { class: 'empty-actions' }, [
          el('button', {
            type: 'button',
            class: 'btn btn--primary btn--block',
            html: `${icon('plus', 18)}<span>Add a block</span>`,
            on: { click: () => void addBlock() },
          }),
          el('button', {
            type: 'button',
            class: 'btn btn--ghost btn--block',
            text: 'Add a saved group',
            on: { click: () => void addGroup() },
          }),
        ]),
      ]),
    );
  } else {
    entries.forEach((entry, index) => {
      list.appendChild(entryCard(entry, index, entries.length, groups));
    });
  }

  const addBar = el('div', { class: 'add-bar' }, [
    el('button', {
      type: 'button',
      class: 'add-btn',
      html: `${icon('plus', 18)}<span>Block</span>`,
      'aria-label': 'Add a block',
      on: { click: () => void addBlock() },
    }),
    el('button', {
      type: 'button',
      class: 'add-btn',
      html: `${icon('clock', 18)}<span>Library</span>`,
      'aria-label': 'Add a saved block',
      on: { click: () => void addFromLibrary() },
    }),
    el('button', {
      type: 'button',
      class: 'add-btn',
      html: `${icon('link', 18)}<span>Group</span>`,
      'aria-label': 'Add a group',
      on: { click: () => void addGroup() },
    }),
  ]);

  container.append(header, list, addBar);

  if (entries.length > 1) {
    makeSortable(list, (from, to) => {
      update((draft) => moveItem(draft.session.entries, from, to));
    });
  }
}

function entryCard(entry: SessionEntry, index: number, count: number, groups: Group[]): HTMLElement {
  const isGroup = entry.kind === 'group';
  const resolved = entry.kind === 'group' ? resolveEntryGroup(entry, groups) : null;
  const blocks = entry.kind === 'group' ? resolved!.blocks : [entry.block];
  const name = entry.kind === 'group' ? resolved!.name : entry.block.label;
  const passSeconds = entryPassDuration(entry, groups);
  const broken = Boolean(resolved?.broken);
  const primaryType = blocks[0]?.type ?? 'work';
  const isExpanded = expanded.has(entry.id);

  const card = el('article', {
    class: `entry ${isGroup ? 'entry--group' : `entry--${primaryType}`}${entry.kind === 'group' && entry.linked && !broken ? ' entry--linked' : ''}`,
    dataset: { entryId: entry.id },
  });

  /* Header row ------------------------------------------------------ */
  const tags: HTMLElement[] = [];
  if (isGroup) {
    if (entry.kind === 'group' && entry.linked && !broken) {
      tags.push(
        el('span', { class: 'tag tag--linked', html: `${icon('link', 13)}<span>Linked</span>` }),
      );
    } else if (broken) {
      tags.push(
        el('span', { class: 'tag tag--warn', html: `${icon('alert', 13)}<span>Broken link</span>` }),
      );
    } else {
      tags.push(
        el('span', { class: 'tag tag--detached', html: `${icon('unlink', 13)}<span>Detached</span>` }),
      );
    }
  }

  const badge = el('span', {
    class: `badge badge--${isGroup ? 'group' : primaryType}`,
    text: isGroup ? 'Group' : TYPE_LABELS[primaryType],
  });

  const headline = el('div', { class: 'entry-title' }, [
    el('div', { class: 'entry-line' }, [badge, el('span', { class: 'entry-name', text: name }), ...tags]),
    el('div', { class: 'entry-meta' }, [
      el('span', { text: repeatSummary(passSeconds, entry.repeatCount) }),
      isGroup ? el('span', { class: 'meta-dot', text: `· ${blocks.length} block${blocks.length === 1 ? '' : 's'}` }) : null,
    ]),
  ]);

  const stepper = el('div', { class: 'stepper' }, [
    el('button', {
      type: 'button',
      class: 'stepper-btn',
      text: '−',
      'aria-label': 'Decrease repeats',
      disabled: entry.repeatCount <= 1,
      on: {
        click: () => setRepeat(entry.id, entry.repeatCount - 1),
      },
    }),
    el('span', { class: 'stepper-value', text: `×${entry.repeatCount}`, title: 'Repeat count' }),
    el('button', {
      type: 'button',
      class: 'stepper-btn',
      text: '+',
      'aria-label': 'Increase repeats',
      disabled: entry.repeatCount >= 99,
      on: {
        click: () => setRepeat(entry.id, entry.repeatCount + 1),
      },
    }),
  ]);

  const grip = el('button', {
    type: 'button',
    class: 'icon-btn drag-handle',
    'aria-label': `Reorder ${name}`,
    title: 'Drag to reorder',
    html: icon('grip', 20),
  });

  card.appendChild(
    el('div', { class: 'entry-top' }, [grip, headline, stepper]),
  );

  /* Actions --------------------------------------------------------- */
  const actions = el('div', { class: 'entry-actions' });

  const edit = iconButton('Edit', 'pencil', async () => {
    if (entry.kind === 'block') {
      const result = await blockDialog({ title: 'Edit block', block: entry.block });
      if (!result) return;
      update((draft) => {
        const target = draft.session.entries.find((e) => e.id === entry.id);
        if (target && target.kind === 'block') target.block = result.block;
      });
      return;
    }
    if (entry.linked && !broken) openGroupEditor(entry.groupId);
    else openGroupEditor(null, entry.id);
  });

  const duplicate = iconButton('Duplicate', 'copy', () => {
    const copy = structuredClone(entry);
    copy.id = uid();
    update((draft) => {
      draft.session.entries.splice(index + 1, 0, copy);
    });
    toast(`Duplicated “${name}”`);
  });

  const moveUp = iconButton('Move up', 'arrowUp', () => {
    update((draft) => moveItem(draft.session.entries, index, index - 1));
  }, { disabled: index === 0, size: 18 });

  const moveDown = iconButton('Move down', 'arrowDown', () => {
    update((draft) => moveItem(draft.session.entries, index, index + 1));
  }, { disabled: index === count - 1, size: 18 });

  const remove = iconButton('Remove', 'trash', () => {
    const removed = structuredClone(entry);
    update((draft) => {
      draft.session.entries = draft.session.entries.filter((e) => e.id !== entry.id);
    });
    toast(`Removed “${name}”`, {
      actionLabel: 'Undo',
      onAction: () => {
        update((draft) => {
          draft.session.entries.splice(Math.min(index, draft.session.entries.length), 0, removed);
        });
      },
    });
  });

  if (isGroup) {
    const linked = entry.kind === 'group' && entry.linked && !broken;
    actions.appendChild(
      iconButton(linked ? 'Detach from group' : broken ? 'Re-link group' : 'Link group', linked ? 'unlink' : 'link', async () => {
        await toggleLink(entry, groups);
      }),
    );
  }

  actions.append(edit, duplicate, moveUp, moveDown, remove);

  let collapseToggle: HTMLButtonElement | null = null;
  if (isGroup) {
    collapseToggle = el('button', {
      type: 'button',
      class: 'collapse-btn',
      'aria-expanded': String(isExpanded),
      on: {
        click: () => {
          if (expanded.has(entry.id)) expanded.delete(entry.id);
          else expanded.add(entry.id);
          const open = expanded.has(entry.id);
          if (children) children.hidden = !open;
          collapseToggle?.setAttribute('aria-expanded', String(open));
          collapseToggle!.innerHTML = `${icon(open ? 'chevronUp' : 'chevronDown', 16)}<span>${open ? 'Hide' : 'Show'} blocks</span>`;
        },
      },
      html: `${icon(isExpanded ? 'chevronUp' : 'chevronDown', 16)}<span>${isExpanded ? 'Hide' : 'Show'} blocks</span>`,
    });
    actions.prepend(collapseToggle);
  }

  card.appendChild(actions);

  /* Expanded block list --------------------------------------------- */
  let children: HTMLElement | null = null;
  if (isGroup) {
    children = el('div', { class: 'entry-blocks', hidden: !isExpanded });
    if (broken) {
      children.appendChild(
        el('div', { class: 'notice notice--warn' }, [
          el('span', { html: icon('alert', 16) }),
          el('span', {
            text: 'The source group was deleted. This entry keeps its last-known blocks; re-link it or detach to edit it locally.',
          }),
        ]),
      );
    }
    blocks.forEach((block) => {
      children!.appendChild(
        el('div', { class: 'entry-block' }, [
          el('span', { class: `dot dot--${block.type}` }),
          el('span', { class: 'entry-block-name', text: block.label }),
          el('span', { class: 'entry-block-time', text: fmtDuration(block.durationSec) }),
        ]),
      );
    });
    if (entry.kind === 'group' && entry.linked && !broken) {
      children.appendChild(
        el('p', { class: 'entry-note', text: 'Following the group library — edits to the group update this entry.' }),
      );
    } else if (!broken) {
      children.appendChild(
        el('p', { class: 'entry-note', text: 'Detached snapshot — edits to the library group will not touch this entry.' }),
      );
    }
    card.appendChild(children);
  }

  return card;
}

function setRepeat(entryId: string, next: number): void {
  update((draft) => {
    const target = draft.session.entries.find((e) => e.id === entryId);
    if (target) target.repeatCount = clamp(Math.round(next), 1, 99);
  });
}

async function toggleLink(entry: SessionEntry, groups: Group[]): Promise<void> {
  if (entry.kind !== 'group') return;
  const resolved = resolveEntryGroup(entry, groups);

  if (entry.linked && !resolved.broken) {
    const ok = await confirmDialog({
      title: 'Detach group?',
      message: `“${resolved.name}” will become a snapshot of its current blocks. Future edits to the library group will not affect it.`,
      confirmLabel: 'Detach',
    });
    if (!ok) return;
    update((draft) => {
      const target = draft.session.entries.find((e) => e.id === entry.id);
      if (target && target.kind === 'group') {
        target.snapshot = {
          id: target.snapshot.id,
          name: resolved.name,
          blocks: structuredClone(resolved.blocks),
          updatedAt: Date.now(),
        };
        target.linked = false;
        target.broken = false;
      }
    });
    toast('Detached — this entry now holds its own copy');
    return;
  }

  const live = groups.find((g) => g.id === entry.groupId);
  const target = live ?? (await chooseGroupDialog(brokenTitle(resolved.broken)));
  if (!target) return;
  const ok = await confirmDialog({
    title: entry.linked ? 'Re-link group?' : 'Link to group?',
    message: `This entry will follow “${target.name}”. Its local copy is replaced by the group's current blocks.`,
    confirmLabel: 'Link',
  });
  if (!ok) return;
  update((draft) => {
    const item = draft.session.entries.find((e) => e.id === entry.id);
    if (item && item.kind === 'group') {
      item.groupId = target.id;
      item.linked = true;
      item.broken = false;
      item.snapshot = structuredClone(target);
    }
  });
  toast(`Linked to “${target.name}”`);
}

function brokenTitle(broken: boolean): string {
  return broken ? 'Re-link to a group' : 'Link to a group';
}

