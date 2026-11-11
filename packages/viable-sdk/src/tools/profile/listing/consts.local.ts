import { z } from 'zod'
import { DESTRUCTIVE, IDEMPOTENT_WRITE, READ_ONLY, WRITE } from '../../consts.js'
import type { ToolAnnotations } from '../../types.js'
import type { ToolSplit } from '../types.js'
import type { ListingTextRule, ListingToolPresentation } from './types.js'

// ── The annotation shapes of the listing ─────────────────────────────────────────────────────────
//
// MCP semantics, applied per tool (the table below names one for EVERY tool a listing offers):
// - readOnlyHint — the tool changes nothing.
// - destructiveHint — it may overwrite, delete, replace or rewrite code or data: an update, a
//   regeneration, a develop/modify/reinitialize, a write, a discard, a revert, a revocation, a
//   removal, a detach, a stop that ends a running thing. False only where the tool is purely additive.
// - idempotentHint — calling it again with the same arguments has no further effect. A call that
//   starts paid model work again, or adds another record, is never idempotent.
// - openWorldHint — its effect is visible outside the person's OwlMeans account: the live
//   production site, a custom domain at its DNS provider, GitHub, a person given access by e-mail,
//   an external repository read.

/** Changes nothing. */
const READ: ToolAnnotations = READ_ONLY

/** Changes nothing on the platform, and reads a system beyond it (GitHub). */
const READ_OPEN: ToolAnnotations = Object.freeze({ ...READ_ONLY, openWorldHint: true })

/** Adds something; calling it again adds (or starts) it again. */
const ADDS: ToolAnnotations = WRITE

/** Adds something beyond the account; calling it again adds it again. */
const ADDS_OPEN: ToolAnnotations = Object.freeze({ ...WRITE, openWorldHint: true })

/** Adds or sets something additively; calling it again changes nothing more. */
const ENSURES: ToolAnnotations = IDEMPOTENT_WRITE

/** Additive and idempotent, beyond the account. */
const ENSURES_OPEN: ToolAnnotations = Object.freeze({ ...IDEMPOTENT_WRITE, openWorldHint: true })

/** Overwrites, deletes or replaces to a value; calling it again changes nothing more. */
const REPLACES: ToolAnnotations = Object.freeze({ ...DESTRUCTIVE, idempotentHint: true })

/** Replaces something visible beyond the account; calling it again changes nothing more. */
const REPLACES_OPEN: ToolAnnotations = Object.freeze({ ...DESTRUCTIVE, idempotentHint: true, openWorldHint: true })

/** Rewrites code or data; calling it again rewrites (and, where it is model work, spends) again. */
const REWRITES: ToolAnnotations = DESTRUCTIVE

/** Rewrites what is visible beyond the account; calling it again does it again. */
const REWRITES_OPEN: ToolAnnotations = Object.freeze({ ...DESTRUCTIVE, openWorldHint: true })

/** How a conversion is paid — the base description's sentence without its inference-mode clause. */
const CONVERSION_PAID = 'A plan that includes a project conversion covers its AI work up to the conversion limit'
  + ' (1,000,000 credits); beyond it the organization\'s credit limits are spent first, then topped-up credits,'
  + ' and every stage has an estimate. A step that would use the plan\'s conversion or spend credits first'
  + ' answers with what it costs and starts nothing: tell the user, and repeat the call with confirm: true only'
  + ' after they agree.'

const PREVIEW_ONLY = ' The published production site is never touched.'

const PRODUCTION_ONLY = ' The preview is never touched.'

const APP_SCOPED = ['projectId', 'scope'] as const

/**
 * The seven multi-action tools of the catalogue, one tool per action under a listing. Each variant
 * takes exactly the fields its action reads in the base tool's `run` (`projectId` and, for the
 * generated application's sign-in, `scope` — every action reads both).
 */
