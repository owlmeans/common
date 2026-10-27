---
name: reload
description: The global connection-lost prompt — SocketReloadDialog, the cfg.socket.reloadDialog opt-in, and its Try again and Reload page actions.
metadata:
  purposes: feedback, config
  mentions: SocketReloadDialog, reloadDialog, useSocketStatus, useSocketRetry, appendSocketStatus
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-panel — Reload prompt

| Export | Description |
|--------|-------------|
| `SocketReloadDialog` | The global "connection lost — try again / reload" prompt (opt in via `cfg.socket.reloadDialog`) `PanelApp` mounts automatically — see below. The hooks it reads, `useSocketStatus` and `useSocketRetry`, are imported from `@owlmeans/client-socket`, not from this package |

## Reload prompt — `SocketReloadDialog`

`makeContext` calls `appendSocketStatus` from `@owlmeans/client-socket` unconditionally, and
`PanelApp` mounts `SocketReloadDialog` as a sibling of the Router — exactly where
`PanelCookieConsent` lives, and for the same reason: a dialog mounted inside a route is torn down
on every navigation. Neither does anything unless an app opts in:

```typescript
cfg.socket = { reloadDialog: true }
```

Once any `socketClientHelper.ws()`/`useWs()` connection in the app has exhausted its own retry budget
(`useSocketStatus() === 'lost'`), a global, blocking `AlertDialog` covers the screen — no Escape,
no outside click, two actions:

- **"Try again"** (`data-socket-retry-action`) — `useSocketRetry().retry()` revives every lost
  connection (see the `client-socket` skill). The dialog stays up with the button disabled and
  reading "Reconnecting…" while they retry, closes once the aggregate is `'online'`, and offers
  both buttons again if it falls back to `'lost'`.
- **"Reload page"** (`data-socket-reload-action`) — `window.location.reload()`, the fallback that
  always works.

The status service also retries by itself when the tab becomes visible, the window gains focus or
the browser comes back online, so a socket that died in a background tab is usually back before
anyone presses anything — an open dialog shows "Reconnecting…" through that too. Strings are
lib-tier (`useI18nLib('socket', 'reload')`: `title`, `description`, `action`, `retry`,
`retrying`), 8 languages, under `src/components/socket/i18n/`.

Leave `cfg.socket.reloadDialog` unset (or `false`) for an app that would rather show its own
inline "reconnecting…" state — `useSocketStatus()` from `@owlmeans/client-socket` serves that,
independent of the dialog.
