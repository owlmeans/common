import { z } from 'zod'
import { ConnectHarness, ConnectTarget, MODEL_TIER_ROLES } from '@owlmeans/viable-common'
import type { ConnectJob, ConnectStoryItem } from '@owlmeans/viable-common'
import { JOB_POLL_MAX_SEC, NEXT_TASK_WAIT_MS } from '../consts.js'
import { describeHarness, installHarness } from '../harness/index.js'
import { envStatus } from '../project/env.js'
import { missingServices, readSetupReport, renderSetupGuide, setUserEnv } from '../project/setup.js'
import { localStatus, runLocal, stopLocal } from '../run/index.js'
import { parseTaskResult, renderTaskEnvelope } from '../task/envelope.js'
import { renderJob } from './jobs.js'
import type { ToolDeps, ToolDefinition, ToolHost } from './types.js'
import {
  anyHost, cloudTarget, localTarget, performsModelTasks, sessionCapable, ToolHostKind, withExecutor
} from './types.js'

const ok = <Structured extends object>(text: string, structured?: Structured) => ({ text, structured })
const fail = (text: string) => ({ text, isError: true })

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

const jobResult = (job: ConnectJob) => ok(renderJob(job), { job: job as unknown as Record<string, unknown> })

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
 * Everything a parent agent can ask the platform to do.
 *
 * Two rules shape the whole list. Every tool answers inside the strictest host's per-tool ceiling,
 * so anything that takes minutes returns a JOB at once and is polled — a coding agent that blocks
 * for twenty minutes is reported to its user as a hung server. And every tool that cannot work in
 * a given mode is HIDDEN rather than failing, so the catalogue a parent reads is exactly the set
 * of things that work for it.
 */
