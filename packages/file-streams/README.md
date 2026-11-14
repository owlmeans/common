# @owlmeans/file-streams

Online files as Node streams, for OwlMeans servers and agents (Node and Bun):

- **Sources** — a URL (under a connect-time SSRF policy, through HTTP/SOCKS proxy plugins, Google
  Drive links resolved), an S3 object, a file, bytes in memory, a foreign stream.
- **Sinks** — an atomic file, a confined directory tree, an S3 object or prefix (addressed exactly
  like `@owlmeans/storage-resource`), a buffer, a Viable ephemeral workload (which is also a source).
- **Workspaces** — a service's temporary files, one confined folder per organization / project /
  purpose, optionally mirrored to an S3 prefix under the same nesting so a restarted pod restores
  them; whole S3 prefixes listed and deleted.
- **Archives** — zip, tar, tar.gz and gz: detect, list, extract, pack — with traversal, link, bomb and
  overlap guards.
- **Pinned fetch** — `@owlmeans/file-streams/fetch` (no AWS SDK in its graph): a WHATWG `fetch` over
  the same client, for code written against `fetch` (`@owlmeans/llm-reader`, a renderer).
- **Verification** — what a file really is (images, audio, video, pdf, office documents including
  legacy doc/xls/ppt, csv, text, source code), compared with what its name and media type claim,
  from its head or a few range reads — never a full download.

## Installation

```bash
bun add @owlmeans/file-streams@^0.2.0-alpha.0
```

## Usage

```typescript
import { createDirectorySink, createS3Bucket, FileKind, fileInspector, httpClient, transferHelper } from '@owlmeans/file-streams'

// Download an image into a folder — refused before a byte is written unless it is an image
await transferHelper.copyInto(httpClient.source('https://example.com/hero.png'), createDirectorySink('/work/assets'), {
  verify: { allow: [FileKind.Image] },
})

// Check a remote file without downloading it
const verdict = await fileInspector.probe(httpClient.source('https://example.com/report.pdf'))
verdict.status        // 'match' | 'mismatch' | 'inconclusive'
verdict.detected      // { ext: 'pdf', mime: 'application/pdf', kind: 'pdf', … }

// Store it in the bucket a cfg.storageBuckets entry names
const bucket = createS3Bucket(cfg.storageBuckets.media)
await transferHelper.copy(httpClient.source('https://example.com/report.pdf'), bucket.sink('reports/q3.pdf'))
```

```typescript
import { createBackedWorkspace, createBufferSource, createS3Bucket, createWorkspace } from '@owlmeans/file-streams'

// Keep an upload in the service's tmp folder and in the bucket, under <org>/<project>/<purpose>
const backed = createBackedWorkspace({ workspace: createWorkspace(), bucket: createS3Bucket(cfg.storageBuckets.projects) })
const files = backed.scope({ organization: 'acme', project: 'slot-12', purpose: 'new-project' })
await files.put('brand/logo.png', createBufferSource(png, { name: 'logo.png' }))
await files.restore()   // after a restart: download what the tmp folder lost
await files.drop()      // the folder and every object under the scope's prefix
```

```typescript
import { createPinnedFetch } from '@owlmeans/file-streams/fetch'

// Every connection pinned to the address the policy checked; Drive links resolved; bodies streamed
const fetch = createPinnedFetch({ proxies: { proxies: ['socks5h://u:p@egress:1080'] } })
const hop = await fetch(url, { redirect: 'manual' })     // a 3xx comes back with its Location; any status is a Response
```

Proxies, the Viable workload destination and source, workspaces, archive limits, the context service
and every default are described in the package skill (`file-streams`).

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
