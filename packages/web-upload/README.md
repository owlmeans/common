# @owlmeans/web-upload

File and folder upload UI for OwlMeans web applications (React, shadcn/ui, Tailwind CSS v4). A
headless queue holds what the person picks, drops or pastes, checks it against the upload policy at
once, and sends it through `@owlmeans/client-upload` when the application has a session — so files
can be chosen before the record they belong to exists. Three parts render it: a drop zone over any
content, file and folder pickers, and a compact list with progress and localized reasons.

- **Queue** — `useUploadQueue` / `createUploadQueueStore`: entries prechecked against the policy on
  every change (count, size per file, total size, paths, duplicates), queue-wide violations,
  `start(sessionId)` with concurrency, progress and abort, archives replaced by the entries the
  server unpacked, server rejections landing on their files with the reason.
- **Drop zone** — `UploadDropzone` wraps any content (a whole form): dragging files or folders over
  it shows an overlay, a drop adds them with their relative paths, pasted files are added too.
- **Pickers** — `UploadPickers`: "Add files" and "Add folder" buttons.
- **List** — `UploadList`: kind icon, path, size, progress, localized status and reason, remove;
  violations, totals, overall progress and the policy's limits.
- **Strings** — eight languages (en, pl, ru, be, uk, es, de, fr); the parts take a `translate`
  function and render English without one.

## Installation

```bash
bun add @owlmeans/web-upload@^0.2.0 @owlmeans/upload@^0.2.0 @owlmeans/client-upload@^0.2.0
bun add react react-dom lucide-react class-variance-authority clsx tailwind-merge tailwindcss
```

The second line is the peer dependencies (no Radix). `@owlmeans/upload` declares the tree,
`@owlmeans/client-upload` sends through it; bind the tree in the client context with
`@owlmeans/client-entrypoint` (`bindAll`). The server side is `@owlmeans/server-upload`.

Add the package to the app's Tailwind sources (the path is relative to the app's CSS entry):

```css
@source "../../../node_modules/@owlmeans/web-upload/src";
```

## Quick start

```tsx
import type { FormEvent } from 'react'
import { UploadDropzone, UploadList, UploadPickers, useUploadI18n, useUploadQueue } from '@owlmeans/web-upload'
import { materialProtocols } from '../shared/protocols.js'   // makeUploadProtocols(...), bound with bindAll in the context

const MATERIALS_POLICY = { maxFiles: 50, maxFileBytes: 12 * 1024 * 1024 }

export const ProjectForm = () => {
  const i18n = useUploadI18n()
  const queue = useUploadQueue({ policy: MATERIALS_POLICY, protocols: materialProtocols })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const project = await createProject()   // the upload session now exists, keyed by the project id
    await queue.start(project.id)
  }

  return <UploadDropzone queue={queue} className="rounded-xl border p-4" {...i18n}>
    <form onSubmit={submit}>
      <textarea name="prompt" />
      <UploadPickers queue={queue} {...i18n} />
      <UploadList queue={queue} {...i18n} />
      <button type="submit">Create</button>
    </form>
  </UploadDropzone>
}
```

## Usage

### A queue that outlives the screen

```tsx
import { createUploadQueueStore, useUploadQueue } from '@owlmeans/web-upload'

export const materialsQueue = createUploadQueueStore({ policy: MATERIALS_POLICY })   // module level

const Step = () => {
  const queue = useUploadQueue({ store: materialsQueue, protocols: materialProtocols })   // renders the store
  return <UploadList queue={queue} />
}
```

### Reading the result of a run

```typescript
import { UploadEntryStatus, UploadRejectedBy } from '@owlmeans/web-upload'

const entries = await queue.start(sessionId, { session })   // a known session skips the client's state call
entries.filter(entry => entry.status === UploadEntryStatus.Accepted)
entries.filter(entry => entry.rejectedBy === UploadRejectedBy.Server)   // reason: the server's verdict
entries.filter(entry => entry.status === UploadEntryStatus.Failed)      // sent again by the next start
```

### Strings for an application's own UI

```typescript
import { makeUploadText } from '@owlmeans/web-upload'

const text = makeUploadText(translate, locale)   // both optional: English, en formatting
text.size(1536)                     // '1.5 kB' in English
text.detail(entry, queue.policy)    // the broken limit with its ceiling, the reason, or the archive it came from
queue.violations.map(text.violation)
```

### Collecting a drop yourself

```typescript
import { collectDroppedFiles } from '@owlmeans/web-upload'

const onDrop = (event: React.DragEvent) => {
  event.preventDefault()
  // Inside the handler: the drop's items are readable only while the event is dispatched
  void collectDroppedFiles(event.dataTransfer, { limit: 200 }).then(files => queue.add(files))   // queue.add(event.dataTransfer) does the same
}
```

## API

