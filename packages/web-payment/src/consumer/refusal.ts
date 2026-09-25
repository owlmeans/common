import { ResilientError } from '@owlmeans/error'
import { httpStatusOf } from '@owlmeans/api/status'
import { ConsentKind, PaymentError, consentRefusalOf } from '@owlmeans/payment'

/** Where a wrapping error keeps the one it wraps — `cause`, and the fields frameworks use for it. */
const NESTED_FIELDS = ['cause', 'error', 'original', 'originalError', 'inner', 'reason'] as const

/** How deep a wrapped chain is followed — a planning `CommitFailed` inside a transport error is two. */
const MAX_DEPTH = 5

const PRECONDITION_REQUIRED = 428

/**
 * Which express request a failure asks for: `performance` (spend consent), `subscription-start`,
 * `unknown` for a bare HTTP 428 that names neither (a production body carries only an incident
 * id), or `null` for anything else.
 *
 * Read on the error itself and on whatever it wraps (`cause`, `error`, `original`, `inner`, an
 * aggregate's `errors`), and on text as well as objects, because a refusal travels in three shapes:
 * the class (a development body, rebuilt by the registry); its marker inside another error's
 * message or a stored string (a planning commit that failed on the refusal answers
 * `planning:commit-failed:<transition>:<the refusal's text>`); and the bare status of a production
 * body (`@owlmeans/api`'s `ApiStatusError`, `api:client:status:428[:<incident>]`).
 */
export const consentRefusalKindOf = (error: unknown): ConsentKind | 'unknown' | null => {
  let status = false
  const seen = new Set<unknown>()
  const visit = (value: unknown, depth: number): ConsentKind | null => {
    if (value == null || depth > MAX_DEPTH) {
      return null
    }
    if (typeof value === 'string') {
      const holder = { message: value }
      if (httpStatusOf(holder) === PRECONDITION_REQUIRED) status = true
      return consentRefusalOf(holder)
    }
    if (typeof value !== 'object' || seen.has(value)) {
      return null
    }
    seen.add(value)
    const kind = consentRefusalOf(value)
    if (kind != null) {
      return kind
    }
    if (httpStatusOf(value) === PRECONDITION_REQUIRED) {
      status = true
    }
    for (const field of NESTED_FIELDS) {
      const nested = visit((value as Record<string, unknown>)[field], depth + 1)
      if (nested != null) return nested
    }
    const errors = (value as { errors?: unknown }).errors
    if (Array.isArray(errors)) {
      for (const item of errors) {
        const nested = visit(item, depth + 1)
        if (nested != null) return nested
      }
    }

    return null
  }
  const kind = visit(error, 0)

  return kind ?? (status ? 'unknown' : null)
}

/**
 * Whether a failure is a consent refusal — the class or its marker (`consentRefusalOf`), or an
 * HTTP 428 (`httpStatusOf`), on the error or anything it wraps. What decides that the consent
 * dialog opens and the action is retried once.
 */
export const isConsentRefusal = (error: unknown): boolean => consentRefusalKindOf(error) != null

/** A refusal the performance-consent dialog answers: the spend consent, or a bare 428. */
export const isPerformanceConsentRefusal = (error: unknown): boolean => {
  const kind = consentRefusalKindOf(error)

  return kind === ConsentKind.Performance || kind === 'unknown'
}

const DECLINED_MARKER = 'consent-declined:'

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

export const isConsentDeclined = (error: unknown): error is ConsentDeclined => error instanceof ConsentDeclined
