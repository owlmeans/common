import { basename } from 'node:path'

/** npm-safe package slug: lowercase alphanumerics and inner dashes, 1–32 chars. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/

/** Loose BCP-47 shape — enough to keep junk out of `<html lang>` without shipping a registry. */
export const LANG_PATTERN = /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/

export const DEFAULT_LANG = 'en'

export const isValidSlug = (slug: string): boolean => SLUG_PATTERN.test(slug)

export const isValidLang = (lang: string): boolean => LANG_PATTERN.test(lang)

export const slugify = (input: string): string =>
  basename(input)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '')
    || 'owlmeans-app'

export const titleize = (slug: string): string =>
  slug.split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

export const defaultDescription = (name: string): string =>
  `${name} — a fullstack OwlMeans Common app.`
