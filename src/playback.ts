import {
  compileSession,
  fmtDuration,
  fmtRemaining,
  stepDurationMs,
  TYPE_LABELS,
} from './model';
import { getState } from './state';
import { player } from './runtime';
import { choiceDialog, confirmDialog, el, iconButton, toast } from './dom';
import { icon } from './icons';
import type { PlayerSnapshot } from './player';

export async function startSession(): Promise<void> {
  const state = getState();
  const steps = compileSession(state.session, state.groupLibrary);
  if (!steps.length) {
    toast('Add a block or group before starting.');
    return;
  }
  await player.start(steps);
}

export async function stopSession(): Promise<void> {
  const snapshot = player.snapshot();
  if (snapshot.status === 'idle') return;
  const ok = await confirmDialog({
    title: 'Stop session?',
    message: 'The stack stays exactly as it is, but this run resets to the beginning.',
    confirmLabel: 'Stop session',
    danger: true,
  });
  if (ok) player.stop();
}

/** Resume a paused run, reconciling any edits made while paused. */
export async function resumeSession(): Promise<void> {
  const snapshot = player.snapshot();
  if (snapshot.status !== 'paused' || !snapshot.position) return;

  const state = getState();
  const steps = compileSession(state.session, state.groupLibrary);
  if (!steps.length) {
    player.stop();
    toast('The session is empty now.');
    return;
  }

  const position = snapshot.position;
  const exact = steps.findIndex(
    (step) =>
      step.entryId === position.entryId &&
      step.repeatIndex === position.repeatIndex &&
      step.blockIndex === position.blockIndex &&
      step.block.id === position.blockId,
  );
  if (exact >= 0) {
    await player.resume(steps, exact, snapshot.remainingMs);
    return;
  }

  const sameRepeat = steps.findIndex(
    (step) => step.entryId === position.entryId && step.repeatIndex === position.repeatIndex,
  );
  const sameEntry = steps.findIndex((step) => step.entryId === position.entryId);

  if (sameRepeat < 0 && sameEntry < 0) {
    const choice = await choiceDialog({
      title: 'Current block removed',
      message: 'The block you paused in is no longer part of the session. Start the session over from the beginning?',
      choices: [{ label: 'Start over', value: 'restart', variant: 'primary' }],
    });
    if (choice === 'restart') await player.resume(steps, 0, stepDurationMs(steps[0]));
    return;
  }

  const restartIndex = sameRepeat >= 0 ? sameRepeat : sameEntry;
  const choice = await choiceDialog({
    title: 'This changes the current block',
    message:
      'Your edits changed the block you paused in. Restart this block from its beginning, or start the whole stack over?',
    choices: [
      { label: 'Restart here', value: 'here', variant: 'primary' },
      { label: 'Start over', value: 'restart' },
    ],
  });
  if (choice === 'here') await player.resume(steps, restartIndex, stepDurationMs(steps[restartIndex]));
  else if (choice === 'restart') await player.resume(steps, 0, stepDurationMs(steps[0]));
}

export interface PlayerView {
  root: HTMLElement;
  sync(snapshot: PlayerSnapshot): void;
}

function controlButton(name: Parameters<typeof icon>[0], label: string, className: string, onClick: () => void): HTMLButtonElement {
  return el('button', {
    type: 'button',
    class: className,
    'aria-label': label,
    title: label,
    html: icon(name, 26),
    on: { click: onClick },
  });
}

