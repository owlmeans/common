import { BotError } from '@owlmeans/bot'
import { ResilientError } from '@owlmeans/error'

/**
 * The Graph API refused a call — `bot:whatsapp:<code>:<message>`, `code` being the Graph error code
 * (`error.code`: 190 an expired token, 100 a bad parameter, 131047 outside the 24-hour window …),
 * or the HTTP status when the answer carried none (503 unreachable, 504 timeout).
 */
export class WhatsAppApiError extends BotError {
  public static override typeName: string = `${BotError.typeName}WhatsApp`

  /** The refusal as the Graph API stated it. */
  public static of(code: number, description: string, status?: number): WhatsAppApiError {
    const error = new WhatsAppApiError(`${code}:${description}`)
    error.status = status ?? code
    return error
  }

  /** The Graph error code (or the HTTP status when there was none). */
  public code: number = 500
  /** The HTTP status of the answer — not carried across a hop (500 there; the code is carried). */
  public status: number = 500

  /** `message` is `<code>:<description>` — prefer {@link WhatsAppApiError.of}. */
  constructor(message: string = '500:error') {
    super(`whatsapp:${message}`)
    this.type = WhatsAppApiError.typeName
    this.finalizeUnmarshal()
  }

  /** The code is read back from the message — also for an error rebuilt on the far side of a hop. */
  public override finalizeUnmarshal(): void {
    const code = Number(/whatsapp:(\d+):/.exec(this.message)?.[1])
    this.code = Number.isFinite(code) ? code : 500
  }
}

ResilientError.registerErrorClass(WhatsAppApiError)
