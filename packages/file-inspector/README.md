# @owlmeans/file-inspector

What a file really is, from its bytes, against what its name and media type claim — for OwlMeans
servers and agents (Node and Bun):

- **Detection** — images, audio, video, pdf, office documents including legacy doc/xls/ppt, csv,
  text, source code, fonts, 3D models (glb, glTF, STL, OBJ, FBX), draw.io and Excalidraw diagrams,
  archives and executables (ELF, PE exe/dll, Mach-O, Java class, Python bytecode, WebAssembly, dex).
- **Verdicts and policies** — `match` / `mismatch` / `inconclusive` with reasons; dangerous content
  (an executable under another claim, a script under a passive one, an active PDF) always refused;
  kinds allowed or refused outright.
- **Probes** — a head sample plus a few bounded range reads through a narrow source port, never a
  full download; `@owlmeans/file-streams` sources satisfy it as they are.
- **Safe names** — a reported file name made safe to store, mail or show.

## Installation

```bash
bun add @owlmeans/file-inspector@^0.2.0-alpha.0
```

## Usage

```typescript
import { FileKind, fileInspector, fileNameHelper } from '@owlmeans/file-inspector'

// Bytes in hand — the whole file
const verdict = await fileInspector.inspect(bytes, { name: 'brief.pdf', mime: 'application/pdf' }, { complete: true })
verdict.status          // 'match' | 'mismatch' | 'inconclusive'
verdict.detected        // { ext: 'pdf', mime: 'application/pdf', kind: 'pdf', … }
verdict.details.pdf     // { active: false, trailer: true }

// Refuse anything that is not what it claims, and executables even when they say so
fileInspector.enforce(verdict, { refuse: [FileKind.Executable] })

// A source with random access (an S3 object, a URL, a spooled file) — at most 1 MiB is read
const probed = await fileInspector.probe(source)

// The name it is stored under
fileNameHelper.safe('../../Invoice‮fdp.exe', { ext: 'pdf' })   // 'Invoicefdp.pdf'
```

Detection rules, policies, the source port and every default are described in the package skill
(`file-inspector`).

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
