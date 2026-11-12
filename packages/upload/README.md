# @owlmeans/upload

The browser-safe contract of file and folder uploads for OwlMeans apps:

- **Policy** — how many files, how large each and all together (counted on the expanded set: an
  archive's entries, not the archive), whether archives are unpacked, which kinds are refused.
- **Sessions and files** — `UploadSession` and `UploadedFile` with original paths kept, the detected
  type, a sha256 digest and a closed rejection vocabulary (`limits`, `type-mismatch`, `dangerous`,
  `refused-kind`, `archive-invalid`, `path-invalid`, `duplicate`).
- **Rules** — path normalization that keeps every name as written, and prechecks a browser runs before
  sending anything.
- **Protocols** — `makeUploadProtocols`: open, a streamed file route, state, remove, seal and abort,
  mountable under any parent with the session parameter named after the application's own id.

## Installation

```bash
bun add @owlmeans/upload@^0.2.0-alpha.0
```

## Usage

```typescript
import { makeUploadProtocols, uploadPolicyHelper } from '@owlmeans/upload'

export const materialProtocols = makeUploadProtocols({
  alias: 'materials', parent: projectBase, path: '/materials', sessionParam: 'project', maxFileBytes: 12 * 1024 * 1024,
})

const check = uploadPolicyHelper.precheck(files.map(file => ({ path: file.path, size: file.size })), session.policy, {
  totals: session.totals,
})
check.refused   // [{ index, path, size, reason: 'limits' | 'duplicate' | 'path-invalid' }]
```

The server is `@owlmeans/server-upload`, the client `@owlmeans/client-upload`; the routes, path rules and
prechecks are described in the package skill (`upload`).

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
