import { describe, expect, test } from 'bun:test'
import { ConnectHarness, ConnectJobKind, ConnectLlm, ConnectTarget } from '@owlmeans/viable-common'

import { catalogue } from '../src/tools/catalogue.js'
import { PLATFORM_CATALOGUE, renderPlatform } from '../src/tools/platform.js'
import type { PlatformCatalogue } from '../src/tools/platform.js'
import { ToolHostKind } from '../src/tools/types.js'
import type { ToolHost } from '../src/tools/types.js'

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
 * the two must not drift: every job kind a parent can poll for has an entry here, and every tool
 * either of them names exists. The rendering is checked for determinism because it is meant to sit
 * in a system prompt, and for its refusals because a group hidden without an explanation reads as
 * a platform that cannot do the thing at all.
 */
describe('viable-sdk — describe_platform', () => {
  test('every job kind a parent can poll for is described', () => {
    // A kind added without an entry reaches a parent as a job it cannot interpret.
    const described = new Set(
      PLATFORM_CATALOGUE.pipelines.map(pipeline => pipeline.jobKind).filter(kind => kind != null)
    )

    for (const kind of Object.values(ConnectJobKind)) {
      expect(described.has(kind)).toBe(true)
    }
  })

  test('every tool the catalogue names is a tool that exists', () => {
    const known = new Set(catalogue.map(tool => tool.name))

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
    // A group with one usable tool is still offered — narrowed to that tool, not hidden.
    expect(rendered).toContain('describe_harness')
    expect(rendered).not.toContain('install_harness')
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

  test('a session the platform pays for is still told a conversion\'s calls are its own', () => {
    // The one place the two halves of the rule meet: the account setting decides who performs the
    // platform's stories and free flight, a conversion delegates to whoever can hold a session. A
    // parent told flatly that the platform performs everything stops polling next_task, and the
    // conversion sits blocked until its deadline.
    const billed = renderPlatform(PLATFORM_CATALOGUE, host({ llm: ConnectLlm.Cloud }))

    expect(billed).toContain('except a conversion\'s')
    expect(billed).toContain('next_task, submit_task_result')
    // And the URL host, which can hold nothing, is told the opposite.
    expect(renderPlatform(PLATFORM_CATALOGUE, url)).toContain('this session cannot collect one')
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
