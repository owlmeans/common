import type { EntrypointProtocol, OpenRequest, OpenValue } from '@owlmeans/entrypoint'
import type { ResourceRecord } from '@owlmeans/resource'
import type { RouteParent } from '@owlmeans/route'
import type { JobViewStatus } from './consts.js'

export type JobJson = null | boolean | number | string | JobJson[] | { [key: string]: JobJson }

export interface JobProgressView {
  percent?: number
  done?: number
  total?: number
  message?: string
}

export interface PublicJobError {
  type: string
  message: string
}

/** The only application-job shape allowed across a browser boundary. */
export interface JobView extends ResourceRecord {
  id: string
  kind: string
  status: JobViewStatus
  progress?: JobProgressView
  summary?: string
  metadata?: Record<string, JobJson>
  result?: JobJson
  error?: PublicJobError
  cancellable: boolean
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
}

export type JobViewEvent =
  | { type: 'upsert', job: JobView }
  | { type: 'remove', id: string }

export interface JobListQuery {
  status?: JobViewStatus
  kind?: string
  page?: number
  size?: number
}

export interface JobEntrypointAliases {
  base: string
  list: string
  get: string
  cancel: string
  watch: string
}

export interface JobEntrypoints {
  base: EntrypointProtocol<OpenRequest, OpenValue>
  list: EntrypointProtocol<{ query: JobListQuery }, unknown>
  get: EntrypointProtocol<{ params: { id: string } }, unknown>
  cancel: EntrypointProtocol<{ params: { id: string } }, unknown>
  watch: EntrypointProtocol<OpenRequest, void>
}

export interface JobEntrypointOptions {
  path?: string
  parent?: RouteParent
  service?: string
  guard?: string | null
}
