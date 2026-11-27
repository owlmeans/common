import { z } from 'zod'
import {
  AREA_KEY_MAX, BOT_PLATFORM_ID_FORMAT, BOT_PLATFORMS_MAX, CONNECT_STRUCTURE_IDEAS_MAX, ConnectStructureStatus, ProjectArea,
  STRUCTURE_PURPOSE_MAX, StructurePartKind,
} from '@owlmeans/viable-common'

/**
 * The arguments the person's choice is given in — the tool's own spelling of `CatalogueChoice`, in the
 * words a person reads: `blueprint` is the kind of product (the code's CASE), `case` its kind of work,
 * game kind or bot kit (the code's CATEGORY). The stack is no argument while the
 * platform runs one.
 */
export const CHOICE_ARGS = ['blueprint', 'case', 'bot_platforms', 'tenancy'] as const

/** The argument that stops a creation at its structure step. */
export const REVIEW_ARG = 'review_structure'

/**
 * What the person may choose before the specification — the inputs every create and convert tool takes.
 * `blueprint` reaches the platform as the choice's `case`, `case` as its `category` (`structureToolHelper`).
 */
export const CHOICE_INPUT = {
  blueprint: z.string().min(1).max(64).optional().describe(
    'The blueprint — the kind of product: web, scalable, ai-pipeline, ai-agent, game, work-management,'
    + ' work-management-tenanted, bot or ai-bot. describe_blueprints lists them as the cases of its stack entry.'
    + ' Leave it out to let the platform classify the description.'
  ),
  case: z.string().min(1).max(64).optional().describe(
    'The case of that blueprint — a kind of work (crm, service desk…), a game kind or a bot kit. describe_blueprints'
    + ' lists them as the categories of each of its cases. Leave it out to let the platform decide.'
  ),
  bot_platforms: z.array(z.string().regex(new RegExp(BOT_PLATFORM_ID_FORMAT))).min(1).max(BOT_PLATFORMS_MAX).optional()
    .describe('The messaging platform ids a bot blueprint runs on, from describe_blueprints.'),
  tenancy: z.object({
    users: z.boolean().describe('The application\'s end users work inside organizations of their own.'),
    operators: z.boolean().describe('Its staff work inside organizations of their own.'),
  }).optional().describe('Whether the application is split into organizations (tenants) — both flags; leave it out to let the platform decide.'),
}

/** Where the choice's ids come from, in the words every description of the choice shares. */
export const CHOICE_SOURCE = 'describe_blueprints lists them: the cases of its stack entry are the blueprints, and'
  + ' the categories of each case are that blueprint\'s cases'

/**
 * How describe_blueprints' registry maps onto the choice arguments — said in its description, whose output
 * keeps the registry's own words: each entry it lists is a STACK, the platform's only one is never chosen.
 */
export const BLUEPRINTS_MAPPING = 'Each entry it lists is a stack (the platform runs one, owlmeans-fullstack-ts, and'
  + ' it is never chosen); the ids under its cases are what creating, converting or the structure step takes as'
  + ' blueprint, and the categories under each case what they take as case.'

/** What the create tools' descriptions say about the choice and the review. */
export const CHOICE_SAID = `The blueprint (the kind of product) and its case may be chosen too (${CHOICE_SOURCE};`
  + ' left out, the platform decides), and review_structure: true stops before the specification so the project'
  + ' structure can be reviewed — project_structure, then update_project_structure.'

/** What `convert_project`'s description says about the choice. */
export const CONVERT_CHOICE_SAID = `The blueprint (the kind of product) and its case may be chosen for the conversion too`
  + ` (${CHOICE_SOURCE}; left out, the platform decides); after the intake, project_structure reads`
  + ' the structure the conversion will be staged with and update_project_structure changes it before the analysis.'

/** The stop at the structure step, as `create_project` and `create_project_with_files` take it. */
export const REVIEW_INPUT = z.boolean().optional().describe(
  'Stop before the specification so the project structure can be reviewed: the platform proposes the blueprint,'
  + ' the case and the parts (applications with their areas, workers, libraries) and waits — read it with'
  + ' project_structure, change it or ask for advice with update_project_structure, and continue with'
  + ' update_project_structure. Without it the platform applies its own proposal and drafts on.'
)

/** One area of a structure as `update_project_structure` takes it. */
const AREA_INPUT = z.object({
  key: z.string().min(1).max(AREA_KEY_MAX),
  kind: z.enum(Object.values(ProjectArea) as [string, ...string[]]),
  segment: z.string().max(AREA_KEY_MAX),
  label: z.string().optional(),
  marker: z.string().optional(),
})

