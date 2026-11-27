# @owlmeans/file-inspector

Tells what a file really is from its bytes and compares that with what its name and declared media
type claim. It runs on OwlMeans servers and agents (Node and Bun). It works on bytes you already
hold, or it probes a source through a narrow port: a head sample plus a few bounded range reads,
never a full download.

- **Detection** — images, audio, video, pdf, office documents (legacy doc/xls/ppt included), csv,
  text, source code, fonts, 3D models (glb, glTF, STL, OBJ, FBX), draw.io and Excalidraw diagrams,
  archives, compressed streams and executables (ELF, PE exe/dll, Mach-O, Java class, Python bytecode,
  WebAssembly, dex, msi/deb/rpm/dmg).
- **Verdicts** — `match`, `mismatch` or `inconclusive`, with reasons and details (encoding, csv
  shape, source language, active markup, PDF facts, diagram format).
- **Policies** — dangerous content is always refused: an executable under another claim, a script
  under a passive claim, a PDF with active content. A policy can also allow kinds, refuse kinds and
  refuse mismatched, inconclusive or reformatted files.
- **Probes** — reads stay within a byte budget (default 1 MiB) through a block cache. Sources from
  `@owlmeans/file-streams` satisfy the port as they are.
- **Safe names** — a file name reported by a device or an origin, made safe to store, mail or show.
- **Browser-safe kinds** — `@owlmeans/file-inspector/kinds` exports the `FileKind` vocabulary
  without the detectors.

## Installation

```bash
bun add @owlmeans/file-inspector@^0.2.4-rc.0
```

No peer dependencies. `file-type`, `@file-type/cfbf`, `@file-type/xml` and `strtok3` come with the
package. Only one copy of `strtok3` may resolve in a project: `file-type` checks its errors with
`instanceof`.

## Quick start

```typescript
import { FileKind, fileInspector, fileNameHelper } from '@owlmeans/file-inspector'

// The whole uploaded file is in memory
const verdict = await fileInspector.inspect(bytes, { name: upload.name, mime: upload.type }, { complete: true })
fileInspector.enforce(verdict, { refuse: [FileKind.Executable] })   // FileMimicryError / FileKindError

verdict.status      // 'match' | 'mismatch' | 'inconclusive'
verdict.detected    // { ext: 'pdf', mime: 'application/pdf', kind: 'pdf', method: 'signature', confidence: 'high' }
verdict.details.pdf // { active: false, trailer: true }

// The name it is stored under, ending in the detected type's extension
const stored = fileNameHelper.safe(upload.name, { ext: verdict.detected?.ext })
```

## Usage

### Bytes in hand

`inspect(bytes, claims?, options?)` does no I/O. Pass `complete: true` only when the bytes are the
whole file: it settles csv and JSON readings, the PDF trailer and binary STL sizes. When the bytes
are only a head sample, pass the whole file's `size` if you know it.

```typescript
const head = await fileInspector.inspect(sample, { name: 'part.stl' }, { size: declaredSize })
fileInspector.enforce(head, { allow: [FileKind.Model3d] })
```

### A source with random access

`probe(source, options?)` reads a head sample plus whatever file-type needs to seek to (zip entries,
CFB directory sectors), never more than the budget. Reaching the budget is reported as the
`probe-budget` reason, never thrown. `check` runs `probe` and then `enforce`.

```typescript
import { createFileSource } from '@owlmeans/file-streams'
import { FileKind, fileInspector } from '@owlmeans/file-inspector'

const verdict = await fileInspector.check(createFileSource('/spool/upload-17'), {
  allow: [FileKind.Image, FileKind.Pdf],
}, { claims: { name: 'scan.pdf', mime: 'application/pdf' }, maxBytes: 512 * 1024 })
```

When the source has no random access (`ranges()` answers `null`, or `randomAccess: false`), only
the head sample is read and the stream is destroyed.

### Your own source

