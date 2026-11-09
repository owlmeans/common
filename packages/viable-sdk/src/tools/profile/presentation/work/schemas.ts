import { z } from 'zod'

/**
 * The structured results of the work-domain tools under a listing profile.
 *
 * Every status, kind and stage is a plain string: these views cross a version skew, and a newer
 * platform may answer with a value an older connector has never heard of — a schema that enumerated
 * them would turn that into a failed call. Ids are kept only where a follow-up call takes them
 * (a project, a story, a run, a question, a feed cursor); timestamps, session, entity and record ids
 * never appear.
 */

/** A question the platform puts to the person; `answer_question` takes its `questionId`. */
const Question = z.object({
  questionId: z.string(),
  kind: z.string(),
  question: z.string(),
  context: z.string().optional(),
  options: z.array(z.object({
    value: z.string(),
    label: z.string(),
    description: z.string().optional(),
  })).optional(),
  multiple: z.boolean().optional(),
  allowText: z.boolean().optional(),
  default: z.union([z.string(), z.array(z.string())]).optional(),
})

/** A run of a pipeline; `pipeline_status` and `resume_pipeline` take its `runId`. */
const Run = z.object({
  runId: z.string(),
  pipeline: z.string(),
  status: z.string(),
  step: z.string().optional(),
  completed: z.array(z.string()),
  pending: z.array(z.string()),
  warnings: z.array(z.string()).optional(),
  error: z.string().optional(),
})

/** A workload: a preview, a production site or a local target. */
const Slot = z.object({
  projectId: z.string().optional(),
  kind: z.string(),
  status: z.string(),
  slug: z.string().optional(),
  host: z.string().optional(),
  initialized: z.boolean().optional(),
  warnings: z.array(z.string()).optional(),
})

/** The project's agent: busy or idle, and the controls a person has over what it runs. */
const Agent = z.object({
  locked: z.boolean(),
  task: z.string().optional(),
  stopping: z.boolean().optional(),
  stopScope: z.string().optional(),
  steerable: z.boolean().optional(),
})

/** The project card and the drafted brief `confirm_project` accepts edits to. */
const Project = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string().optional(),
  intrinsic: z.string().optional(),
  description: z.string().optional(),
  specification: z.string().optional(),
  vision: z.string().optional(),
  designSystem: z.string().optional(),
})

/** A project as a list names it. */
const ProjectRef = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string().optional(),
})

/** A user story; every story tool takes its `id` or its `code`. */
const Story = z.object({
  id: z.string(),
  code: z.string().optional(),
  title: z.string(),
  status: z.string().optional(),
  intrinsic: z.string().optional(),
  area: z.string().optional(),
  primary: z.boolean().optional(),
  landing: z.boolean().optional(),
  warning: z.string().optional(),
})

const StoryRef = z.object({
  id: z.string(),
  code: z.string().optional(),
})

/** A story batch in implementation order. */
const Batch = z.object({
  kind: z.string(),
  status: z.string(),
  orderedBy: z.string().optional(),
  stories: z.array(z.object({
    id: z.string(),
    code: z.string().optional(),
    state: z.string(),
    reason: z.string().optional(),
  })),
  current: StoryRef.optional(),
  finished: z.number(),
  total: z.number(),
  halted: z.string().optional(),
})

/** What an origin is built with, or what a conversion rebuilds it onto. */
const Stack = z.object({
  label: z.string(),
  language: z.string().optional(),
  framework: z.string().optional(),
})

/** A conversion stage's cost estimate. */
const Estimate = z.object({
  stage: z.string(),
  usd: z.number(),
  delegated: z.boolean(),
})

/** One entry of a cursor feed, as one line a person reads. */
const FeedEntry = z.object({
  kind: z.string(),
  summary: z.string(),
  projectId: z.string().optional(),
  storyId: z.string().optional(),
  code: z.string().optional(),
  status: z.string().optional(),
  path: z.string().optional(),
  event: z.string().optional(),
})

/** A local service the generated application needs, as this machine has it. */
const LocalService = z.object({
  configured: z.boolean(),
  reachable: z.boolean(),
  address: z.string().optional(),
})

const Ports = z.object({
  api: z.number().optional(),
  web: z.number().optional(),
  worker: z.number().optional(),
})

const Kit = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  purpose: z.string(),
  container: z.object({ key: z.string(), label: z.string() }),
  types: z.array(z.object({ key: z.string(), label: z.string(), flow: z.string() })),
  flows: z.array(z.object({
    key: z.string(),
    label: z.string(),
    statuses: z.array(z.object({ key: z.string(), label: z.string(), intrinsic: z.string() })),
  })),
})

const Capabilities = z.record(z.string(), z.boolean())

const Blueprint = z.object({
  id: z.string(),
  title: z.string(),
  language: z.string(),
  runtime: z.string(),
  framework: z.string(),
  capabilities: Capabilities,
  cases: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    tenancy: z.string(),
    capabilities: Capabilities,
    categoryKind: z.string().optional(),
    categories: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      aliases: z.array(z.string()).optional(),
      records: z.array(z.string()).optional(),
    })),
    planningResources: z.array(z.string()).optional(),
    botPlatforms: z.array(z.string()).optional(),
  })),
})

export const BlueprintsOutput = {
  defaultBlueprintId: z.string(),
  blueprints: z.array(Blueprint),
}

