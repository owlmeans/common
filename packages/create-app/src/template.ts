import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve, sep } from 'node:path'

/** Dotfiles/dirs are shipped with an underscore prefix so npm does not strip them from the tarball. */
const DOTFILE_RENAMES: Record<string, string> = {
  '_gitignore': '.gitignore',
  '_npmrc': '.npmrc',
  '_env': '.env',
  '_github': '.github',
  // `_agents` carries the canonical harness — AGENTS.md's skills, the shared memory
  // store and the link-skills bridge; the template seed (sync-agent-meta) writes
  // `_agents/skills/` into this tree. `_claude` carries only the Claude Code bridge
  // (SessionStart hook + the gitkept symlink dir). Entries whose source dir is
  // absent are inert.
  '_agents': '.agents',
  '_claude': '.claude',
}

/** Files whose contents are binary or must not be string-substituted. */
const BINARY_EXT = new Set(['.ico', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.woff', '.woff2'])

/** Template-root manifest describing what the bare shell drops and what it swaps in. */
const BARE_MANIFEST = '_bare.json'

export interface BareManifest {
  /** Template-relative paths — a file, a directory subtree, or a `*` / `**` glob — the bare shell omits. */
  remove: string[]
  /** Target template path → the `.bare.`-infixed source whose CONTENT is written there instead. */
  overrides: Record<string, string>
}

export interface TemplateReplacements {
  /** package/workspace slug, e.g. `my-app` */
  slug: string
  /** human-readable name, e.g. `My App` */
  name: string
  /** BCP-47-ish UI language, e.g. `en` — also the generated `<html lang>` */
  lang: string
  /** one-line project description for the README, AGENTS.md and the index.html meta tags */
  description: string
}

export interface CopyTemplateOptions {
  /** Scaffold the demo-free shell: apply `_bare.json`'s removals and overrides. */
  bare?: boolean
}

/** Absolute path to the bundled `template/` directory (sibling of `build/`). */
export const templateDir = (): string =>
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

/** Stand-in for the globstar segment while the single-`*` pass runs; cannot occur in a path. */
const GLOBSTAR = '\u0000'

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

/**
 * Recursively copy `src` → `dest`, substituting the `__APP_*__` placeholders in text files
 * and renaming shipped dotfiles (`_gitignore` → `.gitignore`). With `bare` the template's
 * `_bare.json` decides what is dropped and which `.bare.` variant supplies the content, so
 * the demo inventory lives in the template rather than in this code.
 */
export const copyTemplate = (
  src: string, dest: string, r: TemplateReplacements, opts: CopyTemplateOptions = {}
): void => {
  copyTree(src, dest, r, src, opts.bare === true ? readBareManifest(src) : null)
}

export const isEmptyDir = (dir: string): boolean => {
  if (!existsSync(dir)) return true
  return readdirSync(dir).length === 0
}

export { renameSync }