Any origin implements `ProbeSource`: `info()`, `open()` (a Node `Readable` from the first byte) and
`ranges()` (a `ProbeRangeReader` over one immutable version of the file, or `null`).

```typescript
import { createReadStream } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type { ProbeSource } from '@owlmeans/file-inspector'

export const diskSource = (path: string): ProbeSource => ({
  info: async () => ({ origin: path, name: basename(path), size: (await stat(path)).size }),
  open: async () => ({ stream: createReadStream(path) }),
  ranges: async () => {
    const handle = await open(path, 'r')
    const { size } = await handle.stat()
    return {
      size,
      read: async (offset, length) => {
        const buffer = Buffer.alloc(Math.max(0, Math.min(length, size - offset)))
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset)
        return buffer.subarray(0, bytesRead)
      },
      close: async () => { await handle.close() },
    }
  },
})
```

### Safe names

```typescript
fileNameHelper.safe('C:\\Users\\me\\My file (1).JPEG', { ext: 'jpg' })   // 'My file (1).jpg'
fileNameHelper.safe('../../Invoice\u202Efdp.exe', { ext: 'pdf' })      // 'Invoicefdp.pdf'
fileNameHelper.safe('...')                                             // 'file'
fileNameHelper.extOf('backup.TAR.GZ')                                  // 'tar.gz'
```

### Kinds in a browser bundle or a contract package

```typescript
import { FileKind } from '@owlmeans/file-inspector/kinds'

const accepted = [FileKind.Image, FileKind.Pdf]
```

### Verdict reasons

| Reason | Status | When |
|---|---|---|
| `no-claim` | inconclusive | Neither the name nor the media type claims anything |
| `unrecognized` | inconclusive | Nothing was detected, and the claim is not a text kind |
| `csv-unconfirmed` | inconclusive | A csv claim over text that does not read as csv |
| `head-only` | inconclusive | An office claim over a zip or CFB container that was not seen past its head |
| `kind-mismatch` | mismatch | Another kind was detected |
| `html-error-page` | mismatch | An html page under a passive or csv claim |
| `binary-as-text` | mismatch | Binary content under a text claim |
| `executable-content` | mismatch, dangerous | An executable under a non-executable claim, or a shebang script under a passive claim |
| `format-differs` | match | The same kind in another format (a png named `.jpg`) |
| `probe-budget` | any | The probe reached its byte budget |
| `pdf-no-trailer` | any | The end of the PDF was read and holds no `%%EOF` |
| `pdf-active` | dangerous | JavaScript, a launch action, an embedded file or rich media in the PDF |

`enforce` checks in this order: dangerous (`FileMimicryError('dangerous:<claimed>:<detected>')`),
`refuse` (`FileKindError(<kind>)`), `allow` (`FileKindError(<detected kind>)`), a mismatch
(`FileMimicryError('<claimed>:<detected>')`), `strictFormat` (`FileMimicryError('format:…')`),
then `refuseInconclusive` (`FileMimicryError('inconclusive:…')`).

## API

