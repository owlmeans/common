import {
  ConversionStatus, STORY_BATCH_LIVE, STORY_BATCH_STALLED, StoryBatchStatus, conversionStageHelper,
  type ConnectFeedEntry, type ConversionStage,
} from '@owlmeans/viable-common'
import { STORY_PAGE_SIZE } from '../../../../consts.js'
import { BATCH_STALLED_WORDS, DRAFT_CAP } from '../../../consts.local.js'
import { feedToolHelper } from '../../../feed.js'
import { BATCH_STORY_PENDING, LOCAL_ORIGIN, NARRATIVE_CAP, WARNING_CAP } from './consts.js'
import { shapeHelper } from './shape.js'
import type { Presenter, WorkPresenters } from './types.js'

export const createWorkPresenters = (): WorkPresenters => {
  const {
    isRecord, record, records, text, required, texts, textOrTexts, number, flag, phrase, phrases, nonEmpty, compact,
  } = shapeHelper

  /**
   * The record a write wraps under `key` — `{ project: status }` around a status that itself has a
   * `project` — or the result itself where it IS that record.
   */
  const within = (structured: unknown, key: string): Record<string, unknown> => {
    const outer = record(structured)
    const inner = record(outer[key])

    return isRecord(inner[key]) ? inner : outer
  }

  /** What a call named, where the result does not repeat it. */
  const projectIdOf = (value: Record<string, unknown>, args: Record<string, unknown>): string =>
    text(value.projectId) ?? required(args.projectId)

  /** A question waiting on a person — `answer_question` takes its id; nothing when there is none. */
  const inquiryOf = (value: unknown): Record<string, unknown> | undefined => {
    const inquiry = record(value)
    const questionId = text(inquiry.id)
    if (questionId == null) return undefined
    const options = records(inquiry.options).map(option => compact({
      value: required(option.value), label: required(option.label), description: text(option.description),
    }))

    return compact({
      questionId,
      kind: required(inquiry.kind),
      question: text(inquiry.question, NARRATIVE_CAP) ?? '',
      context: text(inquiry.context, NARRATIVE_CAP),
      options: nonEmpty(options),
      multiple: flag(inquiry.multiple),
      allowText: flag(inquiry.allowText),
      default: textOrTexts(inquiry.default),
    })
  }

  /** A run as a status carries it: its id kept — `pipeline_status` and `resume_pipeline` take it. */
  const runOf = (value: unknown): Record<string, unknown> | undefined => {
    const run = record(value)
    const runId = text(run.runId)
    if (runId == null) return undefined

    return compact({
      runId,
      pipeline: required(run.pipeline),
      status: required(run.status),
      step: text(run.step),
      completed: texts(run.completed),
      pending: texts(run.pending),
      warnings: nonEmpty(phrases(run.warnings)),
      error: phrase(run.error),
    })
  }

  /** A workload — never its record id; its warnings phrased as the text result phrases them. */
  const slotOf = (value: unknown): Record<string, unknown> => {
    const slot = record(value)

    return compact({
      projectId: text(slot.projectId),
      // A record written before `kind` existed is an ephemeral preview workload.
      kind: text(slot.kind) ?? 'ephemeral',
      status: required(slot.status),
      slug: text(slot.slug),
      host: text(slot.host),
      initialized: flag(slot.initialized),
      warnings: nonEmpty(phrases([slot.lastError, slot.buildWarning, slot.backendWarning])),
    })
  }

  /** The agent lock — not when it was taken, nor which story card a stop was filed against. */
  const agentOf = (value: unknown): Record<string, unknown> => {
    const lock = record(value)

    return compact({
      locked: lock.locked === true,
      task: text(lock.task),
      stopping: lock.stopping === true ? true : undefined,
      stopScope: text(lock.stopScope),
      steerable: lock.steerable === true ? true : undefined,
    })
  }

  const projectRefOf = (value: unknown): Record<string, unknown> => {
    const project = record(value)

    return compact({
      id: required(project.id),
      name: required(project.name),
      slug: text(project.alias) ?? required(project.slug),
      status: text(project.status),
    })
  }

  /** A story card — its code, narrative, flow status and the flags the board shows. */
  const storyOf = (value: unknown): Record<string, unknown> => {
    const card = record(value)
    const fields = record(card.fields)

    return compact({
      id: required(card.id),
      code: text(card.code),
      title: text(card.title, NARRATIVE_CAP) ?? '',
      status: text(card.status),
      intrinsic: text(card.intrinsic),
      area: text(fields.area),
      primary: isRecord(card.fields) ? fields.primary === true : undefined,
      landing: fields.landing === true ? true : undefined,
      warning: phrase(fields.warning),
    })
  }

  const stackOf = (value: unknown): Record<string, unknown> | undefined => {
    const stack = record(value)
    const label = text(stack.label)

    return label == null ? undefined : compact({ label, language: text(stack.language), framework: text(stack.framework) })
  }

  /** A stage's estimate as a person weighs it: the stage, the money, whether it is theirs to perform. */
  const estimateOf = (value: unknown): Record<string, unknown> | undefined => {
    const estimate = record(value)
    const stage = text(estimate.stage)
    const usd = number(estimate.usd)

    return stage == null || usd == null ? undefined : { stage, usd, delegated: estimate.delegated === true }
  }

  /** One feed entry as one line a person reads (its time of day included), and the handles it names. */
  const entryOf = (value: unknown, withProject: boolean): Record<string, unknown> => {
    const entry = record(value)
    const data = record(entry.data)
    const kind = required(entry.kind)
    const line = (): string => {
      try {
        return feedToolHelper.renderEntry({ ...entry, kind, at: required(entry.at), data } as unknown as ConnectFeedEntry)
      } catch {
        return kind
      }
    }

    return compact({
      kind,
      summary: line(),
      projectId: withProject ? text(entry.projectId) : undefined,
      storyId: text(entry.storyId),
      code: text(data.code),
      status: text(data.status),
      path: text(data.path),
      event: text(data.event),
    })
  }

  const feedOf = (value: Record<string, unknown>, withProject: boolean): Record<string, unknown> => ({
    cursor: required(value.cursor),
    gap: value.gap === true,
    entries: records(value.entries).map(entry => entryOf(entry, withProject)),
  })

  const capabilitiesOf = (value: unknown): Record<string, boolean> =>
    Object.fromEntries(Object.entries(record(value)).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'))

  const serviceOf = (value: unknown): { configured: boolean, reachable: boolean, address?: string } => {
    const service = record(value)

    return compact({
      configured: service.configured === true, reachable: service.reachable === true, address: text(service.redacted),
    })
  }

  const localUrl = (port: number | undefined): string | undefined => port != null ? `${LOCAL_ORIGIN}${port}` : undefined

  const blueprints: Presenter = structured => {
    const registry = record(structured)

    return {
      defaultBlueprintId: required(registry.defaultBlueprintId),
      blueprints: records(registry.blueprints).map(blueprint => ({
        id: required(blueprint.id),
        title: required(blueprint.title),
        language: required(blueprint.language),
        runtime: required(blueprint.runtime),
        framework: required(blueprint.framework),
        capabilities: capabilitiesOf(blueprint.capabilities),
        cases: records(blueprint.cases).map(entry => compact({
          id: required(entry.id),
          title: required(entry.title),
          description: required(entry.description),
          tenancy: required(entry.tenancy),
          capabilities: capabilitiesOf(entry.capabilities),
          categoryKind: text(entry.categoryKind),
          categories: records(entry.categories).map(category => compact({
            id: required(category.id),
            title: required(category.title),
            description: required(category.description),
            aliases: nonEmpty(texts(category.aliases)),
            records: nonEmpty(texts(category.records)),
          })),
          planningResources: nonEmpty(texts(entry.planningResources)),
          botPlatforms: nonEmpty(texts(entry.botPlatforms)),
        })),
      })),
    }
  }

  const projectStatus: Presenter = structured => {
    const status = within(structured, 'project')
    const project = record(status.project)
    const production = record(status.production)

    return compact({
      project: compact({
        id: required(project.id),
        name: required(project.name),
        slug: text(project.alias) ?? required(project.slug),
        status: text(project.status),
        intrinsic: text(project.intrinsic),
        // The drafted brief, because confirm_project accepts edits to exactly these fields.
        description: text(project.description, DRAFT_CAP),
        specification: text(project.specification, DRAFT_CAP),
        vision: text(project.vision, DRAFT_CAP),
        designSystem: text(project.designSystem, DRAFT_CAP),
      }),
      slot: isRecord(status.slot) ? slotOf(status.slot) : undefined,
      production: isRecord(status.production)
        ? compact({ status: required(production.status), host: text(production.host) })
        : undefined,
      agent: agentOf(status.agent),
      run: runOf(status.run),
      waitingFor: text(status.waitingFor),
      question: inquiryOf(status.pendingInquiry),
      local: flag(status.local),
    })
  }

  const projectList: Presenter = structured => {
    const projects = records(record(structured).projects).map(projectRefOf)

    return { total: projects.length, projects }
  }

  const projectDeleted: Presenter = structured => ({ deleted: true, project: projectRefOf(record(structured).project) })

  const kits: Presenter = (structured, args) => {
    const result = record(structured)

    return {
      projectId: projectIdOf(result, args),
      kits: records(result.kits).map(kit => {
        const container = record(kit.container)

        return {
          id: required(kit.id),
          kind: required(kit.kind),
          title: required(kit.title),
          purpose: required(kit.purpose),
          container: { key: required(container.key), label: required(container.label) },
          types: records(kit.types).map(type => ({
            key: required(type.key), label: required(type.label), flow: required(type.flow),
          })),
          flows: records(kit.flows).map(flow => ({
            key: required(flow.key),
            label: required(flow.label),
            statuses: records(flow.statuses).map(status => ({
              key: required(status.key), label: required(status.label), intrinsic: required(status.intrinsic),
            })),
          })),
        }
      }),
    }
  }

  const kitApply: Presenter = (structured, args) => {
    const answer = record(structured)
    const result = record(answer.result)

    return {
      projectId: projectIdOf(answer, args),
      kit: text(answer.kit) ?? required(args.kit),
      applied: texts(result.applied),
      skipped: texts(result.skipped),
      warnings: phrases(result.warnings),
    }
  }

  const pageOf = (structured: object, args: Record<string, unknown>, paged: boolean): Record<string, unknown> => {
    const list = record(structured)
    const stories = records(list.items).map(storyOf)
    const page = number(list.page) ?? (paged ? number(args.page) : undefined) ?? 0
    const size = number(list.size) ?? (paged ? number(args.size) : undefined) ?? STORY_PAGE_SIZE
    const total = number(list.total) ?? stories.length

    return compact({
      total,
      page,
      nextPage: paged && size > 0 && (page + 1) * size < total ? page + 1 : undefined,
      stories,
    })
  }

  const storyPage: Presenter = (structured, args) => pageOf(structured, args, true)

  const storySearch: Presenter = (structured, args) => pageOf(structured, args, false)

  const storyCard: Presenter = structured => {
    const value = record(structured)
    // A create answers its transition when the card has not landed yet: the card's id and the
    // narrative it was created with are all it says.
    if (typeof value.card === 'string' && typeof value.title !== 'string') {
      const changes = record(value.changes)

      return {
        story: compact({
          id: value.card, code: text(changes.code), title: text(changes.title, NARRATIVE_CAP) ?? '', status: text(value.to),
        }),
      }
    }

    return { story: storyOf(value) }
  }

  const storyStatus: Presenter = (structured, args) => {
    const outer = record(structured)
    const status = within(outer, 'story')
    const story = record(status.story)

    return compact({
      projectId: projectIdOf(status, args),
      story: compact({
        id: required(story.id),
        code: text(story.code),
        title: text(story.title, NARRATIVE_CAP) ?? '',
        status: text(story.status),
        intrinsic: text(story.intrinsic),
        warning: phrase(story.warning),
        // Read off the card the tool holds: developing it also replaces the guest-home sketch.
        landing: outer.landing === true ? true : undefined,
      }),
      run: runOf(status.run),
      waitingFor: text(status.waitingFor),
      question: inquiryOf(status.pendingInquiry),
    })
  }

  const storyBatch: Presenter = (structured, args) => {
    const outer = record(structured)
    const view = record(outer.batch)
    const projectId = text(view.projectId) ?? projectIdOf(outer, args)
    // `null`: no batch has run on the project.
    if (!isRecord(outer.batch)) return { projectId }

    const codes = record(view.codes)
    const outcomes = record(view.outcomes)
    const ordering = record(view.ordering)
    const reasons = record(ordering.reasons)
    const status = required(view.status)
    const live = (STORY_BATCH_LIVE as readonly string[]).includes(status)
    const current = text(view.current)
    const ids = texts(view.stories)
    const refOf = (id: string): Record<string, unknown> => compact({ id, code: text(codes[id]) })
    const stateOf = (id: string): string => text(outcomes[id]) ?? (id === current
      ? live ? BATCH_STORY_PENDING.current : BATCH_STORY_PENDING.currentSettled
      : live ? BATCH_STORY_PENDING.queued : BATCH_STORY_PENDING.unreached)
    const reason = text(view.reason)
    const stopped = text(outer.stopped)

    return compact({
      projectId,
      batch: compact({
        kind: required(view.kind),
        status,
        orderedBy: text(ordering.source),
        stories: ids.map(id => compact({ ...refOf(id), state: stateOf(id), reason: text(reasons[id], WARNING_CAP) })),
        current: current != null ? refOf(current) : undefined,
        finished: Object.values(outcomes).filter(outcome => typeof outcome === 'string').length,
        total: ids.length,
        halted: status === StoryBatchStatus.Halted
          ? reason === STORY_BATCH_STALLED ? BATCH_STALLED_WORDS : phrase(reason)
          : undefined,
      }),
      stopped: stopped != null ? refOf(stopped) : undefined,
    })
  }

  // The queued message's own id is dropped: no tool takes it.
  const steer: Presenter = (structured, args) => {
    const result = record(structured)

    return { projectId: projectIdOf(result, args), queued: result.queued === true }
  }

  const stop: Presenter = (structured, args) => {
    const result = record(structured)

    return { projectId: projectIdOf(result, args), agent: agentOf(result.lock) }
  }

  const pipeline: Presenter = structured => {
    const outer = record(structured)
    // Wrapped as `{ pipeline: state }`; the state's own `pipeline` is the pipeline's NAME.
    const state = isRecord(outer.pipeline) ? record(outer.pipeline) : outer

    return compact({
      run: compact({
        runId: required(state.runId),
        pipeline: required(state.pipeline),
        status: required(state.status),
        step: text(state.step),
        completed: texts(state.completed),
        pending: texts(state.pending),
        warnings: phrases(state.warnings),
        failedAt: text(state.failedAt),
        error: phrase(state.error),
        note: text(state.note, WARNING_CAP),
        attempts: number(state.attempts),
      }),
      waitingFor: text(state.waitingFor),
      question: inquiryOf(state.pendingInquiry),
    })
  }

  const convertCheck: Presenter = (structured, args) => {
    const check = record(structured)

    return compact({
      projectId: projectIdOf(check, args),
      verdict: required(check.verdict),
      reasons: texts(check.reasons),
      stack: stackOf(check.stack),
      architecture: text(check.architecture),
      shape: required(check.shape),
      monorepo: check.monorepo === true,
      unlinked: texts(check.unlinked),
      files: number(check.files) ?? 0,
      bytes: number(check.bytes) ?? 0,
      bulk: number(check.bulk) ?? 0,
      estimate: estimateOf(check.estimate),
    })
  }

  const conversion: Presenter = (structured, args) => {
    const outer = record(structured)
    const view = isRecord(outer.conversion) ? record(outer.conversion) : outer
    const stage = required(view.stage)
    const status = required(view.status)
    const estimates = records(view.estimates)
    const band = record(view.storyEstimate)
    const minUsd = number(band.minUsd)
    const maxUsd = number(band.maxUsd)

    return compact({
      projectId: projectIdOf(view, args),
      stage,
      status,
      decision: text(view.decision),
      nextDecision: status === ConversionStatus.Awaiting
        ? conversionStageHelper.decisionFor(stage as ConversionStage)
        : undefined,
      verdict: text(view.verdict),
      stack: stackOf(view.stack),
      targetStack: stackOf(view.targetStack),
      architecture: text(view.architecture),
      estimate: estimateOf(estimates[estimates.length - 1]),
      storyEstimate: minUsd != null && maxUsd != null
        ? { minUsd, maxUsd, stories: records(band.perStory).length }
        : undefined,
      originState: text(view.originState),
      assumptions: number(view.assumptions) ?? 0,
      // Kept: pipeline_status reads the stage's run by it.
      runId: text(view.runId),
      waitingFor: text(view.waitingFor),
      question: inquiryOf(view.pendingInquiry),
      error: phrase(view.lastError),
    })
  }

  const question: Presenter = structured => {
    const questionId = text(record(structured).questionId)

    return compact({ asked: questionId != null, questionId })
  }

  const activity: Presenter = (structured, args) => {
    const page = record(structured)

    return { projectId: projectIdOf(page, args), ...feedOf(page, false) }
  }

  // An organization notice names the project it is about; a project feed's entries are all its own.
  const notifications: Presenter = structured => feedOf(record(structured), true)

  const fileChanges: Presenter = (structured, args) => {
    const page = record(structured)

    return { projectId: projectIdOf(page, args), ...feedOf(page, false), watching: page.watching === true }
  }

  const intent: Presenter = structured => ({ prompt: required(record(structured).prompt) })

  const localStatus: Presenter = structured => {
    const result = record(structured)
    const env = record(result.env)
    const run = record(result.running)
    const services = record(env.services)
    const missing = texts(env.missing)
    const running = run.running === true
    const ports = compact({ api: number(run.api), web: number(run.web), worker: number(run.worker) })

    return compact({
      configured: missing.length < 1,
      missing,
      services: isRecord(env.services) ? { database: services.db === true, queue: services.valkey === true } : undefined,
      running,
      ready: flag(run.ready),
      phase: text(run.phase),
      reason: text(run.reason, WARNING_CAP),
      appUrl: running ? localUrl(ports.web) : undefined,
      apiUrl: running ? localUrl(ports.api) : undefined,
      ports: Object.keys(ports).length > 0 ? ports : undefined,
    })
  }

  const runLocal: Presenter = structured => {
    const result = record(structured)
    const ports = compact({ api: number(result.api), web: number(result.web), worker: number(result.worker) })

    return compact({
      appUrl: localUrl(ports.web),
      apiUrl: localUrl(ports.api),
      ports,
      error: phrase(result.error),
      buildError: phrase(result.buildError),
    })
  }

  const setupReport: Presenter = structured => {
    const report = record(structured)
    const tools = record(report.tools)
    const database = serviceOf(report.database)
    const queue = serviceOf(report.queue)
    const needsWorker = report.needsWorker === true

    return {
      needsWorker,
      database,
      queue,
      tools: { bun: tools.bun === true, git: tools.git === true, docker: tools.docker === true },
      platform: required(report.platform),
      envIgnored: report.envIgnored === true,
      // What run_local still waits for — the same rule the setup guide says it by.
      missing: [...(database.reachable ? [] : ['database']), ...(needsWorker && !queue.reachable ? ['queue'] : [])],
    }
  }

  const slots: Presenter = structured => {
    const list = records(record(structured).slots).map(slotOf)

    return { total: list.length, slots: list }
  }

  return {
    blueprints, projectStatus, projectList, projectDeleted, kits, kitApply, storyPage, storySearch, storyCard,
    storyStatus, storyBatch, steer, stop, pipeline, convertCheck, conversion, question, activity, notifications,
    fileChanges, intent, localStatus, runLocal, setupReport, slots,
  }
}

export const workPresenters = createWorkPresenters()
