import type { IntrinsicStatus } from '@owlmeans/planning'
import type { OriginProof } from '../types.js'
import type { OriginDefinition, OriginFieldSchema } from './consts.js'

/**
 * One persisted type of the ORIGIN, as its own code declares it.
 *
 * Assembled WITHOUT a model from the whole-file summaries' schemas: one concept declared in several
 * places — a zod schema, a TypeScript interface, a database document model, a create/update DTO —
 * is ONE spec with the union of their attributes. A converted target's type catalogue FOLLOWS these
 * (same names, every attribute, the closed lists) instead of inventing types from story wording,
 * which once lost a card type's icon, colour and four of its five field kinds. The tenant, its
 * membership and invitation types and the tenant key fields are removed: they are the platform's
 * organization surface (`OriginTenancy`). Recorded in `docs/conversion/types.md`
 * (`CONVERSION_TYPES_FILE`).
 */
export interface OriginTypeSpec {
  /** PascalCase, as the origin names the concept — `CardType`. */
  name: string
  /** The kebab-case key it is filed under — `card-type`. */
  entity: string
  /** The words its people read — `card type`. */
  label: string
  attributes: OriginTypeAttribute[]
  /** The other origin types it holds the id of — read off `<x>Id` / `<x>Ids` and declared references. */
  relations: OriginTypeRelation[]
  /** The planning definition its records are, when they are one (a work-management origin). */
  definition?: OriginDefinition
  /** Every declaration it was assembled from. */
  proofs: OriginProof[]
}

/** One attribute of an origin type, from the declarations that name it. */
export interface OriginTypeAttribute {
  /** As the origin's code names it — `initialStatusId`. */
  name: string
  /**
   * `string`, `number`, `boolean`, `date`, `object`, or the NAME of another origin type (a value it
   * contains). With {@link list}, the type of ONE item.
   */
  type: string
  /** Required by the origin's own model (an update DTO, where everything is optional, never decides it). */
  required: boolean
  /** The default value, as the origin writes it. */
  default?: string
  /** The closed list of values it takes — an enum, a `z.enum`, a union of literals. */
  closed?: string[]
  /** It holds a LIST of {@link type}. */
  list?: boolean
  /** The origin type whose id it holds — `cardTypeId` → `CardType`. */
  ref?: string
}

/** How many records of the other type one record names. */
export type OriginTypeCardinality = 'one' | 'many'

/** An id of another origin type a record holds. */
export interface OriginTypeRelation {
  /** The other origin type's name. */
  to: string
  /** The attribute holding the id — `projectIds`. */
  key: string
  cardinality: OriginTypeCardinality
}

/** A proof as `types.md` files it in its frontmatter's `origin` list — with the type it backs. */
export interface OriginTypeProof extends OriginProof {
  type: string
}

/**
 * What the converted target's DEFINITION EDITORS must offer, read off the origin's definition types.
 *
 * A work-management origin's users define their card types and workflows themselves; on the target
 * those are `@owlmeans/planning` definitions edited through `putType` / `putFlow`. An editor built
 * without these facts kept a type's name and dropped its icon, colour and four of five field kinds.
 * The story checks read them from `docs/conversion/types.md` (its frontmatter's `definitions`):
 * absent — any project that was not converted — they ask nothing.
 */
export interface OriginDefinitionFacts {
  /** The origin's card-type definition, when it keeps one. */
  type: OriginTypeDefinitionFacts | null
  /** The origin's workflow definition, when it keeps one. */
  flow: OriginFlowDefinitionFacts | null
  /** The container the origin's work lives in — its `Project` — when it keeps one. */
  container: OriginContainerFacts | null
  /** The origin's record of work whose kind people define — its `Card` — when it keeps one. */
  card: OriginCardFacts | null
}

