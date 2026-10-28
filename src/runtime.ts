import { AudioEngine } from './audio';
import { Player } from './player';
import { getState } from './state';

export const audio = new AudioEngine();

export const player = new Player({
  getSettings: () => getState().settings,
  audio,
});
