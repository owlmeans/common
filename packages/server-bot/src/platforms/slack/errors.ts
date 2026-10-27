import { BotError } from '@owlmeans/bot'
import { ResilientError } from '@owlmeans/error'

/** The Web API answered `ok: false` (or not at all) — `bot:slack:<method>:<error>`. */
export class SlackApiError extends BotError {
  public static override typeName: string = `${BotError.typeName}Slack`

  /** The refusal as the Web API stated it. */
  public static of(method: string, error: string, retryAfter?: number): SlackApiError {
    const failure = new SlackApiError(`${method}:${error}`)
    failure.retryAfter = retryAfter
    return failure
  }

  /** The Web API method that was called (`chat.delete`). */
  public method: string = ''
  /** Slack's error code (`cant_delete_message`, `ratelimited`, `invalid_auth` …). */
  public code: string = 'error'
  /** Seconds to wait, when the call was rate limited. */
  public retryAfter?: number

  /** `message` is `<method>:<error>` — prefer {@link SlackApiError.of}. */
  constructor(message: string = 'unknown:error') {
    super(`slack:${message}`)
    this.type = SlackApiError.typeName
    this.finalizeUnmarshal()
  }

  /** Method and code are read back from the message — also for an error rebuilt on the far side of a hop. */
  public override finalizeUnmarshal(): void {
    const found = /slack:([^:]+):([^:]+)/.exec(this.message)
    this.method = found?.[1] ?? ''
    this.code = found?.[2] ?? 'error'
  }
}

ResilientError.registerErrorClass(SlackApiError)
