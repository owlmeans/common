import type { JSONSchemaType } from 'ajv'
import { ProjectArea } from '../areas/consts.js'
import { ConnectLlm, CONNECT_INQUIRY_MAX_TEXT } from '../connect/consts.js'
import { ModelRole } from '../execution/consts.js'
import {
  ArchitectureCase, ConversionStage, ConvertibilityReason, ConvertibilityVerdict, EstimateSlice,
  OriginKind, OriginState, PurposeEvidenceSource, StackFamily, StackId, TaxonomyKind, WorkspaceKind
} from './consts.js'
import type {
  AreaAlignment, ArchitectureVerdict, ConversionAnswer, ConversionEstimate,
  ConversionInventorySummary, ConversionStackRef, ConversionStructure, ConverterLlmBody,
  ConverterProjectLlmBody, DesignInference, OriginFlow, OriginFlowList, OriginProof,
  ProjectOrigin, PurposeInference, SeedDetection, StackConfirmation, StoryEstimateBand, StoryProof,
  TaxonomyEntry, TaxonomyEntryList, TaxonomyRoleList
} from './types.js'

/**
 * Two populations of schema live in this file, and they are written differently on purpose.
 *
 * **Model-answer schemas** are handed to a model as the shape its single JSON object must take.
 * They are annotated `JSONSchemaType<T>` — checked, not cast — because the answer is parsed back
 * into that exact type and a schema that has drifted from it fails at run time with a message
 * about a document rather than about a field. Every optional field is `nullable: true` WITH its
 * `type`: Ajv refuses `nullable` on its own, and a schema that fails to compile takes down
 * whatever compiled it, not the one call that would have carried the value.
 *
 * **A nullable ENUM carries `null` as one of its values.** `nullable` and `enum` are separate
 * keywords and Ajv checks them independently: `nullable: true` widens the TYPE check to admit
 * `null` and the `enum` check then refuses the very same value, so the field can only ever be
 * omitted — never sent empty. Absence and `null` are not interchangeable on either side of this
 * package: a provider's structured output writes an unset optional as `null`, and a wire body
 * where `null` MEANS something (`ConverterProjectLlmBody.llmMode` — "inherit the profile's
 * setting") cannot express it any other way. So every `enum` beside a `nullable: true` is written
 * `[...Object.values(X), null]`, which `JSONSchemaType` types as `readonly (T | null)[]` for an
 * optional member and therefore needs no cast. `tests/convert.spec.ts` walks every exported
 * schema and fails on the pair written apart.
 *
 * **Record-element schemas** describe things the PLATFORM stores and puts on the wire. They are
 * hand-written and cast, because they are re-applied as a Mongo `$jsonSchema` and that reading of
 * a schema is stricter than Ajv's: no `Record<>` maps (an open key space cannot be validated), no
 * `integer` (a stored number is a double), and dates as ISO strings rather than objects.
 */

// --- model answers --------------------------------------------------------------------------

/**
 * A pointer into the origin sources backing one claim.
 *
 * Reused inside every derived answer below, so the wording a model reads about proofs is written
 * exactly once — two copies drift, both keep validating, and the two prompts start citing
 * differently.
 */
export const OriginProofSchema: JSONSchemaType<OriginProof> = {
  type: 'object',
  title: 'OriginProof',
  description: 'A pointer into the original project sources that backs this claim',
  properties: {
    path: {
      type: 'string',
      description: 'Path of the original source file, relative to the original project root'
    },
    symbol: {
      type: 'string',
      nullable: true,
      description: 'The function, class, route or constant the claim is about'
    },
    lines: {
      type: 'array',
      nullable: true,
      // ONE item schema, never the draft-04 tuple form: a provider's structured output takes
      // `items` as a schema object and refuses an array of them outright — see `OriginProof`.
      items: { type: 'integer', minimum: 1 },
      minItems: 2,
      maxItems: 2,
      description: 'First and last line of the relevant fragment'
    },
    note: {
      type: 'string',
      description: 'One sentence saying what this fragment proves'
    },
  },
  required: ['path', 'note'],
  additionalProperties: false,
}

