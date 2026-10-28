import {
  clamp,
  countGroupUsage,
  fmtDuration,
  makeBlock,
  PRESET_LABELS,
  TYPE_LABELS,
  uid,
  type Block,
  type BlockType,
  type Group,
  type GroupEntry,
  type PresetId,
} from './model';
import { getState, update } from './state';
import { player } from './runtime';
import { el, iconButton, openModal, toast, type ModalHandle } from './dom';
import { icon } from './icons';
import { makeSortable, moveItem } from './sortable';
import { setView } from './nav';

/* ------------------------------------------------------------------ */
/* Block form                                                          */
/* ------------------------------------------------------------------ */

export interface BlockDialogResult {
  block: Block;
  saveToLibrary: boolean;
}

export function blockDialog(options: {
  title: string;
  block?: Block;
  allowSaveToLibrary?: boolean;
  submitLabel?: string;
}): Promise<BlockDialogResult | null> {
  return new Promise((resolve) => {
    let settled = false;
    let type: BlockType = options.block?.type ?? 'work';
    let preset: PresetId | '' = options.block?.sound ?? '';

    const typeRow = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Block type' });
    const typeButtons = (['work', 'rest', 'prep'] as BlockType[]).map((value) => {
      const button = el('button', {
        type: 'button',
        class: `segment segment--${value}`,
        text: TYPE_LABELS[value],
        'aria-pressed': String(value === type),
        on: {
          click: () => {
            type = value;
            for (const btn of typeButtons) {
              btn.setAttribute('aria-pressed', String(btn === button));
            }
          },
        },
      });
      typeRow.appendChild(button);
      return button;
    });

    const labelInput = el('input', {
      class: 'field-input',
      type: 'text',
      maxlength: '80',
      placeholder: type === 'work' ? 'e.g. Jumping Jacks' : 'Optional label',
      value: options.block?.label ?? '',
      'aria-label': 'Block label',
    });

    const duration = options.block?.durationSec ?? 60;
    const minsInput = el('input', {
      class: 'field-input field-input--num',
      type: 'number',
      min: '0',
      max: '360',
      inputmode: 'numeric',
      value: String(Math.floor(duration / 60)),
      'aria-label': 'Minutes',
    });
    const secsInput = el('input', {
      class: 'field-input field-input--num',
      type: 'number',
      min: '0',
      max: '59',
      inputmode: 'numeric',
      value: String(duration % 60),
      'aria-label': 'Seconds',
    });

    const presetSelect = el('select', { class: 'field-input', 'aria-label': 'Sound override' });
    presetSelect.appendChild(el('option', { value: '', text: 'Default sound' }));
    (Object.keys(PRESET_LABELS) as PresetId[]).forEach((key) => {
      presetSelect.appendChild(el('option', { value: key, text: PRESET_LABELS[key] }));
    });
    presetSelect.value = preset;

    const quickChips = el('div', { class: 'chips' });
    [30, 60, 180, 300].forEach((presetSeconds) => {
      quickChips.appendChild(
        el('button', {
          type: 'button',
          class: 'chip',
          text: fmtDuration(presetSeconds),
          on: {
            click: () => {
              minsInput.value = String(Math.floor(presetSeconds / 60));
              secsInput.value = String(presetSeconds % 60);
            },
          },
        }),
      );
    });

    const saveRow = el('label', { class: 'check-row' }, [
      el('input', { type: 'checkbox', checked: true }),
      el('span', { text: 'Save to block library' }),
    ]);
    const saveCheckbox = saveRow.querySelector('input') as HTMLInputElement;

    const error = el('p', { class: 'form-error', role: 'alert', hidden: true });

    const submit = () => {
      const mins = clamp(Number.parseInt(minsInput.value || '0', 10) || 0, 0, 360);
      const secs = clamp(Number.parseInt(secsInput.value || '0', 10) || 0, 0, 59);
      const total = mins * 60 + secs;
      if (total < 1) {
        error.textContent = 'Give the block at least one second.';
        error.hidden = false;
        return;
      }
      const label = labelInput.value.trim() || `${TYPE_LABELS[type]} block`;
      const nextPreset = (presetSelect.value || '') as PresetId | '';
      const block: Block = options.block
        ? {
            ...options.block,
            type,
            label,
            durationSec: total,
            sound: nextPreset === '' ? null : nextPreset,
          }
        : makeBlock(type, label, total, nextPreset === '' ? null : nextPreset);
      settled = true;
      handle.close();
      resolve({ block, saveToLibrary: options.allowSaveToLibrary ? saveCheckbox.checked : false });
    };

    const form = el(
      'form',
      {
        class: 'form',
        on: {
          submit: (event: Event) => {
            event.preventDefault();
            submit();
          },
          keydown: (event: Event) => {
            const key = (event as KeyboardEvent).key;
            if (key === 'Enter' && (event.target as HTMLElement)?.tagName === 'INPUT') {
              event.preventDefault();
              submit();
            }
          },
        },
      },
      [
        el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Type' }), typeRow]),
        el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Label' }), labelInput]),
        el('div', { class: 'field' }, [
          el('span', { class: 'field-label', text: 'Duration' }),
          el('div', { class: 'duration-row' }, [
            el('div', { class: 'duration-part' }, [minsInput, el('span', { class: 'unit', text: 'min' })]),
            el('div', { class: 'duration-part' }, [secsInput, el('span', { class: 'unit', text: 'sec' })]),
          ]),
          quickChips,
        ]),
        el('label', { class: 'field' }, [
          el('span', { class: 'field-label', text: 'Sound override' }),
          presetSelect,
        ]),
        options.allowSaveToLibrary ? saveRow : null,
        error,
      ],
    );

    const handle: ModalHandle = openModal({
      title: options.title,
      size: 'sm',
      body: [form],
      footer: [
        el('button', {
          type: 'button',
          class: 'btn btn--ghost',
          text: 'Cancel',
          on: { click: () => handle.close() },
        }),
        el('button', {
          type: 'button',
          class: 'btn btn--primary',
          text: options.submitLabel ?? 'Save block',
          on: { click: submit },
        }),
      ],
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      },
    });

    window.setTimeout(() => labelInput.focus({ preventScroll: true }), 30);
  });
}

