import { DEFAULT_NAMESPACE, I18nTier, LIB_NAMESPACE, MAX_PRIORITY } from './consts.js'
import type { I18nLeveledResourceSignature, I18nResource, I18nResourceOptions, I18nResourceSignature } from './types.js'
import { tierCost } from './utils/consts.js'
import { ensureStructure } from './utils/storage.js'

const prepareOptions: (opts: I18nResourceOptions | string | undefined, ns?: string) => I18nResourceOptions = (opts, ns) => {
  if (typeof opts === 'string') {
    opts = { ns: opts }
  } else if (typeof opts === 'undefined') {
    opts = {}
  }
  if (opts.ns == null && ns != null) {
    opts.ns = ns
  }
  return opts
}

const _addI18n: I18nResourceSignature = (tier, lng, resource, data, opts) => {
  opts = prepareOptions(opts)
  const storage = ensureStructure(lng, resource, opts.ns)

  const ns = opts.ns ?? DEFAULT_NAMESPACE

  const entry: I18nResource = {
    ns, lng, tier, resource, data, priority: opts.priority
  }

  storage.resources.push(entry)
}

export const addI18nLib: I18nLeveledResourceSignature = (lng, resource, data, opts) => {
  opts = prepareOptions(opts, LIB_NAMESPACE)
  _addI18n(I18nTier.Library, lng, resource, data, opts)
}

export const addI18nApp: I18nLeveledResourceSignature = (lng, resource, data, opts) => {
  opts = prepareOptions(opts, resource)
  _addI18n(I18nTier.App, lng, resource, data, opts)
}

export const initI18nResource = (lng: string, resource: string, ns?: string): null | I18nResource[] => {
  ns = ns ?? DEFAULT_NAMESPACE
  const translation = ensureStructure(lng, resource, ns)
  if (translation.lngInitialized.includes(lng)) {
    return null
  }

  const result = [...translation.resources].sort((a, b) => {
    const aTier = tierCost[a.tier]
    const bTier = tierCost[b.tier]
    if (aTier !== bTier) {
      return aTier - bTier
    }

    return (a.priority ?? MAX_PRIORITY) - (b.priority ?? MAX_PRIORITY)
  })

  translation.lngInitialized.push(lng)

  return result
}
