import type { Tree, TreeValue } from './types.js'

export const visitConfigLeafs = async (tree: Tree, reader: (value: string) => Promise<TreeValue>) =>
  tree != null ? Promise.all(Object.entries(tree).map(async ([key, value]) => {
    if (typeof value === 'string') {
      const descriptor = Object.getOwnPropertyDescriptor(tree, key)
      if (descriptor?.writable) {
        tree[key] = await reader(value)
      }
    } else if (Array.isArray(value)) {
      await Promise.all(value.map(async tree => { await visitConfigLeafs(tree as Tree, reader) }))
    } else if (typeof value === 'object') {
      await visitConfigLeafs(value as Tree, reader)
    }
  })) : tree
