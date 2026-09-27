import { DEFAULT_NAMESPACE, I18nTier, LIB_NAMESPACE, MAX_PRIORITY } from './consts.js'
import type {
  I18nLeveledResourceSignature, I18nLoader, I18nLoaderEntry, I18nResource, I18nResourceOptions, I18nResourceSignature
} from './types.js'
import { tierCost } from './utils/consts.js'
import { _OwlMeansI18nLoaders, _OwlMeansI18nStorage, ensureLoaders, ensureStructure } from './utils/storage.js'

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

/** Library tier before app tier, then `priority` ascending — the order bundles are merged in. */
const ordered = (resources: I18nResource[]): I18nResource[] => [...resources].sort((a, b) => {
  const aTier = tierCost[a.tier]
  const bTier = tierCost[b.tier]
  if (aTier !== bTier) {
    return aTier - bTier
  }

  return (a.priority ?? MAX_PRIORITY) - (b.priority ?? MAX_PRIORITY)
})

export const initI18nResource = (lng: string, resource: string, ns?: string): null | I18nResource[] => {
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

/**
 * The merged bundle of one (ns, resource, language) slot, read WITHOUT draining it.
 *
 * Every registered bundle is deep-merged in the order `initI18nResource` hands them out — library
 * tier before app tier, then `priority` ascending, a bundle with no priority last — so an app
 * override wins exactly as it does in i18next. The slot is never marked drained and no empty slot
 * is created, so a later `initI18nResource` still returns the same bundles. This is the read for
 * code with no i18next instance (a server rendering an e-mail) and for a language other than the
 * active one (a legal text shown in the billing country's language). `null` when nothing is
 * registered for the slot.
 */
export const resolveI18nResource = (
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

/**
 * Register a loader for a language's resources — typically a dynamic `import()` of a module that
 * calls `addI18nLib` / `addI18nApp`. If the language was already requested (`loadI18nLanguage` was
 * called for it), the loader starts at once: one registered late, by a module that only evaluates
 * after the app started, is never silently skipped. Its failure then surfaces through the next
 * `loadI18nLanguage` call, which retries it.
 */
export const addI18nLoader = (lng: string, loader: I18nLoader): void => {
  const bucket = ensureLoaders(lng)
  const entry: I18nLoaderEntry = { loader, done: false }
  bucket.entries.push(entry)
  if (bucket.requested) {
    runLoader(entry).catch(() => { /* retried and reported by the next loadI18nLanguage */ })
  }
}

/**
 * Await every loader registered for `lng` — including those registered while this call is in
 * flight — then resolve. Concurrent and repeated calls share in-flight runs and never re-run a
 * completed loader; a loader registered after an earlier call resolved is awaited by the next one.
 * A language with no loaders resolves at once.
 *
 * Rejects with the first failure once every loader of the pass has settled; the failed loader
 * alone is re-run by the next call.
 */
export const loadI18nLanguage = async (lng: string): Promise<void> => {
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

/** Whether every loader registered for `lng` has completed; true for a language with none. */
export const isI18nLanguageLoaded = (lng: string): boolean =>
  _OwlMeansI18nLoaders.data[lng]?.entries.every(entry => entry.done) ?? true
