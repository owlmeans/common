import { ConnectLlm, ConnectTarget, ConnectWaitReason } from '@owlmeans/viable-common'
import { NEXT_QUESTION_WAIT_MS, NEXT_TASK_WAIT_MS, TOOL_DEADLINE_MS } from '../consts.js'
import type { WorkcardQuery } from '@owlmeans/planning'
import type { PlatformCatalogue, ProjectSetting } from './types.js'

/**
 * What the platform can build, as data.
 *
 * STATIC on purpose: `describe_platform` is the one tool that must answer before a token is valid
 * for anything, because it is what a parent reads to decide whether to use the platform at all.
 * Every pipeline a parent can observe has an entry, with the domain status tool named by its
 * capability group.
 */
/**
 * Tools the platform catalogue describes but the SDK does not implement: a hosting process adds
 * them through `ToolHost.extensions` (the agent-setup pair ships in `@owlmeans/viable-harness`).
 * Named here so a group can list them and a host that lacks them renders the group as absent.
 */
export const EXTENSION_TOOLS: readonly string[] = Object.freeze(['describe_harness', 'install_harness'])

export const PLATFORM_CATALOGUE: PlatformCatalogue = {
  pipelines: [
    {
      id: 'vib:project:create',
      title: 'Draft a project from a description',
      what: 'Writes the specification, names the application and drafts its vision. Nothing is'
        + ' built and no code is generated until the draft is confirmed.',
      startedBy: ['create_project'],
      resumable: false,
    },
    {
      id: 'vib:project:init',
      title: 'Build the whole application',
      what: 'Lays the template down, installs dependencies, configures the target, decides whether'
        + ' the guest home gets a landing gate, draws every screen the analysis found as a'
        + ' placeholder, writes the Terms and Privacy pages, and builds it. The long one.',
      startedBy: ['confirm_project'],
      stages: [
        'template', 'dependencies', 'serve', 'styles', 'metadata', 'primary', 'landing', 'scaffold',
        'legal', 'build',
      ],
      resumable: true,
      waitsFor: [ConnectWaitReason.ModelTask, ConnectWaitReason.LocalConnector, ConnectWaitReason.Environment],
    },
    {
      id: 'vib:project:reinit',
      title: 'Lay the template down again',
      what: 'Wipes the generated sources and rebuilds from the template. The user stories are kept'
        + ' and reset to planned; configuration and git history survive, and so does a landing-gate'
        + ' decision already made. Blank or platform-default Terms and Privacy links switch to the'
        + ' generated /terms and /privacy pages; custom ones are kept.',
      startedBy: ['reinitialize_project'],
      resumable: true,
      waitsFor: [ConnectWaitReason.ModelTask, ConnectWaitReason.LocalConnector],
    },
    {
      id: 'vib:story:develop',
      title: 'Implement one user story',
      what: 'Designs the story, then implements it: types, data, endpoints, access, state,'
        + ' components, screens and navigation, then checks that the application still boots. The'
        + ' landing gate story also puts its real component on the guest home.',
      startedBy: ['develop_story'],
      stages: ['design', 'implement', 'widget', 'landing', 'boot gate'],
      resumable: true,
      waitsFor: [ConnectWaitReason.ModelTask, ConnectWaitReason.LocalConnector],
    },
    {
      id: 'free flight',
      title: 'An open-ended change',
      what: 'The platform\'s own coding agent makes a change described in words — a fix, a styling'
        + ' pass, or restating a new name through the code. For anything that is not a user story.',
      startedBy: ['modify_project', 'rename_project'],
      resumable: true,
      waitsFor: [ConnectWaitReason.ModelTask, ConnectWaitReason.LocalConnector],
    },
    {
      id: 'resume',
      title: 'Continue a run that stopped',
      what: 'Picks a crashed or interrupted run up at the step it stopped on rather than starting'
        + ' it over. Answers with the resumed pipeline status.',
      startedBy: ['resume_pipeline'],
      resumable: true,
    },
    {
      id: 'vib:project:convert:intake',
      title: 'Read an application you already have',
      what: 'Takes stock of an existing codebase: what it is built with, what shape it has, how'
        + ' much of it can be converted and what that will cost. Ends at your decision.',
      startedBy: ['convert_project'],
      resumable: true,
      waitsFor: [ConnectWaitReason.Person, ConnectWaitReason.ModelTask, ConnectWaitReason.LocalConnector],
    },
    {
      id: 'vib:project:convert:analysis',
      title: 'Restore the analysis nobody wrote',
      what: 'Reads the origin layer by layer and produces the specification, the design and the'
        + ' main flow the platform would have written for it, then bootstraps a target around it.',
      startedBy: ['proceed_conversion'],
      resumable: true,
      waitsFor: [ConnectWaitReason.Person, ConnectWaitReason.ModelTask, ConnectWaitReason.LocalConnector],
    },
    {
      id: 'vib:project:convert:extraction',
      title: 'Recover the user stories',
      what: 'Extracts every user story out of the origin with proofs from its code, assigns each'
        + ' to an area, and prices implementing them.',
      startedBy: ['proceed_conversion'],
      resumable: true,
      waitsFor: [ConnectWaitReason.Person, ConnectWaitReason.ModelTask, ConnectWaitReason.LocalConnector],
    },
    {
      id: 'vib:project:convert:implementation',
      title: 'Re-implement it on the platform',
      what: 'Develops every extracted story with the ordinary story pipeline, with the origin kept'
        + ' beside it as evidence.',
      startedBy: ['proceed_conversion'],
      resumable: true,
      waitsFor: [ConnectWaitReason.ModelTask, ConnectWaitReason.LocalConnector],
    },
    {
      id: 'purge',
      title: 'Delete the converted origin',
      what: 'Removes the original sources kept beside the converted project, and rewrites the'
        + ' conversion documents so they stop quoting them. Cannot be undone.',
      startedBy: ['purge_origin'],
      resumable: false,
    },
  ],

  features: [
    {
      id: 'landing-gate',
      title: 'The landing gate',
      what: 'The key step of the END USER\'s workflow can begin on the guest home: in place of the'
        + ' hero\'s buttons, a card lets a visitor start it without an account, and signing in'
        + ' carries their choices to that story\'s full screen. Initialization weighs whether the'
        + ' product wants one — encouraged for web, AI-agent and AI-pipeline products, discouraged'
        + ' for games — and marks at most one story; a converted application gets none. Developing'
        + ' that story replaces the sketch with the real component.',
      tools: ['list_stories', 'story_status', 'develop_story'],
    },
    {
      id: 'legal-pages',
      title: 'Terms and Privacy pages',
      what: 'Generated at /terms and /privacy from the specification and the plan, aware of EU and'
        + ' US law, and linked from every footer beside the cookie settings. They name the'
        + ' organization and the copyright from the project settings, so changing those updates'
        + ' both pages with no new generation. The preview marks them as drafts to review before'
        + ' publishing.',
      tools: ['project_settings', 'update_project_settings'],
    },
    {
      id: 'google-tag',
      title: 'A Google tag',
      what: 'A GTM-, G-, GT-, AW- or DC- id in the project settings is held back — not merely'
        + ' denied by Consent Mode v2, but not fetched at all — until the visitor allows analytics'
        + ' or advertising cookies, on the preview and in production alike; a returning visitor who'
        + ' already granted one loads it immediately. The Privacy page gains its Google section,'
        + ' and the cookie policy lists what the tag discloses.',
      tools: ['update_project_settings'],
    },
    {
      id: 'marketing-consent',
      title: 'Marketing consent',
      what: 'Every generated project ships a post-sign-in consent step and a "Privacy choices"'
        + ' settings screen over eight standard, independently opt-in consents — email, SMS, phone'
        + ' and push marketing, behavioural profiling, sharing with partners, and the two tracker'
        + ' categories (bridged to the cookie-consent dialog, so a tracker decision made either'
        + ' place stays in sync). Decisions are kept in a server-side ledger, evidenced and dated,'
        + ' and a story that sends a marketing message or shares data with a partner must check the'
        + ' recipient\'s own saved decision before it acts — never assume consent because someone'
        + ' signed up. Service messages (a receipt, a security alert) are never gated by it.',
      tools: ['list_stories', 'story_status', 'develop_story', 'project_settings'],
    },
    {
      id: 'look',
      title: 'The look',
      what: 'A white ground in light mode and black in dark, one product accent, hairlines and'
        + ' neutral tiles, a heavy grotesk type, and an illustration of the product\'s own domain in'
        + ' the hero. No gradients, glass or glow unless the specification asks for them by name —'
        + ' a product\'s subject matter is not such a request.',
    },
    {
      id: 'production',
      title: 'Production builds',
      what: 'A published build carries no preview scaffolding: no story codes, no "preview" pills,'
        + ' no dashed placeholder frames — a placeholder widget renders as an ordinary card.',
    },
  ],

  capabilities: [
    {
      id: 'projects',
      title: 'Projects',
      what: 'Create one, read what was drafted, list what this account has and every workload it runs'
        + ' (previews, production sites, local targets), point the connector at an existing one,'
        + ' release a lock a crashed run left behind, and delete a project — the last two only once the'
        + ' user agreed (confirm: true).',
      tools: [
        'describe_capabilities', 'create_project', 'confirm_project', 'project_status',
        'list_projects', 'list_slots', 'attach_project', 'reinitialize_project', 'rename_project',
        'unlock_project_agent', 'delete_project',
      ],
      absent: 'no project tools are offered here',
    },
    {
      id: 'settings',
      title: 'Project settings',
      what: 'Read and change what a person edits on the project\'s control panel: the copyright'
        + ' line, the organization name (or the organization\'s defaults copied in), the Terms and'
        + ' Privacy links and the Google tag, and hide or show the platform credit where the plan'
        + ' includes white label. A save rebuilds the preview; production takes it at the next Publish,'
        + ' or production\'s own set is addressed with scope: production.',
      tools: ['project_settings', 'update_project_settings', 'set_platform_credit'],
      absent: 'project settings are changed in the web application from here',
    },
    {
      id: 'configuration',
      title: 'Configuration variables',
      what: 'The environment variables the generated application declares, backend and frontend:'
        + ' which still need a value, set them, and let the platform find new ones in the sources. A'
        + ' backend value is a secret and is never shown back; a frontend value is public.',
      tools: ['project_configuration', 'update_project_configuration', 'recollect_configuration'],
      absent: 'configuration variables are set in the web application from here',
    },
    {
      id: 'organization',
      title: 'The organization\'s branding defaults',
      what: 'The organization name and copyright line new projects start with: read and change them,'
        + ' and fill the projects whose settings are still blank.',
      tools: ['organization_branding', 'update_organization_branding', 'backfill_project_branding'],
      absent: 'the organization\'s defaults are changed in the web application\'s Settings from here',
    },
    {
      id: 'inference',
      title: 'Who performs the model calls',
      what: 'Read and change the user\'s default inference mode and one project\'s override: cloud (the'
        + ' platform\'s own models, billed in credits) or local (the connected coding agent performs them —'
        + ' a plan capability). It is the default of the web application and the URL-configured connector;'
        + ' a stdio connector already running keeps its --llm.',
      tools: ['inference_settings', 'set_inference_mode'],
      absent: 'the inference mode is changed in the web application\'s Settings from here',
    },
    {
      id: 'access-tokens',
      title: 'The user\'s access tokens',
      what: 'List the user\'s own access tokens and revoke one once the user agreed (confirm: true). A new'
        + ' token is never created here — only in the web application.',
      tools: ['list_access_tokens', 'revoke_access_token'],
      absent: 'access tokens are managed in the web application\'s Settings from here',
    },
    {
      id: 'privacy',
      title: 'The user\'s marketing consents',
      what: 'Read the marketing consents the user was asked for and withdraw any of them. Giving one is'
        + ' the user\'s own choice in the web application.',
      tools: ['privacy_choices', 'withdraw_marketing_consent'],
      absent: 'marketing consents are changed in the web application\'s Settings from here',
    },
    {
      id: 'intent',
      title: 'A prompt typed on the public site',
      what: 'Collect, once, the project idea a visitor typed on the OwlMeans public site, by the code of the'
        + ' /start?ref=… address it opened — then create_project with it once the user confirms.',
      tools: ['pickup_intent'],
      absent: 'a prompt typed on the public site is picked up by opening its address in the browser from here',
    },
    {
      id: 'planning-kits',
      title: 'Planning kits',
      what: 'Ready sets of card types and status flows for a work-management product, written into'
        + ' the project\'s common package: describe them, then apply one (or some of its types). The'
        + ' platform rebuilds the preview itself.',
      tools: ['describe_planning_kits', 'apply_planning_kit'],
      absent: 'planning kits are not offered here',
    },
    {
      id: 'stories',
      title: 'User stories',
      what: 'User stories are planning CARDS: each has a code, a status in the story flow'
        + ' (planned → in-progress → completed | failed), an area and a place in the flow order.'
        + ' List, search, add, reword and delete them, ask for one to be implemented, put one back to'
        + ' planned, and mark one in progress as completed.',
      tools: [
        'list_stories', 'search_stories', 'create_story', 'update_story', 'delete_story',
        'develop_story', 'reset_story', 'complete_story', 'story_status',
      ],
      absent: 'no story tools are offered here',
    },
    {
      id: 'runs',
      title: 'Runs and statuses',
      what: 'Read where a run stopped, continue it, and see what this connector is'
        + ' currently doing.',
      tools: ['pipeline_status', 'resume_pipeline', 'session_status'],
      absent: 'no run tools are offered here',
    },
    {
      id: 'feeds',
      title: 'Following the work as it happens',
      what: 'What the web application streams to the browser, read by cursor: a project\'s agent activity'
        + ' (runs, steps, card and preview changes, proposals, and on request the model\'s own words), the'
        + ' organization\'s notices, and — for a project whose tree lives in its own slot — its file changes.'
        + ' Each call answers a cursor; pass it back as after, with wait up to 20 s, to read what comes next.',
      tools: ['project_activity', 'notifications', 'file_changes'],
      absent: 'the work is followed through its domain status tools from here',
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
      what: 'Start a conversion of a codebase you already have, decide at each stage (the user\'s edits'
        + ' to the drafted name and specification travel with the extraction), read where it stands and'
        + ' what the intake made of the tree, and delete the origin afterwards.',
      tools: [
        'convert_project', 'proceed_conversion', 'conversion_status', 'check_convertible',
        'purge_origin',
      ],
      absent: 'conversion is not offered here',
    },
    {
      id: 'model-tasks',
      title: 'Performing the platform\'s model calls',
      what: 'In the delegated mode EVERY model call the platform makes for this session — project'
        + ' drafting, content checks and formatting included — is handed to you as a task to run in a'
        + ' clean subagent, and none of the account\'s credits are spent on it. A tool whose call'
        + ' waits on one answers with the task; submitting it replies with that tool\'s result.',
      tools: ['next_task', 'submit_task_result'],
      absent: 'the platform performs every model call itself — this session runs in the cloud model'
        + ' mode, or holds no session a task could be delivered through',
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
      what: 'For a project whose tree lives in its own slot: list its sources and its metadata documents'
        + ' (stories, specifications, docs/), read a file, write one whole and delete one — a write or a'
        + ' delete rebuilds the preview, and a delete only once the user agreed (confirm: true).',
      tools: ['list_files', 'read_file', 'write_file', 'delete_file'],
      absent: 'the sources are on this machine — read and edit them directly',
    },
    {
      id: 'preview',
      title: 'The preview',
      what: 'Start, restart, stop or rebuild a project\'s preview — never its published production site.',
      tools: ['preview_control'],
      absent: 'a local project runs on this machine — run_local and stop_local start and stop it',
    },
    {
      id: 'git',
      title: 'Git and GitHub',
      what: 'For a project whose tree lives in its own slot: its git status and history, commit, discard and'
        + ' go back to an earlier commit (both only once the user agreed, confirm: true); connect GitHub (an'
        + ' address the user opens in their browser — the authorization ends there), publish to a new or'
        + ' existing repository, push and pull, list the user\'s repositories and branches, record the'
        + ' repository an import comes from, and disconnect. The GitHub access itself is never shown.',
      tools: [
        'git_status', 'git_history', 'git_commit', 'git_discard', 'git_revert', 'connect_github',
        'publish_to_github', 'github_sync', 'disconnect_github', 'github_repositories', 'link_github_origin',
      ],
      absent: 'the sources and their git repository are on this machine — use git there directly',
    },
    {
      id: 'production',
      title: 'The published production site',
      what: 'For a project whose tree lives in its own slot: the production site\'s status, publish the'
        + ' current sources to it (only once the user agreed, confirm: true — a publish holds one of the'
        + ' plan\'s published sites), restart or stop it, attach a custom domain (with the DNS records the'
        + ' user creates), verify and detach it, and read and set the standalone sign-in a self-hosted copy'
        + ' uses. A custom domain and the standalone sign-in are paid features; the sign-in\'s client secret'
        + ' is never shown here. Never the preview — that is preview_control.',
      tools: [
        'production_status', 'publish_production', 'production_control', 'custom_domain', 'production_auth',
        'set_production_redirects',
      ],
      absent: 'a local project has no production site on the platform — it is deployed from this machine',
    },
    {
      id: 'app-sign-in',
      title: 'The generated application\'s users and permissions',
      what: 'The sign-in the platform runs for a generated application — the preview\'s or, with scope:'
        + ' production, the published site\'s: its end users (invite, update, remove — a removal only once the'
        + ' user agreed), its permissions and who holds them by default, grants to one user or one group, the'
        + ' organizations it has people in and their members, and their groups (a deletion only once the user'
        + ' agreed). Also every end user of every application of this organization, read-only.',
      tools: [
        'app_users', 'manage_app_user', 'app_permissions', 'set_app_permission_default', 'app_grants',
        'manage_app_grant', 'app_organizations', 'manage_app_organization', 'app_groups', 'manage_app_group',
      ],
      absent: 'the application\'s sign-in is not managed through this server',
    },
  ],

  limits: {
    toolDeadlineMs: TOOL_DEADLINE_MS,
    nextTaskWaitMs: NEXT_TASK_WAIT_MS,
    nextQuestionWaitMs: NEXT_QUESTION_WAIT_MS,
  },

  modes: {
    targets: [ConnectTarget.Cloud, ConnectTarget.Local],
    llms: [ConnectLlm.Cloud, ConnectLlm.Local],
  },
}

