import { logger } from '@owlmeans/log'
import { UploadedFileStatus, UploadReason, UploadRejectedError } from '@owlmeans/upload'
import type { UploadedFile } from '@owlmeans/upload'
import type { UploadReceiver, UploadSessionState } from '../types.js'
import type { ForwardingContext, ForwardingProtocols, ForwardingReceiverOptions } from './types.js'

const log = logger('server-upload:forwarding')

/**
 * Accepted files streamed on to another service's upload route (`file` of a `makeUploadProtocols`
 * tree, client-bound in `ctx`) — a raw body with the path and size in the query, the receiving side
 * verifying again. Its answer must be exactly one accepted file (give that service
 * `unpackArchives: false`); a rejection there rejects the file here with the same reason. `remove`,
 * `seal` and `abort` are mirrored when the tree carries them. The remote session must exist already.
 */
export const forwardingReceiver = (
  ctx: ForwardingContext, protocols: ForwardingProtocols, options: ForwardingReceiverOptions,
): UploadReceiver => {
  const call = options.call ?? {}

  const drop = async (session: UploadSessionState, files: UploadedFile[]): Promise<void> => {
    if (protocols.remove == null) {
      return
    }
    for (const file of files) {
      try {
        await ctx.entrypoint(protocols.remove).call({ ...call, params: { ...await options.paramsOf(session), file: file.id } })
      } catch (error) {
        log.warn('Forwarded upload not removed', { session: session.id, error })
      }
    }
  }

  const receiver: UploadReceiver = {
    receive: async (session, file, source) => {
      const { stream } = await source.open()
      const answer = await ctx.entrypoint(protocols.file).call({
        ...call,
        params: await options.paramsOf(session),
        query: { path: file.path, size: file.size, ...(file.mime != null ? { type: file.mime } : {}) },
        body: stream,
      })
      const taken = answer.files.filter(known => known.status === UploadedFileStatus.Accepted)
      if (answer.files.length === 1 && taken.length === 1) {
        return { ref: taken[0].id }
      }
      await drop(session, taken)
      throw new UploadRejectedError(answer.files.find(known => known.reason != null)?.reason ?? UploadReason.RefusedKind)
    },
  }
  if (protocols.remove != null) {
    const remove = protocols.remove
    receiver.remove = async (session, _file, ref) => {
      if (ref != null) {
        await ctx.entrypoint(remove).call({ ...call, params: { ...await options.paramsOf(session), file: ref } })
      }
    }
  }
  if (protocols.seal != null) {
    const seal = protocols.seal
    receiver.seal = async session => { await ctx.entrypoint(seal).call({ ...call, params: await options.paramsOf(session) }) }
  }
  if (protocols.abort != null) {
    const abort = protocols.abort
    receiver.abort = async session => { await ctx.entrypoint(abort).call({ ...call, params: await options.paramsOf(session) }) }
  }

  return receiver
}
