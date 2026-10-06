import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { BARE_MANIFEST, BINARY_EXT, DOTFILE_RENAMES, GLOBSTAR } from './consts.local.js'
import type { BareManifest, CopyTemplateOptions, TemplateReplacements } from './types.js'
import type { TemplateHelper } from './template/types.js'

export const createTemplateHelper = (): TemplateHelper => {
  const templateDir = (): string =>
    resolve(dirname(fileURLToPath(import.meta.url)), '..', 'template')

  const applyReplacements = (content: string, r: TemplateReplacements): string =>
    content
      .replaceAll('__APP_SLUG__', r.slug)
      .replaceAll('__APP_NAME__', r.name)
      .replaceAll('__APP_LANG__', r.lang)
      .replaceAll('__APP_DESCRIPTION__', r.description)

  const isBinary = (file: string): boolean => {
    const dot = file.lastIndexOf('.')
    return dot >= 0 && BINARY_EXT.has(file.slice(dot).toLowerCase())
  }

  /**
   * Bare variants sit beside the files they replace so the normal template still compiles as
   * one project — which is also why they are filtered out of the copy in BOTH modes.
   */
  const isBareVariant = (entry: string): boolean => entry.includes('.bare.')

  const globToRegExp = (pattern: string): RegExp => new RegExp(
    '^' + pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replaceAll('**/', GLOBSTAR)
      .replace(/\*/g, '[^/]*')
      .replaceAll(GLOBSTAR, '(?:.*/)?')
    + '$'
  )

  const isRemoved = (rel: string, patterns: string[]): boolean => patterns.some(pattern =>
    rel === pattern
    // A directory pattern takes its whole subtree — the walk simply never descends into it.
    || rel.startsWith(pattern.endsWith('/') ? pattern : pattern + '/')
    || (pattern.includes('*') && globToRegExp(pattern).test(rel))
  )

  const readBareManifest = (root: string): BareManifest => {
    const file = join(root, BARE_MANIFEST)
    if (!existsSync(file)) {
      throw new Error(`bare scaffolding requires ${BARE_MANIFEST} in the template (${root})`)
    }
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<BareManifest>

    return { remove: parsed.remove ?? [], overrides: parsed.overrides ?? {} }
  }

  const toPosix = (path: string): string => path.split(sep).join('/')

  const copyTree = (
    src: string, dest: string, r: TemplateReplacements, root: string, bare: BareManifest | null
  ): void => {
    mkdirSync(dest, { recursive: true })
    for (const entry of readdirSync(src)) {
      const from = join(src, entry)
      const rel = toPosix(relative(root, from))

      if (rel === BARE_MANIFEST || isBareVariant(entry)) continue
      if (bare != null && isRemoved(rel, bare.remove)) continue

      const to = join(dest, DOTFILE_RENAMES[entry] ?? entry)

      if (statSync(from).isDirectory()) {
        copyTree(from, to, r, root, bare)
        continue
      }

      const override = bare?.overrides[rel]
      const source = override != null ? join(root, override) : from

      if (isBinary(source)) {
        cpSync(source, to)
        continue
      }

      writeFileSync(to, applyReplacements(readFileSync(source, 'utf8'), r))
    }
  }

  const copyTemplate = (
    src: string, dest: string, r: TemplateReplacements, opts: CopyTemplateOptions = {}
  ): void => {
    copyTree(src, dest, r, src, opts.bare === true ? readBareManifest(src) : null)
  }

  const isEmptyDir = (dir: string): boolean => {
    if (!existsSync(dir)) return true
    return readdirSync(dir).length === 0
  }

  return { templateDir, copyTemplate, isEmptyDir }
}

export const templateHelper = createTemplateHelper()
