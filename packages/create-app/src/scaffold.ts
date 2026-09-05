import { resolve } from 'node:path'
import { DEFAULT_LANG, defaultDescription, titleize } from './naming.js'
import { copyTemplate, templateDir } from './template.js'

export interface ScaffoldOptions {
  /** Destination directory. Created when missing; an existing one is written into as-is. */
  dir: string
  /** package/workspace slug, e.g. `my-app`. */
  slug: string
  /** Human-readable name. Defaults to the titleized slug. */
  name?: string
  /** BCP-47-ish UI language and `<html lang>`. Defaults to `en`. */
  lang?: string
  /** One-line description for the README, AGENTS.md and the index.html meta tags. */
  description?: string
  /** Scaffold the shell without the example/demo code. */
  bare?: boolean
}

/**
 * Filesystem-only scaffolding for tools that drive create-app themselves: no git, no
 * dependency install, no agent-skills deploy, no output. Everything the CLI adds around
 * the copy is the CLI's business — a caller that wants it calls `run` instead.
 */
export const scaffold = (opts: ScaffoldOptions): void => {
  const name = opts.name ?? titleize(opts.slug)

  copyTemplate(templateDir(), resolve(opts.dir), {
    slug: opts.slug,
    name,
    lang: opts.lang ?? DEFAULT_LANG,
    description: opts.description ?? defaultDescription(name),
  }, { bare: opts.bare === true })
}