export function createPlayerView(): PlayerView {
  const badge = el('span', { class: 'badge badge--work', text: 'Work' });
  const label = el('h1', { class: 'player-label', text: '' });
  const time = el('div', { class: 'player-time', text: '0:00' });
  const next = el('p', { class: 'player-next', text: '' });
  const meta = el('p', { class: 'player-meta', text: '' });
  const stepFill = el('div', { class: 'progress-fill' });
  const sessionFill = el('div', { class: 'progress-fill' });
  const elapsed = el('span', { text: '0:00' });
  const total = el('span', { text: '0:00' });

  const pauseButton = controlButton('pause', 'Pause session', 'round round--primary', () => player.pause());

  const running = el('div', { class: 'player-running' }, [
    el('header', { class: 'player-head' }, [
      el('div', { class: 'player-brand' }, [
        el('span', { class: 'brand-dot' }),
        el('span', { text: 'Stackwise' }),
      ]),
      iconButton('Stop session', 'close', () => void stopSession(), { className: 'icon-btn--ghost' }),
    ]),
    el('div', { class: 'player-stage' }, [
      badge,
      label,
      time,
      next,
      meta,
    ]),
    el('footer', { class: 'player-foot' }, [
      el('div', { class: 'progress progress--step' }, [stepFill]),
      el('div', { class: 'player-session-line' }, [
        el('div', { class: 'progress progress--session' }, [sessionFill]),
        el('span', { class: 'player-session-time' }, [elapsed, ' / ', total]),
      ]),
      el('div', { class: 'player-controls' }, [
        controlButton('skipBack', 'Previous block', 'round', () => player.skip(-1)),
        pauseButton,
        controlButton('skipForward', 'Next block', 'round', () => player.skip(1)),
      ]),
      el('div', { class: 'player-extras' }, [
        el('button', {
          type: 'button',
          class: 'pill',
          text: '+15s',
          on: { click: () => player.addTime(15) },
        }),
        el('button', {
          type: 'button',
          class: 'pill',
          text: '+30s',
          on: { click: () => player.addTime(30) },
        }),
        el('button', {
          type: 'button',
          class: 'pill pill--quiet',
          text: 'Stop',
          on: { click: () => void stopSession() },
        }),
      ]),
    ]),
  ]);

  const doneTime = el('p', { class: 'done-meta', text: '' });
  const done = el('div', { class: 'player-done', hidden: true }, [
    el('div', { class: 'done-mark', html: icon('check', 40) }),
    el('h1', { class: 'done-title', text: 'Session complete' }),
    doneTime,
    el('div', { class: 'done-actions' }, [
      el('button', {
        type: 'button',
        class: 'btn btn--primary btn--block',
        text: 'Back to builder',
        on: { click: () => player.stop() },
      }),
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--block',
        text: 'Run it again',
        on: { click: () => void startSession() },
      }),
    ]),
  ]);

  const root = el('section', { class: 'player', hidden: true, 'aria-live': 'off' }, [running, done]);

  const sync = (snapshot: PlayerSnapshot): void => {
    if (snapshot.status === 'idle' || snapshot.status === 'paused') {
      root.hidden = true;
      document.title = 'Stackwise';
      return;
    }
    root.hidden = false;
    const isDone = snapshot.status === 'done';
    running.hidden = isDone;
    done.hidden = !isDone;

    if (isDone) {
      const seconds = Math.round(snapshot.sessionTotalMs / 1000);
      doneTime.textContent = `${fmtDuration(seconds)} stacked. Nice work.`;
      document.title = 'Session complete — Stackwise';
      return;
    }

    const step = snapshot.step;
    if (!step) return;
    root.dataset.type = step.block.type;
    badge.className = `badge badge--${step.block.type}`;
    badge.textContent = TYPE_LABELS[step.block.type];
    label.textContent = step.block.label;
    time.textContent = fmtRemaining(snapshot.remainingMs);
    next.textContent = snapshot.next
      ? `Next · ${snapshot.next.block.label} · ${fmtDuration(snapshot.next.block.durationSec)}`
      : 'Last block of the stack';
    meta.textContent =
      `${step.repeatCount > 1 ? `Rep ${step.repeatIndex + 1} of ${step.repeatCount} · ` : ''}` +
      `Block ${step.blockIndex + 1} of ${step.blockCount}`;
    const stepRatio = snapshot.stepTotalMs
      ? Math.min(1, Math.max(0, 1 - snapshot.remainingMs / snapshot.stepTotalMs))
      : 0;
    stepFill.style.transform = `scaleX(${stepRatio})`;
    const sessionRatio = snapshot.sessionTotalMs
      ? Math.min(1, Math.max(0, snapshot.sessionElapsedMs / snapshot.sessionTotalMs))
      : 0;
    sessionFill.style.transform = `scaleX(${sessionRatio})`;
    elapsed.textContent = fmtDuration(Math.round(snapshot.sessionElapsedMs / 1000));
    total.textContent = fmtDuration(Math.round(snapshot.sessionTotalMs / 1000));
    document.title = `${fmtRemaining(snapshot.remainingMs)} · ${step.block.label} — Stackwise`;
  };

  return { root, sync };
}

