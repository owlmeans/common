# @owlmeans/web-upload

File and folder upload UI for OwlMeans web applications (React, shadcn/ui, Tailwind CSS v4):

- **Queue** — files the person picks or drops are listed and checked against the upload policy at
  once (count, size per file, total size, paths, duplicates), before any upload session exists;
  `start(sessionId)` sends them with progress through `@owlmeans/client-upload`, archives turn into
  the files they held, and every server rejection lands on its file with the reason.
- **Drop zone** — wraps any content (a whole form): dragging files or folders over it shows an
  overlay, a drop adds them with their relative paths; pasted files are added too.
- **Pickers** — "Add files" and "Add folder" buttons.
- **List** — kind icon, path, size, progress, localized status and reason, remove; totals and limits.
- Eight languages; the parts take a `translate` function and render English without one.

## Installation

```bash
bun add @owlmeans/web-upload@^0.2.0-alpha.0
```

Add the package to the app's Tailwind sources:

```css
@source "../../../node_modules/@owlmeans/web-upload/src";
```

## Usage

```tsx
import { UploadDropzone, UploadList, UploadPickers, useUploadI18n, useUploadQueue } from '@owlmeans/web-upload'

const Form = () => {
  const i18n = useUploadI18n()
  const queue = useUploadQueue({ policy: { maxFiles: 50 }, protocols: materialProtocols })

  return <UploadDropzone queue={queue} {...i18n}>
    <form onSubmit={async () => { const record = await create(); await queue.start(record.id) }}>
      <UploadPickers queue={queue} {...i18n} />
      <UploadList queue={queue} {...i18n} />
    </form>
  </UploadDropzone>
}
```

The queue's rules, the parts' props and the strings are described in the package skill (`web-upload`).

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.0-alpha.1
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
