import { storyDesignHelper } from '../design/story.js'
import {
  REQUESTED_STORY_CAP, REQUIREMENT_PARTS, REQUIREMENT_PROMPT_PREFIX, REQUIREMENT_STORY_PREFIX,
  REQUIREMENTS_SECTION_CAPABILITIES, REQUIREMENTS_SECTION_EXPERIENCE, REQUIREMENTS_SECTION_PLATFORM,
  REQUIREMENTS_SECTION_RULES, REQUIREMENTS_SECTION_TECHNICAL, RequirementKind, RequirementPart, StoryKind,
} from './consts.js'
import {
  REQUIREMENT_PART_TITLES, REQUIREMENTS_CARD_INTRO, REQUIREMENTS_CARD_TITLE, REQUIREMENTS_FILE_INTRO,
  REQUIREMENTS_FILE_TITLE,
} from './requirements/consts.js'
import type { RequirementsFileStory, RequirementsHelper } from './requirements/types.js'
import type {
  MergedStoryDraft, RequestedStoryDraft, RequirementPackage, RequirementsDocument, StatedRequirement,
} from './types.js'

export const createRequirementsHelper = (): RequirementsHelper => {
  /** Code-unit order — never a locale compare, whose answer depends on the machine. */
  const byText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

  /** One line of markdown out of any text: a newline inside a list item would end it. */
  const oneLine = (text: string | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim()

  /** Case and whitespace collapsed, so "the same story twice" is recognised as such. */
  const canonical = (story: string): string => story.trim().replace(/\s+/g, ' ').toLowerCase()

  const prefixRank = (prefix: string): number =>
    prefix === REQUIREMENT_PROMPT_PREFIX ? 0 : prefix === REQUIREMENT_STORY_PREFIX ? 1 : 2

  const compareIds = (a: string, b: string): number => {
    const left = /^([A-Za-z]*)(\d*)$/.exec(a)
    const right = /^([A-Za-z]*)(\d*)$/.exec(b)
    if (left == null || right == null) {
      return byText(a, b)
    }

    return prefixRank(left[1]!) - prefixRank(right[1]!)
      || byText(left[1]!, right[1]!)
      || (left[2] === '' || right[2] === '' ? 0 : Number(left[2]) - Number(right[2]))
      || byText(a, b)
  }

  const sorted = (items: readonly StatedRequirement[]): StatedRequirement[] =>
    [...items].sort((a, b) => compareIds(a.id, b.id))

  const textOf = (item: StatedRequirement, part: RequirementPart): string => oneLine(item.parts?.[part])

  const uniqueParts = (parts: readonly RequirementPart[]): RequirementPart[] => [...new Set(parts)]

  const packagesOf = (packages: RequirementPackage[] | undefined): string =>
    (packages ?? []).map(entry => `${oneLine(entry.name)} (${entry.side})`).join(', ')

  /** Every `@owlmeans/<name>` read as `<name>`, so no prompt plugin mistakes a card for a package mention. */
  const unscoped = (text: string): string => text.replace(/@owlmeans\//g, '')

  const partsOf = (items: readonly StatedRequirement[], parts: readonly RequirementPart[]): StatedRequirement[] =>
    sorted(items.filter(item => parts.some(part => textOf(item, part) !== '')))

  const card = (items: readonly StatedRequirement[], parts: readonly RequirementPart[]): string => {
    const wanted = uniqueParts(parts)
    const selected = partsOf(items, wanted)
    if (selected.length === 0) {
      return ''
    }

    const lines = [`# ${REQUIREMENTS_CARD_TITLE}`, REQUIREMENTS_CARD_INTRO]
    for (const part of wanted) {
      const rows = selected.filter(item => textOf(item, part) !== '')
      if (rows.length === 0) {
        continue
      }
      lines.push('', `## ${REQUIREMENT_PART_TITLES[part]}`)
      for (const item of rows) {
        const packages = part === RequirementPart.Tech ? packagesOf(item.packages) : ''
        lines.push(
          `- ${item.id}: ${textOf(item, part)} (requested as: "${oneLine(item.quote)}")`
          + (packages !== '' ? ` — npm packages: ${packages}` : ''),
        )
      }
    }

    return unscoped(lines.join('\n'))
  }

  const specificationLine = (item: StatedRequirement, text: string): string =>
    `- **${item.id}** — ${text} (“${oneLine(item.quote)}”)`

  const specificationSections = (items: readonly StatedRequirement[]): string => {
    const ordered = sorted(items)
    const sections: Array<[string, string[]]> = [
      [REQUIREMENTS_SECTION_CAPABILITIES, ordered
        .filter(item => item.kind === RequirementKind.Story)
        .map(item => specificationLine(item, oneLine(item.statement)))],
      [REQUIREMENTS_SECTION_RULES, ordered
        .filter(item => textOf(item, RequirementPart.Ba) !== '')
        .map(item => specificationLine(item, textOf(item, RequirementPart.Ba)))],
      [REQUIREMENTS_SECTION_TECHNICAL, ordered
        .filter(item => textOf(item, RequirementPart.Tech) !== '')
        .map(item => {
          const packages = packagesOf(item.packages)

          return specificationLine(
            item, textOf(item, RequirementPart.Tech) + (packages !== '' ? ` — npm packages: ${packages}` : ''),
          )
        })],
      [REQUIREMENTS_SECTION_EXPERIENCE, ordered.flatMap(item => [
        ...(textOf(item, RequirementPart.Ux) !== ''
          ? [specificationLine(item, `UX: ${textOf(item, RequirementPart.Ux)}`)] : []),
        ...(textOf(item, RequirementPart.Ui) !== ''
          ? [specificationLine(item, `UI: ${textOf(item, RequirementPart.Ui)}`)] : []),
      ])],
      [REQUIREMENTS_SECTION_PLATFORM, ordered
        .filter(item => item.kind === RequirementKind.Platform || item.kind === RequirementKind.Unsupported)
        .map(item => {
          const note = oneLine(item.note)

          return specificationLine(item, oneLine(item.statement) + (note !== '' ? ` — ${note}` : ''))
        })],
    ]
    const rendered = sections
      .filter(([, lines]) => lines.length > 0)
      .map(([title, lines]) => [`## ${title}`, '', ...lines].join('\n'))

    return rendered.length > 0 ? `\n\n${rendered.join('\n\n')}` : ''
  }

  const idsInSpecification = (spec: string): Set<string> =>
    new Set([...spec.matchAll(/\*\*([RS]\d+)\*\*/g)].map(match => match[1]!))

  const retained = (items: readonly StatedRequirement[], spec: string): StatedRequirement[] => {
    const marked = idsInSpecification(spec)

    return sorted(items.filter(item => marked.has(item.id)))
  }

  const sliceFor = (doc: RequirementsDocument, code: string): StatedRequirement[] =>
    sorted(doc.items
      .filter(item => item.stories?.includes(code) === true)
      .map(({ stories: _stories, ...item }) => item))

  const frontmatterOf = (items: readonly StatedRequirement[]): Partial<Record<RequirementPart, string[]>> => {
    const ordered = sorted(items)
    const ids: Partial<Record<RequirementPart, string[]>> = {}
    for (const part of REQUIREMENT_PARTS) {
      const of = ordered.filter(item => textOf(item, part) !== '').map(item => item.id)
      if (of.length > 0) {
        ids[part] = of
      }
    }

    return ids
  }

  const fileEntry = (item: StatedRequirement): string[] => {
    const lines = [
      `### ${item.id}. ${oneLine(item.statement)}`,
      '',
      `- Kind: ${item.kind}`,
      `- Requested as: “${oneLine(item.quote)}”`,
    ]
    for (const part of REQUIREMENT_PARTS) {
      if (textOf(item, part) !== '') {
        lines.push(`- ${REQUIREMENT_PART_TITLES[part]}: ${textOf(item, part)}`)
      }
    }
    const packages = packagesOf(item.packages)
    if (packages !== '') {
      lines.push(`- Packages: ${packages}`)
    }
    if (oneLine(item.note) !== '') {
      lines.push(`- Note: ${oneLine(item.note)}`)
    }
    if ((item.stories ?? []).length > 0) {
      lines.push(`- Stories: ${[...item.stories!].sort(byText).join(', ')}`)
    }

    return lines
  }

  const requirementsFile = (project: RequirementsDocument, stories: readonly RequirementsFileStory[]): string => {
    const blocks: string[] = [`# ${REQUIREMENTS_FILE_TITLE}\n\n${REQUIREMENTS_FILE_INTRO}`]

    if (project.items.length > 0) {
      const lines = ['## Project']
      for (const item of sorted(project.items)) {
        lines.push('', ...fileEntry(item))
      }
      const uncovered = [...(project.uncovered ?? [])].sort(compareIds)
      if (uncovered.length > 0) {
        lines.push('', `Not covered by any story yet: ${uncovered.join(', ')}.`)
      }
      blocks.push(lines.join('\n'))
    }

    for (const story of stories) {
      if (story.items.length === 0) {
        continue
      }
      const lines = [`## Story ${story.code}. ${oneLine(story.title)}`]
      for (const item of sorted(story.items)) {
        lines.push('', ...fileEntry(item))
      }
      blocks.push(lines.join('\n'))
    }

    if (blocks.length === 1) {
      blocks.push('No requirements were stated.')
    }

    return `${blocks.join('\n\n')}\n`
  }

  /** JSON with every object's keys sorted and `undefined` members left out — one text per value. */
  const canonicalJson = (value: unknown): string => {
    if (Array.isArray(value)) {
      return `[${value.map(canonicalJson).join(',')}]`
    }
    if (value != null && typeof value === 'object') {
      const record = value as Record<string, unknown>

      return `{${Object.keys(record).filter(key => record[key] !== undefined).sort(byText)
        .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
    }

    return JSON.stringify(value) ?? 'null'
  }

  const digest = (items: readonly StatedRequirement[]): string =>
    storyDesignHelper.designHash(canonicalJson(sorted(items)))

  const mergeRequested = (
    merged: readonly MergedStoryDraft[], requested: readonly RequestedStoryDraft[],
  ): MergedStoryDraft[] => {
    const result = [...merged]
    const flowCount = merged.filter(entry => entry.kind === StoryKind.Flow).length
    const seen = new Set(merged.map(entry => canonical(entry.story)))
    let kept = 0

    for (const draft of requested) {
      if (kept >= REQUESTED_STORY_CAP) {
        break
      }
      const text = canonical(draft.story ?? '')
      // A requested story that repeats one the list already has is one develop run spent twice.
      if (text === '' || seen.has(text)) {
        continue
      }
      seen.add(text)
      kept += 1

      const anchor = draft.after != null ? Number(draft.after) : Number.NaN
      const after = flowCount > 0 && Number.isFinite(anchor)
        ? Math.min(Math.max(Math.trunc(anchor), 1), flowCount)
        : undefined
      const entry: MergedStoryDraft = {
        story: draft.story.trim(), area: draft.area, kind: StoryKind.Requested, ...(after != null ? { after } : {}),
      }

      // The group of flow story N ends where flow story N + 1 starts — or at the end of the list.
      let at = result.length
      if (after != null) {
        let flow = 0
        for (let index = 0; index < result.length; index += 1) {
          if (result[index]!.kind === StoryKind.Flow) {
            flow += 1
            if (flow === after + 1) {
              at = index
              break
            }
          }
        }
      }
      result.splice(at, 0, entry)
    }

    return result
  }

  return {
    compareIds, partsOf, card, specificationSections, idsInSpecification, retained, sliceFor, frontmatterOf,
    requirementsFile, digest, mergeRequested,
  }
}

export const requirementsHelper = createRequirementsHelper()
