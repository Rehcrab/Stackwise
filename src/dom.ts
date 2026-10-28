import { icon, type IconName } from './icons';

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') node.innerHTML = String(value);
    else if (key === 'on') {
      for (const [event, handler] of Object.entries(value as Record<string, EventListener>)) {
        node.addEventListener(event, handler);
      }
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value as Record<string, string>);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value as Partial<CSSStyleDeclaration>);
    } else if (key in node) {
      (node as unknown as Record<string, unknown>)[key] = value;
    } else {
      node.setAttribute(key, String(value));
    }
  }
  appendChildren(node, children);
  return node;
}

export function appendChildren(node: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) appendChildren(node, child);
    else if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  }
}

export function iconButton(
  label: string,
  name: IconName,
  onClick: (event: MouseEvent) => void,
  opts: { className?: string; size?: number; disabled?: boolean; title?: string } = {},
): HTMLButtonElement {
  const button = el('button', {
    class: `icon-btn ${opts.className ?? ''}`.trim(),
    type: 'button',
    'aria-label': label,
    title: opts.title ?? label,
    html: icon(name, opts.size ?? 20),
    disabled: opts.disabled ?? false,
    on: { click: onClick as EventListener },
  });
  return button;
}

export function iconSpan(name: IconName, size = 20): HTMLSpanElement {
  return el('span', { class: 'icon', 'aria-hidden': 'true', html: icon(name, size) });
}

/* ------------------------------------------------------------------ */
/* Modals                                                              */
/* ------------------------------------------------------------------ */

export interface ModalOptions {
  title: string;
  body: Child[];
  footer?: Child[];
  size?: 'sm' | 'md';
  onClose?: () => void;
}

export interface ModalHandle {
  close: () => void;
  root: HTMLElement;
}

const openModals: { overlay: HTMLElement; previousFocus: HTMLElement | null }[] = [];

function syncBodyLock(): void {
  document.body.classList.toggle('modal-open', openModals.length > 0);
}

export function openModal(options: ModalOptions): ModalHandle {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const closeButton = iconButton('Close dialog', 'close', () => close());

  const dialog = el('div', { class: `modal modal--${options.size ?? 'md'}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': options.title }, [
    el('header', { class: 'modal-head' }, [
      el('h2', { class: 'modal-title', text: options.title }),
      closeButton,
    ]),
    el('div', { class: 'modal-body' }, options.body),
    options.footer ? el('footer', { class: 'modal-foot' }, options.footer) : null,
  ]);

  const overlay = el(
    'div',
    {
      class: 'modal-overlay',
      on: {
        mousedown: (event: Event) => {
          if (event.target === overlay) close();
        },
      },
    },
    [dialog],
  );

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    overlay.remove();
    const idx = openModals.findIndex((m) => m.overlay === overlay);
    if (idx >= 0) openModals.splice(idx, 1);
    syncBodyLock();
    previousFocus?.focus();
    options.onClose?.();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  overlay.addEventListener('keydown', onKeydown);
  document.body.appendChild(overlay);
  openModals.push({ overlay, previousFocus });
  syncBodyLock();

  const initial = dialog.querySelector<HTMLElement>(
    'input, select, textarea, button.primary, .modal-foot button',
  );
  (initial ?? closeButton).focus({ preventScroll: true });

  return { close, root: overlay };
}

export interface DialogChoice {
  label: string;
  value: string;
  variant?: 'primary' | 'danger' | 'ghost';
}

export function choiceDialog(options: {
  title: string;
  message: string;
  choices: DialogChoice[];
  cancelLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      handle.close();
      resolve(value);
    };
    const buttons = options.choices.map((choice) =>
      el('button', {
        type: 'button',
        class: `btn ${choice.variant === 'primary' ? 'btn--primary' : choice.variant === 'danger' ? 'btn--danger' : 'btn--ghost'}`,
        text: choice.label,
        on: { click: () => finish(choice.value) },
      }),
    );
    const handle = openModal({
      title: options.title,
      size: 'sm',
      body: [el('p', { class: 'dialog-message', text: options.message })],
      footer: [
        el('button', {
          type: 'button',
          class: 'btn btn--ghost',
          text: options.cancelLabel ?? 'Cancel',
          on: { click: () => finish(null) },
        }),
        ...buttons,
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

export function confirmDialog(options: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      handle.close();
      resolve(value);
    };
    const handle = openModal({
      title: options.title,
      size: 'sm',
      body: [el('p', { class: 'dialog-message', text: options.message })],
      footer: [
        el('button', {
          type: 'button',
          class: 'btn btn--ghost',
          text: options.cancelLabel ?? 'Cancel',
          on: { click: () => finish(false) },
        }),
        el('button', {
          type: 'button',
          class: `btn ${options.danger ? 'btn--danger' : 'btn--primary'}`,
          text: options.confirmLabel ?? 'Confirm',
          on: { click: () => finish(true) },
        }),
      ],
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
    });
  });
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

let toastHost: HTMLElement | null = null;

export function toast(
  message: string,
  options: { actionLabel?: string; onAction?: () => void; duration?: number } = {},
): void {
  if (!toastHost) {
    toastHost = el('div', { class: 'toast-host', 'aria-live': 'polite' });
    document.body.appendChild(toastHost);
  }
  const duration = options.duration ?? (options.actionLabel ? 6500 : 3200);
  const node = el('div', { class: 'toast', role: 'status' }, [
    el('span', { class: 'toast-text', text: message }),
  ]);
  let timer = 0;
  const dismiss = () => {
    window.clearTimeout(timer);
    node.classList.add('toast--leaving');
    window.setTimeout(() => node.remove(), 180);
  };
  if (options.actionLabel) {
    node.appendChild(
      el('button', {
        type: 'button',
        class: 'toast-action',
        text: options.actionLabel,
        on: {
          click: () => {
            options.onAction?.();
            dismiss();
          },
        },
      }),
    );
  }
  toastHost.appendChild(node);
  timer = window.setTimeout(dismiss, duration);
}
