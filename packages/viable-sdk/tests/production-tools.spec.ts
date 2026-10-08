import { describe, expect, test } from 'bun:test'
import {
  ConnectHarness, ConnectLlm, ConnectTarget, type ConnectProductionDomain, type ConnectProductionStatus,
} from '@owlmeans/viable-common'
import { catalogue, catalogueHelper } from '../src/tools/catalogue.js'
import { PLATFORM_CATALOGUE, ToolHostKind } from '../src/tools/consts.js'
import type { ToolDeps, ToolHost } from '../src/tools/types.js'

const PRODUCTION_TOOLS = [
  'production_status', 'publish_production', 'production_control', 'custom_domain', 'production_auth',
  'set_production_redirects',
]

const host = (patch: Partial<ToolHost> = {}): ToolHost => ({
  kind: ToolHostKind.Stdio,
  target: ConnectTarget.Cloud,
  llm: ConnectLlm.Cloud,
  harness: ConnectHarness.ClaudeCode,
  hasExecutor: true,
  ...patch,
})

const toolNamed = (name: string) => {
  const tool = catalogue.find(entry => entry.name === name)
  if (tool == null) throw new Error(`no tool ${name}`)

  return tool
}

/** A connector whose production calls are recorded in order; every answer is the one given. */
const connector = (answers: Record<string, unknown> = {}, attached: string | null = 'p1') => {
  const calls: unknown[][] = []
  const logged: string[] = []
  const member = (name: string) => async (...args: unknown[]) => {
    calls.push([name, ...args])
    const answer = answers[name]
    if (answer instanceof Error) throw answer

    return answer === undefined ? {} : answer
  }
  const deps = {
    host: host(),
    api: {
      production: {
        status: member('status'), publish: member('publish'), restart: member('restart'), stop: member('stop'),
        domain: { attach: member('domain.attach'), verify: member('domain.verify'), detach: member('domain.detach') },
        auth: member('auth'), setRedirects: member('setRedirects'),
      },
    },
    session: async () => ({}) as never,
    currentSession: () => null,
    attached: () => attached,
    attach: () => undefined,
    log: (line: string) => { logged.push(line) },
  } as unknown as ToolDeps

  return { deps, calls, logged }
}

const PENDING_DOMAIN: ConnectProductionDomain = {
  generatedHost: 'shop-acme.owlmeans.app', customDomain: 'shop.example.com', status: 'pending_validation',
  cnameTarget: 'cname.owlmeans.link', dcvName: '_acme-challenge.shop.example.com',
  dcvValue: 'shop.example.com.dcv.owlmeans.link', hostnameStatus: 'pending', sslStatus: 'pending_validation',
}

const LIVE: ConnectProductionStatus = {
  workload: { id: 'prod-1', kind: 'production', status: 'live', slug: 'shop' },
  domain: { generatedHost: 'shop-acme.owlmeans.app', status: 'none' },
}

