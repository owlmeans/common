import type { TreeSink } from '../../types.js'

export interface TreeUtils {
  /** A view of `tree` whose entries all land under `prefix`. */
  prefixed: (tree: TreeSink, prefix: string) => TreeSink
}
