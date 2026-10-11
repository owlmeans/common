import type { Collection, Document } from 'mongodb'

import type { MongoReference } from '../../types.js'

/** Declared ObjectId references: converting their values, their criteria and their stored data. */
export interface MongoRefHelper {
  /** A 24 hex string — the only shape a stored reference is converted from. */
  isObjectIdHex: (value: unknown) => value is string
  /**
   * Write side of a declared reference: the string id a record carries becomes the
   * `ObjectId` the collection stores. Arrays convert elementwise.
   *
   * Strict on purpose — a declared reference holding something that is not a mongo id is
   * either a mis-declared field (should never have been a reference) or a bug at the call
   * site, and storing it as a string would silently reintroduce the mixed type state this
   * mechanism exists to remove.
   *
   * @throws {MisshapedRecord}
   */
  marshalReference: (field: string, value: unknown) => unknown
  /** Read side: `ObjectId` back to the string records carry. Tolerates not yet migrated strings. */
  demarshalReference: (value: unknown) => unknown
  /** Convert every declared reference of a fetched document back to string ids, in place. */
  demarshalRefs: <T extends {}>(record: T, refs: Map<string, MongoReference>) => T
  /**
   * Convert a mongo filter the way records are converted: values addressed at `_id` or at a
   * declared reference become `ObjectId`s, and the `id` alias records actually carry is
   * mapped onto `_id` — documents never store `id`, so before this mapping such criteria
   * silently matched nothing.
   *
   * Tolerant by design: a value that is not 24 hex passes through unconverted. Criteria are
   * matched against the collection, and against an `ObjectId` typed field a stray string
   * matches nothing — which is exactly what it matched before the field was converted.
   *
   * Operators arrive already in mongo's own vocabulary — `criteriaToFilter` translates
   * the portable one first, so this pass only has to convert values.
   */
  marshalCriteria: (criteria: Document | undefined, refs: Map<string, MongoReference>) => Document | undefined
  /**
   * Criteria for addressing a single record by a field — `get`/`load`/`update`/`delete`.
   *
   * `_id` keeps its historical strictness (an invalid id throws through the driver). The
   * `id` alias and declared references convert tolerantly, so a caller probing a reference
   * with a value that is not a mongo id gets "not found" rather than a throw.
   */
  identityCriteria: (field: string, id: string, refs: Map<string, MongoReference>) => Document
  /**
   * Name of the system migration that converts a reference field's stored strings.
   *
   * The `@1` is the body's version: the shared body (`makeRefMigration`) fingerprints identically
   * for every field, so an edit to it would raise `MigrationConflict` against every ledger on
   * the next boot. Any semantic change to {@link MongoRefHelper.convertReferenceField} must bump
   * this suffix instead — the old name stays applied, the new one runs (idempotently) once.
   */
  refMigrationName: (field: string) => string
  /**
   * Convert one reference field's stored string ids to `ObjectId`s — the body of the
   * system migration and of the boot time reconciliation probe alike.
   *
   * Idempotent and interrupt safe: it matches only documents where the field (or one of
   * its elements) is still a string, converts only values that are actually 24 hex, and
   * leaves everything else exactly as it was. Safe to run concurrently from several
   * replicas — a document converts once, the loser's filter no longer matches it.
   *
   * Validation is bypassed deliberately: at `Pre` stage the collection still carries the
   * validator that declares the field a *string*, and after the switch a legacy document
   * may violate the schema in unrelated ways — either would wedge the boot on a write
   * that only makes the data more correct. (Bypassing requires the connection's user to
   * hold the `bypassDocumentValidation` privilege — `dbOwner`/`root` do.)
   */
  convertReferenceField: (collection: Collection, field: string) => Promise<number>
  /**
   * The second half of the double check the reference migration promises: the ledger says
   * whether the migration ran; this probes whether the collection actually holds no
   * convertible strings — and repairs it when the two disagree (a restored backup, a
   * write from a legacy process, a ledger created by hand).
   */
  reconcileReferences: (collection: Collection, refs: MongoReference[], alias: string) => Promise<void>
}
