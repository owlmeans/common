import { BotError } from '@owlmeans/bot'
import { ResilientError } from '@owlmeans/error'

/** The REST API refused or failed — `bot:discord:<status>:<json code>:<message>`. */
export class DiscordApiError extends BotError {
  public static override typeName: string = `${BotError.typeName}Discord`

  /** The refusal as the API stated it: the HTTP status, Discord's JSON error code (0 when none). */
  public static of(status: number, message: string, code: number = 0, retryAfter?: number): DiscordApiError {
    const error = new DiscordApiError(`${status}:${code}:${message}`)
    error.retryAfter = retryAfter
    return error
  }

  /** The HTTP status. */
  public status: number = 500
  /** Discord's JSON error code (`50013` missing permissions, `10008` unknown message…), 0 when none. */
  public code: number = 0
  /** Seconds to wait, when a rate limit refused the call. */
  public retryAfter?: number

  /** `message` is `<status>:<code>:<message>` — prefer {@link DiscordApiError.of}. */
  constructor(message: string = '500:0:error') {
    super(`discord:${message}`)
    this.type = DiscordApiError.typeName
    this.finalizeUnmarshal()
  }

  /** Status and code are read back from the message — also for an error rebuilt on the far side of a hop. */
  public override finalizeUnmarshal(): void {
    const found = /discord:(\d+):(\d+):/.exec(this.message)
    const status = Number(found?.[1])
    const code = Number(found?.[2])
    this.status = Number.isFinite(status) ? status : 500
    this.code = Number.isFinite(code) ? code : 0
  }
}

/**
 * The gateway ended in a way a reconnect cannot fix — `bot:discord-gateway:<close code>:<reason>`
 * (4004 a wrong token, 4014 the MESSAGE CONTENT intent not enabled, …), or the receiver gave up.
 */
export class DiscordGatewayError extends BotError {
  public static override typeName: string = `${BotError.typeName}DiscordGateway`

  public static of(code: number, reason: string): DiscordGatewayError {
    return new DiscordGatewayError(`${code}:${reason}`)
  }

  /** The close code (0 when the gateway did not close with one). */
  public code: number = 0

  constructor(message: string = '0:error') {
    super(`discord-gateway:${message}`)
    this.type = DiscordGatewayError.typeName
    this.finalizeUnmarshal()
  }

  public override finalizeUnmarshal(): void {
    const code = Number(/discord-gateway:(\d+):/.exec(this.message)?.[1])
    this.code = Number.isFinite(code) ? code : 0
  }
}

ResilientError.registerErrorClass(DiscordApiError)
ResilientError.registerErrorClass(DiscordGatewayError)
