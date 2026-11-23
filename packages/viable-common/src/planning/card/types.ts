import type { Workcard } from '@owlmeans/planning'
import type { WorkcardDraft } from '../../areas/types.js'
import type { UserStory } from '../../ba/types.js'
import type { WorkcardDesign } from '../../design/types.js'
import type { WorkcardWriteInput } from '../../metadata/types.js'
import type {
  WorkcardWriteContent, ViableProjectCard, ViableProjectFields, ViableWorkcard, ViableWorkcardFields,
} from '../types.js'

/** Reading Viable's planning cards — a project, a user story — and what a write carries. */
export interface ViableCardHelper {
  /** A `viable:project` card — kind AND type, since a foreign provider may share either alone. */
  isViableProject: (card?: Workcard | null) => card is ViableProjectCard
  /** A `viable:user-story` card. */
  isViableWorkcard: (card?: Workcard | null) => card is ViableWorkcard
  /** Whether a write came from a person (`web`, `connect`) rather than the platform's own runs. */
  isUserChannel: (channel?: string | null) => boolean
  projectFieldsOf: (card: Workcard) => ViableProjectFields
  /**
   * A story card's fields, with the two required ones always answered.
   *
   * An absent area reads as `guest` — the area that guards nothing — and an absent primary flag as
   * `false`, so a reader never branches on a card written by a store that dropped them.
   */
  workcardFieldsOf: (card: Workcard) => ViableWorkcardFields
  /** The draft shape the analysis prompts and moderation take, from a card. */
  workcardDraftOf: (card: Workcard) => WorkcardDraft
  /**
   * The aggregate the coders take, for a story CARD.
   *
   * The card wins on the narrative, the code, the area and the actor — a person may have changed any
   * of them since the design was written. The design supplies what only it knows: the entities and
   * the screens. Without a design the aggregate has no screens yet.
   */
  userStoryOf: (card: Workcard, design?: WorkcardDesign | null) => UserStory
  /**
   * What the metadata store writes to `docs/stories/<code>.md`, from the card and a run's content.
   *
   * The CODE is the target's only story identifier — a card id never reaches a target file — so a
   * story card without one is refused rather than filed under its id. The landing flag is carried
   * only when it is set, so every other story's frontmatter keeps the shape it always had.
   */
  workcardWriteInputOf: (card: Workcard, content: WorkcardWriteContent) => WorkcardWriteInput
}