| Export | What it is |
|---|---|
| `fileInspector` | The default inspector: 1 MiB probe budget, 64 KiB head sample |
| `createFileInspector(options?)` | An inspector with its own `maxProbeBytes` / `sampleBytes` |
| `FileInspector.probe(source, options?)` | A verdict from a `ProbeSource` within the byte budget |
| `FileInspector.inspect(bytes, claims?, options?)` | A verdict over bytes in hand; no I/O; a PDF is scanned in full |
| `FileInspector.enforce(verdict, policy?)` | The verdict back when the policy holds; otherwise `FileMimicryError` / `FileKindError` |
| `FileInspector.check(source, policy?, options?)` | `probe`, then `enforce` |
| `FileInspector.kindOf(mime, ext?)` | The `FileKind` of a media type (`tar.gz` / `tgz` extensions are archives) |
| `FileInspector.normalizeMime(mime)` | Lower-cased, parameter-free, de-aliased; `undefined` when uninformative |
| `fileNameHelper` / `createFileNameHelper()` | `safe(name, options?)` and `extOf(name)` |
| `FileKind` | `image`, `audio`, `video`, `pdf`, `document`, `spreadsheet`, `presentation`, `csv`, `text`, `code`, `html`, `font`, `model-3d`, `diagram`, `archive`, `compressed`, `executable`, `other` |
| `FileMimicryError` | A storage `FileTypeError`: content that is not what it claims, or dangerous content (`stored-file:type:mimicry:…`) |
| `FileKindError` | A storage `FileTypeError`: a kind the policy refuses or does not allow (`stored-file:type:kind:<kind>`) |
| `FileInspectorError` | The package's base `ResilientError` (`file-inspector:<code>`) |
| `ProbeBudgetError` | Internal to a probe; a verdict reports it as `probe-budget` |
| `DEFAULT_PROBE_BYTES` / `DEFAULT_SAMPLE_BYTES` | 1 MiB / 64 KiB |
| `PDF_TRAILER_BYTES` / `PDF_TAIL_SCAN_BYTES` | 1 KiB tail checked for `%%EOF` / 64 KiB tail scanned when a PDF exceeds the budget |
| `EXTENSION_MIME` | Extension → the media type it claims |
| `KIND_BY_MIME` / `KIND_BY_MIME_PREFIX` | Media type → kind; media-type prefix → kind |
| `MIME_ALIASES` / `NON_INFORMATIVE_MIMES` | Spellings of one media type; types dropped as claims (`application/octet-stream`, …) |
| `CODE_LANGUAGE_BY_EXT` / `SHEBANG_LANGUAGES` | Source language by extension; by shebang interpreter |
| `TEXT_FAMILY` / `PASSIVE_KINDS` / `TEXT_CARRIED_KINDS` / `OFFICE_KINDS` | Kind groups the comparison uses |
| `EXTENSION_GROUPS` / `CONTAINER_EXTENSIONS` | Extensions of one format (first canonical); container claims and the formats they may hold |
| `COMPOUND_EXTENSIONS` | `tar.gz`, `tar.bz2`, `tar.xz`, `tar.zst` |
| `SAFE_NAME_MAX_LENGTH` / `SAFE_NAME_FALLBACK` / `NAME_STRIPPED_CHARACTERS` | 100; `file`; the characters a safe name drops |
| Types: verdicts | `FileVerdict`, `VerdictStatus`, `DeclaredType`, `DetectedType`, `FileDetails`, `PdfDetails`, `DiagramFormat`, `FileClaims` |
| Types: options | `VerifyPolicy`, `ProbeOptions`, `InspectOptions`, `FileInspectorOptions`, `FileInspector` |
| Types: source port | `ProbeSource`, `ProbeSourceInfo`, `ProbeRangeReader`, `ProbeOpenedFile`, `ProbeSignalOptions` |
| Types: names | `FileNameHelper`, `SafeNameOptions` |
| `@owlmeans/file-inspector/kinds` | `FileKind` alone: no detectors, no Node imports |

## Configuration

| Option | Where | Default |
|---|---|---|
| `maxProbeBytes` | `createFileInspector` | 1 MiB: the most a probe reads |
| `sampleBytes` | `createFileInspector` | 64 KiB: the head sample, and the XML detector's sample |
| `claims` | `probe` / `check` | The source's `info()`; the caller's name and mime win |
| `maxBytes` | `probe` / `check` | The inspector's `maxProbeBytes` |
| `randomAccess` | `probe` / `check` | `true`: use `ranges()` when the source has it |
| `signal` | `probe` / `check` | Aborts; the rejection is the signal's reason |
| `complete` | `inspect` | `false`: the bytes are a head sample |
| `size` | `inspect` | The whole file's size, for structure rules (binary STL) |

`VerifyPolicy`:

