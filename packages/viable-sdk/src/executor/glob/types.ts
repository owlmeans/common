import type { Options } from 'globby'

export interface GlobHelper {
  /**
   * `globby` with its negated patterns handed over as `ignore` entries.
   *
   * Since globby 16 a negated pattern anchored at an absolute path (`!/sandbox/dist/**`) is silently not
   * applied, while the same pattern given as an `ignore` entry is. Every caller here anchors its patterns at
   * the sandbox root, so the split restores what the patterns always meant.
   */
  list: (patterns: string | string[], options?: Options) => Promise<string[]>
}
