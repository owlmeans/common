import type { AbstractRequest } from '@owlmeans/entrypoint'

/** Who may use the developer (tech) routes, re-read on every request. */
export interface EmailTechPolicy {
  /** The routes are on (the flag is read now, so a function may follow a live switch). */
  enabled: () => boolean
  /**
   * The request is a `GUARD_ED25519` signature (role Service) of a `TRUSTED` record whose NAME is
   * one of the allowed signers.
   *
   * @throws {EmailTechDisabled} 404 when the routes are off — they answer as if absent.
   * @throws {AuthForbidden} 403 for any other caller.
   */
  assert: (req: AbstractRequest) => void
}
