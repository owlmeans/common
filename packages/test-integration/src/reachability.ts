import { spawnSync } from 'node:child_process'

/**
 * Whether the server a connection string names answers at all — asked synchronously, because
 * Bun decides `test` vs `test.skip` synchronously and every gate is read at module scope.
 *
 * A populated variable says where the service should be, not that it is there: a developer's
 * `.env` keeps the port-forward address long after the forward is gone, and a suite that trusts
 * it spends its whole `beforeAll` budget on a refused connection and FAILS. Only a TCP connect is
 * asked — never a login — so no driver is needed here and no credential leaves the variable.
 */

export interface ProbeTarget {
  host: string
  port: number
}

/** How long one connect may take before the address counts as unreachable. */
const CONNECT_TIMEOUT_MS = 1_500

/** The probe runs in a child process; this covers its own startup on a loaded machine. */
const SPAWN_GRACE_MS = 5_000

const answers = new Map<string, string | null>()
const warned = new Set<string>()

/**
 * Every `host:port` in the authority of a connection string, or `null` when the string names
 * nothing a TCP connect can check — an SRV record, a unix socket, or a shape this cannot read.
 * `null` leaves the gate exactly as the variable alone would have it.
 */
export const parseTargets = (url: string, defaultPort: number): ProbeTarget[] | null => {
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url)
  if (scheme == null || scheme[1].toLowerCase().endsWith('+srv')) {
    return null
  }
  const rest = url.slice(scheme[0].length)
  const end = rest.search(/[/?#]/)
  const authority = end < 0 ? rest : rest.slice(0, end)
  const hosts = authority.slice(authority.lastIndexOf('@') + 1)

  const targets: ProbeTarget[] = []
  for (const entry of hosts.split(',')) {
    const match = /^(\[[^\]]+\]|[^:]*)(?::(\d+))?$/.exec(entry)
    if (match == null) {
      return null
    }
    let host: string
    try {
      host = decodeURIComponent(match[1]).replace(/^\[|\]$/g, '')
    } catch {
      return null
    }
    if (host === '' || host.includes('/')) {
      return null
    }
    targets.push({ host, port: match[2] != null ? parseInt(match[2], 10) : defaultPort })
  }

  return targets.length > 0 ? targets : null
}

// Runs under whichever runtime runs the suite (`process.execPath`), so it is plain CommonJS
// that both `bun -e` and `node -e` evaluate.
const PROBE_SCRIPT = `
const net = require('net')
const [targets, timeout] = JSON.parse(process.env.OWLMEANS_TEST_PROBE)
let pending = targets.length
let last = ''
for (const target of targets) {
  let settled = false
  const socket = net.connect({ host: target.host, port: target.port })
  const fail = code => {
    if (settled) return
    settled = true
    socket.destroy()
    last = code
    if (--pending === 0) { process.stdout.write(last); process.exit(1) }
  }
  socket.setTimeout(timeout)
  socket.once('connect', () => process.exit(0))
  socket.once('timeout', () => fail('ETIMEDOUT'))
  socket.once('error', error => fail(error.code || String(error)))
}
`

/**
 * `null` when at least one target accepts a TCP connection, otherwise the reason none did.
 *
 * A probe that cannot run at all also answers `null`: not knowing is not evidence the service is
 * down, and the suite then behaves exactly as it did before probes existed.
 */
export const probeTargets = (targets: ProbeTarget[]): string | null => {
  const key = targets.map(({ host, port }) => `${host}:${port}`).join(',')
  if (answers.has(key)) {
    return answers.get(key) ?? null
  }

  const result = spawnSync(process.execPath, ['-e', PROBE_SCRIPT], {
    env: { ...process.env, OWLMEANS_TEST_PROBE: JSON.stringify([targets, CONNECT_TIMEOUT_MS]) },
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: CONNECT_TIMEOUT_MS + SPAWN_GRACE_MS,
    encoding: 'utf8',
  })
  const answer = result.error == null && result.status === 1
    ? `nothing answers at ${key} (${result.stdout.trim() !== '' ? result.stdout.trim() : 'unreachable'})`
    : null
  answers.set(key, answer)

  return answer
}

/**
 * The skip reason for a populated connection-string variable whose server does not answer, or
 * `null` when it answers or cannot be probed. Printed once per variable and address, so a closed
 * gate is never mistaken for a suite that has nothing to run.
 */
export const unreachableReason = (variable: string, url: string, defaultPort: number): string | null => {
  const targets = parseTargets(url, defaultPort)
  if (targets == null) {
    return null
  }
  const unreachable = probeTargets(targets)
  if (unreachable == null) {
    return null
  }

  const reason = `${variable} is set, but ${unreachable} — start the service (or its port-forward) to run these specs`
  if (!warned.has(reason)) {
    warned.add(reason)
    console.warn(`@owlmeans/test-integration: skipping — ${reason}`)
  }

  return reason
}
