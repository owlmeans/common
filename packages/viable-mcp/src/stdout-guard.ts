import { Writable } from 'node:stream'

/**
 * Keep everything that is not JSON-RPC off stdout.
 *
 * A stdio MCP server's stdout IS the protocol. One stray line — a framework's `console.log`, a
 * deprecation notice, a library announcing itself — lands in the middle of a message frame, and
 * the host reports a parse error, which reads as "this server is broken" rather than "something
 * printed". The OwlMeans framework packages log to the console freely and are right to; what has
 * to change is where the console goes.
 *
 * This module is imported FIRST, before anything else in the process, because a module that logs
 * at import time would otherwise print before the guard was in place.
 *
 * Two halves. The console is redirected to stderr, where a host shows it as server output.
 * `process.stdout.write` is then replaced by the same redirect — so anything that reaches for
 * stdout directly is still SEEN rather than dropped, since losing a diagnostic to protect the
 * protocol trades one silent failure for another. The transport is handed
 * {@link protocolStdout}, a stream that closes over the real handle and is the only path to it.
 */

const realWrite = process.stdout.write.bind(process.stdout)

/** The only stream that reaches the actual stdout. Given to the transport, and to nothing else. */
export const protocolStdout = new Writable({
  write(chunk, encoding, callback) {
    realWrite(chunk as Uint8Array, encoding as BufferEncoding, callback as () => void)
  },
})

const toStderr = (...args: unknown[]): void => {
  process.stderr.write(`${args.map(arg =>
    typeof arg === 'string' ? arg : arg instanceof Error ? arg.stack ?? arg.message : JSON.stringify(arg)
  ).join(' ')}\n`)
}

console.log = toStderr
console.info = toStderr
console.debug = toStderr
console.warn = toStderr
// `console.error` already writes to stderr and keeps its own formatting.

process.stdout.write = ((chunk: unknown, ...rest: unknown[]): boolean => {
  const done = rest.find(arg => typeof arg === 'function') as (() => void) | undefined
  process.stderr.write(String(chunk))
  done?.()

  return true
}) as typeof process.stdout.write
