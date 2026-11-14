import { RESEARCH_LIMITS, SKILL_DESCRIPTION_CHARS, SKILL_NAME_PATTERN } from './consts.js'
import { SKILL_SECTIONS } from './skill/consts.js'
import type { SkillExpectation, SkillParts, SkillValidator, SkillValidatorOptions } from './skill/types.js'
import { packageEntryUtils } from './utils/entry.js'

export const createSkillValidator = (options: SkillValidatorOptions = {}): SkillValidator => {
  const maxChars = options.maxChars ?? RESEARCH_LIMITS.skillChars
  const sections = options.sections ?? SKILL_SECTIONS

  const unquote = (value: string): string => {
    const trimmed = value.trim()
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
      try {
        return JSON.parse(trimmed) as string
      } catch {
        return trimmed.slice(1, -1)
      }
    }
    if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) return trimmed.slice(1, -1).replace(/''/g, "'")
    return trimmed
  }

  const unwrap = (text: string): string => {
    const trimmed = text.trim()
    const fenced = /^```(?:markdown|md)?[ \t]*\n([\s\S]*)\n```$/.exec(trimmed)
    return fenced != null ? fenced[1]!.trim() : trimmed
  }

  const parts: SkillValidator['parts'] = text => {
    const lines = text.replace(/\r\n?/g, '\n').split('\n')
    if (lines[0]?.trim() !== '---') return null
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
    if (end < 0) return null
    const fields: Record<string, string> = {}
    const raw: Record<string, string> = {}
    for (let at = 1; at < end; at++) {
      const match = /^([A-Za-z][\w-]*):(.*)$/.exec(lines[at]!)
      if (match == null) continue
      const key = match[1]!
      const value = match[2]!.trim()
      raw[key] = value
      if (/^[>|][+-]?$/.test(value)) {
        // A block scalar: the indented lines below it, folded (`>`) or kept (`|`).
        const block: string[] = []
        while (at + 1 < end && /^\s+\S/.test(lines[at + 1]!)) block.push(lines[++at]!.trim())
        fields[key] = value.startsWith('>') ? block.join(' ') : block.join('\n')
        continue
      }
      fields[key] = unquote(value)
    }
    return { fields, raw, body: lines.slice(end + 1).join('\n').trim() }
  }

  /** The text of the first `##`/`###` section whose heading matches, up to the next heading of its level or above. */
  const sectionOf = (body: string, match: RegExp): string => {
    const lines = body.split('\n')
    let fenced = false
    let level = 0
    const kept: string[] = []
    for (const line of lines) {
      if (/^\s*```/.test(line)) fenced = !fenced
      const heading = fenced ? null : /^(#{2,3})\s+(.+?)\s*#*$/.exec(line)
      if (heading != null) {
        if (level > 0 && heading[1]!.length <= level) break
        if (level === 0 && match.test(heading[2]!.replace(/^[\d.)\s]+/, '').replace(/[:.\s]+$/, '').trim())) {
          level = heading[1]!.length
          continue
        }
      }
      if (level > 0) kept.push(line)
    }
    return kept.join('\n')
  }

  /** The code inside the body's fences. */
  const codeOf = (body: string): string => [...body.matchAll(/^\s*```[^\n]*\n([\s\S]*?)^\s*```/gm)].map(match => match[1]!).join('\n')

  /** The faults of a package skill against what its notes and manifest say. */
  const packageFaults = (body: string, expect: SkillExpectation): string[] => {
    const errors: string[] = []
    const name = expect.package
    const imports = sectionOf(body, /^import/i)
    if (expect.rootImport === true && !packageEntryUtils.importsRoot(name, imports)) {
      errors.push(`body: the "## Imports" section shows no import of the package root '${name}' — open it with the canonical root import (default or named; ESM and CommonJS) the notes' entry points give`)
    }
    // The names a reader binds the package to: what the skill imports it as, else its own name.
    const last = name.split('/').pop() ?? name
    const fallback = last.replace(/[^A-Za-z0-9_$]+(.)?/g, (_, next: string | undefined) => next?.toUpperCase() ?? '')
    const bindings = [...new Set([...packageEntryUtils.rootBindings(name, body), ...(/^[A-Za-z_$][\w$]*$/.test(fallback) ? [fallback] : [])])]
    const code = codeOf(body)
    for (const binding of bindings) {
      const id = binding.replace(/\$/g, '\\$')
      if (new RegExp(`[(,]\\s*${id}\\s*\\??\\s*:|\\(\\s*${id}\\s*\\)\\s*=>`).test(code)) {
        errors.push(`body: a code example takes \`${binding}\` as a function parameter — import it from '${name}' at the top of the example, as "## Imports" says; never pass the package in`)
      }
    }
    return errors
  }

  const validate: SkillValidator['validate'] = (text, skillName, expect) => {
    const errors: string[] = []
    const split = parts(text)
    if (split == null) {
      return { ok: false, errors: ['the file must open with a YAML frontmatter block between two `---` lines'], chars: text.length }
    }
    const name = split.fields.name
    const description = split.fields.description
    if (name == null || name === '') errors.push('frontmatter: `name` is missing')
    else {
      if (!SKILL_NAME_PATTERN.test(name)) errors.push(`frontmatter: \`name\` "${name}" must match ${SKILL_NAME_PATTERN.source}`)
      if (name !== skillName) errors.push(`frontmatter: \`name\` must be "${skillName}", not "${name}"`)
    }
    if (description == null || description.trim() === '') errors.push('frontmatter: `description` is missing')
    else {
      if (description.length > SKILL_DESCRIPTION_CHARS) {
        errors.push(`frontmatter: \`description\` is ${description.length} characters; at most ${SKILL_DESCRIPTION_CHARS}`)
      }
      const written = split.raw.description ?? ''
      if (!/^["'>|]/.test(written) && written.includes(': ')) {
        errors.push('frontmatter: an unquoted `description` containing ": " breaks the YAML — quote it')
      }
    }

    const headings = [...split.body.matchAll(/^#{2,3}\s+(.+?)\s*#*$/gm)]
      .map(match => match[1]!.replace(/^[\d.)\s]+/, '').replace(/[:.\s]+$/, '').trim())
    for (const section of sections) {
      if (!headings.some(heading => section.match.test(heading))) errors.push(`body: the "## ${section.title}" section is missing`)
    }
    if (split.body.split('\n').filter(line => /^\s*```/.test(line)).length % 2 !== 0) errors.push('body: a code fence is not closed')
    if (expect != null) errors.push(...packageFaults(split.body, expect))
    if (text.length > maxChars) errors.push(`size: ${text.length} characters; at most ${maxChars}`)

    return {
      ok: errors.length === 0, errors, chars: text.length,
      ...(name != null ? { name } : {}), ...(description != null ? { description } : {}),
    }
  }

  const normalize: SkillValidator['normalize'] = (text, skillName) => {
    const unwrapped = unwrap(text)
    const split: SkillParts = parts(unwrapped) ?? { fields: {}, raw: {}, body: unwrapped }
    const description = split.fields.description?.replace(/\s+/g, ' ').trim()
    return [
      '---',
      `name: ${skillName}`,
      ...(description != null && description !== '' ? [`description: ${JSON.stringify(description)}`] : []),
      '---',
      '',
      split.body,
      '',
    ].join('\n')
  }

  return { validate, normalize, parts }
}

export const skillValidator = createSkillValidator()
