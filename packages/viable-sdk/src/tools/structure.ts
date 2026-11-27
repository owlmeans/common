import { ApiStatusError, apiStatusHelper } from '@owlmeans/api'
import {
  ConnectStructureOrigin, ConnectStructureStatus, ConversionDecision, type CatalogueChoice, type ProjectStructure,
  type StructureChange,
} from '@owlmeans/viable-common'
import { NOT_FOUND } from '../api/consts.local.js'
import { refusalHelper } from './refusal.js'
import { STRUCTURE_IDEA_CAP, STRUCTURE_WORKING } from './structure/consts.local.js'
import type { StructureChoiceArgs, StructureToolHelper } from './structure/types.js'

export const createStructureToolHelper = (): StructureToolHelper => {
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : null

  /**
   * The tool's words are the wire's: the `blueprint` argument is the choice's `blueprint`, the `case` argument its
   * `case`; the stack (the choice's `stack`) is never sent while the platform runs one.
   */
  const choiceFrom = (args: Record<string, unknown>): CatalogueChoice => {
    const blueprint = text(args.blueprint)
    const caseId = text(args.case)
    const platforms = Array.isArray(args.bot_platforms)
      ? args.bot_platforms.filter((one): one is string => typeof one === 'string' && one !== '')
      : []
    const tenancy = args.tenancy as { users?: unknown, operators?: unknown } | undefined

    return {
      ...(blueprint != null ? { blueprint } : {}),
      ...(caseId != null ? { case: caseId } : {}),
      ...(platforms.length > 0 ? { botPlatforms: platforms } : {}),
      ...(tenancy != null && typeof tenancy.users === 'boolean' && typeof tenancy.operators === 'boolean'
        ? { tenancy: { users: tenancy.users, operators: tenancy.operators } }
        : {}),
    }
  }

  const choiceOf: StructureToolHelper['choiceOf'] = (args): StructureChoiceArgs => {
    const choice = choiceFrom(args)
    const review = args.review_structure === true

    return { choice, review, asked: review || Object.keys(choice).length > 0 }
  }

  const submitOf: StructureToolHelper['submitOf'] = args => {
    const choice = choiceFrom(args)
    const ideas = text(args.ideas)
    const structure = args.structure as ProjectStructure | undefined

    return {
      revision: args.revision as number,
      ...(Object.keys(choice).length > 0 ? { choice } : {}),
      ...(structure != null ? { structure } : {}),
      ...(args.advise === true ? { advise: true } : {}),
      ...(ideas != null ? { ideas } : {}),
      ...(args.confirm === true ? { confirm: true } : {}),
    }
  }

  const isAdvice: StructureToolHelper['isAdvice'] = body =>
    body.advise === true || (typeof body.ideas === 'string' && body.ideas.trim() !== '')

  /** A choice in the tool's words — the blueprint is the wire's case, the case its category; the one stack unsaid. */
  const choiceLine = (choice: CatalogueChoice): string => [
    `blueprint: ${choice.blueprint ?? 'auto'}`,
    ...(choice.case != null ? [`case: ${choice.case}`] : []),
    ...(choice.botPlatforms != null && choice.botPlatforms.length > 0 ? [`bot platforms: ${choice.botPlatforms.join(', ')}`] : []),
    ...(choice.tenancy != null
      ? [`tenancy: users ${choice.tenancy.users ? 'in organizations' : 'not split'}, operators ${choice.tenancy.operators ? 'in organizations' : 'not split'}`]
      : []),
  ].join(' · ')

  const partLines = (structure: ProjectStructure): string[] => structure.parts.map(part => '  ' + [
    `${part.name} (${part.kind})`,
    ...(part.mount != null ? [`at /${part.mount}`] : []),
    ...(part.areas != null && part.areas.length > 0 ? [`areas ${part.areas.join(', ')}`] : []),
    ...(part.queues != null && part.queues.length > 0 ? [`queues ${part.queues.join(', ')}`] : []),
    ...(part.dependsOn.length > 0 ? [`depends on ${part.dependsOn.join(', ')}`] : []),
  ].join(' · ') + (part.purpose !== '' ? ` — ${part.purpose}` : ''))

  const changeOf = (change: StructureChange): string =>
    `${change.op} ${change.part}${change.from != null ? `: ${change.from}` : ''}${change.to != null ? ` → ${change.to}` : ''}`

  const nextOf: StructureToolHelper['nextOf'] = view => {
    const project = `"projectId": "${view.projectId}"`
    const conversion = view.origin === ConnectStructureOrigin.Conversion
    if (STRUCTURE_WORKING.includes(view.status)) {
      return `project_structure { ${project} } again shortly — the platform is working on the structure`
    }
    switch (view.status) {
      case ConnectStructureStatus.Awaiting:
        if (view.readonly === true) {
          return `proceed_conversion { ${project}, "decision": "${ConversionDecision.Analyze}" } continues the conversion as it stands`
        }

        return conversion
          ? `update_project_structure { ${project}, "revision": ${view.revision}, "structure": … } keeps an edited`
            + ` structure; proceed_conversion { ${project}, "decision": "${ConversionDecision.Analyze}" } continues the conversion`
          : `update_project_structure { ${project}, "revision": ${view.revision} } continues to the specification with`
            + ' this structure — add structure or the choice to change it first, advise: true or ideas to ask for advice'
      case ConnectStructureStatus.Specifying:
        return `project_status { ${project} } until the specification is in, then confirm_project`
      case ConnectStructureStatus.Specified:
        return conversion
          ? `conversion_status { ${project} }`
          : `project_status { ${project} } — the structure is settled; project_apps lists the applications`
      case ConnectStructureStatus.Failed:
        return 'the structure step failed — retry it on the project\'s page in the OwlMeans web application, or'
          + ' delete_project and create the project again'
      default:
        return `project_structure { ${project} }`
    }
  }

  const renderStructure: StructureToolHelper['renderStructure'] = view => {
    const lines = [
      `Project structure of ${view.projectId} · ${view.origin} · ${view.status} · revision ${view.revision}`,
      choiceLine(view.choice),
    ]
    if (view.suggestion != null) {
      lines.push(`suggested instead: ${choiceLine(view.suggestion.choice)} — ${view.suggestion.rationale}`)
    }
    lines.push(`areas: ${view.structure.areas.map(area => `${area.key} (${area.kind}${area.segment !== '' ? `, /${area.segment}` : ''})`).join(', ')}`)
    lines.push('parts:', ...partLines(view.structure))
    if (view.issues.length > 0) {
      lines.push('issues:', ...view.issues.map(issue => `  - ${issue.message}`))
    }
    if (view.proposal != null) {
      lines.push(`advice: ${view.proposal.rationale}`)
      if (view.proposal.changes.length > 0) lines.push(`  changes: ${view.proposal.changes.map(changeOf).join('; ')}`)
    }
    if (view.ideas.length > 0) {
      const latest = view.ideas[view.ideas.length - 1]!
      lines.push(`ideas: ${view.ideas.length} — latest: "${latest.length > STRUCTURE_IDEA_CAP ? `${latest.slice(0, STRUCTURE_IDEA_CAP)}…` : latest}"`)
    }
    if (view.readonly === true) {
      lines.push('read-only: this conversion repairs a Viable project in place — the structure is the project\'s own, shown, never edited')
    } else {
      lines.push(`part kinds this platform takes beyond the stock ones: ${view.kinds.join(', ') || 'none'}`)
    }
    if (view.refusal != null && view.refusal !== '') lines.push(`refused: ${refusalHelper.refusalPhrase(view.refusal)}`)
    if (view.lastError != null && view.lastError !== '') lines.push(`error: ${refusalHelper.refusalPhrase(view.lastError)}`)
    if (view.status === ConnectStructureStatus.Awaiting && view.readonly !== true) {
      lines.push(`structure (edit it and send it back as update_project_structure's structure): ${JSON.stringify(view.structure)}`)
    }
    lines.push(`next: ${nextOf(view)}`)

    return lines.join('\n')
  }

  const routeMissing: StructureToolHelper['routeMissing'] = error => error instanceof ApiStatusError
    && apiStatusHelper.httpStatusOf(error) === NOT_FOUND
    && apiStatusHelper.incidentIdOf(error) == null

  return { choiceOf, submitOf, isAdvice, renderStructure, nextOf, routeMissing }
}

export const structureToolHelper = createStructureToolHelper()