export const catalogue: ToolDefinition[] = [
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
        + (performsModelTasks(deps.host)
          ? '\n\nThis session runs the platform\'s model calls on YOUR side. Whenever a job reports'
            + ' "blocked on: model-task", call next_task.'
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
        )
      }

      return ok(lines.join('\n'))
    },
  },

  {
    name: 'wait_for',
    title: 'Wait for a job',
    description:
      `Poll one job for up to ${JOB_POLL_MAX_SEC} seconds. Returns as soon as it finishes or`
      + ' becomes blocked; call again while it is still running.',
    input: {
      jobId: z.string(),
      projectId: z.string().optional(),
      maxWaitSec: z.number().int().min(0).max(JOB_POLL_MAX_SEC).optional(),
    },
    availability: anyHost,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const wait = Math.min((args.maxWaitSec as number) ?? JOB_POLL_MAX_SEC, JOB_POLL_MAX_SEC)
      const job = await deps.api.project.job(project, args.jobId as string, wait)

      return jobResult(job)
    },
  },

  {
    name: 'create_project',
    title: 'Start a project from a description',
    description:
      'Describe the application in a sentence or two. The platform writes a specification, names it'
      + ' and drafts a vision. Returns a job — poll it with wait_for, then read the draft and call'
      + ' confirm_project.',
    input: { prompt: z.string().min(1) },
    availability: anyHost,
    run: async (args, deps) => {
      const job = await deps.api.project.create(
        args.prompt as string,
        deps.host.target === ConnectTarget.Local ? ConnectTarget.Local : ConnectTarget.Cloud
      )
      deps.attach(job.projectId)

      return jobResult(job)
    },
  },

  {
    name: 'confirm_project',
    title: 'Accept the specification and build the application',
    description:
      'Confirm the drafted project, optionally editing what the analysis produced. This is what'
      + ' starts the build: the template lands, dependencies install, the whole application is'
      + ' drawn. Returns a job — it takes several minutes.',
    input: {
      projectId: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      specification: z.string().optional(),
      vision: z.string().optional(),
    },
    availability: anyHost,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      // Attached BEFORE the call that starts the build, not after it. The platform begins
      // sending file writes as soon as this returns, and an operation dispatched at a project
      // whose connector has not filed a session yet is not queued for later — a local target
      // answers it with `ConnectSessionGone` and the step fails.
      await ensureSession(deps, project)
      const job = await deps.api.project.confirm(project, {
        ...(typeof args.name === 'string' ? { name: args.name } : {}),
        ...(typeof args.description === 'string' ? { description: args.description } : {}),
        ...(typeof args.specification === 'string' ? { specification: args.specification } : {}),
        ...(typeof args.vision === 'string' ? { vision: args.vision } : {}),
      })
      return jobResult(job)
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
      ] as const) {
        if (value != null && value.trim() !== '') {
          lines.push('', `--- ${label} ---`, value.slice(0, DRAFT_CAP))
        }
      }
      for (const warning of [status.slot?.lastError, status.slot?.buildWarning, status.slot?.backendWarning]) {
        if (warning != null && warning !== '') lines.push(`warning: ${warning}`)
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
      const job = await deps.api.project.reinit(project)
      return jobResult(job)
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
      const list = await deps.api.story.list(projectOf(args, deps), {
        ...(typeof args.page === 'number' ? { page: args.page } : {}),
        ...(typeof args.size === 'number' ? { size: args.size } : {}),
        ...(typeof args.status === 'string' ? { status: args.status } : {}),
        ...(typeof args.area === 'string' ? { area: args.area } : {}),
      })

      return ok(renderStories(list.items, list.page, list.total), list as unknown as Record<string, unknown>)
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
      const list = await deps.api.story.list(projectOf(args, deps), { q: args.q as string })

      return ok(renderStories(list.items, list.page, list.total), list as unknown as Record<string, unknown>)
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
      const created = await deps.api.story.create(projectOf(args, deps), args.story as string)

      return ok('Story created.', created)
    },
  },

  {
    name: 'update_story',
    title: 'Reword a user story',
    description: 'Change what a story says. Its status is not changed — develop_story does that.',
    input: { storyId: z.string(), story: z.string().min(1), projectId: z.string().optional() },
    availability: anyHost,
    run: async (args, deps) => {
      const updated = await deps.api.story.update(
        projectOf(args, deps), args.storyId as string, args.story as string
      )

      return ok('Story updated.', updated)
    },
  },

  {
    name: 'delete_story',
    title: 'Remove a user story',
    description: 'Delete a story that has not been implemented. Its placeholder screens are retired.',
    input: { storyId: z.string(), projectId: z.string().optional() },
    availability: anyHost,
    run: async (args, deps) => {
      await deps.api.story.remove(projectOf(args, deps), args.storyId as string)

      return ok('Story deleted.')
    },
  },

  {
    name: 'develop_story',
    title: 'Implement a user story',
    description:
      'Ask the platform to design and build one story: its screens, its data, its endpoints, its'
      + ' navigation. This is the main event and takes many minutes. Returns a job.',
    input: { storyId: z.string(), projectId: z.string().optional() },
    availability: anyHost,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      const job = await deps.api.story.develop(project, args.storyId as string)
      return jobResult(job)
    },
  },

  {
    name: 'story_status',
    title: 'What happened to a story',
    description: 'One story: its status, and the warning explaining a failure.',
    input: { storyId: z.string(), projectId: z.string().optional() },
    availability: anyHost,
    run: async (args, deps) => {
      const story = await deps.api.story.get(projectOf(args, deps), args.storyId as string)

      return ok(
        `${story.code ?? story.id} · ${story.status}`
        + (story.warning != null ? `\nwarning: ${String(story.warning)}` : ''),
        story
      )
    },
  },

  {
    name: 'modify_project',
    title: 'Ask the agent for an open-ended change',
    description:
      'Describe a change in words and let the platform\'s own coding agent make it. For anything'
      + ' that is not a user story: a rename, a fix, a styling change. Returns a job.',
    input: { prompt: z.string().min(1), projectId: z.string().optional() },
    availability: anyHost,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      const job = await deps.api.project.modify(project, args.prompt as string)
      return jobResult(job)
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

      return ok(
        `${String(state.pipeline)} · ${String(state.status)}`
        + (state.step != null ? ` · stopped at ${String(state.step)}` : '')
        + (state.error != null ? `\nerror: ${String(state.error)}` : ''),
        state
      )
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
      const job = await deps.api.pipeline.resume(project, args.runId as string, {
        ...(typeof args.from === 'string' ? { from: args.from } : {}),
      })
      return jobResult(job)
    },
  },

  {
    name: 'next_task',
    title: 'Get the next model call to perform',
    description:
      'This session runs the platform\'s model calls on your side. Returns one task with'
      + ' instructions for running it in a clean subagent, or says there is nothing yet. Call it'
      + ' whenever a job reports "blocked on: model-task", and keep calling until it says none.',
    input: {
      maxWaitSec: z.number().int().min(0).max(45).optional(),
      taskId: z.string().optional()
        .describe('Re-read a task you were already given, if you lost its text.'),
    },
    availability: performsModelTasks,
    run: async (args, deps) => {
      const session = await deps.session()

      // Asking for one by id re-reads it rather than taking a new one. A task is handed out once
      // and the platform waits on it for up to 45 minutes, so a parent that lost the envelope —
      // a compacted conversation, a subagent that died before answering — otherwise has no way
      // back to it and the job blocks until the deadline for no reason.
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
          'No task right now. If a job is still running, call wait_for; if it reported'
          + ' "blocked on: model-task", call next_task again.'
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
    availability: performsModelTasks,
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
          : 'Accepted. Call wait_for on the job, or next_task if it is still blocked.'
      )
    },
  },

  {
    name: 'list_files',
    title: 'The generated project\'s files',
    description: 'What the platform generated, for a project whose sources live in its own slot.',
    input: { projectId: z.string().optional() },
    availability: cloudTarget,
    run: async () => fail('Not available yet in this build.'),
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

const renderStories = (items: readonly ConnectStoryItem[], page: number, total: number): string =>
  items.length < 1
    ? 'No stories.'
    : `${items.length} of ${total} (page ${page}):\n`
      + items.map(item =>
        `  ${String(item.code ?? item.id)} · ${String(item.status)}`
        + `${item.primary === true ? ' · primary' : ''}`
        + `${item.area != null ? ` · ${String(item.area)}` : ''}\n      ${String(item.story).slice(0, 160)}`
      ).join('\n')


/** The tools a given host actually offers. */
export const visibleTools = (host: ToolHost): ToolDefinition[] =>
  catalogue.filter(tool => tool.availability(host))

export const toolByName = (name: string): ToolDefinition | undefined =>
  catalogue.find(tool => tool.name === name)

export { ToolHostKind }
