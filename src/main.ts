import './styles.css';
import { Capacitor } from '@capacitor/core';
import { flushSave, initState } from './state';
import { mountApp } from './app';

async function boot(): Promise<void> {
  await initState();
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app root');
  mountApp(root);

  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });

  // Service workers are unsupported/unreliable in Capacitor WebViews, and are
  // unnecessary there because the app assets ship inside the APK.
  const canUseServiceWorker =
    import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator;

  if (canUseServiceWorker) {
    const registerServiceWorker = (): void => {
      const swUrl = new URL('sw.js', document.baseURI).href;
      void navigator.serviceWorker.register(swUrl).catch((error: unknown) => {
        console.warn('Service worker registration failed', error);
      });
    };
    // boot() awaits IndexedDB, so `load` may already have fired by now.
    if (document.readyState === 'complete') registerServiceWorker();
    else window.addEventListener('load', registerServiceWorker, { once: true });
  }
}

void boot();
