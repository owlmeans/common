import { normalizeUserCode, OAUTH_CODE_TTL_SEC } from '@owlmeans/oauth'
import {
  OAUTH_PENDING_RESOURCE, PENDING_CODE_PREFIX, PENDING_DEVICE_INDEX_PREFIX,
  PENDING_REQUEST_PREFIX, PENDING_USER_CODE_INDEX_PREFIX
} from './consts.js'
import type {
  OAuthAuthorizationCodeRecord, OAuthDeviceCodeIndexRecord, OAuthPendingRequestRecord,
  OAuthPendingResource, OAuthServerContext, OAuthUserCodeIndexRecord
} from './types.js'

/** Which resource this deployment stores pending requests in — configurable, defaulted. */
export const pendingResourceAliasOf = (context: OAuthServerContext): string =>
  context.cfg.oauth?.pendingResourceAlias ?? OAUTH_PENDING_RESOURCE

const pending = (context: OAuthServerContext): OAuthPendingResource =>
  context.resource<OAuthPendingResource>(pendingResourceAliasOf(context))

/** Every TTL this module writes is seconds-from-now, never a duration already elapsed — a record
 * whose deadline has technically passed still gets a floor of one second rather than becoming a
 * "permanent" write on a backend that treats zero/negative as "no expiry". */
const secondsUntil = (expiresAt: number): number => Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000))

// --- The canonical request, keyed by its own random id -----------------------------------------

export const createRequest = async (
  context: OAuthServerContext, id: string, record: Omit<OAuthPendingRequestRecord, 'id'>
): Promise<void> => {
  await pending(context).create(
    { ...record, id: PENDING_REQUEST_PREFIX + id } as OAuthPendingRequestRecord,
    { ttl: secondsUntil(record.expiresAt) }
  )
}

export const loadRequestById = async (
  context: OAuthServerContext, id: string
): Promise<OAuthPendingRequestRecord | null> =>
  await pending(context).load(PENDING_REQUEST_PREFIX + id) as OAuthPendingRequestRecord | null

export const saveRequest = async (
  context: OAuthServerContext, id: string, record: OAuthPendingRequestRecord
): Promise<void> => {
  await pending(context).save(
    { ...record, id: PENDING_REQUEST_PREFIX + id }, { ttl: secondsUntil(record.expiresAt) }
  )
}

export const deleteRequest = async (context: OAuthServerContext, id: string): Promise<void> => {
  await pending(context).delete(PENDING_REQUEST_PREFIX + id)
}

/**
 * What the consent screen's `:ref` param resolves through: a canonical request id (the code
 * grant's redirect names one directly) or a normalized user code (what a person typed, or what
 * `verification_uri_complete` carried) — the caller never has to know which kind of request it
 * is before asking.
 */
export const resolveRequestRef = async (
  context: OAuthServerContext, ref: string
): Promise<{ id: string, record: OAuthPendingRequestRecord } | null> => {
  const direct = await loadRequestById(context, ref)
  if (direct != null) return { id: ref, record: direct }

  const normalized = normalizeUserCode(ref)
  const index = await pending(context).load(PENDING_USER_CODE_INDEX_PREFIX + normalized) as OAuthUserCodeIndexRecord | null
  if (index == null) return null

  const record = await loadRequestById(context, index.requestId)

  return record == null ? null : { id: index.requestId, record }
}

// --- The user-code index, device grant only -----------------------------------------------------

export const createUserCodeIndex = async (
  context: OAuthServerContext, userCode: string, requestId: string, expiresAt: number
): Promise<void> => {
  await pending(context).create(
    { id: PENDING_USER_CODE_INDEX_PREFIX + userCode, requestId, expiresAt } as OAuthUserCodeIndexRecord,
    { ttl: secondsUntil(expiresAt) }
  )
}

export const deleteUserCodeIndex = async (context: OAuthServerContext, userCode: string): Promise<void> => {
  await pending(context).delete(PENDING_USER_CODE_INDEX_PREFIX + userCode)
}

// --- The device-code index, what the token endpoint's poll resolves through ----------------------

export const createDeviceCodeIndex = async (
  context: OAuthServerContext, deviceCodeHash: string, requestId: string, expiresAt: number
): Promise<void> => {
  await pending(context).create(
    { id: PENDING_DEVICE_INDEX_PREFIX + deviceCodeHash, requestId, expiresAt } as OAuthDeviceCodeIndexRecord,
    { ttl: secondsUntil(expiresAt) }
  )
}

export const loadRequestByDeviceCodeHash = async (
  context: OAuthServerContext, deviceCodeHash: string
): Promise<{ id: string, record: OAuthPendingRequestRecord } | null> => {
  const index = await pending(context).load(PENDING_DEVICE_INDEX_PREFIX + deviceCodeHash) as OAuthDeviceCodeIndexRecord | null
  if (index == null) return null

  const record = await loadRequestById(context, index.requestId)

  return record == null ? null : { id: index.requestId, record }
}

export const deleteDeviceCodeIndex = async (context: OAuthServerContext, deviceCodeHash: string): Promise<void> => {
  await pending(context).delete(PENDING_DEVICE_INDEX_PREFIX + deviceCodeHash)
}

// --- Authorization codes: single-use, consumed with `take()` -------------------------------------

export const createAuthorizationCode = async (
  context: OAuthServerContext, codeHash: string, record: Omit<OAuthAuthorizationCodeRecord, 'id'>
): Promise<void> => {
  await pending(context).create(
    { ...record, id: PENDING_CODE_PREFIX + codeHash } as OAuthAuthorizationCodeRecord,
    { ttl: OAUTH_CODE_TTL_SEC }
  )
}

/** `null` for an unknown or already-consumed code — a replay reads exactly like a wrong one. */
export const takeAuthorizationCode = async (
  context: OAuthServerContext, codeHash: string
): Promise<OAuthAuthorizationCodeRecord | null> => {
  try {
    return await pending(context).take(PENDING_CODE_PREFIX + codeHash) as OAuthAuthorizationCodeRecord
  } catch {
    return null
  }
}
