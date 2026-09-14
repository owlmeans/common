import { ConnectJobBlock, ConnectJobKind, ConnectLlm, ConnectTarget } from '@owlmeans/viable-common'

import { JOB_POLL_MAX_SEC, NEXT_QUESTION_WAIT_MS, NEXT_TASK_WAIT_MS, TOOL_DEADLINE_MS } from '../consts.js'
import { visibleTools } from './catalogue.js'
import type { ToolHost } from './types.js'

/**
 * One long-running thing the platform does, described for a parent agent.
 *
 * A pipeline, not a tool: what a parent needs before it starts anything is what the platform is
 * ABLE to do and roughly what each of those costs it in waiting — which is exactly what a tool
 * list, read one description at a time, never says. `startedBy` names the tools that begin it, so
 * a parent reading this can act on it without a second lookup.
 */
export interface PlatformPipeline {
  id: string
  title: string
  what: string
  /** Tool names in this SDK's own catalogue. A test pins that every one of them exists. */
  startedBy: string[]
  stages?: string[]
  /** Whether a crashed run is picked up where it stopped rather than started over. */
  resumable: boolean
  /** What a run of it can stop and wait for. */
  blocks?: ConnectJobBlock[]
  /** The job kind a parent polls it under, where it has one. */
  jobKind?: ConnectJobKind
}

/**
 * A group of tools that answer one need, and what a host must be for them to work.
 *
 * Grouped rather than listed flat because the answer a parent wants is "can this session do X",
 * and X is never one tool. `absent` is what a host that hides the group is told INSTEAD of it —
 * a parent that reads only a shorter list concludes the platform cannot do the thing at all, and
 * proposes a path around it.
 */
export interface PlatformCapability {
  id: string
  title: string
  what: string
  tools: string[]
  /** Why this session does not have it. Rendered only where the group is hidden. */
  absent: string
}

export interface PlatformCatalogue {
  pipelines: PlatformPipeline[]
  capabilities: PlatformCapability[]
  limits: {
    toolDeadlineMs: number
    jobPollMaxSec: number
    nextTaskWaitMs: number
    nextQuestionWaitMs: number
  }
  modes: { targets: ConnectTarget[], llms: ConnectLlm[] }
}

/**
 * What the platform can build, as data.
 *
 * STATIC on purpose: `describe_platform` is the one tool that must answer before a token is valid
 * for anything, because it is what a parent reads to decide whether to use the platform at all.
 * Every pipeline a parent can poll for has an entry — the list is checked against
 * {@link ConnectJobKind}, so a job kind added without a description here fails a test rather than
 * reaching a parent as a job it cannot interpret.
 */
