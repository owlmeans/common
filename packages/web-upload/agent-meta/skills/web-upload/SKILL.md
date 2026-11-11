---
name: web-upload
description: "How to use @owlmeans/web-upload — file and folder upload UI for OwlMeans web apps: the headless upload queue (useUploadQueue / createUploadQueueStore — files queued and prechecked against an UploadPolicy before any session exists, per-entry reasons and queue-wide violations, start(sessionId) through @owlmeans/client-upload with concurrency, progress and abort, archives replaced by the entries they produced, server rejections per file), collectDroppedFiles (dropped folders walked with relative paths), and the shadcn/Tailwind v4 parts UploadDropzone (drag-and-drop over any content, paste), UploadPickers (Add files / Add folder) and UploadList (kind icon, path, size, progress, localized status and reason, remove, totals, limits), localized in eight languages. Auto-invoked when letting a person attach files or folders to a form, building an upload screen, or rendering upload progress and rejections."
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-upload

**Layer:** Web (React)
**Install:** `"@owlmeans/web-upload": "^0.1.22-rc.0"` in `dependencies`

The browser half of the upload family: contract `/upload`, server `/server-upload`, client
`/client-upload`. A queue holds what the person picked or dropped, checks it against the policy at
once, and sends it when the application has a session — so files can be chosen before the record
they belong to exists.

## Key Exports

