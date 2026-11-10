import type { FileKind } from '../consts.js'
import type { DeclaredType, FileClaims, FileDetails, VerdictStatus } from './types.js'

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
}
