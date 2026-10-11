import type { WorkcardNotFound, Workcard, PlanningReply } from '@owlmeans/planning'

/** What every handler answers with when a record is not the caller's: absence, never a refusal. */
export interface GuardHelper {
  notFoundOf: (id: string) => WorkcardNotFound
  /**
   * A record of another entity is absent, not forbidden.
   *
   * @throws {WorkcardNotFound}
   */
  assertScope: <T extends Pick<Workcard, 'entityId'>>(record: T | null | undefined, scope: { entityId: string }, id: string) => T
  /**
   * Run a handler body so that a scope mismatch leaves as `WorkcardNotFound` — telling "not yours"
   * apart from "does not exist" is what turns an id space into an enumeration oracle.
   */
  concealed: <T>(run: () => Promise<T>) => Promise<T>
  /** Conceal scope failures and project storage metadata out of a public reply. */
  reply: <T>(run: () => Promise<T>) => Promise<PlanningReply<T>>
  /** Seconds as the wire sends them, clamped to `[0, max]`. */
  clampSeconds: (value: unknown, max: number) => number
}
