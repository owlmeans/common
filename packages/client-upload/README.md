# @owlmeans/client-upload

The upload client of OwlMeans apps, in a browser and in Bun:

- **Upload** — files checked against the session's policy before anything is sent, sent a few at a
  time with retries, per-file and overall progress, aborted with a signal.
- **Sessions** — open, state, remove, seal and abort over the `@owlmeans/upload` protocol tree.
- **Inputs** — picked or dropped files and folders (their relative paths kept), bytes, Node streams,
  and — from `@owlmeans/client-upload/node` — files and folders on the local disk.

## Installation

```bash
bun add @owlmeans/client-upload@^0.2.0-alpha.0
```

## Usage

```typescript
import { makeUploadClient, uploadInputHelper } from '@owlmeans/client-upload'

const uploads = makeUploadClient(context, materialProtocols)   // the tree bound with bindAll()
const results = await uploads.upload(projectId, uploadInputHelper.fromFiles(input.files), {
  onProgress: (file, overall) => render(file.path, overall.loaded / overall.total),
})
await uploads.seal(projectId)
```

```typescript
import { uploadPathHelper } from '@owlmeans/client-upload/node'

await uploads.upload(sessionId, await uploadPathHelper.fromPaths(['./materials']))
```

Retries, the precheck, progress and the input helpers are described in the package skill (`client-upload`).

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.0-alpha.2
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
