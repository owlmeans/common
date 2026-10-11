import type { ConfigRecord } from '@owlmeans/context'
import type { ResourceRecord } from '@owlmeans/resource'
import type { CommonConfig } from '../types.js'

/** Merges configs and moves records between the config and resource shapes. */
export interface ConfigHelper {
  /**
   * Deep-merges `source` into `target` in place and returns `target`: arrays are concatenated,
   * nested objects merged, any other value replaced.
   */
  mergeConfig: <T extends CommonConfig = CommonConfig>(target: T, source: T) => T
  /** An object typed as a config record. */
  toConfigRecord: (object: Object) => ConfigRecord
  /** A config record typed as the resource record it carries. */
  fromConfigRecord: <C extends ConfigRecord, T extends ResourceRecord>(object: C) => T
}
