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

ResilientError.registerErrorClass(AgentCommonError)
ResilientError.registerErrorClass(AgentRunStateError)
