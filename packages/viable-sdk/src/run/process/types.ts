import type { LocalProcessRecord, LocalRunRecord } from '../types.js'

/** The liveness of the processes a run record names. */
export interface RunProcessHelper {
  /** Whether the api recorded here is still a live process. */
  apiRunning: (record: LocalRunRecord | null) => boolean
  /**
   * Stop a recorded process and wait for its port to actually free.
   *
   * The port and not the pid is what a replacement needs, so that is what is waited on.
   */
  stopProcess: (record: LocalProcessRecord | undefined) => Promise<void>
  /** Whether anything is answering on the api's port right now. */
  apiListening: (port?: number) => Promise<boolean>
}
