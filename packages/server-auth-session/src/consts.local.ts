import type { AuthSessionDecision } from './types.js'

export const missing: AuthSessionDecision = { state: 'missing' }

/**
 * One Redis script owns each subject transition. A read-modify-save sequence lets competing
 * grant/revoke operations overwrite a pending fence; this compares the fence id and increments
 * the version in the same Redis command instead.
 */
export const transitionSubject = `
local current = redis.call('GET', KEYS[1])
local subject = current and cjson.decode(current) or cjson.decode(ARGV[1])
local now = tonumber(ARGV[2])
local expires = tonumber(ARGV[3])
local state = ARGV[4]
local operation = ARGV[5]
if tonumber(subject.expiresAt) <= now then
  subject = cjson.decode(ARGV[1])
end
if state == 'pending' then
  subject.state = 'pending'
  subject.operationId = operation
else
  if subject.state == 'pending' and subject.operationId ~= operation then
    return -1
  end
  subject.state = state
  subject.operationId = cjson.null
  subject.version = tonumber(subject.version) + 1
end
subject.expiresAt = math.max(tonumber(subject.expiresAt), expires)
redis.call('SET', KEYS[1], cjson.encode(subject), 'PXAT', subject.expiresAt)
return tonumber(subject.version)
`

/** Extend only the subject's expiry without overwriting a concurrent fence or revocation. */
export const extendSubjectExpiry = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local subject = cjson.decode(current)
local expires = tonumber(ARGV[1])
if tonumber(subject.expiresAt) < expires then
  subject.expiresAt = expires
  redis.call('SET', KEYS[1], cjson.encode(subject), 'PXAT', subject.expiresAt)
end
return 1
`
