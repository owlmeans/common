import type { Workcard, WorkcardQuery } from '@owlmeans/planning'
import type {
  AnyViableWorkCard, ConnectCardStatus, ConnectCardsPlanView, ConnectCardsRerunView, ConnectCardsTogetherView, ConnectRequestView, WorkcardBatchView,
} from '@owlmeans/viable-common'
import type { ConnectorApi } from '../../types.js'
import type { ToolDeps } from '../types.js'

/** The type words a cards tool takes — the planning type keys a parent never has to spell. */
export type CardTypeWord = 'auto' | 'user-story' | 'spec' | 'feature' | 'improvement' | 'task'

/** What `list_cards` narrows a project's cards by. */
export interface CardFilter {
  /** A planning type key. */
  type?: string
  status?: string
  /** A container's id: its members only. */
  container?: string
}

/** One input a task names in `create_card` — never a value. */
export interface CardInput {
  name: string
  secret: boolean
  note?: string
}

/** What a create files: the planning type key, and whether the type check decides it (`auto`). */
export interface CardTypeChoice {
  type: string
  auto: boolean
}

/**
 * The cards tools' reading of work cards of every type — the type words, the queries, the card a
 * reference names, and the words every cards answer is printed in.
 */
export interface CardsToolHelper {
  /** The planning type key and the auto mark a type word stands for (`auto` files a user story the type check fits). */
  typeOf: (word: string) => CardTypeChoice
  /** How a planning type key is said: `spec`, `feature`, `user story`, `improvement`, `task`. */
  wordOf: (type: string) => string
  /** The planning query for a project's work cards (or one container's members), narrowed by the filter. */
  cardQuery: (projectId: string, filter?: CardFilter) => WorkcardQuery
  /**
   * The work card of ANY type a tool's `cardId` names — its code or its id, a code also tried
   * uppercased; never a card of another project.
   *
   * @throws {ProjectWorkcardNotFound}
   */
  resolveCard: (deps: Pick<ToolDeps, 'api'>, projectId: string, ref: string) => Promise<AnyViableWorkCard>
  /**
   * A card's description as filed: the person's text, then a task's inputs as a list a task run reads —
   * each name, whether it is a secret (typed later into the task's secure input) and its note. Never a value.
   */
  describe: (description: string | undefined, inputs?: readonly CardInput[]) => string | undefined
  /** One page of cards as lines — `code · type · status[ · in <container>]` over the title. */
  renderCards: (items: readonly Workcard[], page: number, total: number, containers?: ReadonlyMap<string, string>) => string
  /** One card's status — the card, its members, plan, proposals, a task's inputs and run — ending in the next action. */
  renderStatus: (status: ConnectCardStatus) => string
  /** Run all's proposal, with the exact call that runs it. */
  renderPlan: (projectId: string, view: ConnectCardsPlanView) => string
  /** Run together's answer, in one line (the spec's status follows it). */
  renderTogether: (view: ConnectCardsTogetherView) => string
  /** Run all's batch, started. */
  renderRunAll: (view: WorkcardBatchView) => string
  /** A container's re-run, started: the card, the scope and how many of its cards it builds (its status follows it). */
  renderRerun: (view: ConnectCardsRerunView, card: Pick<Workcard, 'type' | 'code' | 'id'>) => string
  /** What a triaged request became: the cards filed, the start, or the free flight under way. */
  renderRequest: (view: ConnectRequestView) => string
  /** Whether a failure is a platform older than the cards routes (a bare 404 naming no incident). */
  routeMissing: (error: unknown) => boolean
}

/**
 * The Run all proposal a connector last showed for a project — bound to ONE `ConnectorApi`
 * (`cardsPlanMemoOf(api)`), so `run_all_cards { confirm: true }` applies exactly the placement the user
 * agreed to on a host that stays; a host that answers one request and forgets plans again.
 */
export interface CardsPlanMemo {
  remember: (projectId: string, view: ConnectCardsPlanView) => void
  /** The proposal shown for the project within `CARDS_PLAN_MEMO_MS`, else `null`. */
  recall: (projectId: string) => ConnectCardsPlanView | null
  forget: (projectId: string) => void
}

/** What makes a plan memo — the API it serves. */
export interface CardsPlanMemoFactory {
  (api: ConnectorApi): CardsPlanMemo
}
