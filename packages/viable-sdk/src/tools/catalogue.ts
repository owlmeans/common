import { z } from 'zod'
import { CommitTimeout, TransitionAction, WorkcardKind } from '@owlmeans/planning'
import {
  ConnectHarness, ConnectTarget, ConversionDecision, ConversionStatus,
  ConvertibilityVerdict, MODEL_TIER_ROLES, OriginKind, STORY_BAND_MAX_USD,
  STORY_BAND_MIN_USD, VIABLE_STORY_TYPE, ViableStoryTransition
} from '@owlmeans/viable-common'
import type {
  ConnectPipelineState, ConnectProjectStatus, ConnectStoryStatus, ConversionStatusView,
  ConvertCheck, InquiryPayload
} from '@owlmeans/viable-common'
import {
  COMMIT_WAIT_MS, NEXT_QUESTION_WAIT_MS, NEXT_TASK_WAIT_MS, STORY_PAGE_SIZE
} from '../consts.js'
import { describeHarness, installHarness } from '../harness/index.js'
import { envStatus } from '../project/env.js'
import { missingServices, readSetupReport, renderSetupGuide, setUserEnv } from '../project/setup.js'
import { localStatus, runLocal, stopLocal } from '../run/index.js'
import { parseTaskResult, renderTaskEnvelope } from '../task/envelope.js'
import { parseAnswer, renderQuestionEnvelope } from '../task/inquiry.js'
import { PLATFORM_CATALOGUE, renderPlatform } from './platform.js'
import { refusalMessage, refusalPhrase } from './refusal.js'
import {
  conversionNext, renderPipelineStatus, renderProjectStatus, renderStoryStatus,
} from './status.js'
import { renderStories, resolveStory, STORY_ORDER, storyQuery } from './stories.js'
import type { ToolDeps, ToolDefinition, ToolHost, ToolResult } from './types.js'
import {
  anyHost, cloudTarget, localTarget, performsModelTasks, sessionCapable, ToolHostKind, withExecutor
} from './types.js'

const ok = <Structured extends object>(text: string, structured?: Structured) => ({ text, structured })
const fail = (text: string) => ({ text, isError: true })

/**
 * A conversion refusal is an ANSWER, so it comes back as one.
 *
 * Every conversion verb can be refused by a decision rather than by a failure — this origin is the
 * project, that decision is not available from this stage, the balance will not cover it — and the
 * refusal reaches this process as a marshalled `type|||marker|||stack` whose class is declared in
 * a package the SDK does not depend on. Left to escape, the parent agent is handed that string and
 * a stack trace from a machine it cannot reach; what it does with one is retry a call that can
 * never succeed. {@link refusalPhrase} turns the marker into the sentence, and the result carries
 * `isError` so the model still reads it as a refusal rather than as an answer.
 *
 * The MCP boundary phrases whatever escapes any other tool the same way; this wrapper is what puts
 * the answer inside the tool, where the reason it was refused is still known.
 *
 * It also writes the LOG line that boundary would have written, and for the same reason: answering
 * inside the tool is exactly what takes these five out of `registerCatalogue`'s catch, so without
 * it a refused conversion is the one thing an operator can find nothing about in the connector log
 * while every other tool is still recorded there. The marker is what is kept — that is what a
 * person greps for — and the stack belongs to a machine they cannot reach.
 */
const answering = async (
  deps: ToolDeps, name: string, run: () => Promise<ToolResult>
): Promise<ToolResult> => {
  try {
    return await run()
  } catch (e) {
    deps.log(`${name} refused: ${refusalMessage(e)}`)

    return fail(refusalPhrase(e))
  }
}

/** The project a tool acts on: the one named, or the one the connector is attached to. */
/** The roles the platform maps onto each power class, so a caller sees what it is sizing. */
const rolesByTier = (): Record<string, string[]> => {
  const byTier: Record<string, string[]> = {}
  for (const [role, tier] of Object.entries(MODEL_TIER_ROLES)) {
    byTier[tier] = [...(byTier[tier] ?? []), role]
  }

  return byTier
}

const roleSummary = (): string => 'The platform asks for three power classes:\n'
  + Object.entries(rolesByTier())
    .map(([tier, roles]) => `  ${tier} → ${roles.length} roles`)
    .join('\n')

/**
 * How much of a drafted field one status answer carries.
 *
 * Generous, because reading the specification IS the confirm step — but bounded, since a tool
 * answer shares one output budget with everything else the host is holding.
 */
const DRAFT_CAP = 8_000

const projectOf = (args: Record<string, unknown>, deps: { attached: () => string | null }): string => {
  const named = typeof args.projectId === 'string' ? args.projectId : null
  const project = named ?? deps.attached()
  if (project == null) {
    throw new Error('No project. Call create_project, or attach_project first.')
  }

  return project
}

const projectResult = (status: ConnectProjectStatus) => ok(
  renderProjectStatus(status), { project: status as unknown as Record<string, unknown> }
)
const storyResult = (status: ConnectStoryStatus) => ok(
  renderStoryStatus(status), { story: status as unknown as Record<string, unknown> }
)
const pipelineResult = (status: ConnectPipelineState) => ok(
  renderPipelineStatus(status), { pipeline: status as unknown as Record<string, unknown> }
)
const conversionResult = (status: ConversionStatusView) => ok(
  renderConversion(status), { conversion: status as unknown as Record<string, unknown> }
)

/**
 * Attach a connector, where this host can hold one.
 *
 * Called by everything that starts platform work, because from that moment the platform may begin
 * sending file writes and model tasks and nothing must arrive before somebody is listening. A host
 * that answers one request and forgets is not that somebody: opening a session there would claim
 * the project's single connector slot from the stdio connector that can actually serve it, so it
 * opens none and the platform performs the run itself.
 */
const ensureSession = async (deps: ToolDeps, projectId: string): Promise<void> => {
  if (!sessionCapable(deps.host)) return

  // The session is filed against the project it will answer for, so a tool naming a project other
  // than the attached one moves the connector BEFORE opening. Opening first would file the session
  // against the previous project, and the platform would deliver this project's operations to
  // nobody.
  deps.attach(projectId)
  await deps.session()
}

/**
 * A story deletion starts its slot cleanup through the agent queue. The manager mutation returns
 * once that work has been accepted, while the cleanup still owns the project lock; returning the
 * MCP tool at that boundary lets the parent's very next project operation lose a race it cannot
 * observe. Wait for two stable unlocked observations so a just-dispatched cleanup also has time
 * to acquire the lock before this tool declares the mutation settled.
 *
 * The delete's COMMIT is no substitute: it says the card is gone, and nothing about the
 * placeholder screens the slot is still retiring under the project lock.
 */
