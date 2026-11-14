import type { PackageReason, PackageVerdictKind } from '@owlmeans/package-inspector'
import type { ResearchGap } from '../../types.js'

/** One package a person named, with what they want it for. */
export interface PackageRequest {
  name: string
  intent?: string
}

/** What packages research is asked. */
export interface PackagesInput {
  /** At most `maxPackages`; the rest are ignored. */
  packages: PackageRequest[]
  /** The product the packages are for — a brief excerpt. */
  context?: string
  /** Documentation pages read per package (≤ `maxDocsPages`). */
  maxPages?: number
  outputs: {
    /** The verdicts and every genuine package's usage notes. */
    doc: string
    /** A folder for one notes document per genuine package (`<folder>/<name>.md`), when wanted. */
    notesDir?: string
  }
}

/** A verdict as the output carries it — the inspector's facts stay out. */
export interface PackageVerdictSummary {
  name: string
  verdict: PackageVerdictKind
  reasons: PackageReason[]
  lookalikeOf?: string
  /** The first finding's sentence. */
  detail?: string
  latest?: string
  downloads: number | null
}

/** Where a genuine package's notes are. */
export interface PackageNotesRef {
  name: string
  doc?: string
}

export interface PackagesOutput {
  doc?: string
  verdicts: PackageVerdictSummary[]
  notes: PackageNotesRef[]
  gaps: ResearchGap[]
}

export interface PackagesState extends Record<string, unknown> {
  input: PackagesInput
  inspectAt?: string
  inspected?: number
  genuine?: number
  readAt?: string
  read?: number
  screenAt?: string
  kept?: number
  dropped?: number
  flagged?: number
  judged?: number
  notesAt?: string
  written?: number
  cleanupAt?: string
  output?: PackagesOutput
}

/** The inspect step's durable record. */
export interface PackagesInspected {
  unavailable?: boolean
  count: number
  genuine: number
}

/** One package's read record — the unit guard of the read loop. */
export interface PackageRead {
  name: string
  readme: boolean
  pages: number
  /** Why its documentation could not be read. */
  docsError?: string
}

/** One package's notes record — the unit guard of the notes loop. */
export interface PackageNotes {
  name: string
  /** Area path of the notes text. */
  notes?: string
  cited: number
  sources: number
}
