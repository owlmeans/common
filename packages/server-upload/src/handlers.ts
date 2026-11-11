import { randomUUID } from 'node:crypto'
import { makeEntityScope } from '@owlmeans/auth-common'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { AbstractRequest, EntrypointProtocolDeclaration } from '@owlmeans/entrypoint'
import { handlers, streamedBody } from '@owlmeans/server-api'
import { bind } from '@owlmeans/server-entrypoint'
import type { ServerProtocolEntrypoint } from '@owlmeans/server-entrypoint'
import { UPLOAD_FILE_PARAM, UploadSessionNotFoundError, uploadSessionParamOf } from '@owlmeans/upload'
import type { UploadProtocols, UploadSessionParams, UploadSessionProtocol } from '@owlmeans/upload'
import type { UploadHandlerOptions, UploadHandlers, UploadMember } from './handlers/types.js'
import type { UploadService } from './service/types.js'
import type { UploadSessionState } from './types.js'
import { drain } from './utils/drain.js'
import { uploadSessionView } from './view.js'

/**
 * HTTP handlers over an upload service. The session parameter is read from each protocol's own path;
 * a session another owner opened answers 404 like one that does not exist.
 */
export const makeUploadHandlers = (service: UploadService, options: UploadHandlerOptions): UploadHandlers => {
  const api = handlers<BasicContext<BasicConfig>>()

  const ownerOf = async (request: AbstractRequest): Promise<string | undefined> =>
    options.ownerOf != null ? await options.ownerOf(request) : makeEntityScope(request).entityKeyOf()

  const sessionOf = async (request: AbstractRequest, protocol: UploadSessionProtocol): Promise<UploadSessionState> => {
    const id = (request.params as UploadSessionParams | undefined)?.[uploadSessionParamOf(protocol)] ?? ''
    const state = id !== '' ? await service.load(id) : null
    if (state == null || state.owner !== await ownerOf(request)) {
      throw new UploadSessionNotFoundError(id)
    }

    return state
  }

  const open: UploadHandlers['open'] = protocol => api.request(protocol, async request => {
    const owner = await ownerOf(request)
    const id = (await options.idOf?.(request)) ?? randomUUID()
    const scope = await options.scopeOf(request, { id })
    const expect = request.body?.expect

    return uploadSessionView(await service.open({ id, scope, ...(owner != null ? { owner } : {}), ...(expect != null ? { expect } : {}) }))
  })

  const state: UploadHandlers['state'] = protocol => api.request(protocol, async request =>
    uploadSessionView(await sessionOf(request, protocol)))

  const file: UploadHandlers['file'] = protocol => api.request(protocol, async request => {
    const body = streamedBody(request)
    try {
      const session = await sessionOf(request, protocol)
      const query = request.query
      const files = await service.receive(session.id, {
        path: query.path, stream: body.stream,
        ...(body.length != null ? { length: body.length } : {}),
        ...(query.size != null ? { size: query.size } : {}),
        ...(query.type != null && query.type !== '' ? { type: query.type } : {}),
      })
      return { files }
    } finally {
      await drain(body.stream)
    }
  })

  const remove: UploadHandlers['remove'] = protocol => api.request(protocol, async request => {
    const session = await sessionOf(request, protocol)
    return uploadSessionView(await service.remove(session.id, request.params[UPLOAD_FILE_PARAM]))
  })

  const seal: UploadHandlers['seal'] = protocol => api.request(protocol, async request =>
    uploadSessionView(await service.seal((await sessionOf(request, protocol)).id)))

  const abort: UploadHandlers['abort'] = protocol => api.request(protocol, async request =>
    uploadSessionView(await service.abort((await sessionOf(request, protocol)).id)))

  const serve: UploadHandlers['serve'] = (protocols: UploadProtocols, members?: UploadMember[]) => {
    const wanted = (member: UploadMember): boolean => members == null || members.includes(member)
    const bound: Array<ServerProtocolEntrypoint<EntrypointProtocolDeclaration>> = [bind(protocols.base)]
    if (wanted('open')) bound.push(bind(protocols.open, open(protocols.open)))
    if (wanted('state')) bound.push(bind(protocols.state, state(protocols.state)))
    if (wanted('file')) bound.push(bind(protocols.file, file(protocols.file)))
    if (wanted('remove')) bound.push(bind(protocols.remove, remove(protocols.remove)))
    if (wanted('seal')) bound.push(bind(protocols.seal, seal(protocols.seal)))
    if (wanted('abort')) bound.push(bind(protocols.abort, abort(protocols.abort)))

    return bound
  }

  return { open, state, file, remove, seal, abort, serve }
}
