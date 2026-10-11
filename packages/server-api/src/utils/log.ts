import { LogController } from 'fastify'
import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify'
import { FORBIDDEN_ERROR, SERVER_ERROR, UNAUTHORIZED_ERROR } from '@owlmeans/api'
import { logger, type LogLevel, type Logger } from '@owlmeans/log'
import type { Severity } from './types.local.js'
import { QUERY_IN_TEXT, SAFE_DATA_DEPTH, UNSAFE_LOG_KEYS } from './log/consts.js'
import type { FastifyLogUtils, RequestSummary } from './log/types.js'

const pathOf = (url: string): string => url.split('?')[0]

const withoutQueries = (text: string): string => text.replace(QUERY_IN_TEXT, '$1')

/** The error itself, or — when its message names a URL with a query — a copy without the query. */
const safeError = (error: Error): Error => {
  const message = withoutQueries(error.message)
  if (message === error.message) {
    return error
  }
  const copy: Error = Object.assign(Object.create(Object.getPrototypeOf(error) as object) as Error, error)
  copy.message = message
  copy.stack = error.stack != null ? withoutQueries(error.stack) : undefined
  return copy
}

const isPlain = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const levelName = (log: Logger): string => {
  const order: LogLevel[] = ['debug', 'info', 'warn', 'error']
  return order.find(level => log.enabled(level)) ?? 'silent'
}

