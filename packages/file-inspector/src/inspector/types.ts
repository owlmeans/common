import type { FileKind } from '../consts.js'
import type { ProbeSignalOptions, ProbeSource } from '../types.js'

/** How detected content relates to what the file claims to be. */
// A closed set of three outcomes — a union is the honest type.
export type VerdictStatus = 'match' | 'mismatch' | 'inconclusive'

/** A diagram format: a draw.io / diagrams.net model or an Excalidraw scene. */
// A closed set of formats — a union is the honest type.
export type DiagramFormat = 'drawio' | 'excalidraw'

/** What a file says about itself: a name (its extension) and a declared media type. */
export interface FileClaims {
  name?: string
  mime?: string
}

export interface DeclaredType {
  /** `pdf`, `tar.gz`. */
  ext?: string
  /** What the extension implies. */
  extMime?: string
  /** What the origin or the caller declared. */
  mime?: string
  /** The kinds those claims imply — two when the name and the media type disagree. */
  kinds: FileKind[]
}

export interface DetectedType {
  ext: string
  mime: string
  kind: FileKind
  /** `signature` — magic bytes and structure; `text` — the text sniffer. */
  method: 'signature' | 'text'
  /** `high` a signature; `medium` a container known from its head only; `low` a text heuristic. */
  confidence: 'high' | 'medium' | 'low'
}

export interface FileDetails {
  encoding?: 'utf-8' | 'utf-16le' | 'utf-16be' | 'binary'
  /** A CSV/TSV's delimiter and column count, read from its first lines. */
  csv?: { delimiter: string, columns: number }
  /** A source file's language, from its extension or shebang. */
  language?: string
  /** Scripts or event handlers in svg, html or xhtml — never serve it inline. */
  active?: boolean
  /** Same kind, another format (a png named `.jpg`). */
  formatDiffers?: { declared: string, detected: string }
  /**
   * A PDF's facts: `trailer` — whether it ends with `%%EOF` (when the end was reachable); `active` —
   * JavaScript, a launch action, an embedded file or rich media found in the bytes read, its own
   * text or a FlateDecode object stream (a dangerous verdict, reason `pdf-active`).
   */
  pdf?: PdfDetails
  /** The diagram a file carries: a diagram file itself, or an image exported with its model (`.drawio.svg`, `.drawio.png`). */
  diagram?: DiagramFormat
}

export interface PdfDetails {
  trailer?: boolean
  active: boolean
}

export interface FileVerdict {
  status: VerdictStatus
  declared: DeclaredType
  detected?: DetectedType
  /**
   * Refused whatever the policy: executable content under a non-executable claim, a script under a
   * passive claim (image, pdf, office, media, csv, font, 3D model, diagram), or an active PDF.
   */
  dangerous: boolean
  /**
   * `kind-mismatch`, `html-error-page`, `executable-content`, `binary-as-text`, `head-only`,
   * `probe-budget`, `no-claim`, `unrecognized`, `format-differs`, `pdf-no-trailer`, `pdf-active`.
   */
  reasons: string[]
  probe: { bytesRead: number, randomAccess: boolean, complete: boolean }
  details: FileDetails
}

/** What a verification refuses. Dangerous content is always refused. */
export interface VerifyPolicy {
  /**
   * Detected kinds allowed; any other (or nothing detected) → `FileKindError`. A 3D model or a
   * diagram carried in text (glTF JSON, draw.io XML) also passes as `FileKind.Text`.
   */
  allow?: FileKind[]
  /**
   * Kinds refused even under an honest, matching claim — detected, or claimed by the name or the
   * media type (`[FileKind.Executable]` for uploads) → `FileKindError`.
   */
  refuse?: FileKind[]
  /** Refuse a `mismatch` verdict. Default `true`. */
  refuseMismatch?: boolean
  /** Refuse an `inconclusive` verdict. Default `false`. */
  refuseInconclusive?: boolean
  /** Count a different format of the same kind (png named `.jpg`) as a mismatch. Default `false`. */
  strictFormat?: boolean
  /** Bytes of the stream's head examined during a transfer. Default 64 KiB. */
  sampleBytes?: number
}

export interface ProbeOptions extends ProbeSignalOptions {
  /** Claims merged over the source's own; the caller's win. */
  claims?: FileClaims
  /** Total bytes the probe may read. Default 1 MiB. */
  maxBytes?: number
  /** Use the source's random access when it has one. Default `true`. */
  randomAccess?: boolean
}

export interface InspectOptions {
  /** The bytes are the whole file. */
  complete?: boolean
  /** The whole file's size when the bytes are only its head — for structure rules (a binary STL). */
  size?: number
}

export interface FileInspectorOptions {
  /** Default probe budget in bytes. */
  maxProbeBytes?: number
  /** Default head sample in bytes. */
  sampleBytes?: number
}

/** Tells what a file really is from its bytes and compares it with what it claims. */
export interface FileInspector {
  /**
   * A verdict from the head plus a few bounded seeks — never more than the budget. A PDF that fits
   * the budget is read whole for its active-content scan, a larger one by its head and tail.
   */
  probe: (source: ProbeSource, options?: ProbeOptions) => Promise<FileVerdict>
  /** A verdict over bytes in hand (a head sample or a small whole file); no I/O. A PDF is scanned in full. */
  inspect: (bytes: Uint8Array, claims?: FileClaims, options?: InspectOptions) => Promise<FileVerdict>
  /** The verdict back when it satisfies the policy; `FileMimicryError` / `FileKindError` otherwise. */
  enforce: (verdict: FileVerdict, policy?: VerifyPolicy) => FileVerdict
  /** `probe` then `enforce`. */
  check: (source: ProbeSource, policy?: VerifyPolicy, options?: ProbeOptions) => Promise<FileVerdict>
  /** The kind of a media type (and extension, when the type is ambiguous). */
  kindOf: (mime: string | undefined, ext?: string) => FileKind
  /** A media type lower-cased, parameter-free and de-aliased; `undefined` when uninformative. */
  normalizeMime: (mime: string | undefined) => string | undefined
}
