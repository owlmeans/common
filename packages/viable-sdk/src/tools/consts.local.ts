import { ConnectFeedDetail, ModerationCategory, WorkloadKind } from '@owlmeans/viable-common'
import type { ToolAnnotations } from './types.js'

/** What a production body leaves of a confirmation or consent refusal (`@owlmeans/api` `ApiStatusError`). */
export const BARE_428 = 'api:client:status:428'

/** What a conversion costs, in the words both conversion verbs' descriptions use. */
export const CONVERSION_COST = 'A plan that includes a project conversion covers its AI work up to the'
  + ' conversion limit (1,000,000 credits); beyond it the organization\'s credit limits are spent first,'
  + ' then topped-up credits, and every stage has an estimate. A step that would use the plan\'s'
  + ' conversion or spend credits first answers with what it costs and starts nothing: tell the user,'
  + ' and repeat the call with confirm: true only after they agree. In the delegated mode every model'
  + ' call of a conversion is yours to perform, so it spends no credits and is never asked; in the'
  + ' cloud mode the platform performs all of them.'

/**
 * How much of a drafted field one status answer carries.
 *
 * Generous, because reading the specification IS the confirm step — but bounded, since a tool
 * answer shares one output budget with everything else the host is holding.
 */
export const DRAFT_CAP = 8_000

/** What each moderation category refused, in the words the refusal is explained with. */
export const MODERATION: Record<string, string> = {
  [ModerationCategory.CredentialHarvesting]:
    'collecting other people\'s passwords, one-time codes or card details',
  [ModerationCategory.BrandImpersonation]:
    'presenting itself as another company or as a real person',
  [ModerationCategory.PaymentCapture]:
    'taking payment details on behalf of a merchant the requester does not run',
  [ModerationCategory.AbuseTooling]:
    'abuse — unsolicited bulk messaging, credential stuffing or phishing kits',
}

/** A stack frame, as every runtime prints one. */
export const STACK_FRAME = /^\s+at\s/

/**
 * Wire text a refusal travels as — `package:family:reason`, with any detail after it.
 *
 * What separates an unphrased MARKER from the other things this same field carries: a deadline
 * message, a build warning, a gateway error. Only a marker earns the next-step half, because only
 * a marker is a refusal the parent can neither read nor act on; a build warning is diagnostics
 * somebody asked for and is returned exactly as it stands.
 */
export const MARKER_SHAPE = /^[a-z][\w-]*(?::[\w.-]+)+/

/**
 * Tools the delegated mode's handover leaves alone: the task and question loop itself, and the
 * tools that never reach the platform. Each answers under the ordinary tool deadline.
 */
export const HANDOVER_EXEMPT: ReadonlySet<string> = new Set([
  'next_task', 'submit_task_result', 'next_question', 'answer_question',
  'describe_platform', 'describe_capabilities', 'describe_harness', 'install_harness', 'session_status',
  'local_status', 'run_local', 'stop_local', 'local_setup_guide', 'set_local_service',
])

/** The domain status a parent reads while a tool's call goes on; `project_status` for the rest. */
export const STATUS_TOOL_OF: Readonly<Record<string, string>> = {
  create_story: 'story_status',
  reset_story: 'story_status',
  complete_story: 'story_status',
  update_story: 'story_status',
  delete_story: 'story_status',
  develop_story: 'story_status',
  story_status: 'story_status',
  convert_project: 'conversion_status',
  proceed_conversion: 'conversion_status',
  check_convertible: 'conversion_status',
  purge_origin: 'conversion_status',
  conversion_status: 'conversion_status',
  resume_pipeline: 'pipeline_status',
  pipeline_status: 'pipeline_status',
  git_commit: 'git_status',
  git_discard: 'git_status',
  git_revert: 'git_status',
  publish_to_github: 'git_status',
  github_sync: 'git_status',
  publish_production: 'production_status',
  production_control: 'production_status',
  custom_domain: 'production_status',
  manage_app_user: 'app_users',
  set_app_permission_default: 'app_permissions',
  manage_app_grant: 'app_grants',
  manage_app_organization: 'app_organizations',
  manage_app_group: 'app_groups',
}

