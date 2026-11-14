import type { CollectSink } from '@owlmeans/llm-reader'

/**
 * The research sources — a scoped, transient area: pages and files cloned for one research, the step
 * records that make a resumed run skip finished work, and nothing else. Paths are relative POSIX.
 */
export interface ResearchSources {
  /** A collect sink writing into this area — `reader.collect(url, { sink, prefix })` puts every file under `prefix`. */
  sink: () => CollectSink
  /** Write one text file (replacing it). */
  put: (path: string, text: string) => Promise<void>
  /** One text file, or `null` when there is none. */
  read: (path: string) => Promise<string | null>
  /** Every file under `prefix` (the whole area when omitted), sorted. */
  list: (prefix?: string) => Promise<string[]>
  /** Remove a file, or everything under a folder; nothing there is not an error. */
  remove: (path: string) => Promise<void>
  /** A local directory holding this area — what a local bundle is read from (`createLocalBundlePlugin`). */
  localRoot: () => Promise<string>
  /** Remove the whole area. */
  drop: () => Promise<void>
}

/** Where the written documents go — paths chosen by the caller, relative POSIX. */
export interface ResearchOutputs {
  writeDoc: (path: string, text: string) => Promise<void>
  readDoc: (path: string) => Promise<string | null>
}

/** The store a research works in: the transient sources and the lasting outputs. */
export interface ResearchStore {
  sources: ResearchSources
  outputs: ResearchOutputs
}

export interface DirectoryResearchStoreOptions {
  /** The sources area's directory (created on first write). */
  sourcesRoot: string
  /** The outputs' directory (created on first write). */
  outputsRoot: string
}
