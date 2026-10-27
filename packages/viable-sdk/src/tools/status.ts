import { ConnectWaitReason, ConversionDecision, ConversionStatus, STORY_BATCH_LIVE, STORY_BATCH_STALLED, StoryBatchKind, StoryBatchStatus, type ConnectPipelineState, type ConnectProjectStatus, type ConnectSlotView, type ConnectStoryStatus, type ConversionStatusView, type StoryBatchView, conversionStageHelper } from '@owlmeans/viable-common'
import { refusalHelper } from './refusal.js'
import { LANDING_NOTE } from './consts.js'
import { BATCH_OUTCOME_WORDS, BATCH_STALLED_WORDS } from './consts.local.js'
import type { StoryStatusExtra } from './types.js'
import type { StatusTextHelper } from './status/types.js'

export const createStatusTextHelper = (): StatusTextHelper => {
  const waitingNext = (
    waitingFor: ConnectWaitReason | undefined,
    inquiryId: string | undefined,
    fallback: string,
  ): string => {
    if (inquiryId != null) return `answer_question { "questionId": "${inquiryId}" }`
    switch (waitingFor) {
      case ConnectWaitReason.Person: return 'next_question'
      case ConnectWaitReason.ModelTask: return 'next_task'
      case ConnectWaitReason.LocalConnector: return 'session_status'
      case ConnectWaitReason.Environment: return 'local_setup_guide'
      default: return fallback
    }
  }

  const runLines = (run: ConnectProjectStatus['run'] | ConnectStoryStatus['run']): string[] => {
    if (run == null) return []
    const lines = [
      `run ${run.runId} · ${run.pipeline} · ${run.status}`
      + (run.step != null ? ` · step: ${run.step}` : ''),
      `steps: ${run.completed.length}/${run.completed.length + run.pending.length} completed`,
    ]
    if (run.error != null && run.error !== '') lines.push(`error: ${refusalHelper.refusalPhrase(run.error)}`)

    return lines
  }

  // What a person can do about the run holding the lock — said only while it applies.
  const controlLines = (agent: ConnectProjectStatus['agent']): string[] => {
    if (!agent.locked) return []
    if (agent.stopping === true) {
      return ['stop requested: the agent finishes its current step first; read project_status until it is idle']
    }

    return agent.steerable === true
      ? ['control: steer_agent adds a message to this run; stop_agent stops it']
      : []
  }

  const renderProjectStatus = (status: ConnectProjectStatus): string => {
    const lines = [
      `${status.project.name} (${status.project.alias}) · ${status.project.id}`,
      `project: ${status.project.status} (${status.project.intrinsic})`,
      status.slot == null
        ? 'slot: none'
        : `slot: ${status.slot.kind} · ${status.slot.status}`
          + (status.slot.host != null ? ` · ${status.slot.host}` : ''),
      `agent: ${status.agent.locked
        ? `${status.agent.stopping === true ? 'stopping' : 'busy'} (${status.agent.task ?? 'working'})`
        : 'idle'}`,
      ...controlLines(status.agent),
      ...runLines(status.run),
    ]
    if (status.pendingInquiry != null) lines.push(`question: ${status.pendingInquiry.question}`)
    for (const warning of [status.slot?.lastError, status.slot?.buildWarning, status.slot?.backendWarning]) {
      if (warning != null && warning !== '') lines.push(`warning: ${refusalHelper.refusalPhrase(warning)}`)
    }
    const fallback = status.agent.locked || status.run != null
      ? `project_status { "projectId": "${status.project.id}" }`
      : status.project.status === 'draft'
        ? `confirm_project { "projectId": "${status.project.id}" }`
        : 'list_stories'
    lines.push(`next: ${waitingNext(status.waitingFor, status.pendingInquiry?.id, fallback)}`)

    return lines.join('\n')
  }

  const renderSlot = (slot: ConnectSlotView): string => {
    const lines = [
      `${slot.kind} · ${slot.status}` + (slot.host != null ? ` · ${slot.host}` : '')
      + (slot.projectId != null ? ` · project ${slot.projectId}` : '') + ` · slot ${slot.id}`,
    ]
    for (const warning of [slot.lastError, slot.buildWarning, slot.backendWarning]) {
      if (warning != null && warning !== '') lines.push(`  warning: ${refusalHelper.refusalPhrase(warning)}`)
    }

    return lines.join('\n')
  }

  const renderStoryStatus = (status: ConnectStoryStatus, extra: StoryStatusExtra = {}): string => {
    const lines = [
      `${status.story.code} · ${status.story.title}`,
      `story: ${status.story.status} (${status.story.intrinsic})`,
      ...(extra.landing === true ? [LANDING_NOTE] : []),
      ...runLines(status.run),
    ]
    if (status.story.warning != null && status.story.warning !== '') {
      lines.push(`warning: ${refusalHelper.refusalPhrase(status.story.warning)}`)
    }
    if (status.pendingInquiry != null) lines.push(`question: ${status.pendingInquiry.question}`)
    const terminal = status.story.intrinsic === 'done' || status.story.intrinsic === 'cancelled'
    const fallback = terminal
      ? 'nothing — this story is settled'
      : `story_status { "projectId": "${status.projectId}", "storyId": "${status.story.id}" }`
    lines.push(`next: ${waitingNext(status.waitingFor, status.pendingInquiry?.id, fallback)}`)

    return lines.join('\n')
  }

  const renderPipelineStatus = (state: ConnectPipelineState): string => {
    const lines = [
      `${state.pipeline} · ${state.status}` + (state.step != null ? ` · step: ${state.step}` : ''),
      `steps: ${state.completed.length}/${state.completed.length + state.pending.length} completed`,
    ]
    if (state.pendingInquiry != null) lines.push(`question: ${state.pendingInquiry.question}`)
    if (state.error != null && state.error !== '') lines.push(`error: ${refusalHelper.refusalPhrase(state.error)}`)
    const settled = ['done', 'completed', 'cancelled'].includes(state.status.toLowerCase())
    const fallback = settled
      ? 'nothing — this run is settled'
      : `pipeline_status { "runId": "${state.runId}" }`
    lines.push(`next: ${waitingNext(state.waitingFor, state.pendingInquiry?.id, fallback)}`)

    return lines.join('\n')
  }

  const conversionNext = (view: ConversionStatusView): string => {
    const waiting = waitingNext(view.waitingFor, view.pendingInquiry?.id, '')
    if (waiting !== '') return waiting
    switch (view.status) {
      case ConversionStatus.Running: return 'conversion_status'
      case ConversionStatus.Waiting: return 'next_question'
      case ConversionStatus.Awaiting:
        return `proceed_conversion { "decision": "${conversionStageHelper.decisionFor(view.stage)}" } to continue, or`
          + ` { "decision": "${ConversionDecision.Leave}" } to keep the current result`
      case ConversionStatus.Failed:
        return `proceed_conversion { "decision": "${ConversionDecision.Retry}" } once the cause is addressed`
      case ConversionStatus.Done: return 'nothing — this conversion is finished; purge_origin removes the origin'
      case ConversionStatus.Cancelled: return 'nothing — this conversion was cancelled'
      default: return 'convert_project'
    }
  }

  const batchNext = (view: StoryBatchView, live: boolean): string => {
    const project = `"projectId": "${view.projectId}"`
    if (live) {
      return `story_batch_status { ${project} }` + (view.current != null && view.outcomes[view.current] == null
        ? ` — story_status { ${project}, "storyId": "${view.current}" } follows the story in progress`
        : '')
    }
    // A conversion's batch IS its implementation stage: how it ended is the conversion's to say.
    if (view.kind === StoryBatchKind.Conversion) return 'conversion_status'
    switch (view.status) {
      case StoryBatchStatus.Completed: return 'nothing — every story of this batch has an outcome; list_stories shows where each stands'
      case StoryBatchStatus.Cancelled: return 'nothing — this batch was cancelled; start_story_batch starts a new one over the stories still planned'
      default: return view.reason === STORY_BATCH_STALLED && view.current != null
        ? `story_status { ${project}, "storyId": "${view.current}" }, then start_story_batch again for the stories still planned`
        : 'start_story_batch again once the cause above is addressed — it takes the stories still planned'
    }
  }

  const renderBatchStatus = (view: StoryBatchView): string => {
    const live = STORY_BATCH_LIVE.includes(view.status)
    const stateOf = (id: string): string => {
      const outcome = view.outcomes[id]
      if (outcome != null) return BATCH_OUTCOME_WORDS[outcome] ?? outcome
      if (id === view.current) return live ? 'in progress' : 'started, not finished'

      return live ? 'queued' : 'not started'
    }
    const counts = new Map<string, number>()
    for (const outcome of Object.values(view.outcomes)) counts.set(outcome, (counts.get(outcome) ?? 0) + 1)
    const lines = [
      `story batch ${view.id} · ${view.kind} · ${view.status}`,
      view.status === StoryBatchStatus.Ordering
        ? 'order: being decided — the platform puts first what the other stories build on'
        : `order: ${view.ordering?.source ?? 'board'}`,
      ...view.stories.map((id, at) => {
        const reason = view.ordering?.reasons[id]

        return `  ${at + 1}. ${view.codes[id] ?? id} · ${stateOf(id)}${reason != null && reason !== '' ? ` — ${reason}` : ''}`
      }),
      `progress: ${Object.keys(view.outcomes).length} of ${view.stories.length} finished`
      + (counts.size > 0 ? ` (${[...counts].map(([outcome, count]) => `${count} ${outcome}`).join(', ')})` : ''),
    ]
    if (view.status === StoryBatchStatus.Halted) {
      lines.push(`halted: ${view.reason === STORY_BATCH_STALLED ? BATCH_STALLED_WORDS : refusalHelper.refusalPhrase(view.reason ?? '')}`)
    }
    lines.push(`next: ${batchNext(view, live)}`)

    return lines.join('\n')
  }

  return { renderProjectStatus, renderStoryStatus, renderPipelineStatus, conversionNext, renderSlot, renderBatchStatus }
}

export const statusTextHelper = createStatusTextHelper()