export const LISTING_SPLITS: readonly ToolSplit[] = Object.freeze([
  {
    tool: 'preview_control',
    argument: 'action',
    variants: [
      {
        name: 'start_preview', value: 'start', title: 'Start the preview', fields: ['projectId'], annotations: ENSURES,
        description: 'Start a project\'s PREVIEW — the live development copy its sources run in —, creating its'
          + ' workload when it has none. Starting a preview that already runs changes nothing.' + PREVIEW_ONLY,
      },
      {
        name: 'restart_preview', value: 'restart', title: 'Restart the preview', fields: ['projectId'], annotations: ADDS,
        description: 'Restart a project\'s PREVIEW from its current sources — the repair for a preview that stopped'
          + ' answering; its sources and data are kept. Calling it again restarts it again.' + PREVIEW_ONLY,
      },
      {
        name: 'stop_preview', value: 'stop', title: 'Stop the preview', fields: ['projectId'], annotations: REPLACES,
        description: 'Stop a project\'s PREVIEW: its address stops answering until start_preview starts it again;'
          + ' its sources and data are kept.' + PREVIEW_ONLY,
      },
      {
        name: 'rebuild_preview', value: 'rebuild', title: 'Rebuild the preview from scratch', fields: ['projectId'],
        annotations: REWRITES,
        description: 'Rebuild a project\'s PREVIEW from scratch — a clean dependency install and build, the repair for'
          + ' a preview that will not build. It goes on after the answer, holding the project lock (project_status'
          + ' shows it); calling it again starts another rebuild.' + PREVIEW_ONLY,
      },
    ],
  },
  {
    tool: 'production_control',
    argument: 'action',
    variants: [
      {
        name: 'restart_production', value: 'restart', title: 'Restart the production site', fields: ['projectId'],
        annotations: REWRITES_OPEN,
        description: 'Redeploy the last published build of a project\'s PRODUCTION site, which real users reach —'
          + ' a stopped site comes back and takes one of the plan\'s published sites again. Calling it again'
          + ' redeploys it again.' + PRODUCTION_ONLY,
      },
      {
        name: 'stop_production', value: 'stop', title: 'Stop the production site', fields: ['projectId'],
        annotations: REPLACES_OPEN,
        description: 'Take a project\'s PRODUCTION site offline for its users and give its published site back to the'
          + ' plan — its data is kept, and restart_production brings it back. Ask the user first.' + PRODUCTION_ONLY,
      },
    ],
  },
  {
    tool: 'custom_domain',
    argument: 'action',
    variants: [
      {
        name: 'attach_custom_domain', value: 'attach', title: 'Attach a custom domain', fields: ['projectId', 'domain'],
        annotations: REPLACES_OPEN,
        description: 'Attach a domain the user owns to a project\'s PRODUCTION site (a feature the plan must include)'
          + ' — answered with the two DNS records they create at their DNS provider; verify_custom_domain checks'
          + ' them once they are in place. A different domain attached before is detached and replaced by this one;'
          + ' attaching the same one again changes nothing. A domain attached to another project is refused, and a'
          + ' project with no production site yet is told to publish first.',
      },
      {
        name: 'verify_custom_domain', value: 'verify', title: 'Check the custom domain\'s DNS records',
        fields: ['projectId'], annotations: ENSURES_OPEN,
        description: 'Ask the DNS provider again whether the records of a project\'s custom domain are in place, and'
          + ' answer the domain\'s status with the records still to be created. Nothing changes but the recorded'
          + ' status.',
      },
      {
        name: 'detach_custom_domain', value: 'detach', title: 'Detach the custom domain', fields: ['projectId'],
        annotations: REPLACES_OPEN,
        description: 'Remove the custom domain from a project\'s PRODUCTION site: the domain stops serving it and the'
          + ' generated address keeps serving. Attaching it again needs its DNS records checked again.',
      },
    ],
  },
  {
    tool: 'manage_app_user',
    argument: 'action',
    variants: [
      {
        name: 'invite_app_user', value: 'invite', title: 'Invite a person to the generated app',
        fields: [...APP_SCOPED, 'email', 'name', 'role'], annotations: ENSURES_OPEN,
        description: 'Give a person access to a project\'s generated application by their e-mail, optionally with a'
          + ' name and a role; they sign in with that e-mail. Find-or-create: inviting someone who is already a'
          + ' user of it changes nothing.',
      },
      {
        name: 'update_app_user', value: 'update', title: 'Change an app user',
        fields: [...APP_SCOPED, 'profileId', 'name', 'role', 'disabled'], annotations: REPLACES,
        description: 'Change an end user of a project\'s generated application (profileId — app_users lists them):'
          + ' their name, their role, or whether their sign-in is blocked (disabled). What you leave out keeps its'
          + ' value.',
      },
      {
        name: 'remove_app_user', value: 'remove', title: 'Remove an app user',
        fields: [...APP_SCOPED, 'profileId', 'confirm'], annotations: REPLACES,
        description: 'Remove an end user (profileId) from a project\'s generated application — their account and'
          + ' other applications stay. It needs the user\'s agreement: ask first, then call it with confirm: true.',
      },
    ],
  },
  {
    tool: 'manage_app_grant',
    argument: 'action',
    variants: [
      {
        name: 'assign_app_grant', value: 'assign', title: 'Grant a permission in the generated app',
        fields: [...APP_SCOPED, 'permission', 'profileId', 'group', 'entitySlug', 'resources', 'mode'],
        annotations: ENSURES,
        description: 'Grant one of the generated application\'s permissions (app_permissions lists them) to exactly'
          + ' ONE subject — a user (profileId; entitySlug binds the grant to that organization when the permission'
          + ' is organization-bound) or a group (group with its entitySlug). A per-record permission takes'
          + ' resources (record ids) or covers every record; mode (blanket or resources) names which form when'
          + ' both exist. Granting what the subject already holds changes nothing.',
      },
      {
        name: 'revoke_app_grant', value: 'revoke', title: 'Revoke a permission in the generated app',
        fields: [...APP_SCOPED, 'permission', 'profileId', 'group', 'entitySlug', 'resources', 'mode'],
        annotations: REPLACES,
        description: 'Take one of the generated application\'s permissions back from exactly ONE subject — a user'
          + ' (profileId) or a group (group with its entitySlug). Revoking a whole permission RESTRICTS the'
          + ' subject: it also loses what it inherits (a default, a group, a bundle) until a revoke with mode:'
          + ' inherit takes back only its own grant or restriction, so it holds what it inherits again.',
      },
    ],
  },
  {
    tool: 'manage_app_organization',
    argument: 'action',
    variants: [
      {
        name: 'rename_app_organization', value: 'rename', title: 'Rename an organization of the generated app',
        fields: [...APP_SCOPED, 'entitySlug', 'title'], annotations: REPLACES,
        description: 'Give an organization of a project\'s generated application (entitySlug — app_organizations'
          + ' lists them) a new title; its slug stays.',
      },
      {
        name: 'add_app_organization_member', value: 'add-member', title: 'Add a member to an organization',
        fields: [...APP_SCOPED, 'entitySlug', 'email', 'name', 'owner'], annotations: ENSURES_OPEN,
        description: 'Give a person a place in an organization of a project\'s generated application by their'
          + ' e-mail (owner: true makes them one of its owners). Find-or-create: adding a member who is already'
          + ' there changes nothing.',
      },
      {
        name: 'update_app_organization_member', value: 'update-member', title: 'Change an organization member',
        fields: [...APP_SCOPED, 'entitySlug', 'profileId', 'owner', 'groups'], annotations: REPLACES,
        description: 'Change a member (profileId) of an organization of a project\'s generated application: their'
          + ' owner flag, or their whole group list (groups replaces it). The last owner always stays one.',
      },
      {
        name: 'remove_app_organization_member', value: 'remove-member', title: 'Remove an organization member',
        fields: [...APP_SCOPED, 'entitySlug', 'profileId'], annotations: REPLACES,
        description: 'Remove a member (profileId) from an organization of a project\'s generated application. The last'
          + ' owner always stays one.',
      },
    ],
  },
  {
    tool: 'manage_app_group',
    argument: 'action',
    variants: [
      {
        name: 'create_app_group', value: 'create', title: 'Create a group in the generated app',
        fields: [...APP_SCOPED, 'entitySlug', 'group', 'title'], annotations: ENSURES,
        description: 'Create a group in an organization of a project\'s generated application, by its key and an'
          + ' optional title. Find-or-create: a group that exists already is answered as it is.',
      },
      {
        name: 'update_app_group', value: 'update', title: 'Change a group of the generated app',
        fields: [...APP_SCOPED, 'entitySlug', 'group', 'title', 'bundles'], annotations: REPLACES,
        description: 'Change a group of an organization of a project\'s generated application: its title, or what it'
          + ' grants (bundles — the WHOLE list, it replaces the group\'s). The platform\'s own staff group keeps its'
          + ' bundles; its permissions are granted with assign_app_grant (group).',
      },
      {
        name: 'delete_app_group', value: 'delete', title: 'Delete a group of the generated app',
        fields: [...APP_SCOPED, 'entitySlug', 'group', 'confirm'], annotations: REPLACES,
        description: 'Delete a group of an organization of a project\'s generated application — what it grants is'
          + ' taken from every member. It needs the user\'s agreement: ask first, then call it with confirm: true.'
          + ' The platform\'s own staff group cannot be deleted.',
      },
      {
        name: 'add_app_group_members', value: 'add-members', title: 'Add members to a group',
        fields: [...APP_SCOPED, 'entitySlug', 'group', 'profileIds'], annotations: ENSURES,
        description: 'Add people (profileIds) to a group of an organization of a project\'s generated application; a'
          + ' member already in it stays as they are.',
      },
      {
        name: 'remove_app_group_members', value: 'remove-members', title: 'Remove members from a group',
        fields: [...APP_SCOPED, 'entitySlug', 'group', 'profileIds'], annotations: REPLACES,
        description: 'Remove people (profileIds) from a group of an organization of a project\'s generated'
          + ' application; they lose what the group grants.',
      },
    ],
  },
])

