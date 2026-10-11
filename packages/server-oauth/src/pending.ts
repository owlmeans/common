import { memoHelper } from '@owlmeans/context'
import { oauthFormatHelper, OAuthRequestExpired, OAuthRequestNotFound, OAUTH_CODE_TTL_SEC } from '@owlmeans/oauth'
import {
  OAUTH_PENDING_RESOURCE, PENDING_CODE_PREFIX, PENDING_DEVICE_INDEX_PREFIX,
  PENDING_REQUEST_PREFIX, PENDING_USER_CODE_INDEX_PREFIX
} from './consts.js'
import type {
  OAuthAuthorizationCodeRecord, OAuthDeviceCodeIndexRecord, OAuthPendingRequestRecord,
  OAuthPendingResource, OAuthServerContext, OAuthUserCodeIndexRecord
} from './types.js'
import type { OAuthPendingHelper, OAuthPendingMatch } from './pending/types.js'

/** Every TTL this module writes is seconds-from-now, never a duration already elapsed — a record
 * whose deadline has technically passed still gets a floor of one second rather than becoming a
 * "permanent" write on a backend that treats zero/negative as "no expiry". */
const secondsUntil = (expiresAt: number): number => Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000))

export const makeOAuthPendingHelper = (context: OAuthServerContext): OAuthPendingHelper => {
  const pendingResourceAliasOf = (): string =>
    context.cfg.oauth?.pendingResourceAlias ?? OAUTH_PENDING_RESOURCE

  const pending = (): OAuthPendingResource =>
    context.resource<OAuthPendingResource>(pendingResourceAliasOf())

  // --- The canonical request, keyed by its own random id ---------------------------------------

  const createRequest = async (id: string, record: Omit<OAuthPendingRequestRecord, 'id'>): Promise<void> => {
    await pending().create(
      { ...record, id: PENDING_REQUEST_PREFIX + id } as OAuthPendingRequestRecord,
      { ttl: secondsUntil(record.expiresAt) }
    )
  }

  const loadRequestById = async (id: string): Promise<OAuthPendingRequestRecord | null> =>
    await pending().load(PENDING_REQUEST_PREFIX + id) as OAuthPendingRequestRecord | null

  const saveRequest = async (id: string, record: OAuthPendingRequestRecord): Promise<void> => {
    await pending().save(
      { ...record, id: PENDING_REQUEST_PREFIX + id }, { ttl: secondsUntil(record.expiresAt) }
    )
  }

  const deleteRequest = async (id: string): Promise<void> => {
    await pending().delete(PENDING_REQUEST_PREFIX + id)
  }

  const resolveRequestRef = async (ref: string): Promise<OAuthPendingMatch | null> => {
    const direct = await loadRequestById(ref)
    if (direct != null) return { id: ref, record: direct }

    const normalized = oauthFormatHelper.normalizeUserCode(ref)
    const index = await pending().load(PENDING_USER_CODE_INDEX_PREFIX + normalized) as OAuthUserCodeIndexRecord | null
    if (index == null) return null

    const record = await loadRequestById(index.requestId)

    return record == null ? null : { id: index.requestId, record }
  }

  const requirePending = async (ref: string): Promise<OAuthPendingMatch> => {
    const found = await resolveRequestRef(ref)
    if (found == null) throw new OAuthRequestNotFound(ref)
    if (found.record.expiresAt < Date.now()) throw new OAuthRequestExpired(ref)
    if (found.record.status !== 'pending') throw new OAuthRequestNotFound(ref)

    return found
  }

  // --- The user-code index, device grant only ---------------------------------------------------

  const createUserCodeIndex = async (userCode: string, requestId: string, expiresAt: number): Promise<void> => {
    await pending().create(
      { id: PENDING_USER_CODE_INDEX_PREFIX + userCode, requestId, expiresAt } as OAuthUserCodeIndexRecord,
      { ttl: secondsUntil(expiresAt) }
    )
  }

  const deleteUserCodeIndex = async (userCode: string): Promise<void> => {
    await pending().delete(PENDING_USER_CODE_INDEX_PREFIX + userCode)
  }

  // --- The device-code index, what the token endpoint's poll resolves through --------------------

  const createDeviceCodeIndex = async (deviceCodeHash: string, requestId: string, expiresAt: number): Promise<void> => {
    await pending().create(
      { id: PENDING_DEVICE_INDEX_PREFIX + deviceCodeHash, requestId, expiresAt } as OAuthDeviceCodeIndexRecord,
      { ttl: secondsUntil(expiresAt) }
    )
  }

  const loadRequestByDeviceCodeHash = async (deviceCodeHash: string): Promise<OAuthPendingMatch | null> => {
    const index = await pending().load(PENDING_DEVICE_INDEX_PREFIX + deviceCodeHash) as OAuthDeviceCodeIndexRecord | null
    if (index == null) return null

    const record = await loadRequestById(index.requestId)

    return record == null ? null : { id: index.requestId, record }
  }

  const deleteDeviceCodeIndex = async (deviceCodeHash: string): Promise<void> => {
    await pending().delete(PENDING_DEVICE_INDEX_PREFIX + deviceCodeHash)
  }

  // --- Authorization codes: single-use, consumed with `take()` -----------------------------------

  const createAuthorizationCode = async (
    codeHash: string, record: Omit<OAuthAuthorizationCodeRecord, 'id'>
  ): Promise<void> => {
    await pending().create(
      { ...record, id: PENDING_CODE_PREFIX + codeHash } as OAuthAuthorizationCodeRecord,
      { ttl: OAUTH_CODE_TTL_SEC }
    )
  }

  const takeAuthorizationCode = async (codeHash: string): Promise<OAuthAuthorizationCodeRecord | null> => {
    try {
      return await pending().take(PENDING_CODE_PREFIX + codeHash) as OAuthAuthorizationCodeRecord
    } catch {
      return null
    }
  }

  return {
    pendingResourceAliasOf, createRequest, loadRequestById, saveRequest, deleteRequest, resolveRequestRef,
    requirePending, createUserCodeIndex, deleteUserCodeIndex, createDeviceCodeIndex, loadRequestByDeviceCodeHash,
    deleteDeviceCodeIndex, createAuthorizationCode, takeAuthorizationCode,
  }
}

/** The pending-record store of a context — one per context. */
export const oauthPendingOf = memoHelper.oncePer(makeOAuthPendingHelper)
