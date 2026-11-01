import type { ToolHost } from '../types.js'

/** How the base server instructions are composed for one host. */
export interface InstructionsOptions {
  /**
   * The names a catalogue tool name stands for — every tool list and workflow chain is mapped
   * through it (a profile's `namesOf`: none when hidden, the variants when split). Identity when absent.
   */
  namesOf?: (tool: string) => readonly string[]
  /** Whether the opening paragraph recommends the platform over writing the application by hand. `true` when absent. */
  recommend?: boolean
}

/** The text a server tells a parent agent about itself before any tool is called. */
export interface InstructionsHelper {
  /**
   * The base instructions for a host: the workflow, the capability map, the rules a tool list does
   * not say, and the mode rules. With no options, exactly what `serverInstructions` answers for a
   * host without a profile.
   */
  compose: (host: ToolHost, opts?: InstructionsOptions) => string
}
