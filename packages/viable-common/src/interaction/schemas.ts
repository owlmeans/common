import type { JSONSchemaType } from 'ajv'
import type { RecordInteractionPlan } from './types.js'

export const RecordInteractionPlanSchema: JSONSchemaType<RecordInteractionPlan> = {
  type: 'object',
  properties: {
    entity: { type: 'string', minLength: 1, description: 'Domain entity name copied from the supplied catalogue' },
    label: { type: 'string', nullable: true },
    storyHash: { type: 'string', nullable: true, description: 'Generator-owned narrative hash; leave unset' },
    ownerEntity: { type: 'string', nullable: true },
    capabilities: {
      type: 'array', description: 'One or more distinct capabilities contributed by this change',
      items: { type: 'string', enum: ['create', 'read', 'update', 'delete', 'list', 'action'] },
    },
    placement: { type: 'string', enum: ['destination', 'contextual'] },
    presentation: { type: 'string', enum: ['inline', 'dialog', 'sheet', 'route'] },
    hostScreen: { type: 'string', nullable: true },
    hostKind: { type: 'string', nullable: true,
      anyOf: [{ enum: ['collection', 'record', 'singleton'] }, { type: 'null', nullable: true }],
      description: 'collection/singleton may be navigation destinations; record details are reached from their collection' },
    hostComponent: { type: 'string', nullable: true, description: 'Exact existing component source path to extend, when known' },
    selectionComponents: { type: 'array', nullable: true, items: { type: 'string' },
      description: 'Actual list, board or picker component paths whose primary record-open actions must enter the host' },
    recordKey: { type: 'string', nullable: true },
    parentKey: { type: 'string', nullable: true },
    standaloneReason: { type: 'string', nullable: true },
  },
  required: ['entity', 'capabilities', 'placement', 'presentation'],
  additionalProperties: false,
}
