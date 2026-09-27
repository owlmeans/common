import { describe, expect, test } from 'bun:test'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { PLANNING_SERVICE, planningAliases } from '@owlmeans/planning'
import { CONNECT_TOKEN_PREFIX, connectRef } from '@owlmeans/viable-common'
import { makeSdkContext } from '../src/context/index.js'

/**
 * The planning tree a connector context binds.
 *
 * The aliases and paths are spelled here as the WIRE spells them rather than read back from the
 * SDK's constants: they belong to manager-api, which mounts `makePlanningProtocols` under this base
 * alias and path with the connector socket's `/update` base, and a context that drifted from that
 * would pass a test comparing it with itself.
 */
const BASE = 'viable:manager-api:planning'

/** Port 9 is discard: nothing listens, so a context that reached for the network would say so. */
const offline = async () => await makeSdkContext({
  apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token`,
})

const leaves = (tree: object): string[] => Object.values(tree)
  .flatMap(value => typeof value === 'string' ? [value] : leaves(value as object))

describe('viable-sdk — makeSdkContext binds the planning tree manager-api mounts', () => {
  test('every planning alias is bound beside the connector routes, and the context initializes', async () => {
    const context = await offline()

    for (const alias of leaves(planningAliases(BASE))) {
      expect(() => context.entrypoint(alias)).not.toThrow()
    }
    // The connector surface is still there: one registration holds both.
    expect(() => context.entrypoint(connectRef.project.status)).not.toThrow()
    // And the client facade is registered under the service name the server facade uses.
    expect(context.hasService(PLANNING_SERVICE)).toBe(true)
  })

  test('the paths are the platform\'s, and the commit feed hangs under its update base', async () => {
    const context = await offline()
    const aliases = planningAliases(BASE)
    const path = (alias: string): string => context.entrypoint<ClientEntrypoint>(alias).path()

    expect(path(aliases.card.list)).toBe('/planning/cards')
    expect(path(aliases.card.summary)).toBe('/planning/cards/summary')
    expect(path(aliases.execute)).toBe('/planning/execute')
    expect(path(aliases.commit.get)).toBe('/planning/commits/:transition')
    expect(path(aliases.commit.events)).toBe('/update/commits')
  })
})
