import type { ConnectConfigSaveBody, ConnectProjectConfig } from '@owlmeans/viable-common'

/** A project's configuration variables as the tools read and write them. */
export interface ConfigHelper {
  /**
   * The save a tool call asks for, from its `backend` / `frontend` maps of name → value: every
   * variable it named and nothing it did not. Names are kept as given (the platform checks them),
   * values as given — an empty string unsets a variable.
   */
  configBody: (args: Record<string, unknown>) => ConnectConfigSaveBody
  /** The variable names a save carries, backend first. */
  namesOf: (body: ConnectConfigSaveBody) => string[]
  /**
   * The configuration as a parent reads it: each backend variable as set or not — its value is a
   * secret and is never part of the answer — each frontend variable with its public value, what
   * still needs one, and the next valid action.
   */
  renderConfiguration: (projectId: string, config: ConnectProjectConfig) => string
}