export const StackConfirmationSchema: JSONSchemaType<StackConfirmation> = {
  type: 'object',
  title: 'StackConfirmation',
  description: 'The framework the original project is built with, and the shape of the application',
  properties: {
    stack: {
      type: 'string',
      enum: Object.values(StackId),
      description: 'The framework that best describes the project'
    },
    alternative: {
      type: 'string',
      // `null` is a member of the enum, not a redundancy beside `nullable` — see the note above.
      // This is the field that proved it: the intake's ONE stack call is retried three times and
      // then discarded (`llm:retry-exceeded`) whenever a provider answers the absent alternative
      // as `null` rather than by leaving the key out, which OpenAI's structured output always does.
      enum: [...Object.values(StackId), null],
      nullable: true,
      description: 'The next most likely framework, when two fit almost equally well'
    },
    case: {
      type: 'string',
      enum: Object.values(ArchitectureCase),
      description: `
The shape of the application:
- spa-api - a browser application talking to a separate HTTP API
- ssr-monolith - one server rendering pages and serving its own data
- api-only - an HTTP API with no user interface of its own
- cli-pipeline - a command line tool, a batch job or an agent pipeline with no user interface
- viable-repair - the project is already an OwlMeans Viable application
      `
    },
    runtime: {
      type: 'string',
      nullable: true,
      description: 'The runtime and version the project declares, when it declares one'
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'How certain this answer is, from 0 to 1'
    },
    reason: {
      type: 'string',
      maxLength: 240,
      description: 'One sentence naming the evidence this answer rests on'
    },
  },
  required: ['stack', 'case', 'confidence', 'reason'],
  additionalProperties: false,
}

export const ArchitectureVerdictSchema: JSONSchemaType<ArchitectureVerdict> = {
  type: 'object',
  title: 'ArchitectureVerdict',
  description: 'Which of the five application shapes the original project has',
  properties: {
    case: {
      type: 'string',
      enum: Object.values(ArchitectureCase),
      description: 'The shape of the application'
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reasons: {
      type: 'array',
      items: { type: 'string', maxLength: 240 },
      description: 'The evidence behind the verdict, one sentence each'
    },
    ambiguous: {
      type: 'boolean',
      description: 'True when a second shape fits the evidence about as well as the chosen one'
    },
    uiGap: {
      type: 'boolean',
      description: 'True when the project has no user interface of its own at all'
    },
  },
  required: ['case', 'confidence', 'reasons', 'ambiguous', 'uiGap'],
  additionalProperties: false,
}

export const PurposeInferenceSchema: JSONSchemaType<PurposeInference> = {
  type: 'object',
  title: 'PurposeInference',
  description: 'What the original application is for, and who uses it',
  properties: {
    purpose: {
      type: 'string',
      description: 'What the application does for the people who use it, in two or three sentences'
    },
    audience: {
      type: 'string',
      description: 'Who those people are'
    },
    source: {
      type: 'string',
      enum: Object.values(PurposeEvidenceSource),
      description: `
Where this answer mostly came from:
- harness - the project's own written documentation
- checks - its tests
- ui - its screens and their labels
- jobs - its background work
- manifest - its package manifests alone
      `
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    evidence: { type: 'array', items: OriginProofSchema },
  },
  required: ['purpose', 'audience', 'source', 'confidence', 'evidence'],
  additionalProperties: false,
}

const TaxonomyEntrySchema: JSONSchemaType<TaxonomyEntry> = {
  type: 'object',
  title: 'TaxonomyEntry',
  description: 'One thing the original project declares at this layer',
  properties: {
    name: { type: 'string', description: 'What it is called in the original code' },
    path: { type: 'string', description: 'The file that declares it' },
    kind: {
      type: 'string',
      enum: Object.values(TaxonomyKind),
      description: 'Which layer it belongs to'
    },
    symbol: { type: 'string', nullable: true, description: 'The exported symbol, when it has one' },
    entity: {
      type: 'string',
      nullable: true,
      description: 'The domain entity it is about, when it is about one'
    },
    refs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
      description: 'Names of other entries at earlier layers that this one uses'
    },
    note: { type: 'string', nullable: true, description: 'One sentence about what it does' },
    proofs: { type: 'array', nullable: true, items: OriginProofSchema },
  },
  required: ['name', 'path', 'kind'],
  additionalProperties: false,
}

export const TaxonomyEntryListSchema: JSONSchemaType<TaxonomyEntryList> = {
  type: 'object',
  title: 'TaxonomyEntryList',
  description: 'Everything the original project declares at one layer',
  properties: {
    entries: { type: 'array', items: TaxonomyEntrySchema },
  },
  required: ['entries'],
  additionalProperties: false,
}

export const TaxonomyRoleListSchema: JSONSchemaType<TaxonomyRoleList> = {
  type: 'object',
  title: 'TaxonomyRoleList',
  description: 'The access model of the original project - who its users are and what they may do',
  properties: {
    roles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The role as the original code names it' },
          area: {
            type: 'string',
            enum: Object.values(ProjectArea),
            description: `
Which area of the application this role acts in:
- guest - not signed in
- user - a signed-in end user consuming the product's value
- operator - staff running the business process from the inside
- admin - the owner configuring the application itself
            `
          },
          evidence: { type: 'array', items: OriginProofSchema },
        },
        required: ['name', 'area', 'evidence'],
        additionalProperties: false,
      },
    },
    permissions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          roles: {
            type: 'array',
            items: { type: 'string' },
            description: 'The roles that hold this permission'
          },
          guards: {
            type: 'array',
            items: { type: 'string' },
            description: 'The middlewares, decorators or checks that enforce it'
          },
          evidence: { type: 'array', items: OriginProofSchema },
        },
        required: ['name', 'roles', 'guards', 'evidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['roles', 'permissions'],
  additionalProperties: false,
}

