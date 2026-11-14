/**
 * Where a project's materials and references live and what their folders are named — in the
 * materials scope (`links/<nn>-<slug>/…`), under `docs/materials/` and in the workload's harness.
 *
 * Pure: every name it builds is a safe storage segment (`[a-z0-9-]`, a letter or digit first), so a
 * slug or a package name the person typed can never escape its folder.
 */
export interface MaterialPathHelper {
  /** Whether a relative path lies under the reserved `links/` prefix (case-insensitive). */
  isLinkPath: (path: string) => boolean
  /**
   * Whether an UPLOAD may not use a relative path: under `docs/materials` (the generated documents)
   * or under `links/` (fetched files) — case-insensitive.
   */
  isReservedPath: (path: string) => boolean
  /**
   * A slug of a URL or a title: a URL reads as its host (no `www.`) and path; folded to `[a-z0-9-]`,
   * at most `MATERIAL_LINK_SLUG_MAX` characters, `link` when nothing is left. Idempotent.
   */
  slugOf: (text: string) => string
  /** A link folder's name: the ordinal, two digits at least, and the slug — `03-twenty-com`. */
  folderNameOf: (ordinal: number, slug: string) => string
  /** A link folder in the materials scope — `links/03-twenty-com`. */
  folderOf: (ordinal: number, slug: string) => string
  /**
   * The skill name of an npm package — `@tanstack/react-query` → `tanstack-react-query`: lower-case
   * `[a-z0-9-]`, no leading, trailing or doubled hyphen, short enough that `pkg-<name>` fits
   * `MATERIAL_SKILL_NAME_MAX`; `null` when nothing is left. Idempotent.
   */
  skillNameOf: (packageName: string) => string | null
  /** `docs/materials/research/<slug>.md`. */
  researchDocOf: (slug: string) => string
  /** `docs/materials/references/<slug>/summary.md`. */
  summaryDocOf: (slug: string) => string
  /** `docs/materials/references/<slug>/design.md`. */
  designDocOf: (slug: string) => string
  /** `docs/materials/skills/<name>/SKILL.md`. */
  skillDocOf: (name: string) => string
  /** The workload copy of a package skill — `.agents/skills/pkg-<name>`. */
  skillDirOf: (name: string) => string
}
