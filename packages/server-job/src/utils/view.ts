import { JobViewStatus } from '@owlmeans/job'
import type { JobJson, JobProgressView, JobView, PublicJobError } from '@owlmeans/job'
import { JobState } from '@owlmeans/queue'
import type { JobRecord } from '@owlmeans/queue'

export interface JobViewFields {
  id: string
  kind: string
  summary?: string
  metadata?: Record<string, JobJson>
  result?: JobJson
  error?: PublicJobError
  cancellable?: boolean
}

const MAX_JSON_DEPTH = 8
const MAX_JSON_ITEMS = 100
const MAX_JSON_STRING = 16_384
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

/** Copy JSON through bounded, prototype-free containers and discard every non-JSON value. */
export const sanitizeJobJson = (value: unknown, depth: number = 0): JobJson | undefined => {
  if (depth > MAX_JSON_DEPTH) return undefined
  if (value == null || typeof value === 'boolean' || typeof value === 'string') {
    return typeof value === 'string' ? value.slice(0, MAX_JSON_STRING) : value
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (Array.isArray(value)) {
    return value.slice(0, MAX_JSON_ITEMS)
      .map(item => sanitizeJobJson(item, depth + 1))
      .filter((item): item is JobJson => item !== undefined)
  }
  if (typeof value !== 'object') return undefined

  const result: Record<string, JobJson> = Object.create(null) as Record<string, JobJson>
  for (const [key, item] of Object.entries(value).slice(0, MAX_JSON_ITEMS)) {
    if (FORBIDDEN_KEYS.has(key)) continue
    const safe = sanitizeJobJson(item, depth + 1)
    if (safe !== undefined) result[key] = safe
  }
  return result
}

const sanitizeError = (error: PublicJobError | undefined): PublicJobError | undefined => error == null
  ? undefined
  : {
      type: error.type.slice(0, 128),
      message: error.message.slice(0, 2048),
    }

const statusOf = (state?: JobState): JobViewStatus => {
  switch (state) {
    case JobState.Active: return JobViewStatus.Running
    case JobState.Completed: return JobViewStatus.Succeeded
    case JobState.Failed: return JobViewStatus.Failed
    default: return JobViewStatus.Queued
  }
}

const progressOf = (value: unknown): JobProgressView | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return { percent: value }
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const progress: JobProgressView = {}
  if (typeof raw.percent === 'number' && Number.isFinite(raw.percent)) progress.percent = raw.percent
  if (typeof raw.done === 'number' && Number.isFinite(raw.done)) progress.done = raw.done
  if (typeof raw.total === 'number' && Number.isFinite(raw.total)) progress.total = raw.total
  if (typeof raw.message === 'string') progress.message = raw.message.slice(0, 512)
  return Object.keys(progress).length === 0 ? undefined : progress
}

/** Build a public view from fields an application explicitly allowlisted. */
export const jobViewOf = (record: JobRecord, fields: JobViewFields): JobView => {
  const createdAt = record.createdAt ?? new Date(0).toISOString()
  const updatedAt = record.finishedAt ?? record.startedAt ?? createdAt
  const progress = progressOf(record.progress)
  const metadata = sanitizeJobJson(fields.metadata)
  const result = sanitizeJobJson(fields.result)
  const error = sanitizeError(fields.error)
  return {
    id: fields.id,
    kind: fields.kind.slice(0, 128),
    status: statusOf(record.state),
    ...(progress == null ? {} : { progress }),
    ...(fields.summary == null ? {} : { summary: fields.summary.slice(0, 2048) }),
    ...(metadata == null || Array.isArray(metadata) || typeof metadata !== 'object'
      ? {} : { metadata }),
    ...(result === undefined ? {} : { result }),
    ...(error == null ? {} : { error }),
    cancellable: fields.cancellable ?? false,
    createdAt,
    updatedAt,
    ...(record.startedAt == null ? {} : { startedAt: record.startedAt }),
    ...(record.finishedAt == null ? {} : { finishedAt: record.finishedAt }),
  }
}

/** Safe default for a broker failure; raw reasons and stacks never cross the boundary. */
export const publicJobError = (type: string = 'job-failed'): PublicJobError => ({
  type,
  message: 'The background operation failed.',
})
