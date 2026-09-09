import { describe, expect, test } from 'bun:test'
import { ConnectHarness, ConnectLlm, ConnectTarget } from '@owlmeans/viable-common'
import { catalogue, visibleTools } from '../src/tools/catalogue.js'
import { ToolHostKind } from '../src/tools/types.js'
import type { ToolDeps as ToolHostDeps, ToolHost } from '../src/tools/types.js'

const host = (patch: Partial<ToolHost> = {}): ToolHost => ({
  kind: ToolHostKind.Stdio,
  target: ConnectTarget.Local,
  llm: ConnectLlm.Cloud,
  harness: ConnectHarness.ClaudeCode,
  hasExecutor: true,
  ...patch,
})

const names = (h: ToolHost): string[] => visibleTools(h).map(tool => tool.name)

describe('viable-sdk — what a parent agent is offered', () => {
  test('the model-task loop appears only where the parent is performing the calls', () => {
    // Offering it in the cloud mode would invite a parent to poll for work that will never come.
    expect(names(host({ llm: ConnectLlm.Cloud }))).not.toContain('next_task')
    expect(names(host({ llm: ConnectLlm.Local }))).toContain('next_task')
    expect(names(host({ llm: ConnectLlm.Local }))).toContain('submit_task_result')
  })

  test('the local tools appear only where there is a machine to act on', () => {
    for (const tool of ['run_local', 'stop_local', 'local_status', 'local_setup_guide']) {
      expect(names(host({ target: ConnectTarget.Local }))).toContain(tool)
      expect(names(host({ target: ConnectTarget.Cloud }))).not.toContain(tool)
    }
  })

  test('the file tools appear only where the platform holds the files', () => {
    expect(names(host({ target: ConnectTarget.Cloud }))).toContain('list_files')
    expect(names(host({ target: ConnectTarget.Local }))).not.toContain('list_files')
  })

  test('the URL-configured host offers nothing that needs a disk', () => {
    const http = names(host({
      kind: ToolHostKind.Http, target: ConnectTarget.Cloud, hasExecutor: false,
    }))

    expect(http).not.toContain('install_harness')
    expect(http).not.toContain('run_local')
    // But it is still a complete way to build an application.
    expect(http).toContain('create_project')
    expect(http).toContain('develop_story')
    expect(http).toContain('wait_for')
  })

  test('the core flow is offered in every mode', () => {
    const modes: ToolHost[] = [
      host({ target: ConnectTarget.Local, llm: ConnectLlm.Cloud }),
      host({ target: ConnectTarget.Local, llm: ConnectLlm.Local }),
      host({ target: ConnectTarget.Cloud, llm: ConnectLlm.Cloud }),
      host({ target: ConnectTarget.Cloud, llm: ConnectLlm.Local }),
    ]
    for (const mode of modes) {
      const offered = names(mode)
      for (const tool of [
        'describe_capabilities', 'create_project', 'confirm_project', 'project_status',
        'list_stories', 'develop_story', 'wait_for', 'resume_pipeline', 'modify_project',
      ]) {
        expect(offered).toContain(tool)
      }
    }
  })

  test('every tool has a description a model can act on, and no two share a name', () => {
    const seen = new Set<string>()
    for (const tool of catalogue) {
      expect(seen.has(tool.name)).toBe(false)
      seen.add(tool.name)
      // The description is the only thing a parent agent reads before choosing a tool.
      expect(tool.description.length).toBeGreaterThan(40)
      expect(tool.title.length).toBeGreaterThan(0)
    }
  })

  test('the story tools mirror what the platform\'s own agent can do', () => {
    const offered = names(host())
    for (const tool of [
      'list_stories', 'search_stories', 'create_story', 'update_story', 'delete_story',
    ]) {
      expect(offered).toContain(tool)
    }
  })
})

