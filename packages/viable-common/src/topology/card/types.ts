import type { TopologyDescriptor, TopologyMeta } from '../types.js'

/** The topology file `.agents/memory/topology.md`: its frontmatter, read and written, and its body. */
export interface TopologyCardHelper {
  /**
   * Narrow a parsed frontmatter block into a topology, or answer `null`.
   *
   * `null` means "use the layout default", and every caller treats it that way. A topology file
   * written by a platform version this one cannot read must not stop a project from building — the
   * arrangement it describes is almost certainly still the default one.
   *
   * `areas` / `apps` are kept only when the whole app map narrows and validates
   * (`appMapHelper.validate`); anything less reads as no apps. A package's `app` / `mount` are kept
   * when well-formed. A record without them parses exactly as it always has.
   */
  parseTopologyMeta: (data: unknown) => TopologyDescriptor | null
  /**
   * The frontmatter of a markdown document as plain data, read with the package's own reader of the
   * YAML subset the platform writes; `null` when there is none or it cannot be read.
   */
  frontmatterOf: (source: string) => unknown
  /** `topology.md`'s text → its topology ({@link parseTopologyMeta} over {@link frontmatterOf}). */
  parseTopologyFile: (source: string) => TopologyDescriptor | null
  topologyMeta: (topology: TopologyDescriptor) => TopologyMeta
  /**
   * The body of `.agents/memory/topology.md` — what a model reads, and what a person reads.
   *
   * Rendered from the descriptor rather than maintained beside it, for the same reason the layout
   * tables are: a card that disagrees with the frontmatter teaches the wrong tree. A record with no
   * apps (or one) renders exactly as before apps existed; a split project adds `app: <name>` to its
   * app packages' notes and an Apps table.
   */
  renderTopologyCard: (topology: TopologyDescriptor) => string
}
