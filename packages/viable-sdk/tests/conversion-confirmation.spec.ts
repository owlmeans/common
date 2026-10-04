import { describe, expect, test } from 'bun:test'
import { ApiStatusError } from '@owlmeans/api'
import {
  ConnectConfirmationRequired, ConnectConsentRequired, ConnectHarness, ConnectLlm, ConnectOutOfCredits, ConnectTarget,
  ConversionDecision,
} from '@owlmeans/viable-common'
import type { ConnectConfirmation } from '@owlmeans/viable-common'
import { catalogue } from '../src/tools/catalogue.js'
import { registerCatalogue } from '../src/tools/mcp.js'
import type { McpServerLike } from '../src/tools/mcp.js'
import { confirmationRequiredPhrase, refusalPhrase } from '../src/tools/refusal.js'
import { ToolHostKind } from '../src/tools/types.js'
import type { ToolDeps, ToolHost } from '../src/tools/types.js'

/**
 * A conversion verb that would use the plan's conversion or spend credits answers with what it costs
 * and starts nothing (`ConnectConfirmationRequired`): the tools explain the cap up front, phrase the
 * refusal with the exact call to repeat, and send `confirm: true` only when the parent passed it.
 */

const stdio: ToolHost = {
  kind: ToolHostKind.Stdio,
  target: ConnectTarget.Cloud,
  llm: ConnectLlm.Cloud,
  harness: ConnectHarness.ClaudeCode,
  hasExecutor: false,
}

const status = (projectId = 'p1') => ({
  projectId, stage: 'intake', status: 'running', estimates: [], originState: 'present', assumptions: 0,
  updatedAt: '2026-10-04T00:00:00.000Z',
})

const confirmation = (patch: Partial<ConnectConfirmation> = {}): ConnectConfirmationRequired =>
  new ConnectConfirmationRequired(ConnectConfirmationRequired.encode({
    action: 'convert-start', cap: 1_000_000, spent: 0, estimate: 0, fromAllowance: 0, fromCreditLimits: 0,
    moneyUsd: 0, ...patch,
  }))

interface Harness {
  deps: ToolDeps
  sent: Array<[string, string, unknown]>
  notified: Array<[string, string]>
}

/** A connector whose conversion verbs refuse with `refusal` until a call carries `confirm: true`. */
const harness = (refusal: unknown, opts: { attached?: string | null, host?: ToolHost } = {}): Harness => {
  const sent: Array<[string, string, unknown]> = []
  const notified: Array<[string, string]> = []
  let attached = opts.attached === undefined ? 'p1' : opts.attached
  const answer = (verb: string) => async (projectId: string, body?: { confirm?: boolean }) => {
    sent.push([verb, projectId, body])
    if (body?.confirm !== true) throw refusal

    return status(projectId)
  }
  const deps = {
    host: opts.host ?? stdio,
    dir: '/tmp/some-project',
    api: {
      convert: {
        start: answer('start'),
        proceed: answer('proceed'),
        create: async () => status('p-new'),
      },
    },
    session: async () => ({}) as never,
    currentSession: () => null,
    attached: () => attached,
    attach: (projectId: string) => { attached = projectId },
    log: () => undefined,
    notify: (level: 'warning' | 'error', text: string) => { notified.push([level, text]) },
  } as unknown as ToolDeps

  return { deps, sent, notified }
}

const toolNamed = (name: string) => {
  const tool = catalogue.find(entry => entry.name === name)
  if (tool == null) throw new Error(`no tool ${name}`)

  return tool
}

