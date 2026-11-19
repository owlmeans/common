---
name: file-inspector
description: "How to use @owlmeans/file-inspector — what a file really is from its bytes (images, audio, video, pdf, office incl. legacy doc/xls/ppt, csv, text, source code, fonts, 3D models, draw.io/Excalidraw diagrams, archives, executables) against what its name and media type claim; verdicts, verify policies (allow, refuse, mismatch), active-PDF detection, executable refusal, probes over a ProbeSource within a byte budget, and safe file names. Auto-invoked when verifying an upload or a download, refusing executables or active content, classifying a file by kind, or making a reported file name safe."
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/file-inspector

**Layer:** Infra
**Install:** `"@owlmeans/file-inspector": "^0.2.2-alpha.0"` in `dependencies`

Server-side (Node and Bun). Detection works on bytes in hand (`inspect`) or reads a source through
a narrow port (`probe`): a head sample plus a few bounded range reads, never more than the budget.
`@owlmeans/file-streams` re-exports the inspector and every source it builds satisfies the port.
The browser-safe subpath `@owlmeans/file-inspector/kinds` exports `FileKind` alone.

## Key Exports

| Export | What it is |
|---|---|
| `fileInspector` / `createFileInspector({ maxProbeBytes?, sampleBytes? })` | `probe(source, opts)`, `inspect(bytes, claims, { complete?, size? })`, `enforce(verdict, policy)`, `check(source, policy, opts)`, `kindOf(mime, ext?)`, `normalizeMime(mime)` |
| `FileKind` | `image`, `audio`, `video`, `pdf`, `document`, `spreadsheet`, `presentation`, `csv`, `text`, `code`, `html`, `font`, `model-3d`, `diagram`, `archive`, `compressed`, `executable`, `other` — also from `@owlmeans/file-inspector/kinds` (the enum alone, no detectors), which a contract or a browser bundle imports |
| `FileVerdict` | `status` (`match` / `mismatch` / `inconclusive`), `declared` (`ext`, `extMime`, `mime`, `kinds`), `detected` (`ext`, `mime`, `kind`, `method`, `confidence`), `dangerous`, `reasons`, `probe` (`bytesRead`, `randomAccess`, `complete`), `details` |
| `VerifyPolicy` | `allow`, `refuse`, `refuseMismatch` (default true), `refuseInconclusive`, `strictFormat`, `sampleBytes` (read by file-streams transfers and extraction, ignored by `enforce`) |
| `ProbeOptions` / `InspectOptions` / `FileClaims` | `{ claims?, maxBytes?, randomAccess?, signal? }` / `{ complete?, size? }` / `{ name?, mime? }` |
| `ProbeSource` / `ProbeRangeReader` / `ProbeSourceInfo` / `ProbeOpenedFile` | The port a probe reads (below) |
| `fileNameHelper` / `createFileNameHelper()` | `.safe(name, { ext?, maxLength?, fallback? })` — a reported name made safe to store, mail or show; `.extOf(name)` — a base name's lower-cased extension, compound ones kept |
| `FileMimicryError`, `FileKindError` (storage `FileTypeError`), `FileInspectorError`, `ProbeBudgetError` | Refusals by message code (`mimicry:…`, `kind:<kind>`); the base; the internal budget signal |
| `EXTENSION_MIME`, `KIND_BY_MIME`, `KIND_BY_MIME_PREFIX`, `MIME_ALIASES`, `NON_INFORMATIVE_MIMES`, `CODE_LANGUAGE_BY_EXT`, `SHEBANG_LANGUAGES`, `TEXT_FAMILY`, `PASSIVE_KINDS`, `TEXT_CARRIED_KINDS`, `OFFICE_KINDS`, `EXTENSION_GROUPS`, `CONTAINER_EXTENSIONS` | The tables a verdict is built from |
| `DEFAULT_PROBE_BYTES`, `DEFAULT_SAMPLE_BYTES`, `PDF_TRAILER_BYTES`, `PDF_TAIL_SCAN_BYTES`, `COMPOUND_EXTENSIONS`, `SAFE_NAME_MAX_LENGTH`, `SAFE_NAME_FALLBACK`, `NAME_STRIPPED_CHARACTERS` | Defaults and name rules (below) |

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
`open()` → `{ stream }` (a Node `Readable` from the first byte), `ranges()` → a `ProbeRangeReader`
(`size`, `read(offset, length, signal?)`, `close()`) over one immutable version, or `null` for
head-only probing. The caller's `claims` win over `info()` field by field.

