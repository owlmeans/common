import type { JSONSchemaType } from 'ajv'

import { ProjectArea } from '../areas/consts.js'
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
