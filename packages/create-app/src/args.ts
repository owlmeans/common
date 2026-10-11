import { namingHelper } from './naming.js'
import { DEFAULT_LANG, SLUG_PATTERN } from './consts.js'
import { HELP, PMS } from './consts.local.js'
import type { CreateArgs, PackageManager } from './types.js'
import type { ArgsHelper } from './args/types.js'

export const createArgsHelper = (): ArgsHelper => {
  const parseArgs = (argv: string[]): CreateArgs | null => {
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
          if (!namingHelper.isValidSlug(v)) {
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
          if (!namingHelper.isValidLang(v)) {
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

  const printHelp = (): void => {
    process.stdout.write(HELP)
  }

  return { parseArgs, printHelp }
}

export const argsHelper = createArgsHelper()