## Verdicts

- **Claims** come from the name's extension (`EXTENSION_MIME`) and the declared media type
  (normalized, de-aliased, uninformative ones such as `application/octet-stream` dropped); two kinds
  when they disagree, each compared. No claim → `inconclusive` with `no-claim`.
- **`match`** — same kind; containers count (docx in a zip claim, tar.gz in a gz claim, svg or a
  draw.io model in an xml claim, glTF or Excalidraw in a json claim); text kinds stand for each other
  (code is text) except csv (`csv-unconfirmed` stays inconclusive). A same-kind different format
  (png named `.jpg`) adds `details.formatDiffers` and `format-differs`; `strictFormat` refuses it.
- **`mismatch`** — `kind-mismatch`, `html-error-page` (an html page under a passive or csv claim),
  `binary-as-text`, `executable-content`. An office claim over a zip is `inconclusive` (`head-only`)
  without random access or a complete file, after a budget hit, or over an unnamed `cfb`. Nothing
  detected under a non-text claim is `inconclusive` (`unrecognized`).
- **`dangerous`** (always refused by `enforce`, `FileMimicryError('dangerous:<claimed>:<detected>')`):
  an executable under any non-executable claim, a shebang script under a passive claim
  (`PASSIVE_KINDS`: image, audio, video, pdf, office, csv, font, 3D model, diagram), an active PDF.
  Danger is judged against a claim: an unclaimed executable is only `inconclusive`.
- **`refuse`** refuses kinds even under an honest, matching claim — detected, or claimed by the name
  or media type (an unrecognized body named `.exe`) — with `FileKindError(<kind>)`. Upload layers
  pass `[FileKind.Executable]`.
- **`allow`** admits detected kinds only (nothing detected → `FileKindError('unknown')`); a 3D model
  or diagram carried in text (`TEXT_CARRIED_KINDS`) also passes `FileKind.Text`.
- **`enforce` order**: dangerous → `refuse` → `allow` → mismatch (`FileMimicryError('<claimed>:<detected>')`)
  → `strictFormat` (`format:…`) → `refuseInconclusive` (`inconclusive:…`).
- `details` also carry `encoding`, the csv `delimiter`/`columns`, a source `language`, `active`
  (scripts, event handlers, `javascript:`, `foreignObject`, `iframe`, `embed`, `object` in
  svg/html/xhtml — serve as attachment; reported, never refused).

## Detection

`file-type` signatures, with `@file-type/cfbf` (legacy doc/xls/ppt/msi by the root CLSID),
`@file-type/xml` (svg, xhtml, kml…) and the package's own signature detector (PE exe/dll, Python
bytecode, dex, glb), then a text sniffer for what signatures cannot see: encoding, csv/tsv, json,
html, svg without a prolog, shebang scripts, source code by extension and the text-carried formats.
A generic `xml` signature yields to the sniffer's html, svg or draw.io reading; file-type's `solid `
check yields to the sniffer, which wants facets. The XML detector's strict parser throws on ordinary
HTML (void elements such as `<br>`, `<img>`): that error (`…\nLine: n\nColumn: n`) means "no
signature", never a failure — the sniffer decides.

