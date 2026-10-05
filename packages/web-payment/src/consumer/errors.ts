import { ResilientError } from '@owlmeans/error'
import { ConsentKind, PaymentError } from '@owlmeans/payment'
import { DECLINED_MARKER } from './consts.local.js'

/**
 * The person declined the express request, so the action that needed it did not run. Raised by
 * `useConsentGate().withConsent` — never by a server, and never a refusal a gate retries.
 */
export class ConsentDeclined extends PaymentError {
  public static override typeName: string = `${PaymentError.typeName}ConsentDeclined`

  public kind: string = ConsentKind.Performance

  constructor(kind: string = ConsentKind.Performance) {
    super(`${DECLINED_MARKER}${kind}`)
    this.type = ConsentDeclined.typeName
    this.applyFields()
  }

  private applyFields(): void {
    const at = this.message.lastIndexOf(DECLINED_MARKER)
    if (at >= 0) this.kind = this.message.slice(at + DECLINED_MARKER.length) || ConsentKind.Performance
  }

  override finalizeUnmarshal(): void {
    this.applyFields()
  }
}

ResilientError.registerErrorClass(ConsentDeclined)
