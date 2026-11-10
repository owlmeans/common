/**
 * The one binary write a Viable ephemeral workload accepts (its publisher's `writeBinaryFile`
 * command). viable-agent's `FileHelper` satisfies it as is — pass the helper itself, never a
 * destructured method.
 */
export interface WorkloadWriter {
  writeBinaryFile: (filePath: string, base64: string) => Promise<void>
}

export interface WorkloadSinkOptions {
  /** Folder inside the workload's project, e.g. `sources/web/public/media`. */
  root?: string
  /** Per-file ceiling; never above (and by default) `WORKLOAD_MAX_FILE_BYTES`. */
  maxFileBytes?: number
  /** Retries of a failed write — the write is atomic on the workload, so a retry is safe. Default 1. */
  retries?: number
}
