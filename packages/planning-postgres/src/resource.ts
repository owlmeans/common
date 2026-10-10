import { AssigneeSchema, TeamSchema, CommentSchema, CommentMentionSchema } from '@owlmeans/planning'
import type { Assignee, Team, Comment, CommentMention } from '@owlmeans/planning'
import { RES_PLANNING_ASSIGNEE, RES_PLANNING_TEAM, RES_PLANNING_COMMENT, RES_PLANNING_MENTION } from './consts.js'
import { planningRecordTableSchema } from './schemas.js'
import type { PlanningAssigneeResource, PlanningTeamResource, PlanningCommentResource, PlanningMentionResource } from './types.js'
import type { Relationship, Transition } from '@owlmeans/planning'
import { makePostgresResource, PgIndexMethod, type PostgresResource, pgDeclarationHelper, pgNameHelper } from '@owlmeans/postgres-resource'
import type { ResourceMaker, ResourceRecord } from '@owlmeans/resource'
import { RES_PLANNING_CARD, RES_PLANNING_LINK, RES_PLANNING_SCHEMA, RES_PLANNING_TRANSITION } from './consts.js'
import {
  PlanningCardTableSchema, PlanningLinkTableSchema, PlanningSchemaTableSchema, PlanningTransitionTableSchema,
} from './schemas.js'
import type {
  PlanningCardRecord, PlanningCardResource, PlanningLinkResource, PlanningPostgresAliases, PlanningSchemaResource,
  PlanningSchemaRow, PlanningTransitionResource,
} from './types.js'
import type { IndexList } from './types.local.js'

/**
 * Declare the indexes a maker owns — each only once. The declaration is keyed by alias at module
 * scope, so a maker that runs twice (a target's maker wrapping this one, a spec) re-declaring an
 * index would make the compiler warn about a duplicate on every boot.
 */
const declareIndexes = <T extends ResourceRecord>(resource: PostgresResource<T>, alias: string, indexes: IndexList): void => {
  const table = pgNameHelper.pgIdentifier(alias)
  const declared = pgDeclarationHelper.getDeclaration(alias).indexes
  for (const [suffix, spec] of indexes) {
    const name = `${table}_${suffix}`
    if (!declared.some(index => index.name === name)) {
      resource.index(name, spec)
    }
  }
}

/** The index names a table carries, by suffix — what the store matches a unique violation on. */
export const planningIndexName = (alias: string, suffix: string): string => `${pgNameHelper.pgIdentifier(alias)}_${suffix}`

/**
 * `planning-card` — projects, cards and specifications in ONE table, routed by `kind` at the query
 * layer. Indexes follow the reads: a list by kind and type, children in order, membership
 * (`parents`, GIN), a board by status, the intrinsic state by recency, labels (GIN), a code within
 * its parent, and a slot's documents.
 */
export const makePlanningCardResource = (
  alias: string = RES_PLANNING_CARD, dbAlias?: string, serviceAlias?: string
): PlanningCardResource => {
  const resource = makePostgresResource<PlanningCardRecord, PlanningCardResource>(alias, dbAlias, serviceAlias)
  resource.schema = PlanningCardTableSchema
  declareIndexes(resource, alias, [
    ['entity_kind_type', { columns: ['entityId', 'kind', 'type'] }],
    ['parent_order', { columns: ['parent', 'order'] }],
    ['parents', { columns: ['parents'], method: PgIndexMethod.Gin }],
    ['parent_status', { columns: ['parent', 'status'] }],
    ['entity_intrinsic', { columns: ['entityId', 'intrinsic', 'updatedAt'] }],
    ['labels', { columns: ['labels'], method: PgIndexMethod.Gin }],
    ['code', { columns: ['entityId', 'parent', 'code'], where: '"code" IS NOT NULL' }],
    ['slot', { columns: ['parent', 'category'], where: `"kind" = 'specification'` }],
  ])

  return resource
}

