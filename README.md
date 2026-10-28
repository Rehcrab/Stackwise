# Stackwise

A stack timer for interval workouts, focus sessions and any routine built from timed blocks.
Build a stack, save reusable circuits ("groups"), and choose whether a placed group stays **linked**
to its library copy or **detaches** into a snapshot.

Mobile-first PWA, offline-capable, with synthesized audio cues (no audio files to load).

## Run it

```bash
npm install
npm run dev        # then open http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build over HTTP
npm run typecheck
```

> Don't double-click `index.html`. It is a Vite/TypeScript entry point that the browser cannot run
> from `file://`, so it will look blank. Always open the app through the dev server or `npm run preview`
> (any `http://` URL) — a built `dist/index.html` opened directly from disk fails for the same reason.

Stack: Vite + TypeScript + plain DOM, `idb` for IndexedDB, `sortablejs` for drag reordering,
Capacitor 8 for the Android wrapper. No framework, no backend, no accounts.

## Host it on GitHub Pages (public repo)

1. Push this folder to a **public** GitHub repository (Pages is public on free accounts).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main` (or run **Actions → Deploy to GitHub Pages → Run workflow**).

The workflow in `.github/workflows/deploy-pages.yml` installs dependencies, runs `npm run build`,
and publishes `dist/`. The site is served from `https://<user>.github.io/<repo>/`.

No per-repo configuration is needed: `vite.config.ts` uses `base: './'`, so assets, the manifest and
the service worker all resolve relative to whatever subpath the repo gets. The generated
`dist/.nojekyll` keeps GitHub from processing the output, and the service worker registers under
`/<repo>/` with that scope.

## Package it as an Android app (Capacitor)

The `android/` project is included and already configured (commit it with the rest of the source).
Requirements: Node 22+, JDK 21 and the Android SDK (compileSdk 36) — Android Studio bundles the
right JDK.

```bash
npm run cap:sync           # build the web app, then npx cap sync
npx cap sync android       # or just sync after building
npx cap open android       # open Android Studio and press Run
```

Or build a debug APK from the CLI:

```bash
cd android
./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
```

Notes:

- `capacitor.config.ts` holds the app id (`com.stackwise.app`), name, and Android system-bar /
safe-area settings. Change the app id before publishing to a store.
- After any web change, run `npm run build` (or `npm run cap:sync`) so the WebView receives fresh
  assets; `npx cap sync` alone only copies the existing `dist/`.
- Native builds skip service-worker registration (assets are bundled in the APK), and the app uses
  `env(safe-area-inset-*)` plus Capacitor's injected `--safe-area-inset-*` variables for edge-to-edge
  screens.
- Android storage is the WebView's own IndexedDB, separate from your browser data.
- Verified here: `cap add android`, `cap sync android`, and a successful `assembleDebug`
  (4 MB debug APK). Runtime behaviour on a device/emulator, including audio and haptics, still needs
  a real-device check.

## What's implemented

**Session builder** (`Build`)

- Add ad-hoc blocks (work / rest / prep), saved blocks, or groups.
- Per-entry repeat stepper, live per-entry math (`4:00 × 3 = 12:00`) and total session time.
- Drag-to-reorder via a grip handle (mouse + touch), plus move up/down buttons for keyboard use.
- Duplicate, delete with an undo toast, expandable group contents, per-block sound override.
- Repeat-count editing, and editing a detached group copy in place.

**Groups** (`Groups`)

- Create/edit ordered groups with a name and blocks; reorder blocks by drag or edit/remove per block.
- Warning when a group is linked in the session (`Used in N places`), plus a paused-session warning
  when the paused run is sitting inside that group.
- `Add` places a detached copy (default); the chain button places a linked copy.
- Delete keeps last-known blocks in linked entries and marks them **Broken link**, with re-link/detach.

**Linked vs detached** (the core behaviour)

- Linked entries resolve their blocks from the group library on every render, so group edits update
  every linked entry and the session total immediately.
- Detached entries hold a deep-copied snapshot and ignore library edits.
- Convert either way with the link/unlink action (confirmed), and re-link a broken entry.

**Blocks** (`Blocks`)

- Saved block library with search, edit, duplicate, delete, and one-tap add to the session.
- Deleting a library block never removes copies already placed in the session.

**Playback**

- Full-screen player with big remaining time, current/next block, step and session progress.
- Pause / resume, skip back / forward, `+15s` / `+30s`, stop with confirmation, completion screen.
- Timing derives from an absolute end timestamp (`Date.now()`), so background-tab throttling does
  not cause drift; overrun is carried so the session catches up correctly.
- Wake Lock requested while running (where supported), released on pause/stop.
- Editing is blocked while running: the player covers and `inert`s the app. **Pause unlocks editing.**
  Resume reconciles edits — if the paused block still exists it continues; if it was removed you are
  offered a restart.
- `document.title` mirrors the countdown.

**Audio & haptics**

- Web Audio, all cues synthesized at runtime: presets `Beep`, `Gentle`, `Gym`, `Minimal`, `Off`.
- Cues: start per type (work/rest/prep), end, last-three-second ticks, triple-beep warning before a
  work block ends, completion fanfare.
- Transition matrix (on by default): distinct cues for work→rest, rest→work, work→work, rest→rest,
  and any→prep. Turn it off for generic end+start cues.
- Global volume, master mute, vibration toggle (where the browser supports it), per-block preset
  override.
- The audio context is created/resumed only on the Start tap, satisfying autoplay policies.

**Persistence & data**

- Everything (settings, block library, group library, current session) is stored in IndexedDB,
  with a localStorage fallback, and restored on reload.
- Settings → export/import JSON (merge or replace) and reset-all.
- Service worker + manifest for installability; the SW registers in production builds only, so dev
  HMR stays intact. Offline works after the first load of a production build.

**Accessibility**

- Keyboard-operable controls with visible focus, ARIA labels on icon buttons, `aria-pressed` on
  segmented choices, focus preserved across live re-renders, `inert` background during playback,
  no hover-only actions, `prefers-reduced-motion` respected.

## Deliberate scope choices

- Groups are placed with explicit **Add** / **Add linked** buttons (from the builder picker or the
  Groups tab) rather than dragging a card from a separate library panel into the stack. Dragging is
  used for reordering entries and group blocks. This keeps the single-column mobile layout intact
  while preserving the required default (Add = detached) and the separate linked action.
- Session templates, URL-hash sharing and accounts/cloud sync are out of scope for v1, per the PRD.
- No audio asset files: presets are synthesized, so there is nothing to preload or cache and cues
  fire with near-zero latency.

## Known limitations

- A page reload during a run returns to the builder with the stack intact; the in-progress timer is
  not restored.
- The Android wrapper has not been run on a device or emulator here; the APK compiles and the web
  assets are embedded, but audio, haptics and edge-to-edge layout should be checked on hardware.
- iOS has no `navigator.vibrate`; the toggle is saved but has no effect there.
- Import merge appends imported session entries and unions libraries by id; it does not diff.
- Audio is not verified by automated tests — check cues by starting a short stack.
