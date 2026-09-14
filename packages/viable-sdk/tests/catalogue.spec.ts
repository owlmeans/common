import { describe, expect, test } from 'bun:test'
import { ResilientError } from '@owlmeans/error'
import { ConnectHarness, ConnectLlm, ConnectTarget, OriginKind } from '@owlmeans/viable-common'
import { catalogue, visibleTools } from '../src/tools/catalogue.js'
import { renderJob } from '../src/tools/jobs.js'
import { registerCatalogue } from '../src/tools/mcp.js'
import type { McpServerLike } from '../src/tools/mcp.js'
import { REFUSALS, refusalMessage, refusalPhrase, UNPHRASED_REFUSAL } from '../src/tools/refusal.js'
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
  test('the model-task loop appears wherever a session can hold one, in either llm mode', () => {
    // Not gated on the llm mode: a conversion's model calls are the parent's by default whatever
    // the account setting says, so a `cloud` session hidden from these tools would sit on a job
    // blocked on a task it has no way to collect.
    for (const llm of [ConnectLlm.Cloud, ConnectLlm.Local]) {
      const offered = names(host({ llm }))
      expect(offered).toContain('next_task')
      expect(offered).toContain('submit_task_result')
    }

    // And nowhere a host forgets between calls: a task is handed out once and answered minutes
    // later, which a URL-configured host cannot do in either mode.
    for (const llm of [ConnectLlm.Cloud, ConnectLlm.Local]) {
      const http = names(host({ kind: ToolHostKind.Http, hasExecutor: false, llm }))
      expect(http).not.toContain('next_task')
      expect(http).not.toContain('submit_task_result')
    }
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

  test('the cloud file tool returns the platform source listing', async () => {
    const tool = catalogue.find(entry => entry.name === 'list_files')!
    const requested: string[] = []
    const result = await tool.run({ projectId: 'p1' }, {
      host: host({ target: ConnectTarget.Cloud }),
      api: {
        files: {
          list: async (projectId: string) => {
            requested.push(projectId)

            return ['sources/api/src/index.ts', 'sources/web/src/render.tsx']
          },
        },
      },
      session: async () => ({}) as never,
      currentSession: () => null,
      attached: () => null,
      attach: () => undefined,
      log: () => undefined,
    } as unknown as ToolHostDeps)

    expect(requested).toEqual(['p1'])
    expect(result.isError).not.toBe(true)
    expect(result.text).toContain('2 generated file(s)')
    expect(result.structured).toEqual({
      projectId: 'p1', total: 2,
      files: ['sources/api/src/index.ts', 'sources/web/src/render.tsx'],
    })
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

  test('the question loop appears wherever a session can hold one, whoever performs the models', () => {
    // Not gated on the llm mode: who performs the model calls has nothing to do with who answers a
    // question, and a platform-billed session must still be askable.
    for (const llm of [ConnectLlm.Cloud, ConnectLlm.Local]) {
      const offered = names(host({ llm }))
      expect(offered).toContain('next_question')
      expect(offered).toContain('answer_question')
    }

    // And nowhere a host forgets between calls: a question is delivered to a connector and
    // answered minutes later, which a URL-configured host cannot do in either mode.
    for (const llm of [ConnectLlm.Cloud, ConnectLlm.Local]) {
      const http = names(host({ kind: ToolHostKind.Http, hasExecutor: false, llm }))
      expect(http).not.toContain('next_question')
      expect(http).not.toContain('answer_question')
    }
  })

  test('the conversion tools are offered on both hosts', () => {
    // A cloud conversion needs no session: the platform clones the repository into its own slot
    // and performs the work. It is the PLATFORM that refuses a local project with no connector.
    for (const kind of [ToolHostKind.Stdio, ToolHostKind.Http]) {
      const offered = names(host({ kind, hasExecutor: kind === ToolHostKind.Stdio }))
      for (const tool of [
        'describe_platform', 'check_convertible', 'convert_project', 'proceed_conversion',
        'conversion_status', 'purge_origin',
      ]) {
        expect(offered).toContain(tool)
      }
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
        project: {
          status: async (projectId: string) => {
            order.push(`status:${projectId}`)

            return { agent: { locked: false } }
          },
        },
        story: {
          create: async (projectId: string) => {
            order.push(`create:${projectId}`)

            return { id: 's1' }
          },
          update: async (projectId: string) => {
            order.push(`update:${projectId}`)

            return { id: 's1' }
          },
          remove: async (projectId: string) => {
            order.push(`remove:${projectId}`)
          },
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

  test.each([
    ['create_story', { story: 'As a user, I want a note.' }, 'create'],
    ['update_story', { storyId: 's1', story: 'As a user, I want a revised note.' }, 'update'],
    ['delete_story', { storyId: 's1' }, 'remove'],
  ] as const)('%s restores the session before its slot-backed mutation', async (name, args, call) => {
    const { deps, order } = depsFor('p-current')

    await toolNamed(name).run(args, deps as never)

    expect(order.slice(0, 2)).toEqual(['session:p-current', `${call}:p-current`])
    if (name === 'delete_story') {
      expect(order.filter(entry => entry === 'status:p-current').length).toBeGreaterThanOrEqual(2)
    } else {
      expect(order).toEqual(['session:p-current', `${call}:p-current`])
    }
  })

  test('delete_story waits through its asynchronous cleanup lock', async () => {
    const { deps, order } = depsFor('p-current')
    let checks = 0
    deps.api.project.status = async (projectId: string) => {
      order.push(`status:${projectId}`)
      checks++

      return { agent: { locked: checks < 3 } } as never
    }

    const result = await toolNamed('delete_story').run({ storyId: 's1' }, deps as never)

    expect(result.isError).not.toBe(true)
    expect(checks).toBeGreaterThanOrEqual(4)
    expect(order.slice(0, 2)).toEqual(['session:p-current', 'remove:p-current'])
  })
})

describe('a conversion tool opens its session before the platform reads anything', () => {
  const job = { id: 'j1', projectId: 'p1', kind: 'convert-intake', status: 'running' }

  const depsFor = (opts: {
    dir?: string
    attached?: string | null
    /** Fields laid over the census the check answers with. */
    check?: Record<string, unknown>
    /** The conversion this project already has; `null` for one that has none. */
    conversion?: Record<string, unknown> | null
  } = {}): {
    deps: ToolHostDeps
    order: string[]
    created: Record<string, unknown>[]
  } => {
    const order: string[] = []
    const created: Record<string, unknown>[] = []
    let attached = opts.attached === undefined ? 'p1' : opts.attached
    const record = <T>(label: string, value: T) => async (...args: unknown[]) => {
      order.push(`${label}:${String(args[0])}`)

      return value
    }
    const deps = {
      host: host(),
      dir: 'dir' in opts ? opts.dir : '/tmp/some-project',
      api: {
        convert: {
          check: record('check', {
            projectId: 'p1', verdict: 'ready', reasons: [], shape: 'foreign', monorepo: false,
            unlinked: [], files: 10, bytes: 1024, bulk: 0, ...(opts.check ?? {}),
          }),
          start: record('start', job),
          create: async (body: unknown) => {
            // Recorded by name rather than by argument: the body is an object, and what the
            // creation branches have to be pinned on is its CONTENT, not its stringification.
            order.push('create')
            created.push(body as Record<string, unknown>)

            return job
          },
          proceed: record('proceed', job),
          purge: record('purge', job),
          // A project with no conversion answers an ERROR rather than an empty view — which is
          // what every best-effort read of it has to survive.
          status: opts.conversion === null
            ? async (projectId: string) => {
              order.push(`status:${String(projectId)}`)

              throw new Error('this project has no conversion')
            }
            : record('status', {
              projectId: 'p1', stage: 'intake', status: 'awaiting', estimates: [],
              originState: 'present', assumptions: 0, updatedAt: '2026-01-01T00:00:00.000Z',
              ...(opts.conversion ?? {}),
            }),
        },
      },
      session: async () => {
        // Filed against whatever is attached at this moment — which is the whole point of the
        // ordering these tests pin.
        order.push(`session:${attached ?? 'none'}`)

        return {} as never
      },
      currentSession: () => null,
      attached: () => attached,
      // Recorded only where it MOVES the connector: `ensureSession` re-attaches the project it is
      // already on, and a log of no-ops would say nothing about the ordering.
      attach: (projectId: string) => {
        if (projectId !== attached) order.push(`attach:${projectId}`)
        attached = projectId
      },
      log: () => undefined,
    }

    return { deps: deps as unknown as ToolHostDeps, order, created }
  }

  const toolNamed = (name: string) => {
    const tool = catalogue.find(entry => entry.name === name)
    if (tool == null) throw new Error(`no tool ${name}`)

    return tool
  }

  test('the tree is read through the connector, so the session exists first', async () => {
    // A local target's files are on this machine: a check dispatched before a session is filed is
    // answered by nobody, and the platform reports the connector as gone. The conversion is read
    // AFTER the check: the check is what the tool is for, and the conversion only decides what to
    // do next with what it said.
    const { deps, order } = depsFor()

    await toolNamed('check_convertible').run({}, deps)

    expect(order).toEqual(['session:p1', 'check:p1', 'status:p1'])
  })

  test('a check on a project already converting points at the conversion, not at starting one', async () => {
    // The one thing a parent does with a check is read its `next:` line. A project whose
    // conversion is waiting for a decision cannot be started again — the platform refuses a second
    // Start — so "convert_project to start" sends it to the only tool that cannot help while the
    // conversion sits at the decision nobody makes.
    const { deps } = depsFor({ conversion: { stage: 'analysis', status: 'awaiting' } })

    const result = await toolNamed('check_convertible').run({}, deps)

    expect(result.text).toContain('stage analysis · awaiting')
    expect(result.text).toContain('proceed_conversion')
    expect(result.text).not.toContain('convert_project to start')
  })

  test('a parked conversion sends it to the question instead', async () => {
    const { deps } = depsFor({ conversion: { stage: 'analysis', status: 'waiting' } })

    const result = await toolNamed('check_convertible').run({}, deps)

    expect(result.text).toContain('next: next_question')
  })

  test('with no conversion — or one that never started — starting it IS the next step', async () => {
    for (const conversion of [null, { status: 'pending' }, { status: 'cancelled' }] as const) {
      const { deps } = depsFor({ conversion })

      const result = await toolNamed('check_convertible').run({}, deps)

      expect(result.text).toContain('next: convert_project to start')
      expect(result.text).not.toContain('already under way')
    }
  })

  test('a conversion that has ENDED is not reported as running', async () => {
    // The lead line is derived from the status, not from the record existing: only `Pending` and
    // `Cancelled` are read as none, so a finished conversion used to be announced as "already
    // under way … · done" one line above "next: nothing — this conversion is finished".
    for (const [status, lead] of [
      ['done', 'conversion: finished — stage extraction · done'],
      ['failed', 'conversion: stopped at stage extraction · failed'],
    ] as const) {
      const { deps } = depsFor({ conversion: { stage: 'extraction', status } })

      const result = await toolNamed('check_convertible').run({}, deps)

      expect(result.text).toContain(lead)
      expect(result.text).not.toContain('already under way')
      // The tail stays wherever the lead goes: one call carries the whole picture.
      expect(result.text).toContain('(conversion_status carries the whole picture)')
    }
  })

  test('a refused origin has no next step, whatever a run says about it', async () => {
    // The verdict is a fact about the tree; a record only says what the attempt that found it out
    // did next.
    const { deps } = depsFor({
      check: { verdict: 'refused', reasons: ['no-sources'] },
      conversion: { status: 'failed' },
    })

    const result = await toolNamed('check_convertible').run({}, deps)

    expect(result.text).toContain('next: nothing — this origin cannot be converted')
  })

  test('every state-changing conversion call is preceded by it', async () => {
    for (const [name, args, called] of [
      ['convert_project', {}, 'start'],
      ['proceed_conversion', { decision: 'analyze' }, 'proceed'],
      ['purge_origin', { confirm: true }, 'purge'],
    ] as const) {
      const { deps, order } = depsFor()
      await toolNamed(name).run(args as Record<string, unknown>, deps)

      expect(order).toEqual(['session:p1', `${called}:p1`])
    }
  })

  test('a read needs no session, and does not open one', async () => {
    const { deps, order } = depsFor()

    await toolNamed('conversion_status').run({}, deps)

    expect(order).toEqual(['status:p1'])
  })

  test('a purge without confirmation deletes nothing and says why', async () => {
    // Irreversible, and the user has to have agreed to it.
    const { deps, order } = depsFor()

    const result = await toolNamed('purge_origin').run({}, deps)

    expect(result.isError).toBe(true)
    expect(result.text).toContain('confirm: true')
    expect(order).toEqual([])
  })

  test('the directory becomes a LOCAL origin, attached before the session opens', async () => {
    // The order is the contract: the project is created, the connector moves onto it, and only
    // then is a session opened — one filed against the previous project would leave the platform
    // delivering this conversion's file reads to nobody.
    const { deps, order, created } = depsFor({ attached: null })

    await toolNamed('convert_project').run({ name: 'Ledger' }, deps)

    expect(created).toEqual([{
      name: 'Ledger', target: ConnectTarget.Local, origin: { kind: OriginKind.Local },
    }])
    expect(order).toEqual(['create', 'attach:p1', 'session:p1', 'start:p1'])
  })

  test('with no directory a repository is cloned by the platform instead', async () => {
    const { deps, order, created } = depsFor({ attached: null, dir: undefined })

    await toolNamed('convert_project')
      .run({ repoUrl: 'https://github.com/acme/app', branch: 'next' }, deps)

    expect(created).toEqual([{
      target: ConnectTarget.Cloud,
      origin: { kind: OriginKind.Github, repoUrl: 'https://github.com/acme/app', branch: 'next' },
    }])
    expect(order).toEqual(['create', 'attach:p1', 'session:p1', 'start:p1'])
  })

  test('a named repository outranks the directory, rather than being dropped in silence', async () => {
    // A stdio connector ALWAYS has a directory, so reading that first would convert the caller's
    // own working copy and say nothing about the repoUrl it discarded.
    const { deps, created } = depsFor({ attached: null })

    await toolNamed('convert_project').run({ repoUrl: 'https://github.com/acme/app' }, deps)

    expect(created).toEqual([{
      target: ConnectTarget.Cloud,
      origin: { kind: OriginKind.Github, repoUrl: 'https://github.com/acme/app' },
    }])
  })

  test('with neither an origin nor a project it asks for one instead of guessing', async () => {
    const { deps, order, created } = depsFor({ attached: null, dir: undefined })

    const result = await toolNamed('convert_project').run({}, deps)

    expect(result.isError).toBe(true)
    expect(result.text).toContain('repoUrl')
    expect(created).toEqual([])
    expect(order).toEqual([])
  })
})

describe('a question is carried to a person and its answer routed back', () => {
  const question = {
    id: 'q1', projectId: 'p1', kind: 'choice', question: 'One product or two?',
    options: [{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }],
    expiresAt: '2026-01-01T00:00:00.000Z',
  }

  const depsWith = (opts: {
    next?: unknown
    held?: Record<string, unknown>
    parked?: unknown
    /** Reachable only through the job — the conversion status read fails or comes back empty. */
    onJob?: unknown
    sent: string[]
  }) => ({
    host: host(),
    api: {
      convert: {
        status: async () => {
          if (opts.parked == null) throw new Error('this project has no conversion')

          return { pendingInquiry: opts.parked }
        },
      },
      project: {
        job: async (projectId: string, jobId: string) => {
          opts.sent.push(`job:${projectId}:${jobId}`)

          return { inquiry: opts.onJob ?? null }
        },
      },
      inquiry: {
        answer: async (projectId: string, inquiryId: string, answer: unknown) => {
          opts.sent.push(`api:${projectId}:${inquiryId}:${JSON.stringify(answer)}`)
        },
      },
    },
    session: async () => ({
      nextQuestion: async () => opts.next ?? null,
      questionById: (id: string) => (opts.held ?? {})[id] ?? null,
      outstandingQuestions: () => Object.values(opts.held ?? {}),
      answerQuestion: async (answer: unknown) => {
        opts.sent.push(`session:${JSON.stringify(answer)}`)
      },
      pendingQuestions: () => 0,
    }),
    currentSession: () => null,
    attached: () => 'p1',
    attach: () => undefined,
    log: () => undefined,
  }) as unknown as ToolHostDeps

  const toolNamed = (name: string) => {
    const tool = catalogue.find(entry => entry.name === name)
    if (tool == null) throw new Error(`no tool ${name}`)

    return tool
  }

  test('a queued question comes back as the envelope', async () => {
    const sent: string[] = []
    const result = await toolNamed('next_question')
      .run({ maxWaitSec: 0 }, depsWith({ next: question, sent }))

    expect(result.isError).not.toBe(true)
    expect(result.text).toContain('One product or two?')
    expect(result.structured?.questionId).toBe('q1')
  })

  test('a run that parked while nobody was attached is still offered', async () => {
    // Its operation expired with the session that held it, so the connector's own queue knows
    // nothing about it — and without this the only way back to it is the web application.
    const sent: string[] = []
    const result = await toolNamed('next_question')
      .run({ maxWaitSec: 0 }, depsWith({ parked: question, sent }))

    expect(result.text).toContain('parked on a question')
    expect(result.text).toContain('One product or two?')
    expect(result.structured?.questionId).toBe('q1')
  })

  test('nothing anywhere says so, and points at the job', async () => {
    const sent: string[] = []
    const result = await toolNamed('next_question').run({ maxWaitSec: 0 }, depsWith({ sent }))

    expect(result.isError).not.toBe(true)
    expect(result.text).toContain('wait_for')
  })

  test('an answer to a question this session holds goes back on its operation', async () => {
    const sent: string[] = []
    await toolNamed('answer_question')
      .run({ questionId: 'q1', answer: 'one' }, depsWith({ held: { q1: question }, sent }))

    expect(sent).toEqual(['session:{"inquiryId":"q1","value":"one"}'])
  })

  test('an answer to a parked question goes back by its own id', async () => {
    const sent: string[] = []
    await toolNamed('answer_question')
      .run({ questionId: 'q1', declined: true }, depsWith({ parked: question, sent }))

    expect(sent).toEqual(['api:p1:q1:{"inquiryId":"q1","declined":true}'])
  })

  test('an answer the question cannot accept is refused here, and nothing is sent', async () => {
    // Refused with the person still in front of the parent; sent on, it would cost a round trip
    // on a question a human has already answered.
    const sent: string[] = []
    const result = await toolNamed('answer_question')
      .run({ questionId: 'q1', answer: 'three' }, depsWith({ held: { q1: question }, sent }))

    expect(result.isError).toBe(true)
    expect(result.text).toContain('one, two')
    expect(sent).toEqual([])
  })

  test('a question reachable only through its job can still be answered', async () => {
    // The two tools must reach exactly as far as each other. `next_question` finds a parked
    // question through the job id when the conversion status read fails or comes back empty, so
    // an `answer_question` without that reach refuses what the person has already answered — and
    // sends the parent back to `next_question`, which offers the same question again.
    const sent: string[] = []
    await toolNamed('answer_question')
      .run({ questionId: 'q1', jobId: 'j1', answer: 'two' }, depsWith({ onJob: question, sent }))

    expect(sent).toEqual(['job:p1:j1', 'api:p1:q1:{"inquiryId":"q1","value":"two"}'])
  })

  test('a question nobody is waiting on is refused rather than invented', async () => {
    const sent: string[] = []
    const result = await toolNamed('answer_question')
      .run({ questionId: 'nope', answer: 'one' }, depsWith({ held: { q1: question }, sent }))

    expect(result.isError).toBe(true)
    expect(result.text).toContain('next_question')
    expect(sent).toEqual([])
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


describe('a refusal reaches the parent as a sentence, never as a marshalled class', () => {
  /**
   * What a refusal actually looks like by the time a tool sees it.
   *
   * The platform's refusal classes live in packages this one does not depend on, so
   * `ResilientError.ensure` — which is what the API client rebuilds an error with — finds no
   * converter for the type name, keeps the WHOLE marshalled string, and hands back an error whose
   * message is the local stack trace with that string on its first line.
   */
  const asThrown = (marker: string, type = 'ConversionErrorViableAgentCommonError'): Error =>
    ResilientError.ensure(new Error([
      type, marker, 'Error: refused\n    at handler (agent.ts:1:1)',
    ].join(ResilientError.separator)))

  const toolNamed = (name: string) => {
    const tool = catalogue.find(entry => entry.name === name)
    if (tool == null) throw new Error(`no tool ${name}`)

    return tool
  }

  const refusing = (e: unknown, logged: string[] = []): ToolHostDeps => ({
    host: host(),
    api: {
      convert: {
        purge: async () => { throw e },
        status: async () => { throw e },
        check: async () => { throw e },
        proceed: async () => { throw e },
      },
      project: { confirm: async () => { throw e } },
    },
    session: async () => ({}) as never,
    currentSession: () => null,
    attached: () => 'p1',
    attach: () => undefined,
    log: (line: string) => { logged.push(line) },
  }) as unknown as ToolHostDeps

  /** A connector whose calls ANSWER — the stored-cause channels are rendered, not thrown. */
  const answered = (api: Record<string, unknown>): ToolHostDeps => ({
    host: host(),
    api,
    session: async () => ({}) as never,
    currentSession: () => null,
    attached: () => 'p1',
    attach: () => undefined,
    log: () => undefined,
  }) as unknown as ToolHostDeps

  test('a purge refused in place says what it means, not what class it was', async () => {
    const result = await toolNamed('purge_origin')
      .run({ confirm: true }, refusing(asThrown('viable-agent-common:conversion:purge-in-place')))

    expect(result.isError).toBe(true)
    expect(result.text).toContain('Nothing to purge')
    expect(result.text).toContain('in-place repair')
    // Neither half of the marshalling survives: the type name a model cannot read, and a stack
    // trace from a machine it has no access to.
    expect(result.text).not.toContain('ViableAgentCommonError')
    expect(result.text).not.toContain(ResilientError.separator)
    expect(result.text).not.toContain('    at ')
  })

  test('every conversion verb answers its refusal the same way', async () => {
    for (const [name, args, marker, said] of [
      ['conversion_status', {}, 'viable-agent-common:conversion:unsupported:no-origin',
        'generated by the platform'],
      ['check_convertible', {}, 'viable-agent-common:conversion:stage:intake->check',
        'not available from where the conversion stands'],
      ['proceed_conversion', { decision: 'analyze' },
        'viable-agent-common:out-of-tokens:conversion-budget', 'will not cover'],
    ] as const) {
      const result = await toolNamed(name)
        .run(args as Record<string, unknown>, refusing(asThrown(marker)))

      expect(result.isError).toBe(true)
      expect(result.text).toContain(said)
      expect(result.text).not.toContain(ResilientError.separator)
    }
  })

  test('a marker nothing has a sentence for keeps the marker and still names a next step', async () => {
    // The honest answer for a refusal this table has never heard of: it names what happened, and
    // it is the one thing that keeps working as the platform grows refusals faster than phrasings.
    // On its own it is still wire text with no tool to call, so the next step is said beside it.
    const result = await toolNamed('conversion_status')
      .run({}, refusing(asThrown('viable-agent-common:conversion:something-nobody-phrased-yet')))

    expect(result.text).toContain('viable-agent-common:conversion:something-nobody-phrased-yet')
    expect(result.text).toContain(UNPHRASED_REFUSAL)
    expect(result.text).toContain('conversion_status')
    expect(result.text).not.toContain('    at ')
  })

  test('a conversion verb answered inside the tool is still written to the connector log', async () => {
    // `answering` is what takes the five convert verbs OUT of `registerCatalogue`'s catch, which
    // is the only other place a failure is recorded — so without a line of its own a refused
    // conversion is the one thing an operator can find nothing about, while every other tool is
    // still there.
    const logged: string[] = []
    const result = await toolNamed('purge_origin').run(
      { confirm: true },
      refusing(asThrown('viable-agent-common:conversion:purge-in-place'), logged)
    )

    expect(result.isError).toBe(true)
    expect(logged[0]).toContain('purge_origin')
    expect(logged[0]).toContain('viable-agent-common:conversion:purge-in-place')
    expect(logged[0]).not.toContain('    at ')
  })

  test('a refusal STORED on a record is phrased in every channel that renders one', async () => {
    // The platform writes a failed stage's cause with `describeFailure`, which for a refusal is
    // the marker verbatim. Rendered raw, `conversion_status` answered a declined relocation with
    // `viable-agent-common:conversion:relocate-declined` while `wait_for` on the very same run
    // read out the sentence — one refusal, two contradictory readings.
    const marker = 'viable-agent-common:conversion:relocate-declined'

    const conversion = await toolNamed('conversion_status').run({}, answered({
      convert: {
        status: async () => ({
          projectId: 'p1', stage: 'analysis', status: 'failed', estimates: [],
          originState: 'present', assumptions: 0, lastError: marker, updatedAt: '',
        }),
      },
    }))
    expect(conversion.text).toContain('__viable_converted/')
    expect(conversion.text).not.toContain('viable-agent-common:')

    // `slot.lastError` is the channel a content refusal, a reserved name and a legacy-layout
    // verdict are stored on; `buildWarning` beside it is diagnostics somebody asked for and is
    // rendered exactly as it stands, stack-shaped lines included.
    const warning = 'the build failed\n    at bundle (rollup.js:1:1)\n  src/x.ts: no such export'
    const project = await toolNamed('project_status').run({}, answered({
      project: {
        status: async () => ({
          project: { id: 'p1', name: 'X', alias: 'x' },
          slot: {
            kind: 'local', status: 'error',
            lastError: 'viable-agent-common:content-refused:abuse-tooling',
            buildWarning: warning,
          },
          agent: { locked: false },
        }),
      },
    }))
    expect(project.text).toContain('unsolicited bulk messaging')
    expect(project.text).not.toContain('content-refused:')
    expect(project.text).toContain(warning)

    const pipeline = await toolNamed('pipeline_status').run({ runId: 'r1' }, answered({
      pipeline: {
        state: async () => ({
          pipeline: 'vib:project:convert:analysis', status: 'failed', step: 'relocate',
          error: marker,
        }),
      },
    }))
    expect(pipeline.text).toContain('__viable_converted/')
    expect(pipeline.text).not.toContain('viable-agent-common:')
  })

  test('a plain-text failure body never reaches the parent as a stack trace', () => {
    // `processResponse` in `@owlmeans/api` ensures ANY string response body, and an edge 502/503
    // answers in plain text. Nothing recognises the class, so `ResilientError.ensure` falls
    // through to the base converter — which puts the MESSAGE in `type` and the local STACK in
    // `message`, with no marshalling separator anywhere to give the shape away.
    const gateway = ResilientError.ensure('502 Bad Gateway: upstream connect error', true)

    expect(gateway.message).toContain('    at ')
    expect(refusalPhrase(gateway)).toBe('502 Bad Gateway: upstream connect error')
    expect(refusalMessage(gateway)).not.toContain('    at ')
  })

  test('the detail a refusal carries is kept where it is the actionable part', () => {
    expect(refusalPhrase(asThrown('viable-agent-common:reserved-name:Shopify'))).toContain('"Shopify"')
    expect(refusalPhrase(asThrown('viable-agent-common:content-refused:abuse-tooling')))
      .toContain('unsolicited bulk messaging')
    expect(refusalPhrase(asThrown('viable-agent-common:target-integrity:package.json missing')))
      .toContain('package.json missing')
  })

  test('a stored cause is phrased as readily as a thrown one', () => {
    // `slot.lastError` and `job.error` are strings with no class left on them, and the platform
    // writes them from the same refusal — so one function has to serve both.
    expect(refusalPhrase('viable-agent-common:conversion:relocate-declined'))
      .toContain('__viable_converted/')
    expect(refusalPhrase('viable-converter:origin-purged')).toContain('cannot be undone')
  })

  test('a failed job reports its cause in the same sentence', () => {
    const rendered = renderJob({
      id: 'j1', projectId: 'p1', kind: 'convert-implementation', status: 'failed',
      error: 'viable-converter:taxonomy-missing',
    } as never)

    expect(rendered).toContain('ANALYSIS stage records')
    expect(rendered).not.toContain('viable-converter:')
  })

  test('anything else a tool throws reaches the parent phrased, through the MCP boundary', async () => {
    // The wrapper inside the conversion verbs is not the only path: every other tool throws, and
    // what a host hands the model is whatever `registerCatalogue` catches.
    const handlers: Record<string, (args: Record<string, unknown>) => Promise<{
      content: Array<{ type: 'text', text: string }>, isError?: boolean
    }>> = {}
    const server: McpServerLike = {
      registerTool: (name, _config, cb) => { handlers[name] = cb },
    }
    const logged: string[] = []
    const deps = {
      ...refusing(asThrown('viable-agent-common:reserved-name:Shopify', 'ReservedNameErrorViableAgentCommonError')),
      log: (line: string) => { logged.push(line) },
    } as unknown as ToolHostDeps

    registerCatalogue(server, deps)
    const result = await handlers.confirm_project!({ name: 'Shopify Dashboard' })

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain('"Shopify"')
    expect(result.content[0]!.text).not.toContain(ResilientError.separator)
    // The LOG keeps the marker: it is what a person greps for, and the stack is from a machine
    // they cannot reach.
    expect(logged[0]).toContain('viable-agent-common:reserved-name:Shopify')
    expect(logged[0]).not.toContain('    at ')
  })

  test('a failure that is not a refusal is passed through exactly as it is', () => {
    expect(refusalPhrase(new Error('wait_for took longer than 45000ms')))
      .toBe('wait_for took longer than 45000ms')
    expect(refusalMessage(new Error('nothing marshalled here'))).toBe('nothing marshalled here')

    // A job's `error` doubles as the build warning a slot recorded, and build diagnostics are
    // full of lines that look like stack frames. A stack only ever arrives inside the
    // marshalling, so nothing outside it is cut.
    const warning = 'the build failed\n    at bundle (rollup.js:1:1)\n  src/x.ts: no such export'
    expect(refusalPhrase(warning)).toBe(warning)
  })

  test('no marker in the table shadows a more specific one below it', () => {
    // The first marker the message contains wins, so a family marker placed above one of its own
    // reasons would answer for all of them — `conversion:unsupported:` over `…:not-linked`, say.
    REFUSALS.forEach((entry, index) => {
      for (const later of REFUSALS.slice(index + 1)) {
        expect([later.marker, later.marker.includes(entry.marker)]).toEqual([later.marker, false])
      }
    })
  })

  test('every phrase reads as a sentence with nothing after the marker', () => {
    for (const entry of REFUSALS) {
      const phrase = entry.phrase('')
      expect([entry.marker, phrase.length > 40]).toEqual([entry.marker, true])
      expect([entry.marker, phrase.trim().endsWith('.')]).toEqual([entry.marker, true])
      // A phrase that repeated its own marker would put the wire text back in front of the reader.
      expect([entry.marker, phrase.includes(entry.marker)]).toEqual([entry.marker, false])
    }
  })
})
