import type { FileSource } from '../../types.js'
import type { SourceClaims } from '../types.js'

/**
 * The one binary read a Viable ephemeral workload answers (its publisher's `readBinaryFile`
 * command, `{ filePath } → { base64 }`). viable-agent's `FileHelper` satisfies it as is — pass the
 * helper itself, never a destructured method.
 */
export interface WorkloadReader {
  readBinaryFile: (filePath: string) => Promise<string>
}

export interface WorkloadSourceOptions {
  /** Folder inside the workload's project, e.g. `docs/materials`. */
  root?: string
  /** Per-file ceiling; never above (and by default) `WORKLOAD_MAX_FILE_BYTES`. */
  maxFileBytes?: number
  /** Retries of a failed read. Default 1. */
  retries?: number
}

/** Files of a Viable ephemeral workload, read through its reader. */
export interface WorkloadSource {
  readonly kind: string
  /**
   * One file as a source: re-openable (each open is one read of the whole file), its size known
   * after the first read, random access over the bytes of one read.
   * @throws {PathError} when the path is not a confined relative path.
   */
  entry: (path: string, claims?: SourceClaims) => FileSource
}