describe('a tool that starts work attaches its project before opening a session', () => {
  const toolNamed = (name: string) => {
    const tool = catalogue.find(entry => entry.name === name)
    if (tool == null) throw new Error(`no tool ${name}`)

    return tool
  }

  const job = { id: 'j1', projectId: 'p-named', kind: 'story-develop', status: 'running' }

  const depsFor = (attachedAt: string | null): {
    deps: ToolHostDeps
    order: string[]
    attached: () => string | null
  } => {
    const order: string[] = []
    let attached = attachedAt
    const deps = {
      host: host(),
      api: {
        story: {
          develop: async (projectId: string) => {
            order.push(`develop:${projectId}`)

            return job
          },
        },
      },
      session: async () => {
        // What the platform files the session against is whatever is attached at this moment.
        order.push(`session:${attached ?? 'none'}`)

        return {} as never
      },
      currentSession: () => null,
      attached: () => attached,
      attach: (projectId: string) => { attached = projectId },
      log: () => undefined,
    }

    return { deps: deps as unknown as ToolHostDeps, order, attached: () => attached }
  }

  test('a named project is attached, so the session is filed against it', async () => {
    // Opening first would file the session against the previously attached project, and the
    // platform would deliver this project's operations to nobody — a run that blocks until its
    // deadline with nothing reporting an error.
    const { deps, order, attached } = depsFor('p-previous')

    await toolNamed('develop_story').run({ projectId: 'p-named', storyId: 's1' }, deps as never)

    expect(attached()).toBe('p-named')
    expect(order).toEqual(['session:p-named', 'develop:p-named'])
  })

  test('with nothing named it uses what is attached, and still opens first', async () => {
    const { deps, order } = depsFor('p-current')

    await toolNamed('develop_story').run({ storyId: 's1' }, deps as never)

    expect(order).toEqual(['session:p-current', 'develop:p-current'])
  })
})

describe('a task handed out can be read again', () => {
  const task = {
    id: 't1', projectId: 'p1', role: 'coder', tier: 'strong', effort: 'low', attempt: 1,
    mode: 'text', messages: [{ role: 'user', content: 'do the thing' }],
  }

  const depsWith = (opts: {
    next?: unknown, outstanding?: unknown[], byId?: Record<string, unknown>
  }) => ({
    host: host({ llm: ConnectLlm.Local }),
    api: {},
    session: async () => ({
      nextTask: async () => opts.next ?? null,
      outstandingTasks: () => opts.outstanding ?? [],
      taskById: (id: string) => (opts.byId ?? {})[id] ?? null,
      pendingTasks: () => 0,
    }),
    currentSession: () => null,
    attached: () => 'p1',
    attach: () => undefined,
    log: () => undefined,
  }) as unknown as ToolHostDeps

  const nextTask = () => {
    const tool = catalogue.find(entry => entry.name === 'next_task')
    if (tool == null) throw new Error('no next_task')

    return tool
  }

  test('an id re-reads the task instead of taking a new one', async () => {
    // A parent that lost the envelope — a compacted conversation, a subagent that died before
    // answering — otherwise has no way back to it, and the job blocks for the full 45 minutes.
    const result = await nextTask().run({ taskId: 't1' }, depsWith({ byId: { t1: task } }))

    expect(result.isError).not.toBe(true)
    expect(result.text).toContain('do the thing')
    expect(result.structured?.taskId).toBe('t1')
  })

  test('an id nobody was given is refused, and says what to call instead', async () => {
    const result = await nextTask().run({ taskId: 'nope' }, depsWith({}))

    expect(result.isError).toBe(true)
    expect(result.text).toContain('next_task')
  })

  test('nothing new, but something unanswered, names it rather than re-handing it', async () => {
    // Re-handing would have a parent whose subagent is still working run the same task twice.
    const result = await nextTask().run({ maxWaitSec: 0 }, depsWith({ outstanding: [task] }))

    expect(result.isError).not.toBe(true)
    expect(result.text).toContain('t1')
    expect(result.text).toContain('submit_task_result')
    expect(result.text).not.toContain('do the thing')
  })

  test('nothing at all says so, and points at the job', async () => {
    const result = await nextTask().run({ maxWaitSec: 0 }, depsWith({}))

    expect(result.text).toContain('wait_for')
  })
})
