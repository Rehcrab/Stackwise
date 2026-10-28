import { el, iconSpan } from './dom';
import { getView, onViewChange, setView, type ViewId } from './nav';
import { player } from './runtime';
import { createPlayerView, resumeSession, stopSession } from './playback';
import { subscribe } from './state';
import { fmtRemaining } from './model';
import { renderBuilder } from './views/builder';
import { renderGroups } from './views/groups';
import { renderBlocks } from './views/blocks';
import { renderSettings } from './views/settings';

const TABS: { id: ViewId; label: string; icon: 'layers' | 'folder' | 'list' | 'sliders' }[] = [
  { id: 'build', label: 'Build', icon: 'layers' },
  { id: 'groups', label: 'Groups', icon: 'folder' },
  { id: 'blocks', label: 'Blocks', icon: 'list' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
];

export function mountApp(root: HTMLElement): void {
  const viewHost = el('main', { class: 'view', id: 'view' });

  const tabButtons = TABS.map((tab) =>
    el(
      'button',
      {
        type: 'button',
        class: 'tab',
        dataset: { view: tab.id },
        'aria-label': tab.label,
        on: { click: () => setView(tab.id) },
      },
      [iconSpan(tab.icon, 18), el('span', { class: 'tab-label', text: tab.label })],
    ),
  );

  const nav = el('nav', { class: 'tabbar', 'aria-label': 'Primary' }, tabButtons);

  const brand = el(
    'button',
    {
      type: 'button',
      class: 'brand',
      on: { click: () => setView('build') },
    },
    [el('span', { class: 'brand-dot' }), el('span', { class: 'brand-name', text: 'Stackwise' })],
  );

  const topbar = el('div', { class: 'topbar' }, [brand, nav]);

  /* Paused bar ------------------------------------------------------ */
  const pausedLabel = el('span', { class: 'paused-label', text: '' });
  const pausedTime = el('span', { class: 'paused-time', text: '' });
  const pausedBar = el('div', { class: 'paused-bar', hidden: true, role: 'status' }, [
    el('div', { class: 'paused-info' }, [
      el('span', { class: 'paused-dot', 'aria-hidden': 'true' }),
      el('div', { class: 'paused-text' }, [
        el('span', { class: 'paused-title', text: 'Paused · editing unlocked' }),
        el('span', { class: 'paused-sub' }, [pausedLabel, el('span', { text: ' · ' }), pausedTime, el('span', { text: ' left' })]),
      ]),
    ]),
    el('div', { class: 'paused-actions' }, [
      el('button', {
        type: 'button',
        class: 'btn btn--primary btn--small',
        text: 'Resume',
        on: { click: () => void resumeSession() },
      }),
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--small',
        text: 'Stop',
        on: { click: () => void stopSession() },
      }),
    ]),
  ]);

  const playerView = createPlayerView();

  root.append(topbar, pausedBar, viewHost);
  document.body.appendChild(playerView.root);

  const focusableSelector = 'button, input, select, textarea, [tabindex]';
  let lastRenderedView: ViewId = getView();

  const render = (): void => {
    const view = getView();
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let restoreIndex = -1;
    if (active && viewHost.contains(active) && lastRenderedView === view) {
      restoreIndex = Array.from(viewHost.querySelectorAll<HTMLElement>(focusableSelector)).indexOf(active);
    }
    lastRenderedView = view;
    for (const button of tabButtons) {
      const active = button.dataset.view === view;
      button.classList.toggle('tab--active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    viewHost.replaceChildren();
    if (view === 'build') renderBuilder(viewHost);
    else if (view === 'groups') renderGroups(viewHost);
    else if (view === 'blocks') renderBlocks(viewHost);
    else renderSettings(viewHost);
    if (restoreIndex >= 0) {
      const nodes = viewHost.querySelectorAll<HTMLElement>(focusableSelector);
      nodes[restoreIndex]?.focus({ preventScroll: true });
    }
  };

  subscribe(() => render());
  onViewChange(() => {
    window.scrollTo(0, 0);
    render();
  });

  player.subscribe((snapshot) => {
    playerView.sync(snapshot);
    const paused = snapshot.status === 'paused';
    const playing = snapshot.status === 'running' || snapshot.status === 'done';
    document.body.classList.toggle('is-playing', playing);
    root.inert = playing;
    document.body.classList.toggle('is-paused', paused);
    pausedBar.hidden = !paused;
    if (paused && snapshot.step) {
      pausedLabel.textContent = snapshot.step.block.label;
      pausedTime.textContent = fmtRemaining(snapshot.remainingMs);
    }
  });

  render();
}
