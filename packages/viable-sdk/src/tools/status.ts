import { ConnectWaitReason, ConversionDecision, ConversionStatus, decisionFor } from '@owlmeans/viable-common'
import type {
  ConnectPipelineState, ConnectProjectStatus, ConnectStoryStatus, ConversionStatusView,
} from '@owlmeans/viable-common'
import { refusalPhrase } from './refusal.js'

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
  if (run.error != null && run.error !== '') lines.push(`error: ${refusalPhrase(run.error)}`)

  return lines
}

export const renderProjectStatus = (status: ConnectProjectStatus): string => {
  const lines = [
    `${status.project.name} (${status.project.alias}) · ${status.project.id}`,
    `project: ${status.project.status} (${status.project.intrinsic})`,
    status.slot == null
      ? 'slot: none'
      : `slot: ${status.slot.kind} · ${status.slot.status}`
        + (status.slot.host != null ? ` · ${status.slot.host}` : ''),
    `agent: ${status.agent.locked ? `busy (${status.agent.task ?? 'working'})` : 'idle'}`,
    ...runLines(status.run),
  ]
  if (status.pendingInquiry != null) lines.push(`question: ${status.pendingInquiry.question}`)
  for (const warning of [status.slot?.lastError, status.slot?.buildWarning, status.slot?.backendWarning]) {
    if (warning != null && warning !== '') lines.push(`warning: ${refusalPhrase(warning)}`)
  }
  const fallback = status.agent.locked || status.run != null
    ? `project_status { "projectId": "${status.project.id}" }`
    : status.project.status === 'draft'
      ? `confirm_project { "projectId": "${status.project.id}" }`
      : 'list_stories'
  lines.push(`next: ${waitingNext(status.waitingFor, status.pendingInquiry?.id, fallback)}`)

  return lines.join('\n')
}

export const renderStoryStatus = (status: ConnectStoryStatus): string => {
  const lines = [
    `${status.story.code} · ${status.story.title}`,
    `story: ${status.story.status} (${status.story.intrinsic})`,
    ...runLines(status.run),
  ]
  if (status.story.warning != null && status.story.warning !== '') {
    lines.push(`warning: ${refusalPhrase(status.story.warning)}`)
  }
  if (status.pendingInquiry != null) lines.push(`question: ${status.pendingInquiry.question}`)
  const terminal = status.story.intrinsic === 'done' || status.story.intrinsic === 'cancelled'
  const fallback = terminal
    ? 'nothing — this story is settled'
    : `story_status { "projectId": "${status.projectId}", "storyId": "${status.story.id}" }`
  lines.push(`next: ${waitingNext(status.waitingFor, status.pendingInquiry?.id, fallback)}`)

  return lines.join('\n')
}

export const renderPipelineStatus = (state: ConnectPipelineState): string => {
  const lines = [
    `${state.pipeline} · ${state.status}` + (state.step != null ? ` · step: ${state.step}` : ''),
    `steps: ${state.completed.length}/${state.completed.length + state.pending.length} completed`,
  ]
  if (state.pendingInquiry != null) lines.push(`question: ${state.pendingInquiry.question}`)
  if (state.error != null && state.error !== '') lines.push(`error: ${refusalPhrase(state.error)}`)
  const settled = ['done', 'completed', 'cancelled'].includes(state.status.toLowerCase())
  const fallback = settled
    ? 'nothing — this run is settled'
    : `pipeline_status { "runId": "${state.runId}" }`
  lines.push(`next: ${waitingNext(state.waitingFor, state.pendingInquiry?.id, fallback)}`)

  return lines.join('\n')
}

export const conversionNext = (view: ConversionStatusView): string => {
  const waiting = waitingNext(view.waitingFor, view.pendingInquiry?.id, '')
  if (waiting !== '') return waiting
  switch (view.status) {
    case ConversionStatus.Running: return 'conversion_status'
    case ConversionStatus.Waiting: return 'next_question'
    case ConversionStatus.Awaiting:
      return `proceed_conversion { "decision": "${decisionFor(view.stage)}" } to continue, or`
        + ` { "decision": "${ConversionDecision.Leave}" } to keep the current result`
    case ConversionStatus.Failed:
      return `proceed_conversion { "decision": "${ConversionDecision.Retry}" } once the cause is addressed`
    case ConversionStatus.Done: return 'nothing — this conversion is finished; purge_origin removes the origin'
    case ConversionStatus.Cancelled: return 'nothing — this conversion was cancelled'
    default: return 'convert_project'
  }
}