/**
 * How often a waiting tool looks again for the session a call may have opened meanwhile — a
 * delegated create opens its unattached session from inside the call it is waiting on.
 */
export const HANDOVER_SLICE_MS = 1_000

/** A tool that changes nothing — a read, a description, a status. */
export const READ_ONLY: ToolAnnotations = Object.freeze({
  readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false,
})

/** A tool that changes something, additively: a second call is a second change. */
export const WRITE: ToolAnnotations = Object.freeze({
  readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false,
})

/** A tool that sets something to a value: repeating it with the same arguments changes nothing more. */
export const IDEMPOTENT_WRITE: ToolAnnotations = Object.freeze({
  readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false,
})

/** A tool that deletes or irreversibly replaces something — the host should ask before it runs. */
export const DESTRUCTIVE: ToolAnnotations = Object.freeze({
  readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false,
})

/** The edits `proceed_conversion` carries — flat in its input, nested in the call's `update`. */
export const PROCEED_UPDATE_FIELDS = ['name', 'description', 'specification', 'vision', 'designSystem'] as const

/** How a refused capability is named to a person — by the capability parameter a gate asserts. */
export const CAPABILITY_LABELS: Readonly<Record<string, string>> = {
  'feature:connect--local-llm': 'the delegated model mode, where your own agent performs the model calls',
  'feature:branding--whitelabel': 'hiding the OwlMeans credit (white label)',
  'feature:domain--custom': 'custom domains',
  'feature:production--standalone': 'a standalone production sign-in',
}

/** `limit-exhausted:<key>:<used>/<limit>[:<resets at ISO>]` — `LimitExhausted`'s packed body. */
export const LIMIT_EXHAUSTED_FIELDS = /^([^:]+):(\d+)\/(\d+)(?::(.+))?$/

/**
 * How much of one file `read_file` answers with. Generous — a generated source file is far below
 * it — but bounded, since a tool answer shares one output budget with everything else the host holds.
 */
export const FILE_READ_CAP = 100_000

/** What `list_files` lists when no `kind` is named: the generated sources. */
export const SOURCES_KIND = 'sources'

/** What `preview_control` can do to the preview workload, in the words of the web's sandbox card. */
export const PREVIEW_ACTIONS = ['start', 'restart', 'stop', 'rebuild'] as const

/**
 * The tail of the refusal a protected file is written or deleted with
 * (`target-integrity:<path> is part of the project's build configuration and cannot be edited`).
 */
export const PROTECTED_FILE_DETAIL = 'cannot be edited'

/** The configuration and settings scopes a tool may name: the preview's set and production's own. */
export const CONFIG_SCOPES = [WorkloadKind.Ephemeral, WorkloadKind.Production] as const

/** The level `set_inference_mode` sets: the person's own default, or one project's override. */
export const INFERENCE_LEVELS = ['account', 'project'] as const

/** What `set_inference_mode` can set — `inherit` (a project only) unsets the project's override. */
export const INFERENCE_MODES = ['cloud', 'local', 'inherit'] as const

/** Who performs the model calls in each mode, in the words every inference answer uses. */
export const INFERENCE_MODE_WORDS: Readonly<Record<string, string>> = {
  cloud: 'cloud — the platform\'s own models, billed in credits',
  local: 'local — the connected coding agent performs the platform\'s model calls',
}

/**
 * What an inference setting reaches, said by every inference tool: the default of the browser and
 * of the URL-configured host — never a stdio connector already running, whose mode is its `--llm`.
 */
export const INFERENCE_REACH = 'This is the default the web application and the URL-configured connector use. A'
  + ' stdio connector already running keeps the mode it was started with (--llm local|cloud); restart it'
  + ' with the other flag to change that session.'

/** The query parameter of the public site's hand-off address that carries the intent reference. */
export const INTENT_REF_PARAM = 'ref'

/** What `github_sync` does: send the project's commits to GitHub, or bring GitHub's into the project. */
export const GIT_SYNC_DIRECTIONS = ['push', 'pull'] as const

