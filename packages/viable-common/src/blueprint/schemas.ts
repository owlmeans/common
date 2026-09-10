import { BlueprintCase, GameKind } from './case.js'

/**
 * What kind of product a prompt describes.
 *
 * A schema rather than a free answer because the value is a KEY: it is written onto the project
 * record, resolved into a blueprint patch on every run afterwards, and decides which dependencies
 * the tree is staged with. A model that answered "an AI-powered agent app" in prose would leave
 * the caller matching strings, and a miss there is silent — the project simply builds as the
 * default and nobody can say why.
 */
export interface BlueprintCaseChoice {
  case: BlueprintCase
  /** Only meaningful for the game case; ignored everywhere else. */
  gameKind?: GameKind
  /** One sentence, from the prompt. Recorded so a later run can disagree with it. */
  rationale: string
}

export const BlueprintCaseChoiceSchema = {
  type: 'object',
  title: 'BlueprintCaseChoice',
  description: 'Which kind of application the described product is',
  properties: {
    case: {
      type: 'string',
      enum: Object.values(BlueprintCase),
      description: 'The least capable kind that can deliver what was asked for.',
    },
    gameKind: {
      type: 'string',
      enum: Object.values(GameKind),
      description: 'Only when the case is `game`. `casual` for one player in one browser, '
        + '`online-turn` for players acting one after another, `online-live` only when the brief '
        + 'plainly asks for players acting at the same moment.',
    },
    rationale: {
      type: 'string',
      description: 'One sentence naming what in the prompt decided it.',
    },
  },
  required: ['case', 'rationale'],
  additionalProperties: false,
} as const