const waitForStoryCleanup = async (deps: ToolDeps, projectId: string): Promise<void> => {
  const deadline = Date.now() + 5 * 60_000
  let unlockedAt: number | null = null

  while (Date.now() < deadline) {
    const status = await deps.api.project.status(projectId)
    if (status.agent.locked) {
      unlockedAt = null
    } else if (unlockedAt == null) {
      unlockedAt = Date.now()
    } else if (Date.now() - unlockedAt >= 500) {
      return
    }

    await new Promise(resolve => setTimeout(resolve, 150))
  }

  throw new Error('Story deleted, but its scaffold cleanup did not release the project lock.')
}

/** The project a tool acts on when it can also work without one. */
const projectOrNull = (args: Record<string, unknown>, deps: ToolDeps): string | null =>
  typeof args.projectId === 'string' ? args.projectId : deps.attached()

/**
 * The question a parked domain operation is waiting on, when this session holds none.
 *
 * A question is delivered as an operation and answered against it, and that is the fast path. But
 * an operation expires: a run that asked while nobody was attached, or while this connector was
 * being restarted, is left `Waiting` with a question no queue here has ever seen. Without this the
 * only way back to it is the web application, and a parent watching only the run would wait out the
 * whole interaction on a question it could have carried in seconds.
 *
 * Best-effort on both reads. A project with no conversion answers an error, and failing the call
 * that asked for a question because the lookup for it failed would be worse than answering "none".
 */
const parkedQuestion = async (deps: ToolDeps, projectId: string): Promise<InquiryPayload | null> => {
  try {
    const status = await deps.api.project.status(projectId)
    if (status.pendingInquiry != null) return status.pendingInquiry
  } catch (e) {
    deps.log(`no project question for ${projectId}: ${(e as Error).message}`)
  }
  try {
    const status = await deps.api.convert.status(projectId)
    if (status.pendingInquiry != null) return status.pendingInquiry
  } catch (e) {
    deps.log(`no conversion question for ${projectId}: ${(e as Error).message}`)
  }

  return null
}

const questionResult = (inquiry: InquiryPayload, deps: ToolDeps, note?: string) => ok(
  (note != null ? `${note}\n\n` : '') + renderQuestionEnvelope(inquiry, { harness: deps.host.harness }),
  { questionId: inquiry.id }
)

/** A cost estimate, always with the sentence that says what it is not. */
const renderEstimate = (estimate: {
  usd: number, delegated: boolean, stage: string
}): string[] => [
  estimate.delegated
    ? `estimated cost of ${estimate.stage}: nothing — you perform this conversion's model calls`
    : `estimated cost of ${estimate.stage}: $${estimate.usd.toFixed(2)}`,
  '  An estimate, not a price: it is computed from the size of the code before any of it is read.',
]

/**
 * Whether this project has a conversion already, and one that has actually begun.
 *
 * A check answers a question a project already converting has moved past. Sending its parent to
 * `convert_project` there points at the one tool that cannot help — the platform refuses a second
 * Start over a live run — while the conversion sits at the decision or the question it is actually
 * waiting on, which is what nobody notices.
 *
 * `Pending` and `Cancelled` are read as none: the record exists, nothing is under way, and
 * starting one really is the next step.
 */
const conversionUnderWay = async (
  deps: ToolDeps, projectId: string
): Promise<ConversionStatusView | null> => {
  try {
    const view = await deps.api.convert.status(projectId)

    return view.status === ConversionStatus.Pending || view.status === ConversionStatus.Cancelled
      ? null
      : view
  } catch (e) {
    // Best-effort, like every other second read here: a project with no conversion answers an
    // error, and failing the check because the lookup for one failed is worse than answering
    // without it.
    deps.log(`no conversion for ${projectId}: ${(e as Error).message}`)

    return null
  }
}

/**
 * How a check names the conversion the project already has.
 *
 * Derived from the STATUS, never from the mere presence of a record. {@link conversionUnderWay}
 * filters `Pending` and `Cancelled` and nothing else, so a check over a finished or failed
 * conversion read "already under way — stage implementation · done" one line above "next: nothing
 * — this conversion is finished": one answer contradicting itself about whether anything is
 * running, which leaves a parent polling a run that ended.
 */
const conversionLead = (view: ConversionStatusView): string => {
  const where = `stage ${view.stage} · ${view.status}`
  switch (view.status) {
    case ConversionStatus.Done:
      return `conversion: finished — ${where}`
    case ConversionStatus.Failed:
      return `conversion: stopped at ${where}`
    default:
      return `conversion: already under way — ${where}`
  }
}

const renderCheck = (check: ConvertCheck, conversion: ConversionStatusView | null): string => {
  const lines = [
    `verdict: ${check.verdict}`
    + (check.reasons.length > 0 ? ` — ${check.reasons.join(', ')}` : ''),
    `shape: ${check.shape}${check.architecture != null ? ` · ${check.architecture}` : ''}`
    + `${check.monorepo ? ' · monorepo' : ''}`,
    ...(check.stack != null
      ? [`stack: ${check.stack.label} (${check.stack.language}`
        + `${check.stack.framework != null ? `, ${check.stack.framework}` : ''})`]
      : ['stack: not recognised']),
    `${check.files} files · ${Math.round(check.bytes / 1024)} KB`
    + (check.bulk > 0 ? ` · ${check.bulk} bulk data file(s), sampled rather than read` : ''),
  ]
  if (check.unlinked.length > 0) {
    // Named rather than counted: each one is a decision somebody has to make, and the conversion
    // will ask about it rather than guess.
    lines.push(`nothing declares: ${check.unlinked.join(', ')}`)
  }
  if (check.estimate != null) lines.push(...renderEstimate(check.estimate))
  if (conversion != null) {
    lines.push(`${conversionLead(conversion)} (conversion_status carries the whole picture)`)
  }
  lines.push(`next: ${
    check.verdict === ConvertibilityVerdict.Refused
      // The verdict outranks a run, and deliberately: an origin nothing can convert has no next
      // step whatever a record says about the attempt that found that out.
      ? 'nothing — this origin cannot be converted'
      : conversion != null
        ? conversionNext(conversion)
        : 'convert_project to start, then read conversion_status'
  }`)

  return lines.join('\n')
}

