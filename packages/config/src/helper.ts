import type { ConfigRecord } from '@owlmeans/context'
import type { CommonConfig } from './types.js'
import type { Tree, TreeValue } from './utils/types.js'
import type { ResourceRecord } from '@owlmeans/resource'
import type { ConfigHelper } from './helper/types.js'

export const createConfigHelper = (): ConfigHelper => {
  const mergeConfig = <T extends CommonConfig = CommonConfig>(target: T, source: T): T =>
    mergeObject(target as Tree, source as Tree) as T

  const mergeObject = (target: Tree, source: Tree): Tree => {
    if (Array.isArray(target) && Array.isArray(source)) {
      target.push(...source)
    } else if (isObject(target) && isObject(source)) {
      Object.entries(source).forEach(([key, value]) => {
        if (target[key] != null) {
          if (isRecursive(target[key])) {
            target[key] = mergeObject(target[key] as Tree, value as Tree)
          } else {
            target[key] = value
          }
        } else {
          target[key] = value
        }
      })
    }

    return target
  }

  const isRecursive = (value: unknown): value is Tree | Array<TreeValue> =>
    typeof value === 'object' && value !== null

  const isObject = (value: unknown): value is Tree =>
    isRecursive(value) && !Array.isArray(value)

  const toConfigRecord = (object: Object): ConfigRecord => object as ConfigRecord

  const fromConfigRecord = <C extends ConfigRecord, T extends ResourceRecord>(object: C): T => object as unknown as T

  return { mergeConfig, toConfigRecord, fromConfigRecord }
}

export const configHelper = createConfigHelper()

/** @deprecated compat:factory-refactor — use `configHelper.toConfigRecord(…)` */
export const toConfigRecord = (object: Object): ConfigRecord => configHelper.toConfigRecord(object)

/** @deprecated compat:factory-refactor — use `configHelper.fromConfigRecord(…)` */
export const fromConfigRecord = <C extends ConfigRecord, T extends ResourceRecord>(object: C): T => configHelper.fromConfigRecord<C, T>(object)
