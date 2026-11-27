import { z } from 'zod'
import { CommitTimeout, TransitionAction, WorkcardKind } from '@owlmeans/planning'
import { APP_NAME_PATTERN, AREA_KEY_MAX, AREA_KEY_PATTERN, AREA_LABEL_MAX, AREA_SEGMENT_PATTERN, MAIN_APP, ProjectArea, TARGET_APP_MOUNT_PATTERN, type ConnectAppsView, MATERIAL_PATH_MAX, MATERIALS_LIMITS, AGENT_NOT_RUNNING_MARKER, AGENT_STEER_PROMPT_MAX, AgentNotRunning, AgentStopScope, WORKCARD_BATCH_MAX, type WorkcardBatchView, ConnectConfirmationRequired, ConnectTarget, IamDefaultClass, IamGrantMode, type ConnectLlm, ConversionDecision, ConversionStatus, ConvertibilityVerdict, MetadataListKind, MODEL_TIER_ROLES, OriginKind, SpecCategory, WORKCARD_BAND_MAX_USD, WORKCARD_BAND_MIN_USD, VIABLE_USER_STORY_TYPE, ViableWorkcardTransition, type ConnectConfigScope, type ConnectPipelineState, type ConnectProductionDomain, type ConnectProjectBranding, type ConnectProjectBrandingSave, type ConnectProjectStatus, type ConnectSlotView, type ConnectStoryStatus, type IamGroupBundle, type ConversionStatusView, type ConvertCheck, type InquiryPayload, type ConnectConvertCreateBody, type ViableWorkcard, CONNECT_CARDS_TOGETHER_MAX, VIABLE_CONTAINER_TYPES, VIABLE_TASK_TYPE, ViableSpecCategory, ViableTypeBy, WORK_NAME_MAX, WORK_TEXT_MAX, WorkProposalStatus, viableWorkHelper, type AnyViableWorkCard, type WorkProposals, ViableImplementChoice, type ConnectProjectStructure } from '@owlmeans/viable-common'
import {
  COMMIT_WAIT_MS, HANDOVER_WAIT_MS, NEXT_QUESTION_WAIT_MS, NEXT_TASK_WAIT_MS, STORY_PAGE_SIZE
} from '../consts.js'
import { makeProjectEnvHelper } from '../project/env.js'
import { makeSetupReportModel } from '../project/report.js'
import { setupHelper } from '../project/setup.js'
import { makeLocalRunHelper } from '../run/local.js'
import { makeRunStateHelper } from '../run/state.js'
import { makeTaskEnvelopeModel } from '../task/envelope.js'
import { makeQuestionEnvelopeModel } from '../task/inquiry.js'
import { renderPlatform } from './platform.js'
import { blueprintDescription } from './blueprints.js'
import { GENERATED_SUMMARY, PLATFORM_CATALOGUE, STORY_ORDER, ToolHostKind } from './consts.js'
import { refusalHelper } from './refusal.js'
import { kitsUtils } from './kits.js'
import { settingsHelper } from './settings.js'
import { accountHelper } from './account.js'
import { configHelper } from './config.js'
import { gitToolHelper } from './git.js'
import { productionToolHelper } from './production.js'
import { iamToolHelper } from './iam.js'
import { feedToolHelper } from './feed.js'
import { materialsToolHelper } from './materials.js'
import { referencesToolOf } from './references.js'
import { controlToolHelper } from './control.js'
import { statusTextHelper } from './status.js'
import { storyHelper } from './workcards.js'
import { cardsPlanMemoOf, cardsToolHelper } from './cards.js'
import {
  CARD_INPUTS_MAX, CARD_INPUT_NOTE_MAX, CARD_PAGE_SIZE, CARD_RERUN_SCOPES, CARD_RETYPE_WORDS, CARD_TYPE_WORDS, CARDS_UNSUPPORTED, REQUEST_ANSWER_MS,
} from './cards/consts.js'
import type { CardInput } from './cards/types.js'
import { requestToolOf } from './request.js'
import { appsToolHelper } from './apps.js'
import { appsChangeToolHelper } from './apps-change.js'
import { APPS_CHANGE_RUN } from './apps-change/consts.js'
import { attendedCallHelper } from './attended.js'
import { structureToolHelper } from './structure.js'
import { BLUEPRINTS_MAPPING, CHOICE_INPUT, CHOICE_SAID, CHOICE_UNSUPPORTED, CONVERT_CHOICE_SAID, REVIEW_INPUT, STRUCTURE_MEANING, STRUCTURE_UNSUPPORTED, SUBMIT_INPUT } from './structure/consts.local.js'
import { LOCAL_APP_RESTART_HINT, ONE_APP_PLATFORM, RESTART_WHOLE_PREVIEW } from './apps/consts.local.js'
import type { ToolDeps, ToolDefinition, ToolHost, ToolResult } from './types.js'
import type { CatalogueHelper } from './catalogue/types.js'
import { toolHostHelper } from './host.js'
import { makeHandoverHelper } from './handover.js'
import { makeToolProfileModel } from './profile.js'
import { APP_GRANT_ACTIONS, APP_GROUP_ACTIONS, APP_ORGANIZATION_ACTIONS, APP_USER_ACTIONS, BARE_428, CONFIG_SCOPES, CONVERSION_COST, DESTRUCTIVE, DOMAIN_ACTIONS, DRAFT_CAP, FEED_DETAILS, FILE_READ_CAP, GIT_SYNC_DIRECTIONS, IDEMPOTENT_WRITE, IMPLEMENT_CONFIRMED, IMPLEMENT_INPUT, IMPLEMENT_UNSUPPORTED, INFERENCE_LEVELS, INFERENCE_MODES, MATERIALS_ANSWER_MS, PREVIEW_ACTIONS, PROCEED_UPDATE_FIELDS, PRODUCTION_ACTIONS, READ_ONLY, REFERENCES_CONFIRMED, REFERENCES_READ, SOURCES_KIND, STOP_SCOPES, TASK_WITHDRAWN, WRITE } from './consts.local.js'

export { ToolHostKind }

const ok = <Structured extends object>(text: string, structured?: Structured) => ({ text, structured })
const fail = (text: string) => ({ text, isError: true })

/** A promise's value if it settles within `ms`, else `null` — the promise itself runs on either way. */
const within = async <T>(promise: Promise<T>, ms: number): Promise<T | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), ms) })])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * A conversion refusal is an ANSWER, so it comes back as one.
 *
 * Every conversion verb can be refused by a decision rather than by a failure — this origin is the
 * project, that decision is not available from this stage, the balance will not cover it — and the
 * refusal reaches this process as a marshalled `type|||marker|||stack` whose class is declared in
 * a package the SDK does not depend on. Left to escape, the parent agent is handed that string and
 * a stack trace from a machine it cannot reach; what it does with one is retry a call that can
 * never succeed. {@link RefusalHelper.refusalPhrase} turns the marker into the sentence, and the result carries
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
 *
 * The refusals only a PERSON resolves (the balance, the spend consent, a confirmation) are phrased
 * and notified exactly as `registerCatalogue` does it — a conversion's balance refusal is no
 * different from any other tool's.
 */
const answering = async (
  deps: ToolDeps, name: string, run: () => Promise<ToolResult>
): Promise<ToolResult> => {
  try {
    return await run()
  } catch (e) {
    deps.log(`${name} refused: ${refusalHelper.refusalMessage(e)}`)
    const person = refusalHelper.personRefusalPhrase(e)
    if (person != null) {
      deps.notify?.('warning', person)

      return fail(person)
    }

    return fail(refusalHelper.refusalPhrase(e))
  }
}

/**
 * The exact call that gives a conversion's confirmation: the same tool, the PROJECT named — a host
 * that keeps no attachment between calls would otherwise file another conversion on the repeat —
 * and `confirm: true`.
 */
const confirmedCall = (tool: string, args: Record<string, unknown>): string =>
  `${tool} ${JSON.stringify({ ...args, confirm: true })}`

/**
 * A conversion verb that may stop for the person's agreement (`ConnectConfirmationRequired`): the
 * refusal is answered with what to tell them and the exact call to repeat once they agree, and
 * notified like every refusal only a person resolves. Sent without `confirm`, a bare 428 — all a
 * production body leaves — is answered as that confirmation, the consent named beside it. Anything
 * else is left to {@link answering}.
 */
const confirming = async (
  deps: ToolDeps, tool: string, args: Record<string, unknown>, confirmed: boolean,
  call: () => Promise<ConversionStatusView>,
): Promise<ToolResult> => {
  try {
    return conversionResult(await call())
  } catch (e) {
    const retry = confirmedCall(tool, args)
    const text = e instanceof ConnectConfirmationRequired
      ? refusalHelper.confirmationRequiredPhrase(e, retry)
      : !confirmed && refusalHelper.refusalMessage(e).includes(BARE_428) ? refusalHelper.unconfirmedConversionPhrase(retry) : null
    if (text == null) throw e
    deps.log(`${tool} refused: ${refusalHelper.refusalMessage(e)}`)
    deps.notify?.('warning', text)

    return fail(text)
  }
}

/**
 * The person's agreement a conversion verb carries — said in its input schema, so a parent knows
 * what it means before the first refusal explains it.
 */
const CONFIRM_INPUT = z.boolean().default(false).describe(
  'Set true ONLY after the user agreed to what this call said the step costs. Without it, a step'
  + ' that would use the project conversion the plan includes, or spend the organization\'s credit'
  + ' limits or topped-up credits, starts nothing and answers with its cost instead.'
)

/** What one of `proceed_conversion`'s edits is, and the one decision it travels with. */
const updateInput = (what: string): string =>
  `${what}, as the user edited it. Accepted only with the decision that starts the extraction.`

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

const projectOf = (args: Record<string, unknown>, deps: { attached: () => string | null }): string => {
  const named = typeof args.projectId === 'string' ? args.projectId : null
  const project = named ?? deps.attached()
  if (project == null) {
    throw new Error('No project. Call create_project, or attach_project first.')
  }

  return project
}

/** An area of the project's own as the app tools take it — a key, a kind, and its optional segment, label and restriction. */
const AREA_FIELDS = {
  key: z.string().regex(AREA_KEY_PATTERN).max(AREA_KEY_MAX)
    .describe('The new area\'s key: lower-case words joined by single hyphens, never guest/user/admin/operator — e.g. "partner-portal".'),
  kind: z.enum(Object.values(ProjectArea) as [string, ...string[]])
    .describe('The kind it works like — guest (public, main app only), user (signed-in end users), admin (the owner\'s), operator (staff): its access and surface are that kind\'s.'),
  segment: z.string().regex(AREA_SEGMENT_PATTERN).min(1).max(AREA_KEY_MAX).optional()
    .describe('Its one path segment inside its app; its key when left out.'),
  label: z.string().min(1).max(AREA_LABEL_MAX).optional().describe('What a person reads for it; the kind\'s label when left out.'),
  restricted: z.boolean().optional()
    .describe('Only the people the owner grants project--<key> enter it (a signed-in kind only).'),
}

/** An area the person named, as a change body carries it: the optional parts only when given. */
const areaOf = (args: Record<string, unknown>) => ({
  key: String(args.key), kind: String(args.kind),
  ...(typeof args.segment === 'string' && args.segment !== '' ? { segment: args.segment } : {}),
  ...(typeof args.label === 'string' && args.label.trim() !== '' ? { label: args.label.trim() } : {}),
  ...(typeof args.restricted === 'boolean' ? { restricted: args.restricted } : {}),
})

const projectResult = (status: ConnectProjectStatus) => ok(
  statusTextHelper.renderProjectStatus(status), { project: status as unknown as Record<string, unknown> }
)
/** A story's domain status, with what its card says that the status route does not carry. */
const workcardResult = (status: ConnectStoryStatus, card: ViableWorkcard, apps?: readonly string[]) => {
  const landing = storyHelper.isLandingStory(card)
  // Only a card that names an area carries apps: every other story reads exactly as before them.
  const named = apps != null && apps.length > 0 ? apps : undefined

  return ok(
    statusTextHelper.renderStoryStatus(status, { landing, ...(named != null ? { apps: named } : {}) }),
    { story: status as unknown as Record<string, unknown>, ...(landing ? { landing } : {}), ...(named != null ? { apps: named } : {}) }
  )
}
/** The project settings, led by what a save just did where one did. */
const settingsResult = (projectId: string, settings: ConnectProjectBranding, lead?: string, scope?: ConnectConfigScope) => ok(
  (lead != null ? `${lead}\n\n` : '') + settingsHelper.renderProjectSettings(projectId, settings, scope),
  { projectId, ...(scope != null ? { scope } : {}), settings: settings as unknown as Record<string, unknown> }
)
/** The scope a configuration or settings tool names: production's own set, or (absent) the preview's. */
const scopeOf = (args: Record<string, unknown>): ConnectConfigScope | undefined =>
  (CONFIG_SCOPES as readonly string[]).includes(args.scope as string) ? args.scope as ConnectConfigScope : undefined
/** The input every configuration and settings tool takes to address production's own set. */
const SCOPE_INPUT = z.enum(CONFIG_SCOPES).optional().describe(
  'production addresses the published site\'s own set, taken at its next Publish; leave it out for the'
  + ' preview\'s set — the project\'s own, which a new production copies.'
)
/** The input every tool of the generated app's sign-in takes to address production's own client. */
const APP_SCOPE_INPUT = z.enum(CONFIG_SCOPES).optional().describe(
  'production addresses the published site\'s own sign-in — its own users, permissions and groups; leave'
  + ' it out for the preview\'s.'
)
/** One group's bundle — named permissions, or every permission a filter matches. */
const BUNDLE_INPUT = z.object({
  permissions: z.array(z.string().min(1).max(128)).max(256).optional().describe('Permissions by name.'),
  filter: z.object({
    areas: z.array(z.string().min(1).max(64)).max(16).optional(),
    managed: z.boolean().optional(),
    resourceScoped: z.boolean().optional(),
    entityScoped: z.boolean().optional(),
  }).optional().describe('Every permission matching these flags, evaluated as the app declares more.'),
})
const pipelineResult = (status: ConnectPipelineState) => ok(
  statusTextHelper.renderPipelineStatus(status), { pipeline: status as unknown as Record<string, unknown> }
)
/** A story batch, led by what a call just did where one did. */
const batchResult = (view: WorkcardBatchView, lead?: string) => ok(
  (lead != null ? `${lead}\n\n` : '') + statusTextHelper.renderBatchStatus(view),
  { batch: view as unknown as Record<string, unknown> }
)
/**
 * Stop the story a cancelled batch was implementing — the second half of the web's "Stop all",
 * which cancels FIRST so no next story can start in between. Nothing running is no failure: the
 * batch may have been between two stories. Answers whether a stop was requested.
 */
const stopBatchWorkcard = async (deps: ToolDeps, projectId: string, workcardId: string): Promise<boolean> => {
  try {
    await deps.api.project.stop(projectId, { scope: AgentStopScope.Workcard, storyId: workcardId, confirm: true })

    return true
  } catch (e) {
    if (e instanceof AgentNotRunning || refusalHelper.refusalMessage(e).includes(AGENT_NOT_RUNNING_MARKER)) {
      deps.log(`cancel_story_batch: nothing to stop for ${workcardId}: ${refusalHelper.refusalMessage(e)}`)

      return false
    }
    throw e
  }
}
const conversionResult = (status: ConversionStatusView) => ok(
  renderConversion(status), { conversion: status as unknown as Record<string, unknown> }
)
/** The cursor, page size and hold a feed tool was given — only what it named crosses the wire. */
const feedQueryOf = (args: Record<string, unknown>): { after?: string, limit?: number, wait?: number } => ({
  ...(typeof args.after === 'string' && args.after.trim() !== '' ? { after: args.after.trim() } : {}),
  ...(typeof args.limit === 'number' ? { limit: args.limit } : {}),
  ...(typeof args.wait === 'number' ? { wait: args.wait } : {}),
})
/** The input every feed tool takes: the cursor and the hold. */
const FEED_AFTER_INPUT = z.string().max(41).optional().describe(
  'The cursor the previous call of this tool answered — leave it out for the latest entries.'
)
const FEED_WAIT_INPUT = z.number().int().min(0).max(20).optional().describe(
  'Seconds to hold for the next entry when none has come yet (at most 20); leave it out to answer at once.'
)
/** A file path a tool was given, or null when it was given none. */
const pathOf = (args: Record<string, unknown>): string | null =>
  typeof args.path === 'string' && args.path.trim() !== '' ? args.path.trim() : null

/** What a write or a delete did to the preview: rebuilt, or the build's failure and what still serves. */
const rebuildNote = (buildWarning: string | undefined): string => buildWarning != null && buildWarning !== ''
  ? ` The preview rebuild FAILED, so the preview still serves the last version that built: ${refusalHelper.refusalPhrase(buildWarning)}`
  : ' The preview was rebuilt.'

/** The preview workload as a control answered it. */
const slotResult = (lead: string, projectId: string, slot: ConnectSlotView) => ok(
  `${lead}\n${statusTextHelper.renderSlot(slot)}`, { projectId, slot: slot as unknown as Record<string, unknown> }
)

/** One card's composed status, led by what a call just did — or, on a platform older than the route, the lead alone. */
const cardStatusResult = async (
  deps: ToolDeps, projectId: string, cardId: string, lead?: string, extra: Record<string, unknown> = {},
): Promise<ToolResult> => {
  try {
    const status = await deps.api.cards.status(projectId, cardId)

    return ok((lead != null ? `${lead}\n\n` : '') + cardsToolHelper.renderStatus(status), { ...extra, card: status })
  } catch (e) {
    if (!cardsToolHelper.routeMissing(e)) throw e

    return lead != null ? ok(lead, { ...extra, cardId }) : fail(CARDS_UNSUPPORTED)
  }
}

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
  if (!toolHostHelper.sessionCapable(deps.host)) return

  // The session is filed against the project it will answer for, so a tool naming a project other
  // than the attached one moves the connector BEFORE opening. Opening first would file the session
  // against the previous project, and the platform would deliver this project's operations to
  // nobody.
  deps.attach(projectId)
  await deps.session()
}

/**
 * The id of a session that names NO project — what a delegated create sends, so the platform can
 * hand the checks it runs before the project card exists to this session's parent.
 *
 * A session filed against another project would be refused there, so an attached connector is
 * detached first; the create then attaches it to the project it filed. `undefined` where the host
 * cannot detach, and the platform performs those checks itself.
 */
