import { DEFAULT_NAMESPACE, I18nTier, LIB_NAMESPACE, MAX_PRIORITY } from './consts.js'
import type {
  I18nLeveledResourceSignature, I18nLoader, I18nLoaderEntry, I18nResource, I18nResourceOptions, I18nResourceSignature
} from './types.js'
import type { I18nHelper } from './helper/types.js'
import { tierCost, _OwlMeansI18nLoaders, _OwlMeansI18nStorage } from './utils/consts.js'
import { i18nStorageUtils } from './utils/storage.js'

export const createI18nHelper = (): I18nHelper => {
  const { ensureLoaders, ensureStructure } = i18nStorageUtils

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

  const addI18nLib: I18nLeveledResourceSignature = (lng, resource, data, opts) => {
    opts = prepareOptions(opts, LIB_NAMESPACE)
    _addI18n(I18nTier.Library, lng, resource, data, opts)
  }

  const addI18nApp: I18nLeveledResourceSignature = (lng, resource, data, opts) => {
    opts = prepareOptions(opts, resource)
    _addI18n(I18nTier.App, lng, resource, data, opts)
  }

  /** Library tier before app tier, then `priority` ascending — the order bundles are merged in. */
  const ordered = (resources: I18nResource[]): I18nResource[] => [...resources].sort((a, b) => {
    const aTier = tierCost[a.tier]
    const bTier = tierCost[b.tier]
    if (aTier !== bTier) {
      return aTier - bTier
    }

    return (a.priority ?? MAX_PRIORITY) - (b.priority ?? MAX_PRIORITY)
  })

  const initI18nResource = (lng: string, resource: string, ns?: string): null | I18nResource[] => {
    ns = ns ?? DEFAULT_NAMESPACE
    const translation = ensureStructure(lng, resource, ns)
    if (translation.lngInitialized.includes(lng)) {
      return null
    }

    const result = ordered(translation.resources)

    translation.lngInitialized.push(lng)

    return result
  }

  const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    value != null && typeof value === 'object' && !Array.isArray(value)

  /** Merge `source` over `target` in place; nested objects are copied, never shared with a bundle. */
  const mergeInto = (target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> => {
    for (const [key, value] of Object.entries(source)) {
      const current = target[key]
      target[key] = isPlainObject(value)
        ? mergeInto(isPlainObject(current) ? current : {}, value)
        : Array.isArray(value) ? structuredClone(value) : value
    }

    return target
  }

  const resolveI18nResource = (
    lng: string, resource: string, ns: string = DEFAULT_NAMESPACE
  ): Record<string, unknown> | null => {
    const translation = _OwlMeansI18nStorage.data[ns]?.[resource]?.[lng]
    if (translation == null || translation.resources.length === 0) {
      return null
    }

    return ordered(translation.resources).reduce<Record<string, unknown>>(
      (merged, bundle) => mergeInto(merged, bundle.data), {}
    )
  }

  /**
   * Start `entry`'s loader, or join the run already in flight. A completed entry never runs again;
   * a failed run clears `running`, so the next caller starts it afresh.
   */
  const runLoader = (entry: I18nLoaderEntry): Promise<void> => {
    if (entry.done) {
      return Promise.resolve()
    }

    return entry.running ??= Promise.resolve().then(() => entry.loader()).then(
      () => { entry.done = true },
      (error: unknown) => {
        entry.running = undefined
        throw error
      }
    )
  }

  const addI18nLoader = (lng: string, loader: I18nLoader): void => {
    const bucket = ensureLoaders(lng)
    const entry: I18nLoaderEntry = { loader, done: false }
    bucket.entries.push(entry)
    if (bucket.requested) {
      runLoader(entry).catch(() => { /* retried and reported by the next loadI18nLanguage */ })
    }
  }

  const loadI18nLanguage = async (lng: string): Promise<void> => {
    const bucket = ensureLoaders(lng)
    bucket.requested = true

    // Each pass settles what was pending when it began; a loader added meanwhile is left for the
    // next pass, so the call resolves only once nothing is pending.
    for (let pending = bucket.entries.filter(entry => !entry.done); pending.length > 0;
      pending = bucket.entries.filter(entry => !entry.done)) {
      const results = await Promise.allSettled(pending.map(runLoader))
      const failure = results.find(result => result.status === 'rejected')
      if (failure != null) {
        throw failure.reason
      }
    }
  }

  const isI18nLanguageLoaded = (lng: string): boolean =>
    _OwlMeansI18nLoaders.data[lng]?.entries.every(entry => entry.done) ?? true

  return {
    addI18nLib, addI18nApp, initI18nResource, resolveI18nResource,
    addI18nLoader, loadI18nLanguage, isI18nLanguageLoaded
  }
}

export const i18nHelper = createI18nHelper()

/** @deprecated compat:factory-refactor — use `i18nHelper.addI18nLib(…)` */
export const addI18nLib: I18nLeveledResourceSignature = (lng, resource, data, opts) => i18nHelper.addI18nLib(lng, resource, data, opts)

/** @deprecated compat:factory-refactor — use `i18nHelper.addI18nApp(…)` */
export const addI18nApp: I18nLeveledResourceSignature = (lng, resource, data, opts) => i18nHelper.addI18nApp(lng, resource, data, opts)

/** @deprecated compat:factory-refactor — use `i18nHelper.initI18nResource(…)` */
export const initI18nResource = (lng: string, resource: string, ns?: string): null | I18nResource[] => i18nHelper.initI18nResource(lng, resource, ns)

/** @deprecated compat:factory-refactor — use `i18nHelper.resolveI18nResource(…)` */
export const resolveI18nResource = (lng: string, resource: string, ns?: string): Record<string, unknown> | null => i18nHelper.resolveI18nResource(lng, resource, ns)

/** @deprecated compat:factory-refactor — use `i18nHelper.addI18nLoader(…)` */
export const addI18nLoader = (lng: string, loader: I18nLoader): void => i18nHelper.addI18nLoader(lng, loader)

/** @deprecated compat:factory-refactor — use `i18nHelper.loadI18nLanguage(…)` */
export const loadI18nLanguage = (lng: string): Promise<void> => i18nHelper.loadI18nLanguage(lng)

/** @deprecated compat:factory-refactor — use `i18nHelper.isI18nLanguageLoaded(…)` */
export const isI18nLanguageLoaded = (lng: string): boolean => i18nHelper.isI18nLanguageLoaded(lng)
