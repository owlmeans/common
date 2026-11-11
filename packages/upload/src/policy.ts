import { DEFAULT_UPLOAD_POLICY, UPLOAD_DISPLAY_PATH_LENGTH, UPLOAD_PATH_LIMITS, UploadReason } from './consts.js'
import { UploadPolicyError } from './errors.js'
import type {
  UploadAdmission, UploadCandidate, UploadPathResult, UploadPolicyHelper, UploadPrecheck, UploadPrecheckOptions,
  UploadRefusal,
} from './policy/types.js'
import type { UploadLimits, UploadPolicy, UploadTotals } from './types.js'

export const createUploadPolicyHelper = (): UploadPolicyHelper => {
  const forbidden = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/
  const forbiddenAll = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/g
  const encoder = new TextEncoder()
  const bytesOf = (text: string): number => encoder.encode(text).length

  const limit = (policy: Partial<UploadPolicy>, field: keyof UploadLimits): number => {
    const value = policy[field] ?? DEFAULT_UPLOAD_POLICY[field]
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new UploadPolicyError(field)
    }
    return value
  }

  const normalize = (policy: Partial<UploadPolicy> = {}): UploadPolicy => ({
    maxFiles: limit(policy, 'maxFiles'),
    maxFileBytes: limit(policy, 'maxFileBytes'),
    maxTotalBytes: limit(policy, 'maxTotalBytes'),
    unpackArchives: policy.unpackArchives ?? DEFAULT_UPLOAD_POLICY.unpackArchives,
    refuse: [...(policy.refuse ?? DEFAULT_UPLOAD_POLICY.refuse)],
    ...(policy.allow != null ? { allow: [...policy.allow] } : {}),
  })

  const path = (raw: string): UploadPathResult => {
    if (typeof raw !== 'string') {
      return { ok: false, issue: 'empty' }
    }
    const unified = raw.normalize('NFC').replace(/\\/g, '/')
    if (forbidden.test(unified)) {
      return { ok: false, issue: 'invalid-char' }
    }
    if (unified.startsWith('/') || /^[A-Za-z]:/.test(unified)) {
      return { ok: false, issue: 'absolute' }
    }
    const segments = unified.split('/').filter(segment => segment !== '' && segment !== '.')
    if (segments.includes('..')) {
      return { ok: false, issue: 'traversal' }
    }
    if (segments.length === 0) {
      return { ok: false, issue: 'empty' }
    }
    if (segments.length > UPLOAD_PATH_LIMITS.maxSegments) {
      return { ok: false, issue: 'too-deep' }
    }
    const normalized = segments.join('/')
    if (bytesOf(normalized) > UPLOAD_PATH_LIMITS.maxPathBytes
      || segments.some(segment => bytesOf(segment) > UPLOAD_PATH_LIMITS.maxSegmentBytes)) {
      return { ok: false, issue: 'too-long' }
    }

    return { ok: true, path: normalized, name: segments[segments.length - 1] }
  }

  const display = (raw: string): string => {
    const text = String(raw ?? '').replace(/\\/g, '/').replace(forbiddenAll, '_')
    return text.length > UPLOAD_DISPLAY_PATH_LENGTH ? `${text.slice(0, UPLOAD_DISPLAY_PATH_LENGTH - 1)}…` : text
  }

  const pathKey = (value: string): string => value.normalize('NFC').toLowerCase()

  const remaining = (policy: UploadLimits, totals: UploadTotals): UploadTotals => ({
    files: Math.max(0, policy.maxFiles - totals.files),
    bytes: Math.max(0, policy.maxTotalBytes - totals.bytes),
  })

  const fits = (policy: UploadLimits, totals: UploadTotals, add: UploadTotals): boolean =>
    totals.files + add.files <= policy.maxFiles && totals.bytes + add.bytes <= policy.maxTotalBytes

  const precheck = (candidates: UploadCandidate[], policy: UploadPolicy, options: UploadPrecheckOptions = {}): UploadPrecheck => {
    const totals: UploadTotals = { files: options.totals?.files ?? 0, bytes: options.totals?.bytes ?? 0 }
    const seen = new Set((options.paths ?? []).map(pathKey))
    const accepted: UploadAdmission[] = []
    const refused: UploadRefusal[] = []

    candidates.forEach((candidate, index) => {
      const size = Number.isFinite(candidate.size) && candidate.size > 0 ? candidate.size : 0
      const checked = path(candidate.path)
      if (!checked.ok) {
        refused.push({ index, path: display(candidate.path), size, reason: UploadReason.PathInvalid, issue: checked.issue })
        return
      }
      const key = pathKey(checked.path)
      const refuse = (reason: UploadReason): void => { refused.push({ index, path: checked.path, size, reason }) }
      if (seen.has(key)) {
        refuse(UploadReason.Duplicate)
        return
      }
      if (size > policy.maxFileBytes || !fits(policy, totals, { files: 1, bytes: size })) {
        refuse(UploadReason.Limits)
        return
      }
      seen.add(key)
      totals.files += 1
      totals.bytes += size
      accepted.push({ index, path: checked.path, name: checked.name, size })
    })

    return { accepted, refused, totals }
  }

  return { normalize, path, display, pathKey, remaining, fits, precheck }
}

export const uploadPolicyHelper = createUploadPolicyHelper()
