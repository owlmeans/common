import { describe, expect, test } from 'bun:test'
import { ConnectHarness, ConnectLlm, ConnectTarget } from '@owlmeans/viable-common'

import { catalogue, catalogueHelper } from '../src/tools/catalogue.js'
import { serverInstructions } from '../src/tools/mcp.js'
import { renderPlatform } from '../src/tools/platform.js'
import { EXTENSION_TOOLS, PLATFORM_CATALOGUE, ToolHostKind } from '../src/tools/consts.js'
import type { PlatformCatalogue, ToolDefinition, ToolHost } from '../src/tools/types.js'

const host = (patch: Partial<ToolHost> = {}): ToolHost => ({
  kind: ToolHostKind.Stdio,
  target: ConnectTarget.Local,
  llm: ConnectLlm.Local,
  harness: ConnectHarness.ClaudeCode,
  hasExecutor: true,
  ...patch,
})

const url = host({
  kind: ToolHostKind.Http, target: ConnectTarget.Cloud, llm: ConnectLlm.Cloud, hasExecutor: false,
})

/**
 * The URL host of an ENTITLED account.
 *
 * Not a corner case: `resolveHostLlm` answers `local` for any account carrying the delegated
 * capability, whichever host asked — so this combination is what a paying user's web-configured
 * connector renders every time.
 */
const urlDelegated = host({
  kind: ToolHostKind.Http, target: ConnectTarget.Cloud, llm: ConnectLlm.Local, hasExecutor: false,
})

/**
 * What a parent agent reads before it decides how to approach a request.
 *
 * The catalogue is the one description of the platform that is not derived from a tool list, so
 * the two must not drift: every observable pipeline has one entry here, and every tool either of
 * them names exists. The rendering is checked for determinism because it is meant to sit
 * in a system prompt, and for its refusals because a group hidden without an explanation reads as
 * a platform that cannot do the thing at all.
 */