describe('viable-sdk — the conversion tools carry the person\'s confirmation', () => {
  test('both verbs take confirm (a boolean, false unless sent) and explain the conversion limit up front', () => {
    for (const name of ['convert_project', 'proceed_conversion']) {
      const tool = toolNamed(name)
      const confirm = (tool.input as unknown as Record<string, { parse: (value: unknown) => unknown }>).confirm

      expect(confirm, name).toBeDefined()
      expect(confirm!.parse(undefined)).toBe(false)
      expect(confirm!.parse(true)).toBe(true)
      expect(tool.description).toContain('conversion limit (1,000,000 credits)')
      expect(tool.description).toContain('credit limits are spent first')
      expect(tool.description).toContain('topped-up credits')
      expect(tool.description).toContain('confirm: true only after they agree')
    }
  })

  test('a start that would use the plan\'s conversion: the cap said, nothing started, the exact call to repeat', async () => {
    const { deps, sent, notified } = harness(confirmation())

    const refused = await toolNamed('convert_project').run({}, deps)

    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('Nothing was started')
    expect(refused.text).toContain('free up to 1,000,000 credits (the conversion limit)')
    expect(refused.text).toContain('credit limits first, then from topped-up credits')
    expect(refused.text).toContain('convert_project {"projectId":"p1","confirm":true}')
    expect(refused.text).toContain('never send confirm: true on your own')
    expect(refused.text).not.toContain('confirmation-required:')
    expect(notified).toEqual([['warning', refused.text]])
    // Sent without a confirmation the parent did not give.
    expect(sent).toEqual([['start', 'p1', {}]])

    const started = await toolNamed('convert_project').run({ confirm: true }, deps)
    expect(started.isError).not.toBe(true)
    expect(sent[1]).toEqual(['start', 'p1', { confirm: true }])
  })

  test('a conversion filed by the call is repeated by its project id, never filed again', async () => {
    const { deps, sent } = harness(confirmation(), { attached: null })

    const refused = await toolNamed('convert_project').run({ name: 'Legacy' }, deps)

    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('convert_project {"projectId":"p-new","confirm":true}')
    expect(sent).toEqual([['start', 'p-new', {}]])
  })

  test('a stage past the conversion limit: the estimate split, what the limit has left, then confirm', async () => {
    const { deps, sent } = harness(confirmation({
      action: 'convert-proceed', spent: 420_000, estimate: 850_000, fromAllowance: 580_000,
      fromCreditLimits: 150_000, moneyUsd: 2.4,
    }))

    const refused = await toolNamed('proceed_conversion').run({ decision: ConversionDecision.Extract }, deps)

    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('estimated at about 850,000 credits: 580,000 from the conversion limit,'
      + ' 150,000 from the organization\'s credit limits, $2.40 of topped-up credits')
    expect(refused.text).toContain('Conversion limit: 420,000 of 1,000,000 credits used, 580,000 left')
    expect(refused.text).toContain('proceed_conversion {"projectId":"p1","decision":"extract","confirm":true}')
    expect(sent).toEqual([['proceed', 'p1', { decision: ConversionDecision.Extract }]])

    await toolNamed('proceed_conversion').run({ decision: ConversionDecision.Extract, note: 'go', confirm: true }, deps)
    expect(sent[1]).toEqual(['proceed', 'p1', { decision: ConversionDecision.Extract, note: 'go', confirm: true }])
  })

  test('a conversion no plan unit covers says so, and its split is credit limits then money', () => {
    const text = confirmationRequiredPhrase({
      action: 'convert-proceed', cap: 0, spent: 0, estimate: 300_000, fromAllowance: 0, fromCreditLimits: 0,
      moneyUsd: 6,
    })

    expect(text).toContain('about 300,000 credits: $6.00 of topped-up credits')
    expect(text).toContain('No plan conversion covers this conversion')
    expect(text).toContain('call this tool again with the same arguments and "confirm": true')
  })

  test('the same refusal stored as text is phrased from its marker', () => {
    const stored = confirmation({ action: 'convert-proceed', spent: 1_000_000, estimate: 200_000, fromCreditLimits: 200_000 })
    const text = refusalPhrase(stored.message)

    expect(text).toContain('200,000 from the organization\'s credit limits')
    expect(text).toContain('1,000,000 of 1,000,000 credits used, 0 left')
    expect(text).not.toContain('confirmation-required')
  })

  test('a bare 428 from production: the confirmation when unconfirmed, the consent once confirmed', async () => {
    const bare = new ApiStatusError(428, '0b6f8a3e-8f0e-4b9f-9c55-2f1f0f6f2a11')

    const unconfirmed = await toolNamed('proceed_conversion')
      .run({ decision: ConversionDecision.Analyze }, harness(bare).deps)
    expect(unconfirmed.isError).toBe(true)
    expect(unconfirmed.text).toContain('proceed_conversion {"projectId":"p1","decision":"analyze","confirm":true}')
    expect(unconfirmed.text).toContain('Billing in the OwlMeans web application')
    expect(unconfirmed.text).not.toContain('api:client:status')

    // A refusal that answers a CONFIRMED call can only be the consent.
    const failing = harness(bare)
    ;(failing.deps.api.convert as { proceed: unknown }).proceed = async () => { throw bare }
    const confirmed = await toolNamed('proceed_conversion')
      .run({ decision: ConversionDecision.Analyze, confirm: true }, failing.deps)
    expect(confirmed.text).toContain('Do not retry this call automatically')
    expect(confirmed.text).not.toContain('"confirm":true')
  })

  test('the confirmed call still meets the balance and the consent, phrased and notified', async () => {
    const url = 'https://vib-stage.owlmeans.org/?top-up=conversion'
    const short = harness(new ConnectOutOfCredits(ConnectOutOfCredits.encode('conversion', 4, 1.5, url)))
    ;(short.deps.api.convert as { proceed: unknown }).proceed = async () => {
      throw new ConnectOutOfCredits(ConnectOutOfCredits.encode('conversion', 4, 1.5, url))
    }
    const credits = await toolNamed('proceed_conversion')
      .run({ decision: ConversionDecision.Implement, confirm: true }, short.deps)
    expect(credits.isError).toBe(true)
    expect(credits.text).toContain('$4.00')
    expect(credits.text).toContain('$1.50')
    expect(credits.text).toContain(url)
    expect(credits.text).not.toContain('out-of-credits:')
    expect(short.notified).toEqual([['warning', credits.text]])

    const consent = harness(null)
    ;(consent.deps.api.convert as { start: unknown }).start = async () => {
      throw new ConnectConsentRequired(ConnectConsentRequired.encode('conversion', 'https://x.test/account/billing?consent=1'))
    }
    const asked = await toolNamed('convert_project').run({ confirm: true }, consent.deps)
    expect(asked.text).toContain('https://x.test/account/billing?consent=1')
    expect(consent.notified).toHaveLength(1)
  })

  test('the MCP boundary hands the parent the same answer, and the URL-configured host names the project too', async () => {
    const callbacks = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>()
    const server: McpServerLike = { registerTool: (name, _config, cb) => { callbacks.set(name, cb) } }
    const http: ToolHost = { ...stdio, kind: ToolHostKind.Http }
    const { deps, notified } = harness(confirmation(), { host: http })
    registerCatalogue(server, deps)

    const result = await callbacks.get('convert_project')!({ projectId: 'p1' }) as {
      content: Array<{ text: string }>, isError?: boolean
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain('convert_project {"projectId":"p1","confirm":true}')
    expect(notified).toEqual([['warning', result.content[0]!.text]])
  })
})