/**
 * `planning-transition` — the append-only log. `(card, seq)` is the arbiter of allocation, a key is
 * unique per organization, a project's history reads by time, and the pending rows by age (what
 * `recover()` scans).
 */
export const makePlanningTransitionResource = (
  alias: string = RES_PLANNING_TRANSITION, dbAlias?: string, serviceAlias?: string
): PlanningTransitionResource => {
  const resource = makePostgresResource<Transition, PlanningTransitionResource>(alias, dbAlias, serviceAlias)
  resource.schema = PlanningTransitionTableSchema
  declareIndexes(resource, alias, [
    ['card_seq', { columns: ['card', 'seq'], unique: true }],
    ['entity_key', { columns: ['entityId', 'key'], unique: true, where: '"key" IS NOT NULL' }],
    ['project_at', { columns: ['project', 'at'] }],
    ['pending', { columns: ['at'], where: `("commit"->>'state') = 'pending'` }],
  ])

  return resource
}

/** `planning-link` — one row per `(from, to, type)`, read from either end, by type, and by project. */
export const makePlanningLinkResource = (
  alias: string = RES_PLANNING_LINK, dbAlias?: string, serviceAlias?: string
): PlanningLinkResource => {
  const resource = makePostgresResource<Relationship, PlanningLinkResource>(alias, dbAlias, serviceAlias)
  resource.schema = PlanningLinkTableSchema
  declareIndexes(resource, alias, [
    ['edge', { expression: `"entityId", "from", "to", "type", COALESCE("fromKind", 'workcard'), COALESCE("toKind", 'workcard')`, unique: true }],
    ['inbound', { columns: ['to', 'type'] }],
    ['entity_type', { columns: ['entityId', 'type'] }],
    ['project', { columns: ['project'] }],
  ])

  return resource
}

/**
 * `planning-schema` — data-defined card/assignee types and flows, one row per `(organization, project layer,
 * kind, key)`, plus each organization's private revision row (`kind: 'head'`).
 */
export const makePlanningSchemaResource = (
  alias: string = RES_PLANNING_SCHEMA, dbAlias?: string, serviceAlias?: string
): PlanningSchemaResource => {
  const resource = makePostgresResource<PlanningSchemaRow, PlanningSchemaResource>(alias, dbAlias, serviceAlias)
  resource.schema = PlanningSchemaTableSchema
  declareIndexes(resource, alias, [
    ['scope', { unique: true, expression: `"entityId", COALESCE("project", ''), "kind", "key"` }],
    ['rev', { columns: ['entityId', 'rev'] }],
  ])

  return resource
}

export const makePlanningCardPostgres: ResourceMaker<PlanningCardRecord, PlanningCardResource> =
  (dbAlias, serviceAlias) => makePlanningCardResource(RES_PLANNING_CARD, dbAlias, serviceAlias)

export const makePlanningTransitionPostgres: ResourceMaker<Transition, PlanningTransitionResource> =
  (dbAlias, serviceAlias) => makePlanningTransitionResource(RES_PLANNING_TRANSITION, dbAlias, serviceAlias)

export const makePlanningLinkPostgres: ResourceMaker<Relationship, PlanningLinkResource> =
  (dbAlias, serviceAlias) => makePlanningLinkResource(RES_PLANNING_LINK, dbAlias, serviceAlias)

export const makePlanningSchemaPostgres: ResourceMaker<PlanningSchemaRow, PlanningSchemaResource> =
  (dbAlias, serviceAlias) => makePlanningSchemaResource(RES_PLANNING_SCHEMA, dbAlias, serviceAlias)