const OriginFlowSchema: JSONSchemaType<OriginFlow> = {
  type: 'object',
  title: 'OriginFlow',
  description: 'One thing a user or a job accomplishes end to end in the original application',
  properties: {
    id: { type: 'string', description: 'A short stable identifier, lowercase and hyphenated' },
    name: { type: 'string' },
    actor: { type: 'string', description: 'Who or what performs it' },
    area: { type: 'string', enum: Object.values(ProjectArea) },
    steps: {
      type: 'array',
      items: { type: 'string' },
      description: 'The steps in order, one short sentence each'
    },
    covered: {
      type: 'boolean',
      description: 'Whether the user stories already listed cover this flow'
    },
    kind: {
      type: 'string',
      enum: ['ui', 'job', 'cli'],
      description: 'Whether it runs on screen, as background work, or from a command line'
    },
    proofs: { type: 'array', items: OriginProofSchema },
  },
  required: ['id', 'name', 'actor', 'area', 'steps', 'covered', 'kind', 'proofs'],
  additionalProperties: false,
}

export const OriginFlowListSchema: JSONSchemaType<OriginFlowList> = {
  type: 'object',
  title: 'OriginFlowList',
  description: 'The flows the original application implements',
  properties: {
    flows: { type: 'array', items: OriginFlowSchema },
  },
  required: ['flows'],
  additionalProperties: false,
}

export const StoryProofSchema: JSONSchemaType<StoryProof> = {
  type: 'object',
  title: 'StoryProof',
  description: 'One user story restored from the original code, with the code that proves it',
  properties: {
    code: { type: 'string', description: 'The story code this answer is about' },
    narrative: {
      type: 'string',
      description: 'As a [role], I want to [do something] so that [I get the following results]'
    },
    specification: {
      type: 'string',
      description: 'What the original application actually does for this story'
    },
    ux: { type: 'string', description: 'How the user moves through it' },
    ui: { type: 'string', description: 'What it looks like' },
    proofs: { type: 'array', items: OriginProofSchema },
    algorithms: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          steps: {
            type: 'array',
            items: { type: 'string' },
            description: 'The rule the original code applies, step by step'
          },
          proof: OriginProofSchema,
        },
        required: ['name', 'steps', 'proof'],
        additionalProperties: false,
      },
      description: 'Business rules the original code implements that a rewrite must reproduce'
    },
    complexity: {
      type: 'number',
      minimum: 1,
      maximum: 2,
      description: 'How much work reproducing this story is, from 1 to 2'
    },
  },
  required: ['code', 'narrative', 'specification', 'ux', 'ui', 'proofs', 'algorithms', 'complexity'],
  additionalProperties: false,
}

