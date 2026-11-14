import type { ScreenTextKind, ScreenVerdict, SourceStatus } from '../../consts.js'
import type { InjectionSignalKind } from '../../screen/consts.js'

/** What the screen decided about one source — written on its record. */
export interface SourceScreen {
  verdict: ScreenVerdict
  kinds: InjectionSignalKind[]
  reason?: string
  /** A judge decided. */
  judged?: boolean
}

/**
 * One cloned source of a run — a page, a file, a readme. The record is the durable unit guard: a
 * resumed loop skips every source whose record exists.
 */
export interface SourceRecord {
  /** `s01`, `p03`, `<package>-readme` — sortable, unique in the run. */
  id: string
  url: string
  finalUrl?: string
  title?: string
  status: SourceStatus
  reason?: string
  /** The package a source documents. */
  group?: string
  /** `page`, `readme`, `docs`. */
  role?: string
  /** Area path of the raw form the screen reads (the bundle's page, the page html, the readme). */
  raw?: string
  rawKind?: ScreenTextKind
  /** Area path of the text a model reads (`content.md`). */
  content?: string
  chars?: number
  screen?: SourceScreen
}

/**
 * One run's part of the sources area, under a prefix derived from its run id (a composed child's
 * prefix nests under its parent's): step records, source records, cloned files.
 */
export interface RunArea {
  readonly prefix: string
  /** An area path inside the run's prefix. */
  path: (...parts: string[]) => string
  /** The folder a source's files are cloned into. */
  files: (id: string) => string
  /** A JSON file of the run, or `null`. */
  read: <T>(rel: string) => Promise<T | null>
  write: (rel: string, value: unknown) => Promise<void>
  /** A step's durable record — written once its side effects are done; the second guard of the step. */
  step: <T>(step: string) => Promise<T | null>
  saveStep: (step: string, value: unknown) => Promise<void>
  unit: (id: string) => Promise<SourceRecord | null>
  saveUnit: (record: SourceRecord) => Promise<void>
  /** Every source record, by id. */
  units: () => Promise<SourceRecord[]>
  /** Remove a source's cloned files; its record stays. */
  dropFiles: (id: string) => Promise<void>
  /** Remove everything of the run. */
  clear: () => Promise<void>
}
