import { DEFAULT_LANG, isValidLang, isValidSlug, SLUG_PATTERN } from './naming.js'

export type PackageManager = 'bun' | 'npm' | 'yarn'

export interface CreateArgs {
  /** Target directory (positional). `null` means it must be prompted/derived. */
  dir: string | null
  /** Human-readable app name. Defaults to the directory slug. */
  name: string | null
  /** Explicit package slug. `null` derives it from the target directory. */
  slug: string | null
  /** BCP-47-ish language of the generated UI text and `<html lang>`. */
  lang: string
  /** One-line project description for the README, AGENTS.md and the index.html meta tags. */
  description: string | null
  /** Scaffold the shell without the example/demo code. */
  bare: boolean
  /** Package manager used to install deps and (for `bun`) run the project. */
  pm: PackageManager
  /** Install dependencies after copying the template. */
  install: boolean
  /** Deploy agent skills via @owlmeans/agent-skills after install. */
  skills: boolean
  /** Run `git init` in the new project. */
  git: boolean
  /** Skip confirmations / proceed into a non-empty directory. */
  yes: boolean
  help: boolean
}

const HELP = `@owlmeans/create-app — scaffold a fullstack OwlMeans Common app

Usage:
  npm create @owlmeans/app@latest <dir> [options]
  bun create @owlmeans/app <dir> [options]
  yarn create @owlmeans/app <dir> [options]
  npx @owlmeans/create-app@^0.1.18-rc.14 <dir> [options]

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

const PMS: PackageManager[] = ['bun', 'npm', 'yarn']

export const parseArgs = (argv: string[]): CreateArgs | null => {
  const args = argv.slice(2)
  const result: CreateArgs = {
    dir: null,
    name: null,
    slug: null,
    lang: DEFAULT_LANG,
    description: null,
    bare: false,
    pm: 'bun',
    install: true,
    skills: true,
    git: true,
    yes: false,
    help: false,
  }

  // A value may legitimately start with `-` only for free-form text, so `--description`
  // takes whatever follows it; the identifier-shaped flags stay strict.
  const value = (i: number, flag: string, free = false): string | null => {
    const v = args[i + 1]
    if (v == null || (!free && v.startsWith('-'))) {
      process.stderr.write(`error: ${flag} requires a value\n`)
      return null
    }
    return v
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
      case '--bare':
        result.bare = true
        break
      case '--no-install':
        result.install = false
        break
      case '--no-skills':
        result.skills = false
        break
      case '--no-git':
        result.git = false
        break
      case '--name': {
        const v = value(i, '--name')
        if (v == null) return null
        result.name = v
        i++
        break
      }
      case '--slug': {
        const v = value(i, '--slug')
        if (v == null) return null
        if (!isValidSlug(v)) {
          process.stderr.write(
            `error: --slug must match ${SLUG_PATTERN.source}`
            + ' — lowercase letters, digits and inner dashes, 1-32 characters\n'
          )
          return null
        }
        result.slug = v
        i++
        break
      }
      case '--lang': {
        const v = value(i, '--lang')
        if (v == null) return null
        if (!isValidLang(v)) {
          process.stderr.write(`error: --lang must be a language code such as en or pt-BR\n`)
          return null
        }
        result.lang = v
        i++
        break
      }
      case '--description': {
        const v = value(i, '--description', true)
        if (v == null) return null
        result.description = v
        i++
        break
      }
      case '--pm': {
        const v = args[i + 1] as PackageManager | undefined
        if (v == null || !PMS.includes(v)) {
          process.stderr.write(`error: --pm must be one of ${PMS.join(', ')}\n`)
          return null
        }
        result.pm = v
        i++
        break
      }
      default:
        if (a.startsWith('-')) {
          process.stderr.write(`error: unknown flag ${a}\n`)
          return null
        }
        if (result.dir == null) {
          result.dir = a
        } else {
          process.stderr.write(`error: unexpected argument ${a}\n`)
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