export const AreaAlignmentSchema: JSONSchemaType<AreaAlignment> = {
  type: 'object',
  title: 'AreaAlignment',
  description: 'Which of the four areas each role, permission and story of the original belongs to',
  properties: {
    areas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string', enum: Object.values(ProjectArea) },
          roles: { type: 'array', items: { type: 'string' } },
          permissions: { type: 'array', items: { type: 'string' } },
          stories: {
            type: 'array',
            items: { type: 'string' },
            description: 'The codes of the stories that belong to this area'
          },
        },
        required: ['area', 'roles', 'permissions', 'stories'],
        additionalProperties: false,
      },
    },
    unmapped: {
      type: 'array',
      items: { type: 'string' },
      description: 'Roles or permissions that fit no area'
    },
  },
  required: ['areas', 'unmapped'],
  additionalProperties: false,
}

export const SeedDetectionSchema: JSONSchemaType<SeedDetection> = {
  type: 'object',
  title: 'SeedDetection',
  description: 'Which data files the application needs to make sense, and which are exports of it',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          name: { type: 'string', description: 'A short name for the data, lowercase and hyphenated' },
          seed: {
            type: 'boolean',
            description: 'True when the application needs this data to make sense'
          },
          carry: {
            type: 'boolean',
            description: 'True when the converted application should be given this data too'
          },
          reason: { type: 'string', maxLength: 240 },
        },
        required: ['path', 'name', 'seed', 'carry', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
}

export const DesignInferenceSchema: JSONSchemaType<DesignInference> = {
  type: 'object',
  title: 'DesignInference',
  description: 'The visual design of the original application, described so it can be rebuilt',
  properties: {
    concept: {
      type: 'string',
      description: 'The design concept in prose - mood, density, tone of voice'
    },
    palette: {
      type: 'array',
      items: { type: 'string' },
      description: 'The colours the original uses, as CSS colour values'
    },
    radius: { type: 'string', nullable: true, description: 'The corner radius, as a CSS length' },
    font: { type: 'string', nullable: true, description: 'The primary font family' },
  },
  required: ['concept', 'palette'],
  additionalProperties: false,
}

// --- record elements ------------------------------------------------------------------------

const isoDate = { type: 'string', maxLength: 32 } as const

export const ConversionEstimateSchema = {
  type: 'object',
  properties: {
    stage: { type: 'string', enum: Object.values(ConversionStage) },
    version: { type: 'number' },
    roles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: Object.values(ModelRole) },
          calls: { type: 'number' },
          inputTokens: { type: 'number' },
          outputTokens: { type: 'number' },
          steps: { type: 'array', items: { type: 'string', maxLength: 128 } },
        },
        required: ['role', 'calls', 'inputTokens', 'outputTokens', 'steps'],
        additionalProperties: false,
      },
    },
    inputTokens: { type: 'number' },
    outputTokens: { type: 'number' },
    usd: { type: 'number' },
    credits: { type: 'number' },
    // A delegated conversion runs its model calls on the parent agent, so `usd`/`credits` are 0
    // and this is what says the zero is a mode rather than a missing price.
    delegated: { type: 'boolean' },
    basis: {
      type: 'object',
      properties: {
        files: { type: 'number' },
        bytes: { type: 'number' },
        storyCount: { type: 'number', nullable: true },
        sampleRatio: { type: 'number' },
        retryFactor: { type: 'number' },
      },
      required: ['files', 'bytes', 'sampleRatio', 'retryFactor'],
      additionalProperties: false,
    },
    computedAt: isoDate,
  },
  required: [
    'stage', 'version', 'roles', 'inputTokens', 'outputTokens', 'usd', 'credits', 'delegated',
    'basis', 'computedAt'
  ],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConversionEstimate>