/** One part of a structure as `update_project_structure` takes it — the platform checks its rules. */
const PART_INPUT = z.object({
  name: z.string().min(1).max(16),
  kind: z.enum(Object.values(StructurePartKind) as [string, ...string[]]),
  purpose: z.string().min(1).max(STRUCTURE_PURPOSE_MAX).describe('What the part is for, in one or two sentences.'),
  dependsOn: z.array(z.string()).describe('The parts it builds on; a web-only part names the one api or pair it calls.'),
  mount: z.string().optional(),
  index: z.number().int().optional(),
  areas: z.array(z.string()).optional().describe('The areas an application serves, its home area first.'),
  queues: z.array(z.string()).optional().describe('The queues a worker consumes.'),
})

/** `update_project_structure`'s inputs beside the project. */
export const SUBMIT_INPUT = {
  revision: z.number().int().min(0).describe('The revision project_structure printed — a change over an older one is refused.'),
  ...CHOICE_INPUT,
  structure: z.object({ areas: z.array(AREA_INPUT).min(1), parts: z.array(PART_INPUT).min(1) }).optional().describe(
    'The whole structure as edited — project_structure prints it as JSON to start from; every part keeps a purpose.'
    + ' Leave it out to keep the structure in force.'
  ),
  advise: z.boolean().optional().describe('Ask the platform to advise an updated structure after this change — an advice round.'),
  ideas: z.string().min(1).max(CONNECT_STRUCTURE_IDEAS_MAX).optional().describe(
    'The user\'s ideas for the product, in their words — links included; they make this an advice round.'
  ),
  confirm: z.boolean().default(false).describe(
    'Set true ONLY after the user agreed to what an advice round costs. Without it, a round that would spend'
    + ' credits starts nothing and answers with its cost instead.'
  ),
}

/** What an advice round costs when the project's initialization allowance does not cover it. */
export const STRUCTURE_ADVICE_COST = 'An advice round is model work the platform performs as part of the project\'s'
  + ' initialization, and the plan\'s allowance does not cover it for this project: it is paid in credits — from the'
  + ' organization\'s credit limits first, then from topped-up credits.'

/** What the platform's `PreliminaryUnsupported` refused, by its reason. */
export const STRUCTURE_UNSUPPORTED_SUBMISSION: Readonly<Record<string, string>> = Object.freeze({
  files: 'Files cannot be attached to the structure step from a connector — write the ideas as text, links included.',
  advice: 'A conversion\'s structure step takes no advice round: send the edited structure without advise or ideas,'
    + ' then continue the conversion with proceed_conversion.',
  readonly: 'This conversion repairs a Viable project in place: its structure is the project\'s own and is shown, never'
    + ' edited. Continue the conversion as it stands with proceed_conversion.',
})

/**
 * What each of the platform's `PreliminaryChoiceInvalid` codes means, in the tools' words (the same words: a
 * blueprint and its case).
 */
export const CHOICE_ISSUE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  'stack-unknown': 'no such stack',
  'blueprint-unknown': 'no such blueprint',
  'case-unknown': 'that blueprint has no such case',
  'case-required': 'a work-management blueprint needs its case, the kind of work',
  'platforms-required': 'a bot blueprint needs its bot_platforms',
  'tenancy-required': 'the tenanted work-management blueprint needs tenancy with a flag on',
})

/** What a connector or a platform without the structure routes answers to a create or a convert with a choice. */
export const CHOICE_UNSUPPORTED = (tool: string, filed: string): string =>
  `This platform does not take a blueprint, a case, bot platforms, tenancy or a structure review from a`
  + ` connector yet, so nothing was ${filed}. Call ${tool} again without them to let the platform decide them.`

/** What a connector or a platform without the structure routes answers to the two structure tools. */
export const STRUCTURE_UNSUPPORTED = 'This platform has no structure step for connectors yet: it decides a project\'s'
  + ' structure itself. project_status shows where the project stands.'

/** What a project's structure means, in the words both structure tools' descriptions share. */
export const STRUCTURE_MEANING = 'the blueprint and case it is built as, and its parts — the applications (each with'
  + ' its areas), workers, libraries and shared code — with their purposes and dependencies'

/** The statuses in which the platform is working on the step and the person waits. */
export const STRUCTURE_WORKING: readonly string[] = Object.freeze([
  ConnectStructureStatus.Pending, ConnectStructureStatus.Analysing, ConnectStructureStatus.Advising,
  ConnectStructureStatus.Uploading,
])

/** How much of an idea's text the rendering repeats. */
export const STRUCTURE_IDEA_CAP = 200
