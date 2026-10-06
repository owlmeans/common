import { AnyWorkcardSchema, PlanningSchemaKind, RelationshipSchema, ScopedSchemaRecordSchema, TransitionSchema, type Relationship, type Transition } from '@owlmeans/planning'
import type { JSONSchemaType } from 'ajv'
import { SCHEMA_HEAD_KIND } from './consts.js'
import type { PlanningCardRecord, PlanningSchemaRow } from './types.js'
import type { Properties } from './types.local.js'

const propertiesOf = (schema: object): Properties =>
  structuredClone((schema as { properties: Properties }).properties)

const requiredOf = (schema: object): string[] => [...((schema as { required?: string[] }).required ?? [])]

/**
 * An ISO-8601 timestamp stays TEXT. The record's `format: 'date-time'` would compile to
 * `timestamptz` and marshal through `Date` — which changes the string a record carries and breaks
 * the lexicographic order every `updatedSince`, `at` sort and gap age relies on.
 */
const timestamp = (property: Record<string, unknown>): Record<string, unknown> => {
  const { format: _format, ...rest } = property
  return { ...rest, pg: { type: 'text' } }
}

const integer = (property: Record<string, unknown>): Record<string, unknown> => ({ ...property, pg: { type: 'integer' } })

const tableSchema = <T>(properties: Properties, required: string[]): JSONSchemaType<T> => ({
  type: 'object', properties, required, additionalProperties: false,
}) as unknown as JSONSchemaType<T>

const cardProperties = propertiesOf(AnyWorkcardSchema)

/**
 * `planning-card`: projects, cards and specifications in one table — derived from
 * `AnyWorkcardSchema`, plus the private `headAt` column. `seq`/`head`/`revision`/`bodyChars` are
 * `integer`, `body` is `text`, every timestamp is `text`.
 */
export const PlanningCardTableSchema = tableSchema<PlanningCardRecord>({
  ...cardProperties,
  createdAt: timestamp(cardProperties.createdAt),
  updatedAt: timestamp(cardProperties.updatedAt),
  closedAt: timestamp(cardProperties.closedAt),
  seq: integer(cardProperties.seq),
  head: integer(cardProperties.head),
  revision: integer(cardProperties.revision),
  bodyChars: integer(cardProperties.bodyChars),
  body: { ...cardProperties.body, pg: { type: 'text' } },
  headAt: { type: 'string', nullable: true, pg: { type: 'text' } },
}, requiredOf(AnyWorkcardSchema))

const transitionProperties = propertiesOf(TransitionSchema)

/** `planning-transition`: the append-only log, derived from `TransitionSchema`. */
export const PlanningTransitionTableSchema = tableSchema<Transition>({
  ...transitionProperties,
  seq: integer(transitionProperties.seq),
  at: timestamp(transitionProperties.at),
}, requiredOf(TransitionSchema))

const linkProperties = propertiesOf(RelationshipSchema)

/** `planning-link`: typed edges, derived from `RelationshipSchema`. */
export const PlanningLinkTableSchema = tableSchema<Relationship>({
  ...linkProperties,
  createdAt: timestamp(linkProperties.createdAt),
}, requiredOf(RelationshipSchema))

const schemaProperties = propertiesOf(ScopedSchemaRecordSchema)

/**
 * `planning-schema`: data-defined types and flows, derived from `ScopedSchemaRecordSchema`. `kind`
 * also admits the private `head` row an organization's revision is counted in; `project` is `text`
 * so the uniqueness expression `COALESCE("project", '')` stays one type.
 */
export const PlanningSchemaTableSchema = tableSchema<PlanningSchemaRow>({
  ...schemaProperties,
  kind: { type: 'string', enum: [...Object.values(PlanningSchemaKind), SCHEMA_HEAD_KIND] },
  project: { ...schemaProperties.project, pg: { type: 'text' } },
  version: integer(schemaProperties.version),
  rev: integer(schemaProperties.rev),
  createdAt: timestamp(schemaProperties.createdAt),
  updatedAt: timestamp(schemaProperties.updatedAt),
}, requiredOf(ScopedSchemaRecordSchema))
