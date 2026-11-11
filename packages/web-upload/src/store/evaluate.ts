import { UploadReason, uploadPolicyHelper } from '@owlmeans/upload'
import type { UploadPolicy, UploadTotals } from '@owlmeans/upload'
import { UploadEntryStatus, UploadRejectedBy } from '../consts.js'
import type { UploadEntry, UploadLimitKind, UploadViolation } from '../types.js'
import type { QueueEvaluation, QueueRecord } from './types.local.js'

/** Still to send — the precheck decides it again whenever the queue changes. */
const pendingOf = (entry: UploadEntry): boolean => entry.status === UploadEntryStatus.Queued
  || entry.status === UploadEntryStatus.Failed
  || (entry.status === UploadEntryStatus.Rejected && entry.rejectedBy === UploadRejectedBy.Precheck)

/** Already counted by the session (or about to be). */
const heldOf = (entry: UploadEntry): boolean =>
  entry.status === UploadEntryStatus.Accepted || entry.status === UploadEntryStatus.Uploading

const nameOf = (path: string): string => path.split('/').filter(segment => segment !== '').at(-1) ?? path

/**
 * `uploadPolicyHelper.precheck` over every pending entry, in order, against what the queue already
 * holds: each entry queued (a failed one stays failed) or rejected with the reason — and, for
 * `limits`, which limit — plus the queue-wide violations behind those refusals.
 */
export const evaluateQueue = (records: QueueRecord[], policy: UploadPolicy): QueueEvaluation => {
  const held = records.filter(record => heldOf(record.entry))
  const pending = records.filter(record => pendingOf(record.entry))
  const base: UploadTotals = { files: held.length, bytes: held.reduce((sum, record) => sum + record.entry.size, 0) }
  const checked = uploadPolicyHelper.precheck(
    pending.map(record => ({ path: record.raw, size: record.entry.size })), policy,
    { totals: base, paths: held.map(record => record.entry.path) },
  )
  const admitted = new Map(checked.accepted.map(admission => [admission.index, admission]))
  const refused = new Map(checked.refused.map(refusal => [refusal.index, refusal]))
  const running: UploadTotals = { ...base }
  const wanted: UploadTotals = { ...base }
  const limited: Record<UploadLimitKind, UploadEntry[]> = { 'file-bytes': [], files: [], 'total-bytes': [] }
  const decided = new Map<string, UploadEntry>()

  pending.forEach(({ entry }, index) => {
    const admission = admitted.get(index)
    if (admission != null) {
      running.files += 1
      running.bytes += admission.size
      wanted.files += 1
      wanted.bytes += admission.size
      decided.set(entry.id, {
        ...entry, path: admission.path, name: admission.name,
        status: entry.status === UploadEntryStatus.Failed ? UploadEntryStatus.Failed : UploadEntryStatus.Queued,
        reason: undefined, limit: undefined, rejectedBy: undefined,
      })
      return
    }
    const refusal = refused.get(index)!
    let limit: UploadLimitKind | undefined
    if (refusal.reason === UploadReason.Limits) {
      limit = refusal.size > policy.maxFileBytes ? 'file-bytes' : running.files + 1 > policy.maxFiles ? 'files' : 'total-bytes'
      if (limit !== 'file-bytes') {
        wanted.files += 1
        wanted.bytes += refusal.size
      }
    }
    const next: UploadEntry = {
      ...entry, path: refusal.path, name: nameOf(refusal.path), status: UploadEntryStatus.Rejected,
      rejectedBy: UploadRejectedBy.Precheck, reason: refusal.reason, limit, progress: 0, error: undefined, httpStatus: undefined,
    }
    if (limit != null) {
      limited[limit].push(next)
    }
    decided.set(entry.id, next)
  })

  const violations: UploadViolation[] = []
  if (limited.files.length > 0) {
    violations.push({ code: 'max-files', limit: policy.maxFiles, actual: wanted.files, entries: limited.files.map(entry => entry.id) })
  }
  if (limited['total-bytes'].length > 0) {
    violations.push({
      code: 'max-total-bytes', limit: policy.maxTotalBytes, actual: wanted.bytes, entries: limited['total-bytes'].map(entry => entry.id),
    })
  }
  if (limited['file-bytes'].length > 0) {
    violations.push({
      code: 'max-file-bytes', limit: policy.maxFileBytes, actual: Math.max(...limited['file-bytes'].map(entry => entry.size)),
      entries: limited['file-bytes'].map(entry => entry.id),
    })
  }

  return {
    records: records.map(record => {
      const entry = decided.get(record.entry.id)
      return entry != null ? { ...record, entry } : record
    }),
    violations,
  }
}
