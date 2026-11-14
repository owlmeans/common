/** A section a SKILL.md body must carry, matched against its `##`/`###` headings. */
export interface SkillSection {
  title: string
  /** Tested against a heading's text, numbering and trailing punctuation removed. */
  match: RegExp
}

/** A SKILL.md split into its frontmatter fields and its body. */
export interface SkillParts {
  /** Top-level `key: value` fields, values unquoted. */
  fields: Record<string, string>
  /** The raw value lines as written, by key — what a quoting check reads. */
  raw: Record<string, string>
  body: string
}

export interface SkillValidation {
  ok: boolean
  /** One line per fault, every fault at once. */
  errors: string[]
  name?: string
  description?: string
  chars: number
}

/** What a skill about one package must also show — read from that package's facts and notes. */
export interface SkillExpectation {
  /** The package the skill is about, as it is installed (`dayjs`, `@scope/name`). */
  package: string
  /**
   * The package root is importable (its notes import it or its manifest declares a root): the Imports
   * section must show the root's import.
   */
  rootImport?: boolean
}

export interface SkillValidatorOptions {
  /** The largest file accepted; `RESEARCH_LIMITS.skillChars` by default. */
  maxChars?: number
  /** The sections a body must carry; `SKILL_SECTIONS` by default. */
  sections?: readonly SkillSection[]
}

/** Checks an Agent Skills SKILL.md: frontmatter, name, description, sections, size, code fences, the package's imports. */
export interface SkillValidator {
  /**
   * Every fault of `text` as the skill `skillName`. With `expect`, also: the Imports section shows the
   * package root's import when `rootImport`, and no code example takes the package as a parameter.
   */
  validate: (text: string, skillName: string, expect?: SkillExpectation) => SkillValidation
  /**
   * The text with its frontmatter rendered again: `name` set to `skillName`, `description` kept and
   * quoted, every other field dropped (a generated skill never carries `allowed-tools`); a reply
   * wrapped in one code fence is unwrapped.
   */
  normalize: (text: string, skillName: string) => string
  /** The frontmatter and body, or `null` when the text opens with no frontmatter. */
  parts: (text: string) => SkillParts | null
}
