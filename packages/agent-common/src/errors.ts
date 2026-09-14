import { ResilientError } from '@owlmeans/error'

export class AgentCommonError extends ResilientError {
  public static override typeName: string = `Agent${ResilientError.typeName}`

  constructor(message: string = 'error') {
    super(AgentCommonError.typeName, `agent:${message}`)
  }
}

/** A run was asked to advance along a transition its current step does not offer. */
export class AgentRunStateError extends AgentCommonError {
  public static override typeName: string = `RunState${AgentCommonError.typeName}`

  constructor(message: string = 'error') {
    super(`run-state:${message}`)
    this.type = AgentRunStateError.typeName
  }
}

/**
 * A pipeline declaration is not runnable.
 *
 * Thrown by {@link import('./pipeline.js').validatePipelineSpec} and by the runner's own build
 * step, and it always names EVERY fault it found rather than the first: a spec is authored once and
 * fixed once, and reporting faults one per build turns a five-minute edit into five builds.
 */
export class PipelineSpecError extends AgentCommonError {
  public static override typeName: string = `PipelineSpec${AgentCommonError.typeName}`

  constructor(message: string = 'error') {
    super(`pipeline-spec:${message}`)
    this.type = PipelineSpecError.typeName
  }
}

/**
 * A resume was asked of a run started under a different version of its pipeline.
 *
 * Refused rather than adapted. `completed` names steps by string, so a spec that has since renamed,
 * removed or reordered a step would have a resumed run skip work it never did — silently, because
 * an unknown name in `completed` simply matches nothing.
 */
export class PipelineVersionError extends AgentCommonError {
  public static override typeName: string = `PipelineVersion${AgentCommonError.typeName}`

  constructor(message: string = 'error') {
    super(`pipeline-version:${message}`)
    this.type = PipelineVersionError.typeName
  }
}

/** A resume, a progress report or a skip named a step the spec does not declare. */
export class PipelineUnknownStepError extends AgentCommonError {
  public static override typeName: string = `PipelineUnknownStep${AgentCommonError.typeName}`

  constructor(message: string = 'error') {
    super(`pipeline-step:${message}`)
    this.type = PipelineUnknownStepError.typeName
  }
}

/**
 * A resume was asked to re-enter a completed step whose side effect cannot be repeated.
 *
 * The caller may override with `force`, which is why this is an error and not a silent skip: an
 * operator re-running a wipe, a purge or a hostname claim has to say so.
 */
export class PipelineNotIdempotentError extends AgentCommonError {
  public static override typeName: string = `PipelineNotIdempotent${AgentCommonError.typeName}`

  constructor(message: string = 'error') {
    super(`pipeline-idempotency:${message}`)
    this.type = PipelineNotIdempotentError.typeName
  }
}

/**
 * A step produced a state larger than the run row may carry.
 *
 * The step FAILS — the state is never truncated and the write is never skipped. A pipeline state is
 * scalars and keys by contract; anything that overflows it is a large artifact that belongs in a
 * store of its own, and silently dropping it would make a resume replay from a state that never
 * existed.
 */
export class PipelineStateTooLargeError extends AgentCommonError {
  public static override typeName: string = `PipelineStateTooLarge${AgentCommonError.typeName}`

  constructor(message: string = 'error') {
    super(`pipeline-state:${message}`)
    this.type = PipelineStateTooLargeError.typeName
  }
}

/**
 * A run was asked to wait for an answer it has no way of being given.
 *
 * Thrown when a step asks a question, nobody is there to answer it, and the pipeline has no run
 * store: parking would leave nothing behind to resume, so the step fails at once rather than
 * stopping a run that could never be started again.
 */
export class PipelineNotResumableError extends AgentCommonError {
  public static override typeName: string = `PipelineNotResumable${AgentCommonError.typeName}`

  constructor(message: string = 'error') {
    super(`pipeline-not-resumable:${message}`)
    this.type = PipelineNotResumableError.typeName
  }
}

ResilientError.registerErrorClass(AgentCommonError)
ResilientError.registerErrorClass(AgentRunStateError)
ResilientError.registerErrorClass(PipelineSpecError)
ResilientError.registerErrorClass(PipelineVersionError)
ResilientError.registerErrorClass(PipelineUnknownStepError)
ResilientError.registerErrorClass(PipelineNotIdempotentError)
ResilientError.registerErrorClass(PipelineStateTooLargeError)
ResilientError.registerErrorClass(PipelineNotResumableError)
