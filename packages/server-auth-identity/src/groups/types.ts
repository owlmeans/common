import type { OrgGroup } from '../types.js'

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
   * Remove the group (`service`, `key`) from an organization — `true` when it was there. The rows that
   * name it in their `groups` are the caller's to update.
   */
  removeOrgGroup: (entityId: string, service: string, key: string) => Promise<boolean>
}
