import { ConnectJobBlock, ConnectJobStatus } from '@owlmeans/viable-common'
import type { ConnectJob } from '@owlmeans/viable-common'
import { JOB_POLL_MAX_SEC } from '../consts.js'
import { refusalPhrase } from './refusal.js'

const NEXT: Record<ConnectJobStatus, (job: ConnectJob) => string> = {
  [ConnectJobStatus.Queued]: job => `wait_for { "jobId": "${job.id}", "maxWaitSec": ${JOB_POLL_MAX_SEC} }`,
  [ConnectJobStatus.Running]: job => `wait_for { "jobId": "${job.id}", "maxWaitSec": ${JOB_POLL_MAX_SEC} }`,
  // A question outranks a model task: a person is slower than a subagent, and a run that stopped
  // for one moves again the moment somebody answers.
  [ConnectJobStatus.Blocked]: job => job.blockedOn === ConnectJobBlock.Question
    ? 'next_question — this run needs a decision from the person you are working for'
    : job.blockedOn === ConnectJobBlock.ModelTask
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
  // The question itself, not only that there is one: a parent that has to make a second call to
  // learn what is being asked usually makes none, and waits the whole timeout out instead.
  if (job.inquiry != null) lines.push(`question: ${job.inquiry.question}`)
  if (job.message != null) lines.push(job.message)
  // Phrased, because a job's error is a STORED string — the platform writes `lastError` from a
  // refusal's own message, so what arrives here is the marker with no class left on it, and often
  // the whole marshalled `type|||marker|||stack`. The parent reads this line and decides whether
  // to retry, so it has to say what was refused rather than name a class and a stack frame.
  if (job.error != null && job.error !== '') lines.push(`error: ${refusalPhrase(job.error)}`)
  lines.push(`next: ${NEXT[job.status](job)}`)

  return lines.join('\n')
}

export const isSettled = (job: ConnectJob): boolean =>
  job.status === ConnectJobStatus.Done || job.status === ConnectJobStatus.Failed
