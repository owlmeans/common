import { ConnectJobBlock, ConnectJobStatus } from '@owlmeans/viable-common'
import type { ConnectJob } from '@owlmeans/viable-common'
import { JOB_POLL_MAX_SEC } from '../consts.js'

const NEXT: Record<ConnectJobStatus, (job: ConnectJob) => string> = {
  [ConnectJobStatus.Queued]: job => `wait_for { "jobId": "${job.id}", "maxWaitSec": ${JOB_POLL_MAX_SEC} }`,
  [ConnectJobStatus.Running]: job => `wait_for { "jobId": "${job.id}", "maxWaitSec": ${JOB_POLL_MAX_SEC} }`,
  [ConnectJobStatus.Blocked]: job => job.blockedOn === ConnectJobBlock.ModelTask
    ? 'next_task — this run is waiting for you to perform its model calls'
    : job.blockedOn === ConnectJobBlock.Env
      ? 'local_setup_guide — the project needs a database it can reach'
      : `wait_for { "jobId": "${job.id}", "maxWaitSec": ${JOB_POLL_MAX_SEC} }`,
  [ConnectJobStatus.Done]: () => 'nothing — this finished',
  [ConnectJobStatus.Failed]: job => job.runId != null
    ? `resume_pipeline { "runId": "${job.runId}" } once the cause is addressed`
    : 'nothing — read the error and decide',
}

/**
 * One job, as a few lines a parent agent can act on.
 *
 * Written for a model reading a tool result, so it says three things in order and nothing else:
 * what is happening, what it is waiting for, and what to call next. The last line is what keeps a
 * parent from inventing a polling strategy of its own — or from concluding that a blocked run has
 * failed.
 */
export const renderJob = (job: ConnectJob): string => {
  const lines = [
    `job ${job.id} · ${job.kind} · ${job.status}`
    + (job.phase != null ? ` · phase: ${job.phase}` : ''),
  ]

  if (job.progress != null) {
    const done = job.progress.completed.length
    const total = done + job.progress.pending.length
    lines.push(`steps: ${done}/${total} done${job.progress.step != null ? ` · in: ${job.progress.step}` : ''}`)
  }

  lines.push(`project ${job.projectId}`
    + (job.storyId != null ? ` · story ${job.storyId}` : '')
    + (job.runId != null ? ` · run ${job.runId}` : ''))

  if (job.blockedOn != null) lines.push(`blocked on: ${job.blockedOn}`)
  if (job.message != null) lines.push(job.message)
  if (job.error != null) lines.push(`error: ${job.error}`)
  lines.push(`next: ${NEXT[job.status](job)}`)

  return lines.join('\n')
}

export const isSettled = (job: ConnectJob): boolean =>
  job.status === ConnectJobStatus.Done || job.status === ConnectJobStatus.Failed
