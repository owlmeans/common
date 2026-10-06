import type { CliArgs } from '../types.js'

/** The installer CLI's command line. */
export interface ArgsUtils {
  /** The options of a process argv, or `null` (after an error on stderr) for an unusable one. */
  parseArgs: (argv: string[]) => CliArgs | null
  /** Print the usage text to stdout. */
  printHelp: () => void
}
