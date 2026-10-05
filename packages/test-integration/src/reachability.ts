import { spawnSync } from 'node:child_process'
import { logger } from '@owlmeans/log'
import { CONNECT_TIMEOUT_MS, PROBE_SCRIPT, SPAWN_GRACE_MS } from './consts.local.js'
import type { ProbeTarget } from './types.js'
import type { ReachabilityUtils } from './reachability/types.js'

const log = logger('test-integration')

/**
 * Whether the server a connection string names answers at all — asked synchronously, because
 * Bun decides `test` vs `test.skip` synchronously and every gate is read at module scope.
 *
 * A populated variable says where the service should be, not that it is there: a developer's
 * `.env` keeps the port-forward address long after the forward is gone, and a suite that trusts
 * it spends its whole `beforeAll` budget on a refused connection and FAILS. Only a TCP connect is
 * asked — never a login — so no driver is needed here and no credential leaves the variable.
 */

// Process-wide on purpose: every gate of a run shares one answer per address and one warning per reason.
const answers = new Map<string, string | null>()
const warned = new Set<string>()

export const createReachabilityUtils = (): ReachabilityUtils => {
  const parseTargets = (url: string, defaultPort: number): ProbeTarget[] | null => {
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

  const probeTargets = (targets: ProbeTarget[]): string | null => {
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

  const unreachableReason = (variable: string, url: string, defaultPort: number): string | null => {
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
      log.warn('Skipping integration specs: a configured service is unreachable', { variable, unreachable })
    }

    return reason
  }

  return { parseTargets, probeTargets, unreachableReason }
}

export const reachabilityUtils = createReachabilityUtils()
