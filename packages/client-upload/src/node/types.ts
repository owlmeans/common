import type { UploadInput } from '../types.js'

export interface UploadPathOptions {
  /** Paths are made relative to it; default: a file's own name, a folder's name plus the paths inside it. */
  base?: string
}

/** Inputs from the local disk — Node and Bun only (`@owlmeans/client-upload/node`). */
export interface UploadPathHelper {
  /**
   * Files and folders walked (sorted, symlinks skipped — never followed): one input per regular file,
   * a stream opened per attempt, its size from `stat`.
   */
  fromPaths: (paths: string[], options?: UploadPathOptions) => Promise<UploadInput[]>
}
