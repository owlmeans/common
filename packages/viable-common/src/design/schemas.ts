import type { JSONSchemaType } from 'ajv'

import { ProjectArea } from '../areas/consts.js'
import { StoryActor, StoryAgentKind } from './runtime.js'
import type { StoryDesignAgent, StoryDesignJob } from './runtime.js'
import type { StoryDesign } from './types.js'

/**
 * The design shape, validated where the shape is DEFINED.
 *
 * A record store that carried a strict `$jsonSchema` over this would have to be edited in another
 * repository every time this library added a field - which is exactly how a slot-metadata field
 * once reached the wire, missed the schema, and took out every newly provisioned slot with the
 * spec still green. So the payload is stored as JSON text and validated with THIS, by the store,
 * before the write.
 *
 * `additionalProperties: false` at every level, so a field the library dropped cannot survive in
 * an old revision and be silently read back by code that no longer knows what it meant.
 */

const specs = {
  type: 'object',
  properties: {
    ux: { type: 'string' },
    ui: { type: 'string' },
  },
  required: ['ux', 'ui'],
  additionalProperties: false,
} as const

export const StoryDesignSchema: JSONSchemaType<StoryDesign> = {
  type: 'object',
  title: 'StoryDesign',
  description: 'Everything a user story will be, decided before any of it is written',
  properties: {
    version: { type: 'integer', minimum: 1 },
    code: { type: 'string' },
    narrative: { type: 'string' },
    area: { type: 'string', enum: Object.values(ProjectArea) },
    reserved: {
      type: 'object',
      properties: {
        section: { type: 'string', nullable: true },
        screen: { type: 'string', nullable: true },
      },
      required: [],
      additionalProperties: false,
    },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          dir: { type: 'string' },
        },
        required: ['name', 'description', 'dir'],
        additionalProperties: false,
      },
    },
    screens: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          definition: { type: 'string' },
          path: { type: 'string' },
          alias: { type: 'string' },
          url: { type: 'string' },
          parent: { type: 'string' },
          section: { type: 'string', nullable: true },
          adopted: { type: 'boolean' },
          specs,
          components: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'name', 'definition', 'path', 'alias', 'url', 'parent', 'adopted', 'specs', 'components',
        ],
        additionalProperties: false,
      },
    },
    components: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          definition: { type: 'string' },
          path: { type: 'string' },
          viewModelPath: { type: 'string' },
          adopted: { type: 'boolean' },
          screen: { type: 'string' },
          entities: { type: 'array', items: { type: 'string' } },
          specs,
        },
        required: [
          'name', 'definition', 'path', 'viewModelPath', 'adopted', 'screen', 'entities', 'specs',
        ],
        additionalProperties: false,
      },
    },
    types: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          entity: { type: 'string' },
          purpose: { type: 'string' },
          components: { type: 'array', items: { type: 'string' } },
        },
        required: ['path', 'entity', 'purpose', 'components'],
        additionalProperties: false,
      },
    },
    resources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          entity: { type: 'string' },
          type: { type: 'string' },
          alias: { type: 'string' },
          purpose: { type: 'string' },
        },
        required: ['path', 'entity', 'type', 'alias', 'purpose'],
        additionalProperties: false,
      },
    },
    models: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          entities: { type: 'array', items: { type: 'string' } },
          solution: { type: 'string', nullable: true },
        },
        required: ['path', 'entities'],
        additionalProperties: false,
      },
    },
    api: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          entity: { type: 'string' },
          type: { type: 'string' },
          model: { type: 'string' },
          endpoints: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                alias: { type: 'string' },
                method: { type: 'string' },
                path: { type: 'string' },
                purpose: { type: 'string' },
              },
              required: ['alias', 'method', 'path', 'purpose'],
              additionalProperties: false,
            },
          },
        },
        required: ['path', 'entity', 'type', 'model', 'endpoints'],
        additionalProperties: false,
      },
    },
    stores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          entity: { type: 'string' },
          type: { type: 'string' },
          api: { type: 'string' },
        },
        required: ['path', 'entity', 'type', 'api'],
        additionalProperties: false,
      },
    },
    transitions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          initiator: { type: 'string' },
          action: { type: 'string' },
          type: { type: 'string' },
        },
        required: ['from', 'to', 'initiator', 'action', 'type'],
        additionalProperties: false,
      },
    },
    access: {
      type: 'object',
      properties: {
        // Keyed by entrypoint ALIAS, and the aliases come back from a model matched against
        // generated code - so the keys cannot be enumerated here, only their shape.
        list: { type: 'object', additionalProperties: true, required: [] },
        resolvedAt: { type: 'object', additionalProperties: { type: 'string' }, required: [] },
      },
      required: ['list', 'resolvedAt'],
      additionalProperties: false,
    },
    // Optional: a design written before the gate existed carries none, and every reader takes
    // "absent" as "none of it" — which is both the safe answer and the true one.
    runtime: {
      type: 'object',
      nullable: true,
      properties: {
        actor: { type: 'string', enum: Object.values(StoryActor) },
        worker: { type: 'boolean' },
        kv: { type: 'boolean' },
        feedback: { type: 'string', nullable: true },
        jobs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              queue: { type: 'string' },
              name: { type: 'string' },
              path: { type: 'string' },
              purpose: { type: 'string' },
              reason: { type: 'string' },
              idempotency: { type: 'string' },
            },
            required: ['queue', 'name', 'path', 'purpose', 'reason', 'idempotency'],
            additionalProperties: false,
          },
        },
        agents: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              alias: { type: 'string' },
              path: { type: 'string' },
              purpose: { type: 'string' },
              kind: { type: 'string', enum: Object.values(StoryAgentKind) },
              job: { type: 'string', nullable: true },
            },
            required: ['alias', 'path', 'purpose', 'kind'],
            additionalProperties: false,
          },
        },
      },
      required: ['actor', 'worker', 'kv', 'jobs', 'agents'],
      additionalProperties: false,
    },
    provenance: {
      type: 'object',
      properties: {
        designedAt: { type: 'string' },
        narrativeHash: { type: 'string' },
        projectHash: { type: 'string' },
        registryHash: { type: 'string' },
        paths: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              hash: { type: 'string' },
            },
            required: ['path', 'hash'],
            additionalProperties: false,
          },
        },
      },
      required: ['designedAt', 'narrativeHash', 'projectHash', 'registryHash', 'paths'],
      additionalProperties: false,
    },
  },
  required: [
    'version', 'code', 'narrative', 'area', 'reserved', 'entities', 'screens', 'components',
    'types', 'resources', 'models', 'api', 'stores', 'transitions', 'access', 'provenance',
  ],
  additionalProperties: false,
} as unknown as JSONSchemaType<StoryDesign>