const unattachedSessionId = async (deps: ToolDeps): Promise<string | undefined> => {
  if (deps.attached() != null) {
    if (deps.detach == null) return undefined
    deps.detach()
  }

  return (await deps.session()).session.id
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
const waitForWorkcardCleanup = async (deps: ToolDeps, projectId: string): Promise<void> => {
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
  (note != null ? `${note}\n\n` : '') + makeQuestionEnvelopeModel(inquiry).renderQuestionEnvelope({ harness: deps.host.harness }),
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
        ? statusTextHelper.conversionNext(conversion)
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
      + ` $${WORKCARD_BAND_MIN_USD}–$${WORKCARD_BAND_MAX_USD} each.`
    )
  }
  // Phrased, exactly like a thrown one: the platform writes a failed stage's cause here with
  // `describeFailure`, which for a refusal is the marker verbatim. Phrase the stored value the
  // same way as a thrown refusal so every conversion status has one user-facing reading.
  if (view.lastError != null && view.lastError !== '') {
    lines.push(`error: ${refusalHelper.refusalPhrase(view.lastError)}`)
  }

  lines.push(`next: ${statusTextHelper.conversionNext(view)}`)

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
    name: 'describe_blueprints',
    title: 'Supported blueprints, cases and application categories',
    description: 'Read the installed blueprint registry, its complete case list, supported app categories, tenancy and planning resources. Call before choosing a project type. '
      + BLUEPRINTS_MAPPING + ' Authenticated, read-only, model-free; requires no project or connector session.',
    input: {},
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (_args, deps) => {
      const catalogue = await deps.api.account.blueprints()
      return ok(blueprintDescription.render(catalogue), catalogue)
    },
  },
  {
    name: 'describe_platform',
    title: 'What this platform can build, and what you can drive from here',
    description:
      'Everything the platform runs — building an application from a description, implementing'
      + ' user stories, converting an application you already have — what every application it'
      + ' generates carries, and which of it this session can start. Read it before deciding how to'
      + ' approach a request. Needs no project and makes no network call.',
    input: {},
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (_args, deps) => ok(renderPlatform(PLATFORM_CATALOGUE, deps.host)),
  },

  {
    name: 'describe_capabilities',
    title: 'Report what your models can do',
    description:
      'Tell the platform which of your models it may use, so it can size each call. Call this once,'
      + ' before creating or developing anything. Returns the mapping it will use, and what every'
      + ' generated application carries.',
    input: {
      strong: z.string().optional().describe('Your most capable model, e.g. the one you plan with'),
      standard: z.string().optional().describe('Your everyday model'),
      cheap: z.string().optional().describe('Your fastest/cheapest model'),
      subagents: z.boolean().optional().describe('Can you run a task in an isolated subagent?'),
      effortControl: z.boolean().optional().describe('Can you ask for low reasoning effort?'),
    },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
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
          + roleSummary()
          + `\n\n${GENERATED_SUMMARY}`,
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
        // The answer to "which calls are mine" is all or none: a delegated session performs every
        // model call the platform makes for it, a cloud one none — a conversion's included.
        + (toolHostHelper.performsModelTasks(deps.host)
          ? '\n\nThis session runs in the delegated mode: EVERY model call the platform makes for it'
            + ' is yours to perform — project drafting, content checks and formatting included.'
            + ' Whenever a tool answers with a model task, or a domain status reports waiting for one,'
            + ' perform it and call submit_task_result; next_task hands you the next.'
          : toolHostHelper.sessionCapable(deps.host)
            ? '\n\nThis session runs in the cloud mode: the platform performs every model call'
              + ' itself, a conversion\'s included.'
            : '')
        + `\n\n${GENERATED_SUMMARY}`,
        { tiers, subagents, effortControl, roles: byTier }
      )
    },
  },

  {
    name: 'session_status',
    title: 'What this connector is doing',
    description: 'The mode, the attached project, and what the connector has handled so far.',
    input: {},
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (_args, deps) => {
      const session = deps.currentSession()
      const lines = [
        `target: ${deps.host.target} · llm: ${deps.host.llm} · harness: ${deps.host.harness}`,
        `project: ${deps.attached() ?? '(none attached)'}`,
        ...(deps.dir != null ? [`directory: ${deps.dir}`] : []),
      ]
      if (session == null) {
        lines.push(toolHostHelper.sessionCapable(deps.host)
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
      if (deps.host.profile?.reportClient !== true) return ok(lines.join('\n'))

      // How the platform sees this connection — a platform older than the report answers null.
      const client = await deps.api.client().catch((e: unknown) => {
        deps.log(`session_status: the platform did not report this connection: ${refusalHelper.refusalMessage(e)}`)

        return null
      })
      lines.push(statusTextHelper.renderClient(client))

      return ok(lines.join('\n'), { client })
    },
  },

  {
    name: 'create_project',
    title: 'Start a project from a description',
    description:
      'Describe the application in a sentence or two. The platform writes a specification, names it'
      + ' and drafts a vision. ' + REFERENCES_READ + ' ' + CHOICE_SAID
      + ' Returns the project status; read the draft and call confirm_project.',
    input: { prompt: z.string().min(1), ...CHOICE_INPUT, review_structure: REVIEW_INPUT },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      // A choice made before the specification travels on its own route; a connector or a platform
      // without it creates NOTHING — the choice is never dropped in silence.
      const chosen = structureToolHelper.choiceOf(args)
      if (chosen.asked && typeof deps.api.project.createWithChoice !== 'function') {
        return fail(CHOICE_UNSUPPORTED('create_project', 'created'))
      }
      // In the delegated mode the platform's checks of the prompt run before the project exists, so
      // they go to a session that names no project yet — and the drafting after them to the
      // project's own, attached as soon as the platform answers with it.
      const sessionId = toolHostHelper.performsModelTasks(deps.host) ? await unattachedSessionId(deps) : undefined
      const target = deps.host.target === ConnectTarget.Local ? ConnectTarget.Local : ConnectTarget.Cloud
      let status: ConnectProjectStatus
      if (chosen.asked) {
        try {
          status = await deps.api.project.createWithChoice!({
            prompt: args.prompt as string, target, ...(sessionId != null ? { sessionId } : {}), ...chosen.choice,
            ...(chosen.review ? { reviewStructure: true } : {}),
          })
        } catch (e) {
          if (structureToolHelper.routeMissing(e)) return fail(CHOICE_UNSUPPORTED('create_project', 'created'))
          throw e
        }
      } else {
        // The platform reads the prompt's references (links, research requests, npm packages); an older
        // platform without that route drafts from the released create, the prompt as plain text.
        status = await referencesToolOf(deps.api).create(args.prompt as string, target, sessionId)
      }
      deps.attach(status.project.id)
      if (sessionId != null) await ensureSession(deps, status.project.id)

      return projectResult(status)
    },
  },

  {
    name: 'create_project_with_files',
    title: 'Start a project from a description and files',
    description:
      'Describe the application and name the files and folders on this machine that go with it — a'
      + ' specification or brief, a logo, icons, fonts, stylesheets, sketches, an HTML prototype, media.'
      + ' Each file is checked first (at most 50 files, 12 MiB each, 50 MiB in all; programs refused) and'
      + ' a refusal is reported per file before anything is sent. The platform then reads the files and'
      + ' writes the specification, name and vision from the description and their text (links and "search'
      + ' online" requests in the description are read too, as create_project reads them) — model work that'
      + ' spends credits (the plan\'s project allowance first). Returns the project status and what became'
      + ' of each file; read the draft with project_status and call confirm_project. ' + CHOICE_SAID
      + ' Each call creates another project, so calling it again spends again.',
    input: {
      prompt: z.string().min(1),
      paths: z.array(z.string().min(1)).min(1).max(MATERIALS_LIMITS.files).describe(
        'Files and folders on this machine — absolute, or relative to the project directory. A folder is'
          + ' sent with every file under it, its own name kept as the first segment; links are never followed.'
      ),
      ...CHOICE_INPUT,
      review_structure: REVIEW_INPUT,
    },
    availability: toolHostHelper.uploadsMaterials,
    annotations: WRITE,
    run: async (args, deps) => {
      const started = Date.now()
      const { inputs, unreadable } = await materialsToolHelper.inputsOf(args.paths as string[], deps.dir)
      const checked = materialsToolHelper.precheck(inputs)
      const before = [...unreadable, ...checked.refused]
      if (checked.admitted.length === 0) {
        return fail(`Nothing was created: none of the files can be sent.\n${materialsToolHelper.renderOutcomes(before)}`)
      }

      // A choice made before the specification travels on the create with the choice, the files announced
      // beside it; without that route nothing is created and nothing sent.
      const chosen = structureToolHelper.choiceOf(args)
      if (chosen.asked && typeof deps.api.project.createWithChoice !== 'function') {
        return fail(CHOICE_UNSUPPORTED('create_project_with_files', 'created or sent'))
      }
      // As create_project: in the delegated mode the platform's checks of the prompt go to a session
      // that names no project yet, and everything after them to the project's own.
      const sessionId = toolHostHelper.performsModelTasks(deps.host) ? await unattachedSessionId(deps) : undefined
      const body = {
        prompt: args.prompt as string,
        materials: checked.totals,
        target: deps.host.target === ConnectTarget.Local ? ConnectTarget.Local : ConnectTarget.Cloud,
        ...(sessionId != null ? { sessionId } : {}),
      }
      let status: ConnectProjectStatus
      if (chosen.asked) {
        try {
          status = await deps.api.project.createWithChoice!({
            ...body, ...chosen.choice, ...(chosen.review ? { reviewStructure: true } : {}),
          })
        } catch (e) {
          if (structureToolHelper.routeMissing(e)) return fail(CHOICE_UNSUPPORTED('create_project_with_files', 'created or sent'))
          throw e
        }
      } else {
        status = await deps.api.materials.create(body)
      }
      const projectId = status.project.id
      deps.attach(projectId)
      // The seal hands the drafting to the project's delegating session: it must be attached first.
      if (sessionId != null) await ensureSession(deps, projectId)

      const sending = materialsToolHelper.send(deps, projectId, checked.admitted)
      const remaining = MATERIALS_ANSWER_MS - (Date.now() - started)
      const sent = remaining > 0 ? await within(sending, remaining) : null
      if (sent == null) {
        // Still sending: the upload goes on in this process and is sealed after its last file.
        void sending.then(done => {
          deps.log(`create_project_with_files ${projectId}: ${done.files.length} file(s) answered, sealed: ${done.sealed}`)
          if (done.error != null) deps.notify?.('warning', `The files of ${projectId} were sent, but the drafting could not start: ${done.error}`)
        }).catch((e: unknown) => deps.log(`create_project_with_files ${projectId}: ${refusalHelper.refusalMessage(e)}`))

        return ok(
          `Project ${projectId} is created; ${checked.admitted.length} file(s) are still being sent from this`
          + ' machine. The upload is sealed after the last one and the drafting starts then — read'
          + ` list_materials ${JSON.stringify({ projectId })} for each file, then project_status for the draft.`
          + (before.length > 0 ? `\n${materialsToolHelper.renderOutcomes(before)}` : '')
          + `\n\n${statusTextHelper.renderProjectStatus(status)}`,
          { project: status as unknown as Record<string, unknown>, files: before, pending: true, sealed: false },
        )
      }

      const files = [...before, ...sent.files]
      const lead = sent.sealed
        ? 'The files are in and the upload is sealed: the platform reads them and drafts the project from'
          + ' them and the description. Read project_status until the draft is in, then confirm_project.'
        : `The files were sent, but the drafting could not start: ${sent.error ?? 'the upload could not be sealed'}.`

      return {
        text: `${materialsToolHelper.renderOutcomes(files)}\n${lead}\n\n${statusTextHelper.renderProjectStatus(status)}`,
        structured: { project: status as unknown as Record<string, unknown>, files, pending: false, sealed: sent.sealed },
      }
    },
  },

  {
    name: 'list_materials',
    title: 'The files a project was created with',
    description:
      'Every file the project was given at its creation — uploaded, or fetched for a link in its prompt'
      + ' (under links/); accepted, refused and removed alike — with its purpose (specification, logo, icon,'
      + ' font, prototype, media…), status, description and where it was placed, and where the files stand'
      + ' while the platform reads them; then the references the prompt and the confirmed specification'
      + ' pointed at (links, "search online" requests, npm packages) with what became of each, and the'
      + ' documents the platform generated from them (research reports, reference summaries, package'
      + ' skills). read_material reads one file\'s or document\'s text.',
    input: { projectId: z.string().optional() },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const catalogue = await deps.api.materials.catalogue(project)

      return ok(materialsToolHelper.renderCatalogue(project, catalogue), { projectId: project, ...catalogue })
    },
  },

  {
    name: 'read_material',
    title: 'Read one of a project\'s files',
    description:
      'The text of one file the project was created with: the platform\'s markdown transcript of a'
      + ' document (a PDF, a Word file, a page, hand notes) or a text file\'s own content — or of a document'
      + ' the platform generated from the project\'s references (a research report, a reference summary, a'
      + ' package skill). An image, a font or media has no text — list_materials describes it.',
    input: {
      projectId: z.string().optional(),
      path: z.string().min(1).max(MATERIAL_PATH_MAX).describe('The file\'s path as list_materials prints it.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const path = pathOf(args)
      if (path == null) return fail('Name the file with path — list_materials shows them.')
      const project = projectOf(args, deps)
      const text = await deps.api.materials.read(project, path)

      return ok(materialsToolHelper.renderText(text), {
        projectId: project, path: text.path, source: text.source, length: text.length,
        ...(text.truncated === true ? { truncated: true } : {}),
      })
    },
  },

  {
    name: 'confirm_project',
    title: 'Accept the specification and build the application',
    description:
      'Confirm the drafted project, optionally editing what the analysis produced. This is what'
      + ' starts the build: the template lands, dependencies install, the whole application is'
      + ' drawn. ' + REFERENCES_CONFIRMED + ' ' + IMPLEMENT_CONFIRMED
      + ' Returns the project status while the server-side run continues.',
    input: {
      projectId: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      specification: z.string().optional(),
      vision: z.string().optional(),
      designSystem: z.string().optional(),
      implement: z.enum(Object.values(ViableImplementChoice) as [string, ...string[]]).optional().describe(IMPLEMENT_INPUT),
    },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      // Attached BEFORE the call that starts the build, not after it. The platform begins
      // sending file writes as soon as this returns, and an operation dispatched at a project
      // whose connector has not filed a session yet is not queued for later — a local target
      // answers it with `ConnectSessionGone` and the step fails.
      await ensureSession(deps, project)
      const edits = {
        ...(typeof args.name === 'string' ? { name: args.name } : {}),
        ...(typeof args.description === 'string' ? { description: args.description } : {}),
        ...(typeof args.specification === 'string' ? { specification: args.specification } : {}),
        ...(typeof args.vision === 'string' ? { vision: args.vision } : {}),
        ...(typeof args.designSystem === 'string' ? { designSystem: args.designSystem } : {}),
      }
      // The choice at the approval has its own route (the references refreshed too). A platform older
      // than it — a bare 404, or a host's implementation without the member — confirms nothing: a
      // spec asked for is never silently drawn as a preview.
      if (typeof args.implement === 'string') {
        if (typeof deps.api.project.confirmImplementation !== 'function') return fail(IMPLEMENT_UNSUPPORTED)
        try {
          return projectResult(await deps.api.project.confirmImplementation(project, {
            ...edits, implement: args.implement as ViableImplementChoice,
          }))
        } catch (e) {
          if (cardsToolHelper.routeMissing(e)) return fail(IMPLEMENT_UNSUPPORTED)
          throw e
        }
      }
      // With the references refreshed from the confirmed specification; an older platform without
      // that route confirms through the released one.
      return projectResult(await referencesToolOf(deps.api).confirm(project, edits))
    },
  },

  {
    name: 'project_status',
    title: 'Where the project stands',
    description: 'The project, its slot, whether the agent is busy, and the last run.',
    input: { projectId: z.string().optional() },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
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
        if (warning != null && warning !== '') lines.push(`warning: ${refusalHelper.refusalPhrase(warning)}`)
      }
      // A draft waiting for the person with no question asked waits at its structure step.
      if (statusTextHelper.atStructureStep(status)) {
        lines.push(`waiting for the person: the project structure — project_structure { "projectId": "${status.project.id}" }`)
      }

      return ok(lines.join('\n'), status as unknown as Record<string, unknown>)
    },
  },

  {
    name: 'project_structure',
    title: 'The project\'s structure',
    description:
      `A project's structure: ${STRUCTURE_MEANING}, the issues the platform finds in it and the part kinds it`
      + ' takes. While a new project waits at its structure step (create_project with review_structure) — or a'
      + ' conversion after its intake — it also shows the platform\'s suggested case, the latest advice and its'
      + ' changes, and the structure as JSON to edit; once the project is initialized, the structure it was built'
      + ' with. Reading spends nothing.',
    input: { projectId: z.string().optional() },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      if (typeof deps.api.project.structure !== 'function') return fail(STRUCTURE_UNSUPPORTED)
      let view: ConnectProjectStructure
      try {
        view = await deps.api.project.structure(project)
      } catch (e) {
        if (structureToolHelper.routeMissing(e)) return fail(STRUCTURE_UNSUPPORTED)
        throw e
      }

      return ok(structureToolHelper.renderStructure(view), view as unknown as Record<string, unknown>)
    },
  },

  {
    name: 'update_project_structure',
    title: 'Change or accept the project\'s structure',
    description:
      'Submit the structure step of a project waiting at it: the revision project_structure printed, the'
      + ' blueprint and case (the choice arguments given replace the whole choice; none given keeps it) and the'
      + ' structure as edited (every part with its purpose; left out, the one in force stays). With advise: true'
      + ' or ideas (the user\'s own words, links included) it is an ADVICE round: the platform proposes an updated'
      + ' structure from the change — model work billed as part of the initialization, the plan\'s allowance for'
      + ' the project first, then credits; when a round would spend credits the tool answers with the cost and'
      + ' starts nothing — tell the user, and repeat it with confirm: true only after they agree. After an advice'
      + ' round the platform may apply the advice and go on to the specification by itself; project_structure'
      + ' says which. Without advice it takes the structure and continues: a new project\'s specification is'
      + ' written (project_status, then confirm_project), a conversion keeps it for its analysis'
      + ' (proceed_conversion). Calling it again with advice asks for advice again and spends again.',
    input: { projectId: z.string().optional(), ...SUBMIT_INPUT },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      if (typeof deps.api.project.submitStructure !== 'function') return fail(STRUCTURE_UNSUPPORTED)
      const body = structureToolHelper.submitOf(args)
      const advice = structureToolHelper.isAdvice(body)
      // An advice round's content check runs on the project's own session where it delegates.
      await ensureSession(deps, project)
      try {
        const view = await deps.api.project.submitStructure(project, body)
        const lead = advice
          ? 'Advice asked: the platform proposes an updated structure from the change.'
          : 'The structure is taken.'

        return ok(`${lead}\n${structureToolHelper.renderStructure(view)}`, view as unknown as Record<string, unknown>)
      } catch (e) {
        if (structureToolHelper.routeMissing(e)) return fail(STRUCTURE_UNSUPPORTED)
        // An advice round that would spend credits waits for the person's agreement: answered with its cost
        // and the exact call to repeat — the project named, the change repeated, confirm: true.
        const { confirm: _confirm, ...repeat } = args
        const retry = confirmedCall('update_project_structure', { ...repeat, projectId: project })
        const text = e instanceof ConnectConfirmationRequired
          ? refusalHelper.confirmationRequiredPhrase(e, retry)
          : advice && body.confirm !== true && refusalHelper.refusalMessage(e).includes(BARE_428)
            ? refusalHelper.unconfirmedAdvicePhrase(retry)
            : null
        if (text == null) throw e
        deps.log(`update_project_structure refused: ${refusalHelper.refusalMessage(e)}`)
        deps.notify?.('warning', text)

        return fail(text)
      }
    },
  },

  {
    name: 'list_projects',
    title: 'The projects on this account',
    description:
      'Every project this access token can reach, newest first, with the id, slug and status'
      + ' each of the other project tools takes.',
    input: {},
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
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
    availability: toolHostHelper.anyHost,
    annotations: IDEMPOTENT_WRITE,
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
      'Wipe the generated sources and lay the template down again, then draw the application anew.'
      + ' A rebuild counts as a NEW project generation: it uses one of the plan\'s free project'
      + ' generations, or spends credits when none is left, and is refused when neither is available.'
      + ' The user stories are KEPT and reset to planned; your own configuration and git history survive.'
      + ' Calling it again rebuilds and spends again.',
    input: { projectId: z.string().optional() },
    availability: toolHostHelper.anyHost,
    annotations: DESTRUCTIVE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      return projectResult(await deps.api.project.reinit(project))
    },
  },

  {
    name: 'describe_planning_kits',
    title: 'The planning kits a project can take',
    description:
      'A planning kit is a ready set of card types and status flows — tasks and bugs moving to done,'
      + ' deals through a sales pipeline, tickets to resolution, and so on — that the platform writes'
      + ' into the project\'s common package, so the application\'s records and their workflows are'
      + ' declared once instead of story by story. This lists each kit: its purpose, the container its'
      + ' cards live in, every card type with its main flow, and each flow\'s statuses. Call it before'
      + ' apply_planning_kit.',
    input: { projectId: z.string().optional() },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const { kits } = await deps.api.project.kitDescribe(project)

      return ok(kitsUtils.renderKits(project, kits), { projectId: project, kits: kits as unknown as Record<string, unknown>[] })
    },
  },

  {
    name: 'apply_planning_kit',
    title: 'Write a planning kit into the project',
    description:
      'Write one planning kit — its card types and status flows — into the project\'s common package.'
      + ' Describe the kits first (describe_planning_kits) and pass the kit id; `types` keeps only'
      + ' those card-type keys of the kit, and leaving it out keeps every type. Applying the same kit'
      + ' again changes nothing. The platform rebuilds the preview itself; the answer lists the types'
      + ' written, those left out, and any warnings.',
    input: {
      projectId: z.string().optional(),
      kit: z.string().min(1).describe('The kit id, as describe_planning_kits lists it'),
      types: z.array(z.string().min(1)).optional()
        .describe('The card-type keys of the kit to keep; every type when omitted'),
    },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => await answering(deps, 'apply_planning_kit', async () => {
      const project = projectOf(args, deps)
      const kit = typeof args.kit === 'string' ? args.kit : ''
      if (kit === '') {
        return fail('Name the kit: describe_planning_kits lists the kit ids this project can take.')
      }
      const types = Array.isArray(args.types)
        ? args.types.filter((type): type is string => typeof type === 'string' && type !== '')
        : undefined
      // The kit is written into the project's files, which for a local project is an operation THIS
      // connector answers — so it is attached before the platform is asked.
      await ensureSession(deps, project)
      const result = await deps.api.project.kitApply(project, { kit, ...(types != null ? { types } : {}) })

      return ok(kitsUtils.renderKitApply(project, kit, result), {
        projectId: project, kit, result: result as unknown as Record<string, unknown>,
      })
    }),
  },

  {
    name: 'project_settings',
    title: 'The project\'s settings',
    description:
      'The settings a person edits on the project\'s control panel: the copyright line, the'
      + ' organization name, the Terms and Privacy links, and the Google tag — and where the platform'
      + ' credit stands (shown or hidden, and whether the plan allows hiding it). A relative link such'
      + ' as /terms or /privacy is normal — it is the page the platform generated inside the'
      + ' application, and the generated pages name the organization and copyright set here.',
    input: { projectId: z.string().optional(), scope: SCOPE_INPUT },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const scope = scopeOf(args)

      return settingsResult(project, await deps.api.projectBranding(project, scope), undefined, scope)
    },
  },

  {
    name: 'update_project_settings',
    title: 'Change the project\'s settings',
    description:
      'Change any of the copyright line, the organization name, the Terms and Privacy links and the'
      + ' Google tag; whatever you leave out keeps its value. Copyright and organization are never'
      + ' empty. A legal link is an https:// address or a path on the application itself — /terms'
      + ' and /privacy are the generated pages. A Google tag is a GTM-, G-, GT-, AW- or DC- id, or'
      + ' an empty string to remove it; it loads on the preview and in production behind the cookie'
      + ' consent. useOrganizationDefaults: true instead replaces the organization name and copyright'
      + ' with the organization\'s defaults (organization_branding) — on its own, never with other'
      + ' fields. The preview is rebuilt with the change; production takes it at the next Publish.'
      + ' The platform credit is set_platform_credit.',
    input: {
      projectId: z.string().optional(),
      copyright: z.string().optional().describe('The copyright line, e.g. "© 2026 Acme Ltd"'),
      organizationName: z.string().optional().describe('Who runs the application'),
      termsUrl: z.string().optional().describe('https://… or a path such as /terms'),
      privacyUrl: z.string().optional().describe('https://… or a path such as /privacy'),
      googleTag: z.string().optional()
        .describe('GTM-XXXXXXX, G-XXXXXXXXXX, GT-…, AW-… or DC-…; an empty string removes it'),
      useOrganizationDefaults: z.boolean().optional()
        .describe('true: copy the organization\'s name and copyright into this project. Alone.'),
      scope: SCOPE_INPUT,
    },
    availability: toolHostHelper.anyHost,
    annotations: IDEMPOTENT_WRITE,
    run: async (args, deps) => await answering(deps, 'update_project_settings', async () => {
      const project = projectOf(args, deps)
      const scope = scopeOf(args)
      const patch: ConnectProjectBrandingSave = settingsHelper.settingsPatch(args)
      const changed = Object.keys(patch)
      if (args.useOrganizationDefaults === true) {
        if (changed.length > 0) {
          return fail(
            'Not done. useOrganizationDefaults replaces the organization name and copyright on its own:'
            + ` call it without ${changed.join(', ')}, then change the rest in a second call.`
          )
        }
        // A configuration push follows the copy, so a local project's connector is attached first.
        await ensureSession(deps, project)
        const copied = await deps.api.copyOrganizationBranding(project, scope)

        return settingsResult(
          project, copied,
          `Copied the organization's name and copyright into the project. ${settingsHelper.settingsReach(deps.host.target, scope)}`,
          scope,
        )
      }
      if (changed.length < 1) {
        return fail(
          'Nothing to change. Give at least one of copyright, organizationName, termsUrl, privacyUrl'
          + ' or googleTag, or useOrganizationDefaults: true — project_settings shows the current values.'
        )
      }
      // The save ends in a configuration push, and for a local project that push is an operation
      // THIS connector answers — so it is attached before the platform is asked, exactly as a story
      // mutation is. A host that holds no session skips it and the platform delivers the push itself.
      await ensureSession(deps, project)
      const saved = await deps.api.saveProjectBranding(project, patch, scope)

      return settingsResult(project, saved, `Saved ${changed.join(', ')}. ${settingsHelper.settingsReach(deps.host.target, scope)}`, scope)
    }),
  },

  {
    name: 'set_platform_credit',
    title: 'Hide or show the platform credit',
    description:
      'Hide (hidden: true) or show the "Built with OwlMeans" credit in the application\'s footer —'
      + ' white label, which the organization\'s plan must include; without it nothing changes and the'
      + ' answer says so. The request is kept if the plan later lapses: the credit then shows, and is'
      + ' hidden again on its own once the plan includes white label. The preview is rebuilt;'
      + ' production takes it at the next Publish.',
    input: {
      projectId: z.string().optional(),
      hidden: z.boolean().describe('true hides the credit, false shows it.'),
      scope: SCOPE_INPUT,
    },
    availability: toolHostHelper.anyHost,
    annotations: IDEMPOTENT_WRITE,
    run: async (args, deps) => await answering(deps, 'set_platform_credit', async () => {
      if (typeof args.hidden !== 'boolean') return fail('Say whether to hide the credit with hidden: true or false.')
      const project = projectOf(args, deps)
      const scope = scopeOf(args)
      await ensureSession(deps, project)
      const saved = await deps.api.setPlatformCredit(project, args.hidden, scope)

      return settingsResult(
        project, saved,
        `The platform credit is ${args.hidden ? 'hidden' : 'shown'}. ${settingsHelper.settingsReach(deps.host.target, scope)}`,
        scope,
      )
    }),
  },

  {
    name: 'project_configuration',
    title: 'The project\'s configuration variables',
    description:
      'The environment variables the generated application declares — backend and frontend — and'
      + ' which of them still need a value. A backend value is a secret: the answer says only whether'
      + ' it is set, never what it is. A frontend value is public (it is built into the pages every'
      + ' visitor loads) and is shown.',
    input: { projectId: z.string().optional(), scope: SCOPE_INPUT },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const config = await deps.api.config.get(project, scopeOf(args))

      return ok(configHelper.renderConfiguration(project, config), {
        projectId: project, configuration: config as unknown as Record<string, unknown>,
      })
    },
  },

  {
    name: 'update_project_configuration',
    title: 'Set configuration variables',
    description:
      'Set environment variables of the generated application: backend and frontend, each a map of'
      + ' NAME → value; variables you leave out keep their values, an empty value unsets one, and a new'
      + ' name is declared on the side you give it. A variable keeps its side — a backend secret is'
      + ' never moved to the frontend, where it would be public. Ask the user for secret values;'
      + ' never invent one. The preview is reconfigured and rebuilt; production\'s own set'
      + ' (scope: production) is taken at the next Publish.',
    input: {
      projectId: z.string().optional(),
      backend: z.record(z.string(), z.string()).optional()
        .describe('NAME → value for the backend, e.g. {"PAYMENT_API_KEY":"key_live_…"}. Never shown back.'),
      frontend: z.record(z.string(), z.string()).optional()
        .describe('NAME → value for the frontend — PUBLIC, built into the pages.'),
      scope: SCOPE_INPUT,
    },
    availability: toolHostHelper.anyHost,
    annotations: IDEMPOTENT_WRITE,
    run: async (args, deps) => await answering(deps, 'update_project_configuration', async () => {
      const project = projectOf(args, deps)
      const body = configHelper.configBody(args)
      const names = configHelper.namesOf(body)
      if (names.length < 1) {
        return fail('Nothing to set. Give backend and/or frontend as maps of NAME → value —'
          + ' project_configuration lists what the application declares.')
      }
      const scope = scopeOf(args)
      // A save of the preview's set ends in a configuration push — for a local project, an operation
      // this connector answers.
      await ensureSession(deps, project)
      const config = await deps.api.config.save(project, body, scope)

      return ok(
        `Set ${names.join(', ')}. ${settingsHelper.settingsReach(deps.host.target, scope)}\n\n`
        + configHelper.renderConfiguration(project, config),
        { projectId: project, configuration: config as unknown as Record<string, unknown> },
      )
    }),
  },

  {
    name: 'recollect_configuration',
    title: 'Find the variables the sources declare',
    description:
      'Let the platform\'s own agent read the generated sources again for the environment variables'
      + ' they use, and declare any the configuration does not list yet — after a change that added'
      + ' one. It is the platform\'s own model call. Answers the configuration as it then stands.',
    input: { projectId: z.string().optional() },
    availability: toolHostHelper.anyHost,
    annotations: IDEMPOTENT_WRITE,
    run: async (args, deps) => await answering(deps, 'recollect_configuration', async () => {
      const project = projectOf(args, deps)
      // It reads the project's tree — for a local project, through this connector.
      await ensureSession(deps, project)
      const config = await deps.api.config.recollect(project)

      return ok(
        `The sources were read again.\n\n${configHelper.renderConfiguration(project, config)}`,
        { projectId: project, configuration: config as unknown as Record<string, unknown> },
      )
    }),
  },

  {
    name: 'organization_branding',
    title: 'The organization\'s branding defaults',
    description:
      'The organization name and copyright line every new project of this organization starts with.'
      + ' A project keeps its own copy after it is created.',
    input: {},
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (_args, deps) => {
      const branding = await deps.api.account.branding.get()

      return ok(settingsHelper.renderOrganizationBranding(branding), { organization: branding as unknown as Record<string, unknown> })
    },
  },

  {
    name: 'update_organization_branding',
    title: 'Change the organization\'s branding defaults',
    description:
      'Change the organization name and/or the copyright line new projects start with; what you leave'
      + ' out keeps its value and neither may be empty. Existing projects keep their own — copy them in'
      + ' with update_project_settings { useOrganizationDefaults: true }.',
    input: {
      organizationName: z.string().optional().describe('Who runs the applications, e.g. "Acme Ltd"'),
      copyright: z.string().optional().describe('The copyright line, e.g. "© 2026 Acme Ltd"'),
    },
    availability: toolHostHelper.anyHost,
    annotations: IDEMPOTENT_WRITE,
    run: async (args, deps) => await answering(deps, 'update_organization_branding', async () => {
      const patch = Object.fromEntries((['organizationName', 'copyright'] as const)
        .filter(key => typeof args[key] === 'string').map(key => [key, (args[key] as string).trim()]))
      if (Object.keys(patch).length < 1) {
        return fail('Nothing to change. Give organizationName and/or copyright — organization_branding shows them.')
      }
      const saved = await deps.api.account.branding.save(patch)

      return ok(
        `Saved ${Object.keys(patch).join(', ')}.\n\n${settingsHelper.renderOrganizationBranding(saved)}`,
        { organization: saved as unknown as Record<string, unknown> },
      )
    }),
  },

  {
    name: 'backfill_project_branding',
    title: 'Fill blank project settings from the defaults',
    description:
      'Fill every project\'s still-blank organization name, copyright and legal links from the'
      + ' organization\'s defaults — values a person set are never touched. Running previews are'
      + ' refreshed; a stopped one takes the values at its next start.',
    input: {},
    availability: toolHostHelper.anyHost,
    annotations: IDEMPOTENT_WRITE,
    run: async (_args, deps) => await answering(deps, 'backfill_project_branding', async () => {
      const { projects } = await deps.api.account.branding.backfill()

      return ok(
        projects > 0
          ? `Filled the blank settings of ${projects} project(s) from the organization's defaults.`
          : 'No project had blank settings — nothing was changed.',
        { projects },
      )
    }),
  },

  {
    name: 'inference_settings',
    title: 'Who performs the model calls',
    description:
      'Whether the platform\'s model calls are made on its own models (cloud, billed in credits) or'
      + ' performed by the connected coding agent (local, which the organization\'s plan must include) —'
      + ' the user\'s own default and, for a project, its override and what it resolves to. This is the'
      + ' default the web application and connector hosts use. Restart a running stdio connector to'
      + ' reload the preference; an explicit --llm or VIABLE_LLM override takes precedence.',
    input: { projectId: z.string().optional().describe('A project to show the override of; the attached one by default.') },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const project = projectOrNull(args, deps)
      const [account, settings] = await Promise.all([
        deps.api.account.llm.get(),
        project != null ? deps.api.project.llm(project) : Promise.resolve(null),
      ])

      return ok(
        accountHelper.renderInference(account, project != null && settings != null ? { id: project, settings } : undefined),
        {
          account: account as unknown as Record<string, unknown>,
          ...(project != null && settings != null ? { projectId: project, project: settings as unknown as Record<string, unknown> } : {}),
        },
      )
    },
  },

  {
    name: 'set_inference_mode',
    title: 'Change who performs the model calls',
    description:
      'Set the user\'s default (level: account) or one project\'s override (level: project) to cloud — the'
      + ' platform\'s own models, billed in credits — or local, where the connected coding agent performs'
      + ' the platform\'s model calls; mode: inherit clears a project\'s override so it follows the default.'
      + ' Every change needs a plan that includes the local mode (exactly as in the web application); without'
      + ' it nothing changes and the answer says so. It changes the default the web application and'
      + ' connector hosts use. Restart a running stdio connector to reload it; explicit --llm or'
      + ' VIABLE_LLM overrides take precedence.',
    input: {
      level: z.enum(INFERENCE_LEVELS).describe('account: the user\'s own default. project: one project\'s override.'),
      mode: z.enum(INFERENCE_MODES).describe('cloud, local, or inherit (a project only: follow the default).'),
      projectId: z.string().optional().describe('With level: project — the attached project by default.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: IDEMPOTENT_WRITE,
    run: async (args, deps) => await answering(deps, 'set_inference_mode', async () => {
      const mode = args.mode as string
      if (!(INFERENCE_MODES as readonly string[]).includes(mode)) {
        return fail('Say which mode with mode: cloud, local, or inherit (a project only).')
      }
      if (args.level === 'account') {
        if (mode === 'inherit') {
          return fail('Not done. Your own default inherits from nothing: give mode cloud or local, or level: project'
            + ' to make one project follow your default.')
        }
        const account = await deps.api.account.llm.set(mode as ConnectLlm)

        return ok(
          `Your default is now ${mode}.\n\n${accountHelper.renderInference(account)}`,
          { account: account as unknown as Record<string, unknown> },
        )
      }
      if (args.level !== 'project') return fail('Say what to change with level: account or project.')
      const project = projectOf(args, deps)
      const settings = await deps.api.project.setLlm(project, mode === 'inherit' ? null : mode as ConnectLlm)
      const account = await deps.api.account.llm.get()

      return ok(
        `${mode === 'inherit' ? `${project} now follows your default` : `${project} is now set to ${mode}`}.`
        + `\n\n${accountHelper.renderInference(account, { id: project, settings })}`,
        { projectId: project, project: settings as unknown as Record<string, unknown> },
      )
    }),
  },

  {
    name: 'list_access_tokens',
    title: 'The user\'s access tokens',
    description:
      'The user\'s own access tokens — the credentials coding agents and scripts sign in to the platform'
      + ' with: name, the visible prefix, when each was created and last used, when it expires, and'
      + ' whether it was revoked. A token\'s secret is never shown; a new token is created only in the web'
      + ' application.',
    input: {},
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (_args, deps) => {
      const list = await deps.api.account.tokens.list()

      return ok(accountHelper.renderTokens(list), { total: list.items.length, tokens: list.items as unknown as Record<string, unknown>[] })
    },
  },

  {
    name: 'revoke_access_token',
    title: 'Revoke an access token',
    description:
      'Revoke one of the user\'s own access tokens by its id (list_access_tokens shows them): whatever'
      + ' signs in with it is refused from then on. It cannot be undone — ask the user first. Revoking the'
      + ' token this connector itself uses signs this connector out.',
    input: {
      tokenId: z.string().min(1).describe('The token\'s id, as list_access_tokens shows it.'),
      confirm: z.boolean().describe('Must be true. The user has to have agreed to revoking this token.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: { ...DESTRUCTIVE, idempotentHint: true },
    run: async (args, deps) => await answering(deps, 'revoke_access_token', async () => {
      if (args.confirm !== true) {
        return fail('Not done. A revoked token stops working at once and cannot be restored. Ask the user,'
          + ' then call it again with confirm: true.')
      }
      const tokenId = typeof args.tokenId === 'string' ? args.tokenId.trim() : ''
      if (tokenId === '') return fail('Not done. Name the token with tokenId — list_access_tokens shows them.')
      const revoked = await deps.api.account.tokens.revoke(tokenId)

      return ok(
        `Revoked the token ${revoked.id}: whatever signs in with it is refused from now on. If it was the token`
        + ' this connector uses, the next call asks for a new sign-in.',
        { tokenId: revoked.id },
      )
    }),
  },

  {
    name: 'privacy_choices',
    title: 'The user\'s marketing consents',
    description:
      'The marketing consents the user was asked for — newsletters and other optional uses of their'
      + ' data — and each one\'s saved answer: given, not given, never answered, or asked again after its'
      + ' wording changed. Giving a consent is the user\'s own choice in the web application;'
      + ' withdraw_marketing_consent withdraws one.',
    input: {},
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (_args, deps) => {
      const choices = await deps.api.account.privacy.status()

      return ok(accountHelper.renderPrivacy(choices), { privacy: choices as unknown as Record<string, unknown> })
    },
  },

  {
    name: 'withdraw_marketing_consent',
    title: 'Withdraw marketing consents',
    description:
      'Withdraw the user\'s marketing consents — the keys privacy_choices lists, or all: true for every one'
      + ' they gave. Each is recorded as not given, dated, exactly like switching it off in the web'
      + ' application. Nothing here can give a consent: that stays the user\'s own act in the browser.',
    input: {
      keys: z.array(z.string().min(1)).optional().describe('Consent keys, e.g. ["marketing.email"].'),
      all: z.boolean().optional().describe('true: withdraw every consent the user has given.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: IDEMPOTENT_WRITE,
    run: async (args, deps) => await answering(deps, 'withdraw_marketing_consent', async () => {
      const named = Array.isArray(args.keys)
        ? [...new Set((args.keys as unknown[]).filter((key): key is string => typeof key === 'string')
          .map(key => key.trim()).filter(key => key !== ''))]
        : []
      if (args.all === true && named.length > 0) {
        return fail('Not done. Give either keys or all: true, not both.')
      }
      let keys = named
      if (args.all === true) {
        keys = (await deps.api.account.privacy.status()).items.filter(item => item.granted).map(item => item.key)
        if (keys.length < 1) {
          return ok('The user has given no marketing consent — there is nothing to withdraw.', { withdrawn: [] })
        }
      }
      if (keys.length < 1) {
        return fail('Nothing to withdraw. Give keys (privacy_choices lists them) or all: true.')
      }
      const choices = await deps.api.account.privacy.withdraw(keys)

      return ok(
        `Withdrawn: ${keys.join(', ')}.\n\n${accountHelper.renderPrivacy(choices)}`,
        { withdrawn: keys, privacy: choices as unknown as Record<string, unknown> },
      )
    }),
  },

  {
    name: 'pickup_intent',
    title: 'Pick up a prompt typed on the public site',
    description:
      'Collect the project idea a visitor typed on the OwlMeans public site, by the code of the address it'
      + ' sent them to (/start?ref=… — the whole address may be given). A code works ONCE and only for two'
      + ' minutes; the prompt is then the user\'s to build with create_project once they confirm it.',
    input: {
      code: z.string().min(1).describe('The ref of the /start?ref=… address, or the address itself.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => await answering(deps, 'pickup_intent', async () => {
      const ref = accountHelper.intentRefOf(args.code)
      if (ref == null) return fail('Not done. Give the code — the ref of the /start?ref=… address the site opened.')
      const { prompt } = await deps.api.account.intent.pickup(ref)

      return ok(
        `The prompt typed on the public site:\n\n${prompt}\n\nThe code is spent. next: show it to the user and,`
        + ' once they confirm that is what they want built, create_project with it.',
        { prompt },
      )
    }),
  },

  {
    name: 'list_stories',
    title: 'The user stories of a project',
    description:
      'One page of the project\'s stories, with their status, the primary story, and the landing'
      + ' gate story a guest starts on the guest home.',
    input: {
      projectId: z.string().optional(),
      page: z.number().int().min(0).optional(),
      size: z.number().int().min(1).max(100).optional(),
      status: z.string().optional(),
      area: z.string().optional(),
    },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const page = typeof args.page === 'number' ? args.page : 0
      const list = await deps.api.planning.cards.list({
        ...storyHelper.storyQuery(projectOf(args, deps), {
          ...(typeof args.status === 'string' ? { status: args.status } : {}),
          ...(typeof args.area === 'string' ? { area: args.area } : {}),
        }),
        page,
        size: typeof args.size === 'number' ? args.size : STORY_PAGE_SIZE,
        sort: STORY_ORDER,
      })

      const apps = await appsToolHelper.workcardApps(deps, projectOf(args, deps), list.items)

      return ok(storyHelper.renderStories(list.items, list.page ?? page, list.total, apps), list)
    },
  },

  {
    name: 'search_stories',
    title: 'Find a story',
    description:
      'The user stories of a project whose code, title or text match a search term. Use it instead'
      + ' of paging through list_stories when you know what you are looking for.',
    input: { q: z.string().min(1), projectId: z.string().optional() },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const list = await deps.api.planning.cards.list({
        ...storyHelper.storyQuery(projectOf(args, deps), { q: args.q as string }),
        page: 0,
        size: STORY_PAGE_SIZE,
        sort: STORY_ORDER,
      })

      const apps = await appsToolHelper.workcardApps(deps, projectOf(args, deps), list.items)

      return ok(storyHelper.renderStories(list.items, list.page ?? 0, list.total, apps), list)
    },
  },

  {
    name: 'create_story',
    title: 'Add a user story',
    description:
      'Add a story in your own words. The platform rewrites it in the form its pipeline needs and'
      + ' decides which area of the application it belongs to — or, with area, puts it in that area:'
      + ' one of the area keys project_apps lists (guest, user, admin, operator, or an area of the'
      + ' project\'s own such as partners).',
    input: {
      story: z.string().min(1),
      area: z.string().min(1).max(AREA_KEY_MAX).regex(AREA_KEY_PATTERN).optional(),
      projectId: z.string().optional(),
    },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      // Formatting reads the target's file-backed entities before it persists the story. A local
      // project therefore needs its connector back after an MCP restart even though this tool does
      // not itself start a long-running operation.
      await ensureSession(deps, project)
      // The narrative goes as written: rewriting it is the platform's, done on the way in for a
      // person's story. The area too, unless the person named one by its key — then it is theirs, and
      // the platform checks it against the project's areas; a connector never guesses one.
      const receipt = await deps.api.planning.execute({
        action: TransitionAction.Create,
        card: {
          kind: WorkcardKind.Card,
          type: VIABLE_USER_STORY_TYPE,
          parent: project,
          title: args.story as string,
          fields: { primary: false, ...(typeof args.area === 'string' ? { area: args.area } : {}) },
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
    availability: toolHostHelper.anyHost,
    annotations: IDEMPOTENT_WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      const card = await storyHelper.resolveStory(deps, project, args.storyId as string)
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
    availability: toolHostHelper.anyHost,
    annotations: DESTRUCTIVE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      // Removing a story also retires its file-backed scaffold, so it has the same local-session
      // requirement as formatting and development.
      await ensureSession(deps, project)
      const card = await storyHelper.resolveStory(deps, project, args.storyId as string)
      await deps.api.planning.execute({
        card: card.id!,
        action: TransitionAction.Delete,
        cause: 'connector:delete-story',
      }, { wait: true, timeout: COMMIT_WAIT_MS })
      await waitForWorkcardCleanup(deps, project)

      return ok('Story deleted.')
    },
  },

  {
    name: 'develop_story',
    title: 'Implement a user story',
    description:
      'Ask the platform to design and build one story: its screens, its data, its endpoints, its'
      + ' navigation. Stories may extend an existing collection/detail host; editing, deletion and'
      + ' owned children are contextual controls. This takes many minutes. Returns the story status.',
    input: { storyId: z.string(), projectId: z.string().optional() },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      // Development is not a call of its own: it is the story's `start`, and the platform begins the
      // run once that move has COMMITTED — which is also where it is refused (the wrong status,
      // another story in progress, the balance).
      const { card, status } = await storyHelper.transit(
        deps, project, args.storyId as string, ViableWorkcardTransition.Start, 'connector:develop-story',
      )

      return workcardResult(status, card)
    },
  },

  {
    name: 'reset_story',
    title: 'Put a story back to planned',
    description:
      'Move a story back to planned from any status — the manual recovery for a story that failed,'
      + ' is stuck in progress, or was completed and must be developed again. The code already'
      + ' generated for it stays; develop_story starts it again. Returns the story status.',
    input: { storyId: z.string(), projectId: z.string().optional() },
    availability: toolHostHelper.anyHost,
    annotations: IDEMPOTENT_WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      const { card, status } = await storyHelper.transit(
        deps, project, args.storyId as string, ViableWorkcardTransition.Reset, 'connector:reset-story',
      )

      return workcardResult(status, card)
    },
  },

  {
    name: 'complete_story',
    title: 'Mark a story as completed',
    description:
      'Mark a story in progress as completed — for a story whose work is done although its run never'
      + ' recorded it. Only a story in progress can be completed, and nothing is generated or stopped'
      + ' by it. Returns the story status.',
    input: { storyId: z.string(), projectId: z.string().optional() },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      const { card, status } = await storyHelper.transit(
        deps, project, args.storyId as string, ViableWorkcardTransition.Complete, 'connector:complete-story',
      )

      return workcardResult(status, card)
    },
  },

  {
    name: 'story_status',
    title: 'What happened to a story',
    description:
      'One story, its development run, any warning explaining a failure, and whether it is the'
      + ' project\'s landing gate story — the one a guest starts on the guest home.',
    input: { storyId: z.string(), projectId: z.string().optional() },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const card = await storyHelper.resolveStory(deps, project, args.storyId as string)
      const apps = await appsToolHelper.workcardApps(deps, project, [card])

      return workcardResult(await deps.api.story.status(project, card.id!), card, apps.get(card.id ?? card.code ?? ''))
    },
  },

  {
    name: 'start_story_batch',
    title: 'Implement several stories, one after another',
    description:
      'Hand several planned stories to the platform at once — the web application\'s Run all. It first'
      + ' orders them for building (a story comes after the records, screens and navigation it builds on),'
      + ' then implements them one at a time, each exactly as a single development would; a story that'
      + ' fails does not stop the rest. Leave storyIds out for every planned story. Takes many minutes per'
      + ' story and returns the batch — follow it with story_batch_status. For one story, use develop_story.',
    input: {
      storyIds: z.array(z.string().min(1)).min(1).max(WORKCARD_BATCH_MAX).optional().describe(
        'The stories to implement, by code or id — planned ones only. Leave it out for every planned story.'
      ),
      projectId: z.string().optional(),
    },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      // Every story of it is a run with the same connector needs as develop_story's.
      await ensureSession(deps, project)
      // A code is what list_stories prints; the platform keys a batch on card ids.
      const refs = Array.isArray(args.storyIds) ? args.storyIds as string[] : []
      const cards = await Promise.all(refs.map(async ref => await storyHelper.resolveStory(deps, project, ref)))
      const workcards = [...new Set(cards.map(card => card.id!))]
      const view = await deps.api.project.batch.start(project, workcards.length > 0 ? { stories: workcards } : {})

      return batchResult(view, `Batch ${view.id} started over ${view.stories.length} `
        + `${view.stories.length === 1 ? 'story' : 'stories'}: the platform orders them, then implements them one at a time.`)
    },
  },

  {
    name: 'story_batch_status',
    title: 'Where a story batch stands',
    description:
      'The project\'s latest story batch: its stories in implementation order with the reason for each'
      + ' place, which are completed, failed, stopped or still queued, the one in progress, and why it'
      + ' halted when it did.',
    input: { projectId: z.string().optional() },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const view = await deps.api.project.batch.get(project)
      if (view == null) {
        return ok(
          'No story batch has run on this project.\nnext: start_story_batch implements its planned stories one after another',
          { projectId: project, batch: null },
        )
      }

      return batchResult(view)
    },
  },

  {
    name: 'cancel_story_batch',
    title: 'Stop a story batch',
    description:
      'Stop the project\'s running story batch: no further story of it starts, and the story it is'
      + ' implementing now stops at its next step and is ROLLED BACK to where that run started — it'
      + ' returns to planned. Stories it already completed stay. Ask the user first.',
    input: {
      projectId: z.string().optional(),
      confirm: z.boolean().describe(
        'Must be true. The user has to have agreed to stopping the batch and rolling back the story in progress.'
      ),
    },
    availability: toolHostHelper.anyHost,
    annotations: { ...DESTRUCTIVE, idempotentHint: true },
    run: async (args, deps) => {
      if (args.confirm !== true) return fail(controlToolHelper.unconfirmedCancel())
      const project = projectOf(args, deps)
      const view = await deps.api.project.batch.cancel(project)
      const current = view.current != null && view.outcomes[view.current] == null ? view.current : null
      const stopped = current != null && await stopBatchWorkcard(deps, project, current)

      return ok(controlToolHelper.renderCancel(view, stopped), {
        batch: view as unknown as Record<string, unknown>, ...(stopped ? { stopped: current } : {}),
      })
    },
  },

  {
    name: 'list_cards',
    title: 'The work cards of a project',
    description:
      'One page of the project\'s work cards of every type — specs, features, user stories, improvements and'
      + ' tasks — with each one\'s status and the spec or feature it sits in. container lists one spec\'s or'
      + ' feature\'s members. For user stories alone, list_stories reads them the way it always has.',
    input: {
      projectId: z.string().optional(),
      type: z.enum(CARD_RETYPE_WORDS).optional().describe('Only cards of this type.'),
      status: z.string().optional().describe('Only cards in this status (planned, in-progress, completed, failed).'),
      container: z.string().optional().describe('A spec\'s or a feature\'s code or id: only its members.'),
      page: z.number().int().min(0).optional(),
    },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const page = typeof args.page === 'number' ? args.page : 0
      const container = typeof args.container === 'string' && args.container.trim() !== ''
        ? (await cardsToolHelper.resolveCard(deps, project, args.container.trim())).id!
        : undefined
      const list = await deps.api.planning.cards.list({
        ...cardsToolHelper.cardQuery(project, {
          ...(typeof args.type === 'string' ? { type: cardsToolHelper.typeOf(args.type).type } : {}),
          ...(typeof args.status === 'string' ? { status: args.status } : {}),
          ...(container != null ? { container } : {}),
        }),
        page,
        size: CARD_PAGE_SIZE,
        sort: STORY_ORDER,
      })
      // The containers the page's members sit in, by code: those on the page, then one read for the rest.
      const codes = new Map(list.items.map(item => [item.id!, item.code ?? item.id!]))
      const missing = [...new Set(list.items.map(item => viableWorkHelper.containerIdOf(item))
        .filter((id): id is string => id != null && !codes.has(id)))]
      if (missing.length > 0) {
        const held = await deps.api.planning.cards.list({ ids: missing, size: missing.length }).catch(() => null)
        for (const item of held?.items ?? []) codes.set(item.id!, item.code ?? item.id!)
      }

      return ok(cardsToolHelper.renderCards(list.items, list.page ?? page, list.total, codes), {
        projectId: project, total: list.total, page: list.page ?? page, cards: list.items,
      })
    },
  },

  {
    name: 'create_card',
    title: 'Add a work card',
    description:
      'Add a card in your own words: a spec (several cards built together in one run), a feature (one capability'
      + ' for one role), a user story, an improvement (a change to what exists) or a task (configuration,'
      + ' secrets, a data change — no code). With type auto the platform decides the type. The platform files the'
      + ' title the way its pipeline needs and checks the text, a short model call that spends credits. cards moves'
      + ' existing cards into a new spec or feature; inputs names what a task needs — never a value: a secret is'
      + ' typed by the user into the task\'s secure input in the web application. Each call adds another card.',
    input: {
      projectId: z.string().optional(),
      type: z.enum(CARD_TYPE_WORDS).describe('auto lets the platform decide; otherwise the type you name is kept.'),
      title: z.string().min(1).max(WORK_NAME_MAX),
      description: z.string().max(WORK_TEXT_MAX).optional(),
      cards: z.array(z.string().min(1)).min(1).max(CONNECT_CARDS_TOGETHER_MAX).optional().describe(
        'For a spec or a feature: existing cards (codes or ids) to move in as its members.'
      ),
      inputs: z.array(z.object({
        name: z.string().min(1).max(WORK_NAME_MAX),
        secret: z.boolean().describe('A secret is never sent here: the user types it into the task\'s secure input.'),
        note: z.string().max(CARD_INPUT_NOTE_MAX).optional(),
      })).min(1).max(CARD_INPUTS_MAX).optional().describe('For a task: the variables and secrets it needs, by name only.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const inputs = Array.isArray(args.inputs) ? args.inputs as CardInput[] : []
      // Inputs make a task whatever else was said; any other explicit type keeps its own word.
      const choice = inputs.length > 0 && args.type === 'auto'
        ? cardsToolHelper.typeOf('task')
        : cardsToolHelper.typeOf(args.type as string)
      if (inputs.length > 0 && choice.type !== VIABLE_TASK_TYPE) {
        return fail('Not done: inputs belong to a task — create it with type task (or auto), or leave inputs out.')
      }
      const refs = Array.isArray(args.cards) ? args.cards as string[] : []
      if (refs.length > 0 && !VIABLE_CONTAINER_TYPES.includes(choice.type)) {
        return fail('Not done: only a spec or a feature holds cards — create it with type spec or feature, or leave cards out.')
      }
      // Formatting reads the target's file-backed entities: a local project needs its connector attached.
      await ensureSession(deps, project)
      const members = await Promise.all(refs.map(async ref => await cardsToolHelper.resolveCard(deps, project, ref)))
      const description = cardsToolHelper.describe(typeof args.description === 'string' ? args.description : undefined, inputs)
      const receipt = await deps.api.planning.execute({
        action: TransitionAction.Create,
        card: {
          kind: WorkcardKind.Card,
          type: choice.type,
          parent: project,
          title: args.title as string,
          ...(description != null ? { description } : {}),
          // A named type is the person's choice; auto asks the platform's type check to decide it.
          fields: {
            ...(choice.type === VIABLE_USER_STORY_TYPE ? { primary: false } : {}),
            typeBy: choice.auto ? ViableTypeBy.Auto : ViableTypeBy.Person,
          },
        },
        cause: 'connector:create-card',
      }, { wait: true, timeout: COMMIT_WAIT_MS })
      const card = receipt.card
      const moved: string[] = []
      if (card?.id != null) {
        for (const member of members) {
          if (member.id === card.id) continue
          await deps.api.planning.execute({
            card: member.id!, action: TransitionAction.Update, changes: { parents: [project, card.id] },
            expectSeq: member.head ?? member.seq, cause: 'connector:create-card',
          }, { wait: true, timeout: COMMIT_WAIT_MS })
          moved.push(member.code ?? member.id!)
        }
      }
      const filed = card != null ? `${cardsToolHelper.wordOf(card.type)} ${card.code ?? card.id}` : 'card'
      const secrets = inputs.filter(input => input.secret).map(input => input.name)

      return ok([
        `Created the ${filed}${choice.auto ? ' — the platform decided its type' : ''}.`,
        ...(moved.length > 0 ? [`Moved in: ${moved.join(', ')}.`] : []),
        ...(secrets.length > 0 ? [`When it runs, the task asks for ${secrets.join(', ')} through its secure input: the user`
          + ' types each value in the web application (card_status gives the link) — never into this conversation.'] : []),
        `next: card_status { "projectId": "${project}", "cardId": "${card?.id ?? ''}" } — run_card starts it`,
      ].join('\n'), { card: card ?? receipt.transition, ...(moved.length > 0 ? { moved } : {}) })
    },
  },

  {
    name: 'update_card',
    title: 'Reword a work card or decide its proposals',
    description:
      'Change what a card says — its title or description; the platform files the new title the way its pipeline'
      + ' needs and checks the type again, a short model call that spends credits. proposals accepts or dismisses'
      + ' what the platform proposed on the card (card_status lists them). Its status is not changed — run_card does that.',
    input: {
      projectId: z.string().optional(),
      cardId: z.string().min(1),
      title: z.string().min(1).max(WORK_NAME_MAX).optional(),
      description: z.string().max(WORK_TEXT_MAX).optional(),
      proposals: z.array(z.object({
        id: z.string().min(1).max(32),
        decision: z.enum(['accept', 'dismiss']),
      })).min(1).max(32).optional().describe('Proposals by id, each accepted or dismissed.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: IDEMPOTENT_WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const title = typeof args.title === 'string' ? args.title : undefined
      const description = typeof args.description === 'string' ? args.description : undefined
      const decisions = Array.isArray(args.proposals) ? args.proposals as Array<{ id: string, decision: 'accept' | 'dismiss' }> : []
      if (title == null && description == null && decisions.length === 0) {
        return fail('Not done: name a title, a description or proposals to decide.')
      }
      await ensureSession(deps, project)
      let card = await cardsToolHelper.resolveCard(deps, project, args.cardId as string)
      const said: string[] = []
      if (title != null || description != null) {
        // Guarded by the head the card was read at: a change somebody made in between is refused, never overwritten.
        const receipt = await deps.api.planning.execute({
          card: card.id!, action: TransitionAction.Update,
          changes: { ...(title != null ? { title } : {}), ...(description != null ? { description } : {}) },
          expectSeq: card.head ?? card.seq, cause: 'connector:update-card',
        }, { wait: true, timeout: COMMIT_WAIT_MS })
        card = (receipt.card as AnyViableWorkCard | undefined) ?? card
        said.push(`Card ${card.code ?? card.id} updated.`)
      }
      if (decisions.length > 0) {
        const document = await deps.api.planning.specifications.current(card.id!, ViableSpecCategory.Proposals)
        const body = document?.body != null ? JSON.parse(document.body) as WorkProposals : null
        const known = new Set((body?.items ?? []).map(item => item.id))
        const unknown = decisions.filter(decision => !known.has(decision.id)).map(decision => decision.id)
        if (document == null || body == null || unknown.length > 0) {
          return fail(`Not done: ${unknown.length > 0 ? `no proposal ${unknown.join(', ')} on` : 'no proposals on'} card`
            + ` ${card.code ?? card.id} — card_status lists them.`)
        }
        const decided = new Map(decisions.map(decision => [decision.id, decision.decision === 'accept' ? WorkProposalStatus.Accepted : WorkProposalStatus.Dismissed]))
        // Only an existing proposal's status changes — everything else of the document stays as the platform wrote it.
        const next: WorkProposals = { ...body, items: body.items.map(item => decided.has(item.id) ? { ...item, status: decided.get(item.id)! } : item) }
        await deps.api.planning.execute({
          card: document.id!, action: TransitionAction.Update, changes: { body: JSON.stringify(next) },
          expectSeq: document.head ?? document.seq, cause: 'connector:update-card',
        }, { wait: true, timeout: COMMIT_WAIT_MS })
        said.push(`Proposals decided: ${decisions.map(decision => `${decision.id} ${decision.decision === 'accept' ? 'accepted' : 'dismissed'}`).join(', ')}.`)
      }

      return ok(said.join('\n'), { card })
    },
  },

  {
    name: 'retype_card',
    title: 'Change a card\'s type',
    description:
      'Make a planned card another type — say a user story that is really a feature, or an improvement that is'
      + ' really a task. It gets a new code (the old one is kept as a former code), and the type you name is kept'
      + ' until its text changes again. Refused once the generated code holds pieces the card owns.',
    input: {
      projectId: z.string().optional(),
      cardId: z.string().min(1),
      type: z.enum(CARD_RETYPE_WORDS),
    },
    availability: toolHostHelper.anyHost,
    annotations: IDEMPOTENT_WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const card = await cardsToolHelper.resolveCard(deps, project, args.cardId as string)
      const toType = cardsToolHelper.typeOf(args.type as string).type
      if (card.type === toType) {
        return ok(`Card ${card.code ?? card.id} already is a ${cardsToolHelper.wordOf(toType)}.`, { card })
      }
      // The fields fitted to the new type, and the type marked as the person's choice.
      const fields = viableWorkHelper.fieldsFor(toType, { ...card.fields, typeBy: ViableTypeBy.Person })
      const receipt = await deps.api.planning.execute({
        card: card.id!, action: TransitionAction.Retype, toType,
        changes: { fields }, unset: viableWorkHelper.unsetFor(toType, card.fields),
        expectSeq: card.head ?? card.seq, cause: 'connector:retype-card',
      }, { wait: true, timeout: COMMIT_WAIT_MS })
      const retyped = receipt.card ?? card

      return ok(`Card ${card.code ?? card.id} is now the ${cardsToolHelper.wordOf(toType)} ${retyped.code ?? retyped.id}.`, { card: retyped })
    },
  },

  {
    name: 'run_card',
    title: 'Run a work card',
    description:
      'Start one card: a user story is designed and built; a spec builds all its members together in one run; a'
      + ' feature or an improvement runs a planned set of steps; a task carries out its configuration or data'
      + ' change. It takes many minutes and spends credits — a spec or a feature needs the 100,000-credit floor (a'
      + ' spec on the Pro plan may use its free spec of the month instead), an improvement or a task a positive'
      + ' balance; nothing new starts while the organization is in debt. A card already running is refused;'
      + ' calling it again after its run ended starts it again and spends again. Returns the card status.',
    input: { projectId: z.string().optional(), cardId: z.string().min(1) },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      const card = await cardsToolHelper.resolveCard(deps, project, args.cardId as string)
      // A card's run is its `start`: the platform begins it once the move COMMITS, and refuses it there (the
      // flow, one run per project, the balance of the card's type).
      try {
        await deps.api.planning.execute({
          card: card.id!, action: TransitionAction.Transit, transition: ViableWorkcardTransition.Start, cause: 'connector:run-card',
        }, { wait: true, timeout: COMMIT_WAIT_MS })
      } catch (e) {
        if (!(e instanceof CommitTimeout)) throw e
        deps.log(`run_card: the start of ${card.code ?? card.id} has not committed yet; answering from card status`)
      }

      return await cardStatusResult(deps, project, card.id!, `Started the ${cardsToolHelper.wordOf(card.type)} ${card.code ?? card.id}.`)
    },
  },

  {
    name: 'run_cards_together',
    title: 'Build several cards together',
    description:
      'Put several planned cards into ONE new spec and start it: they are designed and built together in one run,'
      + ' sharing what they need — usually cheaper and faster than one at a time. Spends credits like any spec (the'
      + ' 100,000-credit floor, or the Pro plan\'s free spec of the month). Calling it again with the same cards'
      + ' finds the same spec again. Returns the spec\'s status.',
    input: {
      projectId: z.string().optional(),
      cards: z.array(z.string().min(1)).min(1).max(CONNECT_CARDS_TOGETHER_MAX).describe('The cards, by code or id — planned or failed ones in no spec.'),
      title: z.string().min(1).max(WORK_NAME_MAX).optional().describe('The new spec\'s title; drawn from its cards when left out.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      const cards = await Promise.all((args.cards as string[]).map(async ref => await cardsToolHelper.resolveCard(deps, project, ref)))
      const ids = [...new Set(cards.map(card => card.id!))]
      try {
        const view = await deps.api.cards.together(project, { cards: ids, start: true, ...(typeof args.title === 'string' ? { title: args.title } : {}) })

        return await cardStatusResult(deps, project, view.spec, cardsToolHelper.renderTogether(view), { together: view })
      } catch (e) {
        if (cardsToolHelper.routeMissing(e)) return fail(CARDS_UNSUPPORTED)
        throw e
      }
    },
  },

  {
    name: 'run_all_cards',
    title: 'Run every loose card',
    description:
      'The web application\'s Run all for cards: without confirm it answers where the platform would place every'
      + ' loose planned card — into the existing spec or feature it most fittingly continues, or into one new spec'
      + ' together with the other cards it belongs with; a card that fits nothing runs on its own (it is never put'
      + ' alone into a spec) — and starts nothing. With confirm: true it applies that placement and starts them one'
      + ' after another, the existing specs first, the new spec next and the cards on their own last, each start'
      + ' spending credits like run_card. Ask the user before confirming; calling it again with confirm starts'
      + ' another round.',
    input: {
      projectId: z.string().optional(),
      confirm: z.boolean().optional().describe('Set true ONLY after the user agreed to the placement this tool answered without it.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const memo = cardsPlanMemoOf(deps.api)
      try {
        if (args.confirm !== true) {
          const view = await deps.api.cards.plan(project)
          memo.remember(project, view)

          return ok(cardsToolHelper.renderPlan(project, view), { projectId: project, plan: view })
        }
        await ensureSession(deps, project)
        // The placement the user agreed to, where this host still holds it; else the platform plans again.
        const view = memo.recall(project) ?? await deps.api.cards.plan(project)
        if (view.assignment.placements.length === 0 && (view.assignment.loose ?? []).length === 0) {
          return ok(cardsToolHelper.renderPlan(project, view), { projectId: project, plan: view })
        }
        const batch = await deps.api.cards.runAll(project, { assignment: view.assignment })
        memo.forget(project)

        return ok(cardsToolHelper.renderRunAll(batch), { projectId: project, plan: view, batch: batch as unknown as Record<string, unknown> })
      } catch (e) {
        if (cardsToolHelper.routeMissing(e)) return fail(CARDS_UNSUPPORTED)
        throw e
      }
    },
  },

  {
    name: 'rerun_card',
    title: 'Run a spec\'s or a feature\'s cards again',
    description:
      'Start a spec or a feature again for exactly some of the cards inside it: scope failed builds only the ones that'
      + ' failed, scope unfinished every one not completed (planned or failed); the completed ones are left as they'
      + ' are, on every step. It takes many minutes and spends credits like run_card for a spec or a feature — the'
      + ' 100,000-credit floor (a spec on the Pro plan may use its free spec of the month instead); nothing new starts'
      + ' while the organization is in debt. Refused when nothing matches, while the card runs or while one of its'
      + ' cards runs on its own; calling it again after its run ended starts it again and spends again. Returns the'
      + ' card status.',
    input: {
      projectId: z.string().optional(),
      cardId: z.string().min(1).describe('The spec or the feature, by code or id.'),
      scope: z.enum(CARD_RERUN_SCOPES).describe('failed — only the cards inside it that failed; unfinished — every one not completed.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      const card = await cardsToolHelper.resolveCard(deps, project, args.cardId as string)
      try {
        // The container's own Start for exactly those cards: the platform's rules, its gate and its billing.
        const view = await deps.api.cards.rerun(project, { card: card.id!, scope: args.scope as typeof CARD_RERUN_SCOPES[number] })

        return await cardStatusResult(deps, project, card.id!, cardsToolHelper.renderRerun(view, card))
      } catch (e) {
        if (cardsToolHelper.routeMissing(e)) return fail(CARDS_UNSUPPORTED)
        throw e
      }
    },
  },

  {
    name: 'card_status',
    title: 'Where a work card stands',
    description:
      'One card of any type: its status, a spec\'s or a feature\'s members, its plan, the proposals still open, a'
      + ' task\'s inputs as set or missing with the link where the user types a secret, its run and any question it'
      + ' waits on.',
    input: { projectId: z.string().optional(), cardId: z.string().min(1) },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const card = await cardsToolHelper.resolveCard(deps, project, args.cardId as string)

      return await cardStatusResult(deps, project, card.id!)
    },
  },

  {
    name: 'delete_card',
    title: 'Remove a work card',
    description:
      'Delete a card that is not running and has not been built. A spec or a feature that still holds cards is'
      + ' refused — take its members out first. A user story\'s placeholder screens are retired.',
    input: { projectId: z.string().optional(), cardId: z.string().min(1) },
    availability: toolHostHelper.anyHost,
    annotations: DESTRUCTIVE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      // A user story's delete retires its file-backed scaffold: the local session must be there.
      await ensureSession(deps, project)
      const card = await cardsToolHelper.resolveCard(deps, project, args.cardId as string)
      await deps.api.planning.execute({ card: card.id!, action: TransitionAction.Delete, cause: 'connector:delete-card' }, { wait: true, timeout: COMMIT_WAIT_MS })
      await waitForWorkcardCleanup(deps, project)

      return ok(`Card ${card.code ?? card.id} deleted.`, { deleted: true, card: { id: card.id, code: card.code } })
    },
  },

  {
    name: 'modify_project',
    title: 'Ask the agent for an open-ended change',
    description:
      'Describe a change in words and let the platform decide what it is: a question is answered by reading the'
      + ' project and changes nothing, a small fix (a wording, a colour, one bug) is made by the platform\'s own'
      + ' coding agent at once, and anything bigger is filed as cards of the right type on the board and reported'
      + ' here — started only when the request asks for it to be done now. To rename the product, use'
      + ' rename_project. Returns project status.',
    input: { prompt: z.string().min(1), projectId: z.string().optional() },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)

      // The triaging route first; an older platform answers the released open-ended change, exactly as before.
      // Attended: the triage may wait for the preview to wake, so an identical repeat collects what it became.
      return await attendedCallHelper.attend(deps, {
        tool: 'modify_project', args, waitMs: REQUEST_ANSWER_MS,
        run: async () => {
          const outcome = await requestToolOf(deps.api).ask(project, args.prompt as string)
          if (outcome.view == null) return projectResult(outcome.status!)
          const status = await deps.api.project.status(project)

          return ok(`${cardsToolHelper.renderRequest(outcome.view)}\n\n${statusTextHelper.renderProjectStatus(status)}`, {
            project: status as unknown as Record<string, unknown>, request: outcome.view,
          })
        },
        pending: async rejoinable => {
          const status = await deps.api.project.status(project)

          return ok('The platform is still reading the request — what it files or changes shows in project_activity'
            + ' and list_cards.'
            + (rejoinable ? ' Calling modify_project again with the same prompt waits on this request rather than sending another.' : '')
            + `\n\n${statusTextHelper.renderProjectStatus(status)}`, { project: status as unknown as Record<string, unknown> })
        },
      })
    },
  },

  {
    name: 'steer_agent',
    title: 'Send the running agent a message',
    description:
      'Add a message to the open-ended change the platform\'s agent is making right now (modify_project,'
      + ' rename_project) — a correction, a detail, a priority. It is checked like any prompt, read before'
      + ' the agent\'s next model call, and the agent goes on from there. Only a running open-ended change'
      + ' takes messages; to ask for a new change, use modify_project.',
    input: { prompt: z.string().min(1).max(AGENT_STEER_PROMPT_MAX), projectId: z.string().optional() },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      // The content check is a model call, the delegating session's parent's to perform.
      await ensureSession(deps, project)
      const result = await deps.api.project.steer(project, { prompt: args.prompt as string })

      return ok(controlToolHelper.renderSteer(project, result), { projectId: project, ...result })
    },
  },

  {
    name: 'rename_project',
    title: 'Rename the project',
    description:
      'Give the product a new name. The platform renames the project record, restates the name in'
      + ' its specification and vision, and its coding agent restates it through the app\'s code'
      + ' (titles, copy, docs). The project\'s web address does not change. A new name is paid like'
      + ' an open-ended change; a new description alone is free. Returns project status.',
    input: {
      name: z.string().min(1).max(128),
      description: z.string().min(1).max(2048).optional(),
      projectId: z.string().optional(),
    },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      return projectResult(await deps.api.project.rename(
        project, args.name as string, args.description as string | undefined,
      ))
    },
  },

  {
    name: 'delete_project',
    title: 'Delete a project',
    description:
      'Delete a project and everything it owns: its preview and production workloads, its user'
      + ' stories and documents, its configuration and secrets, and its connector sessions. This'
      + ' CANNOT be undone — ask the user first. The project is always named: the attached one is'
      + ' never deleted by default.',
    input: {
      projectId: z.string().min(1).describe('The project to delete — always named explicitly.'),
      confirm: z.boolean().describe('Must be true. The user has to have agreed to deleting this project.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: DESTRUCTIVE,
    run: async (args, deps) => {
      if (args.confirm !== true) {
        return fail(
          'Not done. Deleting a project removes its workloads, stories, documents and configuration,'
          + ' and cannot be undone. Ask the user, then call it again with confirm: true.'
        )
      }
      const project = typeof args.projectId === 'string' && args.projectId !== '' ? args.projectId : null
      if (project == null) {
        return fail('Not done. Name the project to delete with projectId — list_projects shows them.')
      }
      // A connector attached to the project says goodbye first: nothing may be delivered to a
      // project that is going away, and the session would otherwise outlive what it answers for.
      if (toolHostHelper.sessionCapable(deps.host) && deps.attached() === project) {
        if (deps.release != null) {
          await deps.release()
        } else {
          await deps.currentSession()?.close()
        }
        deps.detach?.()
      }
      const deleted = await deps.api.project.destroy(project)

      return ok(
        `Deleted ${deleted.name} (${deleted.id}).`
        + (deps.host.target === ConnectTarget.Local
          ? ' The files on this machine are kept; the .viable directory still names the deleted project.'
          : ''),
        { project: deleted as unknown as Record<string, unknown> },
      )
    },
  },

  {
    name: 'stop_agent',
    title: 'Stop what the agent is doing',
    description:
      'Stop the run the platform\'s agent works on now — the web application\'s Stop. A story being'
      + ' implemented stops at its next step and is ROLLED BACK to where that run started (it returns to'
      + ' planned); an open-ended change (modify_project, rename_project) stops once the model\'s current'
      + ' answer arrives and ends with a short summary, its edits kept; scope batch also cancels the story'
      + ' batch. Every stop but scope run needs the user\'s agreement (confirm: true).',
    input: {
      scope: z.enum(STOP_SCOPES).optional().describe(
        'run — an open-ended change: it stops and keeps its edits; story — the story in progress, rolled back;'
        + ' batch — the story batch: no further story starts and the story in progress is rolled back. Leave it'
        + ' out to stop whatever runs.'
      ),
      storyId: z.string().optional().describe(
        'The story in progress a story stop is meant for, by code or id — refused when another one is in progress.'
      ),
      confirm: z.boolean().optional().describe(
        'Must be true for every scope but run: the user has to have agreed to rolling the story back.'
      ),
      projectId: z.string().optional(),
    },
    availability: toolHostHelper.anyHost,
    annotations: { ...DESTRUCTIVE, idempotentHint: true },
    run: async (args, deps) => {
      const scope = (STOP_SCOPES as readonly string[]).includes(args.scope as string)
        ? args.scope as AgentStopScope : undefined
      if (controlToolHelper.stopNeedsConfirm(scope) && args.confirm !== true) {
        return fail(controlToolHelper.unconfirmedStop(scope))
      }
      const project = projectOf(args, deps)
      const workcardId = typeof args.storyId === 'string' && args.storyId.trim() !== ''
        ? (await storyHelper.resolveStory(deps, project, args.storyId.trim())).id!
        : undefined
      const lock = await deps.api.project.stop(project, {
        ...(scope != null ? { scope } : {}),
        ...(workcardId != null ? { storyId: workcardId } : {}),
        ...(args.confirm === true ? { confirm: true } : {}),
      })

      return ok(controlToolHelper.renderStop(project, lock, scope), {
        projectId: project, lock: lock as unknown as Record<string, unknown>,
      })
    },
  },

  {
    name: 'pipeline_status',
    title: 'Where a run stopped',
    description: 'The steps a run completed and the one it stopped at.',
    input: { runId: z.string(), projectId: z.string().optional() },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
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
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
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
      'In the delegated mode every model call the platform makes for this session is yours to'
      + ' perform — project drafting, content checks and formatting included. Returns one task with'
      + ' instructions for running it in a clean subagent, or says there is nothing yet, and reports'
      + ' any tool call that finished after it answered with a task. Call it whenever a domain status'
      + ' says it is waiting for a model task, and keep calling until it says none.',
    input: {
      maxWaitSec: z.number().int().min(0).max(45).optional(),
      taskId: z.string().optional()
        .describe('Re-read a task you were already given, if you lost its text.'),
    },
    // Only where this session performs the platform's model calls: in the cloud mode the platform
    // performs every one of them, a conversion's included, and there is never a task to collect.
    availability: toolHostHelper.performsModelTasks,
    annotations: WRITE,
    run: async (args, deps) => {
      const session = await deps.session()

      // Asking for one by id re-reads it rather than taking a new one. A task is handed out once
      // and the platform waits on it for up to 45 minutes, so a parent that lost the envelope —
      // a compacted conversation, a subagent that died before answering — otherwise has no way
      // back to it and the run waits until the deadline for no reason.
      if (typeof args.taskId === 'string') {
        const known = session.taskById(args.taskId)
        if (known == null) {
          if (session.taskWithdrawn?.(args.taskId) === true) return fail(`Task ${args.taskId} ${TASK_WITHDRAWN}`)

          return fail(`No task ${args.taskId} is outstanding. Call next_task with no id.`)
        }

        return ok(makeTaskEnvelopeModel(known).renderTaskEnvelope({ harness: deps.host.harness }), { taskId: known.id })
      }

      const wait = Math.min(((args.maxWaitSec as number) ?? 30) * 1000, NEXT_TASK_WAIT_MS)
      // A tool that answered with a task left its call running; its result is told here, beside
      // the next task, whichever comes first.
      const handover = makeHandoverHelper(deps)
      if (handover.pending()) {
        const reported = handover.report(await handover.collect(session, wait))
        if (reported != null) return reported
      }
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

      return ok(makeTaskEnvelopeModel(task).renderTaskEnvelope({ harness: deps.host.harness }), { taskId: task.id })
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
    availability: toolHostHelper.performsModelTasks,
    annotations: WRITE,
    run: async (args, deps) => {
      const session = await deps.session()
      const pending = session as unknown as { taskById?: (id: string) => unknown, taskWithdrawn?: (id: string) => boolean }
      const task = pending.taskById?.(args.taskId as string) as never
      if (task == null) {
        // Its deadline passed: the platform withdrew the operation and would settle nothing with it.
        if (pending.taskWithdrawn?.(args.taskId as string) === true) return fail(`Task ${String(args.taskId)} ${TASK_WITHDRAWN}`)

        return fail(`No task ${String(args.taskId)} is waiting. Call next_task for the current one.`)
      }

      const { result, problem } = makeTaskEnvelopeModel(task).parseTaskResult(args.result)
      if (problem != null) {
        // Refused HERE, with the subagent's context still open — a malformed answer that reached
        // the platform would cost a whole new task, a new subagent and another wait.
        return fail(problem)
      }
      await session.submitTask(result!)
      // The answer may be what a tool's call was blocked on: its result — or the next model call
      // it waits on — is this tool's reply.
      const handover = makeHandoverHelper(deps)
      if (handover.pending()) {
        const reported = handover.report(await handover.collect(session, HANDOVER_WAIT_MS), 'Accepted.')
        if (reported != null) return reported
      }
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
    availability: toolHostHelper.sessionCapable,
    annotations: WRITE,
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
    availability: toolHostHelper.sessionCapable,
    annotations: WRITE,
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

      const { answer, problem } = makeQuestionEnvelopeModel(inquiry).parseAnswer(args)
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
        // The answer resumes a parked run, whose model calls in the delegated mode go to the
        // project's live session — so it is attached before the platform is told.
        if (toolHostHelper.performsModelTasks(deps.host)) await ensureSession(deps, project)
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
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
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
      + ` each stage. ${CONVERT_CHOICE_SAID} ${CONVERSION_COST}`,
    input: {
      projectId: z.string().optional().describe('Convert into a project that already exists.'),
      name: z.string().optional(),
      about: z.string().optional().describe('What the application is for, in your own words.'),
      repoUrl: z.string().optional()
        .describe('A GitHub repository to convert. Named, it is converted rather than this directory.'),
      branch: z.string().optional(),
      ...CHOICE_INPUT,
      confirm: CONFIRM_INPUT,
    },
    availability: toolHostHelper.anyHost,
    annotations: { ...WRITE, openWorldHint: true },
    run: async (args, deps) => await answering(deps, 'convert_project', async () => {
      const confirm = args.confirm === true
      // The start is what spends the plan's conversion, so it is the call a confirmation stops —
      // repeated with the project named, never by filing the conversion again.
      const start = async (projectId: string): Promise<ToolResult> => await confirming(
        deps, 'convert_project', { projectId }, confirm,
        async () => await deps.api.convert.start(projectId, confirm ? { confirm } : {}),
      )
      // The blueprint and case are the conversion's from its filing on: they travel on the create with the
      // choice, and a call that cannot carry them files nothing rather than dropping them.
      const chosen = structureToolHelper.choiceOf(args)
      const named = typeof args.projectId === 'string' ? args.projectId : deps.attached()
      if (named != null) {
        if (chosen.asked) {
          return fail(`Project ${named} is filed already, and its blueprint and case were settled when it was:`
            + ' nothing was started. Call convert_project again without blueprint, case, bot_platforms and'
            + ' tenancy to convert it, or detach and name a repository to file a new conversion with them.')
        }
        await ensureSession(deps, named)

        return await start(named)
      }
      if (chosen.asked && typeof deps.api.convert.createWithChoice !== 'function') {
        return fail(CHOICE_UNSUPPORTED('convert_project', 'filed'))
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

      // Nothing is attached here, so the session is an unattached one: in the delegated mode the
      // platform hands it the checks it runs before the project exists.
      const sessionId = toolHostHelper.performsModelTasks(deps.host) ? await unattachedSessionId(deps) : undefined
      const body: ConnectConvertCreateBody = {
        ...(sessionId != null ? { sessionId } : {}),
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
      }
      let status: ConversionStatusView
      if (chosen.asked) {
        try {
          status = await deps.api.convert.createWithChoice!({ ...body, ...chosen.choice })
        } catch (e) {
          if (structureToolHelper.routeMissing(e)) return fail(CHOICE_UNSUPPORTED('convert_project', 'filed'))
          throw e
        }
      } else {
        status = await deps.api.convert.create(body)
      }
      deps.attach(status.projectId)
      await ensureSession(deps, status.projectId)

      return await start(status.projectId)
    }),
  },

  {
    name: 'proceed_conversion',
    title: 'Decide what a conversion does next',
    description:
      'A conversion stops after each stage and waits for a decision: analyze what was read,'
      + ' extract the user stories, implement them, leave it as it stands, retry a stage that'
      + ' failed, or cancel. With the decision that starts the extraction it also takes the user\'s'
      + ' edits to the name, description, specification, vision and design system the analysis'
      + ' drafted — refused with any other decision. Returns the conversion status. A stage the'
      + ` conversion limit still covers runs at once. ${CONVERSION_COST}`,
    input: {
      decision: z.enum(Object.values(ConversionDecision) as [string, ...string[]]),
      projectId: z.string().optional(),
      note: z.string().optional().describe('What the user said about the decision. Recorded.'),
      confirm: CONFIRM_INPUT,
      name: z.string().min(1).max(128).optional().describe(updateInput('The project\'s new name')),
      description: z.string().optional().describe(updateInput('The project\'s new one-line description')),
      specification: z.string().optional().describe(updateInput('The edited specification')),
      vision: z.string().optional().describe(updateInput('The edited vision')),
      designSystem: z.string().optional().describe(updateInput('The edited design system')),
    },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => await answering(deps, 'proceed_conversion', async () => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      const decision = args.decision as ConversionDecision
      const note = typeof args.note === 'string' ? args.note : undefined
      const confirm = args.confirm === true
      // The person's edits travel only where they were given, and only as the fields they named.
      const update = Object.fromEntries(PROCEED_UPDATE_FIELDS
        .filter(field => typeof args[field] === 'string')
        .map(field => [field, args[field] as string]))
      const edited = Object.keys(update).length > 0

      return await confirming(
        deps, 'proceed_conversion', {
          projectId: project, decision, ...(note != null ? { note } : {}), ...update,
        }, confirm,
        async () => await deps.api.convert.proceed(project, {
          decision, ...(note != null ? { note } : {}), ...(confirm ? { confirm } : {}),
          ...(edited ? { update } : {}),
        }),
      )
    }),
  },

  {
    name: 'conversion_status',
    title: 'Where a conversion stands',
    description:
      'The stage a conversion has reached, what it found, what it has cost so far, whether the'
      + ' original sources are still there, and what to call next.',
    input: { projectId: z.string().optional() },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
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
    availability: toolHostHelper.anyHost,
    annotations: DESTRUCTIVE,
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
    description:
      'What the platform generated, for a project whose sources live in its own slot. By default the'
      + ' source files; kind "stories" lists the user-story documents, "meta" the specifications kept'
      + ' beside the sources (narrowed by category: ba, ux or ui), "all" every metadata document —'
      + ' docs/, .agents/ and those specifications. read_file reads any path listed.',
    input: {
      projectId: z.string().optional(),
      kind: z.enum([SOURCES_KIND, ...Object.values(MetadataListKind)] as [string, ...string[]]).optional()
        .describe('sources (default), stories, meta or all.'),
      category: z.enum(Object.values(SpecCategory) as [string, ...string[]]).optional()
        .describe('With kind "meta" only: the analysis (ba), experience (ux) or interface (ui) specifications.'),
    },
    availability: toolHostHelper.cloudTarget,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const kind = typeof args.kind === 'string' ? args.kind : SOURCES_KIND
      if (kind === SOURCES_KIND) {
        const files = await deps.api.files.list(project)

        return ok(
          files.length > 0
            ? `${files.length} generated file(s):\n${files.join('\n')}`
            : 'No generated files were found.',
          { projectId: project, total: files.length, files }
        )
      }
      const category = kind === MetadataListKind.Meta && typeof args.category === 'string'
        ? args.category as SpecCategory : undefined
      const files = await deps.api.files.meta(project, {
        kind: kind as MetadataListKind, ...(category != null ? { category } : {}),
      })

      return ok(
        files.length > 0
          ? `${files.length} ${kind} document(s)${category != null ? ` (${category})` : ''}:\n${files.join('\n')}`
          : `No ${kind} documents were found.`,
        { projectId: project, kind, ...(category != null ? { category } : {}), total: files.length, files }
      )
    },
  },

  {
    name: 'read_file',
    title: 'Read one generated file',
    description:
      'The content of one file of a project whose sources live in its own slot — any path list_files'
      + ' prints, sources and metadata documents alike.',
    input: {
      projectId: z.string().optional(),
      path: z.string().min(1).max(512).describe('The path relative to the project root, as list_files prints it.'),
    },
    availability: toolHostHelper.cloudTarget,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const path = pathOf(args)
      if (path == null) return fail('Name the file with path — list_files shows them.')
      const project = projectOf(args, deps)
      const file = await deps.api.files.get(project, path)
      const truncated = file.content.length > FILE_READ_CAP

      return ok(
        truncated
          ? `${file.content.slice(0, FILE_READ_CAP)}\n\n[${path}: the first ${FILE_READ_CAP} of ${file.content.length} characters]`
          : file.content,
        { projectId: project, path, length: file.content.length, ...(truncated ? { truncated } : {}) }
      )
    },
  },

  {
    name: 'write_file',
    title: 'Write one generated file',
    description:
      'Replace one file\'s whole content in a project whose sources live in its own slot (a new path'
      + ' creates the file), exactly as the web editor saves it: the content is checked, the file is'
      + ' written and the preview is rebuilt. A build that fails leaves the last good preview serving'
      + ' and says why; the write stands either way. Files that decide how the project builds and'
      + ' starts (manifests, build configuration) are refused. For a change that spans many files,'
      + ' modify_project lets the platform\'s own coding agent make it.',
    input: {
      projectId: z.string().optional(),
      path: z.string().min(1).max(512).describe('The path relative to the project root.'),
      content: z.string().describe('The whole new content of the file.'),
    },
    availability: toolHostHelper.cloudTarget,
    annotations: { ...DESTRUCTIVE, idempotentHint: true },
    run: async (args, deps) => {
      const path = pathOf(args)
      if (path == null) return fail('Name the file with path.')
      if (typeof args.content !== 'string') return fail('Give the whole new content of the file as content.')
      const project = projectOf(args, deps)
      // The content check is a model call: in the delegated mode it is this session's to perform.
      await ensureSession(deps, project)
      const written = await deps.api.files.save(project, path, args.content)

      return ok(
        `Wrote ${written.path}.${rebuildNote(written.buildWarning)}`,
        { projectId: project, ...(written as unknown as Record<string, unknown>) }
      )
    },
  },

  {
    name: 'delete_file',
    title: 'Delete one generated file',
    description:
      'Delete one file of a project whose sources live in its own slot, then rebuild the preview —'
      + ' what the web editor\'s delete does. It cannot be undone from here, so ask the user first.'
      + ' Files that decide how the project builds and starts are refused.',
    input: {
      projectId: z.string().optional(),
      path: z.string().min(1).max(512).describe('The path relative to the project root.'),
      confirm: z.boolean().describe('Must be true. The user has to have agreed to deleting this file.'),
    },
    availability: toolHostHelper.cloudTarget,
    annotations: { ...DESTRUCTIVE, idempotentHint: true },
    run: async (args, deps) => {
      if (args.confirm !== true) {
        return fail('Not done. Deleting a file cannot be undone from here. Ask the user, then call it'
          + ' again with confirm: true.')
      }
      const path = pathOf(args)
      if (path == null) return fail('Not done. Name the file to delete with path — list_files shows them.')
      const project = projectOf(args, deps)
      const removed = await deps.api.files.remove(project, path)

      return ok(
        `Deleted ${removed.path}.${rebuildNote(removed.buildWarning)}`,
        { projectId: project, ...(removed as unknown as Record<string, unknown>) }
      )
    },
  },

  {
    name: 'preview_control',
    title: 'Start, restart, stop or rebuild the preview',
    description:
      'The web\'s sandbox controls for a project whose sources live in its own slot: start the preview'
      + ' (creating its workload when it has none), restart it, stop it, or rebuild it — a clean'
      + ' dependency install and build, the repair for a preview that will not build; a rebuild goes on'
      + ' after the answer, holding the project lock (project_status shows it). Only the PREVIEW:'
      + ' the published production site is never touched.',
    input: {
      projectId: z.string().optional(),
      action: z.enum(PREVIEW_ACTIONS).describe('start, restart, stop or rebuild.'),
    },
    availability: toolHostHelper.cloudTarget,
    annotations: IDEMPOTENT_WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      switch (args.action) {
        case 'start':
          return slotResult('The preview is starting.', project, await deps.api.sandbox.run(project))
        case 'restart':
          return slotResult('The preview was restarted.', project, await deps.api.sandbox.restart(project))
        case 'stop':
          return slotResult('The preview was stopped.', project, await deps.api.sandbox.stop(project))
        case 'rebuild':
          return slotResult(
            'The rebuild has started and goes on after this answer; project_status shows the project'
            + ' locked until it is done.',
            project, await deps.api.sandbox.rebuild(project),
          )
        default:
          return fail('Say what to do with action: start, restart, stop or rebuild.')
      }
    },
  },

  {
    name: 'project_apps',
    title: 'The applications of a project',
    description:
      'The applications a project consists of. Every project has main, at the root of its address; a'
      + ' project split into applications adds one per group of areas — an admin app under /admin, a back'
      + ' office under /backoffice — each with its own interface and server under its own path, all on'
      + ' one address. For each: its path, the areas it serves and, for a project whose sources live in'
      + ' its own slot, whether its interface built and its server runs, and why not. Then every area by'
      + ' its key — the value a story\'s area takes (create_story) — with its kind, app, path, segment and,'
      + ' for an area of the project\'s own that only the people the owner grants may enter, its marker'
      + ' permission. restart_project_app restarts one of the applications.',
    input: { projectId: z.string().optional() },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const local = deps.host.target === ConnectTarget.Local
      let view: ConnectAppsView
      try {
        view = await deps.api.project.apps(project)
      } catch (e) {
        if (!await appsToolHelper.routeMissing(deps, project, e)) throw e
        const legacy = appsToolHelper.legacyView(project, local)

        return ok(`${ONE_APP_PLATFORM}\n${appsToolHelper.renderApps(legacy)}`, { ...legacy, olderPlatform: true })
      }
      // A local project: the platform answers its map, and where each app answers is this machine's.
      const run = view.local && deps.dir != null ? await makeLocalRunHelper(deps.dir).localStatus() : null

      return ok(
        appsToolHelper.renderApps(view, run),
        { ...view, ...(run?.apps != null ? { localRun: run.apps } : {}) } as unknown as Record<string, unknown>,
      )
    },
  },

  {
    name: 'restart_project_app',
    title: 'Restart one application of a project',
    description:
      'Restart ONE application of a project — its server, and with web: true its interface build too —'
      + ' while the others keep serving: the repair for one application that stopped answering. For a'
      + ' project whose sources live in its own slot it restarts that application in the preview (never the'
      + ' published production site) and answers every application as it then stands; for one on this'
      + ' machine it restarts that application\'s server in the local run. project_apps names them.',
    input: {
      projectId: z.string().optional(),
      app: z.string().regex(APP_NAME_PATTERN).describe('The application by name — main, or one project_apps lists.'),
      web: z.boolean().optional().describe('Also rebuild its interface (a preview only). Leave it out to restart the server alone.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      const app = typeof args.app === 'string' ? args.app.trim() : ''
      if (!APP_NAME_PATTERN.test(app)) return fail('Name the application with app — project_apps lists them.')
      if (deps.host.target === ConnectTarget.Local) {
        if (deps.dir == null) return fail('No project directory.')
        const state = makeRunStateHelper(deps.dir)
        const record = await state.readRun()
        if (record == null) return fail('Nothing runs on this machine — run_local builds and starts every application.')
        const known = app === MAIN_APP ? record.api != null : (record.apps ?? []).some(one => one.name === app && one.api != null)
        if (!known) {
          return fail(`The local run holds no running application ${app}. project_apps lists the project's`
            + ' applications; run_local builds and starts every one of them.')
        }
        const refused = await state.restartApi(app)
        if (refused != null) return fail(refusalHelper.refusalPhrase(refused))
        const status = await makeLocalRunHelper(deps.dir).localStatus()
        const address = status.apps?.find(one => one.name === app)

        return ok(
          `Restarted the ${app} server on this machine${address != null ? ` (${address.url})` : ''}; local_status says`
          + ` when it serves.${args.web === true ? ` ${LOCAL_APP_RESTART_HINT}` : ''}`,
          { app, local: true, ...(status.apps != null ? { localRun: status.apps } : {}) },
        )
      }

      const project = projectOf(args, deps)
      let view: ConnectAppsView
      try {
        view = await deps.api.sandbox.restartApp(project, app, args.web === true ? { api: true, web: true } : {})
      } catch (e) {
        // A bare 404: an older platform has no route, or the preview serves no such app — the apps read tells which.
        if (!await appsToolHelper.routeMissing(deps, project, e)) throw e
        const listed = await deps.api.project.apps(project).catch(() => null)
        if (listed == null) return fail(`${ONE_APP_PLATFORM} ${RESTART_WHOLE_PREVIEW}`)

        return fail(`The preview serves no application ${app}. Nothing was restarted.\n${appsToolHelper.renderApps(listed)}`)
      }
      const restarted = view.apps.find(one => one.name === app)

      return ok(
        `Restarted ${app}${args.web === true ? ', its interface rebuilt' : ''}; the others kept serving.\n`
        + appsToolHelper.renderApps(view),
        { ...view, restarted: app, ...(restarted?.cause != null ? { cause: restarted.cause } : {}) } as unknown as Record<string, unknown>,
      )
    },
  },

  {
    name: 'add_app',
    title: 'Add an application to a project',
    description:
      'Split the project further: add an APPLICATION — its own interface and server, served at /<mount> of the'
      + ' project\'s address with its api at /<mount>/api — that takes over the areas named (from the applications'
      + ' serving them now) and/or is created with a newArea of the project\'s own as its home: a separate'
      + ' application for another group of people (partners, a field crew) starts from one. An area whose'
      + ' stories are built or being built never moves, and the guest area stays in main. The new application'
      + ` is stamped with the project's shell and look and its areas' placeholders are drawn. ${APPS_CHANGE_RUN}`,
    input: {
      projectId: z.string().optional(),
      name: z.string().regex(APP_NAME_PATTERN)
        .describe('2–16 lower-case letters and digits, starting with a letter — e.g. "partners".'),
      mount: z.string().regex(TARGET_APP_MOUNT_PATTERN).optional()
        .describe('The one path segment it is served under; its name when left out.'),
      areas: z.array(z.string().regex(AREA_KEY_PATTERN).max(AREA_KEY_MAX)).max(16).optional()
        .describe('Area keys it takes over, in order (project_apps lists them); its home area first unless newArea is given.'),
      newArea: z.object(AREA_FIELDS).optional()
        .describe('A new area of the project\'s own the application is created with, as its home area.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const areas = Array.isArray(args.areas) ? (args.areas as unknown[]).filter((key): key is string => typeof key === 'string') : []
      const created = args.newArea != null && typeof args.newArea === 'object' ? areaOf(args.newArea as Record<string, unknown>) : undefined
      if (areas.length < 1 && created == null) {
        return fail('Name the areas the application takes over with areas, or the area it is created with with newArea — project_apps lists them.')
      }
      await ensureSession(deps, project)
      const name = String(args.name)

      return await appsChangeToolHelper.change(deps, {
        tool: 'add_app', args, projectId: project, doing: `adding the application "${name}"`,
        apply: async api => await api.add(project, {
          name,
          ...(typeof args.mount === 'string' && args.mount !== '' ? { mount: args.mount } : {}),
          ...(areas.length > 0 ? { areas } : {}),
          ...(created != null ? { newArea: created } : {}),
        }),
      })
    },
  },

  {
    name: 'add_area',
    title: 'Add an area to a project',
    description:
      'Add an AREA of the project\'s own to one of its applications — a part of the product for another group of'
      + ' people (a partner portal, a field crew\'s workspace), an instance of one of the four kinds under its own key'
      + ' and path segment. Its layout, home screen and menu entry are drawn in its application; a story lands in it'
      + ' when its card names its key (create_story\'s area). Never for a role a permission can express instead.'
      + ` ${APPS_CHANGE_RUN}`,
    input: {
      projectId: z.string().optional(),
      ...AREA_FIELDS,
      app: z.string().regex(APP_NAME_PATTERN).optional()
        .describe('The application serving it (project_apps lists them); main for a public area, else the one serving that kind\'s standard area.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      const area = areaOf(args)

      return await appsChangeToolHelper.change(deps, {
        tool: 'add_area', args, projectId: project, doing: `adding the area "${area.key}"`,
        apply: async api => await api.addArea(project, {
          ...area, ...(typeof args.app === 'string' && args.app !== '' ? { app: args.app } : {}),
        }),
      })
    },
  },

  {
    name: 'bind_area',
    title: 'Move an area to another application',
    description:
      'Move one AREA of a project to another of its applications: its placeholders are retired where it was and'
      + ' drawn where it goes, and its address follows that application\'s path. Refused for an area whose stories'
      + ' are built or being built, for the guest area (always main\'s home) and for an application\'s only area;'
      + ` moving it back is the same call. ${APPS_CHANGE_RUN}`,
    input: {
      projectId: z.string().optional(),
      area: z.string().regex(AREA_KEY_PATTERN).max(AREA_KEY_MAX).describe('The area\'s key (project_apps lists them).'),
      app: z.string().regex(APP_NAME_PATTERN).describe('The application that serves it from now on.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      await ensureSession(deps, project)
      const area = String(args.area)
      const app = String(args.app)

      return await appsChangeToolHelper.change(deps, {
        tool: 'bind_area', args, projectId: project, doing: `moving the area "${area}" to "${app}"`,
        apply: async api => await api.bindArea(project, { area, app }),
      })
    },
  },

  {
    name: 'git_status',
    title: 'The project\'s git status and GitHub connection',
    description:
      'For a project whose sources live in its own slot: its GitHub connection (who connected it, the'
      + ' repository it publishes to, whether it still works) and its working tree — branch, last commit,'
      + ' uncommitted changes and where it stands against GitHub. The tree is read only while the preview'
      + ' is ready, because git lives in the preview.',
    input: { projectId: z.string().optional() },
    availability: toolHostHelper.cloudTarget,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const state = await deps.api.git.status(project)

      return ok(gitToolHelper.renderState(state), { projectId: project, ...(state as unknown as Record<string, unknown>) })
    },
  },

  {
    name: 'git_history',
    title: 'The project\'s latest commits',
    description:
      'The latest commits of a project whose sources live in its own slot, newest first — each with the'
      + ' hash git_revert names.',
    input: { projectId: z.string().optional() },
    availability: toolHostHelper.cloudTarget,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const commits = await deps.api.git.log(project)

      return ok(gitToolHelper.renderHistory(commits), {
        projectId: project, total: commits.length, commits: commits as unknown as Record<string, unknown>[],
      })
    },
  },

  {
    name: 'git_commit',
    title: 'Commit the project\'s changes',
    description:
      'Commit every uncommitted change of a project whose sources live in its own slot, with a message —'
      + ' what the web Git dialog\'s commit does. Refused while the platform\'s agent is working on the project.',
    input: {
      projectId: z.string().optional(),
      message: z.string().min(1).max(200).describe('The commit message.'),
    },
    availability: toolHostHelper.cloudTarget,
    annotations: WRITE,
    run: async (args, deps) => {
      const message = typeof args.message === 'string' ? args.message.trim() : ''
      if (message === '') return fail('Not done. Give the commit a message.')
      const project = projectOf(args, deps)
      const { commit } = await deps.api.git.commit(project, message)

      return ok(
        commit != null ? `Committed ${commit.shortHash} ${commit.subject}.` : 'Nothing to commit — the working tree is clean.',
        { projectId: project, commit: commit as unknown as Record<string, unknown> | null },
      )
    },
  },

  {
    name: 'git_discard',
    title: 'Throw away uncommitted changes',
    description:
      'Throw away every uncommitted change of a project whose sources live in its own slot — the working'
      + ' tree goes back to the last commit. Uncommitted work cannot be recovered afterwards, so ask the'
      + ' user first.',
    input: {
      projectId: z.string().optional(),
      confirm: z.boolean().describe('Must be true. The user has to have agreed to losing the uncommitted changes.'),
    },
    availability: toolHostHelper.cloudTarget,
    annotations: { ...DESTRUCTIVE, idempotentHint: true },
    run: async (args, deps) => {
      if (args.confirm !== true) {
        return fail('Not done. Discarding throws away every uncommitted change for good. Ask the user, then'
          + ' call it again with confirm: true.')
      }
      const project = projectOf(args, deps)
      const status = await deps.api.git.discard(project)

      return ok(
        'The uncommitted changes were discarded; the working tree is back at the last commit.',
        { projectId: project, git: status as unknown as Record<string, unknown> },
      )
    },
  },

  {
    name: 'git_revert',
    title: 'Go back to an earlier commit',
    description:
      'Bring back the tree of one earlier commit of a project whose sources live in its own slot, as a NEW'
      + ' commit — history is never rewritten, so the later commits stay and can be reverted to in turn.'
      + ' Uncommitted changes are committed first; the preview is rebuilt and the database migrated to the'
      + ' older code, which may not match data written since. Ask the user first.',
    input: {
      projectId: z.string().optional(),
      hash: z.string().regex(/^[0-9a-f]{7,40}$/).describe('The commit\'s hash, as git_history prints it.'),
      confirm: z.boolean().describe('Must be true. The user has to have agreed to going back to this commit.'),
    },
    availability: toolHostHelper.cloudTarget,
    annotations: DESTRUCTIVE,
    run: async (args, deps) => await answering(deps, 'git_revert', async () => {
      if (args.confirm !== true) {
        return fail('Not done. Going back replaces the project\'s files with that commit\'s and migrates its'
          + ' database. Ask the user, then call it again with confirm: true.')
      }
      const hash = typeof args.hash === 'string' ? args.hash.trim().toLowerCase() : ''
      if (!/^[0-9a-f]{7,40}$/.test(hash)) return fail('Not done. Name the commit with hash — git_history shows them.')
      const project = projectOf(args, deps)
      const result = await deps.api.git.revert(project, hash)

      return ok(
        (result.commit != null
          ? `Went back to ${hash}: the new commit is ${result.commit.shortHash} ${result.commit.subject}. The preview was rebuilt.`
          : `The tree already matched ${hash}; nothing was committed.`)
        + (result.dbWarning != null && result.dbWarning !== '' ? `\nThe database migration said: ${result.dbWarning}` : ''),
        { projectId: project, ...(result as unknown as Record<string, unknown>) },
      )
    }),
  },

  {
    name: 'connect_github',
    title: 'Connect the project to GitHub',
    description:
      'Begin connecting a project whose sources live in its own slot to the user\'s GitHub account: answers'
      + ' an address the USER opens in their browser to authorize it. The connection is finished by the'
      + ' OwlMeans web application when GitHub returns there — never by a tool. Then publish_to_github, or'
      + ' github_repositories and link_github_origin for an import.',
    input: { projectId: z.string().optional() },
    availability: toolHostHelper.cloudTarget,
    annotations: WRITE,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const { authorizeUrl } = await deps.api.github.authorize(project)

      return ok(gitToolHelper.renderAuthorize(authorizeUrl), { projectId: project, authorizeUrl })
    },
  },

  {
    name: 'publish_to_github',
    title: 'Publish the project to a GitHub repository',
    description:
      'Publish a project whose sources live in its own slot to GitHub: a NEW repository (repoName, private'
      + ' unless private is false) or one that exists (owner and repo). The project\'s commits are pushed'
      + ' there and github_sync works from then on. Never onto the repository a converted project came from'
      + ' while its original sources are still kept.',
    input: {
      projectId: z.string().optional(),
      repoName: z.string().min(1).max(100).optional().describe('A new repository\'s name; the project\'s code when left out.'),
      private: z.boolean().optional().describe('A new repository is private unless this is false.'),
      owner: z.string().min(1).max(100).optional().describe('With repo: publish to this existing repository.'),
      repo: z.string().min(1).max(100).optional().describe('With owner: publish to this existing repository.'),
    },
    availability: toolHostHelper.cloudTarget,
    annotations: WRITE,
    run: async (args, deps) => await answering(deps, 'publish_to_github', async () => {
      const owner = typeof args.owner === 'string' ? args.owner.trim() : ''
      const repo = typeof args.repo === 'string' ? args.repo.trim() : ''
      if ((owner === '') !== (repo === '')) {
        return fail('Not done. An existing repository is named by both owner and repo.')
      }
      const project = projectOf(args, deps)
      const connection = await deps.api.github.publish(project, owner !== ''
        ? { existing: { owner, repo } }
        : {
          ...(typeof args.repoName === 'string' && args.repoName.trim() !== '' ? { repoName: args.repoName.trim() } : {}),
          ...(typeof args.private === 'boolean' ? { private: args.private } : {}),
        })

      return ok(
        `Published to ${connection.repoFullName ?? 'GitHub'}${connection.repoUrl != null ? ` (${connection.repoUrl})` : ''}.`
        + ' github_sync pushes and pulls from now on.',
        { projectId: project, connection: connection as unknown as Record<string, unknown> },
      )
    }),
  },

  {
    name: 'github_sync',
    title: 'Push to or pull from GitHub',
    description:
      'For a project published to GitHub (publish_to_github): push its commits there, or pull GitHub\'s'
      + ' into it — a pulled tree is checked before the preview is rebuilt from it, and a conflict aborts the'
      + ' merge leaving nothing changed. Never a force push. Refused while the platform\'s agent is working'
      + ' on the project.',
    input: {
      projectId: z.string().optional(),
      direction: z.enum(GIT_SYNC_DIRECTIONS).describe('push or pull.'),
    },
    availability: toolHostHelper.cloudTarget,
    annotations: WRITE,
    run: async (args, deps) => {
      const direction = args.direction
      if (direction !== 'push' && direction !== 'pull') return fail('Say which way with direction: push or pull.')
      const project = projectOf(args, deps)
      const result = direction === 'push' ? await deps.api.github.push(project) : await deps.api.github.pull(project)
      const refused = result.status !== 'ok' && result.status !== 'up-to-date'

      return {
        ...ok(gitToolHelper.renderSync(direction, result), { projectId: project, direction, ...(result as unknown as Record<string, unknown>) }),
        ...(refused ? { isError: true } : {}),
      }
    },
  },

  {
    name: 'disconnect_github',
    title: 'Disconnect the project from GitHub',
    description:
      'Forget a project\'s GitHub connection — its stored access and the repository it publishes to. The'
      + ' repository on GitHub is left exactly as it is; connecting again needs the user to authorize again.'
      + ' Ask the user first.',
    input: {
      projectId: z.string().optional(),
      confirm: z.boolean().describe('Must be true. The user has to have agreed to disconnecting GitHub.'),
    },
    availability: toolHostHelper.cloudTarget,
    annotations: { ...DESTRUCTIVE, idempotentHint: true },
    run: async (args, deps) => {
      if (args.confirm !== true) {
        return fail('Not done. Disconnecting forgets the stored GitHub access; reconnecting needs the user in a'
          + ' browser again. Ask the user, then call it again with confirm: true.')
      }
      const project = projectOf(args, deps)
      await deps.api.github.disconnect(project)

      return ok('GitHub is disconnected from this project. The repository on GitHub is untouched.', { projectId: project, connection: null })
    },
  },

  {
    name: 'github_repositories',
    title: 'The user\'s GitHub repositories and branches',
    description:
      'For a project connected to GitHub: one page of the repositories the user can reach (search narrows'
      + ' the page that came back), or — with owner and repo — one page of that repository\'s branches.'
      + ' What link_github_origin and publish_to_github name.',
    input: {
      projectId: z.string().optional(),
      owner: z.string().min(1).max(100).optional().describe('With repo: list this repository\'s branches.'),
      repo: z.string().min(1).max(100).optional().describe('With owner: list this repository\'s branches.'),
      page: z.number().int().min(1).max(1000).optional().describe('The page, from 1.'),
      search: z.string().max(200).optional().describe('Keep the repositories of this page whose name contains it.'),
    },
    availability: toolHostHelper.cloudTarget,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const owner = typeof args.owner === 'string' ? args.owner.trim() : ''
      const repo = typeof args.repo === 'string' ? args.repo.trim() : ''
      if ((owner === '') !== (repo === '')) {
        return fail('Name a repository by both owner and repo to list its branches, or neither to list repositories.')
      }
      const page = typeof args.page === 'number' ? args.page : undefined
      const project = projectOf(args, deps)
      if (owner !== '') {
        const list = await deps.api.github.branches(project, { owner, repo, ...(page != null ? { page } : {}) })

        return ok(gitToolHelper.renderBranches(`${owner}/${repo}`, list), {
          projectId: project, owner, repo, ...(list as unknown as Record<string, unknown>),
        })
      }
      const search = typeof args.search === 'string' && args.search.trim() !== '' ? args.search.trim() : undefined
      const list = await deps.api.github.repos(project, {
        ...(page != null ? { page } : {}), ...(search != null ? { search } : {}),
      })

      return ok(gitToolHelper.renderRepos(list, search), { projectId: project, ...(list as unknown as Record<string, unknown>) })
    },
  },

  {
    name: 'link_github_origin',
    title: 'Record the repository a project was imported from',
    description:
      'For a project being imported from GitHub: record which repository (and branch — its default one'
      + ' when left out) it comes FROM, so the conversion clones it. Nothing is pushed or published, and'
      + ' the repository it publishes TO stays publish_to_github\'s choice.',
    input: {
      projectId: z.string().optional(),
      owner: z.string().min(1).max(100),
      repo: z.string().min(1).max(100),
      branch: z.string().min(1).max(200).optional().describe('The branch to import; the repository\'s default when left out.'),
    },
    availability: toolHostHelper.cloudTarget,
    annotations: IDEMPOTENT_WRITE,
    run: async (args, deps) => {
      const owner = typeof args.owner === 'string' ? args.owner.trim() : ''
      const repo = typeof args.repo === 'string' ? args.repo.trim() : ''
      if (owner === '' || repo === '') return fail('Not done. Name the repository by owner and repo.')
      const branch = typeof args.branch === 'string' && args.branch.trim() !== '' ? args.branch.trim() : undefined
      const project = projectOf(args, deps)
      const { connection } = await deps.api.github.link(project, { owner, repo, ...(branch != null ? { branch } : {}) })

      return ok(
        `The project now comes from ${owner}/${repo}${branch != null ? ` (${branch})` : ' (its default branch)'}.`
        + ` ${gitToolHelper.renderConnection(connection)}`,
        { projectId: project, owner, repo, ...(branch != null ? { branch } : {}), connection: connection as unknown as Record<string, unknown> },
      )
    },
  },

  {
    name: 'production_status',
    title: 'The project\'s published production site',
    description:
      'For a project whose sources live in its own slot: its PRODUCTION site — whether it was published,'
      + ' its status (building, deploying, live, stopped or in error) and address, and its custom domain'
      + ' with the DNS records still to be created. Never the preview: project_status shows that.',
    input: { projectId: z.string().optional() },
    availability: toolHostHelper.cloudTarget,
    annotations: READ_ONLY,
    run: async (args, deps) => {
      const project = projectOf(args, deps)
      const status = await deps.api.production.status(project)

      return ok(productionToolHelper.renderStatus(status), { projectId: project, ...(status as unknown as Record<string, unknown>) })
    },
  },

  {
    name: 'publish_production',
    title: 'Publish the project as its production site',
    description:
      'Build the current sources of a project whose sources live in its own slot and deploy them as its'
      + ' PRODUCTION site, which real users reach — replacing whatever was published before. It holds one'
      + ' of the plan\'s published sites (a republish holds the one it has). The build goes on after the'
      + ' answer; production_status shows when it is live. Ask the user first.',
    input: {
      projectId: z.string().optional(),
      confirm: z.boolean().describe('Must be true. The user has to have agreed to publishing (or replacing) the live site.'),
    },
    availability: toolHostHelper.cloudTarget,
    annotations: DESTRUCTIVE,
    run: async (args, deps) => await answering(deps, 'publish_production', async () => {
      if (args.confirm !== true) {
        return fail('Not done. Publishing replaces the live production site real users reach, and uses one of'
          + ' the plan\'s published sites. Ask the user, then call it again with confirm: true.')
      }
      const project = projectOf(args, deps)
      const status = await deps.api.production.publish(project)

      return ok(
        `The publish has started.\n${productionToolHelper.renderStatus(status)}`,
        { projectId: project, ...(status as unknown as Record<string, unknown>) },
      )
    }),
  },

  {
    name: 'production_control',
    title: 'Restart or stop the production site',
    description:
      'Restart the PRODUCTION site of a project whose sources live in its own slot, or stop it. A restart'
      + ' redeploys the last published build (a stopped site comes back and takes one of the plan\'s'
      + ' published sites again); a stop takes the site offline for its users and gives that published site'
      + ' back — its data is kept. Never the preview: that is preview_control.',
    input: {
      projectId: z.string().optional(),
      action: z.enum(PRODUCTION_ACTIONS).describe('restart or stop.'),
    },
    availability: toolHostHelper.cloudTarget,
    annotations: { ...DESTRUCTIVE, idempotentHint: true },
    run: async (args, deps) => await answering(deps, 'production_control', async () => {
      const project = projectOf(args, deps)
      switch (args.action) {
        case 'restart': {
          const status = await deps.api.production.restart(project)
          return ok(`The production site is restarting.\n${productionToolHelper.renderStatus(status)}`,
            { projectId: project, ...(status as unknown as Record<string, unknown>) })
        }
        case 'stop': {
          const status = await deps.api.production.stop(project)
          return ok(`The production site was stopped.\n${productionToolHelper.renderStatus(status)}`,
            { projectId: project, ...(status as unknown as Record<string, unknown>) })
        }
        default:
          return fail('Say what to do with action: restart or stop.')
      }
    }),
  },

  {
    name: 'custom_domain',
    title: 'Attach, verify or detach a custom domain',
    description:
      'The custom domain of a project\'s PRODUCTION site (a paid feature): attach a domain the user owns —'
      + ' answered with the two DNS records they create at their DNS provider —, verify asks the provider'
      + ' again once the records are in place, detach removes it (the generated address keeps serving).'
      + ' A domain attached to another project is refused.',
    input: {
      projectId: z.string().optional(),
      action: z.enum(DOMAIN_ACTIONS).describe('attach, verify or detach.'),
      domain: z.string().min(4).max(253).optional().describe('With attach: the host name, e.g. shop.example.com.'),
    },
    availability: toolHostHelper.cloudTarget,
    annotations: WRITE,
    run: async (args, deps) => await answering(deps, 'custom_domain', async () => {
      const project = projectOf(args, deps)
      const result = (domain: ConnectProductionDomain | null, lead: string) => ok(
        `${lead}\n${productionToolHelper.renderDomain(domain)}`,
        { projectId: project, domain: domain as unknown as Record<string, unknown> | null },
      )
      switch (args.action) {
        case 'attach': {
          const domain = typeof args.domain === 'string' ? args.domain.trim().toLowerCase() : ''
          if (domain === '') return fail('Not done. Name the domain to attach, e.g. shop.example.com.')
          const attached = await deps.api.production.domain.attach(project, domain)
          if (attached == null) {
            return fail('Not done. The project has no production site yet — publish_production first, then attach the domain.')
          }

          return result(attached, `${domain} is attached.`)
        }
        case 'verify':
          return result(await deps.api.production.domain.verify(project), 'Asked the provider again.')
        case 'detach':
          return result(await deps.api.production.domain.detach(project), 'The custom domain is detached.')
        default:
          return fail('Say what to do with action: attach, verify or detach.')
      }
    }),
  },

  {
    name: 'production_auth',
    title: 'The production site\'s standalone sign-in',
    description:
      'The sign-in (OIDC) configuration a self-hosted copy of a project\'s production site uses — the'
      + ' issuer, the client id and the owner\'s own redirect addresses (a paid feature). The client secret'
      + ' is never shown here: only whether it is set; the user reads it in the OwlMeans web application.',
    input: { projectId: z.string().optional() },
    availability: toolHostHelper.cloudTarget,
    annotations: READ_ONLY,
    run: async (args, deps) => await answering(deps, 'production_auth', async () => {
      const project = projectOf(args, deps)
      const auth = await deps.api.production.auth(project)

      return ok(productionToolHelper.renderAuth(auth), { projectId: project, ...(auth as unknown as Record<string, unknown>) })
    }),
  },

  {
    name: 'set_production_redirects',
    title: 'Set the standalone sign-in\'s redirect addresses',
    description:
      'Replace the owner\'s own redirect addresses of a project\'s production sign-in — the callbacks of a'
      + ' self-hosted copy (a paid feature). The whole list: an empty one clears it. Applied on the next'
      + ' publish_production.',
    input: {
      projectId: z.string().optional(),
      redirects: z.array(z.string().max(2048)).max(32).describe('Every address, e.g. https://my-host.example.com/dispatcher.'),
    },
    availability: toolHostHelper.cloudTarget,
    annotations: IDEMPOTENT_WRITE,
    run: async (args, deps) => await answering(deps, 'set_production_redirects', async () => {
      if (!Array.isArray(args.redirects) || args.redirects.some(uri => typeof uri !== 'string')) {
        return fail('Not done. Give redirects as a list of addresses — an empty list clears them.')
      }
      const project = projectOf(args, deps)
      const { redirectUris } = await deps.api.production.setRedirects(project, args.redirects as string[])

      return ok(productionToolHelper.renderRedirects(redirectUris), { projectId: project, redirectUris })
    }),
  },

  {
    name: 'app_users',
    title: 'The generated app\'s users',
    description:
      'The end users of a project\'s generated application — the people who signed in to it or were invited,'
      + ' each with their role, state and profileId. all: true lists every end user of every application this'
      + ' organization owns instead (read-only). Works for local projects too: the sign-in is the platform\'s.',
    input: {
      projectId: z.string().optional(),
      scope: APP_SCOPE_INPUT,
      all: z.boolean().optional().describe('Every application of the organization instead of one project\'s.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => await answering(deps, 'app_users', async () => {
      if (args.all === true) {
        const users = await deps.api.iam.organizationUsers()
        return ok(iamToolHelper.renderUsers(users, 'End users of every application of this organization'),
          { users: users as unknown as Record<string, unknown> })
      }
      const project = projectOf(args, deps)
      const scope = scopeOf(args)
      const users = await deps.api.iam.users.list(project, scope)

      return ok(iamToolHelper.renderUsers(users, 'The application\'s users'),
        { projectId: project, ...(scope != null ? { scope } : {}), users: users as unknown as Record<string, unknown> })
    }),
  },

  {
    name: 'manage_app_user',
    title: 'Invite, update or remove an app user',
    description:
      'Change an end user of a project\'s generated application: invite one by e-mail (find-or-create),'
      + ' update their name, role or disabled state, or remove them from this application — their account and'
      + ' other applications stay. A removal needs the user\'s agreement (confirm: true).',
    input: {
      projectId: z.string().optional(),
      scope: APP_SCOPE_INPUT,
      action: z.enum(APP_USER_ACTIONS).describe('invite, update or remove.'),
      email: z.string().min(3).max(254).optional().describe('With invite: the person\'s e-mail.'),
      name: z.string().min(1).max(128).optional(),
      role: z.string().min(1).max(32).optional(),
      disabled: z.boolean().optional().describe('With update: true blocks their sign-in, false lets them back.'),
      profileId: z.string().min(1).max(256).optional().describe('With update or remove: the user (app_users lists them).'),
      confirm: z.boolean().optional().describe('With remove: must be true — the user agreed.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: DESTRUCTIVE,
    run: async (args, deps) => await answering(deps, 'manage_app_user', async () => {
      const refused = iamToolHelper.missing('manage_app_user', args)
      if (refused != null) return fail(refused)
      const project = projectOf(args, deps)
      const scope = scopeOf(args)
      const profileId = typeof args.profileId === 'string' ? args.profileId.trim() : ''
      const person = {
        ...(typeof args.name === 'string' ? { name: args.name } : {}),
        ...(typeof args.role === 'string' ? { role: args.role } : {}),
        ...(scope != null ? { scope } : {}),
      }
      switch (args.action) {
        case 'invite': {
          const user = await deps.api.iam.users.invite(project, { email: (args.email as string).trim(), ...person })
          return ok(`Invited: ${iamToolHelper.renderUser(user)}`, { projectId: project, user: user as unknown as Record<string, unknown> })
        }
        case 'update': {
          const user = await deps.api.iam.users.update(project, profileId, {
            ...person, ...(typeof args.disabled === 'boolean' ? { disabled: args.disabled } : {}),
          })
          return ok(`Updated: ${iamToolHelper.renderUser(user)}`, { projectId: project, user: user as unknown as Record<string, unknown> })
        }
        default:
          await deps.api.iam.users.remove(project, profileId, scope)
          return ok(`Removed ${profileId} from the application; their account and other applications stay.`,
            { projectId: project, profileId, removed: true })
      }
    }),
  },

  {
    name: 'app_permissions',
    title: 'The generated app\'s permissions',
    description:
      'The permissions a project\'s generated application declares — each with its area, who holds it by'
      + ' default and whether its grants are bound to one organization — and whether the app\'s operators'
      + ' and users act inside organizations at all.',
    input: { projectId: z.string().optional(), scope: APP_SCOPE_INPUT },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => await answering(deps, 'app_permissions', async () => {
      const project = projectOf(args, deps)
      const permissions = await deps.api.iam.permissions(project, scopeOf(args))

      return ok(iamToolHelper.renderPermissions(permissions),
        { projectId: project, permissions: permissions as unknown as Record<string, unknown> })
    }),
  },

  {
    name: 'set_app_permission_default',
    title: 'Set a permission\'s default holder',
    description:
      'Change who holds one of the generated application\'s permissions without a grant (defaultClass:'
      + ' none, user — every signed-in user, only for a user-area permission —, member, owner…) or whether'
      + ' its grants are bound to one organization (entityScoped). An omitted setting is kept; the platform\'s'
      + ' own permissions are not editable.',
    input: {
      projectId: z.string().optional(),
      scope: APP_SCOPE_INPUT,
      permission: z.string().min(1).max(128).describe('The permission by name (app_permissions lists them).'),
      defaultClass: z.enum(Object.values(IamDefaultClass) as [string, ...string[]]).optional(),
      entityScoped: z.boolean().optional(),
    },
    availability: toolHostHelper.anyHost,
    annotations: IDEMPOTENT_WRITE,
    run: async (args, deps) => await answering(deps, 'set_app_permission_default', async () => {
      const refused = iamToolHelper.missing('set_app_permission_default', args)
      if (refused != null) return fail(refused)
      const project = projectOf(args, deps)
      const scope = scopeOf(args)
      const definition = await deps.api.iam.setDefault(project, {
        permission: (args.permission as string).trim(),
        ...(typeof args.defaultClass === 'string' ? { defaultClass: args.defaultClass as IamDefaultClass } : {}),
        ...(typeof args.entityScoped === 'boolean' ? { entityScoped: args.entityScoped } : {}),
        ...(scope != null ? { scope } : {}),
      })

      return ok(`Saved: ${iamToolHelper.renderDefinition(definition)}`,
        { projectId: project, definition: definition as unknown as Record<string, unknown> })
    }),
  },

  {
    name: 'app_grants',
    title: 'Who holds which permission in the generated app',
    description:
      'The grants of a project\'s generated application — every one, one user\'s (profileId; with'
      + ' entitySlug, only those bound to that organization) or one group\'s (group with its entitySlug) —'
      + ' each with where it comes from: direct, a default, through a group, or a group\'s bundle. Also lists'
      + ' what a subject\'s own restriction withholds from what it would inherit, marked restricted: true —'
      + ' those are NOT held.',
    input: {
      projectId: z.string().optional(),
      scope: APP_SCOPE_INPUT,
      profileId: z.string().min(1).max(256).optional(),
      group: z.string().min(1).max(128).optional().describe('A group key; needs entitySlug.'),
      entitySlug: z.string().min(1).max(63).optional(),
    },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => await answering(deps, 'app_grants', async () => {
      const refused = iamToolHelper.missing('app_grants', args)
      if (refused != null) return fail(refused)
      const project = projectOf(args, deps)
      const scope = scopeOf(args)
      const grants = await deps.api.iam.grants.list(project, {
        ...(typeof args.profileId === 'string' ? { profileId: args.profileId.trim() } : {}),
        ...(typeof args.group === 'string' ? { group: args.group.trim() } : {}),
        ...(typeof args.entitySlug === 'string' ? { entitySlug: args.entitySlug.trim() } : {}),
        ...(scope != null ? { scope } : {}),
      })

      return ok(iamToolHelper.renderGrants(grants), { projectId: project, grants: grants as unknown as Record<string, unknown> })
    }),
  },

  {
    name: 'manage_app_grant',
    title: 'Grant or revoke a permission in the generated app',
    description:
      'Grant one of the generated application\'s permissions to exactly ONE subject — a user (profileId;'
      + ' entitySlug binds the grant to that organization when the permission is organization-bound) or a'
      + ' group (group key with its entitySlug) — or revoke it. Revoking a whole permission RESTRICTS the'
      + ' subject: it also loses what it inherits (a default, a group, a bundle) until a revoke with mode:'
      + ' inherit takes back only its own grant or restriction, so it holds what it inherits again. A'
      + ' per-record permission takes resources (record ids) or covers every record; mode names which form'
      + ' when both exist.',
    input: {
      projectId: z.string().optional(),
      scope: APP_SCOPE_INPUT,
      action: z.enum(APP_GRANT_ACTIONS).describe('assign or revoke.'),
      permission: z.string().min(1).max(128).describe('The permission by name (app_permissions lists them).'),
      profileId: z.string().min(1).max(256).optional().describe('The user — or name a group instead.'),
      group: z.string().min(1).max(128).optional().describe('The group key — needs entitySlug.'),
      entitySlug: z.string().min(1).max(63).optional(),
      resources: z.array(z.string().min(1).max(128)).max(256).optional().describe('Record ids of a per-record permission.'),
      mode: z.enum(Object.values(IamGrantMode) as [string, ...string[]]).optional()
        .describe('blanket (every record) or resources (only those listed); revoke only: inherit (take back'
          + ' the subject\'s own grant or restriction) or all (every form, a revoke\'s default).'),
    },
    availability: toolHostHelper.anyHost,
    annotations: DESTRUCTIVE,
    run: async (args, deps) => await answering(deps, 'manage_app_grant', async () => {
      const refused = iamToolHelper.missing('manage_app_grant', args)
      if (refused != null) return fail(refused)
      const project = projectOf(args, deps)
      const body = iamToolHelper.grantBody(args)
      if (args.action === 'assign') {
        const grant = await deps.api.iam.grants.assign(project, body)
        return ok(`Granted: ${iamToolHelper.renderGrant(grant)}`, { projectId: project, grant: grant as unknown as Record<string, unknown> })
      }
      await deps.api.iam.grants.revoke(project, body)

      return ok(iamToolHelper.renderRevoke(body), { projectId: project, revoked: body as unknown as Record<string, unknown> })
    }),
  },

  {
    name: 'app_organizations',
    title: 'The generated app\'s organizations',
    description:
      'The organizations a project\'s generated application has people in, by entitySlug, with their'
      + ' member counts — or, with entitySlug, that organization\'s members (owner flag, groups, profileId).',
    input: { projectId: z.string().optional(), scope: APP_SCOPE_INPUT, entitySlug: z.string().min(1).max(63).optional() },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => await answering(deps, 'app_organizations', async () => {
      const project = projectOf(args, deps)
      const scope = scopeOf(args)
      const entitySlug = typeof args.entitySlug === 'string' ? args.entitySlug.trim() : ''
      if (entitySlug !== '') {
        const members = await deps.api.iam.organizations.members(project, entitySlug, scope)
        return ok(iamToolHelper.renderMembers(members, `Members of ${entitySlug}`),
          { projectId: project, entitySlug, members: members as unknown as Record<string, unknown> })
      }
      const organizations = await deps.api.iam.organizations.list(project, scope)

      return ok(iamToolHelper.renderOrganizations(organizations),
        { projectId: project, organizations: organizations as unknown as Record<string, unknown> })
    }),
  },

  {
    name: 'manage_app_organization',
    title: 'Rename an organization or manage its members',
    description:
      'Change an organization of a project\'s generated application (by entitySlug): rename it (its title —'
      + ' the slug stays), add a member by e-mail (owner optional), update a member\'s owner flag or groups,'
      + ' or remove a member. The last owner always stays one.',
    input: {
      projectId: z.string().optional(),
      scope: APP_SCOPE_INPUT,
      action: z.enum(APP_ORGANIZATION_ACTIONS).describe('rename, add-member, update-member or remove-member.'),
      entitySlug: z.string().min(1).max(63).describe('The organization (app_organizations lists them).'),
      title: z.string().min(1).max(256).optional().describe('With rename: the new title.'),
      email: z.string().min(3).max(254).optional().describe('With add-member.'),
      name: z.string().min(1).max(128).optional(),
      owner: z.boolean().optional(),
      profileId: z.string().min(1).max(256).optional().describe('With update-member or remove-member.'),
      groups: z.array(z.string().min(1).max(128)).max(64).optional().describe('With update-member: the member\'s whole group list.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: DESTRUCTIVE,
    run: async (args, deps) => await answering(deps, 'manage_app_organization', async () => {
      const refused = iamToolHelper.missing('manage_app_organization', args)
      if (refused != null) return fail(refused)
      const project = projectOf(args, deps)
      const scope = scopeOf(args)
      const scoped = scope != null ? { scope } : {}
      const entitySlug = (args.entitySlug as string).trim()
      const profileId = typeof args.profileId === 'string' ? args.profileId.trim() : ''
      switch (args.action) {
        case 'rename': {
          const organization = await deps.api.iam.organizations.update(project, entitySlug, { title: (args.title as string).trim(), ...scoped })
          return ok(`Renamed: ${iamToolHelper.renderOrganization(organization)}`,
            { projectId: project, organization: organization as unknown as Record<string, unknown> })
        }
        case 'add-member': {
          const member = await deps.api.iam.organizations.addMember(project, entitySlug, {
            email: (args.email as string).trim(),
            ...(typeof args.name === 'string' ? { name: args.name } : {}),
            ...(typeof args.owner === 'boolean' ? { owner: args.owner } : {}),
            ...scoped,
          })
          return ok(`Added to ${entitySlug}: ${iamToolHelper.renderMember(member)}`,
            { projectId: project, entitySlug, member: member as unknown as Record<string, unknown> })
        }
        case 'update-member': {
          const member = await deps.api.iam.organizations.updateMember(project, entitySlug, profileId, {
            ...(typeof args.owner === 'boolean' ? { owner: args.owner } : {}),
            ...(Array.isArray(args.groups) ? { groups: args.groups as string[] } : {}),
            ...scoped,
          })
          return ok(`Updated in ${entitySlug}: ${iamToolHelper.renderMember(member)}`,
            { projectId: project, entitySlug, member: member as unknown as Record<string, unknown> })
        }
        default:
          await deps.api.iam.organizations.removeMember(project, entitySlug, profileId, scope)
          return ok(`Removed ${profileId} from ${entitySlug}.`, { projectId: project, entitySlug, profileId, removed: true })
      }
    }),
  },

  {
    name: 'app_groups',
    title: 'The groups of an organization in the generated app',
    description:
      'The groups of one organization of a project\'s generated application (by entitySlug), each with what'
      + ' it grants and its member count — or, with group, that group\'s members.',
    input: {
      projectId: z.string().optional(),
      scope: APP_SCOPE_INPUT,
      entitySlug: z.string().min(1).max(63).describe('The organization (app_organizations lists them).'),
      group: z.string().min(1).max(128).optional().describe('A group key: list its members instead.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => await answering(deps, 'app_groups', async () => {
      const entitySlug = typeof args.entitySlug === 'string' ? args.entitySlug.trim() : ''
      if (entitySlug === '') return fail('Not done. Name the organization by entitySlug (app_organizations lists them).')
      const project = projectOf(args, deps)
      const scope = scopeOf(args)
      const group = typeof args.group === 'string' ? args.group.trim() : ''
      if (group !== '') {
        const members = await deps.api.iam.groups.members(project, entitySlug, group, scope)
        return ok(iamToolHelper.renderMembers(members, `Members of group ${group} of ${entitySlug}`),
          { projectId: project, entitySlug, group, members: members as unknown as Record<string, unknown> })
      }
      const groups = await deps.api.iam.groups.list(project, entitySlug, scope)

      return ok(iamToolHelper.renderGroups(groups, entitySlug),
        { projectId: project, entitySlug, groups: groups as unknown as Record<string, unknown> })
    }),
  },

  {
    name: 'manage_app_group',
    title: 'Create, change or delete a group, or manage its members',
    description:
      'Change a group of an organization of a project\'s generated application: create it (find-or-create'
      + ' by key), update its title or what it grants (bundles — the WHOLE list, it replaces the group\'s),'
      + ' delete it (the user agreed: confirm: true), or add and remove members by profileIds. The platform\'s'
      + ' own staff group keeps its members, bundles and existence — those changes are refused; its permissions'
      + ' are granted and restricted with manage_app_grant (group).',
    input: {
      projectId: z.string().optional(),
      scope: APP_SCOPE_INPUT,
      action: z.enum(APP_GROUP_ACTIONS).describe('create, update, delete, add-members or remove-members.'),
      entitySlug: z.string().min(1).max(63).describe('The group\'s organization.'),
      group: z.string().min(1).max(128).describe('The group key.'),
      title: z.string().min(1).max(256).optional(),
      bundles: z.array(BUNDLE_INPUT).max(32).optional().describe('With update: everything the group grants.'),
      profileIds: z.array(z.string().min(1).max(256)).max(256).optional().describe('With add-members or remove-members.'),
      confirm: z.boolean().optional().describe('With delete: must be true — the user agreed.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: DESTRUCTIVE,
    run: async (args, deps) => await answering(deps, 'manage_app_group', async () => {
      const refused = iamToolHelper.missing('manage_app_group', args)
      if (refused != null) return fail(refused)
      const project = projectOf(args, deps)
      const scope = scopeOf(args)
      const scoped = scope != null ? { scope } : {}
      const entitySlug = (args.entitySlug as string).trim()
      const key = (args.group as string).trim()
      const title = typeof args.title === 'string' ? { title: args.title.trim() } : {}
      switch (args.action) {
        case 'create': {
          const group = await deps.api.iam.groups.ensure(project, entitySlug, { key, ...title, ...scoped })
          return ok(`Group ready: ${iamToolHelper.renderGroup(group)}`, { projectId: project, group: group as unknown as Record<string, unknown> })
        }
        case 'update': {
          const group = await deps.api.iam.groups.update(project, entitySlug, key, {
            ...title, ...(Array.isArray(args.bundles) ? { bundles: args.bundles as IamGroupBundle[] } : {}), ...scoped,
          })
          return ok(`Updated: ${iamToolHelper.renderGroup(group)}`, { projectId: project, group: group as unknown as Record<string, unknown> })
        }
        case 'delete':
          await deps.api.iam.groups.remove(project, entitySlug, key, scope)
          return ok(`Deleted group ${key} of ${entitySlug}.`, { projectId: project, entitySlug, group: key, deleted: true })
        default: {
          const profileIds = args.profileIds as string[]
          if (args.action === 'add-members') {
            await deps.api.iam.groups.addMembers(project, entitySlug, key, profileIds, scope)
          } else {
            await deps.api.iam.groups.removeMembers(project, entitySlug, key, profileIds, scope)
          }
          return ok(`${args.action === 'add-members' ? 'Added' : 'Removed'} ${profileIds.length} member(s)`
            + ` ${args.action === 'add-members' ? 'to' : 'from'} group ${key} of ${entitySlug}.`,
          { projectId: project, entitySlug, group: key, profileIds })
        }
      }
    }),
  },

  {
    name: 'list_slots',
    title: 'The organization\'s workloads',
    description:
      'Every workload of every project of this organization — previews, published production sites'
      + ' and local targets — with its status, its address and the warnings it carries.',
    input: {},
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (_args, deps) => {
      const slots = await deps.api.slot.list()

      return ok(
        slots.length > 0
          ? `${slots.length} workload(s):\n${slots.map(slot => statusTextHelper.renderSlot(slot)).join('\n')}`
          : 'This organization has no workloads yet.',
        { total: slots.length, slots: slots as unknown as Record<string, unknown>[] }
      )
    },
  },

  {
    name: 'project_activity',
    title: 'What the project\'s agent is doing',
    description:
      'Follow a project\'s agent while it works: run starts and stops, pipeline steps, story and project'
      + ' card changes, preview status changes, conversion moves, uncommitted-change proposals and tool'
      + ' outcomes — and with detail: thinking, the model\'s own words. Without after it answers the latest'
      + ' entries and a cursor; call it again with after: <cursor> and wait (up to 20 s) to read what comes'
      + ' next. A feed, not a status: project_status says where the work stands.',
    input: {
      projectId: z.string().optional(),
      after: FEED_AFTER_INPUT,
      limit: z.number().int().min(1).max(200).optional().describe('At most this many entries (default 50).'),
      wait: FEED_WAIT_INPUT,
      detail: z.enum(FEED_DETAILS).optional().describe('progress (default) — what happened; thinking — also the model\'s own words.'),
    },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => await answering(deps, 'project_activity', async () => {
      const project = projectOf(args, deps)
      const detail = (FEED_DETAILS as readonly string[]).includes(args.detail as string)
        ? args.detail as typeof FEED_DETAILS[number] : undefined
      const page = await deps.api.project.activity(project, { ...feedQueryOf(args), ...(detail != null ? { detail } : {}) })
      const next = feedToolHelper.nextCall('project_activity', { projectId: project, ...(detail != null ? { detail } : {}) }, page.cursor)

      return ok(
        feedToolHelper.renderPage(page, { empty: 'No new activity.', next }),
        { projectId: project, cursor: page.cursor, gap: page.gap, entries: page.entries as unknown as Record<string, unknown>[] },
      )
    }),
  },

  {
    name: 'notifications',
    title: 'The organization\'s notices',
    description:
      'The notices the web application shows this organization as pop-ups — a run that stopped because'
      + ' the credits or the plan allowance ran out. Without after it answers the latest ones and a cursor;'
      + ' call it again with after: <cursor> and wait (up to 20 s) to read new ones.',
    input: { after: FEED_AFTER_INPUT, wait: FEED_WAIT_INPUT },
    availability: toolHostHelper.anyHost,
    annotations: READ_ONLY,
    run: async (args, deps) => await answering(deps, 'notifications', async () => {
      const page = await deps.api.account.notifications(feedQueryOf(args))

      return ok(
        feedToolHelper.renderPage(page, { empty: 'No new notices.', next: feedToolHelper.nextCall('notifications', {}, page.cursor) }),
        { cursor: page.cursor, gap: page.gap, entries: page.entries as unknown as Record<string, unknown>[] },
      )
    }),
  },

  {
    name: 'file_changes',
    title: 'Files changed in the project\'s preview',
    description:
      'For a project whose sources live in its own slot: the files added, changed and removed in its tree'
      + ' — by its agent, a git operation or a write — after a cursor. Without after it answers the latest'
      + ' changes and a cursor; call it again with after: <cursor> and wait (up to 20 s). It starts watching'
      + ' the tree when nothing watches it yet; a preview that is not running records nothing.',
    input: { projectId: z.string().optional(), after: FEED_AFTER_INPUT, wait: FEED_WAIT_INPUT },
    availability: toolHostHelper.cloudTarget,
    annotations: READ_ONLY,
    run: async (args, deps) => await answering(deps, 'file_changes', async () => {
      const project = projectOf(args, deps)
      const page = await deps.api.files.changes(project, feedQueryOf(args))
      const text = feedToolHelper.renderPage(page, {
        empty: 'No new file changes.', next: feedToolHelper.nextCall('file_changes', { projectId: project }, page.cursor),
      })

      return ok(
        page.watching ? text : 'The preview is not running, so no file change is being recorded —'
          + ` preview_control { action: start } starts it.\n${text}`,
        { projectId: project, cursor: page.cursor, gap: page.gap, watching: page.watching, entries: page.entries as unknown as Record<string, unknown>[] },
      )
    }),
  },

  {
    name: 'local_status',
    title: 'Is this machine ready to run the app',
    description:
      'What the generated project still needs before it can start here, and whether it is running.',
    input: {},
    availability: toolHostHelper.localTarget,
    annotations: READ_ONLY,
    run: async (_args, deps) => {
      if (deps.dir == null) return fail('No project directory.')
      const [env, running] = await Promise.all([makeProjectEnvHelper(deps.dir).envStatus(), makeLocalRunHelper(deps.dir).localStatus()])
      const lines = [
        `directory: ${deps.dir}`,
        env.missing.length < 1
          ? 'configuration: complete'
          : `configuration: missing ${env.missing.join(', ')} — see local_setup_guide`,
        running.running
          ? `running: api ${running.api ?? '?'} · web ${running.web ?? '?'}`
            + (running.phase != null ? ` · ${running.phase}` : '')
          : 'running: no — run_local starts it',
        // A split project's run: one line per application, each under its path on the one web port.
        ...(running.apps ?? []).map(app => `  ${app.name} · ${app.url} · api ${app.api} · `
          + (app.ready ? 'serving' : `not serving${app.reason != null ? ` — ${app.reason}` : ''}`)),
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
    availability: toolHostHelper.localTarget,
    annotations: WRITE,
    run: async (args, deps) => {
      if (deps.dir == null) return fail('No project directory.')
      const env = await makeProjectEnvHelper(deps.dir).envStatus()
      if (env.missing.length > 0) {
        // Refused rather than started: an app launched without a database URL fails at boot with a
        // message about a connection, which sends the reader looking for a database that was never
        // configured in the first place.
        return fail(
          `The project still needs ${env.missing.join(', ')} in its .env. Call local_setup_guide,`
          + ' which reports what is missing and what to ask the user for.'
        )
      }
      const started = await makeLocalRunHelper(deps.dir).runLocal({ build: args.build !== false })

      return ok(
        `Started. The app is at http://localhost:${started.web}, its API at`
        + ` http://localhost:${started.api}. Call local_status if it does not answer yet.`
        // A split project: every application on the same port, each under its own path.
        + (started.apps != null
          ? `\nApplications: ${started.apps.map(app => `${app.name} ${app.url}`).join(' · ')}`
          : ''),
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
    availability: toolHostHelper.localTarget,
    annotations: IDEMPOTENT_WRITE,
    run: async (_args, deps) => {
      if (deps.dir == null) return fail('No project directory.')
      await makeLocalRunHelper(deps.dir).stopLocal()

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
    availability: toolHostHelper.localTarget,
    annotations: READ_ONLY,
    run: async (_args, deps) => {
      if (deps.dir == null) return fail('No project directory.')
      const report = await setupHelper.readSetupReport(deps.dir)

      return ok(makeSetupReportModel(report).renderSetupGuide(), report as unknown as Record<string, unknown>)
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
    availability: toolHostHelper.localTarget,
    annotations: IDEMPOTENT_WRITE,
    run: async (args, deps) => {
      if (deps.dir == null) return fail('No project directory.')
      const databaseUrl = typeof args.databaseUrl === 'string' ? args.databaseUrl.trim() : ''
      const valkeyUrl = typeof args.valkeyUrl === 'string' ? args.valkeyUrl.trim() : ''
      if (databaseUrl === '' && valkeyUrl === '') {
        return fail('Give at least one of databaseUrl or valkeyUrl — the value the user supplied.')
      }

      const { written, file } = await setupHelper.setUserEnv(deps.dir, {
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
      const report = await setupHelper.readSetupReport(deps.dir)
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
      const missing = makeSetupReportModel(report).missingServices()
      lines.push(missing.length < 1
        ? 'Nothing else is missing — run_local can build and start the application.'
        : 'Still missing: ' + missing.join(', ') + '. Call local_setup_guide again.')

      return ok(lines.join('\n'), report as unknown as Record<string, unknown>)
    },
  },
]

export const createCatalogueHelper = (): CatalogueHelper => {
  // Availability first, then the host's profile (none: the same list, as it always was).
  const visibleTools = (host: ToolHost): ToolDefinition[] => makeToolProfileModel(host.profile)
    .apply([...catalogue, ...(host.extensions ?? [])].filter(tool => tool.availability(host)))

  const toolByName = (name: string): ToolDefinition | undefined =>
    catalogue.find(tool => tool.name === name)

  return { visibleTools, toolByName }
}

export const catalogueHelper = createCatalogueHelper()

/** @deprecated compat:factory-refactor — use `catalogueHelper.visibleTools(…)` */
export const visibleTools = (host: ToolHost): ToolDefinition[] => catalogueHelper.visibleTools(host)
