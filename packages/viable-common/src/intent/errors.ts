import { ResilientError } from '@owlmeans/error'

export class IntentError extends ResilientError {
  public static override typeName = `ViableIntent${ResilientError.typeName}`

  constructor(message: string = 'error') {
    super(IntentError.typeName, `viable-intent:${message}`)
  }
}

/** No stashed prompt under that reference — expired, already picked up, or never existed. */
export class IntentExpired extends IntentError {
  public static override typeName = `Expired${IntentError.typeName}`
  /** The reference answers nothing (any more): answered 404. */
  public static httpStatus = 404

  constructor(message: string = 'error') {
    super(`expired:${message}`)
    this.type = IntentExpired.typeName
  }
}

/** Too many stashes or pickups from one address, or across everyone. */
export class IntentThrottled extends IntentError {
  public static override typeName = `Throttled${IntentError.typeName}`
  /** Answered 429. */
  public static httpStatus = 429

  constructor(message: string = 'error') {
    super(`throttled:${message}`)
    this.type = IntentThrottled.typeName
  }
}
