import { uploadInputHelper } from '@owlmeans/client-upload'
import type { UploadInput, UploadInputResult, UploadRunOptions } from '@owlmeans/client-upload'
import { UploadedFileStatus, uploadPolicyHelper } from '@owlmeans/upload'
import type { UploadedFile, UploadPolicy, UploadTotals } from '@owlmeans/upload'
import { collectDroppedFiles } from './collect.js'
import { DEFAULT_COLLECT_LIMIT, DEFAULT_UPLOAD_IGNORE, UploadEntryStatus, UploadRejectedBy } from './consts.js'
import { uploadKindHelper } from './kind.js'
import { IDLE_PROGRESS } from './store/consts.local.js'
import { evaluateQueue } from './store/evaluate.js'
import type { QueueRecord, QueueRun } from './store/types.local.js'
import type {
  UploadEntry, UploadFileLike, UploadPickedFile, UploadQueueProgress, UploadQueueSettings, UploadQueueState, UploadQueueStore,
  UploadQueueTotals, UploadSource, UploadViolation,
} from './types.js'

const isDataTransfer = (source: UploadSource): source is DataTransfer =>
  source != null && typeof source === 'object' && 'items' in source && 'types' in source && 'files' in source

const isPicked = (source: UploadSource): source is UploadPickedFile[] =>
  Array.isArray(source) && source.length > 0 && source.every(item => item != null && 'file' in item && 'path' in item)

const sum = (entries: UploadEntry[]): UploadTotals =>
  ({ files: entries.length, bytes: entries.reduce((total, entry) => total + entry.size, 0) })

/** A server row as an entry: the row an archive produced, or the one row of a sent file. */
const decidedBy = (entry: UploadEntry, row: UploadedFile): UploadEntry => ({
  ...entry,
  path: row.path,
  name: row.name,
  size: row.size,
  kind: row.kind ?? entry.kind,
  status: row.status === UploadedFileStatus.Accepted ? UploadEntryStatus.Accepted : UploadEntryStatus.Rejected,
  progress: 1,
  reason: row.reason,
  limit: undefined,
  rejectedBy: row.status === UploadedFileStatus.Accepted ? undefined : UploadRejectedBy.Server,
  error: undefined,
  httpStatus: undefined,
  server: [row],
  ...(row.from != null ? { from: row.from } : {}),
})

/**
 * An upload queue outside React: files are added and prechecked locally before any session exists,
 * then sent with `start(sessionId)` once one does. `useUploadQueue` renders it; hold the store
 * yourself (`useUploadQueue({ store })`) when the queue must outlive the screen that filled it.
 */