export const PLATFORM_CATALOGUE: PlatformCatalogue = {
  pipelines: [
    {
      id: 'vib:project:create',
      title: 'Draft a project from a description',
      what: 'Writes the specification, names the application and drafts its vision. Nothing is'
        + ' built and no code is generated until the draft is confirmed.',
      startedBy: ['create_project'],
      resumable: false,
      jobKind: ConnectJobKind.ProjectCreate,
    },
    {
      id: 'vib:project:init',
      title: 'Build the whole application',
      what: 'Lays the template down, installs dependencies, configures the target, draws every'
        + ' screen the analysis found as a placeholder, and builds it. The long one.',
      startedBy: ['confirm_project'],
      stages: [
        'template', 'dependencies', 'serve', 'styles', 'metadata', 'primary', 'scaffold', 'build',
      ],
      resumable: true,
      blocks: [ConnectJobBlock.ModelTask, ConnectJobBlock.LocalOp, ConnectJobBlock.Env],
      jobKind: ConnectJobKind.ProjectInit,
    },
    {
      id: 'vib:project:reinit',
      title: 'Lay the template down again',
      what: 'Wipes the generated sources and rebuilds from the template. The user stories are kept'
        + ' and reset to planned; configuration and git history survive.',
      startedBy: ['reinitialize_project'],
      resumable: true,
      blocks: [ConnectJobBlock.ModelTask, ConnectJobBlock.LocalOp],
      jobKind: ConnectJobKind.ProjectReinit,
    },
    {
      id: 'vib:story:develop',
      title: 'Implement one user story',
      what: 'Designs the story, then implements it: types, data, endpoints, access, state,'
        + ' components, screens and navigation, then checks that the application still boots.',
      startedBy: ['develop_story'],
      stages: ['design', 'implement', 'widget', 'boot gate'],
      resumable: true,
      blocks: [ConnectJobBlock.ModelTask, ConnectJobBlock.LocalOp],
      jobKind: ConnectJobKind.StoryDevelop,
    },
    {
      id: 'free flight',
      title: 'An open-ended change',
      what: 'The platform\'s own coding agent makes a change described in words — a rename, a fix,'
        + ' a styling pass. For anything that is not a user story.',
      startedBy: ['modify_project'],
      resumable: true,
      blocks: [ConnectJobBlock.ModelTask, ConnectJobBlock.LocalOp],
      jobKind: ConnectJobKind.FreeFlight,
    },
    {
      id: 'resume',
      title: 'Continue a run that stopped',
      what: 'Picks a crashed or interrupted run up at the step it stopped on rather than starting'
        + ' it over. Answers a job of the run it resumed.',
      startedBy: ['resume_pipeline'],
      resumable: true,
      jobKind: ConnectJobKind.PipelineResume,
    },
    {
      id: 'vib:project:convert:intake',
      title: 'Read an application you already have',
      what: 'Takes stock of an existing codebase: what it is built with, what shape it has, how'
        + ' much of it can be converted and what that will cost. Ends at your decision.',
      startedBy: ['convert_project'],
      resumable: true,
      blocks: [ConnectJobBlock.Question, ConnectJobBlock.ModelTask, ConnectJobBlock.LocalOp],
      jobKind: ConnectJobKind.ConvertIntake,
    },
    {
      id: 'vib:project:convert:analysis',
      title: 'Restore the analysis nobody wrote',
      what: 'Reads the origin layer by layer and produces the specification, the design and the'
        + ' main flow the platform would have written for it, then bootstraps a target around it.',
      startedBy: ['proceed_conversion'],
      resumable: true,
      blocks: [ConnectJobBlock.Question, ConnectJobBlock.ModelTask, ConnectJobBlock.LocalOp],
      jobKind: ConnectJobKind.ConvertAnalysis,
    },
    {
      id: 'vib:project:convert:extraction',
      title: 'Recover the user stories',
      what: 'Extracts every user story out of the origin with proofs from its code, assigns each'
        + ' to an area, and prices implementing them.',
      startedBy: ['proceed_conversion'],
      resumable: true,
      blocks: [ConnectJobBlock.Question, ConnectJobBlock.ModelTask, ConnectJobBlock.LocalOp],
      jobKind: ConnectJobKind.ConvertExtraction,
    },
    {
      id: 'vib:project:convert:implementation',
      title: 'Re-implement it on the platform',
      what: 'Develops every extracted story with the ordinary story pipeline, with the origin kept'
        + ' beside it as evidence.',
      startedBy: ['proceed_conversion'],
      resumable: true,
      blocks: [ConnectJobBlock.ModelTask, ConnectJobBlock.LocalOp],
      jobKind: ConnectJobKind.ConvertImplementation,
    },
    {
      id: 'purge',
      title: 'Delete the converted origin',
      what: 'Removes the original sources kept beside the converted project, and rewrites the'
        + ' conversion documents so they stop quoting them. Cannot be undone.',
      startedBy: ['purge_origin'],
      resumable: false,
      jobKind: ConnectJobKind.ConvertPurge,
    },
  ],

  capabilities: [
    {
      id: 'projects',
      title: 'Projects',
      what: 'Create one, read what was drafted, list what this account has, and point the'
        + ' connector at an existing one.',
      tools: [
        'describe_capabilities', 'create_project', 'confirm_project', 'project_status',
        'list_projects', 'attach_project', 'reinitialize_project',
      ],
      absent: 'no project tools are offered here',
    },
    {
      id: 'stories',
      title: 'User stories',
      what: 'List, search, add, reword and delete stories, and ask for one to be implemented.',
      tools: [
        'list_stories', 'search_stories', 'create_story', 'update_story', 'delete_story',
        'develop_story', 'story_status',
      ],
      absent: 'no story tools are offered here',
    },
    {
      id: 'runs',
      title: 'Runs and jobs',
      what: 'Poll a job, read where a run stopped, continue it, and see what this connector is'
        + ' currently doing.',
      tools: ['wait_for', 'pipeline_status', 'resume_pipeline', 'session_status'],
      absent: 'no job tools are offered here',
    },
    {
      id: 'free-flight',
      title: 'An open-ended change',
      what: 'Describe a change in words and let the platform\'s own coding agent make it — for'
        + ' anything that is not a user story.',
      tools: ['modify_project'],
      absent: 'open-ended changes are not offered here',
    },
    {
      // The order of `tools` is the order a parent reads them in, and for this group it is the
      // workflow rather than an alphabet: `check_convertible` reports what the INTAKE found, so
      // the platform refuses it before a conversion has been started. Leading with it printed
      // check-first over a platform that answers a check with a refusal, and contradicted both the
      // tool's own description and `serverInstructions` — two texts on one server saying opposite
      // things is how a parent invents a third behaviour.
      id: 'conversion',
      title: 'Converting an application you already have',
      what: 'Start a conversion of a codebase you already have, decide at each stage, read where it'
        + ' stands and what the intake made of the tree, and delete the origin afterwards.',
      tools: [
        'convert_project', 'proceed_conversion', 'conversion_status', 'check_convertible',
        'purge_origin',
      ],
      absent: 'conversion is not offered here',
    },
    {
      id: 'model-tasks',
      title: 'Performing the platform\'s model calls',
      what: 'The platform hands a model call to you as a task to run in a clean subagent, and'
        + ' spends none of the account\'s credits on it — a conversion\'s calls by default, and'
        + ' everything else in the delegated mode.',
      tools: ['next_task', 'submit_task_result'],
      absent: 'this server holds no session, so a task cannot be delivered through it — the'
        + ' platform performs its own model calls instead',
    },
    {
      id: 'questions',
      title: 'Answering for a person',
      what: 'The platform asks a decision that is the user\'s to make, and you carry the question'
        + ' to them and the answer back.',
      tools: ['next_question', 'answer_question'],
      absent: 'this server holds no session, so a question cannot be delivered through it — the'
        + ' platform assumes an answer and records the assumption instead',
    },
    {
      id: 'local',
      title: 'Running the application on this machine',
      what: 'What the generated project still needs to start here, the database and queue the user'
        + ' supplies, and starting and stopping it.',
      tools: ['local_status', 'run_local', 'stop_local', 'local_setup_guide', 'set_local_service'],
      absent: 'this project\'s sources live in a platform slot, not on this machine',
    },
    {
      id: 'harness',
      title: 'Setting this agent up',
      what: 'Preview and write the instruction and subagent files this coding agent needs.',
      tools: ['describe_harness', 'install_harness'],
      absent: 'this server writes no files, so it cannot install a harness',
    },
    {
      id: 'files',
      title: 'The generated sources',
      what: 'Read what the platform generated for a project whose tree lives in its own slot.',
      tools: ['list_files'],
      absent: 'the sources are on this machine — read them directly',
    },
  ],

  limits: {
    toolDeadlineMs: TOOL_DEADLINE_MS,
    jobPollMaxSec: JOB_POLL_MAX_SEC,
    nextTaskWaitMs: NEXT_TASK_WAIT_MS,
    nextQuestionWaitMs: NEXT_QUESTION_WAIT_MS,
  },

  modes: {
    targets: [ConnectTarget.Cloud, ConnectTarget.Local],
    llms: [ConnectLlm.Cloud, ConnectLlm.Local],
  },
}

