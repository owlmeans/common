import { BotError } from '@owlmeans/bot'
import { ResilientError } from '@owlmeans/error'

/** The Bot API answered `ok: false` — `bot:telegram:<error_code>:<description>`. */
export class TelegramApiError extends BotError {
  public static override typeName: string = `${BotError.typeName}Telegram`

  /** The refusal as the Bot API stated it. */
  public static of(code: number, description: string, retryAfter?: number): TelegramApiError {
    const error = new TelegramApiError(`${code}:${description}`)
    error.retryAfter = retryAfter
    return error
  }

  /** The Bot API's `error_code` (an HTTP-like status). */
  public code: number = 500
  /** Seconds to wait, when flood control refused the call. */
  public retryAfter?: number

  /** `message` is `<error_code>:<description>` — prefer {@link TelegramApiError.of}. */
  constructor(message: string = '500:error') {
    super(`telegram:${message}`)
    this.type = TelegramApiError.typeName
    this.finalizeUnmarshal()
  }

  /** The code is read back from the message — also for an error rebuilt on the far side of a hop. */
  public override finalizeUnmarshal(): void {
    const code = Number(/telegram:(\d+):/.exec(this.message)?.[1])
    this.code = Number.isFinite(code) ? code : 500
  }
}

ResilientError.registerErrorClass(TelegramApiError)
