import { RequirementPart } from '../consts.js'

/** The heading of the card a stage's model reads. */
export const REQUIREMENTS_CARD_TITLE = 'Stated requirements this story must honour'

/** The line under the card's heading. */
export const REQUIREMENTS_CARD_INTRO = 'What the requester asked for in their own words. Every line below is a '
  + 'requirement this work must satisfy; never drop or soften one.'

/** The `##` title each part is listed under, on the card and in `docs/requirements.md`. */
export const REQUIREMENT_PART_TITLES: Readonly<Record<RequirementPart, string>> = Object.freeze({
  [RequirementPart.Tech]: 'Technical (architecture, data, packages)',
  [RequirementPart.Ba]: 'Business rules',
  [RequirementPart.Ux]: 'UX (behaviour and flow)',
  [RequirementPart.Ui]: 'UI (look)',
})

/** The heading of the target's `docs/requirements.md`. */
export const REQUIREMENTS_FILE_TITLE = 'Stated requirements'

/** The line under that heading. */
export const REQUIREMENTS_FILE_INTRO = 'What the requester asked for, in their own words, and the stories that '
  + 'honour each requirement. The project\'s requirements come from its prompt (`R…`); a story a person '
  + 'typed carries its own (`S…`) under it.'