describe('viable-sdk — the production tools', () => {
  test('are offered only where the platform runs the site — a cloud target, on either host', () => {
    for (const kind of [ToolHostKind.Stdio, ToolHostKind.Http]) {
      const offered = catalogueHelper.visibleTools(host({ kind, hasExecutor: kind === ToolHostKind.Stdio }))
        .map(tool => tool.name)
      for (const tool of PRODUCTION_TOOLS) expect([kind, tool, offered.includes(tool)]).toEqual([kind, tool, true])
    }
    const local = catalogueHelper.visibleTools(host({ target: ConnectTarget.Local })).map(tool => tool.name)
    expect(PRODUCTION_TOOLS.filter(tool => local.includes(tool))).toEqual([])
    expect(PLATFORM_CATALOGUE.capabilities.find(group => group.id === 'production')?.tools).toEqual(PRODUCTION_TOOLS)
    // Nothing reveals the sign-in's secret.
    expect(catalogue.map(tool => tool.name).filter(name => /secret|reveal/.test(name))).toEqual([])
    for (const name of ['production_status', 'production_auth']) {
      expect(toolNamed(name).annotations.readOnlyHint).toBe(true)
    }
    for (const name of ['publish_production', 'production_control']) {
      expect(toolNamed(name).annotations.destructiveHint).toBe(true)
    }
  })

  test('publish_production does nothing without confirm: true, then publishes and says it goes on', async () => {
    const { deps, calls } = connector({ publish: { ...LIVE, workload: { ...LIVE.workload!, status: 'building' } } })

    const refused = await toolNamed('publish_production').run({}, deps)
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('confirm: true')
    expect(calls).toEqual([])

    const published = await toolNamed('publish_production').run({ confirm: true }, deps)
    expect(calls).toEqual([['publish', 'p1']])
    expect(published.isError).toBeUndefined()
    expect(published.text).toContain('The publish has started.')
    expect(published.text).toContain('production: building')
    expect(published.text).toContain('production_status again')
  })

  test('a plan with no published site left is answered as the plan\'s refusal, in words', async () => {
    const { deps, logged } = connector({ publish: new Error('payment:limit:limit-exhausted:published-sites:1/1') })

    const result = await toolNamed('publish_production').run({ confirm: true }, deps)

    expect(result.isError).toBe(true)
    expect(result.text).toContain('published sites limit is used up (1 of 1)')
    expect(result.text).toContain('Billing')
    expect(logged.some(line => line.startsWith('publish_production refused'))).toBe(true)
  })

  test('production_status says whether it was ever published, and names the address of a live one', async () => {
    const never = connector({ status: { workload: null, domain: null } })
    expect((await toolNamed('production_status').run({}, never.deps)).text).toContain('Not published yet')

    const live = connector({ status: LIVE })
    const result = await toolNamed('production_status').run({ projectId: 'p2' }, live.deps)
    expect(live.calls).toEqual([['status', 'p2']])
    expect(result.text).toContain('production: live · https://shop-acme.owlmeans.app')
    expect(result.text).toContain('custom domain: none')
  })

  test('production_control restarts or stops, and nothing else', async () => {
    const { deps, calls } = connector({ restart: LIVE, stop: { ...LIVE, workload: { ...LIVE.workload!, status: 'not-deployed' } } })

    expect((await toolNamed('production_control').run({ action: 'restart' }, deps)).text).toContain('restarting')
    const stopped = await toolNamed('production_control').run({ action: 'stop' }, deps)
    expect(stopped.text).toContain('was stopped')
    expect(stopped.text).toContain('not running')
    expect((await toolNamed('production_control').run({ action: 'run' }, deps)).isError).toBe(true)
    expect(calls).toEqual([['restart', 'p1'], ['stop', 'p1']])
  })

  test('custom_domain attach prints the two DNS records the user creates, and needs a domain', async () => {
    const { deps, calls } = connector({ 'domain.attach': PENDING_DOMAIN, 'domain.verify': { ...PENDING_DOMAIN, status: 'linked' }, 'domain.detach': { generatedHost: 'shop-acme.owlmeans.app', status: 'none' } })

    expect((await toolNamed('custom_domain').run({ action: 'attach' }, deps)).isError).toBe(true)
    const attached = await toolNamed('custom_domain').run({ action: 'attach', domain: ' Shop.Example.com ' }, deps)
    expect(attached.text).toContain('CNAME shop.example.com → cname.owlmeans.link')
    expect(attached.text).toContain('CNAME _acme-challenge.shop.example.com → shop.example.com.dcv.owlmeans.link')
    expect(attached.text).toContain('custom_domain { action: verify }')

    const verified = await toolNamed('custom_domain').run({ action: 'verify' }, deps)
    expect(verified.text).toContain('active')
    expect(verified.text).not.toContain('CNAME')
    expect((await toolNamed('custom_domain').run({ action: 'detach' }, deps)).text).toContain('detached')
    expect(calls).toEqual([['domain.attach', 'p1', 'shop.example.com'], ['domain.verify', 'p1'], ['domain.detach', 'p1']])
  })

  test('custom_domain answers a project with no production site, a taken domain and a plan without the feature', async () => {
    const none = connector({ 'domain.attach': null })
    expect((await toolNamed('custom_domain').run({ action: 'attach', domain: 'shop.example.com' }, none.deps)).text)
      .toContain('publish_production first')

    const taken = connector({ 'domain.attach': new Error('viable-domain:taken:shop.example.com') })
    const takenResult = await toolNamed('custom_domain').run({ action: 'attach', domain: 'shop.example.com' }, taken.deps)
    expect(takenResult.isError).toBe(true)
    expect(takenResult.text).toContain('already attached to another project')

    const unpaid = connector({ 'domain.attach': new Error('auth:forbidden:entitlement:capability-required:feature:domain--custom') })
    const unpaidResult = await toolNamed('custom_domain').run({ action: 'attach', domain: 'shop.example.com' }, unpaid.deps)
    expect(unpaidResult.isError).toBe(true)
    expect(unpaidResult.text).toContain('custom domains')
    expect(unpaidResult.text).toContain('plan does not include')
  })

  test('production_auth never shows the client secret — only whether it is set', async () => {
    const { deps } = connector({
      auth: {
        clientId: 'shop-acme-production', issuerUrl: 'https://vib.test/oidc', secretSet: true,
        redirectUris: ['https://self.example.com/dispatcher'], generatedHost: 'shop-acme.owlmeans.app',
      },
    })

    const result = await toolNamed('production_auth').run({}, deps)

    expect(result.text).toContain('client id: shop-acme-production')
    expect(result.text).toContain('client secret: set — never shown here')
    expect(result.text).toContain('https://self.example.com/dispatcher')
    expect(result.structured).toEqual(expect.objectContaining({ secretSet: true }))
    expect(JSON.stringify(result.structured)).not.toMatch(/"secret"/)
  })

  test('set_production_redirects replaces the whole list and says when it applies', async () => {
    const { deps, calls } = connector({ setRedirects: { redirectUris: ['https://self.example.com/dispatcher'] } })

    const result = await toolNamed('set_production_redirects').run({ redirects: ['https://self.example.com/dispatcher'] }, deps)

    expect(calls).toEqual([['setRedirects', 'p1', ['https://self.example.com/dispatcher']]])
    expect(result.text).toContain('next publish_production')
    expect((await toolNamed('set_production_redirects').run({ redirects: 'x' }, deps)).isError).toBe(true)
  })
})
