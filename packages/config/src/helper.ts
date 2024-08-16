import type { ConfigRecord } from '@owlmeans/context'
import type { CommonConfig } from './types.js'
import type { Tree, TreeValue } from './utils/types.js'
import type { ResourceRecord } from '@owlmeans/resource'

export const mergeConfig = <T extends CommonConfig = CommonConfig>(target: T, source: T): T =>
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

export const toConfigRecord = (object: Object): ConfigRecord => object as ConfigRecord

export const fromConfigRecord = <C extends ConfigRecord, T extends ResourceRecord>(object: C): T => object as unknown as T
