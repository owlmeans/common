import { apiStatusHelper } from '@owlmeans/api/status'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import {
  UPLOAD_FILE_PARAM, UploadedFileStatus, uploadPolicyHelper, uploadSessionParamOf,
} from '@owlmeans/upload'
import type { UploadProtocols, UploadSessionParams } from '@owlmeans/upload'
import type {
  UploadClient, UploadFileProgress, UploadInputResult, UploadOverallProgress, UploadRunOptions,
} from './client/types.js'
import { DEFAULT_UPLOAD_CONCURRENCY, DEFAULT_UPLOAD_RETRIES, UPLOAD_RETRY_DELAY_MS, UPLOAD_RETRY_STATUSES } from './consts.js'
import { uploadInputHelper } from './input.js'
import type { UploadInput } from './types.js'

/** A pause that an abort ends early. */
const pause = async (ms: number, signal?: AbortSignal): Promise<void> => await new Promise(resolve => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
})

/**
 * The upload calls over a tree the context binds with client entrypoints (`bindAll(protocols)` of
 * `@owlmeans/client-entrypoint`) — in a browser, or in a Bun process forwarding files or reading them
 * from disk (`./node`).
 */
export const makeUploadClient = (ctx: BasicContext<BasicConfig>, protocols: UploadProtocols): UploadClient => {
  const param = uploadSessionParamOf(protocols.file)
  const paramsOf = (id: string): UploadSessionParams => ({ [param]: id })

  const open: UploadClient['open'] = async (request = {}) => await ctx.entrypoint(protocols.open).call({ body: request })

  const state: UploadClient['state'] = async id => await ctx.entrypoint(protocols.state).call({ params: paramsOf(id) })

  const remove: UploadClient['remove'] = async (id, fileId) =>
    await ctx.entrypoint(protocols.remove).call({ params: { ...paramsOf(id), [UPLOAD_FILE_PARAM]: fileId } })

  const seal: UploadClient['seal'] = async id => await ctx.entrypoint(protocols.seal).call({ params: paramsOf(id) })

  const abort: UploadClient['abort'] = async id => await ctx.entrypoint(protocols.abort).call({ params: paramsOf(id) })

  const upload: UploadClient['upload'] = async (id, inputs, options: UploadRunOptions = {}) => {
    const signal = options.signal
    const aborted = (): boolean => signal?.aborted === true
    const retries = options.retries ?? DEFAULT_UPLOAD_RETRIES
    const sizes = inputs.map(input => input.size ?? uploadInputHelper.sizeOf(input.body))
    const results: UploadInputResult[] = inputs.map((input, index) => ({ index, path: input.path, files: [] }))
    const progress: UploadFileProgress[] = inputs.map((input, index) => ({
      index, path: input.path, loaded: 0, ...(sizes[index] != null ? { total: sizes[index] } : {}), state: 'queued',
    }))
    let queue = inputs.map((_input, index) => index)

    const overall = (): UploadOverallProgress => {
      const sent = progress.filter(item => item.state !== 'refused')
      return {
        loaded: sent.reduce((sum, item) => sum + item.loaded, 0),
        total: sent.reduce((sum, item) => sum + (item.total ?? 0), 0),
        settled: progress.filter(item => item.state === 'done' || item.state === 'refused' || item.state === 'failed').length,
        count: progress.length,
      }
    }
    const emit = (index: number): void => { options.onProgress?.({ ...progress[index] }, overall()) }

    if (options.precheck !== false) {
      const session = options.session ?? await state(id)
      const checked = uploadPolicyHelper.precheck(
        inputs.map((input, index) => ({ path: input.path, size: sizes[index] ?? 0 })), session.policy,
        {
          totals: session.totals,
          paths: session.files.filter(file => file.status === UploadedFileStatus.Accepted).map(file => file.path),
        },
      )
      for (const refusal of checked.refused) {
        results[refusal.index] = { ...results[refusal.index], path: refusal.path, refused: refusal.reason }
        progress[refusal.index] = { ...progress[refusal.index], path: refusal.path, state: 'refused' }
        emit(refusal.index)
      }
      for (const admitted of checked.accepted) {
        results[admitted.index].path = admitted.path
        progress[admitted.index].path = admitted.path
      }
      queue = checked.accepted.map(admitted => admitted.index)
    }

    const fail = (index: number, error: unknown): void => {
      const status = apiStatusHelper.httpStatusOf(error)
      results[index] = { ...results[index], error, ...(status != null ? { status } : {}) }
      progress[index].state = 'failed'
      emit(index)
    }

    const send = async (index: number): Promise<void> => {
      const input: UploadInput = inputs[index]
      for (let attempt = 0; ; attempt++) {
        if (aborted()) {
          fail(index, signal?.reason)
          return
        }
        progress[index] = { ...progress[index], loaded: 0, state: 'sending' }
        emit(index)
        try {
          const answer = await ctx.entrypoint(protocols.file).call({
            ...options.call,
            params: paramsOf(id),
            query: {
              path: results[index].path,
              ...(sizes[index] != null ? { size: sizes[index] } : {}),
              ...(input.type != null && input.type !== '' ? { type: input.type } : {}),
            },
            body: await uploadInputHelper.bodyOf(input.body),
            ...(signal != null ? { signal } : {}),
            onUploadProgress: event => {
              progress[index].loaded = event.loaded
              if (event.total != null) progress[index].total = event.total
              emit(index)
            },
          })
          results[index].files = answer.files
          progress[index] = {
            ...progress[index], loaded: progress[index].total ?? progress[index].loaded, state: 'done',
          }
          emit(index)
          return
        } catch (error) {
          const status = apiStatusHelper.httpStatusOf(error)
          const retry = !aborted() && attempt < retries && uploadInputHelper.isReusable(input.body)
            && (status == null || UPLOAD_RETRY_STATUSES.includes(status))
          if (!retry) {
            fail(index, error)
            return
          }
          await pause(UPLOAD_RETRY_DELAY_MS * 2 ** attempt, signal)
        }
      }
    }

    const workers = Array.from({ length: Math.max(1, Math.min(options.concurrency ?? DEFAULT_UPLOAD_CONCURRENCY, queue.length)) }, async () => {
      for (let next = queue.shift(); next != null; next = queue.shift()) {
        await send(next)
      }
    })
    await Promise.all(workers)

    return results
  }

  return { open, state, upload, remove, seal, abort }
}
