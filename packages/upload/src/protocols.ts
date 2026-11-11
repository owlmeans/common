import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import type { BinaryBody, EntrypointOptions } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod, streamBody } from '@owlmeans/route'
import type { RouteOptions } from '@owlmeans/route'
import { DEFAULT_UPLOAD_ALIAS, DEFAULT_UPLOAD_SESSION_PARAM, UPLOAD_FILE_PARAM } from './consts.js'
import { UploadFileQuerySchema, UploadOpenRequestSchema, uploadParamsSchema } from './schemas.js'
import type { UploadProtocolOptions, UploadProtocols } from './protocols/types.js'
import type {
  UploadFileQuery, UploadFileResult, UploadOpenRequest, UploadSession, UploadSessionParams,
} from './types.js'

/**
 * The upload protocol tree. A tree with a `parent` inherits its guards and gate; one without may carry
 * `guards`/`gate` itself (an ungated tree is a guest upload — the session id is then the capability).
 */
export const makeUploadProtocols = (opts: UploadProtocolOptions): UploadProtocols => {
  const alias = opts.alias ?? DEFAULT_UPLOAD_ALIAS
  const param = opts.sessionParam ?? DEFAULT_UPLOAD_SESSION_PARAM
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(param) || param === UPLOAD_FILE_PARAM) {
    throw new SyntaxError(`upload: the session parameter "${param}" is not a route parameter name`)
  }

  const located = (options: RouteOptions): RouteOptions => opts.service != null ? { ...options, service: opts.service } : options
  const baseOptions: EntrypointOptions | undefined = opts.parent != null
    ? undefined
    : { ...(opts.guards != null ? { guards: opts.guards } : {}), ...(opts.gate != null ? { gate: opts.gate } : {}) }

  const base = openProtocol(
    route(alias, opts.path, backend(located(opts.parent != null ? { parent: opts.parent } : {}))),
    baseOptions,
  )
  const child = (name: string, path: string, method: RouteMethod, extra: RouteOptions = {}) =>
    route(`${alias}:${name}`, path, backend(located({ parent: base, method, ...extra })))
  const session = typed<UploadSessionParams>(uploadParamsSchema(param))

  return {
    base,
    open: protocol(
      child('open', '/', RouteMethod.POST),
      contract.request({ body: typed<UploadOpenRequest>(UploadOpenRequestSchema) }, typed<UploadSession>()),
    ),
    state: protocol(
      child('state', `/:${param}`, RouteMethod.GET),
      contract.request({ params: session }, typed<UploadSession>()),
    ),
    file: protocol(
      child('file', `/:${param}/file`, RouteMethod.PUT, {
        protocolOptions: streamBody({ maxBytes: opts.maxFileBytes, ...(opts.types != null ? { types: opts.types } : {}) }),
      }),
      contract.request({
        params: session, query: typed<UploadFileQuery>(UploadFileQuerySchema), body: typed<BinaryBody>(),
      }, typed<UploadFileResult>()),
    ),
    remove: protocol(
      child('remove', `/:${param}/file/:${UPLOAD_FILE_PARAM}`, RouteMethod.DELETE),
      contract.request({ params: typed<UploadSessionParams>(uploadParamsSchema(param, true)) }, typed<UploadSession>()),
    ),
    seal: protocol(
      child('seal', `/:${param}/seal`, RouteMethod.POST),
      contract.request({ params: session }, typed<UploadSession>()),
    ),
    abort: protocol(
      child('abort', `/:${param}/abort`, RouteMethod.POST),
      contract.request({ params: session }, typed<UploadSession>()),
    ),
  }
}
