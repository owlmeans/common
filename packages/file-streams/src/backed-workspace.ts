import { logger } from '@owlmeans/log'
import { fileScopeHelper } from '@owlmeans/storage-common'
import type { FileScope } from '@owlmeans/storage-common'
import type {
  BackedPutOptions, BackedPutResult, BackedRestoreResult, BackedScope, BackedWorkspace, BackedWorkspaceOptions,
} from './backed-workspace/types.js'
import type { S3ListedObject } from './s3/types.js'
import { transferHelper } from './transfer.js'
import type { FileSource, SignalOptions } from './types.js'
import { pathUtils } from './utils/paths.js'

const log = logger('file-streams:workspace')

/** A workspace mirrored to a bucket under the same nesting, so a restarted pod restores its scopes. */
export const createBackedWorkspace = (options: BackedWorkspaceOptions): BackedWorkspace => {
  const { workspace, bucket } = options
  const transfer = options.transfer ?? transferHelper
  const prefix = options.prefix != null && options.prefix.replace(/^\/+|\/+$/g, '') !== '' ? pathUtils.entry(options.prefix) : ''

  const scope = (value: FileScope): BackedScope => {
    const local = workspace.scope(value)
    const base = prefix === '' ? fileScopeHelper.pathOf(value) : `${prefix}/${fileScopeHelper.pathOf(value)}`

    const prefixOf = (path: string): string => `${base}/${pathUtils.entry(path)}`

    const key = (path: string): string => bucket.keyOf(prefixOf(path))

    const put = async (path: string, source: FileSource, putOptions: BackedPutOptions = {}): Promise<BackedPutResult> => {
      const { onConflict = 'overwrite', ...transferOptions } = putOptions
      const remotePrefix = prefixOf(path)
      const copied = await transfer.copy(source, local.entry(path, { onConflict }), transferOptions)
      try {
        const opened = await local.source(path, { name: copied.info.name, mime: copied.sink.mime }).open({ signal: putOptions.signal })
        const remote = await bucket.sink(remotePrefix, options.sink).write(
          { stream: opened.stream, info: { ...opened.info, mime: copied.sink.mime ?? opened.info.mime }, verdict: copied.verdict },
          { signal: putOptions.signal }
        )
        return { local: copied.sink, remote, transfer: copied }
      } catch (error) {
        await local.remove(path).catch(removeError => log.warn('Local copy left after a failed upload', removeError as Error))
        throw error
      }
    }

    const list = async (listOptions: SignalOptions = {}): Promise<S3ListedObject[]> =>
      (await bucket.list(base, listOptions)).filter(item => !item.path.endsWith('/'))

    const restore = async (restoreOptions: SignalOptions = {}): Promise<BackedRestoreResult> => {
      const remote = await list(restoreOptions)
      const present = new Map((await local.list()).map(file => [file.path, file.size]))
      const result: BackedRestoreResult = { restored: [], kept: [] }
      for (const item of remote) {
        if (present.get(item.path) === item.size) {
          result.kept.push(item.path)
          continue
        }
        await transfer.copy(bucket.source(prefixOf(item.path)), local.entry(item.path, { onConflict: 'overwrite' }), {
          verify: false, signal: restoreOptions.signal,
        })
        result.restored.push(item.path)
      }
      log.debug('Workspace scope restored', { restored: result.restored.length, kept: result.kept.length })

      return result
    }

    const remove = async (path: string, removeOptions: SignalOptions = {}): Promise<void> => {
      await local.remove(path)
      await bucket.remove(prefixOf(path), removeOptions)
      await bucket.removePrefix(prefixOf(path), removeOptions)
    }

    const evict = async (): Promise<void> => { await local.drop() }

    const drop = async (dropOptions: SignalOptions = {}): Promise<void> => {
      await local.drop()
      const removed = await bucket.removePrefix(base, dropOptions)
      log.debug('Backed workspace scope dropped', { objects: removed })
    }

    return { scope: local.scope, local, key, prefixOf, put, restore, list, remove, evict, drop }
  }

  return { workspace, bucket, scope }
}
