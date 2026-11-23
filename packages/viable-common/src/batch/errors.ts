import { ResilientError } from '@owlmeans/error'
import { ProjectError } from '../planning/errors.js'
import { AGENT_NOT_RUNNING_MARKER, WORKCARD_BATCH_ACTIVE_MARKER, WORKCARD_BATCH_EMPTY_MARKER } from './consts.js'

/**
 * The refusals of the agent's controls and of a story batch.
 *
 * Declared ONCE, here, beside the project refusals they belong to: the platform throws them from
 * its API services and the agent, the browser and the connector SDK phrase them, and a class
 * declared on one side of a hop only cannot be `instanceof`-matched on the other. The markers
 * (`viable-project:agent-not-running:…`, `viable-project:story-batch-active:…`,
 * `viable-project:story-batch-empty`) are wire contracts every reader matches by substring.
 */

/** Nothing stoppable or steerable runs on the project (`what` names the control asked for). */
export class AgentNotRunning extends ProjectError {
  public static override typeName = `AgentNotRunning${ProjectError.typeName}`
  /** Nothing is running that the control reaches: answered 409. */
  public static httpStatus = 409

  constructor(message: string = 'error') {
    super(`${AGENT_NOT_RUNNING_MARKER}:${message}`)
    this.type = AgentNotRunning.typeName
  }
}

/** A story batch already runs on the project — one at a time (`message` is its id). */
export class WorkcardBatchActive extends ProjectError {
  public static override typeName = `StoryBatchActive${ProjectError.typeName}`
  /** Another batch is under way: answered 409. */
  public static httpStatus = 409

  constructor(message: string = 'error') {
    super(`${WORKCARD_BATCH_ACTIVE_MARKER}:${message}`)
    this.type = WorkcardBatchActive.typeName
  }
}

/** The selection holds no planned story of the project, so there is nothing to implement. */
export class WorkcardBatchEmpty extends ProjectError {
  public static override typeName = `StoryBatchEmpty${ProjectError.typeName}`
  /** The request selected nothing a batch takes: answered 400. */
  public static httpStatus = 400

  constructor(message: string = '') {
    super(message !== '' ? `${WORKCARD_BATCH_EMPTY_MARKER}:${message}` : WORKCARD_BATCH_EMPTY_MARKER)
    this.type = WorkcardBatchEmpty.typeName
  }
}

ResilientError.registerErrorClass(AgentNotRunning)
ResilientError.registerErrorClass(WorkcardBatchActive)
ResilientError.registerErrorClass(WorkcardBatchEmpty)
