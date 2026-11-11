import type { TreeSink } from '../types.js'
import { pathUtils } from './paths.js'
import type { TreeUtils } from './tree/types.js'

export const createTreeUtils = (): TreeUtils => {
  const prefixed = (tree: TreeSink, prefix: string): TreeSink => {
    const base = pathUtils.entry(prefix)
    return {
      kind: tree.kind,
      entry: path => tree.entry(`${base}/${pathUtils.entry(path)}`),
      directory: async (path, options) => await tree.directory(`${base}/${pathUtils.entry(path)}`, options),
    }
  }

  return { prefixed }
}

export const treeUtils = createTreeUtils()