/* ------------------------------------------------------------------ */
/* Library pickers                                                     */
/* ------------------------------------------------------------------ */

function searchField(placeholder: string, onChange: (value: string) => void): HTMLInputElement {
  const input = el('input', {
    class: 'field-input field-input--search',
    type: 'search',
    placeholder,
    'aria-label': placeholder,
    on: { input: () => onChange(input.value.trim().toLowerCase()) },
  });
  return input;
}

export function pickBlockDialog(): Promise<Block | null> {
  return new Promise((resolve) => {
    const blocks = getState().blockLibrary;
    let settled = false;
    const list = el('div', { class: 'pick-list' });

    const empty = el('div', { class: 'empty-state empty-state--compact' }, [
      el('p', { text: 'No saved blocks yet. Create a block to reuse it here.' }),
    ]);

    const render = (query: string) => {
      list.replaceChildren();
      const filtered = blocks.filter((b) => b.label.toLowerCase().includes(query));
      if (!blocks.length) {
        list.appendChild(empty);
        return;
      }
      if (!filtered.length) {
        list.appendChild(el('p', { class: 'muted', text: 'No blocks match that search.' }));
        return;
      }
      for (const block of filtered) {
        list.appendChild(
          el(
            'button',
            {
              type: 'button',
              class: 'pick-row',
              on: {
                click: () => {
                  settled = true;
                  handle.close();
                  resolve(structuredClone(block));
                },
              },
            },
            [
              el('span', { class: `dot dot--${block.type}` }),
              el('span', { class: 'pick-main' }, [
                el('span', { class: 'pick-name', text: block.label }),
                el('span', { class: 'pick-meta', text: `${TYPE_LABELS[block.type]} · ${fmtDuration(block.durationSec)}` }),
              ]),
              el('span', { class: 'pick-side', text: 'Add' }),
            ],
          ),
        );
      }
    };

    render('');

    const handle: ModalHandle = openModal({
      title: 'Add saved block',
      size: 'sm',
      body: [
        el('div', { class: 'pick-search' }, [searchField('Search blocks', render)]),
        list,
      ],
      footer: [
        el('button', { type: 'button', class: 'btn btn--ghost', text: 'Close', on: { click: () => handle.close() } }),
      ],
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      },
    });
  });
}

