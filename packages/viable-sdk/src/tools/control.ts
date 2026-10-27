import { AgentStopScope, type AgentSteerResult, type ConnectAgentLock, type StoryBatchView } from '@owlmeans/viable-common'
import { statusTextHelper } from './status.js'
import { STORY_STOP_ROLLBACK as ROLLBACK } from './consts.local.js'
import type { ControlToolHelper } from './control/types.js'

export const createControlToolHelper = (): ControlToolHelper => {
  const stopNeedsConfirm = (scope?: AgentStopScope): boolean => scope !== AgentStopScope.Run

  const unconfirmedStop = (scope?: AgentStopScope): string => {
    const what = scope === AgentStopScope.Batch
      ? `No further story of the batch starts, and ${ROLLBACK}.`
      : scope === AgentStopScope.Story
        ? `${ROLLBACK.charAt(0).toUpperCase()}${ROLLBACK.slice(1)}.`
        : `When a story is being implemented, ${ROLLBACK}; an open-ended change stops and keeps its edits.`

    return `Not done. ${what} Ask the user, then call it again with confirm: true — or with scope: run for an`
      + ' open-ended change, which rolls nothing back.'
  }

  const unconfirmedCancel = (): string => 'Not done. Cancelling the batch starts no further story, and'
    + ` ${ROLLBACK}. Ask the user, then call it again with confirm: true.`

  const renderStop = (projectId: string, lock: ConnectAgentLock, scope?: AgentStopScope): string => {
    const lead = !lock.locked
      ? 'The run has already ended — nothing is running on the project now.'
      : scope === AgentStopScope.Run
        ? 'Stop requested: the open-ended change stops once the model\'s current answer arrives — nothing'
          + ' further runs — and ends with a short summary of what it changed and what is left. Its edits stay.'
        : scope === AgentStopScope.Batch
          ? `Stop requested: no further story of the batch starts, and ${ROLLBACK}.`
          : scope === AgentStopScope.Story
            ? `Stop requested: ${ROLLBACK}.`
            : `Stop requested${lock.task != null ? ` (${lock.task})` : ''}: a story run stops at its next step and is`
              + ' rolled back to where that run started; an open-ended change stops once the model\'s current'
              + ' answer arrives and keeps its edits.'

    return `${lead}\nnext: project_status { "projectId": "${projectId}" } until the agent is idle`
  }

  const renderSteer = (projectId: string, result: AgentSteerResult): string =>
    `Message ${result.id} queued: the agent reads it before its next model call. Its edits so far stay;`
    + ' the message steers what it does next.'
    + `\nnext: project_status { "projectId": "${projectId}" }`

  const renderCancel = (view: StoryBatchView, storyStopped: boolean): string => [
    storyStopped
      ? `The batch is cancelled: no further story starts, and ${ROLLBACK}.`
      : 'The batch is cancelled: no further story starts. No story of it was being implemented.',
    statusTextHelper.renderBatchStatus(view),
  ].join('\n\n')

  return { stopNeedsConfirm, unconfirmedStop, unconfirmedCancel, renderStop, renderSteer, renderCancel }
}

export const controlToolHelper = createControlToolHelper()