/**
 * {@link PlatformCatalogue.features} in one sentence, for `describe_capabilities`.
 *
 * That answer is read at the same moment as `describe_platform` — once, before anything is created
 * — by a parent that may call only one of the two. Kept beside the entries it summarises so the
 * two cannot drift apart unnoticed; the full text stays in `describe_platform`.
 */
export const GENERATED_SUMMARY = 'Every generated application carries a landing gate on the guest'
  + ' home where the product wants one, Terms and Privacy pages at /terms and /privacy, an optional'
  + ' consent-gated Google tag, a white (black in dark mode) ground with one accent, and production'
  + ' builds without preview scaffolding — describe_platform says what each means.'

/** Said where the platform refused and said nothing about why at all. */
export const UNKNOWN_REFUSAL = 'The platform refused this and said nothing about why. Read'
  + ' project_status, or conversion_status for a conversion, before retrying.'

/** Said after a marker no sentence has been written for: the marker names it, this says what next. */
export const UNPHRASED_REFUSAL = 'That is the marker the platform refused with, and nothing here'
  + ' has a sentence for it yet. Read conversion_status for a conversion, project_status'
  + ' otherwise, before deciding whether anything is worth retrying.'

/** The project settings a connector reaches, in the order the control panel shows them. */
export const PROJECT_SETTINGS: readonly ProjectSetting[] = [
  {
    key: 'copyright', label: 'copyright',
    rule: 'a line of text such as "© 2026 Acme Ltd", never empty',
  },
  {
    key: 'organizationName', label: 'organization',
    rule: 'the name of whoever runs the application, never empty',
  },
  {
    key: 'termsUrl', label: 'terms',
    rule: 'an https:// address with no user or password in it, or a path on the application itself'
      + ' starting with a single slash — /terms is the generated Terms page',
  },
  {
    key: 'privacyUrl', label: 'privacy',
    rule: 'an https:// address with no user or password in it, or a path on the application itself'
      + ' starting with a single slash — /privacy is the generated Privacy page',
  },
  {
    key: 'googleTag', label: 'google tag',
    rule: 'a Google tag id — GTM-…, G-…, GT-…, AW-… or DC-… — or an empty string to remove it',
  },
]

