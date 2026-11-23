import {
  VIABLE_FEATURE_TYPE, VIABLE_IMPROVEMENT_TYPE, VIABLE_SPEC_CARD_TYPE, VIABLE_TASK_TYPE, VIABLE_USER_STORY_TYPE, WorkRerunScope,
} from '@owlmeans/viable-common'
import type { CardTypeWord } from './types.js'

/** The type words `create_card` and `retype_card` take, `auto` first. */
export const CARD_TYPE_WORDS = ['auto', 'user-story', 'spec', 'feature', 'improvement', 'task'] as const satisfies readonly CardTypeWord[]

/** The type words a card can be retyped to — every word but `auto`. */
export const CARD_RETYPE_WORDS = ['user-story', 'spec', 'feature', 'improvement', 'task'] as const satisfies readonly CardTypeWord[]

/** Each explicit type word's planning type key. */
export const CARD_TYPE_KEYS: Readonly<Record<Exclude<CardTypeWord, 'auto'>, string>> = Object.freeze({
  'user-story': VIABLE_USER_STORY_TYPE,
  spec: VIABLE_SPEC_CARD_TYPE,
  feature: VIABLE_FEATURE_TYPE,
  improvement: VIABLE_IMPROVEMENT_TYPE,
  task: VIABLE_TASK_TYPE,
})

/** How each planning type key is said. */
export const CARD_TYPE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  [VIABLE_USER_STORY_TYPE]: 'user story',
  [VIABLE_SPEC_CARD_TYPE]: 'spec',
  [VIABLE_FEATURE_TYPE]: 'feature',
  [VIABLE_IMPROVEMENT_TYPE]: 'improvement',
  [VIABLE_TASK_TYPE]: 'task',
})

/** How many cards one `list_cards` page holds by default. */
export const CARD_PAGE_SIZE = 25

/** The heading of a task's inputs inside its description — what the task run reads them under. */
export const CARD_INPUTS_HEADING = 'Inputs (names only — a secret is typed into the task\'s secure input, never here):'

/** The most inputs one `create_card` names. */
export const CARD_INPUTS_MAX = 32

/** The longest note one input carries. */
export const CARD_INPUT_NOTE_MAX = 256

/** What a request triage answers when the connector holds no answer yet — the platform is still filing. */
export const REQUEST_ANSWER_MS = 38_000

/** What the cards tools say on a platform older than their routes. */
export const CARDS_UNSUPPORTED = 'This platform does not serve the cards tools yet (it is older than them). Use the'
  + ' story tools — list_stories, create_story, develop_story — for user stories; specs, features, improvements and'
  + ' tasks become available once the platform is updated.'

/** How long a shown Run all proposal is applied as is by `run_all_cards { confirm: true }` (30 minutes). */
export const CARDS_PLAN_MEMO_MS = 30 * 60_000

/** The scopes `rerun_card` takes — the wire values: `failed`, then `unfinished`. */
export const CARD_RERUN_SCOPES = [WorkRerunScope.Failed, WorkRerunScope.Unfinished] as const

/** How a re-run's scope is said of the cards it builds. */
export const CARD_RERUN_WORDS: Readonly<Record<WorkRerunScope, string>> = Object.freeze({
  [WorkRerunScope.Failed]: 'failed',
  [WorkRerunScope.Unfinished]: 'unfinished',
})
