import { resolve } from 'node:path'
import { namingHelper } from './naming.js'
import { DEFAULT_LANG } from './consts.js'
import { templateHelper } from './template.js'
import type { ScaffoldOptions } from './types.js'

/**
 * Filesystem-only scaffolding for tools that drive create-app themselves: no git, no
 * dependency install, no agent-skills deploy, no output. Everything the CLI adds around
 * the copy is the CLI's business — a caller that wants it calls `run` instead.
 */
export const scaffold = (opts: ScaffoldOptions): void => {
  const name = opts.name ?? namingHelper.titleize(opts.slug)

  templateHelper.copyTemplate(templateHelper.templateDir(), resolve(opts.dir), {
    slug: opts.slug,
    name,
    lang: opts.lang ?? DEFAULT_LANG,
    description: opts.description ?? namingHelper.defaultDescription(name),
  }, { bare: opts.bare === true })
}
