import type { ArchiveHelper, TransferHelper, Workspace } from '@owlmeans/file-streams'
import type { FileInspector, FileVerdict } from '@owlmeans/file-inspector'
import type { UploadedFile, UploadReason } from '@owlmeans/upload'
import type { UploadReceiver, UploadReserveOutcome, UploadSessionState, UploadSessionStore } from '../types.js'
import type { UploadIncoming } from './types.js'

export interface UploadIntakeDeps {
  store: UploadSessionStore
  receiver: UploadReceiver
  workspace: Workspace
  inspector: FileInspector
  archives: ArchiveHelper
  transfer: TransferHelper
}

/** The per-file pipeline of the service. */
export interface UploadIntake {
  receive: (state: UploadSessionState, incoming: UploadIncoming) => Promise<UploadedFile[]>
  /** Removes what a session left in its scope (spools, unpack folders) and the scope when nothing else is in it. */
  clean: (state: UploadSessionState) => Promise<void>
}

/** A file being decided: its id and normalized path (an archive entry under the archive's folder). */
export interface UploadIntakeFile {
  id: string
  path: string
  name: string
  from?: string
}

/** A verification: the verdict, and the reason when the policy refused it (the spool already removed). */
export interface UploadVerification {
  verdict: FileVerdict
  reason?: UploadReason
}

/** One reservation while its file is in flight — given back once, or consumed by the record. */
export interface HeldReservation {
  readonly bytes: number
  /** Re-sizes the hold to the counted bytes; the outcome of the extra reservation when it grows. */
  resize: (bytes: number) => Promise<UploadReserveOutcome>
  /** Gives the reservation back (once). */
  release: () => Promise<void>
  /** The file was recorded: the reservation now counts it. */
  consume: () => void
}
