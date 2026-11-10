# @owlmeans/file-streams

Online files as Node streams, for OwlMeans servers and agents (Node and Bun):

- **Sources** — a URL (under a connect-time SSRF policy, through HTTP/SOCKS proxy plugins, Google
  Drive links resolved), an S3 object, a file, bytes in memory, a foreign stream.
- **Sinks** — an atomic file, a confined directory tree, an S3 object or prefix (addressed exactly
  like `@owlmeans/storage-resource`), a buffer, a Viable ephemeral workload.
- **Archives** — zip, tar, tar.gz and gz: detect, list, extract, pack — with traversal, link, bomb and
  overlap guards.
- **Verification** — what a file really is (images, audio, video, pdf, office documents including
  legacy doc/xls/ppt, csv, text, source code), compared with what its name and media type claim,
  from its head or a few range reads — never a full download.

## Installation

```bash
bun add @owlmeans/file-streams@^0.1.22-rc.0
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

Proxies, the Viable workload destination, archive limits, the context service and every default are
described in the package skill (`file-streams`).

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