/** What a card-type editor must offer. */
export interface OriginTypeDefinitionFacts {
  /** The origin type — `CardType`. */
  origin: string
  /** Every kind a person picks for a custom field, each with the planning field schema it becomes. */
  fieldKinds: OriginFieldKind[]
  /** A custom field carries a required flag. */
  requiredFields: boolean
  /** A card type carries an icon — chosen through the mark picker. */
  icon: boolean
  /** A card type carries a colour — its `tone`, chosen through the mark picker. */
  tone: boolean
  /**
   * The properties a planning type has no key for — kept in the definition's `app` bag, which the
   * application declares (`PlanningPlugin.schemas.app.type`): `description`.
   */
  properties: string[]
}

/** One custom-field kind of the origin and what it becomes. */
export interface OriginFieldKind {
  /** The origin's word for it — `checkbox`. */
  origin: string
  schema: OriginFieldSchema
}

/** What a workflow editor must offer. */
export interface OriginFlowDefinitionFacts {
  /** The origin type — `Workflow`. */
  origin: string
  /** The categories a status is put in, each with the intrinsic state it becomes. */
  categories: OriginStatusCategory[]
  /** A status carries a colour — its `tone`, chosen through the status tone picker. */
  statusTones: boolean
  /** A flow names its initial status. */
  initial: boolean
  /** Moves are stated one by one, from → to — edited as the flow's `transitions`. */
  transitions: boolean
  /** A flow carries an icon. */
  icon: boolean
  /** A flow carries a colour. */
  tone: boolean
  /** The properties a planning flow has no key for — kept in its `app` bag (`app.flow`). */
  properties: string[]
}

/** One status category of the origin and the planning intrinsic state it becomes. */
export interface OriginStatusCategory {
  /** The origin's word — `in_progress`. */
  origin: string
  intrinsic: IntrinsicStatus
}

/** The origin's container — the planning kit's container under the origin's own word. */
export interface OriginContainerFacts {
  /** The origin type — `Project`. */
  origin: string
  /** The word its people read — the kit container's label (`Project`; the key `project` is reserved). */
  label: string
  /**
   * The origin maps a card type onto a workflow PER container (`typeFlows`): a project-layer
   * `putType` override of the type's `flows` — admitted only for a catalogue container flagged
   * `projectFlows`.
   */
  projectFlows: boolean
}

/**
 * The origin's record of work — a WORKCARD on the target, of whichever type a person picks. Its
 * title, description, type, status, assignee and containers are the workcard's own members; what
 * the origin keeps beyond them on EVERY card, whatever its type, is a base card field the
 * application declares (`PlanningPlugin.schemas.app.card`).
 */
export interface OriginCardFacts {
  /** The origin type — `Card`. */
  origin: string
  /** Its attributes beyond the workcard's own members — base card fields. */
  fields: string[]
  /** One card belongs to several containers (`projectIds`): the native `parents` membership. */
  linked: boolean
  /** A card carries a number keyed per tenant or container — the type's `CodePolicy` (`prefix`, sequential). */
  numbered: boolean
}

/**
 * What `docs/conversion/types.md` holds as DATA, read back — the types (their proofs re-attached
 * from the frontmatter's `origin` list) and the definitions facts, `null` where the origin keeps no
 * definitions. A document is always written, types or not, so its existence is the step's guard.
 */
export interface OriginTypesRecord {
  types: OriginTypeSpec[]
  definitions: OriginDefinitionFacts | null
}

/** The reading of `types.md`'s data every runtime shares — the converter's store and the story checks. */
export interface OriginTypesHelper {
  /**
   * The record a `types.md` frontmatter holds — `null` where it is not one. A malformed type is
   * dropped on its own (each stands for one concept); malformed definitions read as none.
   */
  recordOf: (data: unknown) => OriginTypesRecord | null
  /** The definitions facts a value holds, or `null` where it is absent or malformed. */
  definitionsOf: (value: unknown) => OriginDefinitionFacts | null
  /** The kebab-case key a type name is filed under — `CardType`, `card_type`, `Card type` → `card-type`. */
  entityOf: (name: string) => string
}
