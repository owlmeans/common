---
name: file-inspector
description: "How to use @owlmeans/file-inspector — what a file really is from its bytes (images, audio, video, pdf, office incl. legacy doc/xls/ppt, csv, text, source code, fonts, 3D models, draw.io/Excalidraw diagrams, archives, executables) against what its name and media type claim; verdicts, verify policies (allow, refuse, mismatch), active-PDF detection, executable refusal, probes over a ProbeSource within a byte budget, and safe file names. Auto-invoked when verifying an upload or a download, refusing executables or active content, classifying a file by kind, or making a reported file name safe."
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/file-inspector

**Layer:** Infra
**Install:** `"@owlmeans/file-inspector": "^0.2.0-alpha.0"` in `dependencies`

Server-side (Node and Bun). Detection works on bytes in hand (`inspect`) or reads a source through
a narrow port (`probe`): a head sample plus a few bounded range reads, never more than the budget.
`@owlmeans/file-streams` re-exports the inspector and every source it builds satisfies the port.

## Key Exports

| Export | What it is |
|---|---|
| `fileInspector` / `createFileInspector({ maxProbeBytes?, sampleBytes? })` | `probe(source, opts)`, `inspect(bytes, claims, { complete?, size? })`, `enforce(verdict, policy)`, `check(source, policy, opts)`, `kindOf(mime, ext?)`, `normalizeMime(mime)` |
| `FileKind` | `image`, `audio`, `video`, `pdf`, `document`, `spreadsheet`, `presentation`, `csv`, `text`, `code`, `html`, `font`, `model-3d`, `diagram`, `archive`, `compressed`, `executable`, `other` — also from the browser-safe subpath `@owlmeans/file-inspector/kinds` (the enum alone, no detectors), which a contract or a browser bundle imports |
| `FileVerdict` | `status` (`match` / `mismatch` / `inconclusive`), `declared`, `detected` (`ext`, `mime`, `kind`, `method`, `confidence`), `dangerous`, `reasons`, `probe`, `details` |
| `VerifyPolicy` | `allow`, `refuse`, `refuseMismatch` (default true), `refuseInconclusive`, `strictFormat`, `sampleBytes` |
| `ProbeSource` / `ProbeRangeReader` / `ProbeSourceInfo` | The port a probe reads: `info`, `open`, `ranges` |
| `fileNameHelper.safe(name, { ext?, maxLength?, fallback? })` / `.extOf(name)` | A reported name made safe to store, mail or show; a base name's extension |
| `FileMimicryError`, `FileKindError` (storage `FileTypeError`), `FileInspectorError`, `ProbeBudgetError` | Refusals by message code (`mimicry:…`, `kind:<kind>`) |
| `EXTENSION_MIME`, `KIND_BY_MIME`, `MIME_ALIASES`, `NON_INFORMATIVE_MIMES`, `PASSIVE_KINDS`, `TEXT_CARRIED_KINDS`, `DEFAULT_PROBE_BYTES`, `DEFAULT_SAMPLE_BYTES` … | The tables a verdict is built from |

## Usage

```typescript
import { FileKind, fileInspector, fileNameHelper } from '@owlmeans/file-inspector'

// An uploaded file spooled to disk: verify it before it moves anywhere
const verdict = await fileInspector.check(source, { refuse: [FileKind.Executable] })   // file-streams createFileSource(path)
verdict.details.pdf      // { active: false, trailer: true }
verdict.details.diagram  // 'drawio' for a .drawio file or a .drawio.svg/.drawio.png export

// Bytes in hand (a head sample, or the whole file with complete: true)
const head = await fileInspector.inspect(bytes, { name: 'logo.png', mime: 'image/png' }, { complete: true })
fileInspector.enforce(head, { allow: [FileKind.Image] })   // FileKindError / FileMimicryError otherwise

// The name it is stored under, ending in the detected type's extension
fileNameHelper.safe('C:\\Users\\me\\My file (1).JPEG', { ext: 'jpg' })   // 'My file (1).jpg'
```

