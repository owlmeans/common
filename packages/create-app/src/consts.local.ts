import { DEFAULT_LANG } from './consts.js'
import type { PackageManager } from './types.js'

export const HELP = `@owlmeans/create-app — scaffold a fullstack OwlMeans Common app

Usage:
  npm create @owlmeans/app@latest <dir> [options]
  bun create @owlmeans/app <dir> [options]
  yarn create @owlmeans/app <dir> [options]
  npx @owlmeans/create-app@^0.1.18-rc.60 <dir> [options]

Generates three workspaces (common + api + web) with shadcn UI navigation and
layout, no authentication, and a session-scoped in-memory resource on the
backend. With --bare the demo is left out and only the working shell remains.
Agent skills are deployed into the project by default.

Options:
  --name <name>       human-readable app name (default: derived from <dir>)
  --slug <slug>       package slug (default: derived from <dir>)
  --lang <code>       language of the generated UI text (default: ${DEFAULT_LANG})
  --description <t>   one-line project description for the generated docs
  --bare              scaffold the shell only — no example/demo code
  --pm <bun|npm|yarn> package manager (default: bun)
  --no-install        do not install dependencies
  --no-skills         do not deploy agent skills via @owlmeans/agent-skills
  --no-git            do not run "git init"
  --yes, -y           proceed without prompts / into a non-empty directory
  --help, -h          show this help
`

export const PMS: PackageManager[] = ['bun', 'npm', 'yarn']

/** Dotfiles/dirs are shipped with an underscore prefix so npm does not strip them from the tarball. */
export const DOTFILE_RENAMES: Record<string, string> = {
  '_gitignore': '.gitignore',
  '_npmrc': '.npmrc',
  '_env': '.env',
  '_github': '.github',
  // `_agents` carries the canonical harness — AGENTS.md's skills, the shared memory
  // store and the link-skills bridge; the template seed (sync-agent-meta) writes
  // `_agents/skills/` into this tree. `_claude` carries only the Claude Code skill-link
  // bridge (SessionStart hook + the gitkept symlink dir). Entries whose source dir is
  // absent are inert.
  '_agents': '.agents',
  '_claude': '.claude',
}

/** Files whose contents are binary or must not be string-substituted. */
export const BINARY_EXT = new Set(['.ico', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.woff', '.woff2'])

/** Template-root manifest describing what the bare shell drops and what it swaps in. */
export const BARE_MANIFEST = '_bare.json'

/** Stand-in for the globstar segment while the single-`*` pass runs; cannot occur in a path. */
export const GLOBSTAR = '\u0000'
