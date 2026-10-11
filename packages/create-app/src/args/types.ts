import type { CreateArgs } from '../types.js'

/** The scaffolder CLI's command line. */
export interface ArgsHelper {
  /** The options of a process argv, or `null` (after an error on stderr) for an unusable one. */
  parseArgs: (argv: string[]) => CreateArgs | null
  /** Print the usage text to stdout. */
  printHelp: () => void
}
