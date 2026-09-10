import { ResilientError } from '@owlmeans/error'

export class DelegateError extends ResilientError {
  public static override typeName = `Delegate${ResilientError.typeName}`

  constructor(message: string = 'error') {
    super(DelegateError.typeName, `llm-delegate:${message}`)
  }
}

/**
 * No transport is seated under this key, or the one that was has gone.
 *
 * FATAL, and that is the whole reason it is its own class. Every retry in the stack exists for a
 * model that answered badly; none of them helps when there is nobody to ask. Left unrecognised, an
 * absent performer costs the full retry ladder — the caller's, the model's, and the escalator's
 * product of the two — before anything says what was actually wrong.
 */
export class DelegateUnavailable extends DelegateError {
  public static override typeName = `Unavailable${DelegateError.typeName}`

  constructor(message: string = 'error') {
    super(`unavailable:${message}`)
    this.type = DelegateUnavailable.typeName
  }
}

ResilientError.registerErrorClass(DelegateError)
ResilientError.registerErrorClass(DelegateUnavailable)
