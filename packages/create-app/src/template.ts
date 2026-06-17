import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/** Dotfiles/dirs are shipped with an underscore prefix so npm does not strip them from the tarball. */
const DOTFILE_RENAMES: Record<string, string> = {
  '_gitignore': '.gitignore',
  '_npmrc': '.npmrc',
  '_env': '.env',
  '_github': '.github',
  '_claude': '.claude',
}

/** Files whose contents are binary or must not be string-substituted. */
const BINARY_EXT = new Set(['.ico', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.woff', '.woff2'])

export interface TemplateReplacements {
  /** package/workspace slug, e.g. `my-app` */
  slug: string
  /** human-readable name, e.g. `My App` */
  name: string
}

/** Absolute path to the bundled `template/` directory (sibling of `build/`). */
export const templateDir = (): string =>
  resolve(dirname(fileURLToPath(import.meta.url)), '..', 'template')

const applyReplacements = (content: string, r: TemplateReplacements): string =>
  content
    .replaceAll('__APP_SLUG__', r.slug)
    .replaceAll('__APP_NAME__', r.name)

const isBinary = (file: string): boolean => {
  const dot = file.lastIndexOf('.')
  return dot >= 0 && BINARY_EXT.has(file.slice(dot).toLowerCase())
}

/**
 * Recursively copy `src` → `dest`, substituting `__APP_SLUG__` / `__APP_NAME__`
 * in text files and renaming shipped dotfiles (`_gitignore` → `.gitignore`).
 */
export const copyTemplate = (src: string, dest: string, r: TemplateReplacements): void => {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src)) {
    const from = join(src, entry)
    const targetName = DOTFILE_RENAMES[entry] ?? entry
    const to = join(dest, targetName)

    if (statSync(from).isDirectory()) {
      copyTemplate(from, to, r)
      continue
    }

    if (isBinary(from)) {
      cpSync(from, to)
      continue
    }

    const content = applyReplacements(readFileSync(from, 'utf8'), r)
    writeFileSync(to, content)
  }
}

export const isEmptyDir = (dir: string): boolean => {
  if (!existsSync(dir)) return true
  return readdirSync(dir).length === 0
}

export { renameSync }