export const createFastifyLogUtils = (): FastifyLogUtils => {
  const http = logger('http')

  const requestOf = (request: unknown): RequestSummary => {
    const { method, url } = (request ?? {}) as { method?: unknown, url?: unknown }
    return {
      ...(typeof method === 'string' ? { method } : {}),
      ...(typeof url === 'string' ? { path: pathOf(url) } : {}),
    }
  }

  /** A class instance as a record may carry it: a request or reply by summary, anything else by name. */
  const instanceOf = (value: object): unknown => {
    const shape = value as { method?: unknown, url?: unknown, statusCode?: unknown }
    if (typeof shape.method === 'string' && typeof shape.url === 'string') {
      return requestOf(value)
    }
    if (typeof shape.statusCode === 'number') {
      return { statusCode: shape.statusCode }
    }
    const name = value.constructor?.name ?? 'object'
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      return `[${name} ${value.byteLength} bytes]`
    }
    return `[${name}]`
  }

  const safe = (value: unknown, depth: number, seen: WeakSet<object>): unknown => {
    if (typeof value === 'string') {
      return withoutQueries(value)
    }
    if (value instanceof Error) {
      return safeError(value)
    }
    if (value == null || typeof value !== 'object' || value instanceof Date) {
      return value
    }
    if (seen.has(value)) {
      return '[circular]'
    }
    if (!Array.isArray(value) && !isPlain(value)) {
      return instanceOf(value)
    }
    if (depth >= SAFE_DATA_DEPTH) {
      return '[…]'
    }
    seen.add(value)
    if (Array.isArray(value)) {
      return value.map(item => safe(item, depth + 1, seen))
    }
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      // A count or a flag under such a key (`limits.files: 5`) says nothing a caller sent.
      if (UNSAFE_LOG_KEYS.has(key) && typeof item !== 'number' && typeof item !== 'boolean') {
        continue
      }
      out[key] = key === 'url' && typeof item === 'string' ? pathOf(item) : safe(item, depth + 1, seen)
    }
    return out
  }

  const safeData = (data: unknown): unknown => safe(data, 0, new WeakSet())

  const failure: FastifyLogUtils['failure'] = (error, request, status, incidentId) => {
    const where = { ...requestOf(request), status, ...(incidentId != null ? { incidentId } : {}) }
    const safe = safeError(error)
    if (status >= SERVER_ERROR) {
      http.error('Request failed', { err: safe, ...where })
    } else if (status === FORBIDDEN_ERROR) {
      http.warn('Access forbidden', { type: (error as { type?: unknown }).type, message: safe.message, ...where },
        { event: 'access.forbidden' })
    } else if (status === UNAUTHORIZED_ERROR) {
      http.debug('Authentication refused', { message: safe.message, ...where }, { event: 'auth.refused' })
    } else {
      const code = (error as { code?: unknown }).code
      http.debug('Request refused', { ...(typeof code === 'string' ? { code } : {}), message: safe.message, ...where })
    }
  }

  /**
   * Fastify announces its listening address at info; the server writes `server.listening` itself.
   * Its request lines no longer reach the adapter at all — `controller()` owns them.
   */
  const levelOf = (level: Severity, message: unknown): Severity =>
    level === 'info' && typeof message === 'string' && message.startsWith('Server listening at') ? 'debug' : level

  const fastifyLogger = (log: Logger = http, bindings?: Record<string, unknown>): FastifyBaseLogger => {
    const call = (requested: Severity) => (first: unknown, second?: unknown): void => {
      const [object, message] = typeof first === 'string' || first instanceof Error
        ? [undefined, first] : [first, second]
      const level = levelOf(requested, message)
      if (!log.enabled(level)) {
        return
      }
      const data = bindings != null && Object.keys(bindings).length > 0
        ? { ...bindings, ...(object != null && typeof object === 'object' ? object : {}) } : object
      const text = message == null ? '' : message instanceof Error ? safeError(message) : withoutQueries(String(message))
      log[level](text, safeData(data))
    }

    const adapter = {
      get level(): string { return levelName(log) },
      set level(_value: string) { /* the level belongs to the process, not to this server */ },
      fatal: call('error'), error: call('error'), warn: call('warn'),
      info: call('info'), debug: call('debug'), trace: call('debug'),
      silent: () => undefined,
      // Fastify's second argument (pino options: its own `req`/`res` serializers) is ignored —
      // `safeData` is this adapter's serializer.
      child: (extra: Record<string, unknown>) => fastifyLogger(log, { ...bindings, ...extra }),
    }
    return adapter as unknown as FastifyBaseLogger
  }

  /**
   * Fastify accepts a `logController` only as an instance of its own class, so this one member is a
   * subclass; its methods use no `this`.
   */
  const controller = (): LogController => {
    class SafeLogController extends LogController {
      override incomingRequest (): void { /* `onResponse` writes the one record of a request */ }

      override requestCompleted (error: Error | null | undefined, request: FastifyRequest, reply: FastifyReply): void {
        if (error != null) {
          http.error('Response failed', { err: error, ...requestOf(request), status: reply.statusCode })
        }
      }

      override defaultErrorLog (error: Error, request: FastifyRequest, reply: FastifyReply): void {
        failure(error, request, reply.statusCode)
      }

      override streamError (error: Error, request: FastifyRequest, reply: FastifyReply): void {
        const where = { ...requestOf(request), status: reply.statusCode }
        if ((error as { code?: unknown }).code === 'ERR_STREAM_PREMATURE_CLOSE') {
          http.debug('Response stream closed prematurely', where)
        } else {
          http.warn('Response stream failed after its headers were sent', { err: error, ...where })
        }
      }

      override routeNotFound (request: FastifyRequest): void {
        http.debug('Route not found', requestOf(request))
      }

      override writeHeadError (error: Error, request: FastifyRequest, reply: FastifyReply): void {
        http.warn('Response headers not written', { err: error, ...requestOf(request), status: reply.statusCode })
      }

      override serializerError (error: Error, request: FastifyRequest, _reply: FastifyReply, metadata: { statusCode: number }): void {
        http.error('Response serializer failed', { err: error, ...requestOf(request), status: metadata.statusCode })
      }
    }
    return new SafeLogController()
  }

  return { logger: fastifyLogger, controller, safeData, requestOf, failure }
}

export const fastifyLogUtils = createFastifyLogUtils()
