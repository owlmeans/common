/** A declarative selection of config values that may cross into a browser. */
export type ConfigSelection = true | ConfigSelectionMap | EveryConfigValue

export interface ConfigSelectionMap {
  readonly [key: string]: ConfigSelection | undefined
}

/** Apply a selection to every item in an array or every value in an object map. */
export interface EveryConfigValue {
  readonly every: ConfigSelection
  readonly where?: (value: unknown) => boolean
}

/** A package-owned contribution to the public runtime-config document. */
export interface ApiConfigPlugin {
  /** Fields this package intentionally makes public. */
  readonly allow: ConfigSelection
  /** Nested fields to remove after selection, even when an ancestor is allowed. */
  readonly deny?: ConfigSelection
}

const plugins: ApiConfigPlugin[] = []
const OMIT = Symbol('api-config:omit')

type SelectionResult = unknown | typeof OMIT

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value)

const isEvery = (selection: ConfigSelection): selection is EveryConfigValue =>
  selection !== true && 'every' in selection

/** Build a selector for lists and string-keyed maps. */
export const every = (selection: ConfigSelection, where?: (value: unknown) => boolean): EveryConfigValue =>
  ({ every: selection, ...(where != null ? { where } : {}) })

/**
 * Register a package's public config contract during module import.
 *
 * The registry is intentionally additive: importing a package can only expose the fields it
 * names, while a package's `deny` selector can still remove sensitive nested values.
 */
export const apiConfigPlugin = (plugin: ApiConfigPlugin): void => {
  plugins.push(plugin)
}

const select = (value: unknown, selection: ConfigSelection): SelectionResult => {
  if (value === undefined) {
    return OMIT
  }
  if (selection === true) {
    return value
  }
  if (isEvery(selection)) {
    if (Array.isArray(value)) {
      return value.flatMap(item => {
        if (selection.where?.(item) === false) {
          return []
        }
        const selected = select(item, selection.every)
        return selected === OMIT ? [] : [selected]
      })
    }
    if (isRecord(value)) {
      return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
        if (selection.where?.(item) === false) {
          return []
        }
        const selected = select(item, selection.every)
        return selected === OMIT ? [] : [[key, selected]]
      }))
    }
    return OMIT
  }
  if (!isRecord(value)) {
    return OMIT
  }

  return Object.fromEntries(Object.entries(selection).flatMap(([key, nested]) => {
    if (nested == null) {
      return []
    }
    const selected = select(value[key], nested)
    return selected === OMIT ? [] : [[key, selected]]
  }))
}

const redact = (value: unknown, selection: ConfigSelection): SelectionResult => {
  if (selection === true) {
    return OMIT
  }
  if (isEvery(selection)) {
    if (Array.isArray(value)) {
      return value.flatMap(item => {
        if (selection.where?.(item) === false) {
          return [item]
        }
        const redacted = redact(item, selection.every)
        return redacted === OMIT ? [] : [redacted]
      })
    }
    if (isRecord(value)) {
      return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
        if (selection.where?.(item) === false) {
          return [[key, item]]
        }
        const redacted = redact(item, selection.every)
        return redacted === OMIT ? [] : [[key, redacted]]
      }))
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map(item => redact(item, selection)).filter(item => item !== OMIT)
  }
  if (!isRecord(value)) {
    return value
  }

  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const nested = selection[key]
    if (nested == null) {
      return [[key, item]]
    }
    const redacted = redact(item, nested)
    return redacted === OMIT ? [] : [[key, redacted]]
  }))
}

const merge = (target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> => {
  Object.entries(source).forEach(([key, value]) => {
    const current = target[key]
    if (Array.isArray(current) && Array.isArray(value)) {
      target[key] = [...current, ...value]
    } else if (isRecord(current) && isRecord(value)) {
      target[key] = merge({ ...current }, value)
    } else {
      target[key] = value
    }
  })

  return target
}

/** Apply one package contract without registering it; useful for focused contract tests. */
export const selectApiConfig = (config: Record<string, unknown>, plugin: ApiConfigPlugin): Record<string, unknown> => {
  const selected = select(config, plugin.allow)
  if (!isRecord(selected)) {
    return {}
  }
  const redacted = plugin.deny == null ? selected : redact(selected, plugin.deny)

  return isRecord(redacted) ? redacted : {}
}

/** Build the document the unauthenticated config endpoint may return. */
export const advertisedConfig = <C extends object>(config: C): Record<string, unknown> =>
  plugins.reduce(
    (result, plugin) => merge(result, selectApiConfig(config as Record<string, unknown>, plugin)),
    {} as Record<string, unknown>
  )