export const ProjectStatusOutput = {
  project: Project,
  slot: Slot.optional(),
  production: z.object({ status: z.string(), host: z.string().optional() }).optional(),
  agent: Agent,
  run: Run.optional(),
  waitingFor: z.string().optional(),
  question: Question.optional(),
  local: z.boolean().optional(),
}

export const ProjectListOutput = {
  total: z.number(),
  projects: z.array(ProjectRef),
}

export const ProjectDeletedOutput = {
  deleted: z.boolean(),
  project: ProjectRef,
}

export const KitsOutput = {
  projectId: z.string(),
  kits: z.array(Kit),
}

export const KitApplyOutput = {
  projectId: z.string(),
  kit: z.string(),
  applied: z.array(z.string()),
  skipped: z.array(z.string()),
  warnings: z.array(z.string()),
}

export const StoryPageOutput = {
  total: z.number(),
  page: z.number(),
  /** The page `list_stories` answers next, while there is one. */
  nextPage: z.number().optional(),
  stories: z.array(Story),
}

export const StoryCardOutput = {
  story: Story,
}

export const StoryStatusOutput = {
  projectId: z.string(),
  story: Story,
  run: Run.optional(),
  waitingFor: z.string().optional(),
  question: Question.optional(),
}

export const StoryBatchOutput = {
  projectId: z.string(),
  /** Absent: no batch has run on the project. */
  batch: Batch.optional(),
}

export const StoryBatchCancelOutput = {
  ...StoryBatchOutput,
  /** The story in progress the cancel also stopped, rolled back to planned. */
  stopped: StoryRef.optional(),
}

export const SteerOutput = {
  projectId: z.string(),
  queued: z.boolean(),
}

export const StopOutput = {
  projectId: z.string(),
  agent: Agent,
}

export const PipelineOutput = {
  run: z.object({
    runId: z.string(),
    pipeline: z.string(),
    status: z.string(),
    step: z.string().optional(),
    completed: z.array(z.string()),
    pending: z.array(z.string()),
    warnings: z.array(z.string()),
    /** The step the run failed at. */
    failedAt: z.string().optional(),
    error: z.string().optional(),
    note: z.string().optional(),
    attempts: z.number().optional(),
  }),
  waitingFor: z.string().optional(),
  question: Question.optional(),
}

export const ConvertCheckOutput = {
  projectId: z.string(),
  verdict: z.string(),
  reasons: z.array(z.string()),
  stack: Stack.optional(),
  architecture: z.string().optional(),
  shape: z.string(),
  monorepo: z.boolean(),
  unlinked: z.array(z.string()),
  files: z.number(),
  bytes: z.number(),
  bulk: z.number(),
  estimate: Estimate.optional(),
}

export const ConversionOutput = {
  projectId: z.string(),
  stage: z.string(),
  status: z.string(),
  decision: z.string().optional(),
  /** The decision `proceed_conversion` takes to continue, while the conversion awaits one. */
  nextDecision: z.string().optional(),
  verdict: z.string().optional(),
  stack: Stack.optional(),
  targetStack: Stack.optional(),
  architecture: z.string().optional(),
  estimate: Estimate.optional(),
  storyEstimate: z.object({ minUsd: z.number(), maxUsd: z.number(), stories: z.number() }).optional(),
  originState: z.string().optional(),
  assumptions: z.number(),
  runId: z.string().optional(),
  waitingFor: z.string().optional(),
  question: Question.optional(),
  error: z.string().optional(),
}

export const QuestionOutput = {
  /** Whether this call handed over a question; false when none is waiting. */
  asked: z.boolean(),
  questionId: z.string().optional(),
}

export const ActivityOutput = {
  projectId: z.string(),
  /** Pass back as `after` to read what comes next. */
  cursor: z.string(),
  /** Entries after the given cursor were dropped before this read. */
  gap: z.boolean(),
  entries: z.array(FeedEntry),
}

export const NotificationsOutput = {
  cursor: z.string(),
  gap: z.boolean(),
  entries: z.array(FeedEntry),
}

export const FileChangesOutput = {
  ...ActivityOutput,
  /** The preview's watcher runs; while it does not, no change is recorded. */
  watching: z.boolean(),
}

export const IntentOutput = {
  prompt: z.string(),
}

export const LocalStatusOutput = {
  configured: z.boolean(),
  missing: z.array(z.string()),
  services: z.object({ database: z.boolean(), queue: z.boolean() }).optional(),
  running: z.boolean(),
  ready: z.boolean().optional(),
  phase: z.string().optional(),
  reason: z.string().optional(),
  appUrl: z.string().optional(),
  apiUrl: z.string().optional(),
  ports: Ports.optional(),
}

export const RunLocalOutput = {
  appUrl: z.string().optional(),
  apiUrl: z.string().optional(),
  ports: Ports,
  error: z.string().optional(),
  buildError: z.string().optional(),
}

export const SetupReportOutput = {
  needsWorker: z.boolean(),
  database: LocalService,
  queue: LocalService,
  tools: z.object({ bun: z.boolean(), git: z.boolean(), docker: z.boolean() }),
  platform: z.string(),
  envIgnored: z.boolean(),
  /** The services the application still waits for: `database`, `queue`. */
  missing: z.array(z.string()),
}

export const SlotListOutput = {
  total: z.number(),
  slots: z.array(Slot),
}