A source of your own implements `ProbeSource`: `info()` → `{ name?, mime?, size?, origin? }`,
`open()` → `{ stream }` (a Node `Readable`), `ranges()` → a `ProbeRangeReader`
(`size`, `read(offset, length)`, `close()`) or `null` for head-only probing.

## Verdicts

- **Claims** come from the name's extension (`EXTENSION_MIME`) and the declared media type
  (normalized, de-aliased, uninformative ones such as `application/octet-stream` dropped); two kinds
  when they disagree. No claim → `inconclusive` with `no-claim`.
- **`match`** — same kind; containers count (docx in a zip claim, tar.gz in a gz claim, svg or a
  draw.io model in an xml claim, glTF or Excalidraw in a json claim); text kinds stand for each other
  (code is text) except csv (`csv-unconfirmed` stays inconclusive). A same-kind different format
  (png named `.jpg`) adds `details.formatDiffers` and `format-differs`; `strictFormat` refuses it.
- **`mismatch`** — `kind-mismatch`, `html-error-page` (an html page under a passive or csv claim),
  `binary-as-text`, `executable-content`. Office zip claims without random access stay
  `inconclusive` (`head-only`), as does a probe that ran out of budget inside the container.
- **`dangerous`** (always refused by `enforce`, `FileMimicryError('dangerous:<claimed>:<detected>')`):
  an executable under any non-executable claim, a shebang script under a passive claim
  (`PASSIVE_KINDS`: image, audio, video, pdf, office, csv, font, 3D model, diagram), an active PDF.
- **`refuse`** refuses kinds even under an honest, matching claim — detected, or claimed by the name
  or media type (an unrecognized body named `.exe`) — with `FileKindError(<kind>)`. Upload layers
  pass `[FileKind.Executable]`.
- **`allow`** admits detected kinds only (nothing detected is refused); a 3D model or diagram
  carried in text (`TEXT_CARRIED_KINDS`) also passes `FileKind.Text`.
- `details` also carry `encoding`, the csv `delimiter`/`columns`, a source `language`, `active`
  (scripted svg/html — serve as attachment).

## Detection

`file-type` signatures, with `@file-type/cfbf` (legacy doc/xls/ppt/msi by the root CLSID),
`@file-type/xml` (svg, xhtml, kml…) and an own signature detector, then a text sniffer for what
signatures cannot see: encoding, csv/tsv, json, html, svg without a prolog, shebang scripts, source
code by extension and the text-carried formats. A generic `xml` signature yields to the sniffer's
html, svg or draw.io reading; file-type's `solid ` check yields to the sniffer, which wants facets.

