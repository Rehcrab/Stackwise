export type IconName =
  | 'play'
  | 'pause'
  | 'skipBack'
  | 'skipForward'
  | 'stop'
  | 'plus'
  | 'close'
  | 'trash'
  | 'copy'
  | 'pencil'
  | 'link'
  | 'unlink'
  | 'chevronDown'
  | 'chevronUp'
  | 'grip'
  | 'search'
  | 'download'
  | 'upload'
  | 'alert'
  | 'check'
  | 'repeat'
  | 'clock'
  | 'volume'
  | 'arrowUp'
  | 'arrowDown'
  | 'layers'
  | 'folder'
  | 'list'
  | 'sliders';

const PATHS: Record<IconName, string> = {
  play: '<path d="M7 4.6v14.8L20 12z" fill="currentColor" stroke="none"/>',
  pause:
    '<rect x="6" y="4.5" width="4.2" height="15" rx="1.4" fill="currentColor" stroke="none"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4" fill="currentColor" stroke="none"/>',
  skipBack:
    '<path d="M18.5 5.2v13.6L8 12z" fill="currentColor" stroke="none"/><rect x="4" y="5" width="2.6" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
  skipForward:
    '<path d="M5.5 5.2v13.6L16 12z" fill="currentColor" stroke="none"/><rect x="17.4" y="5" width="2.6" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l.9 13h9.2l.9-13M10 11v5.5M14 11v5.5"/>',
  copy:
    '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M15 9V6.2A2.2 2.2 0 0 0 12.8 4H6.2A2.2 2.2 0 0 0 4 6.2v6.6A2.2 2.2 0 0 0 6.2 15H9"/>',
  pencil: '<path d="M4 20h4.2L20 8.2a2.3 2.3 0 0 0-3.2-3.2L4.8 16.8z"/><path d="M14.5 6.5l3 3"/>',
  link:
    '<path d="M10.5 13.5a3.8 3.8 0 0 0 5.4 0l2.6-2.6a3.8 3.8 0 0 0-5.4-5.4l-1.4 1.4"/><path d="M13.5 10.5a3.8 3.8 0 0 0-5.4 0l-2.6 2.6a3.8 3.8 0 0 0 5.4 5.4l1.4-1.4"/>',
  unlink:
    '<path d="M8.2 12.6l-1.3 1.3a3.8 3.8 0 0 0 5.4 5.4l1.4-1.4"/><path d="M15.8 11.4l1.3-1.3a3.8 3.8 0 0 0-5.4-5.4l-1.4 1.4"/><path d="M4 4l16 16"/>',
  chevronDown: '<path d="M6 9.5l6 6 6-6"/>',
  chevronUp: '<path d="M6 14.5l6-6 6 6"/>',
  grip:
    '<g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></g>',
  search: '<circle cx="11" cy="11" r="6.2"/><path d="M16 16l4.2 4.2"/>',
  download: '<path d="M12 4v10.5M7.2 10l4.8 4.8L16.8 10M4.5 20h15"/>',
  upload: '<path d="M12 20V9.5M7.2 14l4.8-4.8L16.8 14M4.5 4h15"/>',
  alert: '<path d="M12 3.8l8.6 15.4H3.4z"/><path d="M12 9.5v4.4M12 16.8v.01"/>',
  check: '<path d="M5 12.5l4.8 4.8L19.5 6.5"/>',
  repeat: '<path d="M4.5 10.2a4 4 0 0 1 4-4h8.6l-2.6-2.6M19.5 13.8a4 4 0 0 1-4 4H6.9l2.6 2.6"/>',
  clock: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.5V12l3.2 2"/>',
  volume: '<path d="M4 10h3l4-3.4v10.8L7 14H4z"/><path d="M15 9.2a4 4 0 0 1 0 5.6M17.6 6.8a7.4 7.4 0 0 1 0 10.4"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  layers:
    '<path d="M12 3.4L20.4 8 12 12.6 3.6 8z"/><path d="M3.6 12.2L12 16.8l8.4-4.6"/><path d="M3.6 16.2L12 20.8l8.4-4.6"/>',
  folder:
    '<path d="M3.5 7.2A2.2 2.2 0 0 1 5.7 5h3.4l2.1 2.2h7.1a2.2 2.2 0 0 1 2.2 2.2v7.4a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2z"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><g fill="currentColor" stroke="none"><circle cx="4.6" cy="6.5" r="1.3"/><circle cx="4.6" cy="12" r="1.3"/><circle cx="4.6" cy="17.5" r="1.3"/></g>',
  sliders:
    '<path d="M4 7.5h8M16.5 7.5H20M4 16.5h3.5M12 16.5h8"/><circle cx="14" cy="7.5" r="2.2"/><circle cx="9.5" cy="16.5" r="2.2"/>',
};

export function icon(name: IconName, size = 20): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}