export const StoryEstimateBandSchema = {
  type: 'object',
  properties: {
    minUsd: { type: 'number' },
    maxUsd: { type: 'number' },
    minCredits: { type: 'number' },
    maxCredits: { type: 'number' },
    perStory: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string', maxLength: 32 },
          complexity: { type: 'number' },
          minUsd: { type: 'number' },
          maxUsd: { type: 'number' },
        },
        required: ['code', 'complexity', 'minUsd', 'maxUsd'],
        additionalProperties: false,
      },
    },
  },
  required: ['minUsd', 'maxUsd', 'minCredits', 'maxCredits', 'perStory'],
  additionalProperties: false,
} as unknown as JSONSchemaType<StoryEstimateBand>

export const ConversionAnswerSchema = {
  type: 'object',
  properties: {
    inquiryId: { type: 'string', minLength: 1, maxLength: 128 },
    value: { type: 'string', maxLength: CONNECT_INQUIRY_MAX_TEXT, nullable: true },
    declined: { type: 'boolean', nullable: true },
  },
  required: ['inquiryId'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConversionAnswer>

export const ConversionStackRefSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', enum: Object.values(StackId) },
    family: { type: 'string', enum: Object.values(StackFamily) },
    label: { type: 'string', maxLength: 128 },
    language: { type: 'string', maxLength: 64 },
    framework: { type: 'string', maxLength: 128, nullable: true },
  },
  required: ['id', 'family', 'label', 'language'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConversionStackRef>

export const ConversionInventorySummarySchema = {
  type: 'object',
  properties: {
    files: { type: 'number' },
    bytes: { type: 'number' },
    packages: { type: 'number' },
    workspace: { type: 'string', enum: Object.values(WorkspaceKind) },
    dumps: { type: 'number' },
    seeds: { type: 'number' },
    unlinked: { type: 'array', items: { type: 'string', maxLength: 1024 } },
    truncated: { type: 'boolean' },
  },
  required: [
    'files', 'bytes', 'packages', 'workspace', 'dumps', 'seeds', 'unlinked', 'truncated'
  ],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConversionInventorySummary>

export const ConversionStructureSchema = {
  type: 'object',
  properties: {
    areas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string', enum: Object.values(ProjectArea) },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', maxLength: 128 },
                stories: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      code: { type: 'string', maxLength: 32 },
                      title: { type: 'string', maxLength: 512 },
                      primary: { type: 'boolean', nullable: true },
                    },
                    required: ['code', 'title'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['name', 'stories'],
              additionalProperties: false,
            },
          },
        },
        required: ['area', 'sections'],
        additionalProperties: false,
      },
    },
  },
  required: ['areas'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConversionStructure>

export const ProjectOriginSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: Object.values(OriginKind) },
    repoUrl: { type: 'string', maxLength: 2048, nullable: true },
    repoFullName: { type: 'string', maxLength: 256, nullable: true },
    branch: { type: 'string', maxLength: 256, nullable: true },
    state: { type: 'string', enum: [...Object.values(OriginState), null], nullable: true },
    importedAt: { ...isoDate, nullable: true },
  },
  required: ['kind'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ProjectOrigin>

export const ConverterLlmBodySchema = {
  type: 'object',
  properties: { llmMode: { type: 'string', enum: Object.values(ConnectLlm) } },
  required: ['llmMode'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConverterLlmBody>

/** `null` is a value here, not an absence: it means "inherit the profile's setting". */
export const ConverterProjectLlmBodySchema = {
  type: 'object',
  properties: { llmMode: { type: 'string', enum: [...Object.values(ConnectLlm), null], nullable: true } },
  required: ['llmMode'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConverterProjectLlmBody>

/** The reasons a convertibility verdict can carry, for a consumer building its own enum check. */
export const ConvertibilityReasonValues = Object.values(ConvertibilityReason)
export const ConvertibilityVerdictValues = Object.values(ConvertibilityVerdict)
export const EstimateSliceValues = Object.values(EstimateSlice)
