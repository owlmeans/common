
import { MiddlewareStage, MiddlewareType } from '@owlmeans/context'
import type { Middleware } from '@owlmeans/context'
import { readConfigValue } from '@owlmeans/server-config'

export const fileConfigReader: Middleware = {
  type: MiddlewareType.Config,
  stage: MiddlewareStage.Configuration,
  apply: async (context) => {
    const tree: Tree = context.cfg as unknown as Tree
    visitConfigLeafs(tree)
  }
}

// @TODO Move to server config
const visitConfigLeafs = (tree: Tree) =>
  Object.entries(tree).forEach(([key, value]) => {
    if (typeof value === 'string') {
      const descriptor = Object.getOwnPropertyDescriptor(tree, key)
      if (descriptor?.writable) {
        tree[key] = readConfigValue(value)
      }
    } else if (Array.isArray(value)) {
      value.forEach(tree => { visitConfigLeafs(tree as Tree) })
    } else if (typeof value === 'object') {
      visitConfigLeafs(value as Tree)
    }
  })

type TreeKey = string | number | symbol
type TreeValue = unknown | Array<unknown> | string
interface Tree extends Record<TreeKey, TreeValue | Tree> { }
