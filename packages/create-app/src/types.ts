export type PackageManager = 'bun' | 'npm' | 'yarn'

export interface CreateArgs {
  /** Target directory (positional). `null` means it must be prompted/derived. */
  dir: string | null
  /** Human-readable app name. Defaults to the directory slug. */
  name: string | null
  /** Explicit package slug. `null` derives it from the target directory. */
  slug: string | null
  /** BCP-47-ish language of the generated UI text and `<html lang>`. */
  lang: string
  /** One-line project description for the README, AGENTS.md and the index.html meta tags. */
  description: string | null
  /** Scaffold the shell without the example/demo code. */
  bare: boolean
  /** Package manager used to install deps and (for `bun`) run the project. */
  pm: PackageManager
  /** Install dependencies after copying the template. */
  install: boolean
  /** Deploy agent skills via @owlmeans/agent-skills after install. */
  skills: boolean
  /** Run `git init` in the new project. */
  git: boolean
  /** Skip confirmations / proceed into a non-empty directory. */
  yes: boolean
  help: boolean
}

export interface ScaffoldOptions {
  /** Destination directory. Created when missing; an existing one is written into as-is. */
  dir: string
  /** package/workspace slug, e.g. `my-app`. */
  slug: string
  /** Human-readable name. Defaults to the titleized slug. */
  name?: string
  /** BCP-47-ish UI language and `<html lang>`. Defaults to `en`. */
  lang?: string
  /** One-line description for the README, AGENTS.md and the index.html meta tags. */
  description?: string
  /** Scaffold the shell without the example/demo code. */
  bare?: boolean
}

export interface BareManifest {
  /** Template-relative paths — a file, a directory subtree, or a `*` / `**` glob — the bare shell omits. */
  remove: string[]
  /** Target template path → the `.bare.`-infixed source whose CONTENT is written there instead. */
  overrides: Record<string, string>
}

export interface TemplateReplacements {
  /** package/workspace slug, e.g. `my-app` */
  slug: string
  /** human-readable name, e.g. `My App` */
  name: string
  /** BCP-47-ish UI language, e.g. `en` — also the generated `<html lang>` */
  lang: string
  /** one-line project description for the README, AGENTS.md and the index.html meta tags */
  description: string
}

export interface CopyTemplateOptions {
  /** Scaffold the demo-free shell: apply `_bare.json`'s removals and overrides. */
  bare?: boolean
}
