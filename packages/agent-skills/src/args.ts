import { HELP, OBSOLETE_TOOL_FLAG } from './consts.local.js'
import type { CliArgs } from './types.js'
import type { ArgsUtils } from './args/types.js'

export const createArgsUtils = (): ArgsUtils => {
  const parseArgs = (argv: string[]): CliArgs | null => {
    const args = argv.slice(2) // strip node + script
    const result: CliArgs = {
      dir: process.cwd(),
      yes: false,
      only: [],
      extras: true,
      force: false,
      dryRun: false,
      help: false,
    }

    let i = 0
    while (i < args.length) {
      const a = args[i]
      switch (a) {
        case '--help':
        case '-h':
          result.help = true
          break
        case '--yes':
        case '-y':
          result.yes = true
          break
        case '--force':
          result.force = true
          break
        case '--dry-run':
          result.dryRun = true
          break
        case '--claude-only':
        case '--copilot-only':
          process.stderr.write(OBSOLETE_TOOL_FLAG.replace('%s', a))
          break
        case '--extras':
          result.extras = true
          break
        case '--no-extras':
          result.extras = false
          break
        case '--dir': {
          const v = args[i + 1]
          if (v == null || v.startsWith('-')) {
            process.stderr.write(`error: --dir requires a path argument\n`)
            return null
          }
          result.dir = v
          i++
          break
        }
        case '--only': {
          const v = args[i + 1]
          if (v == null || v.startsWith('-')) {
            process.stderr.write(`error: --only requires a comma-separated package list\n`)
            return null
          }
          result.only = v.split(',').map(s => s.trim()).filter(Boolean)
          i++
          break
        }
        default:
          if (a.startsWith('--')) {
            process.stderr.write(`error: unknown flag ${a}\n`)
            return null
          }
      }
      i++
    }

    return result
  }

  const printHelp = (): void => {
    process.stdout.write(HELP)
  }

  return { parseArgs, printHelp }
}

export const argsUtils = createArgsUtils()
