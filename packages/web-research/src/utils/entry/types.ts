import type { PackageEntry } from '@owlmeans/package-inspector'

/**
 * How a package is imported, read from facts — its manifest's entry points and its readme's own import
 * lines — for the writers of its notes and its skill, and for the check of the skill they write.
 */
export interface PackageEntryUtils {
  /** Whether the package ROOT itself is importable: a `main`, a `module`, or an exports map with a root. */
  hasRoot: (entry: PackageEntry | undefined) => boolean
  /** The manifest's entry points as Markdown list lines; none when the manifest declares none. */
  facts: (name: string, entry: PackageEntry | undefined) => string[]
  /** The readme's import and `require` lines of this package — root imports first, each once, capped. */
  readmeImports: (name: string, readme: string | undefined) => string[]
  /** Whether a text imports the package ROOT (`from '<name>'`, `require('<name>')`, `import('<name>')`). */
  importsRoot: (name: string, text: string) => boolean
  /** The names a text binds the package root to (`import x from`, `import * as x from`, `const x = require`). */
  rootBindings: (name: string, text: string) => string[]
  /**
   * The section a package's notes document carries before the writer's own text: the entry points and
   * the readme's import lines. Empty when there is neither.
   */
  section: (name: string, entry: PackageEntry | undefined, readme: string | undefined) => string
}