/**
 * The listing's own title, description and annotations of every tool a listing may offer that is
 * not split — the annotation of each one decided here, the description where the catalogue's does
 * not say what a listing must: that the tool spends credits, that calling it again repeats its
 * effect, nothing about a mode a listing never runs in.
 */
export const LISTING_TOOLS: Readonly<Record<string, ListingToolPresentation>> = Object.freeze({
  // ── Descriptions and statuses ──────────────────────────────────────────────────────────────────
  describe_blueprints: {
    annotations: READ,
    description: 'Read the installed blueprint registry, its complete case list, supported app categories,'
      + ' tenancy and planning resources. Call before choosing a project type. Read-only: it needs no project'
      + ' and spends no credits.',
  },
  describe_platform: {
    annotations: READ,
    description: 'Everything the platform runs — building an application from a description, implementing user'
      + ' stories, converting an application you already have — what every application it generates carries,'
      + ' and which of it you can drive from here. Read it before deciding how to approach a request. Needs no'
      + ' project and makes no network call.',
  },
  session_status: {
    annotations: READ,
    description: 'The mode, the attached project, what this connection has handled so far, and how the platform'
      + ' sees this connection.',
  },
  project_status: { annotations: READ },
  list_projects: { annotations: READ },
  story_status: { annotations: READ },
  list_stories: { annotations: READ },
  search_stories: { annotations: READ },
  story_batch_status: { annotations: READ },
  pipeline_status: { annotations: READ },
  check_convertible: { annotations: READ },
  conversion_status: { annotations: READ },
  describe_planning_kits: { annotations: READ },
  project_settings: { annotations: READ },
  project_configuration: { annotations: READ },
  organization_branding: { annotations: READ },
  list_access_tokens: { annotations: READ },
  privacy_choices: { annotations: READ },
  list_files: { annotations: READ },
  read_file: { annotations: READ },
  list_materials: { annotations: READ },
  read_material: { annotations: READ },
  git_status: { annotations: READ },
  git_history: { annotations: READ },
  github_repositories: { annotations: READ_OPEN },
  production_status: { annotations: READ },
  production_auth: { annotations: READ },
  app_users: { annotations: READ },
  app_permissions: { annotations: READ },
  app_grants: { annotations: READ },
  app_organizations: { annotations: READ },
  app_groups: { annotations: READ },
  list_slots: { annotations: READ },
  project_activity: { annotations: READ },
  notifications: { annotations: READ },
  file_changes: { annotations: READ },
  local_status: { annotations: READ },
  local_setup_guide: { annotations: READ },

  // ── Projects ───────────────────────────────────────────────────────────────────────────────────
  create_project: {
    annotations: ADDS,
    description: 'Describe the application in a sentence or two. The platform writes a specification, names it'
      + ' and drafts a vision — model work that spends credits (the plan\'s project allowance first). Returns'
      + ' the project status; read the draft and call confirm_project. Each call drafts another project, so'
      + ' calling it again spends again.',
  },
  create_project_with_files: {
    annotations: ADDS,
  },
  confirm_project: {
    annotations: ENSURES,
    description: 'Confirm the drafted project, optionally editing what the analysis produced. This is what starts'
      + ' the build: the template lands, dependencies install, the whole application is drawn — model work that'
      + ' spends credits, or the plan\'s project allowance where it covers it. Returns the project status while'
      + ' the build continues on the platform. Only a drafted project is confirmed, so calling it again starts'
      + ' no second build.',
  },
  attach_project: { annotations: ENSURES },
  reinitialize_project: {
    annotations: REWRITES,
    description: 'Wipe the generated sources and lay the template down again, then draw the application anew —'
      + ' model work that spends credits unless the plan\'s project allowance still covers it. The user stories'
      + ' are KEPT and reset to planned; the configuration and git history survive. Calling it again wipes and'
      + ' rebuilds again, and spends again.',
  },
  rename_project: {
    annotations: REWRITES,
    description: 'Give the product a new name. The platform renames the project record, restates the name in its'
      + ' specification and vision, and its coding agent restates it through the app\'s code (titles, copy,'
      + ' docs). The project\'s web address does not change. A new name is model work that spends credits like'
      + ' an open-ended change; a new description alone spends none. Calling it again renames and spends again.'
      + ' Returns project status.',
  },
  delete_project: {
    annotations: REPLACES_OPEN,
    description: 'Delete a project and everything it owns: its preview and its production site (the live site and'
      + ' its custom domain go offline), its user stories and documents, its configuration and secrets. This'
      + ' CANNOT be undone — ask the user first. The project is always named: the attached one is never deleted'
      + ' by default.',
  },
  apply_planning_kit: { annotations: REPLACES },

  // ── Settings, configuration and branding ───────────────────────────────────────────────────────
  update_project_settings: { annotations: REPLACES },
  set_platform_credit: { annotations: REPLACES },
  update_project_configuration: { annotations: REPLACES },
  recollect_configuration: {
    annotations: ADDS,
    description: 'Let the platform\'s own agent read the generated sources again for the environment variables'
      + ' they use, and declare any the configuration does not list yet — after a change that added one. It is'
      + ' a model call that spends credits; calling it again reads the sources again and spends again. Answers'
      + ' the configuration as it then stands.',
  },
  update_organization_branding: { annotations: REPLACES },
  backfill_project_branding: { annotations: ENSURES },

  // ── The account ────────────────────────────────────────────────────────────────────────────────
  revoke_access_token: { annotations: REPLACES },
  withdraw_marketing_consent: { annotations: REPLACES },
  pickup_intent: {
    annotations: ADDS,
    description: 'Collect the project idea a visitor typed on the OwlMeans public site, by the code of the address'
      + ' it sent them to (/start?ref=… — the whole address may be given). A code works ONCE and only for two'
      + ' minutes: calling it again with the same code is refused. The prompt is then the user\'s to build with'
      + ' create_project once they confirm it.',
  },

  // ── Stories and the agent ──────────────────────────────────────────────────────────────────────
  create_story: {
    annotations: ADDS,
    description: 'Add a story in your own words. The platform rewrites it in the form its pipeline needs and'
      + ' decides which area of the application it belongs to — a short model call that spends credits. Each'
      + ' call adds another story, so calling it again adds a second one.',
  },
  update_story: {
    annotations: REWRITES,
    description: 'Change what a story says. The platform rewrites the new wording in the form its pipeline needs'
      + ' — a short model call that spends credits; calling it again rewrites it and spends again. Its status'
      + ' is not changed — develop_story does that.',
  },
  delete_story: { annotations: REPLACES },
  develop_story: {
    annotations: REWRITES,
    description: 'Ask the platform to design and build one story: its screens, its data, its endpoints, its'
      + ' navigation. Stories may extend an existing collection/detail host; editing, deletion and owned children'
      + ' are contextual controls. This takes many minutes and spends credits (the plan\'s story allowance'
      + ' first). Returns the story status. A story already in progress is refused; calling it again once its'
      + ' run has ended starts another development and spends again.',
  },
  reset_story: { annotations: REPLACES },
  complete_story: { annotations: REPLACES },
  start_story_batch: {
    annotations: REWRITES,
    description: 'Hand several planned stories to the platform at once — the web application\'s Run all. It first'
      + ' orders them for building (a story comes after the records, screens and navigation it builds on), then'
      + ' implements them one at a time, each exactly as a single development would and each spending credits'
      + ' (the plan\'s story allowance first); a story that fails does not stop the rest. Leave storyIds out for'
      + ' every planned story. Takes many minutes per story and returns the batch — follow it with'
      + ' story_batch_status. A second batch is refused while one runs; calling it again after it has ended'
      + ' starts another batch. For one story, use develop_story.',
  },
  cancel_story_batch: { annotations: REPLACES },
  modify_project: {
    annotations: REWRITES,
    description: 'Describe a change in words and let the platform\'s own coding agent make it — model work that'
      + ' spends credits. For anything that is not a user story: a fix, a styling change. To rename the product,'
      + ' use rename_project. Returns project status. Each call is a new change: calling it again makes it again'
      + ' and spends again.',
  },
  steer_agent: {
    annotations: ADDS,
    description: 'Add a message to the open-ended change the platform\'s agent is making right now (modify_project,'
      + ' rename_project) — a correction, a detail, a priority. It is checked like any prompt, read before the'
      + ' agent\'s next model call, and the agent goes on from there; it starts no paid work of its own. Only a'
      + ' running open-ended change takes messages; to ask for a new change, use modify_project. Each call adds'
      + ' another message, so calling it again sends it twice.',
  },
  stop_agent: { annotations: REPLACES },
  resume_pipeline: {
    annotations: REWRITES,
    description: 'Pick a crashed or interrupted run up where it stopped, rather than starting over — after fixing'
      + ' whatever it failed on. Its model work is free under the plan allowance it started on, otherwise it'
      + ' spends credits. Calling it again re-enters the run again, so call it once per stop.',
  },
  next_question: {
    annotations: ADDS,
    description: 'The platform sometimes needs a decision only the person you are working for can make. Returns'
      + ' one question to put to them, or says there is none; calling it again hands over the next one (pass'
      + ' questionId to read one again). Domain status responses also include parked questions directly.',
  },
  answer_question: {
    annotations: ADDS,
    description: 'Send the person\'s answer to a question the platform asked. If it is not one the question'
      + ' allows, this says so and the question stays open. Answer with declined: true when nobody is available'
      + ' to decide — the platform then assumes and records an assumption. An answer that resumes a parked run'
      + ' continues its model work, which spends credits unless the plan allowance it started on covers it. An'
      + ' answered question is closed: calling it again is refused.',
  },

  // ── Conversions ────────────────────────────────────────────────────────────────────────────────
  convert_project: {
    annotations: REWRITES_OPEN,
    description: 'Bring an existing application onto the platform: it reads the code (a GitHub repository given'
      + ' as repoUrl, or the project named), restores the specification and the user stories nobody wrote down,'
      + ' and rebuilds it on the platform\'s stack. The original is kept beside it. Returns conversion status and'
      + ` stops at your decision after each stage. ${CONVERSION_PAID} Without a project named, each call files`
      + ' another conversion — name the project when calling it again.',
  },
  proceed_conversion: {
    annotations: REWRITES,
    description: 'A conversion stops after each stage and waits for a decision: analyze what was read, extract the'
      + ' user stories, implement them, leave it as it stands, retry a stage that failed, or cancel. With the'
      + ' decision that starts the extraction it also takes the user\'s edits to the name, description,'
      + ' specification, vision and design system the analysis drafted — refused with any other decision.'
      + ' Returns the conversion status. A stage the conversion limit still covers runs at once.'
      + ` ${CONVERSION_PAID} A second call while that stage runs is refused; once the conversion waits again,`
      + ' calling it again decides the next stage.',
  },
  purge_origin: {
    annotations: REPLACES,
    description: 'Delete the original sources a conversion kept beside the converted project, and rewrite the'
      + ' conversion documents so they stop quoting them — model work billed as the conversion: free under the'
      + ' plan\'s conversion limit, otherwise it spends credits. This CANNOT be undone — ask the user before'
      + ' calling it. Calling it again once they are gone changes nothing.',
  },

  // ── Files, git and GitHub ──────────────────────────────────────────────────────────────────────
  write_file: { annotations: REPLACES },
  delete_file: { annotations: REPLACES },
  git_commit: {
    annotations: ADDS,
    description: 'Commit every uncommitted change of a project whose sources live in its own slot, with a message'
      + ' — what the web Git dialog\'s commit does. Refused while the platform\'s agent is working on the'
      + ' project. Calling it again commits whatever changed since.',
  },
  git_discard: { annotations: REPLACES },
  git_revert: {
    annotations: REWRITES,
    description: 'Bring back the tree of one earlier commit of a project whose sources live in its own slot, as a'
      + ' NEW commit — history is never rewritten, so the later commits stay and can be reverted to in turn.'
      + ' Uncommitted changes are committed first; the preview is rebuilt and the database migrated to the older'
      + ' code, which may not match data written since. Ask the user first. Each call adds another commit, so'
      + ' calling it again reverts again.',
  },
  connect_github: {
    annotations: ADDS_OPEN,
    description: 'Begin connecting a project whose sources live in its own slot to the user\'s GitHub account:'
      + ' answers an address the USER opens in their browser to authorize it. The connection is finished by the'
      + ' OwlMeans web application when GitHub returns there — never by a tool. Then publish_to_github, or'
      + ' github_repositories and link_github_origin for an import. Calling it again begins another'
      + ' authorization with a new address.',
  },
  publish_to_github: {
    annotations: ADDS_OPEN,
    description: 'Publish a project whose sources live in its own slot to GitHub: a NEW repository (repoName,'
      + ' private unless private is false) or one that exists (owner and repo). The project\'s commits are pushed'
      + ' there and github_sync works from then on. Never onto the repository a converted project came from'
      + ' while its original sources are still kept. Calling it again publishes again.',
  },
  github_sync: {
    annotations: REWRITES_OPEN,
    description: 'For a project published to GitHub (publish_to_github): push its commits there, or pull GitHub\'s'
      + ' into it — a pulled tree is checked before the preview is rebuilt from it, and a conflict aborts the'
      + ' merge leaving nothing changed. Never a force push. Refused while the platform\'s agent is working on'
      + ' the project. Calling it again pushes or pulls whatever changed since.',
  },
  disconnect_github: { annotations: REPLACES_OPEN },
  link_github_origin: { annotations: REPLACES_OPEN },

  // ── Production ─────────────────────────────────────────────────────────────────────────────────
  publish_production: {
    annotations: REWRITES_OPEN,
    description: 'Build the current sources of a project whose sources live in its own slot and deploy them as its'
      + ' PRODUCTION site, which real users reach — replacing whatever was published before. It holds one of the'
      + ' plan\'s published sites (a republish holds the one it has). The build goes on after the answer;'
      + ' production_status shows when it is live. Ask the user first. Each call builds and deploys again,'
      + ' replacing the live site once more.',
  },
  set_production_redirects: { annotations: REPLACES_OPEN },

  // ── The generated application's sign-in ────────────────────────────────────────────────────────
  set_app_permission_default: { annotations: REPLACES },

  // ── This machine (the local plugin) ────────────────────────────────────────────────────────────
  run_local: {
    annotations: ADDS,
    description: 'Build the generated project and start it on this machine: the API on 3000, the app on 5173. The'
      + ' build takes a while — this returns once it has started, and local_status says when it is up. Calling it'
      + ' again builds and starts it again in place of the copy already running.',
  },
  stop_local: { annotations: REPLACES },
  set_local_service: { annotations: REPLACES },
})

