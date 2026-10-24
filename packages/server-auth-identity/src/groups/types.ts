import type { OrgGroup } from '../types.js'

/** What `updateOrgGroup` may write — each field present is set, each absent one is left alone. */
export interface OrgGroupFields extends Partial<Pick<OrgGroup, 'title' | 'managed' | 'permissions' | 'bundles'>> {}

/** The groups apps keep in organizations of one context's identity store. */
export interface OrgGroupHelper {
  /** The groups one app keeps in an organization. */
  listOrgGroups: (entityId: string, service: string) => Promise<OrgGroup[]>
  /**
   * Create or replace the group (`service`, `key`) of an organization, keeping that pair unique.
   *
   * Two guarded field-level updates rather than a read and a write: replace the element that matches,
   * else push one where none matches. A concurrent put of the same pair makes the push match nothing,
   * and the next pass replaces what it pushed — so the pair can never appear twice, and nothing else
   * in the document (another app's groups, minted names, the slug) is ever written.
   *
   * @throws {UnknownRecordError} when the organization does not exist.
   */
  putOrgGroup: (entityId: string, group: OrgGroup) => Promise<OrgGroup>
  /**
   * Set only the given fields (`title`, `managed`, `permissions`, `bundles`) of the EXISTING group
   * (`service`, `key`) — `true` when it matched; it never creates one.
   *
   * Two writers of one group that own different fields — a platform sync keeping `managed` and
   * `bundles`, an operator granting into `permissions` — must not undo each other, and
   * `putOrgGroup` replaces the whole element from whatever its caller read. Use `putOrgGroup` only
   * to create a group; change an existing one through this.
   */
  updateOrgGroup: (entityId: string, service: string, key: string, fields: OrgGroupFields) => Promise<boolean>
  /**
   * Remove the group (`service`, `key`) from an organization — `true` when it was there. The rows that
   * name it in their `groups` are the caller's to update.
   */
  removeOrgGroup: (entityId: string, service: string, key: string) => Promise<boolean>
}