| Export | What it is |
|---|---|
| `useUploadQueue({ policy?, client?, protocols?, context?, store?, concurrency?, retries?, ignore?, collectLimit? })` → `UploadQueue` | The queue for a component: state + `add`, `remove`, `clear`, `start`, `abort`. The client is `client`, else `makeUploadClient(context ?? useContext(), protocols)` |
| `createUploadQueueStore(settings?)` → `UploadQueueStore` | The same queue outside React (`state()`, `subscribe(listener)`, `configure(settings)` + the actions) — hold it when the queue must outlive the screen that filled it; render it with `useUploadQueue({ store })` |
| `UploadDropzone` | `<UploadDropzone queue={queue}>{form}</UploadDropzone>` — a drop anywhere over the children adds files and folders; pasted files too |
| `UploadPickers` | "Add files" / "Add folder" buttons over hidden inputs (`multiple`, `webkitdirectory`) |
| `UploadList` | One row per entry, then violations, overall progress, totals and the policy's limits |
| `useUploadI18n()` → `{ translate, locale }` | Spread onto every part: `{...useUploadI18n()}` — needs the app's i18n instance |
| `makeUploadText(translate?, locale?)` → `UploadText` | Every string the parts show (status, detail, violation, hints, totals, sizes) for an app's own UI |
| `collectDroppedFiles(dataTransfer, { ignore?, limit? })` | `{ file, path }[]` of a drop or a paste, folders walked |
| `uploadKindHelper.guess(name, type?)` | The `FileKind` a local file claims (icon only; the server's detected kind replaces it) |
| `UploadEntryStatus` | `queued`, `uploading`, `accepted`, `rejected`, `failed` |
| `UploadRejectedBy` | `precheck` (recomputed on every change), `server` (final) |
| `DEFAULT_UPLOAD_IGNORE`, `DEFAULT_COLLECT_LIMIT`, `WEB_UPLOAD_RESOURCE` | `.DS_Store`, `Thumbs.db`, `desktop.ini`, `__MACOSX`; 1000 files per drop; `lib:web-upload` |

Types: `UploadEntry`, `UploadQueue`, `UploadQueueState`, `UploadQueueActions`, `UploadQueueSettings`,
`UploadQueueOptions`, `UploadQueueStore`, `UploadQueueTotals`, `UploadQueueProgress`, `UploadViolation`,
`UploadLimitKind`, `UploadSource`, `UploadPickedFile`, `UploadStartOptions`, `UploadTranslate`, `UploadI18n`,
`UploadText`, `CollectOptions`, the parts' `Upload*Props`.

## Usage

```tsx
import { UploadDropzone, UploadList, UploadPickers, useUploadI18n, useUploadQueue } from '@owlmeans/web-upload'

const HomeForm = () => {
  const i18n = useUploadI18n()
  // materialProtocols: the app's upload tree (makeUploadProtocols), bound with bindAll in the context
  const queue = useUploadQueue({ policy: MATERIALS_LIMITS, protocols: materialProtocols })

  const submit = async () => {
    const project = await createProject(prompt)   // the session now exists, keyed by the project id
    await queue.start(project.id)
  }

  return <UploadDropzone queue={queue} className="rounded-xl border p-4" {...i18n}>
    <form onSubmit={submit}>
      <textarea />
      <UploadPickers queue={queue} {...i18n} />
      <UploadList queue={queue} {...i18n} />
    </form>
  </UploadDropzone>
}
```

## The queue

- **Entries** — `{ id, path, name, size, type, kind, file?, status, progress (0…1), reason?, limit?,
  rejectedBy?, error?, httpStatus?, server?, from? }`. `path` is normalized (folders kept) or, when
  refused, its display form; `file` is absent on an entry an archive produced.
- **Precheck** — every change re-runs `uploadPolicyHelper.precheck` over the entries still to send
  (queued, failed, rejected by the precheck) against what is accepted or uploading: `path-invalid`,
  `duplicate`, `limits` with `limit` = `file-bytes` | `files` | `total-bytes`. A removal or a policy
  change can turn a rejected entry back to `queued`. `violations` lists `max-files` (`actual` = files
  wanted), `max-total-bytes` (bytes wanted) and `max-file-bytes` (largest size), each with the
  refused entry ids. `totals`: `pending`, `accepted`, `uploading`, `rejected`, `failed`, `planned`,
  `remaining`.
- **`add(source)`** — a `DataTransfer` (call it inside the drop/paste handler: the items are read
  synchronously, the walk is async), a `FileList`/`File[]` (a picked folder's `webkitRelativePath`
  kept) or `{ file, path }[]`. Ignored names are skipped. Resolves the added entries.
- **`start(sessionId, { session?, precheck?, signal? })`** — sends queued and failed entries through
  `client.upload` (the client prechecks again against the session's own state unless
  `precheck: false`). Per result: one server row → accepted / rejected (`rejectedBy: server`, the
  server's `reason`, its detected `kind`); several rows or rows with `from` → the archive entry is
  replaced by one entry per row (`id` `<archive id>/<row id>`, `from` = the archive's path); refused by
  the session precheck → rejected by `server`; an error → `failed` (`error`, `httpStatus`), sent again
  by the next `start`; an aborted run → back to `queued`. A `start` during a run answers that run.
- **`remove(id)`** — an entry with server rows is removed from the session first (each row's id);
  a refusal rethrows and keeps it. An uploading entry is left alone. **`clear()`** aborts and empties
  the queue locally; the session keeps what it accepted. **`abort()`** stops the run.
- `progress` (`loaded`, `total`, `ratio`, `count`, `settled`) covers the running upload only.
- `useUploadQueue` configures the store on every change of the settings — the policy and the
  ignore list compared by value, so an inline object is fine.

## The parts

- **`UploadDropzone`** — `queue`, `disabled`, `paste` (default true; text pastes pass through),
  `onAdded(entries)`, `overlay` (own content), `className`, `id`. A `relative` wrapper with
  `role="group"`, an sr-only description of the alternatives and a polite live region announcing
  "Files added: N". The overlay (`[data-upload-overlay]`, `pointer-events-none`) appears for drags
  that carry files only; a drop is always `preventDefault`ed so the browser never opens a file in
  place of the page, even while `disabled`.
- **`UploadPickers`** — `queue`, `files`/`folder` (default both), `accept`, `disabled`
  (`aria-disabled`, never the native attribute), `variant`, `size`, `onAdded`. Buttons are 44px
  below 768px (`max-md:h-11`).
- **`UploadList`** — `queue`, `removable`, `totals`, `hints` (default true), `empty`. Rows carry
  `data-upload-entry`, `data-status`, `data-path`, `data-kind`, `data-reason`, `data-limit`,
  `data-from`; the remove button is `data-upload-remove` (44px below 768px, absent while uploading);
  violations `data-upload-violation="<code>"`. Colours are theme tokens only (`primary`,
  `muted-foreground`, `destructive`, `border`, `background`).

## Strings

Every part takes `translate?: UploadTranslate` (`(key, fallback) => string`) and `locale?` —
English and `en` number formatting without them; no part reads i18n by itself, so they render
without a provider. `useUploadI18n()` reads the packaged bundle (`lib:web-upload`, en, pl, ru, be, uk,
es, de, fr) in the current language. Placeholders are `{name}`, filled after translation; the wording
avoids plural forms (`Files: 3`). Sizes: B, kB, MB, GB in powers of 1024 through `Intl` (`units.byte`
is translated). An app overrides strings with `i18nHelper.addI18nApp(lng, 'web-upload', data, { ns: LIB_NAMESPACE })`.

## Consumer setup

Peers: `react`, `react-dom`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`,
`tailwindcss` — no Radix. The private primitives (button, progress) are never exported. The app's
Tailwind entry must scan the package: `@source "../../../node_modules/@owlmeans/web-upload/src";`.

## Tests

`bun test ./tests`: `queue.spec.ts` (category A + a real `server-upload` over HTTP from Bun: precheck,
violations, policy change, start, archive expansion, abort, failure and resend, removal),
`ui.spec.ts` (category D, Vite + Tailwind harness, Playwright as a library, the same server: a
`DataTransfer` drop, a real folder drop through CDP `Input.dispatchDragEvent`, a pasted file, the folder
input, limits and removal, an upload throttled through CDP with its progress, Polish strings, 44px
targets), `i18n.spec.ts`, `package-boundary.spec.ts`.

## Depends On

- `@owlmeans/upload`, `@owlmeans/client-upload`, `@owlmeans/client` (`useContext`),
  `@owlmeans/client-i18n`, `@owlmeans/i18n`, `@owlmeans/context`, `@owlmeans/log`

## Related

- [[upload]] — policy, reasons, prechecks, the protocol tree
- [[client-upload]] — the client `start` and `remove` go through
- [[server-upload]] — what decides each file
- [[shadcn-web]] — the package pattern (private primitives, `@source`)