| Field | Default | Effect |
|---|---|---|
| `allow` | none | Only these detected kinds pass; nothing detected is refused. A 3D model or diagram read from text also passes as `FileKind.Text` |
| `refuse` | none | These kinds are refused even under an honest claim, detected or claimed by the name or media type |
| `refuseMismatch` | `true` | Refuse a `mismatch` verdict |
| `refuseInconclusive` | `false` | Refuse an `inconclusive` verdict |
| `strictFormat` | `false` | Refuse the same kind in another format |
| `sampleBytes` | 64 KiB | Head examined by a `@owlmeans/file-streams` transfer or archive extraction; `enforce` ignores it |

`SafeNameOptions`: `ext` (the extension to end in, replacing the reported one; default the reported
name's own, lower-cased), `maxLength` (default 100, extension included), `fallback` (default
`file`).

## Security and limits

- **Claims are never trusted.** Detection reads bytes: file-type signatures, the CFB detector
  (legacy office and msi by root CLSID), the XML detector, the package's own signatures (PE exe/dll
  from the header's DLL flag, Python bytecode, dex, glb) and a text sniffer. The name's extension
  and the declared media type are claims; uninformative media types are dropped.
- **Dangerous content is always refused.** No policy field turns that off: an executable under a
  non-executable claim, a shebang script under a passive claim (image, audio, video, pdf, office,
  csv, font, 3D model, diagram), a PDF with active content.
- **Unclaimed executables are not dangerous.** With no claim the verdict is `inconclusive`
  (`no-claim`). Pass `refuse: [FileKind.Executable]` to refuse executables whatever they claim; a
  name such as `payload.exe` is refused even when the body is not recognized.
- **Active PDF.** `/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile` and `/RichMedia` are searched
  after decoding `#xx` name escapes, in the PDF's own text and in FlateDecode object streams. Each
  stream inflates to at most 16 MiB; one that would inflate past that counts as active, and one that
  does not inflate is skipped. A probe reads a PDF whole when it fits the budget, otherwise its head
  and a 64 KiB tail. Content between them is not seen, so verify uploads on the complete file.
- **Active markup is reported, not refused.** `details.active` is set for svg, html and xhtml that
  carry scripts, event handlers, `javascript:` URLs, `foreignObject`, `iframe`, `embed` or
  `object`. Serve such files as attachments.
- **Error pages are caught.** An html page delivered under an image, pdf, office or csv claim is a
  `mismatch` (`html-error-page`).
- **Bounded reads.** A probe never reads more than its budget, through 64 KiB blocks that are never
  larger than the budget. A head-only probe destroys the stream after the sample. `inspect` reads
  only the bytes it is given.
- **Safe names.** Only the base name is kept (both `/` and `\` separators drop directories). The
  name is NFC-normalized. Control, bidirectional-override and zero-width characters are dropped, so
  a right-to-left override cannot disguise `.exe` as `.pdf`. Every character outside
  `[A-Za-z0-9_.\- ()]` becomes `_`, leading and trailing dots and spaces go, and the length is
  capped.
- **Logs never carry content.** Refusals of dangerous content, refused kinds and mismatches warn on
  the `file-inspector` scope with the events `file-inspector.mimicry` and `file-inspector.refused`.

## Related packages

- `@owlmeans/file-streams` — sources and sinks that satisfy the probe port; transfers and archive
  extraction verify through this package, and it re-exports the inspector.
- `@owlmeans/upload` — names kinds through `@owlmeans/file-inspector/kinds` in its upload contract
  and schemas.
- `@owlmeans/server-upload` — probes every received file with the inspector, re-exported by
  `@owlmeans/file-streams`, before it accepts the file.
- `@owlmeans/storage-resource` — verifies an upload's head with `fileInspector` before the object
  is stored.
- `@owlmeans/storage-common` — `FileTypeError`, the base of `FileMimicryError` and `FileKindError`.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.4-rc.1
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
