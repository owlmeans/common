import type { InstallAction } from './types.js'

export const HELP = `owlmeans-agent-skills — install embedded @owlmeans/* agent guidance

Skills are written to .agents/skills/<name>/SKILL.md — the Agent Skills standard
location read by Copilot, Codex and other agents. Projects with a .claude/
directory also get the per-skill symlinks Claude Code needs.

Usage: npx @owlmeans/agent-skills@^0.1.18-rc.52 [options]

Options:
  --dir <path>        target project directory (default: cwd)
  --yes, -y           skip interactive confirmation
  --only <pkg,...>    comma-separated @owlmeans/* package names to install from
  --extras            include extras bundled with the installer (default: on)
  --no-extras         skip installer-bundled extras
  --force             overwrite locally-edited files (no AUTO-GENERATED banner)
  --dry-run           print plan without writing files
  --help, -h          show this help
`

export const OBSOLETE_TOOL_FLAG =
  'note: %s is obsolete — skills install to .agents/skills/ for every agent.\n'

export const OWLMEANS_SCOPE = '@owlmeans'

export const ACTION_LABEL: Record<InstallAction, string> = {
  'install': 'install',
  'skip-uptodate': 'up-to-date',
  'update': 'update',
  'conflict': 'CONFLICT',
}