/** How many changed paths `git_status` names; the count is always the whole one. */
export const GIT_FILES_SHOWN = 20

/** A GitHub connection's status, in the words every git answer uses. */
export const GITHUB_STATUS_WORDS: Readonly<Record<string, string>> = {
  connected: 'connected, not published yet — publish_to_github creates or picks the repository',
  published: 'published — github_sync pushes and pulls',
  invalid: 'INVALID — GitHub refused the stored access; connect_github again',
}

/** What each push or pull outcome means, and what to do next. */
export const GIT_SYNC_WORDS: Readonly<Record<string, string>> = {
  ok: 'done',
  'up-to-date': 'nothing to do — already in step with GitHub',
  conflict: 'refused: GitHub\'s changes conflict with the project\'s, so the merge was aborted and nothing'
    + ' changed. Resolve it on GitHub (or revert the conflicting commit there), then pull again',
  rejected: 'refused: GitHub has commits the project does not — pull first, then push',
  'no-remote': 'refused: the project is not published to a repository — publish_to_github first',
  'auth-failed': 'refused: GitHub no longer accepts the stored access, so the connection is now invalid —'
    + ' connect_github again, then retry',
}

/** What `production_control` does to the published site: restart it (a stopped one comes back) or stop it. */
export const PRODUCTION_ACTIONS = ['restart', 'stop'] as const

/** What `custom_domain` does: attach a domain, ask the provider about its records again, or detach it. */
export const DOMAIN_ACTIONS = ['attach', 'verify', 'detach'] as const

/** A production workload's status, in the words every production answer uses. */
export const PRODUCTION_STATUS_WORDS: Readonly<Record<string, string>> = {
  'not-deployed': 'not running — never published, or stopped',
  building: 'building — the published site is being built from the current sources',
  deploying: 'deploying — it goes live once its address answers',
  live: 'live',
  error: 'error — the last publish or start failed',
}

/** A custom domain's collapsed status, in the words every domain answer uses. */
export const DOMAIN_STATUS_WORDS: Readonly<Record<string, string>> = {
  none: 'not attached',
  pending: 'registered — waiting for the DNS records',
  pending_validation: 'waiting for the DNS records and the certificate',
  verified: 'verified — the certificate is being issued',
  linked: 'active — the site answers on it',
  error: 'error',
}

/** What `manage_app_user` does to an end user of the generated app. */
export const APP_USER_ACTIONS = ['invite', 'update', 'remove'] as const

/** What `manage_app_grant` does: grant a permission to one subject, or take it back. */
export const APP_GRANT_ACTIONS = ['assign', 'revoke'] as const

/** What `manage_app_organization` does to an organization of the generated app and its members. */
export const APP_ORGANIZATION_ACTIONS = ['rename', 'add-member', 'update-member', 'remove-member'] as const

/** What `manage_app_group` does to a group of an organization of the generated app. */
export const APP_GROUP_ACTIONS = ['create', 'update', 'delete', 'add-members', 'remove-members'] as const

/** How many rows of one IAM listing a tool prints; the structured answer carries them all. */
export const IAM_ROWS_SHOWN = 50

/** What an `external` IAM listing means — the backend keeps it in a console of its own. */
export const IAM_EXTERNAL = 'This application\'s sign-in is managed in a console of its own (an external'
  + ' identity provider), so the platform lists nothing here — manage it there.'

/** How much of a project's activity `project_activity` reads: what happened, or also the model's words. */
export const FEED_DETAILS = [ConnectFeedDetail.Progress, ConnectFeedDetail.Thinking] as const

/** The longest one feed line is printed — the entry itself keeps its excerpt in the structured content. */
export const FEED_LINE_MAX = 400

/** An organization notice, in words — the same closed vocabulary the browser phrases as its toasts. */
export const FEED_TOAST_WORDS: Readonly<Record<string, string>> = {
  'out-of-tokens': 'a run stopped: the organization ran out of credits — the user tops up in the web application\'s Billing',
  'allowance-exhausted': 'a run stopped: the plan allowance it started on is used up — the user reads their plan in Billing',
}
