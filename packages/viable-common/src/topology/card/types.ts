import type { TopologyDescriptor, TopologyMeta } from '../types.js'

/** The topology file `.agents/memory/topology.md`: its frontmatter, read and written, and its body. */
export interface TopologyCardHelper {
  /**
   * Narrow a parsed frontmatter block into a topology, or answer `null`.
   *
   * `null` means "use the layout default", and every caller treats it that way. A topology file
   * written by a platform version this one cannot read must not stop a project from building — the
   * arrangement it describes is almost certainly still the default one.
   */
  parseTopologyMeta: (data: unknown) => TopologyDescriptor | null
  topologyMeta: (topology: TopologyDescriptor) => TopologyMeta
  /**
   * The body of `.agents/memory/topology.md` — what a model reads, and what a person reads.
   *
   * Rendered from the descriptor rather than maintained beside it, for the same reason the layout
   * tables are: a card that disagrees with the frontmatter teaches the wrong tree.
   */
  renderTopologyCard: (topology: TopologyDescriptor) => string
}
