/**
 * A presenter: a tool's structured result (and the arguments it was called with) → the shape its
 * declared `output` accepts. Pure and total — whatever arrives, it answers a value that schema
 * accepts, so the MCP host never refuses a result the tool itself produced.
 */
export interface Presenter {
  (structured: object, args: Record<string, unknown>): object
}

/** A presenter over values already read as records — what {@link PresentReadHelper.total} wraps. */
export interface RecordPresenter {
  (structured: Record<string, unknown>, args: Record<string, unknown>): Record<string, unknown>
}

/** A workload (`ConnectSlotState`) as a person reads it — never its id, slug, namespace or kind. */
export interface PresentedWorkload extends Record<string, unknown> {
  status: string
  /** The address a person opens. */
  url?: string
  initialized?: boolean
  /** Every warning it carries, phrased, without a stack trace or a sandbox path. */
  warnings: string[]
}

/**
 * How a presenter reads a platform answer it cannot trust the shape of: every reader answers a value
 * of the type it names whatever it is given, so no presenter throws or emits a value its schema
 * refuses.
 */
export interface PresentReadHelper {
  /** The value as a record — `{}` for anything that is not a plain object. */
  record: (value: unknown) => Record<string, unknown>
  /** The value as a record, or `null` for anything that is not one. */
  recordOrNull: (value: unknown) => Record<string, unknown> | null
  /** Every element of an array that is a record; `[]` for anything that is not an array. */
  records: (value: unknown) => Array<Record<string, unknown>>
  /** A string, or `fallback` (`''`). */
  text: (value: unknown, fallback?: string) => string
  /** A non-empty string, or `undefined`. */
  maybeText: (value: unknown) => string | undefined
  /** A non-empty string, or `null`. */
  textOrNull: (value: unknown) => string | null
  /** Every element of an array that is a string. */
  texts: (value: unknown) => string[]
  /** Every element of an array that is a string or `null` — a filter's areas. */
  textsOrNulls: (value: unknown) => Array<string | null>
  /** A finite number, or `fallback` (`0`). */
  count: (value: unknown, fallback?: number) => number
  /** A finite number, or `undefined`. */
  maybeCount: (value: unknown) => number | undefined
  /** A finite number, or `null`. */
  countOrNull: (value: unknown) => number | null
  /** A boolean, or `fallback` (`false`). */
  flag: (value: unknown, fallback?: boolean) => boolean
  /** A boolean, or `undefined`. */
  maybeFlag: (value: unknown) => boolean | undefined
  /** The calendar day (`YYYY-MM-DD`) of an ISO timestamp — what a person reads — or `undefined`. */
  day: (value: unknown) => string | undefined
  /**
   * A warning or error the platform stored, phrased like a thrown refusal, then {@link clean}ed;
   * `undefined` when there is none.
   */
  warning: (value: unknown) => string | undefined
  /**
   * A message a tool relays as it was said (git's, a migration's): its stack-trace lines and the
   * sandbox's root path removed; `undefined` when nothing is left.
   */
  clean: (value: unknown) => string | undefined
  /** `https://<host>` for a host name (a value that already has a scheme is kept), or `undefined`. */
  url: (host: unknown) => string | undefined
  /** The project a result names — its own `projectId`, else the call's, else `''`. */
  project: (structured: Record<string, unknown>, args: Record<string, unknown>) => string
  /** A workload as a person reads it, or `null` when the value is not one. */
  workload: (value: unknown) => PresentedWorkload | null
  /** The record without its `undefined` members, so an absent optional is absent, not `undefined`. */
  compact: (value: Record<string, unknown>) => Record<string, unknown>
  /**
   * The presenter made total: both values read as records, and should anything still throw, the
   * presenter's answer for an empty result — which every reader turns into a value its schema accepts.
   */
  total: (present: RecordPresenter) => Presenter
}

/** The project settings, configuration and organization branding tools. */
export interface SettingsPresentHelper {
  /** project_settings, update_project_settings and set_platform_credit. */
  settings: Presenter
  /** project_configuration, update_project_configuration and recollect_configuration — no secret value. */
  configuration: Presenter
  /** organization_branding and update_organization_branding. */
  organization: Presenter
  /** backfill_project_branding. */
  backfill: Presenter
}

/** The account tools: access tokens, marketing consents and the public site's prompt. */
export interface AccountPresentHelper {
  /** list_access_tokens — the id kept because revoke_access_token names it; never the secret. */
  tokens: Presenter
  /** revoke_access_token. */
  revokedToken: Presenter
  /** privacy_choices. */
  privacy: Presenter
  /** withdraw_marketing_consent — with nothing to withdraw, or with the choices as they now stand. */
  withdrawn: Presenter
  /** pickup_intent. */
  intent: Presenter
}

/** The generated files and the preview. */
export interface WorkspacePresentHelper {
  /** list_files — the sources, or one kind of metadata document. */
  files: Presenter
  /** read_file — the path and size; the content is the text's. */
  file: Presenter
  /** write_file and delete_file — whether the preview was rebuilt, or why not. */
  written: Presenter
  /** preview_control, every action. */
  preview: Presenter
}

/** A new project's files. */
export interface MaterialsPresentHelper {
  /** create_project_with_files — the project status, and what became of each file. */
  created: Presenter
  /** list_materials — the catalogue and where the files stand. */
  catalogue: Presenter
  /** read_material — the path, where the text came from and its size; the text is the answer's. */
  text: Presenter
}

/** The git and GitHub tools. */
export interface GitPresentHelper {
  /** git_status — the connection and the working tree. */
  status: Presenter
  /** git_history — each commit with the hash git_revert names. */
  history: Presenter
  /** git_commit. */
  commit: Presenter
  /** git_discard — the tree after the discard. */
  discard: Presenter
  /** git_revert — the commit gone back to, the new one, and what the migration said. */
  revert: Presenter
  /** connect_github — the address the person opens. */
  authorize: Presenter
  /** publish_to_github. */
  published: Presenter
  /** github_sync — a refused sync included. */
  sync: Presenter
  /** disconnect_github. */
  disconnected: Presenter
  /** github_repositories — a page of repositories, or of one repository's branches. */
  repositories: Presenter
  /** link_github_origin. */
  linked: Presenter
}

/** The production tools. */
export interface ProductionPresentHelper {
  /** production_status, publish_production and production_control (every action). */
  status: Presenter
  /** custom_domain, every action — with the DNS records the person creates. */
  domain: Presenter
  /** production_auth — whether the client secret is set, never the secret. */
  auth: Presenter
  /** set_production_redirects. */
  redirects: Presenter
}

/** The tools of the generated application's own sign-in — by profileId, entitySlug and group key. */
export interface IamPresentHelper {
  /** app_users — one application's, or every application's of the organization. */
  users: Presenter
  /** manage_app_user, every action. */
  user: Presenter
  /** app_permissions. */
  permissions: Presenter
  /** set_app_permission_default. */
  permission: Presenter
  /** app_grants. */
  grants: Presenter
  /** manage_app_grant, every action. */
  grant: Presenter
  /** app_organizations — the organizations, or one organization's members. */
  organizations: Presenter
  /** manage_app_organization, every action. */
  organization: Presenter
  /** app_groups — one organization's groups, or one group's members. */
  groups: Presenter
  /** manage_app_group, every action. */
  group: Presenter
}
