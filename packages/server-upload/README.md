# @owlmeans/server-upload

Uploads on an OwlMeans server, verified before they move anywhere:

- **Sessions** — limits counted on the expanded set and reserved atomically, so parallel uploads never
  pass them; remove, seal and abort; a session belongs to the organization that opened it.
- **Intake** — each file spooled into a scoped temporary workspace, verified as a whole (a type that
  does not match its name, executable or active content is deleted at once and logged), archives
  (zip, tar, tar.gz, gz) unpacked with guards and their entries handled like uploads, original paths kept.
- **Receivers** — accepted files handed to the application: into a directory or S3 prefix, or streamed
  on to another service's upload route.
- **Handlers** — the `@owlmeans/upload` protocol tree bound with the organization taken server-side.

## Installation

```bash
bun add @owlmeans/server-upload@^0.1.22-rc.0
```

## Usage

```typescript
import { createDirectorySink } from '@owlmeans/file-streams'
import { appendUploadService, createResourceSessionStore, makeUploadHandlers, treeReceiver } from '@owlmeans/server-upload'

const uploads = appendUploadService(context, {
  policy: { maxFiles: 50, maxFileBytes: 12 * 1024 * 1024, maxTotalBytes: 50 * 1024 * 1024 },
  sessions: createResourceSessionStore(context.resource('upload-session')),
  receiver: treeReceiver(session => createDirectorySink(`/data/uploads/${session.id}`, { onConflict: 'overwrite' })),
})

context.registerEntrypoints(makeUploadHandlers(uploads, {
  scopeOf: (request, session) => ({ organization: request.entity!.slug, purpose: `upload-${session.id}` }),
}).serve(materialProtocols))
```

The intake step by step, stores and their atomicity, the forwarding receiver and every refusal are
described in the package skill (`server-upload`).

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.21
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
