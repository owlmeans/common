import { basename } from 'node:path'
import { LANG_PATTERN, SLUG_PATTERN } from './consts.js'
import type { NamingHelper } from './naming/types.js'

export const createNamingHelper = (): NamingHelper => {
  const isValidSlug = (slug: string): boolean => SLUG_PATTERN.test(slug)

  const isValidLang = (lang: string): boolean => LANG_PATTERN.test(lang)

  const slugify = (input: string): string =>
    basename(input)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+/g, '')
      .slice(0, 32)
      .replace(/-+$/g, '')
      || 'owlmeans-app'

  const titleize = (slug: string): string =>
    slug.split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

  const defaultDescription = (name: string): string =>
    `${name} — a fullstack OwlMeans Common app.`

  return { isValidSlug, isValidLang, slugify, titleize, defaultDescription }
}

export const namingHelper = createNamingHelper()