/** The `session_status` structured result under a listing: how the platform sees this connection. */
export const SESSION_STATUS_OUTPUT = {
  client: z.object({
    kind: z.string(),
    version: z.string().optional(),
    via: z.string(),
    inference: z.boolean(),
  }).nullable(),
}

/** Tools whose text is the user's own content (a file), which a listing's rewrite never touches. */
export const LISTING_RAW_TEXT: ReadonlySet<string> = new Set(['read_file', 'read_material'])

/**
 * The listing's wording rules for every text it answers or notifies. OpenAI's plugin guidelines
 * forbid selling credits and linking to checkout or transaction pages, so a refusal that would send
 * the person to top up — with a link — says instead that credits are managed in the web application.
 */
export const LISTING_TEXT_RULES: readonly ListingTextRule[] = Object.freeze([
  {
    // `ConnectOutOfCredits`, thrown or stored.
    pattern: /Ask the user to top up here: \S+ — then retry\./g,
    replace: 'Credits are managed in the OwlMeans web application, not through this connection: tell the user,'
      + ' and retry only after they say the account can cover it.',
  },
  {
    // A production body's bare 402.
    pattern: /Ask the user to top up in Billing in the OwlMeans web application, then call this tool again\./g,
    replace: 'Credits are managed in the OwlMeans web application, not through this connection: tell the user,'
      + ' and call this tool again only after they say the account can cover it.',
  },
  {
    // `ConnectConsentRequired` with its address.
    pattern: /Ask the user to open https?:\/\/\S+ and confirm there in the browser\./g,
    replace: 'Ask the user to open Billing in the OwlMeans web application and confirm there in the browser.',
  },
  {
    // An organization notice phrased from the feed.
    pattern: /the user tops up in the web application's Billing/g,
    replace: 'credits are managed in the OwlMeans web application',
  },
  {
    // `describe_platform`'s closing line, which a listing that publishes and attaches domains contradicts.
    pattern: /Publishing to production, custom domains and billing are done by the user in the web application, and are deliberately not offered through a connector\./g,
    replace: 'Credits, billing and the plan are managed by the user in the OwlMeans web application and are not'
      + ' offered here.',
  },
  {
    // A run waiting for a model task is performed by another connection: a listing reads the status.
    pattern: /(?<![A-Za-z0-9_])next_task(?![A-Za-z0-9_])/g,
    replace: 'project_status',
  },
])

