import { describe, expect, test } from 'bun:test'
import {
  CONNECT_FEED_START, ConnectFeedKind, ConnectHarness, ConnectLlm, ConnectTarget, type ConnectFeedEntry,
  type ConnectFeedPage,
} from '@owlmeans/viable-common'
import { catalogue, catalogueHelper } from '../src/tools/catalogue.js'
import { feedToolHelper } from '../src/tools/feed.js'
import { PLATFORM_CATALOGUE, ToolHostKind } from '../src/tools/consts.js'
import type { ToolDeps, ToolHost } from '../src/tools/types.js'

const FEED_TOOLS = ['project_activity', 'notifications', 'file_changes']

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

const entry = (patch: Partial<ConnectFeedEntry>): ConnectFeedEntry => ({
  id: '1759800000000-0', kind: ConnectFeedKind.RunStart, at: '2026-10-07T10:11:12.000Z', ...patch,
})

/** A connector whose feed reads are recorded; every answer is the page given. */
const connector = (page: ConnectFeedPage & { watching?: boolean }, attached: string | null = 'p1') => {
  const calls: unknown[][] = []
  const member = (name: string) => async (...args: unknown[]) => {
    calls.push([name, ...args])

    return page
  }
  const deps = {
    host: host(),
    api: {
      project: { activity: member('activity') },
      account: { notifications: member('notifications') },
      files: { changes: member('changes') },
    },
    session: async () => ({}) as never,
    currentSession: () => null,
    attached: () => attached,
    attach: () => undefined,
    log: () => undefined,
  } as unknown as ToolDeps

  return { deps, calls }
}

describe('viable-sdk — the feed tools', () => {
  test('activity and notices on every host, file changes on a cloud target only; all read-only', () => {
    const names = (h: ToolHost) => catalogueHelper.visibleTools(h).map(tool => tool.name)

    expect(names(host())).toEqual(expect.arrayContaining(FEED_TOOLS))
    expect(names(host({ target: ConnectTarget.Local }))).toEqual(expect.arrayContaining(['project_activity', 'notifications']))
    expect(names(host({ target: ConnectTarget.Local }))).not.toContain('file_changes')
    expect(names(host({ kind: ToolHostKind.Http, hasExecutor: false }))).toEqual(expect.arrayContaining(FEED_TOOLS))
    for (const name of FEED_TOOLS) {
      expect([name, toolNamed(name).annotations.readOnlyHint, toolNamed(name).annotations.destructiveHint])
        .toEqual([name, true, false])
    }
    const group = PLATFORM_CATALOGUE.capabilities.find(capability => capability.id === 'feeds')
    expect(group?.tools).toEqual(FEED_TOOLS)
  })

  test('project_activity echoes the cursor in its structured content and names the exact call that reads on', async () => {
    const page = {
      cursor: '1759800000000-4', gap: false,
      entries: [
        entry({ id: '1759800000000-1', kind: ConnectFeedKind.Step, data: { pipeline: 'vib:story:develop', step: 'implement', index: 3, total: 7 } }),
        entry({ id: '1759800000000-4', kind: ConnectFeedKind.Card, data: { kind: 'card', code: 'S-1', title: 'Sign up', status: 'completed' } }),
      ],
    }
    const { deps, calls } = connector(page)

    const result = await toolNamed('project_activity').run({ after: '1759800000000-0', wait: 20, detail: 'thinking' }, deps)

    expect(calls).toEqual([['activity', 'p1', { after: '1759800000000-0', wait: 20, detail: 'thinking' }]])
    expect(result.isError).not.toBe(true)
    expect(result.structured).toEqual({ projectId: 'p1', cursor: '1759800000000-4', gap: false, entries: page.entries })
    expect(result.text).toContain('step 3/7 implement of vib:story:develop')
    expect(result.text).toContain('story S-1 "Sign up" is completed')
    expect(result.text).toContain('cursor: 1759800000000-4')
    expect(result.text).toContain('project_activity {"projectId":"p1","detail":"thinking","after":"1759800000000-4","wait":20}')
  })

  test('a first read crosses no cursor, an empty page says so, and a gap points at the domain status', async () => {
    const { deps, calls } = connector({ cursor: CONNECT_FEED_START, gap: true, entries: [] })

    const result = await toolNamed('project_activity').run({ projectId: 'p2', detail: 'everything' }, deps)

    expect(calls).toEqual([['activity', 'p2', {}]])
    expect(result.text).toContain('No new activity.')
    expect(result.text).toContain('project_status')
    expect(result.text).toContain(`"after":"${CONNECT_FEED_START}"`)
    expect((result.structured as Record<string, unknown>).cursor).toBe(CONNECT_FEED_START)
  })

  test('notifications reads the organization\'s notices and phrases them for a person', async () => {
    const { deps, calls } = connector({
      cursor: '1759800000000-9', gap: false,
      entries: [entry({ id: '1759800000000-9', kind: ConnectFeedKind.Toast, data: { toast: 'out-of-tokens' } })],
    }, null)

    const result = await toolNamed('notifications').run({ after: '1759800000000-8' }, deps)

    expect(calls).toEqual([['notifications', { after: '1759800000000-8' }]])
    expect(result.text).toContain('ran out of credits')
    expect(result.structured).toEqual(expect.objectContaining({ cursor: '1759800000000-9', gap: false }))
    expect(result.text).toContain('notifications {"after":"1759800000000-9","wait":20}')
  })

  test('file_changes says when nothing watches the tree, and echoes the cursor either way', async () => {
    const { deps } = connector({
      cursor: '1759800000000-2', gap: false, watching: false,
      entries: [entry({ id: '1759800000000-2', kind: ConnectFeedKind.File, data: { event: 'change', path: 'sources/web/src/app.tsx' } })],
    })

    const result = await toolNamed('file_changes').run({}, deps)

    expect(result.text).toContain('preview_control')
    expect(result.text).toContain('change sources/web/src/app.tsx')
    expect(result.structured).toEqual(expect.objectContaining({ projectId: 'p1', cursor: '1759800000000-2', watching: false }))
  })

  test('a refusal is answered as one, never thrown', async () => {
    const { deps } = connector({ cursor: CONNECT_FEED_START, gap: false, entries: [] })
    ;(deps.api.project as unknown as Record<string, unknown>).activity = async () => { throw new Error('viable-api:project-not-found:p9') }

    const result = await toolNamed('project_activity').run({ projectId: 'p9' }, deps)

    expect(result.isError).toBe(true)
  })

  test('every kind renders as one bounded line', () => {
    const long = 'word '.repeat(500)
    for (const kind of Object.values(ConnectFeedKind)) {
      const text = feedToolHelper.renderEntry(entry({ kind, text: long, data: { status: 'ok' } }))
      expect([kind, text.includes('\n'), text.length <= 400]).toEqual([kind, false, true])
    }
  })
})
