import { defaultState, PRESET_LABELS, uid, type AppState, type PresetId } from '../model';
import { getState, replaceState, update } from '../state';
import { audio } from '../runtime';
import { el, choiceDialog, confirmDialog, toast } from '../dom';
import { icon } from '../icons';

const PRESET_DESCRIPTIONS: Record<PresetId, string> = {
  beep: 'Crisp short beeps',
  gentle: 'Soft chimes, longer tail',
  gym: 'Loud and punchy',
  minimal: 'One soft tick',
  off: 'Silent',
};

export function renderSettings(container: HTMLElement): void {
  const settings = getState().settings;

  const preview = async (preset: PresetId): Promise<void> => {
    if (preset === 'off') return;
    const unlocked = await audio.unlock();
    if (!unlocked) {
      toast('Audio is blocked in this browser.');
      return;
    }
    const current = getState().settings;
    audio.play(['work'], preset, current.volume, false);
  };

  /* Sound ---------------------------------------------------------- */
  const presetGrid = el('div', { class: 'preset-grid', role: 'group', 'aria-label': 'Sound preset' });
  (Object.keys(PRESET_LABELS) as PresetId[]).forEach((preset) => {
    presetGrid.appendChild(
      el(
        'button',
        {
          type: 'button',
          class: 'preset-card',
          'aria-pressed': String(settings.preset === preset),
          on: {
            click: () => {
              update((draft) => {
                draft.settings.preset = preset;
                draft.settings.muted = false;
              }, { touchSession: false });
              void preview(preset);
            },
          },
        },
        [
          el('span', { class: 'preset-name', text: PRESET_LABELS[preset] }),
          el('span', { class: 'preset-desc', text: PRESET_DESCRIPTIONS[preset] }),
        ],
      ),
    );
  });

  const volumeValue = el('span', {
    class: 'slider-value',
    text: `${Math.round(settings.volume * 100)}%`,
  });
  const volume = el('input', {
    type: 'range',
    min: '0',
    max: '100',
    step: '1',
    value: String(Math.round(settings.volume * 100)),
    class: 'slider',
    'aria-label': 'Volume',
  });
  volume.addEventListener('input', () => {
    volumeValue.textContent = `${volume.value}%`;
  });
  volume.addEventListener('change', () => {
    update((draft) => {
      draft.settings.volume = Number(volume.value) / 100;
      draft.settings.muted = false;
    }, { touchSession: false });
    void preview(getState().settings.preset);
  });

  const soundCard = el('section', { class: 'card' }, [
    el('h2', { class: 'card-title', text: 'Sound' }),
    el('p', { class: 'card-sub', text: 'One preset drives every cue. Tap a preset to hear it.' }),
    presetGrid,
    el('div', { class: 'slider-row' }, [
      el('span', { class: 'slider-icon', html: icon('volume', 20) }),
      volume,
      volumeValue,
    ]),
    toggleRow('Mute all cues', 'Keeps your preset, silences the session.', settings.muted, (value) => {
      update((draft) => {
        draft.settings.muted = value;
      }, { touchSession: false });
    }),
    toggleRow('Countdown ticks', 'Tick during the final three seconds of every block.', settings.countdownTicks, (value) => {
      update((draft) => {
        draft.settings.countdownTicks = value;
      }, { touchSession: false });
    }),
    toggleRow('Final warning', 'Triple beep before a work block ends.', settings.finalWarning, (value) => {
      update((draft) => {
        draft.settings.finalWarning = value;
      }, { touchSession: false });
    }),
    toggleRow('Transition matrix', 'Different cues for work→rest, rest→work, work→work, rest→rest and any→prep.', settings.transitionMatrix, (value) => {
      update((draft) => {
        draft.settings.transitionMatrix = value;
      }, { touchSession: false });
    }),
  ]);

  /* Haptics -------------------------------------------------------- */
  const hapticsSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;
  const hapticCard = el('section', { class: 'card' }, [
    el('h2', { class: 'card-title', text: 'Haptics' }),
    el('p', {
      class: 'card-sub',
      text: hapticsSupported
        ? 'A short buzz on every cue, for phone-in-pocket sessions.'
        : 'This browser has no vibration support — the toggle is saved for devices that do.',
    }),
    toggleRow('Vibrate on cues', 'Work, rest, prep and completion each get their own pattern.', settings.vibrate, (value) => {
      update((draft) => {
        draft.settings.vibrate = value;
      }, { touchSession: false });
    }),
  ]);

  /* Data ----------------------------------------------------------- */
  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const incoming = parsed as Partial<AppState>;
      if (
        !incoming ||
        typeof incoming !== 'object' ||
        (!Array.isArray(incoming.blockLibrary) && !Array.isArray(incoming.groupLibrary) && !incoming.session)
      ) {
        throw new Error('That file is not a Stackwise backup.');
      }
      const choice = await choiceDialog({
        title: 'Import backup',
        message:
          'Merge adds the imported blocks, groups and session entries to this device. Replace overwrites everything here.',
        choices: [
          { label: 'Merge', value: 'merge', variant: 'primary' },
          { label: 'Replace', value: 'replace', variant: 'danger' },
        ],
      });
      if (!choice) return;
      if (choice === 'replace') {
        replaceState(incoming as AppState);
        toast('Backup restored');
      } else {
        update((draft) => {
          const blockIds = new Set(draft.blockLibrary.map((b) => b.id));
          for (const block of incoming.blockLibrary ?? []) {
            if (block && typeof block.id === 'string' && !blockIds.has(block.id)) {
              draft.blockLibrary.push(structuredClone(block));
              blockIds.add(block.id);
            }
          }
          const groupIds = new Set(draft.groupLibrary.map((g) => g.id));
          for (const group of incoming.groupLibrary ?? []) {
            if (group && typeof group.id === 'string' && !groupIds.has(group.id)) {
              draft.groupLibrary.push(structuredClone(group));
              groupIds.add(group.id);
            }
          }
          for (const entry of incoming.session?.entries ?? []) {
            if (!entry || typeof entry !== 'object') continue;
            draft.session.entries.push({ ...structuredClone(entry), id: uid() });
          }
        });
        toast('Backup merged');
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not read that file.');
    }
  });

  const dataCard = el('section', { class: 'card' }, [
    el('h2', { class: 'card-title', text: 'Your data' }),
    el('p', {
      class: 'card-sub',
      text: 'Everything lives in this browser (IndexedDB). Export a JSON backup to move devices or keep a copy.',
    }),
    el('div', { class: 'data-actions' }, [
      el('button', {
        type: 'button',
        class: 'btn btn--ghost',
        html: `${icon('download', 18)}<span>Export JSON</span>`,
        on: {
          click: () => {
            const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `stackwise-${new Date().toISOString().slice(0, 10)}.json`;
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1500);
            toast('Exported your library');
          },
        },
      }),
      el('button', {
        type: 'button',
        class: 'btn btn--ghost',
        html: `${icon('upload', 18)}<span>Import JSON</span>`,
        on: { click: () => fileInput.click() },
      }),
      el('button', {
        type: 'button',
        class: 'btn btn--danger',
        html: `${icon('trash', 18)}<span>Reset everything</span>`,
        on: {
          click: async () => {
            const ok = await confirmDialog({
              title: 'Reset everything?',
              message:
                'This deletes every saved block, group and the current session on this device. Export a backup first if you might want it later.',
              confirmLabel: 'Delete everything',
              danger: true,
            });
            if (!ok) return;
            replaceState(defaultState());
            toast('All data cleared');
          },
        },
      }),
      fileInput,
    ]),
  ]);

  const aboutCard = el('section', { class: 'card card--quiet' }, [
    el('h2', { class: 'card-title', text: 'Stackwise' }),
    el('p', {
      class: 'card-sub',
      text: 'Build once, stack forever. Works offline once loaded — add it to your home screen for a full-screen timer.',
    }),
  ]);

  container.append(
    el('section', { class: 'page-head' }, [
      el('div', { class: 'head-main' }, [
        el('p', { class: 'eyebrow', text: 'Preferences' }),
        el('h1', { class: 'page-title', text: 'Settings' }),
      ]),
    ]),
    soundCard,
    hapticCard,
    dataCard,
    aboutCard,
  );
}

function toggleRow(
  label: string,
  description: string,
  checked: boolean,
  onChange: (value: boolean) => void,
): HTMLElement {
  const input = el('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'toggle-row' }, [
    el('span', { class: 'toggle-text' }, [
      el('span', { class: 'toggle-label', text: label }),
      el('span', { class: 'toggle-desc', text: description }),
    ]),
    el('span', { class: 'switch' }, [input, el('span', { class: 'switch-track' })]),
  ]);
}