export const createUploadQueueStore = (settings: UploadQueueSettings = {}): UploadQueueStore => {
  let policy: UploadPolicy = uploadPolicyHelper.normalize(settings.policy)
  let client = settings.client
  let concurrency = settings.concurrency
  let retries = settings.retries
  let ignore = settings.ignore ?? DEFAULT_UPLOAD_IGNORE
  let collectLimit = settings.collectLimit ?? DEFAULT_COLLECT_LIMIT
  let records: QueueRecord[] = []
  let violations: UploadViolation[] = []
  let sessionId: string | undefined
  let run: QueueRun | null = null
  const listeners = new Set<() => void>()
  const prefix = Math.random().toString(36).slice(2, 8)
  let sequence = 0

  const totalsOf = (entries: UploadEntry[]): UploadQueueTotals => {
    const of = (...statuses: UploadEntryStatus[]): UploadEntry[] => entries.filter(entry => statuses.includes(entry.status))
    const pending = sum(of(UploadEntryStatus.Queued, UploadEntryStatus.Failed))
    const accepted = sum(of(UploadEntryStatus.Accepted))
    const uploading = of(UploadEntryStatus.Uploading)
    const planned = {
      files: accepted.files + uploading.length + pending.files,
      bytes: accepted.bytes + sum(uploading).bytes + pending.bytes,
    }

    return {
      pending, accepted, uploading: uploading.length, rejected: of(UploadEntryStatus.Rejected).length,
      failed: of(UploadEntryStatus.Failed).length, planned, remaining: uploadPolicyHelper.remaining(policy, planned),
    }
  }

  const progressOf = (): UploadQueueProgress => {
    if (run == null) {
      return IDLE_PROGRESS
    }
    const ids = run.ids
    const current = records.filter(record => ids.has(record.entry.id))
    const loaded = current.reduce((total, record) =>
      total + (record.entry.status === UploadEntryStatus.Uploading ? record.loaded : record.entry.size), 0)
    const total = current.reduce((all, record) => all + record.entry.size, 0)

    return {
      loaded, total, ratio: total > 0 ? Math.min(1, loaded / total) : 0, count: current.length,
      settled: current.filter(record => record.entry.status !== UploadEntryStatus.Uploading).length,
    }
  }

  const build = (): UploadQueueState => {
    const entries = records.map(record => record.entry)

    return {
      entries, policy, totals: totalsOf(entries), violations, uploading: run != null, progress: progressOf(),
      ...(sessionId != null ? { sessionId } : {}),
    }
  }

  let snapshot = build()

  const publish = (): void => {
    snapshot = build()
    listeners.forEach(listener => listener())
  }

  const commit = (): void => {
    const evaluated = evaluateQueue(records, policy)
    records = evaluated.records
    violations = evaluated.violations
    publish()
  }

  const update = (id: string, change: (record: QueueRecord) => QueueRecord): void => {
    records = records.map(record => record.entry.id === id ? change(record) : record)
  }

  const ignored = (path: string): boolean => path.split(/[\\/]/).some(segment => ignore.includes(segment))

  const recordOf = ({ file, path }: UploadPickedFile): QueueRecord => {
    const checked = uploadPolicyHelper.path(path)
    const shown = checked.ok ? checked.path : uploadPolicyHelper.display(path)
    const name = checked.ok ? checked.name : shown.split('/').filter(segment => segment !== '').at(-1) ?? shown
    const type = file.type ?? ''

    return {
      raw: path,
      loaded: 0,
      entry: {
        id: `${prefix}-${++sequence}`, path: shown, name, size: file.size, type, kind: uploadKindHelper.guess(name, type), file,
        status: UploadEntryStatus.Queued, progress: 0,
      },
    }
  }

  const add: UploadQueueStore['add'] = async source => {
    // A DataTransfer is read synchronously here, inside the drop or paste handler that called `add`.
    const picked = isDataTransfer(source)
      ? await collectDroppedFiles(source, { ignore, limit: collectLimit })
      : isPicked(source)
        ? source
        : uploadInputHelper.fromFiles(source as Iterable<UploadFileLike>).map(input => ({ file: input.body as Blob, path: input.path }))
    const created = picked.filter(item => !ignored(item.path)).map(recordOf)
    if (created.length === 0) {
      return []
    }
    records = [...records, ...created]
    commit()
    const ids = new Set(created.map(record => record.entry.id))

    return records.filter(record => ids.has(record.entry.id)).map(record => record.entry)
  }

  const remove: UploadQueueStore['remove'] = async id => {
    const record = records.find(known => known.entry.id === id)
    if (record == null || record.entry.status === UploadEntryStatus.Uploading) {
      return
    }
    const rows = record.entry.server ?? []
    if (rows.length > 0 && sessionId != null && client != null) {
      for (const row of rows) {
        await client.remove(sessionId, row.id)
      }
    }
    records = records.filter(known => known.entry.id !== id)
    commit()
  }

  const abort: UploadQueueStore['abort'] = () => {
    run?.controller.abort()
  }

  const clear: UploadQueueStore['clear'] = () => {
    abort()
    records = []
    commit()
  }

  /** The records of a finished run: each sent entry decided, failed, back in the queue, or replaced by what its archive produced. */
  const settle = (sent: QueueRecord[], results: UploadInputResult[], aborted: boolean): UploadEntry[] => {
    const indexOf = new Map(sent.map((record, index) => [record.entry.id, index]))
    const settled: UploadEntry[] = []
    records = records.flatMap(record => {
      const index = indexOf.get(record.entry.id)
      if (index == null) {
        return [record]
      }
      const result = results[index]
      const entry = record.entry
      let next: UploadEntry[]
      if (result?.refused != null) {
        next = [{
          ...entry, path: result.path, status: UploadEntryStatus.Rejected, rejectedBy: UploadRejectedBy.Server,
          reason: result.refused, progress: 0,
        }]
      } else if (result == null || result.files.length === 0) {
        next = [aborted
          ? { ...entry, status: UploadEntryStatus.Queued, progress: 0, error: undefined, httpStatus: undefined }
          : {
            ...entry, status: UploadEntryStatus.Failed, progress: 0, error: result?.error,
            ...(result?.status != null ? { httpStatus: result.status } : { httpStatus: undefined }),
          }]
      } else if (result.files.length === 1 && result.files[0].from == null) {
        next = [decidedBy(entry, result.files[0])]
      } else {
        next = result.files.map(row => ({
          ...decidedBy({ ...entry, id: `${entry.id}/${row.id}`, file: undefined }, row),
          type: row.mime ?? '',
          kind: row.kind ?? uploadKindHelper.guess(row.name, row.mime),
          from: row.from ?? entry.path,
        }))
      }
      settled.push(...next)

      return next.map(produced => ({ raw: produced.path, loaded: 0, entry: produced }))
    })

    return settled
  }

  const start: UploadQueueStore['start'] = async (id, options = {}) => {
    if (run != null) {
      return await run.promise
    }
    const uploader = client
    if (uploader == null) {
      throw new SyntaxError('An upload queue needs a client (or protocols) to start')
    }
    sessionId = id
    const sent = records.filter(record =>
      (record.entry.status === UploadEntryStatus.Queued || record.entry.status === UploadEntryStatus.Failed) && record.entry.file != null)
    if (sent.length === 0) {
      publish()
      return []
    }
    const controller = new AbortController()
    const external = options.signal
    const follow = (): void => controller.abort(external?.reason)
    if (external?.aborted === true) {
      follow()
    } else {
      external?.addEventListener('abort', follow, { once: true })
    }
    const ids = sent.map(record => record.entry.id)
    for (const known of ids) {
      update(known, record => ({
        ...record, loaded: 0,
        entry: { ...record.entry, status: UploadEntryStatus.Uploading, progress: 0, error: undefined, httpStatus: undefined },
      }))
    }
    const inputs: UploadInput[] = sent.map(record => ({
      path: record.entry.path, body: record.entry.file!, size: record.entry.size,
      ...(record.entry.type !== '' ? { type: record.entry.type } : {}),
    }))
    const runOptions: UploadRunOptions = {
      signal: controller.signal,
      ...(concurrency != null ? { concurrency } : {}),
      ...(retries != null ? { retries } : {}),
      ...(options.session != null ? { session: options.session } : {}),
      ...(options.precheck != null ? { precheck: options.precheck } : {}),
      onProgress: file => {
        const record = sent[file.index]
        if (record == null || file.state !== 'sending') {
          return
        }
        update(record.entry.id, current => current.entry.status !== UploadEntryStatus.Uploading ? current : {
          ...current, loaded: file.loaded,
          entry: { ...current.entry, progress: file.total != null && file.total > 0 ? Math.min(1, file.loaded / file.total) : 0 },
        })
        publish()
      },
    }

    const promise = (async (): Promise<UploadEntry[]> => {
      let results: UploadInputResult[]
      try {
        results = await uploader.upload(id, inputs, runOptions)
      } catch (error) {
        // Nothing was sent: the session's state could not be read for the precheck.
        results = inputs.map((input, index) => ({ index, path: input.path, files: [], error }))
      }
      external?.removeEventListener('abort', follow)
      const settled = settle(sent, results, controller.signal.aborted)
      run = null
      commit()

      return settled
    })()
    run = { controller, ids: new Set(ids), promise }
    publish()

    return await promise
  }

  const configure: UploadQueueStore['configure'] = next => {
    client = next.client ?? client
    concurrency = next.concurrency ?? concurrency
    retries = next.retries ?? retries
    ignore = next.ignore ?? ignore
    collectLimit = next.collectLimit ?? collectLimit
    if (next.policy != null) {
      const normalized = uploadPolicyHelper.normalize(next.policy)
      if (JSON.stringify(normalized) !== JSON.stringify(policy)) {
        policy = normalized
        commit()
      }
    }
  }

  const state: UploadQueueStore['state'] = () => snapshot

  const subscribe: UploadQueueStore['subscribe'] = listener => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  return { state, subscribe, configure, add, remove, clear, start, abort }
}
