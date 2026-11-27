import { presentReadHelper as read } from './read.js'
import type { StructurePresentHelper } from './types.js'

export const createStructurePresentHelper = (): StructurePresentHelper => {
  /**
   * A choice's keys as the output names them — each only where the choice names it, in the tools' words: the
   * wire's case is the `blueprint`, its category the `case`; the stack (the wire's blueprint) is unsaid while one.
   */
  const choiceOf = (value: unknown): Record<string, unknown> => {
    const choice = read.record(value)
    const tenancy = read.recordOrNull(choice.tenancy)
    const platforms = read.texts(choice.botPlatforms)

    return {
      blueprint: read.maybeText(choice.case),
      case: read.maybeText(choice.category),
      botPlatforms: platforms.length > 0 ? platforms : undefined,
      tenancy: tenancy != null ? { users: read.flag(tenancy.users), operators: read.flag(tenancy.operators) } : undefined,
    }
  }

  const listOf = (value: unknown): string[] | undefined => {
    const items = read.texts(value)

    return items.length > 0 ? items : undefined
  }

  const changeOf = (change: Record<string, unknown>): string => {
    const from = read.maybeText(change.from)
    const to = read.maybeText(change.to)

    return `${read.text(change.op)} ${read.text(change.part)}${from != null ? `: ${from}` : ''}${to != null ? ` → ${to}` : ''}`
  }

  const view = read.total((structured, args) => {
    const structure = read.record(structured.structure)
    const suggestion = read.recordOrNull(structured.suggestion)
    const proposal = read.recordOrNull(structured.proposal)

    return read.compact({
      projectId: read.project(structured, args),
      origin: read.text(structured.origin, 'creation'),
      status: read.text(structured.status),
      revision: read.count(structured.revision),
      ...read.compact(choiceOf(structured.choice)),
      suggestion: suggestion != null
        ? read.compact({ ...choiceOf(suggestion.choice), rationale: read.text(suggestion.rationale) })
        : undefined,
      areas: read.records(structure.areas).map(area => read.compact({
        key: read.text(area.key),
        kind: read.text(area.kind),
        segment: read.text(area.segment),
        label: read.maybeText(area.label),
      })),
      parts: read.records(structure.parts).map(part => read.compact({
        name: read.text(part.name),
        kind: read.text(part.kind),
        purpose: read.text(part.purpose),
        dependsOn: read.texts(part.dependsOn),
        mount: typeof part.mount === 'string' ? part.mount : undefined,
        index: read.maybeCount(part.index),
        areas: listOf(part.areas),
        queues: listOf(part.queues),
      })),
      issues: read.records(structured.issues).map(issue => read.text(issue.message, read.text(issue.code))),
      advice: proposal != null
        ? { rationale: read.text(proposal.rationale), changes: read.records(proposal.changes).map(changeOf) }
        : undefined,
      ideas: read.texts(structured.ideas).length,
      kinds: read.texts(structured.kinds),
      error: read.warning(structured.lastError) ?? read.warning(structured.refusal),
      readonly: structured.readonly === true ? true : undefined,
    })
  })

  return { view }
}

export const structurePresentHelper = createStructurePresentHelper()