/**
 * The order a project's stories are read in: the flow order, then creation.
 *
 * `order` is the analysis's ordinal — a connective story sits between two flow steps at a
 * fraction — and a story somebody added by hand may carry none, so creation breaks the tie.
 */
export const STORY_ORDER: NonNullable<WorkcardQuery['sort']> = [
  { field: 'order', order: 'asc' },
  { field: 'createdAt', order: 'asc' },
]

/**
 * What marks the project's LANDING GATE story, in a story line and in a story's own status.
 *
 * The platform picks at most one story per project — the key step of the end user's workflow — and
 * draws a sketch of it on the guest home in place of the hero's call-to-action buttons: a visitor
 * starts it there without an account, and signing in carries their choices to the story's
 * full-scale screen. It is recorded as `fields.landing` on the story card, so the tools read it from
 * the card they already hold, never from a second call.
 *
 * Said because it changes what developing the story does — the development also replaces the
 * guest-home sketch with the real component — and a parent that reads only the narrative has no
 * way to know that.
 */
export const LANDING_MARK = 'landing gate'

export const LANDING_NOTE = 'landing gate story — a guest starts it on the guest home without an'
  + ' account, and signing in carries their choices to its full screen; developing it also puts the'
  + ' real component on the guest home'

/** Which of the two hosts a tool is being served from. */
export enum ToolHostKind {
  /** The npx server, on the user's machine, with a local executor. */
  Stdio = 'stdio',
  /** The platform's own URL-configured endpoint. No machine, no executor. */
  Http = 'http',
}