| Kind | Recognized by |
|---|---|
| Executable | ELF (`.so` too), PE — `exe` or `dll` from the PE header's DLL flag, Mach-O incl. universal (`CAFEBABE` + 1–30 architectures), Java class (`CAFEBABE` + class version), Python bytecode (`.pyc` magic + `\r\n` at bytes 2–3, magic range checked), WebAssembly (`\0asm`), Android dex (`dex\n0nn\0`), msi/deb/rpm/dmg |
| Font | woff, woff2, ttf/otf (one format group), ttc |
| 3D model | glb (`glTF` v1/v2), glTF JSON (`asset.version` plus a model key, or the `.gltf` claim), ASCII STL (`solid` + `facet normal`/`endsolid`), binary STL (`.stl` claim and size = 84 + 50 × triangles — needs the whole size: complete bytes, `inspect`'s `size`, a ranged or sized probe), OBJ (`.obj` claim + `v`/`f` lines), FBX (`Kaydara FBX Binary`, ASCII `; FBX`) |
| Diagram | draw.io (`<mxfile` / `<mxGraphModel`, `.drawio`, `.dio`), Excalidraw (`"type": "excalidraw"`, `.excalidraw`); an svg or png export keeps its image kind with `details.diagram` (name `.drawio.svg`/`.drawio.png`/`.excalidraw.*`, an svg `content="&lt;mxfile`, a png `tEXt mxfile` chunk) |

Shebang scripts stay `code` (with `language`); they are dangerous only under a passive claim.

## Active PDF

A detected PDF is scanned for `/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile`, `/RichMedia` (names
decoded from `#xx`, `/JS` only as a whole name), in its own text and inside FlateDecode object
streams (`/ObjStm`), each inflated up to 16 MiB — past it counts as active, a stream that does not
inflate is skipped. Found → `details.pdf.active`, reason `pdf-active`, `dangerous`. `inspect` scans
every byte it is given; a probe reads a PDF that fits its budget whole, a larger one by its head
sample and a 64 KiB tail (which also gives `details.pdf.trailer`, reason `pdf-no-trailer`) — what
lies beyond both is not seen, so verify uploads on the complete file.

## Probes

The probe reads through a block cache (64 KiB blocks, never larger than the budget) whose total is
the budget (`maxBytes`, default 1 MiB): file-type seeks within it (CFB directory sectors, zip
entries behind a large stored one). Reaching the budget is a reason (`probe-budget`), never a
rejection. Without random access (`ranges()` → `null` or `randomAccess: false`) only the head
sample is read and the stream destroyed. Defaults: 1 MiB budget, 64 KiB head sample.

## Safe names

`fileNameHelper.safe` keeps the base name (directories dropped), NFC-normalizes it, drops controls,
bidi and zero-width characters, turns tab/newline into spaces and every character outside
`[A-Za-z0-9_.\- ()]` into `_`, trims leading/trailing dots and spaces, caps the length (100 with the
extension) and ends in `.<ext>` — the given one (the detected type's canonical extension, replacing
the reported one) or the name's own, lower-cased. Nothing left → `fallback` (`file`).

## External docs

- https://www.npmjs.com/package/file-type — v22: signature detection only (no csv/svg/text/code, legacy office as `cfb`); custom detectors run before the core ones and must only peek; `fileTypeFromTokenizer` reads random-access tokenizers; one `FileTypeParser` per call (not concurrency-safe); `maxBufferSize` bounds detector reads
- https://github.com/Borewit/file-type-cfbf — `detectCfbf` names doc/xls/ppt/msi/vsd/pub/wps by the root entry's CLSID (needs the first directory sector reachable)
- https://github.com/Borewit/file-type-xml — `createXmlDetector({ sampleSize })`: svg, xhtml, kml, rss and generic xml from a bounded sample
- https://github.com/Borewit/strtok3 — exactly one copy may resolve: file-type's `instanceof EndOfStreamError` checks break on a second
- https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf — §7.3.5 names (`#xx`), §7.5.7 object streams, §12.6 actions (JavaScript, Launch), §7.11.4 embedded files
- https://learn.microsoft.com/en-us/windows/win32/debug/pe-format — `e_lfanew` at 0x3C, `Characteristics` `IMAGE_FILE_DLL` (0x2000)
- https://github.com/python/cpython/blob/main/Lib/importlib/_bootstrap_external.py — the bytecode magic numbers and the flags word since 3.7

## Tests

Category A. Offline specs over code-built fixtures and an in-memory `ProbeSource` stand-in that
counts the bytes it serves (`tests/context.ts`); no gates.

## Depends On

- `@owlmeans/storage-common` (`FileTypeError`), `@owlmeans/error`, `@owlmeans/log`
- `file-type`, `@file-type/cfbf`, `@file-type/xml`, `strtok3` (one copy with file-type's)

## Related

- [[file-streams]] — sources and sinks that satisfy the port; transfers and archives verify through it
- [[storage-common]] — `FileTypeError`, the base of both refusals
- [[logging]] — scope `file-inspector`; refusals warn with `file-inspector.mimicry` / `file-inspector.refused`, never contents
