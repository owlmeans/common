import { ResilientError } from '@owlmeans/error'

export class AgentError extends ResilientError {
  public static override typeName: string = `AgentRuntime${ResilientError.typeName}`

  constructor(message: string = 'error') {
    super(AgentError.typeName, `agent-runtime:${message}`)
  }
}

/** The agent was built without something it cannot work around — a model, or a tool set. */
export class AgentMissconfiguredError extends AgentError {
  public static override typeName: string = `Missconfigured${AgentError.typeName}`

  constructor(message: string = 'error') {
    super(`missconfigured:${message}`)
    this.type = AgentMissconfiguredError.typeName
  }
}

/** The tool loop hit its turn ceiling without the model ever answering. */
export class AgentLoopExhaustedError extends AgentError {
  public static override typeName: string = `LoopExhausted${AgentError.typeName}`

  constructor(message: string = 'error') {
    super(`loop-exhausted:${message}`)
    this.type = AgentLoopExhaustedError.typeName
  }
}

ResilientError.registerErrorClass(AgentError)
ResilientError.registerErrorClass(AgentMissconfiguredError)
ResilientError.registerErrorClass(AgentLoopExhaustedError)
