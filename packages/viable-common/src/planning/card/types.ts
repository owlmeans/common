import type { Workcard } from '@owlmeans/planning'
import type { StoryDraft } from '../../areas/types.js'
import type { UserStory } from '../../ba/types.js'
import type { StoryDesign } from '../../design/types.js'
import type { StoryWriteInput } from '../../metadata/types.js'
import type {
  StoryWriteContent, ViableProjectCard, ViableProjectFields, ViableStoryCard, ViableStoryFields,
} from '../types.js'

/** Reading Viable's planning cards — a project, a user story — and what a write carries. */
export interface ViableCardHelper {
  /** A `viable:project` card — kind AND type, since a foreign provider may share either alone. */
  isViableProject: (card?: Workcard | null) => card is ViableProjectCard
  /** A `viable:user-story` card. */
  isViableStory: (card?: Workcard | null) => card is ViableStoryCard
  /** Whether a write came from a person (`web`, `connect`) rather than the platform's own runs. */
  isUserChannel: (channel?: string | null) => boolean
  projectFieldsOf: (card: Workcard) => ViableProjectFields
  /**
   * A story card's fields, with the two required ones always answered.
   *
   * An absent area reads as `guest` — the area that guards nothing — and an absent primary flag as
   * `false`, so a reader never branches on a card written by a store that dropped them.
   */
  storyFieldsOf: (card: Workcard) => ViableStoryFields
  /** The draft shape the analysis prompts and moderation take, from a card. */
  storyDraftOf: (card: Workcard) => StoryDraft
  /**
   * The aggregate the coders take, for a story CARD.
   *
   * The card wins on the narrative, the code, the area and the actor — a person may have changed any
   * of them since the design was written. The design supplies what only it knows: the entities and
   * the screens. Without a design the aggregate has no screens yet.
   */
  userStoryOf: (card: Workcard, design?: StoryDesign | null) => UserStory
  /**
   * What the metadata store writes to `docs/stories/<code>.md`, from the card and a run's content.
   *
   * The CODE is the target's only story identifier — a card id never reaches a target file — so a
   * story card without one is refused rather than filed under its id. The landing flag is carried
   * only when it is set, so every other story's frontmatter keeps the shape it always had.
   */
  storyWriteInputOf: (card: Workcard, content: StoryWriteContent) => StoryWriteInput
}