export function pickGroupDialog(): Promise<{ group: Group; linked: boolean } | null> {
  return new Promise((resolve) => {
    const groups = getState().groupLibrary;
    let settled = false;
    const list = el('div', { class: 'pick-list' });

    const render = (query: string) => {
      list.replaceChildren();
      if (!groups.length) {
        list.appendChild(
          el('div', { class: 'empty-state empty-state--compact' }, [
            el('p', { text: 'No groups yet. Create one in the Groups tab, then stack it here.' }),
            el('button', {
              type: 'button',
              class: 'btn btn--ghost',
              text: 'Go to Groups',
              on: {
                click: () => {
                  handle.close();
                  setView('groups');
                },
              },
            }),
          ]),
        );
        return;
      }
      const filtered = groups.filter((g) => g.name.toLowerCase().includes(query));
      if (!filtered.length) {
        list.appendChild(el('p', { class: 'muted', text: 'No groups match that search.' }));
        return;
      }
      for (const group of filtered) {
        const seconds = group.blocks.reduce((sum, b) => sum + b.durationSec, 0);
        const finish = (linked: boolean) => {
          settled = true;
          handle.close();
          resolve({ group, linked });
        };
        list.appendChild(
          el('div', { class: 'pick-row pick-row--group' }, [
            el('div', { class: 'pick-main' }, [
              el('span', { class: 'pick-name', text: group.name }),
              el('span', {
                class: 'pick-meta',
                text: `${group.blocks.length} blocks · ${fmtDuration(seconds)}`,
              }),
            ]),
            el('div', { class: 'pick-actions' }, [
              el('button', {
                type: 'button',
                class: 'icon-btn',
                title: 'Add as linked group',
                'aria-label': `Add ${group.name} linked`,
                html: icon('link', 18),
                on: { click: () => finish(true) },
              }),
              el('button', {
                type: 'button',
                class: 'btn btn--small btn--primary',
                text: 'Add',
                on: { click: () => finish(false) },
              }),
            ]),
          ]),
        );
      }
    };

    render('');

    const handle: ModalHandle = openModal({
      title: 'Add a group',
      size: 'sm',
      body: [
        el('p', { class: 'muted small', text: '“Add” drops in a detached copy. The link button adds a live copy that follows future group edits.' }),
        searchField('Search groups', render),
        list,
      ],
      footer: [
        el('button', { type: 'button', class: 'btn btn--ghost', text: 'Close', on: { click: () => handle.close() } }),
      ],
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      },
    });
  });
}

export function chooseGroupDialog(title: string): Promise<Group | null> {
  return new Promise((resolve) => {
    const groups = getState().groupLibrary;
    let settled = false;
    const list = el('div', { class: 'pick-list' });
    if (!groups.length) {
      list.appendChild(el('p', { class: 'muted', text: 'No groups available.' }));
    }
    for (const group of groups) {
      list.appendChild(
        el(
          'button',
          {
            type: 'button',
            class: 'pick-row',
            on: {
              click: () => {
                settled = true;
                handle.close();
                resolve(group);
              },
            },
          },
          [
            el('span', { class: 'pick-main' }, [
              el('span', { class: 'pick-name', text: group.name }),
              el('span', { class: 'pick-meta', text: `${group.blocks.length} blocks` }),
            ]),
          ],
        ),
      );
    }
    const handle: ModalHandle = openModal({
      title,
      size: 'sm',
      body: [list],
      footer: [
        el('button', { type: 'button', class: 'btn btn--ghost', text: 'Cancel', on: { click: () => handle.close() } }),
      ],
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      },
    });
  });
}

/* ------------------------------------------------------------------ */
/* Group editor                                                        */
/* ------------------------------------------------------------------ */

