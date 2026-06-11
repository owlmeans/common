export interface CliArgs {
  dir: string
  yes: boolean
  only: string[]
  claudeOnly: boolean
  copilotOnly: boolean
  extras: boolean
  force: boolean
  dryRun: boolean
  help: boolean
}

const HELP = `owlmeans-agent-skills — install embedded @owlmeans/* agent guidance

Usage: npx @owlmeans/agent-skills [options]

Options:
  --dir <path>        target project directory (default: cwd)
  --yes, -y           skip interactive confirmation
  --only <pkg,...>    comma-separated @owlmeans/* package names to install from
  --claude-only       install only Claude Code skills
  --copilot-only      install only Copilot instructions
  --extras            include extras bundled with the installer (default: on)
  --no-extras         skip installer-bundled extras
  --force             overwrite locally-edited files (no AUTO-GENERATED banner)
  --dry-run           print plan without writing files
  --help, -h          show this help
`

export const parseArgs = (argv: string[]): CliArgs | null => {
  const args = argv.slice(2) // strip node + script
  const result: CliArgs = {
    dir: process.cwd(),
    yes: false,
    only: [],
    claudeOnly: false,
    copilotOnly: false,
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
        result.claudeOnly = true
        break
      case '--copilot-only':
        result.copilotOnly = true
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

export const printHelp = (): void => {
  process.stdout.write(HELP)
}
