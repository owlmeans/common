import type { FastifyBaseLogger } from 'fastify'
import { logger } from '@owlmeans/log'
import type { LogLevel, Logger } from '@owlmeans/log'

type Severity = 'debug' | 'info' | 'warn' | 'error'

/**
 * What Fastify says about itself, mapped to what an operator needs at each level.
 *
 * Fastify writes a pair of `info` lines for EVERY request and one for each unknown route, and
 * announces its own listening address. The server writes one `debug` record per request itself
 * (`onResponse`), a failed request is classified once in `handleError`, and the listening line is
 * `server.listening` — so these are dropped or lowered here, by their fixed wording, rather than by
 * a Fastify option (`disableRequestLogging` is deprecated from 5.12, `logController` does not exist
 * before it).
 */
const levelOf = (level: Severity, message: unknown): Severity | undefined => {
  if (typeof message !== 'string' || level !== 'info') {
    return level
  }
  if (message === 'incoming request' || message === 'request completed') {
    return undefined
  }
  if (message.startsWith('Server listening at') || /^Route .* not found$/.test(message)) {
    return 'debug'
  }
  return level
}

/**
 * A pino-shaped logger over `@owlmeans/log`, handed to Fastify as its `loggerInstance`.
 *
 * Fastify then logs through the process's own level, format and plugins instead of a second pino
 * instance that ignores them. `(object, message)` and `(message)` are the two shapes Fastify and
 * its plugins call with; an `err` in the object travels as the record's error.
 */
export const fastifyLogger = (log: Logger = logger('http'), bindings?: Record<string, unknown>): FastifyBaseLogger => {
  const call = (requested: Severity) => (first: unknown, second?: unknown): void => {
    const [object, message] = typeof first === 'string' || first instanceof Error
      ? [undefined, first] : [first, second]
    const level = levelOf(requested, message)
    if (level == null) {
      return
    }
    const data = bindings != null && Object.keys(bindings).length > 0
      ? { ...bindings, ...(object != null && typeof object === 'object' ? object : {}) } : object
    log[level](message == null ? '' : message instanceof Error ? message : String(message), data)
  }

  const adapter = {
    get level(): string { return levelName(log) },
    set level(_value: string) { /* the level belongs to the process, not to this server */ },
    fatal: call('error'), error: call('error'), warn: call('warn'),
    info: call('info'), debug: call('debug'), trace: call('debug'),
    silent: () => undefined,
    child: (extra: Record<string, unknown>) => fastifyLogger(log, { ...bindings, ...extra }),
  }
  return adapter as unknown as FastifyBaseLogger
}

const levelName = (log: Logger): string => {
  const order: LogLevel[] = ['debug', 'info', 'warn', 'error']
  return order.find(level => log.enabled(level)) ?? 'silent'
}
