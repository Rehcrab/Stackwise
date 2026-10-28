import { fmtDuration, TYPE_LABELS, uid, type Block } from '../model';
import { getState, update } from '../state';
import { el, iconButton, toast, confirmDialog } from '../dom';
import { icon } from '../icons';
import { blockDialog } from '../dialogs';

export function renderBlocks(container: HTMLElement): void {
  const state = getState();
  const blocks = [...state.blockLibrary].sort((a, b) => a.label.localeCompare(b.label));

  const search = el('input', {
    class: 'field-input field-input--search',
    type: 'search',
    placeholder: 'Search blocks',
    'aria-label': 'Search blocks',
  });

  const rows: { node: HTMLElement; name: string }[] = [];
  const list = el('div', { class: 'lib-list' });
  const noMatch = el('p', { class: 'muted empty-search', text: 'No blocks match that search.', hidden: true });

  for (const block of blocks) {
    const row = blockCard(block);
    rows.push({ node: row, name: block.label.toLowerCase() });
    list.appendChild(row);
  }

  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    for (const row of rows) {
      const match = row.name.includes(query);
      row.node.hidden = !match;
      if (match) visible++;
    }
    noMatch.hidden = visible > 0 || rows.length === 0;
  });

  const header = el('section', { class: 'page-head' }, [
    el('div', { class: 'head-main' }, [
      el('p', { class: 'eyebrow', text: 'Block library' }),
      el('h1', { class: 'page-title', text: 'Blocks' }),
      el('p', { class: 'page-sub', text: 'Saved single blocks you can drop into any stack.' }),
    ]),
    el('button', {
      type: 'button',
      class: 'btn btn--primary',
      html: `${icon('plus', 18)}<span>New block</span>`,
      on: {
        click: async () => {
          const result = await blockDialog({ title: 'New block', submitLabel: 'Save block' });
          if (!result) return;
          update((draft) => {
            draft.blockLibrary.push(result.block);
          });
          toast(`Saved “${result.block.label}”`);
        },
      },
    }),
  ]);

  container.append(header);

  if (!blocks.length) {
    container.appendChild(
      el('div', { class: 'empty-state' }, [
        el('div', { class: 'empty-art', html: icon('clock', 30) }),
        el('h2', { text: 'No saved blocks' }),
        el('p', { text: 'Save common intervals — a 30s sprint, a 5 min warm-up — and reuse them with one tap.' }),
        el('button', {
          type: 'button',
          class: 'btn btn--primary btn--block',
          html: `${icon('plus', 18)}<span>Create a block</span>`,
          on: {
            click: async () => {
              const result = await blockDialog({ title: 'New block', submitLabel: 'Save block' });
              if (!result) return;
              update((draft) => {
                draft.blockLibrary.push(result.block);
              });
            },
          },
        }),
      ]),
    );
    return;
  }

  container.append(el('div', { class: 'lib-toolbar' }, [search]), list, noMatch);
}

function blockCard(block: Block): HTMLElement {
  return el('article', { class: 'lib-card lib-card--compact' }, [
    el('span', { class: `dot dot--${block.type}` }),
    el('div', { class: 'lib-card-main' }, [
      el('div', { class: 'lib-card-title' }, [
        el('h3', { text: block.label }),
        el('span', { class: `badge badge--${block.type}`, text: TYPE_LABELS[block.type] }),
      ]),
      el('p', {
        class: 'lib-card-meta',
        text: `${fmtDuration(block.durationSec)}${block.sound ? ` · ${block.sound} sound` : ''}`,
      }),
    ]),
    el('div', { class: 'lib-card-actions' }, [
      el('button', {
        type: 'button',
        class: 'btn btn--small btn--primary',
        text: 'Add',
        'aria-label': `Add ${block.label} to session`,
        on: {
          click: () => {
            update((draft) => {
              draft.session.entries.push({
                kind: 'block',
                id: uid(),
                repeatCount: 1,
                block: { ...structuredClone(block), id: uid() },
                savedBlockId: block.id,
              });
            });
            toast(`Added “${block.label}” to the session`);
          },
        },
      }),
      iconButton(`Edit ${block.label}`, 'pencil', async () => {
        const result = await blockDialog({ title: 'Edit block', block, submitLabel: 'Save changes' });
        if (!result) return;
        update((draft) => {
          const index = draft.blockLibrary.findIndex((b) => b.id === block.id);
          if (index >= 0) draft.blockLibrary[index] = result.block;
        });
      }, { size: 18 }),
      iconButton(`Duplicate ${block.label}`, 'copy', () => {
        update((draft) => {
          draft.blockLibrary.push({ ...structuredClone(block), id: uid(), label: `${block.label} copy` });
        });
        toast(`Duplicated “${block.label}”`);
      }, { size: 18 }),
      iconButton(`Delete ${block.label}`, 'trash', async () => {
        const ok = await confirmDialog({
          title: `Delete “${block.label}”?`,
          message: 'This removes it from the library. Blocks already stacked in your session keep their own copy.',
          confirmLabel: 'Delete block',
          danger: true,
        });
        if (!ok) return;
        update((draft) => {
          draft.blockLibrary = draft.blockLibrary.filter((b) => b.id !== block.id);
        });
      }, { size: 18 }),
    ]),
  ]);
}