const renderConversion = (view: ConversionStatusView): string => {
  const lines = [
    `conversion of ${view.projectId} · stage ${view.stage} · ${view.status}`,
    ...(view.verdict != null ? [`verdict: ${view.verdict}`] : []),
    ...(view.stack != null
      ? [`origin stack: ${view.stack.label}`
        + `${view.architecture != null ? ` · ${view.architecture}` : ''}`]
      : []),
    ...(view.targetStack != null ? [`rebuilt onto: ${view.targetStack.label}`] : []),
    `origin sources: ${view.originState}`,
    ...(view.assumptions > 0
      ? [`${view.assumptions} question(s) answered by the platform itself —`
        + ' they are listed in docs/conversion/assumptions.md']
      : []),
    ...(view.runId != null ? [`run ${view.runId}`] : []),
  ]

  const estimate = view.estimates[view.estimates.length - 1]
  if (estimate != null) lines.push(...renderEstimate(estimate))
  if (view.storyEstimate != null) {
    lines.push(
      `implementing the stories: $${view.storyEstimate.minUsd}–$${view.storyEstimate.maxUsd}`,
      `  A band, not a price: a story costs what it turns out to need, usually`
      + ` $${STORY_BAND_MIN_USD}–$${STORY_BAND_MAX_USD} each.`
    )
  }
  // Phrased, exactly like a thrown one: the platform writes a failed stage's cause here with
  // `describeFailure`, which for a refusal is the marker verbatim. Phrase the stored value the
  // same way as a thrown refusal so every conversion status has one user-facing reading.
  if (view.lastError != null && view.lastError !== '') {
    lines.push(`error: ${refusalPhrase(view.lastError)}`)
  }

  lines.push(`next: ${conversionNext(view)}`)

  return lines.join('\n')
}

/**
 * Everything a parent agent can ask the platform to do.
 *
 * Two rules shape the whole list. Every tool answers inside the strictest host's per-tool ceiling,
 * so anything that takes minutes returns its current domain status and continues server-side. And
 * every tool that cannot work in
 * a given mode is HIDDEN rather than failing, so the catalogue a parent reads is exactly the set
 * of things that work for it.
 */
