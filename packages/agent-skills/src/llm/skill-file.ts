import { stripMeta } from './manifest.js'

/**
 * A skill installed in a project, as the Agent Skills standard defines one
 * (https://agentskills.io): a directory whose `SKILL.md` opens with YAML frontmatter
 * carrying `name` and `description`, followed by the guidance itself.
 *
 * The two halves are priced very differently. `name` + `description` are what every call
 * pays for — they go into the index so the model knows the skill exists — while `body` is
 * only loaded once something says this call is about it. That asymmetry (progressive
 * disclosure) is the whole reason the standard puts the summary in frontmatter rather
 * than leaving it to be inferred from the text.
 */
export interface ProjectSkill {
  name: string
  description: string
  /** The guidance, with frontmatter and any generated-file banner removed. */
  body: string
  /** Path the file was read from, relative to the project root. */
  path: string
  license?: string
  compatibility?: string
  /** `allowed-tools` — advisory here; this package does not enforce a tool policy. */
  allowedTools?: string[]
  metadata?: Record<string, string>
}

/** `name` per the standard: 1-64 characters, lowercase alphanumerics and hyphens. */
export const SKILL_NAME_PATTERN = /^[a-z0-9-]{1,64}$/

/** `description` per the standard: 1-1024 characters. */
export const MAX_SKILL_DESCRIPTION = 1024

const KEY_LINE = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/
const NESTED_LINE = /^[ \t]+([A-Za-z][A-Za-z0-9_.-]*):[ \t]*(.+)$/
/** `|`, `>`, `|-`, `>+` … — a block-scalar indicator, not a value. */
const BLOCK_SCALAR = /^[|>][-+]?$/

const unquote = (value: string): string => {
  const trimmed = value.trim()
  const quote = trimmed.charAt(0)
  return (quote === '"' || quote === '\'') && trimmed.length > 1 && trimmed.endsWith(quote)
    ? trimmed.slice(1, -1)
    : trimmed
}

export interface SkillFrontmatter {
  scalars: Record<string, string>
  nested: Record<string, Record<string, string>>
}

/**
 * Parse the flat `key: value` subset of YAML that a SKILL.md header is written in.
 *
 * Hand-rolled rather than pulled from a library on purpose: this package is also the
 * installer CLI, which ships with no runtime dependencies at all, and a frontmatter
 * header is a handful of scalars, one nesting level, and folded continuation lines.
 * Anything richer than that is not a skill header — it is a mistake, and the caller
 * treats an unparseable file as absent.
 */
export const parseSkillFrontmatter = (content: string): SkillFrontmatter | null => {
  const lines = content.replace(/^﻿/, '').split('\n')
  if (lines[0]?.trim() !== '---') {
    return null
  }
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (close < 0) {
    return null
  }

  const scalars: Record<string, string> = {}
  const nested: Record<string, Record<string, string>> = {}
  let key: string | null = null

  for (const line of lines.slice(1, close)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      continue
    }
    const indented = /^[ \t]/.test(line)
    if (!indented) {
      const entry = KEY_LINE.exec(line)
      if (entry == null) {
        key = null
        continue
      }
      key = entry[1]!
      const value = entry[2]!.trim()
      scalars[key] = BLOCK_SCALAR.test(value) ? '' : unquote(value)
      continue
    }
    if (key == null) {
      continue
    }
    // An indented `k: v` under a key with no value of its own is a nested mapping
    // (`metadata:`); anything else is a folded continuation of the value above it.
    const child = scalars[key] === '' ? NESTED_LINE.exec(line) : null
    if (child != null) {
      const own = nested[key] ?? (nested[key] = {})
      own[child[1]!] = unquote(child[2]!)
      continue
    }
    scalars[key] = `${scalars[key] ?? ''} ${line.trim()}`.trim()
  }

  return { scalars, nested }
}

/** Read a scalar as a list, accepting both `[a, b]` and a folded `- a - b` block. */
const toList = (value: string | undefined): string[] | undefined => {
  if (value == null || value.trim() === '') {
    return undefined
  }
  const trimmed = value.trim()
  const inner = trimmed.startsWith('[') && trimmed.endsWith(']')
    ? trimmed.slice(1, -1)
    : trimmed
  const items = inner
    .split(/[,\n]|\s+-\s+/)
    .map(part => unquote(part.replace(/^-\s*/, '')))
    .filter(part => part !== '')

  return items.length > 0 ? items : undefined
}

/** The directory a `.../<name>/SKILL.md` path names. */
export const skillDirName = (path: string): string => {
  const parts = path.split('/').filter(part => part !== '' && part !== '.')
  return parts.length >= 2 ? parts[parts.length - 2]! : ''
}

/**
 * Turn one SKILL.md into a {@link ProjectSkill}, or `null` if it is not a valid one.
 *
 * **Never throws.** This runs while a system prompt is being composed, where the only
 * acceptable failure mode is a smaller prompt: a project is free to keep drafts, notes
 * and half-written files in its skills directory, and none of them may take down the
 * model call. An invalid file is simply not a skill the model gets told about.
 *
 * The directory-name check is the standard's, not ours: the name in the frontmatter is
 * how everything else addresses the skill, so a file claiming a name its directory does
 * not carry would be unreachable by the very tool that reads it.
 */
export const parseSkillFile = (path: string, content: string): ProjectSkill | null => {
  const parsed = parseSkillFrontmatter(content)
  if (parsed == null) {
    return null
  }
  const { scalars, nested } = parsed

  const name = scalars.name ?? ''
  if (!SKILL_NAME_PATTERN.test(name) || name !== skillDirName(path)) {
    return null
  }

  const description = (scalars.description ?? '').trim()
  if (description === '' || description.length > MAX_SKILL_DESCRIPTION) {
    return null
  }

  const skill: ProjectSkill = { name, description, body: stripMeta(content), path }
  const license = scalars.license?.trim()
  if (license != null && license !== '') {
    skill.license = license
  }
  const compatibility = scalars.compatibility?.trim()
  if (compatibility != null && compatibility !== '') {
    skill.compatibility = compatibility
  }
  const allowedTools = toList(scalars['allowed-tools'])
  if (allowedTools != null) {
    skill.allowedTools = allowedTools
  }
  if (nested.metadata != null) {
    skill.metadata = nested.metadata
  }

  return skill
}
