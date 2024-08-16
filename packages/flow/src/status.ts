
import { ResilientError } from '@owlmeans/error'

export class FlowError extends ResilientError {
  public static override typeName: string = 'FlowError'

  constructor(message: string = 'error') {
    super(FlowError.typeName, `flow:${message}`)
  }
}

export class FlowUnsupported extends FlowError {
  public static override typeName: string = `${FlowError.typeName}Unsupported`

  constructor(message: string = 'error') {
    super(`unsupported:${message}`)
    this.type = FlowUnsupported.typeName
  }
}

export class FlowTargetError extends FlowError {
  public static override typeName: string = `${FlowError.typeName}Target`

  constructor(message: string = 'error') {
    super(`target:${message}`)
    this.type = FlowTargetError.typeName
  }
}

export class UnknownFlow extends FlowError {
  public static override typeName: string = `${FlowError.typeName}Unknown`

  constructor(message: string = 'error') {
    super(`unknown:${message}`)
    this.type = UnknownFlow.typeName
  }
}

export class FlowStepError extends FlowError {
  public static override typeName: string = `${FlowError.typeName}Step`

  constructor(message: string = 'error') {
    super(`step:${message}`)
    this.type = FlowStepError.typeName
  }
}

export class FlowStepMissconfigured extends FlowStepError {
  public static override typeName: string = `${FlowStepError.typeName}Missconfigured`

  constructor(message: string = 'error') {
    super(`missconfigured:${message}`)
    this.type = FlowStepMissconfigured.typeName
  }
}

export class UnknownFlowStep extends FlowStepError {
  public static override typeName: string = `${FlowStepError.typeName}Unknown`

  constructor(message: string = 'error') {
    super(`unknown:${message}`)
    this.type = UnknownFlowStep.typeName
  }
}

export class UnknownTransition extends FlowStepError {
  public static override typeName: string = `${FlowStepError.typeName}Transition`

  constructor(message: string = 'error') {
    super(`transition:${message}`)
    this.type = UnknownTransition.typeName
  }
}

ResilientError.registerErrorClass(FlowError)
ResilientError.registerErrorClass(FlowUnsupported)
ResilientError.registerErrorClass(FlowTargetError)
ResilientError.registerErrorClass(UnknownFlow)
ResilientError.registerErrorClass(FlowStepError)
ResilientError.registerErrorClass(FlowStepMissconfigured)
ResilientError.registerErrorClass(UnknownFlowStep)
ResilientError.registerErrorClass(UnknownTransition)