export function openGroupEditor(groupId: string | null, entryId?: string): void {
  const state = getState();
  const existing = groupId ? state.groupLibrary.find((g) => g.id === groupId) ?? null : null;
  const entry = entryId
    ? (state.session.entries.find((e) => e.id === entryId && e.kind === 'group') as
        | GroupEntry
        | undefined) ?? null
    : null;
  const base: Group | null = entry ? entry.snapshot : existing;
  const draft: Group = base
    ? structuredClone(base)
    : { id: uid(), name: '', blocks: [], updatedAt: Date.now() };

  const nameInput = el('input', {
    class: 'field-input',
    type: 'text',
    maxlength: '80',
    placeholder: 'e.g. HIIT Circuit',
    value: draft.name,
    'aria-label': 'Group name',
  });
  const error = el('p', { class: 'form-error', role: 'alert', hidden: true });
  const list = el('div', { class: 'group-block-list' });
  const countLabel = el('span', { class: 'muted small' });

  const usage = existing ? countGroupUsage(existing.id, state.session) : 0;
  const paused = player.snapshot();
  const pausedHere =
    paused.status === 'paused' &&
    paused.position !== null &&
    ((existing !== null &&
      state.session.entries.some(
        (e) =>
          e.kind === 'group' &&
          e.linked &&
          e.groupId === existing.id &&
          paused.position?.entryId === e.id,
      )) ||
      (entry !== null && paused.position.entryId === entry.id));

  const usageWarning =
    usage > 0
      ? el('div', { class: 'notice notice--info' }, [
          el('span', { html: icon('alert', 18) }),
          el('span', {
            text: `This group is used in ${usage} place${usage === 1 ? '' : 's'}. Changes apply everywhere, including entries already in your session.`,
          }),
        ])
      : null;

  const pausedWarning = pausedHere
    ? el('div', { class: 'notice notice--warn' }, [
        el('span', { html: icon('alert', 18) }),
        el('span', { text: 'The paused session is sitting inside this group. You will be asked where to restart when you resume.' }),
      ])
    : null;

  let sortable: ReturnType<typeof makeSortable> | null = null;

  const renderBlocks = () => {
    sortable?.destroy();
    sortable = null;
    list.replaceChildren();
    const seconds = draft.blocks.reduce((sum, b) => sum + b.durationSec, 0);
    countLabel.textContent = `${draft.blocks.length} block${draft.blocks.length === 1 ? '' : 's'} · ${fmtDuration(seconds)}`;

    if (!draft.blocks.length) {
      list.appendChild(
        el('div', { class: 'empty-state empty-state--compact' }, [
          el('p', { text: 'No blocks yet. Add the first one below.' }),
        ]),
      );
      return;
    }

    draft.blocks.forEach((block, index) => {
      const row = el('div', { class: 'group-block' }, [
        el('button', {
          type: 'button',
          class: 'icon-btn drag-handle',
          'aria-label': `Reorder ${block.label}`,
          html: icon('grip', 18),
        }),
        el('span', { class: `dot dot--${block.type}` }),
        el('div', { class: 'group-block-main' }, [
          el('span', { class: 'group-block-name', text: block.label }),
          el('span', { class: 'group-block-meta', text: `${TYPE_LABELS[block.type]} · ${fmtDuration(block.durationSec)}` }),
        ]),
        el('div', { class: 'group-block-actions' }, [
          iconButton('Edit block', 'pencil', async () => {
            const result = await blockDialog({ title: 'Edit block', block, submitLabel: 'Apply' });
            if (!result) return;
            draft.blocks[index] = result.block;
            renderBlocks();
          }, { size: 17 }),
          iconButton('Remove block', 'trash', () => {
            draft.blocks.splice(index, 1);
            renderBlocks();
          }, { size: 17 }),
        ]),
      ]);
      list.appendChild(row);
    });

    sortable = makeSortable(list, (from, to) => {
      moveItem(draft.blocks, from, to);
      renderBlocks();
    });
  };

  renderBlocks();

  const form = el('div', { class: 'form' }, [
    pausedWarning,
    usageWarning,
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Group name' }), nameInput]),
    el('div', { class: 'field' }, [
      el('div', { class: 'field-head' }, [
        el('span', { class: 'field-label', text: 'Blocks' }),
        countLabel,
      ]),
      list,
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--block',
        html: `${icon('plus', 18)}<span>Add block</span>`,
        on: {
          click: async () => {
            const result = await blockDialog({
              title: 'Add block to group',
              block: makeBlock('work', '', 45),
              submitLabel: 'Add block',
            });
            if (!result) return;
            draft.blocks.push(result.block);
            renderBlocks();
          },
        },
      }),
    ]),
    error,
  ]);

  const save = () => {
    const name = nameInput.value.trim();
    if (!name) {
      error.textContent = 'Give the group a name.';
      error.hidden = false;
      nameInput.focus();
      return;
    }
    if (!draft.blocks.length) {
      error.textContent = 'Add at least one block.';
      error.hidden = false;
      return;
    }
    draft.name = name;
    draft.updatedAt = Date.now();
    if (entry) {
      update((s) => {
        const target = s.session.entries.find((e) => e.id === entry.id);
        if (target && target.kind === 'group') target.snapshot = draft;
      });
    } else {
      update((s) => {
        const index = s.groupLibrary.findIndex((g) => g.id === draft.id);
        if (index >= 0) s.groupLibrary[index] = draft;
        else s.groupLibrary.push(draft);
      });
    }
    handle.close();
    toast(
      entry
        ? `Updated the detached copy of “${name}”`
        : existing
          ? `Updated “${name}”`
          : `Created “${name}”`,
    );
  };

  const handle = openModal({
    title: entry ? 'Edit detached copy' : existing ? 'Edit group' : 'New group',
    body: [form],
    footer: [
      el('button', { type: 'button', class: 'btn btn--ghost', text: 'Cancel', on: { click: () => handle.close() } }),
      el('button', {
        type: 'button',
        class: 'btn btn--primary',
        text: entry ? 'Save copy' : existing ? 'Save changes' : 'Create group',
        on: { click: save },
      }),
    ],
    onClose: () => sortable?.destroy(),
  });

  window.setTimeout(() => nameInput.focus({ preventScroll: true }), 30);
}

/* ------------------------------------------------------------------ */
/* Small shared bits                                                   */
/* ------------------------------------------------------------------ */

export function repeatSummary(passSeconds: number, repeatCount: number): string {
  return `${fmtDuration(passSeconds)} × ${repeatCount} = ${fmtDuration(passSeconds * repeatCount)}`;
}
