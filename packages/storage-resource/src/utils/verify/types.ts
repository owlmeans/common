import type { FileClaims, FileVerdict } from '@owlmeans/file-inspector'

export interface UploadClaims extends FileClaims {
  /** The declared size of the whole body. */
  size: number
  /** Whether the head is the whole body. */
  complete: boolean
}

/** Decides whether an upload's bytes are what it claims, from its head. */
export interface VerifyUtils {
  /**
   * The verdict over an upload's head when it may be stored.
   * @throws {FileMimicryError} `dangerous:…` for executable or active content under a passive claim;
   * `mime-mismatch` when the bytes contradict a claim, carry none, or a signature-less binary claims a kind.
   * @throws {FileKindError} `executable` for an executable, however honestly claimed.
   */
  verify: (head: Uint8Array, claims: UploadClaims) => Promise<FileVerdict>
}