/**
 * What the runtime gate answers with.
 *
 * Deliberately NOT `StoryDesignRuntime`: the model is asked what the story NEEDS, and the derived
 * half — whether that adds up to a worker, whether an agent has a job to run in — is the helper's
 * to compute. A model asked for `worker: boolean` beside a job list can answer with the two
 * disagreeing, and there is no honest way to pick a winner.
 */
export const RuntimeDecisionSchema = {
  type: 'object',
  properties: {
    kv: {
      type: 'boolean',
      description: 'True only for data with an expiry, a lock, a counter or a fan-out, and a '
        + 'small bounded key set. Records the product owns and queries belong in Postgres.',
    },
    feedback: {
      type: 'string',
      description: 'Where a person sees the progress of this queued work — the screen or story '
        + 'that shows it. Empty when nothing is queued.',
    },
    jobs: {
      type: 'array',
      description: 'Empty for almost every story. One entry per unit of work that genuinely '
        + 'cannot run inside a request.',
      items: {
        type: 'object',
        properties: {
          queue: { type: 'string', description: 'The queue name. Reuse one the project has.' },
          name: {
            type: 'string',
            description: 'What the job DOES, as `<entity>:<action>` — `contract:analyze`, '
              + '`report:build`. The alias, the route, the processor file name and the handler '
              + 'symbol are all derived from it, so give the action and not an identifier.',
          },
          path: { type: 'string', description: 'Ignored — the processor file is derived from the '
            + 'name, so the two can never disagree. Give the name and leave this empty.' },
          purpose: { type: 'string', description: 'What it does, in one sentence.' },
          reason: {
            type: 'string',
            description: 'WHICH of the listed reasons makes this impossible inside a request. '
              + 'Name the property; do not restate the story.',
          },
          idempotency: {
            type: 'string',
            description: 'Concretely how running it twice is safe. A worker can die mid-job.',
          },
        },
        required: ['queue', 'name', 'path', 'purpose', 'reason', 'idempotency'],
        additionalProperties: false,
      },
    },
    agents: {
      type: 'array',
      description: 'Empty unless the work is genuinely a language task the application performs.',
      items: {
        type: 'object',
        properties: {
          alias: { type: 'string', description: 'lowerCamelCase alias in the app agent registry.' },
          path: { type: 'string', description: 'Module file name, without a directory.' },
          purpose: { type: 'string' },
          kind: {
            type: 'string',
            enum: Object.values(StoryAgentKind),
            description: '`call` for one prompt and one answer — the default and almost '
              + 'always right; `pipeline` for steps this application names in advance; `agent` '
              + 'only when the number of steps cannot be predicted and tool choice is the '
              + "model's own judgement.",
          },
          job: {
            type: 'string',
            description: 'The `name` of the job that runs it, copied from the job list above. '
              + 'An agent never runs on the request path, so a job that calls a model must name '
              + 'the agent it runs and that agent must name the job back.',
          },
        },
        required: ['alias', 'path', 'purpose', 'kind', 'job'],
        additionalProperties: false,
      },
    },
  },
  required: ['kv', 'feedback', 'jobs', 'agents'],
  additionalProperties: false,
  // Structured-output schema rather than a validated record shape: AJV's `JSONSchemaType` would
  // demand `minItems` on every array to prove non-emptiness, and the whole point of these arrays
  // is that they are usually empty.
} as unknown as JSONSchemaType<RuntimeDecision>

/** What the gate answers with — the model's half of {@link StoryDesignRuntime}. */
export interface RuntimeDecision {
  kv: boolean
  feedback: string
  jobs: StoryDesignJob[]
  agents: StoryDesignAgent[]
}
