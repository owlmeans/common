import type { CommonConfig } from '@owlmeans/config'

/** The public subset registered by packages through apiConfigPlugin(). */
export interface ApiConfig extends Partial<CommonConfig> {
}

export interface ConfigSelectionMap {
  readonly [key: string]: ConfigSelection | undefined
}

/** Apply a selection to every item in an array or every value in an object map. */
export interface EveryConfigValue {
  readonly every: ConfigSelection
  readonly where?: (value: unknown) => boolean
}

/** A declarative selection of config values that may cross into a browser. */
export type ConfigSelection = true | ConfigSelectionMap | EveryConfigValue

/** A package-owned contribution to the public runtime-config document. */
export interface ApiConfigPlugin {
  /** Fields this package intentionally makes public. */
  readonly allow: ConfigSelection
  /** Nested fields to remove after selection, even when an ancestor is allowed. */
  readonly deny?: ConfigSelection
}
