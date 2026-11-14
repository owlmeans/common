import type { PackageVerdictKind } from '@owlmeans/package-inspector'
import type { ResearchGap } from '../../types.js'

/** What skill research is asked: an Agent Skills SKILL.md for one package. */
export interface SkillInput {
  /** The package. */
  name: string
  /** The skill's name — `^[a-z0-9-]{1,64}$`, the folder it is installed under. */
  skillName: string
  /** What the person wants the package for. */
  intent?: string
  /** An outputs path of usage notes already written (`research:packages`); absent, they are researched first. */
  notes?: string
  /** The product the skill is for — a brief excerpt. */
  context?: string
  /** Who reads the skill — "coding agents writing a React + Bun app". */
  audience?: string
  outputs: {
    /** The SKILL.md. */
    doc: string
    /** Where researched notes are written; `<doc without .md>.notes.md` by default. */
    notes?: string
  }
}

export interface SkillOutput {
  /** The validated SKILL.md — absent when the package had no notes (not genuine, nothing read). */
  doc?: string
  /** The notes the skill was written from. */
  notes?: string
  /** The inspector's verdict, when the notes were researched here. */
  verdict?: PackageVerdictKind
  chars?: number
  /** The first draft failed validation and one repair round fixed it. */
  repaired?: boolean
  gaps: ResearchGap[]
}

export interface SkillState extends Record<string, unknown> {
  input: SkillInput
  notesAt?: string
  notesDoc?: string
  verdict?: PackageVerdictKind
  writeAt?: string
  drafted?: number
  validateAt?: string
  repaired?: boolean
  cleanupAt?: string
  output?: SkillOutput
}

/** The notes step's durable record. */
export interface SkillNotes {
  notes?: string
  verdict?: PackageVerdictKind
  gaps: ResearchGap[]
}