| Export | Purpose |
|---|---|
| `useUploadQueue(options?)` | The queue for a component: its state plus `add`, `remove`, `clear`, `start`, `abort`. |
| `createUploadQueueStore(settings?)` | The same queue outside React: `state()`, `subscribe(listener)`, `configure(settings)` and the actions. |
| `useUploadI18n()` | `{ translate, locale }` over the packaged bundle and the current language — spread onto every part. |
| `UploadDropzone` | Makes its children a drop (and paste) target with an overlay. |
| `UploadPickers` | "Add files" / "Add folder" buttons over hidden file inputs. |
| `UploadList` | One row per entry, then violations, overall progress, totals and the policy's limits. |
| `makeUploadText(translate?, locale?)` | Every string the parts show (`UploadText`), for an app's own UI. |
| `collectDroppedFiles(dataTransfer, options?)` | The `{ file, path }` pairs of a drop or a paste, folders walked. |
| `uploadKindHelper` | `guess(name, type?)` — the `FileKind` a local file claims (for its icon). |
| `createUploadKindHelper()` | Makes a fresh `UploadKindHelper`. |
| `UploadEntryStatus` | `queued`, `uploading`, `accepted`, `rejected`, `failed`. |
| `UploadRejectedBy` | `precheck` (recomputed on every change), `server` (final). |
| `DEFAULT_UPLOAD_IGNORE` | `.DS_Store`, `Thumbs.db`, `desktop.ini`, `__MACOSX` — names never added. |
| `DEFAULT_COLLECT_LIMIT` | `1000` — files collected from one drop at most. |
| `WEB_UPLOAD_RESOURCE` | `'web-upload'` — the i18n library resource (namespace `lib`). |
| `UploadEntry` | One file of the queue (path, size, kind, status, progress, reason, limit, server rows, …). |
| `UploadQueue` · `UploadQueueState` · `UploadQueueActions` | What a component sees; the snapshot; the bound actions. |
| `UploadQueueStore` · `UploadQueueSettings` · `UploadQueueOptions` | The store; its settings; the hook's options (settings + `protocols`, `context`, `store`). |
| `UploadQueueTotals` · `UploadQueueProgress` · `UploadViolation` · `UploadLimitKind` | Counts; the running upload's bytes; a queue-wide violation; `file-bytes`, `files`, `total-bytes`. |
| `UploadStartOptions` | `{ session?, precheck?, signal? }` of `start`. |
| `UploadSource` · `UploadPickedFile` · `UploadFileLike` | What `add` takes; `{ file, path }`; a browser `File` as read here. |
| `UploadTranslate` · `UploadI18n` · `UploadText` | `(key, fallback) => string`; `{ translate?, locale? }`; the string helper. |
| `CollectOptions` · `UploadKindHelper` | `{ ignore?, limit? }`; the kind helper's interface. |
| `UploadDropzoneProps` · `UploadPickersProps` · `UploadListProps` | The parts' props. |

Importing the package registers its eight-language bundle in the i18n library namespace.

## Configuration

`useUploadQueue` / `createUploadQueueStore` settings:

| Option | Default | Meaning |
|---|---|---|
| `policy` | `DEFAULT_UPLOAD_POLICY` of `@owlmeans/upload` (filled by `uploadPolicyHelper.normalize`) | What entries are prechecked against — use the session's policy |
| `client` | — | The `UploadClient` `start` and `remove` go through |
| `protocols` (hook) | — | A client-bound upload tree; the hook makes the client over it (ignored with `client`) |
| `context` (hook) | the React context | The context `protocols` are bound in |
| `store` (hook) | a new store | A store made with `createUploadQueueStore` to render |
| `concurrency` | the client's (3) | Files in flight at once |
| `retries` | the client's (2) | Retries after a transport failure |
| `ignore` | `DEFAULT_UPLOAD_IGNORE` | Names skipped when added, matched against every path segment |
| `collectLimit` | `1000` | Files collected from one drop at most |

The hook re-applies the settings when they change; the policy and the ignore list are compared by
value, so inline objects are fine.

Part props: `UploadDropzone` — `queue`, `disabled`, `paste` (true), `onAdded`, `overlay`,
`className`, `id`. `UploadPickers` — `queue`, `files` (true), `folder` (true), `accept`, `disabled`,
`variant` (`outline`), `size` (`default`), `onAdded`, `className`. `UploadList` — `queue`,
`removable` (true), `totals` (true), `hints` (true), `empty`, `className`. Every part also takes
`translate` and `locale`.

## Security and limits

- **The local precheck is a courtesy.** It runs `uploadPolicyHelper.precheck` on every change; the
  client prechecks again against the session's own state, and the server verifies every byte.
  An archive counts as one file until the server reports its entries.
- **Paths.** Entries carry normalized relative paths (folders kept); a refused path is shown in its
  display form and rejected `path-invalid`. Duplicates compare case-insensitively.
- **Bounded folder walks.** A drop stops at `collectLimit` files and at 64 folder levels, skips the
  ignored names without entering their folders, and never hangs on a link loop or a huge tree.
- **Never opened in place.** A drop that carries files is always `preventDefault`ed, even while the
  drop zone is disabled.
- **Removal keeps the server in sync.** Removing an entry the server holds removes its row from the
  session first; a refusal there keeps the entry.
- **Clear keeps the session.** `clear()` aborts the run and empties the queue; files the server
  accepted stay in the session.
- **Rendered as text.** Paths and names are rendered by React; `useUploadI18n` turns off i18next
  escaping so a path is not double-escaped.

## Related packages

- `@owlmeans/upload` — the policy, the reasons, the precheck rules and the protocol tree.
- `@owlmeans/client-upload` — the client `start` and `remove` go through.
- `@owlmeans/server-upload` — what decides each file on the server.
- `@owlmeans/client-entrypoint` (`bindAll`), `@owlmeans/client` (`useContext`),
  `@owlmeans/client-i18n` and `@owlmeans/i18n` (the bundle and its overrides).

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.1-alpha.0
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
