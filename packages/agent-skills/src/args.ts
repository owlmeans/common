export interface CliArgs {
  dir: string
  yes: boolean
  only: string[]
  /** @deprecated no-op — skills install to `.agents/skills/` for every agent. */
  claudeOnly?: boolean
  /** @deprecated no-op — skills install to `.agents/skills/` for every agent. */
  copilotOnly?: boolean
  extras: boolean
  force: boolean
  dryRun: boolean
  help: boolean
}

const HELP = `owlmeans-agent-skills — install embedded @owlmeans/* agent guidance

Skills are written to .agents/skills/<name>/SKILL.md — the Agent Skills standard
location read by Copilot, Codex and other agents. Projects with a .claude/
directory also get the per-skill symlinks Claude Code needs.

Usage: npx @owlmeans/agent-skills@^0.1.18-rc.12 [options]

Options:
  --dir <path>        target project directory (default: cwd)
  --yes, -y           skip interactive confirmation
  --only <pkg,...>    comma-separated @owlmeans/* package names to install from
  --extras            include extras bundled with the installer (default: on)
  --no-extras         skip installer-bundled extras
  --force             overwrite locally-edited files (no AUTO-GENERATED banner)
  --dry-run           print plan without writing files
  --claude-only       accepted, does nothing — one skill store serves every agent
  --copilot-only      accepted, does nothing — one skill store serves every agent
  --help, -h          show this help

Exit codes:
  0  success (including a dry run and an aborted confirmation)
  1  fatal error
  2  argument parse failure
  3  no embedded @owlmeans/* guidance found
  4  linked monorepo — pass --force to install anyway
  5  unresolved conflicts left after the clean files were installed
`

const OBSOLETE_TOOL_FLAG =
  'note: %s is obsolete — skills install to .agents/skills/ for every agent.\n'

export const parseArgs = (argv: string[]): CliArgs | null => {
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

export const printHelp = (): void => {
  process.stdout.write(HELP)
}
