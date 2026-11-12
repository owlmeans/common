/**
 * A reader for the YAML subset the platform's own frontmatter is written in.
 *
 * This package is runtime-free and carries no YAML library, yet the target-shape manifest has to
 * read a project's topology record (`.agents/memory/topology.md`) from the file map it is handed.
 * What the platform writes there is `YAML.stringify` of plain data — block mappings and sequences,
 * flow `[]`/`{}`, plain, quoted, folded and literal scalars, comments — and that is what this reads.
 * Anchors, aliases, tags, complex keys and several documents are refused rather than guessed.
 */
export interface YamlUtils {
  /** The value of one YAML document; throws on anything outside the subset or malformed. */
  parse: (text: string) => unknown
  /** The frontmatter block of a markdown document, parsed; `null` when absent or unreadable. */
  frontmatterOf: (source: string) => unknown
}

/** One source line: its indentation, its content after it, and whether it carries nothing. */
export interface YamlLine {
  indent: number
  content: string
  /** Blank, or a comment only. */
  empty: boolean
}
