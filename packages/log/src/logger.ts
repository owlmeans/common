import { CONSOLE_SCOPE } from './consts.js'
import { logLevelHelper } from './level.js'
import { redactHelper } from './redact.js'
import { logStateHelper } from './state.js'
import type { ConsoleMethod, AnalyticsEvent, LogConfig, LogLevel, LogOptions, LogPlugin, LogRecord, Logger, LogMethod } from './types.js'
import type { Severity } from './types.local.js'

/**
 * Apply what a deployment decided. A field that is absent or does not parse leaves the previous
 * setting alone, so an unresolved config path can never silence or flood a process.
 */
export const configureLog = (config: LogConfig | undefined): void => {
  if (config == null) {
    return
  }
  const current = logStateHelper.state()
  const level = logLevelHelper.parseLogLevel(config.level)
  if (level != null) {
    current.level = level
  }
  const scopes = logLevelHelper.parseDebugScopes(config.debug)
  if (scopes != null) {
    current.debugScopes = scopes
  }
  const format = logLevelHelper.parseLogFormat(config.format)
  if (format != null) {
    current.format = format
  }
  const mode = logLevelHelper.parseLogConsole(config.console)
  if (mode != null) {
    current.consoleMode = mode
  }
}

/** The effective configuration, as written back by `configureLog`. */
export const logConfig = (): Required<Pick<LogConfig, 'level' | 'format' | 'console'>> & { debug: string[] } => {
  const current = logStateHelper.state()
  return { level: current.level, format: current.format, console: current.consoleMode, debug: [...current.debugScopes] }
}

const scopeMatches = (scopes: string[], scope: string): boolean =>
  scopes.some(entry => entry === '*' || entry === scope || scope.startsWith(`${entry}:`))

/** Whether a record at `level` for `scope` would be written now. */
export const logEnabled = (level: LogLevel = 'debug', scope = ''): boolean => {
  const current = logStateHelper.state()
  if (current.level === 'silent' || level === 'silent') {
    return false
  }
  return logLevelHelper.levelAdmits(current.level, level) || (level === 'debug' && scopeMatches(current.debugScopes, scope))
}

/** Add a destination. A plugin of the same name is replaced. Returns the function that removes it. */
export const addLogPlugin = (plugin: LogPlugin): (() => void) => {
  removeLogPlugin(plugin.name)
  const current = logStateHelper.state()
  current.plugins.push(plugin)
  guarded(plugin, () => plugin.install?.())
  return () => removeLogPlugin(plugin.name)
}

export const removeLogPlugin = (name: string): void => {
  const current = logStateHelper.state()
  const index = current.plugins.findIndex(plugin => plugin.name === name)
  if (index >= 0) {
    const [plugin] = current.plugins.splice(index, 1)
    guarded(plugin, () => plugin.uninstall?.())
  }
}

export const logPlugins = (): readonly LogPlugin[] => [...logStateHelper.state().plugins]

