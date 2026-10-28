import { countGroupUsage, fmtDuration, uid, type Group } from '../model';
import { getState, update } from '../state';
import { el, iconButton, toast, confirmDialog } from '../dom';
import { icon } from '../icons';
import { openGroupEditor } from '../dialogs';

export function renderGroups(container: HTMLElement): void {
  const state = getState();
  const groups = [...state.groupLibrary].sort((a, b) => a.name.localeCompare(b.name));

  const search = el('input', {
    class: 'field-input field-input--search',
    type: 'search',
    placeholder: 'Search groups',
    'aria-label': 'Search groups',
  });

  const rows: { node: HTMLElement; name: string }[] = [];
  const list = el('div', { class: 'lib-list' });
  const noMatch = el('p', { class: 'muted empty-search', text: 'No groups match that search.', hidden: true });

  for (const group of groups) {
    const row = groupCard(group);
    rows.push({ node: row, name: group.name.toLowerCase() });
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
      el('p', { class: 'eyebrow', text: 'Group library' }),
      el('h1', { class: 'page-title', text: 'Groups' }),
      el('p', {
        class: 'page-sub',
        text: 'Build a circuit once, then stack it anywhere — linked copies follow edits, detached copies freeze a snapshot.',
      }),
    ]),
    el('button', {
      type: 'button',
      class: 'btn btn--primary',
      html: `${icon('plus', 18)}<span>New group</span>`,
      on: { click: () => openGroupEditor(null) },
    }),
  ]);

  container.append(header);

  if (!groups.length) {
    container.appendChild(
      el('div', { class: 'empty-state' }, [
        el('div', { class: 'empty-art', html: icon('folder', 30) }),
        el('h2', { text: 'No groups yet' }),
        el('p', {
          text: 'A group is an ordered set of blocks — like a HIIT circuit. Save it here and reuse it in any session.',
        }),
        el('button', {
          type: 'button',
          class: 'btn btn--primary btn--block',
          html: `${icon('plus', 18)}<span>Create a group</span>`,
          on: { click: () => openGroupEditor(null) },
        }),
      ]),
    );
    return;
  }

  container.append(
    el('div', { class: 'lib-toolbar' }, [search]),
    list,
    noMatch,
  );
}

function groupCard(group: Group): HTMLElement {
  const state = getState();
  const seconds = group.blocks.reduce((sum, b) => sum + b.durationSec, 0);
  const usage = countGroupUsage(group.id, state.session);

  const add = (linked: boolean) => {
    update((draft) => {
      const source = draft.groupLibrary.find((g) => g.id === group.id) ?? group;
      draft.session.entries.push({
        kind: 'group',
        id: uid(),
        repeatCount: 1,
        groupId: source.id,
        linked,
        snapshot: structuredClone(source),
      });
    });
    toast(linked ? `Added “${group.name}” linked` : `Added “${group.name}” as a detached copy`);
  };

  const chips = el('div', { class: 'block-chips' });
  group.blocks.slice(0, 4).forEach((block) => {
    chips.appendChild(
      el('span', {
        class: `chip chip--${block.type}`,
        text: `${block.label} ${fmtDuration(block.durationSec)}`,
      }),
    );
  });
  if (group.blocks.length > 4) {
    chips.appendChild(el('span', { class: 'chip chip--more', text: `+${group.blocks.length - 4} more` }));
  }

  return el('article', { class: 'lib-card' }, [
    el('div', { class: 'lib-card-main' }, [
      el('div', { class: 'lib-card-title' }, [
        el('h3', { text: group.name }),
        usage > 0
          ? el('span', { class: 'tag tag--linked' }, [
              el('span', { html: icon('link', 12) }),
              el('span', { text: `In session ×${usage}` }),
            ])
          : null,
      ]),
      el('p', {
        class: 'lib-card-meta',
        text: `${group.blocks.length} block${group.blocks.length === 1 ? '' : 's'} · ${fmtDuration(seconds)}`,
      }),
      chips,
    ]),
    el('div', { class: 'lib-card-actions' }, [
      el('button', {
        type: 'button',
        class: 'btn btn--small btn--primary',
        text: 'Add',
        'aria-label': `Add ${group.name} as a detached copy`,
        on: { click: () => add(false) },
      }),
      iconButton(`Add ${group.name} linked`, 'link', () => add(true), { size: 18 }),
      iconButton(`Edit ${group.name}`, 'pencil', () => openGroupEditor(group.id), { size: 18 }),
      iconButton(`Duplicate ${group.name}`, 'copy', () => {
        const copy: Group = { ...structuredClone(group), id: uid(), name: `${group.name} copy`, updatedAt: Date.now() };
        update((draft) => {
          draft.groupLibrary.push(copy);
        });
        toast(`Duplicated “${group.name}”`);
      }, { size: 18 }),
      iconButton(`Delete ${group.name}`, 'trash', async () => {
        const ok = await confirmDialog({
          title: `Delete “${group.name}”?`,
          message: usage
            ? `It is linked in ${usage} place${usage === 1 ? '' : 's'}. Those entries keep their last-known blocks and flag a broken link.`
            : 'This removes the group from your library. Blocks already stacked in the session are unaffected.',
          confirmLabel: 'Delete group',
          danger: true,
        });
        if (!ok) return;
        update((draft) => {
          draft.groupLibrary = draft.groupLibrary.filter((g) => g.id !== group.id);
          for (const entry of draft.session.entries) {
            if (entry.kind === 'group' && entry.groupId === group.id && entry.linked) {
              entry.snapshot = structuredClone(group);
              entry.broken = true;
            }
          }
        });
        toast(`Deleted “${group.name}”`);
      }, { size: 18 }),
    ]),
  ]);
}
