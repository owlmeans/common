import type { CopyTemplateOptions, TemplateReplacements } from '../types.js'

/** The bundled `template/` tree and its copy into a new project. */
export interface TemplateHelper {
  /** Absolute path to the bundled `template/` directory (sibling of `build/`). */
  templateDir: () => string
  /**
   * Recursively copy `src` → `dest`, substituting the `__APP_*__` placeholders in text files
   * and renaming shipped dotfiles (`_gitignore` → `.gitignore`). With `bare` the template's
   * `_bare.json` decides what is dropped and which `.bare.` variant supplies the content, so
   * the demo inventory lives in the template rather than in this code.
   */
  copyTemplate: (src: string, dest: string, r: TemplateReplacements, opts?: CopyTemplateOptions) => void
  /** Whether a directory is missing or has no entries. */
  isEmptyDir: (dir: string) => boolean
}
