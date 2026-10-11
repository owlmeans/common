import type { ConfigurePayload, ConfigureResult, ConnectServices } from '@owlmeans/viable-common'
import type { TargetEnv } from '../types.js'

/**
 * The target's `.env` files in ONE project directory — the one thing about a local project the
 * platform does not own. A configure push rewrites only the block it wrote last time; every line
 * outside it survives untouched.
 */
export interface ProjectEnvHelper {
  /**
   * The browser bundle's environment file, project-relative.
   *
   * A SEPARATE file, and the separation is the whole leak boundary: whatever is in it gets compiled
   * into a bundle anybody can read, so nothing may reach it by merging in the server's file.
   */
  webEnvFile: () => string
  /** The env files a target has, in the order a later one overrides an earlier one. */
  envFilePaths: () => string[]
  /** One env file's values; `{}` for a file that is not there. */
  readEnvFile: (file: string) => Promise<Record<string, string>>
  /** Every env file the target has, parsed. */
  readEnv: () => Promise<TargetEnv>
  /**
   * Write the platform's block into each named file, keeping every line the user wrote.
   *
   * The block is delimited rather than diffed because the two writers have no other way to agree on
   * ownership: the platform composes its half whole (it is the only side that knows the OIDC client
   * and its secret) and the user's half is arbitrary. A file with no block yet gets one appended; a
   * file that does not exist is created with the block as its whole content.
   */
  writeEnv: (payload: ConfigurePayload) => Promise<ConfigureResult>
  /**
   * The same verdict a configure push answers with, without writing anything.
   *
   * A connector needs it before it asks the platform for work — a run that needs a database and a
   * target that has none is a job that will block, and saying so up front is cheaper than finding
   * out from a boot check.
   */
  envStatus: (probe?: Array<keyof ConnectServices>) => Promise<ConfigureResult>
}
