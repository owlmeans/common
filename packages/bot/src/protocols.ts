import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod, type RouteOptions } from '@owlmeans/route'
import {
  BotActivityQuerySchema, BotChallengeQuerySchema, BotConnectionInputSchema, BotHookParamsSchema, BotIdParamsSchema,
  BotRuleInputSchema, BotRuleListQuerySchema, BotSimulateInputSchema,
} from './schemas.js'
import { botAliasUtils } from './utils/aliases.js'
import type {
  BotActivityQuery, BotBaseOptions, BotChallengeQuery, BotHookParams, BotHookPayload, BotHookProtocolOptions,
  BotHookProtocols, BotHookReply, BotIdParams, BotProtocolOptions, BotProtocols, BotRemoveResult, BotRuleListQuery,
} from './protocols/types.js'
import type {
  BotActivity, BotConnection, BotConnectionInput, BotRule, BotRuleInput, BotSimulateInput, BotSimulateResult,
} from './types.js'

const mountOf = (base: BotBaseOptions): Partial<RouteOptions> => ({
  ...(base.parent != null ? { parent: base.parent } : {}),
  ...(base.service != null ? { service: base.service } : {}),
})

/**
 * Declare one managing surface of the bot — connections, rules, activity — as an immutable tree a
 * server binds and a client calls.
 *
 * Every leaf hangs under ONE base that carries the guards and the gate, so they cannot drift apart;
 * aliases derive from `opts.base.alias` (`<alias>:connection:list` …). A target declares one tree per
 * area that runs bots (`api:bot:operator`, `api:bot:member`) — the same leaves, another gate.
 */
export const makeBotProtocols = (opts: BotProtocolOptions): BotProtocols => {
  const aliases = botAliasUtils.botAliases(opts.base.alias)
  const base = openProtocol(route(aliases.base, opts.base.path, backend(mountOf(opts.base))), {
    ...(opts.guards != null ? { guards: opts.guards } : {}),
    ...(opts.gates != null ? { gate: opts.gates } : {}),
  })
  const leaf = (alias: string, path: string, method: RouteMethod) =>
    route(alias, path, backend({ parent: base }, method))

  return Object.freeze({
    base,

    connection: Object.freeze({
      list: protocol(
        leaf(aliases.connection.list, '/connections', RouteMethod.GET),
        contract(typed<BotConnection[]>())
      ),
      save: protocol(
        leaf(aliases.connection.save, '/connections', RouteMethod.POST),
        contract.request({ body: typed<BotConnectionInput>(BotConnectionInputSchema) }, typed<BotConnection>())
      ),
      verify: protocol(
        leaf(aliases.connection.verify, '/connections/:id/verify', RouteMethod.POST),
        contract.request({ params: typed<BotIdParams>(BotIdParamsSchema) }, typed<BotConnection>())
      ),
      remove: protocol(
        leaf(aliases.connection.remove, '/connections/:id', RouteMethod.DELETE),
        contract.request({ params: typed<BotIdParams>(BotIdParamsSchema) }, typed<BotRemoveResult>())
      ),
      simulate: protocol(
        leaf(aliases.connection.simulate, '/connections/:id/simulate', RouteMethod.POST),
        contract.request({
          params: typed<BotIdParams>(BotIdParamsSchema),
          body: typed<BotSimulateInput>(BotSimulateInputSchema),
        }, typed<BotSimulateResult>())
      ),
    }),

    rule: Object.freeze({
      list: protocol(
        leaf(aliases.rule.list, '/rules', RouteMethod.GET),
        contract.request({ query: typed<BotRuleListQuery>(BotRuleListQuerySchema) }, typed<BotRule[]>())
      ),
      save: protocol(
        leaf(aliases.rule.save, '/rules', RouteMethod.POST),
        contract.request({ body: typed<BotRuleInput>(BotRuleInputSchema) }, typed<BotRule>())
      ),
      remove: protocol(
        leaf(aliases.rule.remove, '/rules/:id', RouteMethod.DELETE),
        contract.request({ params: typed<BotIdParams>(BotIdParamsSchema) }, typed<BotRemoveResult>())
      ),
    }),

    activity: Object.freeze({
      list: protocol(
        leaf(aliases.activity.list, '/activity', RouteMethod.GET),
        contract.request({ query: typed<BotActivityQuery>(BotActivityQuerySchema) }, typed<BotActivity[]>())
      ),
    }),
  })
}

/**
 * Declare the platforms' inbound surface: `receive` (POST) and `challenge` (GET) at
 * `/:platform/:connection` under the base.
 *
 * NO guard and no gate, by design: the caller is the platform, and it proves itself by signing the
 * request (Telegram's secret token, WhatsApp's app-secret HMAC, Slack's signing secret), which the
 * server verifies against the connection's credentials. The body carries no schema — the signature
 * covers the raw bytes, and the payload is the platform's own.
 */
export const makeBotHookProtocols = (opts: BotHookProtocolOptions): BotHookProtocols => {
  const aliases = botAliasUtils.botHookAliases(opts.base.alias)
  const base = openProtocol(route(aliases.base, opts.base.path, backend(mountOf(opts.base))))

  return Object.freeze({
    base,
    receive: protocol(
      route(aliases.receive, '/:platform/:connection', backend({ parent: base }, RouteMethod.POST)),
      contract.request({
        params: typed<BotHookParams>(BotHookParamsSchema),
        body: typed<BotHookPayload>(),
      }, typed<BotHookReply>())
    ),
    challenge: protocol(
      route(aliases.challenge, '/:platform/:connection', backend({ parent: base }, RouteMethod.GET)),
      contract.request({
        params: typed<BotHookParams>(BotHookParamsSchema),
        query: typed<BotChallengeQuery>(BotChallengeQuerySchema),
      }, typed<string>())
    ),
  })
}