describe('viable-sdk — describe_platform', () => {
  test('every pipeline has a stable unique domain id', () => {
    const ids = PLATFORM_CATALOGUE.pipelines.map(pipeline => pipeline.id)

    expect(ids.every(id => id.trim() !== '')).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('every tool the catalogue names is a tool that exists', () => {
    const known = new Set([...catalogue.map(tool => tool.name), ...EXTENSION_TOOLS])

    for (const pipeline of PLATFORM_CATALOGUE.pipelines) {
      expect(pipeline.startedBy.length).toBeGreaterThan(0)
      for (const tool of pipeline.startedBy) expect(known.has(tool)).toBe(true)
    }
    for (const capability of PLATFORM_CATALOGUE.capabilities) {
      expect(capability.tools.length).toBeGreaterThan(0)
      for (const tool of capability.tools) expect(known.has(tool)).toBe(true)
      // Rendered instead of the group where a host hides it, so it can never be empty.
      expect(capability.absent.length).toBeGreaterThan(10)
    }
    for (const feature of PLATFORM_CATALOGUE.features) {
      for (const tool of feature.tools ?? []) expect(known.has(tool)).toBe(true)
    }
  })

  test('what a generated application carries is told on every host, with its settings tools', () => {
    // A fact about the PRODUCT, not about the connector: a parent that is not told the platform
    // already generates the legal pages or the landing gate writes its own, by hand, beside them.
    const features = new Set(PLATFORM_CATALOGUE.features.map(feature => feature.id))
    for (const id of ['landing-gate', 'legal-pages', 'google-tag', 'look', 'production']) {
      expect(features.has(id)).toBe(true)
    }

    for (const rendered of [renderPlatform(PLATFORM_CATALOGUE, host()), renderPlatform(PLATFORM_CATALOGUE, url)]) {
      expect(rendered).toContain('WHAT A GENERATED APPLICATION CARRIES')
      expect(rendered).toContain('/terms and /privacy')
      expect(rendered).toContain('Consent Mode v2')
      expect(rendered).toContain('no preview scaffolding')
      expect(rendered).toContain('project_settings, update_project_settings')
    }
    // The steps a parent may see a run stop at include the two new ones.
    const init = PLATFORM_CATALOGUE.pipelines.find(pipeline => pipeline.id === 'vib:project:init')!
    expect(init.stages!.indexOf('landing')).toBeLessThan(init.stages!.indexOf('scaffold'))
    expect(init.stages!.indexOf('legal')).toBeGreaterThan(init.stages!.indexOf('scaffold'))
    expect(init.stages!.indexOf('legal')).toBeLessThan(init.stages!.indexOf('build'))
  })

  test('every tool that exists is reachable through some group', () => {
    // The other direction, and the one that rots: a tool nobody's group names is a tool a parent
    // reading describe_platform never learns it has.
    const grouped = new Set(PLATFORM_CATALOGUE.capabilities.flatMap(one => one.tools))

    for (const tool of catalogue) {
      if (tool.name === 'describe_platform') continue
      expect(grouped.has(tool.name)).toBe(true)
    }
  })

  test('every tool belongs to exactly one group, and every group explains its absence', () => {
    // A tool named by two groups is offered twice in the rendering and refused twice where hidden;
    // a group without an absence sentence leaves a hole where a host hides it.
    const ids = PLATFORM_CATALOGUE.capabilities.map(one => one.id)
    expect(new Set(ids).size).toBe(ids.length)

    const owners = new Map<string, string[]>()
    for (const group of PLATFORM_CATALOGUE.capabilities) {
      expect(group.absent.trim()).not.toBe('')
      for (const tool of group.tools) owners.set(tool, [...owners.get(tool) ?? [], group.id])
    }
    for (const tool of catalogue) {
      if (tool.name === 'describe_platform') continue
      expect([tool.name, owners.get(tool.name)?.length]).toEqual([tool.name, 1])
    }
  })

  test('the server instructions name every family a host offers, and none it hides', () => {
    // The instructions are the first text a parent reads; a family missing there is one a parent
    // that never calls describe_platform does not know it has.
    const hosts = [host(), host({ llm: ConnectLlm.Cloud }), host({ target: ConnectTarget.Cloud }), url, urlDelegated]
    for (const one of hosts) {
      const instructions = serverInstructions({ host: one })
      const offered = new Set(catalogueHelper.visibleTools(one).map(tool => tool.name))
      for (const group of PLATFORM_CATALOGUE.capabilities) {
        const visible = group.tools.filter(tool => offered.has(tool))
        if (visible.length === 0) continue
        expect([group.id, visible.some(tool => new RegExp(`\\b${tool}\\b`).test(instructions))])
          .toEqual([group.id, true])
      }
      for (const tool of catalogue) {
        if (offered.has(tool.name)) continue
        expect([tool.name, new RegExp(`\\b${tool.name}\\b`).test(instructions)]).toEqual([tool.name, false])
      }
      expect(instructions).toContain('confirm: true')
      expect(instructions).toContain('except billing')
    }
  })

  test('the conversion group starts a conversion before it checks one', () => {
    // The order inside a group is the order a parent reads it in, and this one is a workflow: a
    // check reports what the INTAKE found, so the platform refuses it until a conversion exists.
    // Leading with `check_convertible` pointed a parent at the one call that cannot be first,
    // against a tool description and a `serverInstructions` sentence that both say the opposite.
    const conversion = PLATFORM_CATALOGUE.capabilities.find(one => one.id === 'conversion')

    expect(conversion).toBeDefined()
    expect(conversion!.tools.indexOf('convert_project'))
      .toBeLessThan(conversion!.tools.indexOf('check_convertible'))
    expect(conversion!.what).toContain('Start a conversion')
    expect(conversion!.what).not.toContain('Check whether')

    // And the rendering keeps that order, since it lists whatever the group offers as it stands.
    const rendered = renderPlatform(PLATFORM_CATALOGUE, host())
    expect(rendered).toContain(
      'convert_project, proceed_conversion, conversion_status, check_convertible, purge_origin'
    )
  })

  test('the render is byte-stable', () => {
    // It is meant to be read once and kept; a rendering that varied per call would defeat every
    // cache it sits in.
    expect(renderPlatform(PLATFORM_CATALOGUE, host())).toBe(renderPlatform(PLATFORM_CATALOGUE, host()))
    expect(renderPlatform(PLATFORM_CATALOGUE, host())).not.toBe(renderPlatform(PLATFORM_CATALOGUE, url))
  })

  test('a hidden group is explained rather than omitted', () => {
    // A parent that reads a shorter list without being told why concludes the platform cannot do
    // the thing, and writes the application by hand.
    const rendered = renderPlatform(PLATFORM_CATALOGUE, url)

    expect(rendered).not.toContain('next_question')
    expect(rendered).toContain('NOT IN THIS SESSION')
    expect(rendered).toContain('this server holds no session')
    expect(rendered).toContain('not on this machine')
    // The agent-setup group is an extension's: a host that adds none renders it as absent.
    expect(rendered).toContain('this server writes no files')
  })

  test('an extension\'s tools are offered by their own availability', () => {
    // A group with one usable tool is still offered — narrowed to that tool, not hidden.
    const extension = (name: string, availability: ToolDefinition['availability']): ToolDefinition => ({
      name, title: name, description: name, input: {}, availability,
      annotations: {}, run: async () => ({ text: name }),
    })
    const extended: ToolHost = {
      ...url,
      extensions: [extension('describe_harness', () => true), extension('install_harness', h => h.hasExecutor)],
    }
    const rendered = renderPlatform(PLATFORM_CATALOGUE, extended)

    expect(rendered).toContain('describe_harness')
    expect(rendered).not.toContain('install_harness')
    expect(catalogueHelper.visibleTools(extended).map(tool => tool.name)).toContain('describe_harness')
    expect(serverInstructions({ host: extended })).toContain('describe_harness')
    expect(serverInstructions({ host: url })).not.toContain('describe_harness')
  })

  test('what the session CAN drive is named with its tools', () => {
    const rendered = renderPlatform(PLATFORM_CATALOGUE, host())

    expect(rendered).toContain('next_question, answer_question')
    expect(rendered).toContain('next_task, submit_task_result')
    expect(rendered).toContain('check_convertible')
    // And every conversion pipeline, on both hosts.
    for (const one of [rendered, renderPlatform(PLATFORM_CATALOGUE, url)]) {
      expect(one).toContain('vib:project:convert:intake')
      expect(one).toContain('vib:project:convert:implementation')
    }
  })

  test('one switch decides who performs the model calls: all of them, or none', () => {
    // The delegated session is told every model call is its own — drafting, checks and formatting
    // included — and is offered the loop that collects them.
    const delegated = renderPlatform(PLATFORM_CATALOGUE, host())

    expect(delegated).toContain('every model call the platform makes for this session is yours to perform')
    expect(delegated).toContain('next_task, submit_task_result')

    // A cloud session performs none, a conversion's included, so it is neither told otherwise nor
    // offered a loop that would only ever answer "nothing".
    const billed = renderPlatform(PLATFORM_CATALOGUE, host({ llm: ConnectLlm.Cloud }))

    expect(billed).toContain('the platform performs every model call itself, a conversion\'s included')
    expect(billed).not.toContain('next_task, submit_task_result')
    expect(billed).not.toContain('yours to perform')
    expect(billed).toContain('this session runs in the cloud model mode')
  })

  test('a host that cannot hold a session is never told the calls are its own', () => {
    // The account setting is `local` here — that is what an entitled account resolves to on every
    // host — but this one can hold no session, so no task can ever be delivered through it.
    // Reading the mode before the tool list told such a parent to perform the platform's calls
    // while hiding the tool that collects them: it polls for a `next_task` it does not have and
    // reports the server as broken.
    const rendered = renderPlatform(PLATFORM_CATALOGUE, urlDelegated)

    expect(rendered).not.toContain('are yours to perform')
    expect(rendered).toContain('this session cannot collect one')
    // And the sentence it is given agrees with the group it is refused.
    expect(rendered).toContain('this server holds no session')
  })

  test('every pipeline is listed, whichever host is reading', () => {
    const rendered = renderPlatform(PLATFORM_CATALOGUE, host({ target: ConnectTarget.Cloud }))

    expect(rendered).toContain('vib:project:init')
    // Nothing is dropped: a parent must know the platform runs it even where it cannot start it.
    expect(renderPlatform(PLATFORM_CATALOGUE, url)).toContain('vib:project:reinit')
  })

  test('a pipeline nothing here can start says so instead of being dropped', () => {
    // Hand-built, because every tool the real catalogue names in a `startedBy` is offered on both
    // hosts today — so the branch that carries the refusal has nothing to exercise it until the
    // first host-gated one arrives, and by then the sentence has to already be right: a pipeline
    // silently absent reads as a platform that cannot run it at all.
    const gated: PlatformCatalogue = {
      ...PLATFORM_CATALOGUE,
      pipelines: [{
        id: 'vib:test:session-only',
        title: 'Something only a held session can start',
        what: 'Exists to pin what a host that cannot start it is told.',
        startedBy: ['next_task'],
        resumable: false,
      }],
    }

    const refused = renderPlatform(gated, url)
    expect(refused).toContain('vib:test:session-only')
    expect(refused).toContain('not startable in this session (next_task is not offered here)')

    // And the same entry names its tool where the session does hold one.
    expect(renderPlatform(gated, host())).toContain('start: next_task')
  })
})