/** The eight resources under the aliases a store resolves — what `appendPostgresPlanning` registers. */
export const makePlanningPostgresResources = (
  aliases: PlanningPostgresAliases, dbAlias?: string, serviceAlias?: string
): PostgresResource<any>[] => [
  makePlanningAssigneeResource(aliases.assignee, dbAlias, serviceAlias),
  makePlanningTeamResource(aliases.team, dbAlias, serviceAlias),
  makePlanningCommentResource(aliases.comment, dbAlias, serviceAlias),
  makePlanningMentionResource(aliases.mention, dbAlias, serviceAlias),
  makePlanningCardResource(aliases.card, dbAlias, serviceAlias),
  makePlanningTransitionResource(aliases.transition, dbAlias, serviceAlias),
  makePlanningLinkResource(aliases.link, dbAlias, serviceAlias),
  makePlanningSchemaResource(aliases.schema, dbAlias, serviceAlias),
]

export const makePlanningAssigneeResource = (alias = RES_PLANNING_ASSIGNEE, dbAlias?: string, serviceAlias?: string): PlanningAssigneeResource => {
  const resource = makePostgresResource<Assignee, PlanningAssigneeResource>(alias, dbAlias, serviceAlias)
  resource.schema = planningRecordTableSchema<Assignee>(AssigneeSchema)
  declareIndexes(resource, alias, [
    ['nickname', { columns: ['entityId', 'nicknameKey'], unique: true }],
    ['authentication', { expression: `"entityId", ("authentication"->>'provider'), ("authentication"->>'externalId')`, unique: true, where: '"authentication" IS NOT NULL' }],
    ['type', { columns: ['entityId', 'type', 'retired'] }],
  ])
  return resource
}
export const makePlanningTeamResource = (alias = RES_PLANNING_TEAM, dbAlias?: string, serviceAlias?: string): PlanningTeamResource => {
  const resource = makePostgresResource<Team, PlanningTeamResource>(alias, dbAlias, serviceAlias)
  resource.schema = planningRecordTableSchema<Team>(TeamSchema)
  declareIndexes(resource, alias, [['external_id', { columns: ['entityId', 'externalId'], unique: true, where: '"externalId" IS NOT NULL' }], ['entity', { columns: ['entityId'] }]])
  return resource
}
export const makePlanningCommentResource = (alias = RES_PLANNING_COMMENT, dbAlias?: string, serviceAlias?: string): PlanningCommentResource => {
  const resource = makePostgresResource<Comment, PlanningCommentResource>(alias, dbAlias, serviceAlias)
  resource.schema = planningRecordTableSchema<Comment>(CommentSchema)
  declareIndexes(resource, alias, [['card', { columns: ['entityId', 'card', 'createdAt'] }], ['author', { columns: ['entityId', 'author'] }]])
  return resource
}
export const makePlanningMentionResource = (alias = RES_PLANNING_MENTION, dbAlias?: string, serviceAlias?: string): PlanningMentionResource => {
  const resource = makePostgresResource<CommentMention, PlanningMentionResource>(alias, dbAlias, serviceAlias)
  resource.schema = planningRecordTableSchema<CommentMention>(CommentMentionSchema)
  declareIndexes(resource, alias, [['mention', { columns: ['entityId', 'comment', 'assignee'], unique: true }], ['assignee', { columns: ['entityId', 'assignee'] }], ['card', { columns: ['entityId', 'card'] }]])
  return resource
}
export const makePlanningAssigneePostgres: ResourceMaker<Assignee, PlanningAssigneeResource> = (db, service) => makePlanningAssigneeResource(RES_PLANNING_ASSIGNEE, db, service)
export const makePlanningTeamPostgres: ResourceMaker<Team, PlanningTeamResource> = (db, service) => makePlanningTeamResource(RES_PLANNING_TEAM, db, service)
export const makePlanningCommentPostgres: ResourceMaker<Comment, PlanningCommentResource> = (db, service) => makePlanningCommentResource(RES_PLANNING_COMMENT, db, service)
export const makePlanningMentionPostgres: ResourceMaker<CommentMention, PlanningMentionResource> = (db, service) => makePlanningMentionResource(RES_PLANNING_MENTION, db, service)