export const catalogue: ToolDefinition[] = [
  {
    name: 'describe_platform',
    title: 'What this platform can build, and what you can drive from here',
    description:
      'Everything the platform runs — building an application from a description, implementing'
      + ' user stories, converting an application you already have — and which of it this session'
      + ' can start. Read it before deciding how to approach a request. Needs no project and'
      + ' makes no network call.',
    input: {},
    availability: anyHost,
    run: async (_args, deps) => ok(renderPlatform(PLATFORM_CATALOGUE, deps.host)),
  },

  {
    name: 'describe_capabilities',
    title: 'Report what your models can do',
    description:
      'Tell the platform which of your models it may use, so it can size each call. Call this once,'
      + ' before creating or developing anything. Returns the mapping it will use.',
    input: {
      strong: z.string().optional().describe('Your most capable model, e.g. the one you plan with'),
      standard: z.string().optional().describe('Your everyday model'),
      cheap: z.string().optional().describe('Your fastest/cheapest model'),
      subagents: z.boolean().optional().describe('Can you run a task in an isolated subagent?'),
      effortControl: z.boolean().optional().describe('Can you ask for low reasoning effort?'),
    },
    availability: anyHost,
    run: async (args, deps) => {
      const tiers: Record<string, string> = {}
      for (const tier of ['strong', 'standard', 'cheap']) {
        const model = args[tier]
        if (typeof model === 'string' && model !== '') tiers[tier] = model
      }
      const subagents = typeof args.subagents === 'boolean' ? args.subagents : null
      const effortControl = typeof args.effortControl === 'boolean' ? args.effortControl : null
      deps.log(`capabilities: ${JSON.stringify({ tiers, subagents, effortControl })}`)

      // Answered honestly rather than with "Recorded." for anything. The arguments are all
      // optional and the shape is flat, so a caller that nests them under a `tiers` key — a
      // reasonable guess, and one a real agent made — supplies nothing at all and would otherwise
      // be told its call succeeded while the platform recorded no model of theirs whatsoever.
      if (Object.keys(tiers).length < 1) {
        return ok(
          'No model was recorded: this tool takes `strong`, `standard` and `cheap` as TOP-LEVEL'
          + ' string arguments, not nested under another key. The platform will size every call'
          + ' with its own defaults until you send them.\n\n'
          + roleSummary(),
          { tiers, roles: rolesByTier() }
        )
      }
      const byTier = rolesByTier()

      return ok(
        'Recorded. The platform asks for three power classes:\n'
        + Object.entries(byTier)
          .map(([tier, roles]) => `  ${tier} → ${tiers[tier] ?? '(your default)'} · ${roles.length} roles`)
          .join('\n')
        + `\n\nsubagents: ${subagents == null ? 'not stated' : subagents ? 'yes' : 'no'}`
        + ` · low reasoning effort: ${effortControl == null ? 'not stated' : effortControl ? 'yes' : 'no'}`
        // Said differently in the two cases, because the answer to "which calls are mine" differs:
        // a delegated session performs all of them, an ordinary one performs a conversion's. Both
        // collect them the same way, so both are told to call next_task.
        + (performsModelTasks(deps.host)
          ? '\n\nThis session runs the platform\'s model calls on YOUR side. Whenever a domain status'
            + ' reports waiting for a model task, call next_task.'
          : sessionCapable(deps.host)
            ? '\n\nThe platform performs its own model calls for stories and free flight. A'
              + ' CONVERSION\'s calls are yours by default. Whenever a domain status reports'
              + ' waiting for a model task, call next_task.'
            : ''),
        { tiers, subagents, effortControl, roles: byTier }
      )
    },
  },

  {
    name: 'describe_harness',
    title: 'What the harness files would say',
    description:
      'Preview the files install_harness would write for a coding agent, so you can read them'
      + ' before anything is changed on disk.',
    input: { harness: z.string().optional().describe('claude-code | codex | copilot | opencode') },
    availability: anyHost,
    run: async (args, deps) => {
      const harness = (args.harness as ConnectHarness) ?? deps.host.harness
      const files = describeHarness(harness)

      return ok(
        `${harness} — ${files.length} files:\n`
        + files.map(file => `\n--- ${file.path} ---\n${file.content}`).join('\n'),
        { harness, files: files.map(file => file.path) as unknown as Record<string, unknown> }
      )
    },
  },

  {
    name: 'install_harness',
    title: 'Set this agent up to work with the platform',
    description:
      'Write the instruction and subagent files this coding agent needs, into the project directory.'
      + ' Idempotent, and it never writes your token — only a reference to the environment variable.',
    input: {
      dir: z.string().optional().describe('Where to write. Defaults to the project directory.'),
      harness: z.string().optional(),
      mcpConfig: z.boolean().optional().describe('Also write the MCP server entry'),
    },
    availability: withExecutor,
    run: async (args, deps) => {
      const dir = (args.dir as string) ?? deps.dir
      if (dir == null) return fail('No directory to write to.')
      const harness = (args.harness as ConnectHarness) ?? deps.host.harness
      const result = await installHarness(dir, harness, {
        mcpConfig: args.mcpConfig === true,
      })

      return ok(
        `Wrote ${result.written.length} file(s) for ${harness}:\n`
        + result.written.map(path => `  ${path}`).join('\n')
        + (result.skipped.length > 0 ? `\nUnchanged: ${result.skipped.join(', ')}` : ''),
        result as unknown as Record<string, unknown>
      )
    },
  },

  {
    name: 'session_status',
    title: 'What this connector is doing',
    description: 'The mode, the attached project, and what the connector has handled so far.',
    input: {},
    availability: anyHost,
    run: async (_args, deps) => {
      const session = deps.currentSession()
      const lines = [
        `target: ${deps.host.target} · llm: ${deps.host.llm} · harness: ${deps.host.harness}`,
        `project: ${deps.attached() ?? '(none attached)'}`,
        ...(deps.dir != null ? [`directory: ${deps.dir}`] : []),
      ]
      if (session == null) {
        lines.push(sessionCapable(deps.host)
          ? 'session: not opened yet — it opens with the first operation'
          : 'session: none — this host holds none, and the platform performs the work itself')
      } else {
        const stats = session.stats
        lines.push(
          `session ${session.session.id} · ${stats.transport}`,
          `operations: ${stats.opsDone} done, ${stats.opsFailed} failed`,
          `model tasks: ${stats.tasksDelivered} delivered, ${stats.tasksSubmitted} answered,`
          + ` ${session.pendingTasks()} waiting`,
          `questions: ${stats.questionsDelivered} asked, ${stats.questionsAnswered} answered,`
          + ` ${session.pendingQuestions()} waiting`,
        )
      }

      return ok(lines.join('\n'))
    },
  },

  {
    name: 'create_project',
    title: 'Start a project from a description',
    description:
      'Describe the application in a sentence or two. The platform writes a specification, names it'
      + ' and drafts a vision. Returns the project status; read the draft and call confirm_project.',
    input: { prompt: z.string().min(1) },
    availability: anyHost,
    run: async (args, deps) => {
      const status = await deps.api.project.create(
        args.prompt as string,
        deps.host.target === ConnectTarget.Local ? ConnectTarget.Local : ConnectTarget.Cloud
      )
      deps.attach(status.project.id)

      return projectResult(status)
    },
  },

  {
    name: 'confirm_project',
    title: 'Accept the specification and build the application',
    description:
      'Confirm the drafted project, optionally editing what the analysis produced. This is what'
      + ' starts the build: the template lands, dependencies install, the whole application is'
      + ' drawn. Returns the project status while the server-side run continues.',
    input: {
      projectId: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      specification: z.string().optional(),
      vision: z.string().optional(),
      designSystem: z.string().optional(),
    },
    availability: anyHost,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      // Attached BEFORE the call that starts the build, not after it. The platform begins
      // sending file writes as soon as this returns, and an operation dispatched at a project
      // whose connector has not filed a session yet is not queued for later — a local target
      // answers it with `ConnectSessionGone` and the step fails.
      await ensureSession(deps, project)
      const status = await deps.api.project.confirm(project, {
        ...(typeof args.name === 'string' ? { name: args.name } : {}),
        ...(typeof args.description === 'string' ? { description: args.description } : {}),
        ...(typeof args.specification === 'string' ? { specification: args.specification } : {}),
        ...(typeof args.vision === 'string' ? { vision: args.vision } : {}),
        ...(typeof args.designSystem === 'string' ? { designSystem: args.designSystem } : {}),
      })
      return projectResult(status)
    },
  },

  {
    name: 'project_status',
    title: 'Where the project stands',
    description: 'The project, its slot, whether the agent is busy, and the last run.',
    input: { projectId: z.string().optional() },
    availability: anyHost,
    run: async (args, deps) => {
      const status = await deps.api.project.status(projectOf(args, deps))
      const lines = [
        `${status.project.name} (${status.project.alias}) · ${status.project.id}`,
        // The project card's own status, from the project flow. Absent only from a platform that
        // predates it, which says nothing rather than something false.
        ...(status.project.status != null
          ? [`project: ${status.project.status}`
            + `${status.project.intrinsic != null ? ` (${status.project.intrinsic})` : ''}`]
          : []),
        status.slot != null
          ? `slot: ${status.slot.kind} · ${status.slot.status}`
            + `${status.slot.initialized === true ? ' · initialized' : ' · not initialized'}`
            + `${status.slot.host != null ? ` · ${status.slot.host}` : ''}`
          : 'slot: none',
        `agent: ${status.agent.locked ? `busy (${status.agent.task ?? 'working'})` : 'idle'}`,
      ]
      if (status.run != null) {
        lines.push(`run ${status.run.runId} · ${status.run.status}`
          + `${status.run.step != null ? ` · at ${status.run.step}` : ''}`)
      }

      // The drafted text, because `confirm_project` accepts edits to exactly these fields and
      // there is nowhere else to read them: before initialization they exist only on the record,
      // and `docs/project.md` is not written until the run that confirm starts.
      for (const [label, value] of [
        ['description', status.project.description],
        ['specification', status.project.specification],
        ['vision', status.project.vision],
        ['design system', status.project.designSystem],
      ] as const) {
        if (value != null && value.trim() !== '') {
          lines.push('', `--- ${label} ---`, value.slice(0, DRAFT_CAP))
        }
      }
      // `slot.lastError` is the channel the platform stores a content refusal, a reserved name or
      // a legacy-layout verdict on, with no class left on it — so it is phrased here for the same
      // reason the manager phrases it, and `backendWarning` carries an integrity verdict the same
      // way. All three go through one helper because only the TEXT says which it is: anything that
      // does not read as a marker — the build diagnostics somebody asked for, stack-shaped lines
      // included — comes back exactly as it stands.
      for (const warning of [status.slot?.lastError, status.slot?.buildWarning, status.slot?.backendWarning]) {
        if (warning != null && warning !== '') lines.push(`warning: ${refusalPhrase(warning)}`)
      }

      return ok(lines.join('\n'), status as unknown as Record<string, unknown>)
    },
  },

  {
    name: 'list_projects',
    title: 'The projects on this account',
    description:
      'Every project this access token can reach, newest first, with the id, slug and status'
      + ' each of the other project tools takes.',
    input: {},
    availability: anyHost,
    run: async (_args, deps) => {
      const projects = await deps.api.project.list()

      return ok(
        projects.length < 1
          ? 'No projects yet. create_project starts one.'
          : projects.map(project => `${project.id} · ${project.name} (${project.alias})`).join('\n'),
        { projects: projects as unknown as Record<string, unknown> }
      )
    },
  },

  {
    name: 'attach_project',
    title: 'Work on an existing project',
    description:
      'Point this connector at a project that already exists — by id, by its slug, or (for a local'
      + ' project) by reading the marker in its directory.',
    input: {
      projectId: z.string().optional(),
      slug: z.string().optional(),
    },
    availability: anyHost,
    run: async (args, deps) => {
      const status = await deps.api.project.attach({
        ...(typeof args.projectId === 'string' ? { projectId: args.projectId } : {}),
        ...(typeof args.slug === 'string' ? { slug: args.slug } : {}),
      })
      deps.attach(status.project.id)

      return ok(`Attached to ${status.project.name} (${status.project.id}).`,
        status as unknown as Record<string, unknown>)
    },
  },

  {
    name: 'reinitialize_project',
    title: 'Rebuild the application from the template',
    description:
      'Wipe the generated sources and lay the template down again. The user stories are KEPT and'
      + ' reset to planned; your own configuration and git history survive.',
    input: { projectId: z.string().optional() },
    availability: anyHost,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      return projectResult(await deps.api.project.reinit(project))
    },
  },

  {
    name: 'list_stories',
    title: 'The user stories of a project',
    description: 'One page of the project\'s stories, with their status.',
    input: {
      projectId: z.string().optional(),
      page: z.number().int().min(0).optional(),
      size: z.number().int().min(1).max(100).optional(),
      status: z.string().optional(),
      area: z.string().optional(),
    },
    availability: anyHost,
    run: async (args, deps) => {
      const page = typeof args.page === 'number' ? args.page : 0
      const list = await deps.api.planning.cards.list({
        ...storyQuery(projectOf(args, deps), {
          ...(typeof args.status === 'string' ? { status: args.status } : {}),
          ...(typeof args.area === 'string' ? { area: args.area } : {}),
        }),
        page,
        size: typeof args.size === 'number' ? args.size : STORY_PAGE_SIZE,
        sort: STORY_ORDER,
      })

      return ok(renderStories(list.items, list.page ?? page, list.total), list)
    },
  },

  {
    name: 'search_stories',
    title: 'Find a story',
    description:
      'The user stories of a project whose code, title or text match a search term. Use it instead'
      + ' of paging through list_stories when you know what you are looking for.',
    input: { q: z.string().min(1), projectId: z.string().optional() },
    availability: anyHost,
    run: async (args, deps) => {
      const list = await deps.api.planning.cards.list({
        ...storyQuery(projectOf(args, deps), { q: args.q as string }),
        page: 0,
        size: STORY_PAGE_SIZE,
        sort: STORY_ORDER,
      })

      return ok(renderStories(list.items, list.page ?? 0, list.total), list)
    },
  },

  {
    name: 'create_story',
    title: 'Add a user story',
    description:
      'Add a story in your own words. The platform rewrites it in the form its pipeline needs and'
      + ' decides which area of the application it belongs to.',
    input: { story: z.string().min(1), projectId: z.string().optional() },
    availability: anyHost,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      // Formatting reads the target's file-backed entities before it persists the story. A local
      // project therefore needs its connector back after an MCP restart even though this tool does
      // not itself start a long-running operation.
      await ensureSession(deps, project)
      // The narrative goes as written and with no area: rewriting it and deciding the area is the
      // platform's, done on the way in for a person's story — a connector that guessed an area
      // would be a second answer the platform then has to overrule.
      const receipt = await deps.api.planning.execute({
        action: TransitionAction.Create,
        card: {
          kind: WorkcardKind.Card,
          type: VIABLE_STORY_TYPE,
          parent: project,
          title: args.story as string,
          fields: { primary: false },
        },
        cause: 'connector:create-story',
      }, { wait: true, timeout: COMMIT_WAIT_MS })
      const card = receipt.card

      return ok(
        card?.code != null ? `Story ${card.code} created.` : 'Story created.',
        card ?? receipt.transition
      )
    },
  },

  {
    name: 'update_story',
    title: 'Reword a user story',
    description: 'Change what a story says. Its status is not changed — develop_story does that.',
    input: { storyId: z.string(), story: z.string().min(1), projectId: z.string().optional() },
    availability: anyHost,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      const card = await resolveStory(deps, project, args.storyId as string)
      // Only the narrative: the status moves through the story flow and nowhere else, and the area
      // follows the narrative on the platform's side. Guarded by the head the story was read at, so
      // a change somebody else made in between is refused rather than overwritten.
      const receipt = await deps.api.planning.execute({
        card: card.id!,
        action: TransitionAction.Update,
        changes: { title: args.story as string },
        expectSeq: card.head ?? card.seq,
        cause: 'connector:update-story',
      }, { wait: true, timeout: COMMIT_WAIT_MS })

      return ok('Story updated.', receipt.card ?? card)
    },
  },

  {
    name: 'delete_story',
    title: 'Remove a user story',
    description: 'Delete a story that has not been implemented. Its placeholder screens are retired.',
    input: { storyId: z.string(), projectId: z.string().optional() },
    availability: anyHost,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      // Removing a story also retires its file-backed scaffold, so it has the same local-session
      // requirement as formatting and development.
      await ensureSession(deps, project)
      const card = await resolveStory(deps, project, args.storyId as string)
      await deps.api.planning.execute({
        card: card.id!,
        action: TransitionAction.Delete,
        cause: 'connector:delete-story',
      }, { wait: true, timeout: COMMIT_WAIT_MS })
      await waitForStoryCleanup(deps, project)

      return ok('Story deleted.')
    },
  },

  {
    name: 'develop_story',
    title: 'Implement a user story',
    description:
      'Ask the platform to design and build one story: its screens, its data, its endpoints, its'
      + ' navigation. This is the main event and takes many minutes. Returns the story status.',
    input: { storyId: z.string(), projectId: z.string().optional() },
    availability: anyHost,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      const card = await resolveStory(deps, project, args.storyId as string)
      // Development is not a call of its own: it is the story's `start`, and the platform begins the
      // run once that move has COMMITTED — which is also where it is refused (the wrong status,
      // another story in progress, the balance).
      try {
        await deps.api.planning.execute({
          card: card.id!,
          action: TransitionAction.Transit,
          transition: ViableStoryTransition.Start,
          cause: 'connector:develop-story',
        }, { wait: true, timeout: COMMIT_WAIT_MS })
      } catch (e) {
        if (!(e instanceof CommitTimeout)) throw e
        // The move is durable and only its commit is late, so the story status is still the answer —
        // waiting out the host's ceiling here would report a slow platform as a broken server.
        deps.log(`develop_story: the start of ${card.code ?? card.id} has not committed yet;`
          + ' answering from story status')
      }

      return storyResult(await deps.api.story.status(project, card.id!))
    },
  },

  {
    name: 'story_status',
    title: 'What happened to a story',
    description: 'One story, its development run, and any warning explaining a failure.',
    input: { storyId: z.string(), projectId: z.string().optional() },
    availability: anyHost,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const card = await resolveStory(deps, project, args.storyId as string)

      return storyResult(await deps.api.story.status(project, card.id!))
    },
  },

  {
    name: 'modify_project',
    title: 'Ask the agent for an open-ended change',
    description:
      'Describe a change in words and let the platform\'s own coding agent make it. For anything'
      + ' that is not a user story: a rename, a fix, a styling change. Returns project status.',
    input: { prompt: z.string().min(1), projectId: z.string().optional() },
    availability: anyHost,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      return projectResult(await deps.api.project.modify(project, args.prompt as string))
    },
  },

  {
    name: 'pipeline_status',
    title: 'Where a run stopped',
    description: 'The steps a run completed and the one it stopped at.',
    input: { runId: z.string(), projectId: z.string().optional() },
    availability: anyHost,
    run: async (args, deps) => {
      const state = await deps.api.pipeline.state(projectOf(args, deps), args.runId as string)

      return pipelineResult(state)
    },
  },

  {
    name: 'resume_pipeline',
    title: 'Continue a run that stopped',
    description:
      'Pick a crashed or interrupted run up where it stopped, rather than starting over. Use it'
      + ' after fixing whatever it failed on — a missing database, a connector that dropped.',
    input: {
      runId: z.string(),
      projectId: z.string().optional(),
      from: z.string().optional().describe('Re-enter this step, and everything after it'),
    },
    availability: anyHost,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      const status = await deps.api.pipeline.resume(project, args.runId as string, {
        ...(typeof args.from === 'string' ? { from: args.from } : {}),
      })
      return pipelineResult(status)
    },
  },

  {
    name: 'next_task',
    title: 'Get the next model call to perform',
    description:
      'The platform hands you model calls to perform: a conversion\'s by default, and everything'
      + ' else when this session runs in the delegated mode. Returns one task with instructions for'
      + ' running it in a clean subagent, or says there is nothing yet. Call it whenever a domain'
      + ' status says it is waiting for a model task, and keep calling until it says none.',
    input: {
      maxWaitSec: z.number().int().min(0).max(45).optional(),
      taskId: z.string().optional()
        .describe('Re-read a task you were already given, if you lost its text.'),
    },
    // Not `performsModelTasks`: a conversion's model calls are the parent's by default whatever
    // the account setting says, so a session billed to the platform must still be able to collect
    // one. What they do need is a host that STAYS — a task is handed out once and answered
      // minutes later.
    availability: sessionCapable,
    run: async (args, deps) => {
      const session = await deps.session()

      // Asking for one by id re-reads it rather than taking a new one. A task is handed out once
      // and the platform waits on it for up to 45 minutes, so a parent that lost the envelope —
      // a compacted conversation, a subagent that died before answering — otherwise has no way
      // back to it and the run waits until the deadline for no reason.
      if (typeof args.taskId === 'string') {
        const known = session.taskById(args.taskId)
        if (known == null) {
          return fail(`No task ${args.taskId} is outstanding. Call next_task with no id.`)
        }

        return ok(renderTaskEnvelope(known, { harness: deps.host.harness }), { taskId: known.id })
      }

      const wait = Math.min(((args.maxWaitSec as number) ?? 30) * 1000, NEXT_TASK_WAIT_MS)
      const task = await session.nextTask(wait)
      if (task == null) {
        const outstanding = session.outstandingTasks()
        if (outstanding.length > 0) {
          // Named rather than re-handed: a parent whose subagent is still working would otherwise
          // be given the same task again and run it twice.
          return ok(
            `No new task. ${outstanding.length} already handed to you and still unanswered:`
            + ` ${outstanding.map(one => one.id).join(', ')}. Submit the answer with`
            + ' submit_task_result, or call next_task with that taskId to read it again.'
          )
        }

        return ok(
          'No task right now. Read the matching project, story, conversion, or pipeline status;'
          + ' call next_task again only while it reports waiting for a model task.'
        )
      }

      return ok(renderTaskEnvelope(task, { harness: deps.host.harness }), { taskId: task.id })
    },
  },

  {
    name: 'submit_task_result',
    title: 'Hand back what the subagent produced',
    description:
      'Send the subagent\'s answer, verbatim. If the answer is not the shape the task asked for,'
      + ' this says so and the task stays open for you to retry.',
    input: {
      taskId: z.string(),
      result: z.union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())]),
    },
    availability: sessionCapable,
    run: async (args, deps) => {
      const session = await deps.session()
      const pending = session as unknown as { taskById?: (id: string) => unknown }
      const task = pending.taskById?.(args.taskId as string) as never
      if (task == null) {
        return fail(`No task ${String(args.taskId)} is waiting. Call next_task for the current one.`)
      }

      const { result, problem } = parseTaskResult(task, args.result)
      if (problem != null) {
        // Refused HERE, with the subagent's context still open — a malformed answer that reached
        // the platform would cost a whole new task, a new subagent and another wait.
        return fail(problem)
      }
      await session.submitTask(result!)
      const next = session.pendingTasks()

      return ok(
        next > 0
          ? `Accepted. ${next} more task(s) waiting — call next_task.`
          : 'Accepted. Read the matching project, story, conversion, or pipeline status.'
      )
    },
  },

  {
    name: 'next_question',
    title: 'Get the question the platform is asking',
    description:
      'The platform sometimes needs a decision only the person you are working for can make.'
      + ' Returns one question to put to them, or says there is none. Domain status responses also'
      + ' include parked questions directly.',
    input: {
      maxWaitSec: z.number().int().min(0).max(45).optional(),
      questionId: z.string().optional().describe('Re-read a question you were already given.'),
      projectId: z.string().optional(),
    },
    // Not `performsModelTasks`: a question has nothing to do with who performs the model calls,
    // and a session billed to the platform must still be askable. What it does need is a host
    // that STAYS — a question is delivered to a connector and answered minutes later.
    availability: sessionCapable,
    run: async (args, deps) => {
      const session = await deps.session()
      const project = projectOrNull(args, deps)

      // Asking for one by id re-reads it rather than taking a new one — the same reason
      // `next_task` does: a parent that lost the envelope has no other way back to it.
      if (typeof args.questionId === 'string') {
        const known = session.questionById(args.questionId)
          ?? (project != null ? await parkedQuestion(deps, project) : null)
        if (known == null || known.id !== args.questionId) {
          return fail(`No question ${args.questionId} is waiting. Call next_question with no id.`)
        }

        return questionResult(known, deps)
      }

      const wait = Math.min(((args.maxWaitSec as number) ?? 30) * 1000, NEXT_QUESTION_WAIT_MS)
      const question = await session.nextQuestion(wait)
      if (question != null) return questionResult(question, deps)

      const outstanding = session.outstandingQuestions()
      if (outstanding.length > 0) {
        return ok(
          `No new question. ${outstanding.length} already put to you and still unanswered:`
          + ` ${outstanding.map(one => one.id).join(', ')}. Send the person's answer with`
          + ' answer_question, or call next_question with that questionId to read it again.'
        )
      }

      // Nothing queued here, which does not mean nothing is being asked: a run that parked while
      // this connector was away is waiting on a question whose operation has long expired.
      const parked = project != null ? await parkedQuestion(deps, project) : null
      if (parked != null) {
        return questionResult(
          parked, deps,
          'This run parked on a question before this session attached. It is still open:'
        )
      }

      return ok(
        'No question right now. Read the matching domain status and answer any pendingInquiry it'
        + ' returns; call next_question again only while it reports waiting for a person.'
      )
    },
  },

  {
    name: 'answer_question',
    title: 'Send back what they decided',
    description:
      'Send the person\'s answer to a question the platform asked. If it is not one the question'
      + ' allows, this says so and the question stays open. Answer with declined: true when'
      + ' nobody is available to decide — the platform then assumes and records an assumption.',
    input: {
      questionId: z.string(),
      answer: z.union([z.string(), z.array(z.string())]).optional(),
      text: z.string().optional().describe('What they said, where the question takes words.'),
      declined: z.boolean().optional().describe('Nobody could decide this.'),
      projectId: z.string().optional(),
    },
    availability: sessionCapable,
    run: async (args, deps) => {
      const session = await deps.session()
      const questionId = args.questionId as string
      const project = projectOrNull(args, deps)

      // The question this session is holding, if it still is. That is what decides HOW the answer
      // travels: an operation the platform is waiting on, or the question's own id.
      const held = session.questionById(questionId)
      const inquiry = held ?? (project != null ? await parkedQuestion(deps, project) : null)
      if (inquiry == null || inquiry.id !== questionId) {
        return fail(
          `No question ${questionId} is waiting. Call next_question for the current one.`
        )
      }

      const { answer, problem } = parseAnswer(inquiry, args)
      if (problem != null) {
        // Refused HERE, with the person still in front of the parent — a mismatch the platform
        // catches costs a round trip on a question a human has already answered.
        return fail(problem)
      }

      if (held != null) {
        await session.answerQuestion(answer!)
      } else {
        if (project == null) {
          return fail('No project. Call attach_project first, or name one with projectId.')
        }
        await deps.api.inquiry.answer(project, questionId, answer!)
      }

      return ok('Recorded. Read the matching project, story, conversion, or pipeline status.')
    },
  },

  {
    name: 'check_convertible',
    title: 'Can this application be converted',
    description:
      'Say whether the platform can convert an existing codebase, what it is built with, what will'
      + ' be limited, and what the next stage will cost. Nothing is provisioned and nothing is'
      + ' charged. It reads what the intake found, so convert_project starts one first; on a'
      + ' conversion already under way it also says where that one stands.',
    input: { projectId: z.string().optional() },
    availability: anyHost,
    run: async (args, deps) => await answering(deps, 'check_convertible', async () => {
      const project = projectOf(args, deps)
      // The platform reads the tree through THIS connector when it lives on this machine, so the
      // session has to exist before the check runs rather than after it.
      await ensureSession(deps, project)
      const check = await deps.api.convert.check(project)

      return ok(
        // Read after the check rather than before it: the check is what this tool is for, and the
        // conversion only decides what to do NEXT with what it said.
        renderCheck(check, await conversionUnderWay(deps, project)),
        check as unknown as Record<string, unknown>
      )
    }),
  },

  {
    name: 'convert_project',
    title: 'Convert an application you already have',
    description:
      'Bring an existing application onto the platform: it reads the code, restores the'
      + ' specification and the user stories nobody wrote down, and rebuilds it on the platform\'s'
      + ' stack. The original is kept beside it. Returns conversion status and stops at your decision after'
      + ' each stage.',
    input: {
      projectId: z.string().optional().describe('Convert into a project that already exists.'),
      name: z.string().optional(),
      about: z.string().optional().describe('What the application is for, in your own words.'),
      repoUrl: z.string().optional()
        .describe('A GitHub repository to convert. Named, it is converted rather than this directory.'),
      branch: z.string().optional(),
    },
    availability: anyHost,
    run: async (args, deps) => await answering(deps, 'convert_project', async () => {
      const named = typeof args.projectId === 'string' ? args.projectId : deps.attached()
      if (named != null) {
        await ensureSession(deps, named)

        return conversionResult(await deps.api.convert.start(named))
      }

      const repoUrl = typeof args.repoUrl === 'string' && args.repoUrl.trim() !== ''
        ? args.repoUrl.trim()
        : null
      if (deps.dir == null && repoUrl == null) {
        return fail(
          'Nothing to convert. Name a project, attach one, run the connector in the directory you'
          + ' want converted, or give a repoUrl.'
        )
      }

      const status = await deps.api.convert.create({
        ...(typeof args.name === 'string' ? { name: args.name } : {}),
        ...(typeof args.about === 'string' ? { about: args.about } : {}),
        // A NAMED repository outranks the directory this connector runs in. A stdio connector
        // always has a directory, so reading that first would convert the caller's own working
        // copy instead of the repository it asked for — with `repoUrl` and `branch` dropped in
        // silence, which is the one outcome nobody could diagnose from the answer.
        ...(repoUrl == null
          // The directory IS the origin: nothing is cloned, and the relocation and the template
          // install run as ordinary operations through this connector.
          ? { target: ConnectTarget.Local, origin: { kind: OriginKind.Local } }
          : {
            target: ConnectTarget.Cloud,
            origin: {
              kind: OriginKind.Github,
              repoUrl,
              ...(typeof args.branch === 'string' ? { branch: args.branch } : {}),
            },
          }),
      })
      deps.attach(status.projectId)
      await ensureSession(deps, status.projectId)

      return conversionResult(await deps.api.convert.start(status.projectId))
    }),
  },

  {
    name: 'proceed_conversion',
    title: 'Decide what a conversion does next',
    description:
      'A conversion stops after each stage and waits for a decision: analyze what was read,'
      + ' extract the user stories, implement them, leave it as it stands, retry a stage that'
      + ' failed, or cancel. Returns the conversion status.',
    input: {
      decision: z.enum(Object.values(ConversionDecision) as [string, ...string[]]),
      projectId: z.string().optional(),
      note: z.string().optional().describe('What the user said about the decision. Recorded.'),
    },
    availability: anyHost,
    run: async (args, deps) => await answering(deps, 'proceed_conversion', async () => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      const status = await deps.api.convert.proceed(
        project,
        args.decision as ConversionDecision,
        typeof args.note === 'string' ? args.note : undefined
      )

      return conversionResult(status)
    }),
  },

  {
    name: 'conversion_status',
    title: 'Where a conversion stands',
    description:
      'The stage a conversion has reached, what it found, what it has cost so far, whether the'
      + ' original sources are still there, and what to call next.',
    input: { projectId: z.string().optional() },
    availability: anyHost,
    run: async (args, deps) => await answering(deps, 'conversion_status', async () => {
      const view = await deps.api.convert.status(projectOf(args, deps))

      return ok(renderConversion(view), view as unknown as Record<string, unknown>)
    }),
  },

  {
    name: 'purge_origin',
    title: 'Delete the converted original',
    description:
      'Delete the original sources a conversion kept beside the converted project, and rewrite'
      + ' the conversion documents so they stop quoting them. This CANNOT be undone — ask the'
      + ' user before calling it.',
    input: {
      projectId: z.string().optional(),
      confirm: z.boolean().describe('Must be true. The user has to have agreed to this.'),
    },
    availability: anyHost,
    run: async (args, deps) => await answering(deps, 'purge_origin', async () => {
      if (args.confirm !== true) {
        return fail(
          'Not done. This deletes the original sources under __viable_converted/ and every'
          + ' reference to them, and cannot be undone. Ask the user, then call it again with'
          + ' confirm: true.'
        )
      }
      const project = projectOf(args, deps)
      await ensureSession(deps, project)

      return conversionResult(await deps.api.convert.purge(project))
    }),
  },

  {
    name: 'list_files',
    title: 'The generated project\'s files',
    description: 'What the platform generated, for a project whose sources live in its own slot.',
    input: { projectId: z.string().optional() },
    availability: cloudTarget,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const files = await deps.api.files.list(project)

      return ok(
        files.length > 0
          ? `${files.length} generated file(s):\n${files.join('\n')}`
          : 'No generated files were found.',
        { projectId: project, total: files.length, files }
      )
    },
  },

  {
    name: 'local_status',
    title: 'Is this machine ready to run the app',
    description:
      'What the generated project still needs before it can start here, and whether it is running.',
    input: {},
    availability: localTarget,
    run: async (_args, deps) => {
      if (deps.dir == null) return fail('No project directory.')
      const [env, running] = await Promise.all([envStatus(deps.dir), localStatus(deps.dir)])
      const lines = [
        `directory: ${deps.dir}`,
        env.missing.length < 1
          ? 'configuration: complete'
          : `configuration: missing ${env.missing.join(', ')} — see local_setup_guide`,
        running.running
          ? `running: api ${running.api ?? '?'} · web ${running.web ?? '?'}`
            + (running.phase != null ? ` · ${running.phase}` : '')
          : 'running: no — run_local starts it',
      ]

      return ok(lines.join('\n'), { env, running } as unknown as Record<string, unknown>)
    },
  },

  {
    name: 'run_local',
    title: 'Build and start the app on this machine',
    description:
      'Build the generated project and start it: the API on 3000, the app on 5173. The build takes'
      + ' a while — this returns once it has started, and local_status says when it is up.',
    input: { build: z.boolean().optional().describe('Build first. Defaults to true.') },
    availability: localTarget,
    run: async (args, deps) => {
      if (deps.dir == null) return fail('No project directory.')
      const env = await envStatus(deps.dir)
      if (env.missing.length > 0) {
        // Refused rather than started: an app launched without a database URL fails at boot with a
        // message about a connection, which sends the reader looking for a database that was never
        // configured in the first place.
        return fail(
          `The project still needs ${env.missing.join(', ')} in its .env. Call local_setup_guide,`
          + ' which reports what is missing and what to ask the user for.'
        )
      }
      const started = await runLocal(deps.dir, { build: args.build !== false })

      return ok(
        `Started. The app is at http://localhost:${started.web}, its API at`
        + ` http://localhost:${started.api}. Call local_status if it does not answer yet.`,
        started as unknown as Record<string, unknown>
      )
    },
  },

  {
    name: 'stop_local',
    title: 'Stop the app on this machine',
    description:
      'Stop the application run_local started here: its API, its worker and the server holding'
      + ' port 5173. Leaves the project files alone.',
    input: {},
    availability: localTarget,
    run: async (_args, deps) => {
      if (deps.dir == null) return fail('No project directory.')
      await stopLocal(deps.dir)

      return ok('Stopped.')
    },
  },

  {
    name: 'local_setup_guide',
    title: 'How to run the generated app on this machine',
    description:
      'What to install and what to put in the project\'s .env so the generated application can'
      + ' start here — a database, optionally a queue store, and the ports it will use.',
    input: {},
    availability: localTarget,
    run: async (_args, deps) => {
      if (deps.dir == null) return fail('No project directory.')
      const report = await readSetupReport(deps.dir)

      return ok(renderSetupGuide(report), report as unknown as Record<string, unknown>)
    },
  },

  {
    name: 'set_local_service',
    title: 'Record the database or queue the user chose',
    description:
      'Write a connection string the USER supplied into the project\'s own half of its .env, then'
      + ' check that something answers there. Call it with what they gave you after asking —'
      + ' never with a value you composed yourself.',
    input: {
      databaseUrl: z.string().optional()
        .describe('postgres://user:password@host:port/database'),
      valkeyUrl: z.string().optional()
        .describe('redis://host:port — only for a project with a background worker'),
      schema: z.string().optional().describe('Postgres schema. Defaults to "app".'),
    },
    availability: localTarget,
    run: async (args, deps) => {
      if (deps.dir == null) return fail('No project directory.')
      const databaseUrl = typeof args.databaseUrl === 'string' ? args.databaseUrl.trim() : ''
      const valkeyUrl = typeof args.valkeyUrl === 'string' ? args.valkeyUrl.trim() : ''
      if (databaseUrl === '' && valkeyUrl === '') {
        return fail('Give at least one of databaseUrl or valkeyUrl — the value the user supplied.')
      }

      const { written, file } = await setUserEnv(deps.dir, {
        ...(databaseUrl !== '' ? { DATABASE_URL: databaseUrl } : {}),
        ...(databaseUrl !== ''
          ? { DATABASE_SCHEMA: typeof args.schema === 'string' && args.schema.trim() !== ''
            ? args.schema.trim()
            : 'app' }
          : {}),
        ...(valkeyUrl !== '' ? { VALKEY_URL: valkeyUrl } : {}),
      })

      // Probed straight away, because a value that does not answer is the whole failure this tool
      // exists to prevent: accepted silently, it surfaces minutes later as a boot error about a
      // connection, and the reader goes looking for a database rather than for a typo.
      const report = await readSetupReport(deps.dir)
      const lines = [`Wrote ${written.join(', ')} into ${file}, outside the managed block.`]
      if (databaseUrl !== '') {
        lines.push(report.database.reachable
          ? 'The database answers.'
          : 'The database does NOT answer yet. Check the host, the port and whether it is running.')
      }
      if (valkeyUrl !== '') {
        lines.push(report.queue.reachable
          ? 'The queue store answers.'
          : 'The queue store does NOT answer yet.')
      }
      if (!report.envIgnored) {
        lines.push('That file is not git-ignored. Tell the user, so a credential does not reach a commit.')
      }
      lines.push(missingServices(report).length < 1
        ? 'Nothing else is missing — run_local can build and start the application.'
        : 'Still missing: ' + missingServices(report).join(', ') + '. Call local_setup_guide again.')

      return ok(lines.join('\n'), report as unknown as Record<string, unknown>)
    },
  },
]

/** The tools a given host actually offers. */
export const visibleTools = (host: ToolHost): ToolDefinition[] =>
  catalogue.filter(tool => tool.availability(host))

export const toolByName = (name: string): ToolDefinition | undefined =>
  catalogue.find(tool => tool.name === name)

export { ToolHostKind }