/** A plugin may be broken; the work that logged must not be. Reported once per minute per plugin. */
const guarded = (plugin: LogPlugin, run: () => void): void => {
  try {
    run()
  } catch (error) {
    if (logThrottle(`plugin:${plugin.name}`, 60_000)) {
      logStateHelper.state().native.warn(`[log] plugin "${plugin.name}" failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

/**
 * `true` the first time a key is seen and then again only after `ms` — the shared way to keep a
 * line that fires per tick or per request from flooding.
 */
export const logThrottle = (key: string, ms = 30_000): boolean => {
  const current = logStateHelper.state()
  const now = Date.now()
  const last = current.throttles.get(key)
  if (last != null && now - last < ms) {
    return false
  }
  if (current.throttles.size > 500) {
    for (const [stale, at] of current.throttles) {
      if (now - at >= ms) current.throttles.delete(stale)
    }
    if (current.throttles.size > 500) current.throttles.clear()
  }
  current.throttles.set(key, now)
  return true
}

const errorOf = (message: unknown, data: unknown): Error | undefined => {
  if (message instanceof Error) {
    return message
  }
  if (data instanceof Error) {
    return data
  }
  if (data != null && typeof data === 'object') {
    const carried = (data as { error?: unknown, err?: unknown })
    if (carried.error instanceof Error) return carried.error
    if (carried.err instanceof Error) return carried.err
  }
  return undefined
}

/** The data without the `Error` it carried: that one travels as `record.error`, not twice. */
const withoutError = (data: unknown, error: Error | undefined): unknown => {
  if (error == null || data == null || typeof data !== 'object' || Array.isArray(data)) {
    return data
  }
  const rest: Record<string, unknown> = { ...(data as Record<string, unknown>) }
  for (const key of ['error', 'err']) {
    if (rest[key] === error) delete rest[key]
  }
  return Object.keys(rest).length === 0 ? undefined : rest
}

const textOf = (message: string | Error): string => message instanceof Error ? message.message : String(message)

const sinkMethod = (level: Severity): ConsoleMethod =>
  level === 'debug' ? (logStateHelper.isBrowser() ? 'log' : 'debug') : level

const flat = (value: unknown): string => {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value)
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined)
  return entries.map(([key, item]) =>
    `${key}=${typeof item === 'string' ? (/[\s"]/.test(item) ? JSON.stringify(item) : item) : JSON.stringify(item)}`
  ).join(' ')
}

/** The built-in console sink. Writes only through the captured natives — it can never recurse. */
const write = (record: LogRecord): void => {
  const current = logStateHelper.state()
  const method = sinkMethod(record.level)
  const out = current.native[method]

  if (logStateHelper.isBrowser()) {
    // Browsers get the original objects: they inspect them, and an `Error` handed to
    // `console.error` is what error-reporting hooks of the page key on.
    const args: unknown[] = [`[${record.scope}] ${record.message}`]
    if (record.data !== undefined) args.push(record.data)
    if (record.error != null) args.push(record.error)
    out(...args)
    return
  }

  const iso = new Date(record.time).toISOString()
  if (current.format === 'json') {
    out(JSON.stringify({
      time: iso, level: record.level, scope: record.scope, msg: record.message,
      ...(record.event != null ? { event: record.event } : {}),
      ...(record.data !== undefined ? { data: record.data } : {}),
      ...(record.error != null ? { err: redactHelper.errorData(record.error) } : {}),
    }))
    return
  }

  let line = `${iso} ${record.level.toUpperCase().padEnd(5)} [${record.scope}] ${record.message}`
  if (record.event != null) line += ` event=${record.event}`
  if (record.data !== undefined) line += ` ${flat(record.data)}`
  if (record.error?.stack != null) line += `\n${record.error.stack}`
  out(line)
}

const dispatch = (
  level: Severity, scope: string, rawMessage: string | Error, rawData: unknown, options: LogOptions | undefined,
  base: Record<string, unknown> | undefined,
): void => {
  const toConsole = options?.console !== false
  const toAnalytics = options?.analytics !== undefined && options.analytics !== false
  const writes = toConsole && logEnabled(level, scope)
  if (!writes && !toAnalytics) {
    return
  }

  const error = errorOf(rawMessage, rawData)
  const message = textOf(rawMessage)
  const event = options?.event ?? (typeof options?.analytics === 'string' ? options.analytics : undefined)
  const merged = base != null && Object.keys(base).length > 0
    ? (rawData == null || rawData instanceof Error ? base : { ...base, ...(typeof rawData === 'object' ? rawData as object : { value: rawData }) })
    : rawData
  const data = merged == null || merged instanceof Error ? undefined : redactHelper.redact(withoutError(merged, error))
  const time = Date.now()
  const plugins = logStateHelper.state().plugins

  if (writes) {
    const record: LogRecord = { level, scope, message, time, data, event, error }
    write(record)
    for (const plugin of plugins) {
      if (plugin.log != null) guarded(plugin, () => plugin.log!(record))
    }
  }

  if (toAnalytics) {
    const analytics: AnalyticsEvent = { event: event ?? message, scope, time, level, message, data }
    for (const plugin of plugins) {
      if (plugin.track != null) guarded(plugin, () => plugin.track!(analytics))
    }
  }
}

/**
 * The logger of a scope — a stable name for where a line comes from (`agent`, `jobs:queue`,
 * `http`). Cheap to create; keep one per module.
 *
 * ```ts
 * const log = logger('billing')
 * log.info('Subscription started', { plan }, { event: 'subscription.started', analytics: true })
 * ```
 */
export const logger = (scope: string, base?: Record<string, unknown>): Logger => {
  const method = (level: Severity): LogMethod => (message, data, options) => dispatch(level, scope, message, data, options, base)
  return {
    scope,
    debug: method('debug'),
    info: method('info'),
    warn: method('warn'),
    error: method('error'),
    child: (name, data) => logger(`${scope}:${name}`, { ...base, ...data }),
    enabled: level => logEnabled(level ?? 'debug', scope),
  }
}

const consoleLogger = (): Logger => logger(CONSOLE_SCOPE)

const argsToCall = (args: unknown[]): [string | Error, unknown] => {
  const parts: string[] = []
  const objects: unknown[] = []
  let error: Error | undefined
  for (const arg of args) {
    if (arg instanceof Error) {
      error ??= arg
    } else if (arg != null && typeof arg === 'object') {
      objects.push(arg)
    } else {
      parts.push(String(arg))
    }
  }
  const message = parts.join(' ') || (error?.message ?? '')
  const data = objects.length === 0 ? undefined : objects.length === 1 ? objects[0] : objects
  return [error != null && parts.length === 0 ? error : message, error != null && parts.length > 0 ? { error, ...(data != null ? { data } : {}) } : data]
}

/**
 * Route the global `console` through the logger: `debug`/`log`/`trace` are `debug`, `info`, `warn`
 * and `error` keep their level, all under the scope `console`. Idempotent. A library that still
 * calls `console.*` is therefore subject to the same level as everything else.
 */
export const overrideConsole = (): void => {
  const current = logStateHelper.state()
  if (current.overridden || typeof console === 'undefined') {
    return
  }
  const log = consoleLogger()
  const route = (level: Severity) => (...args: unknown[]) => {
    const [message, data] = argsToCall(args)
    log[level](message, data)
  }
  const target = console as unknown as Record<ConsoleMethod, (...args: unknown[]) => void>
  target.debug = route('debug')
  target.log = route('debug')
  target.trace = route('debug')
  target.info = route('info')
  target.warn = route('warn')
  target.error = route('error')
  current.overridden = true
}

/** Put the captured console back. */
export const restoreConsole = (): void => {
  const current = logStateHelper.state()
  if (!current.overridden || typeof console === 'undefined') {
    return
  }
  const target = console as unknown as Record<ConsoleMethod, (...args: unknown[]) => void>
  for (const method of Object.keys(current.native) as ConsoleMethod[]) {
    target[method] = current.native[method]
  }
  current.overridden = false
}

/** Back to the defaults, the real console and no plugins — for tests. */
export const resetLog = (): void => {
  restoreConsole()
  const current = logStateHelper.state()
  for (const plugin of [...current.plugins]) {
    removeLogPlugin(plugin.name)
  }
  current.level = 'info'
  current.debugScopes = []
  current.format = 'text'
  current.consoleMode = 'override'
  current.throttles.clear()
}
