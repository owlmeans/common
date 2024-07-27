import { ENTITY_PREFIX, KP_SEP, PREFIX_SEP, PROFILE_PREFIX, SERVICE_PREFIX } from './consts.js'
import type { KeyMeta } from './types.js'

export const toPath = (...args: (string | string[])[]) => args.map(
  arg => Array.isArray(arg) ? arg.join(PREFIX_SEP) : arg
).join(KP_SEP)

export const mataToPath = (meta: Partial<KeyMeta>): string => {
  const { scopes, id, entityId } = meta
  const items: (string | string[])[] = []
  if (scopes != null && scopes.length === 1) {
    items.push([SERVICE_PREFIX, scopes[0]])
  }
  if (entityId != null) {
    items.push([ENTITY_PREFIX, entityId])
  }
  if (id != null) {
    items.push([PROFILE_PREFIX, id])
  }

  return toPath(...items)
}

const skipFields = ['name']

export const matchMeta = (haystack: KeyMeta, needle: Partial<KeyMeta>): boolean =>
  Object.entries(needle).every(([key, value]) =>
    skipFields.includes(key)
    || (haystack[key as keyof typeof haystack] != null
      && (Array.isArray(value)
        ? Array.isArray(haystack[key as keyof typeof haystack])
        && value.every(value => (haystack[key as keyof typeof haystack] as unknown[]).includes(value))
        : haystack[key as keyof typeof haystack] === value)
    ))
