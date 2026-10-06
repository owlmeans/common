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
      what: 'Create one, read what was drafted, list what this account has, and point the'
        + ' connector at an existing one.',
      tools: [
        'describe_capabilities', 'create_project', 'confirm_project', 'project_status',
        'list_projects', 'attach_project', 'reinitialize_project', 'rename_project',
      ],
      absent: 'no project tools are offered here',
    },
    {
      id: 'settings',
      title: 'Project settings',
      what: 'Read and change what a person edits on the project\'s control panel: the copyright'
        + ' line, the organization name, the Terms and Privacy links and the Google tag. A save'
        + ' rebuilds the preview; production takes it at the next Publish.',
      tools: ['project_settings', 'update_project_settings'],
      absent: 'project settings are changed in the web application from here',
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
        + ' List, search, add, reword and delete them, and ask for one to be implemented.',
      tools: [
        'list_stories', 'search_stories', 'create_story', 'update_story', 'delete_story',
        'develop_story', 'story_status',
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
