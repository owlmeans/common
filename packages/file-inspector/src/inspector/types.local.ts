import type { FileKind } from '../consts.js'
import type { DeclaredType, DetectedType, DiagramFormat, FileClaims, FileDetails, VerdictStatus } from './types.js'

export interface TextFinding {
  /** Whether the bytes read as text at all. */
  text: boolean
  encoding: NonNullable<FileDetails['encoding']>
  kind?: FileKind
  ext?: string
  mime?: string
  confidence?: 'medium' | 'low'
  csv?: FileDetails['csv']
  language?: string
  /** A `#!` interpreter line opened the text. */
  shebang?: boolean
  active?: boolean
}

export interface TextSniffer {
  /** What a sample is as text — `complete` when it is the whole file; `ext` the claimed extension. */
  sniff: (bytes: Uint8Array, complete: boolean, ext?: string) => TextFinding
  /** Whether markup carries scripts or event handlers. */
  isActive: (bytes: Uint8Array) => boolean
}

export interface ClaimReader {
  /** The declared type a set of claims implies. */
  read: (claims: FileClaims) => DeclaredType
}

export interface Comparison {
  status: VerdictStatus
  reasons: string[]
  dangerous: boolean
}

export interface ProbeFacts {
  bytesRead: number
  randomAccess: boolean
  complete: boolean
  budgetHit?: boolean
  pdfTrailer?: boolean
  pdfActive?: boolean
  /** The whole file's size, when known. */
  size?: number
  /** The claimed name, for compound names (`.drawio.svg`). */
  name?: string
}

/** Which part of a PDF a scanned sample is: the whole file unless said otherwise. */
export interface PdfSample {
  /** The sample starts at the file's first byte. Default `true`; a tail does not. */
  fromStart?: boolean
  /** The sample reaches the file's last byte. Default `true`; a head does not. */
  toEnd?: boolean
}

export interface PdfScanner {
  /**
   * Whether PDF bytes carry an active name: a long one anywhere, `/JS` in the syntax — everything
   * outside a stream's payload — or inside a FlateDecode object stream.
   */
  isActive: (bytes: Uint8Array, sample?: PdfSample) => boolean
  /** Whether a PDF's tail holds its `%%EOF` trailer. */
  hasTrailer: (tail: Uint8Array) => boolean
}

export interface FormatReader {
  /** A binary STL by its size rule: 84 header bytes and 50 per triangle the header counts. */
  isBinaryStl: (head: Uint8Array, size: number | undefined) => boolean
  /** The diagram a detected file carries, from its kind, markers in its head or its compound name. */
  diagramOf: (detected: DetectedType | undefined, head: Uint8Array, name?: string) => DiagramFormat | undefined
}