/**
 * The catalogue as text, narrowed to what THIS session can drive.
 *
 * Two rules, and the second is the point. Nothing is listed that the host does not offer, so a
 * parent never proposes a path it cannot take. And every group that IS hidden says so in one line,
 * because a parent reading a shorter list without an explanation concludes the platform cannot do
 * the thing at all — and then writes the application by hand.
 *
 * Deterministic: no clock, no host name, no ordering that depends on a map. Two calls with the
 * same host produce the same bytes, which is what makes it safe to cache in a system prompt.
 */
export const renderPlatform = (catalogue: PlatformCatalogue, host: ToolHost): string => {
  const offered = new Set(visibleTools(host).map(tool => tool.name))
  const has = (tool: string): boolean => offered.has(tool)

  const lines: string[] = [
    'THE OWLMEANS VIABLE PLATFORM',
    '',
    'It builds full-stack web applications from a description, and converts applications that'
    + ' already exist onto the same rails. Everything below is what the platform does; the'
    + ' "in this session" notes say which of it you can drive from here.',
    '',
    `This session: target=${host.target} (${
      host.target === ConnectTarget.Local
        ? 'the sources live on this machine'
        : 'the sources live in a platform slot'
    }), llm=${host.llm} (${
      // Read off the offered set FIRST, and only then off the mode. A host that cannot hold a
      // session cannot collect a task whatever the account setting says — and the setting is
      // `local` there often enough (an entitled account gets it on the URL host too) that
      // branching on the mode first told such a parent to poll a `next_task` it was never
      // offered, which it reports as a broken server. Above that floor a conversion delegates to
      // any session that can hold one, so a `cloud` session that CAN collect must not be told
      // the platform performs everything — it would stop polling.
      !has('next_task')
        ? 'the platform performs its own model calls — this session cannot collect one'
        : host.llm === ConnectLlm.Local
          ? 'the platform\'s model calls are yours to perform'
          : 'the platform performs its own model calls, except a conversion\'s — those are yours'
            + ' by default'
    }).`,
    '',
    'WHAT IT RUNS',
  ]

  for (const pipeline of catalogue.pipelines) {
    const startable = pipeline.startedBy.filter(has)
    lines.push(
      '',
      `  ${pipeline.title} · ${pipeline.id}`,
      `    ${pipeline.what}`,
      startable.length > 0
        ? `    start: ${startable.join(' or ')}`
        : `    not startable in this session (${pipeline.startedBy.join(', ')} is not offered here)`,
    )
    if (pipeline.stages != null) lines.push(`    steps: ${pipeline.stages.join(' → ')}`)
    lines.push(
      `    ${pipeline.resumable ? 'resumable — resume_pipeline continues it' : 'not resumable'}`
      + (pipeline.jobKind != null ? ` · job kind: ${pipeline.jobKind}` : ''),
    )
    if (pipeline.blocks != null && pipeline.blocks.length > 0) {
      lines.push(`    may block on: ${pipeline.blocks.join(', ')}`)
    }
  }

  lines.push('', 'WHAT YOU CAN CALL')
  const hidden: PlatformCapability[] = []
  for (const capability of catalogue.capabilities) {
    const available = capability.tools.filter(has)
    if (available.length < 1) {
      hidden.push(capability)

      continue
    }
    lines.push(
      '',
      `  ${capability.title}`,
      `    ${capability.what}`,
      `    ${available.join(', ')}`,
    )
  }

  if (hidden.length > 0) {
    lines.push('', 'NOT IN THIS SESSION (the platform does it; this connector cannot)')
    for (const capability of hidden) {
      lines.push(`  ${capability.title} — ${capability.absent}`)
    }
  }

  lines.push(
    '',
    'LIMITS',
    `  every tool answers within ${Math.round(catalogue.limits.toolDeadlineMs / 1000)}s — anything`
    + ' longer is a job you poll',
    `  wait_for holds for at most ${catalogue.limits.jobPollMaxSec}s per call`,
    // Named only where the tool is offered: a limit for a call that is not in the list is an
    // invitation to make it.
    ...(has('next_task')
      ? [`  next_task waits up to ${Math.round(catalogue.limits.nextTaskWaitMs / 1000)}s`]
      : []),
    ...(has('next_question')
      ? [`  next_question waits up to ${Math.round(catalogue.limits.nextQuestionWaitMs / 1000)}s`]
      : []),
    '',
    'Publishing to production, custom domains and billing are done by the user in the web'
    + ' application, and are deliberately not offered through a connector.',
  )

  return lines.join('\n')
}
