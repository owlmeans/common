/**
 * Which PLANNING DEFINITION an origin type is — a type of the origin whose records people use to
 * define how other records look and move, rather than a record of the work itself.
 *
 * A work-management origin keeps its users' card types, their custom fields, its workflows, their
 * statuses and moves in tables of its own; on a Viable target those are `@owlmeans/planning`'s
 * data-defined definitions (`definitions.putType` / `putFlow`), never a catalogue type. The kind
 * says which definition editor the origin type's records become.
 */
export enum OriginDefinition {
  /** A user-defined kind of card — name, icon, colour, custom fields. */
  CardType = 'card-type',
  /** A workflow — its statuses, the initial one and the moves between them. */
  Flow = 'flow',
  /** One status of a workflow kept as a type of its own. */
  Status = 'status',
  /** One move of a workflow kept as a type of its own. */
  Transition = 'transition',
  /** One custom field of a card type kept as a type of its own. */
  Field = 'field',
}

/**
 * How an origin type's records exist IN THE ORIGIN — read off what the whole-file summaries show,
 * never off a name alone. A converted catalogue follows it: only a `record` is ever a table of the
 * target, because a response DTO, a stats or usage answer, a form's values or a validation issue
 * catalogued as a record became a table and endpoints nothing serves (`STORED TYPE NEVER SERVED`).
 */
export enum OriginTypeRepresentation {
  /**
   * Stored on its own: a database document, model, table or collection declares it, a create input
   * or a create route writes it, its records carry an id, or another record holds one's id.
   */
  Record = 'record',
  /** Kept inside another type and addressed by nothing — an embedded document, a list or map item. */
  Value = 'value',
  /**
   * Answered or computed, never stored — a response DTO, stats or usage, a form's values, a
   * validation issue, an operation's result.
   */
  View = 'view',
}

/**
 * The planning field schema an origin's custom-field kind becomes — what a data-defined workcard
 * type's `fields` JSON schema declares for it: `string` (`{ type: 'string' }`), `number`, `enum`
 * (`{ type: 'string', enum }` — a select), `date` (`{ type: 'string', format: 'date' }`), `boolean`
 * (a checkbox) and `list` (`{ type: 'array' }` — a multi-select).
 */
export enum OriginFieldSchema {
  String = 'string',
  Number = 'number',
  Enum = 'enum',
  Date = 'date',
  Boolean = 'boolean',
  List = 'list',
}

/** The heading of `docs/conversion/types.md`'s section stating the definitions facts. */
export const ORIGIN_DEFINITIONS_SECTION = 'Definitions'