| Kind | Recognized by |
|---|---|
| Executable | ELF (`.so` too), PE — `exe` or `dll` from the PE header's DLL flag, Mach-O incl. universal (`CAFEBABE` + 1–30 architectures), Java class (`CAFEBABE` + class version), Python bytecode (`.pyc` magic + `\r\n` at bytes 2–3, magic range checked), WebAssembly (`\0asm`), Android dex (`dex\n0nn\0`), msi/deb/rpm/dmg |
| Font | woff, woff2, ttf/otf (one format group), ttc |
| 3D model | glb (`glTF` v1/v2), glTF JSON (`asset.version` plus a model key, or the `.gltf` claim), ASCII STL (`solid` + `facet normal`/`endsolid`), binary STL (`.stl` claim and size = 84 + 50 × triangles — needs the whole size: complete bytes, `inspect`'s `size`, a ranged or sized probe), OBJ (`.obj` claim + `v`/`f` lines), FBX (`Kaydara FBX Binary`, ASCII `; FBX`) |
| Diagram | draw.io (an `<mxfile` / `<mxGraphModel` root; claimed by `.drawio`, `.dio`), Excalidraw (`"type": "excalidraw"`; claimed by `.excalidraw`); an svg or png export keeps its image kind with `details.diagram` (a name ending `.drawio`, `.dio` or `.excalidraw` plus `.svg`/`.png`, an svg `content="&lt;mxfile`, a png `tEXt`/`zTXt` `mxfile` chunk, an Excalidraw source marker) |

Shebang scripts stay `code` (with `language`); they are dangerous only under a passive claim.

## Active PDF

A detected PDF is scanned for active names, decoded from `#xx`:

- `/JavaScript`, `/Launch`, `/EmbeddedFile`, `/RichMedia` in EVERY byte — they never occur by chance,
  and a reader finds an object by its xref offset wherever it sits (even inside a fake stream);
- `/JS` (a whole name) only in the file's SYNTAX — everything outside a stream's payload. Three such
  bytes turn up in compressed image or font data by chance (a Chrome-printed page's picture did), and a
  JavaScript action names `/S /JavaScript` as well. One walk splits syntax from payloads: a payload
  starts after `>>`, optional whitespace, `stream` and one end of line, and ends at the first
  `endstream` after it (an early one only ends it early — a false positive, never a miss);
- every name inside FlateDecode object streams (`/ObjStm`, its dictionary the syntax just before
  `stream`), each inflated up to 16 MiB — past it counts as active, a stream that does not inflate is
  skipped.

A sample is the whole file unless the caller says (`isActive(bytes, { fromStart, toEnd })`): a head
(`toEnd: false`) leaves a stream it cuts as payload to its end, a whole file reads what follows a
never-closed stream as syntax, and a tail (`fromStart: false`) treats its bytes up to the first
`endstream` as payload when no stream starts first — a tail always holds the `endstream` of the payload
it opens in, the trailer follows it. Found → `details.pdf.active`, reason `pdf-active`, `dangerous`.
`inspect` scans every byte it is given (`trailer` only with `complete`); a probe reads a PDF that fits
its budget whole, a larger one by its head sample and a 64 KiB tail (which also gives
`details.pdf.trailer`, reason `pdf-no-trailer`) — what lies beyond both is not seen, so verify uploads
on the complete file. Accepted false positive: `/JS` inside a literal string of the syntax (a title).

## Probes

The probe reads through a block cache (64 KiB blocks, never larger than the budget) whose total is
the budget (`maxBytes`, default 1 MiB): file-type seeks within it (CFB directory sectors, zip
entries behind a large stored one). Reaching the budget is a reason (`probe-budget`), never a
rejection. Without random access (`ranges()` → `null` or `randomAccess: false`) only the head
sample (at most the budget) is read and the stream destroyed. Defaults: 1 MiB budget, 64 KiB head.

## Safe names

`fileNameHelper.safe` keeps the base name (directories dropped on `/` and `\`), NFC-normalizes it,
drops controls, bidi and zero-width characters, turns tab/newline into spaces and every character
outside `[A-Za-z0-9_.\- ()]` into `_`, trims leading/trailing dots and spaces, caps the length (100
with the extension) and ends in `.<ext>` — the given one (the detected type's canonical extension,
replacing the reported one) or the name's own, lower-cased. A given `ext` must read as
`[a-z0-9]+(\.[a-z0-9]+)?` after lower-casing, otherwise the result carries no extension. Nothing left
→ `fallback` (`file`).

## Pitfalls

- Pass `complete: true` only for the whole file: it settles csv/JSON readings and the PDF trailer.
  A head sample with a known total passes `size` instead.
- `refuseInconclusive` also refuses an honest docx probed head-only (`head-only`); probe through
  ranges or inspect the complete file before turning it on.
- Import `FileKind` from `@owlmeans/file-inspector/kinds` in browser or contract code; the root
  entry loads Node-only detectors.

## Extending the package

- **A format of an existing kind**: its extension in `EXTENSION_MIME`, its media type in
  `KIND_BY_MIME` unless a `KIND_BY_MIME_PREFIX` prefix decides it, other spellings in
  `MIME_ALIASES`, synonyms in `EXTENSION_GROUPS` (first is canonical), a container claim that may
  legitimately hold it in `CONTAINER_EXTENSIONS`. A signature `file-type` lacks goes into the
  internal `createSignatureDetector` (a custom detector: it runs before the core ones, only peeks and
  returns `{ ext, mime }`), a text format into `createTextSniffer`, a rule that needs the size or
  the name into `createFormatReader`.
- **A new kind**: a `FileKind` value, then a decision for each group — `PASSIVE_KINDS` (scripts
  under it are dangerous), `TEXT_FAMILY`, `TEXT_CARRIED_KINDS`, `OFFICE_KINDS`. `FileKind` values
  are wire vocabulary: `@owlmeans/upload` enumerates them in its schemas, so a value is added, never
  renamed.
- **Invariants**: one `FileTypeParser` per call (a parser is not concurrency-safe); custom detectors
  only peek; an XML-parser error is never a failure; a probe never rejects on its budget; the
  `./kinds` entry imports nothing but the enum; dangerous verdicts stay unconditional; logs never
  carry contents.

## External docs

- https://www.npmjs.com/package/file-type — v22: signature detection only (no csv/svg/text/code, legacy office as `cfb`); custom detectors run before the core ones and must only peek; `fileTypeFromTokenizer` reads random-access tokenizers; one `FileTypeParser` per call (not concurrency-safe); `maxBufferSize` bounds detector reads
- https://github.com/Borewit/file-type-cfbf — `detectCfbf` names doc/xls/ppt/msi/vsd/pub/wps by the root entry's CLSID (needs the first directory sector reachable)
- https://github.com/Borewit/file-type-xml — `createXmlDetector({ sampleSize })`: svg, xhtml, kml, rss and generic xml from a bounded sample
- https://github.com/Borewit/strtok3 — exactly one copy may resolve: file-type's `instanceof EndOfStreamError` checks break on a second
- https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf — §7.3.5 names (`#xx`), §7.5.7 object streams, §12.6 actions (JavaScript, Launch), §7.11.4 embedded files
- https://learn.microsoft.com/en-us/windows/win32/debug/pe-format — `e_lfanew` at 0x3C, `Characteristics` `IMAGE_FILE_DLL` (0x2000)
- https://github.com/python/cpython/blob/main/Lib/importlib/_bootstrap_external.py — the bytecode magic numbers and the flags word since 3.7

## Tests

`bun test ./tests` in `@owlmeans/file-inspector` — category A, no gates. Suites are mostly titled
`@owlmeans/file-inspector — <area>`: `inspector.spec.ts` (kinds, mimicry, policies, probes with and
without ranges), `executables.spec.ts`, `formats.spec.ts` (fonts, 3D models, diagrams, HTML the XML
detector cannot parse), `pdf.spec.ts`, `names.spec.ts`. Fixtures are built in code
(`tests/fixtures.ts`); `tests/context.ts` is an in-memory `ProbeSource` that counts the bytes and
reads it serves — assert budgets with it. A new format gets an `inspect` case under its own claim,
a passive-claim danger case where it is executable, and a probe case.

## Depends On

- `@owlmeans/storage-common` (`FileTypeError`), `@owlmeans/error`, `@owlmeans/log`
- `file-type`, `@file-type/cfbf`, `@file-type/xml`, `strtok3` (one copy with file-type's)

## Related

- [[file-streams]] (`@owlmeans/file-streams`) — sources and sinks that satisfy the port; transfers and archive extraction verify through it
- [[upload]] (`@owlmeans/upload`) — names kinds through `@owlmeans/file-inspector/kinds`
- [[server-upload]] (`@owlmeans/server-upload`) — probes every received file before accepting it
- [[storage-resource]] (`@owlmeans/storage-resource`) — verifies an upload's head before storing it
- [[storage-common]] (`@owlmeans/storage-common`) — `FileTypeError`, the base of both refusals
- [[logging]] — scope `file-inspector`; dangerous, refused-kind and mismatch refusals warn with `file-inspector.mimicry` / `file-inspector.refused`, never contents