/** An address a listing never prints: a top-up or the billing screen of the web application. */
export const LISTING_BILLING_ADDRESS = /[?&]top-up=|\/account\/billing/

/** What a billing address is said as instead. */
export const LISTING_BILLING_PLACE = 'the OwlMeans web application'

/** The listing's rules for its server instructions alone (the base text, said for a listing). */
export const LISTING_INSTRUCTION_RULES: readonly ListingTextRule[] = Object.freeze([
  {
    pattern: /which of it this session can drive/g,
    replace: 'which of it you can drive from here',
  },
  {
    pattern: /MODEL TASKS: this session runs in the cloud mode: the platform performs every model call itself — a conversion's included — so there is no task for you to collect\./g,
    replace: 'MODEL CALLS: the platform performs every model call itself, a conversion\'s included — there is no'
      + ' model task for you to run.',
  },
])

/** What every listing's instructions open with — what OwlMeans does, what it costs, what it asks. */
export const LISTING_PREFACE = [
  'OwlMeans builds full-stack web applications from a description: it writes the specification, generates the'
  + ' code, and implements user stories on request.',
  'Credits: drafting, building, developing, changing and converting an application is model work the platform'
  + ' performs and bills to the organization in credits (a plan\'s allowance is used first). Every tool that'
  + ' spends them says so in its description; reading statuses, files and settings spends none.',
  'Confirmation: a tool whose effect cannot be undone refuses without confirm: true. Ask the user, and only after'
  + ' they agree call it again with confirm: true — never on your own.',
  'Credits, billing and the plan are managed by the user in the OwlMeans web application, never through these'
  + ' tools.',
].join('\n\n')

/** What the local plugin's instructions add: the project is written into the client's workspace. */
export const LOCAL_PLUGIN_PREFACE = 'Workspace: the platform generates the application on its own models and'
  + ' writes the project\'s files into the directory this server runs in — the client\'s workspace. Do not edit'
  + ' those files while a platform run is active (project_status shows the agent busy).'
