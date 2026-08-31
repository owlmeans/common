import { MisshapedRecord } from '@owlmeans/resource'
import type { ListCriteria } from '@owlmeans/resource'
import { ObjectId } from 'mongodb'
import type { Collection, Document } from 'mongodb'

import type { MongoReference, MongoTx } from '../types.js'

/**
 * The only shape a stored reference is converted from. Deliberately stricter than
 * `ObjectId.isValid`, which also accepts any 12 character string and would silently
 * swallow short business keys.
 */
const HEX24 = /^[0-9a-fA-F]{24}$/

export const isObjectIdHex = (value: unknown): value is string =>
  typeof value === 'string' && HEX24.test(value)

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
export const marshalReference = (field: string, value: unknown): unknown => {
  if (value == null) {
    return value
  }
  if (value instanceof ObjectId) {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(item => marshalReference(field, item))
  }
  if (isObjectIdHex(value)) {
    return new ObjectId(value)
  }

  throw new MisshapedRecord(`ref:${field}`)
}

/** Read side: `ObjectId` back to the string records carry. Tolerates not yet migrated strings. */
export const demarshalReference = (value: unknown): unknown => {
  if (value instanceof ObjectId) {
    return value.toString()
  }
  if (Array.isArray(value)) {
    return value.map(demarshalReference)
  }

  return value
}

/** Convert every declared reference of a fetched document back to string ids, in place. */
export const demarshalRefs = <T extends {}>(record: T, refs: Map<string, MongoReference>): T => {
  if (refs.size < 1) {
    return record
  }
  for (const field of refs.keys()) {
    const value = (record as Document)[field]
    if (value != null) {
      (record as Document)[field] = demarshalReference(value)
    }
  }

  return record
}

/**
 * Operators whose operand is never an id — a 24 hex string under `$regex` is a pattern,
 * not a reference.
 */
const OPAQUE_OPERATORS = ['$regex', '$options', '$type', '$size', '$mod', '$exists', '$where']

const LOGICAL_OPERATORS = ['$and', '$or', '$nor']

const marshalCriteriaValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return isObjectIdHex(value) ? new ObjectId(value) : value
  }
  if (Array.isArray(value)) {
    return value.map(marshalCriteriaValue)
  }
  if (value != null && typeof value === 'object' && !(value instanceof ObjectId) && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([operator, operand]) =>
      OPAQUE_OPERATORS.includes(operator)
        ? [operator, operand]
        : [operator, marshalCriteriaValue(operand)]
    ))
  }

  return value
}

/**
 * Convert list criteria the way records are converted: values addressed at `_id` or at a
 * declared reference become `ObjectId`s, and the `id` alias records actually carry is
 * mapped onto `_id` — documents never store `id`, so before this mapping such criteria
 * silently matched nothing.
 *
 * Tolerant by design: a value that is not 24 hex passes through unconverted. Criteria are
 * matched against the collection, and against an `ObjectId` typed field a stray string
 * matches nothing — which is exactly what it matched before the field was converted.
 */
export const marshalCriteria = (
  criteria: ListCriteria | undefined, refs: Map<string, MongoReference>
): ListCriteria | undefined => {
  if (criteria == null) {
    return criteria
  }

  return Object.fromEntries(Object.entries(criteria).map(([key, value]) => {
    if (LOGICAL_OPERATORS.includes(key) && Array.isArray(value)) {
      return [key, value.map(sub => marshalCriteria(sub as ListCriteria, refs))]
    }
    if (key === 'id' || key === '_id') {
      return ['_id', marshalCriteriaValue(value)]
    }
    if (refs.has(key)) {
      return [key, marshalCriteriaValue(value)]
    }

    return [key, value]
  })) as ListCriteria
}

/**
 * Criteria for addressing a single record by a field — `get`/`load`/`update`/`delete`.
 *
 * `_id` keeps its historical strictness (an invalid id throws through the driver). The
 * `id` alias and declared references convert tolerantly, so a caller probing a reference
 * with a value that is not a mongo id gets "not found" rather than a throw.
 */
export const identityCriteria = (
  field: string, id: string, refs: Map<string, MongoReference>
): Document => {
  if (field === '_id') {
    return { _id: new ObjectId(id) }
  }
  if (field === 'id') {
    return { _id: isObjectIdHex(id) ? new ObjectId(id) : id }
  }
  if (refs.has(field)) {
    return { [field]: isObjectIdHex(id) ? new ObjectId(id) : id }
  }

  return { [field]: id }
}

/**
 * Name of the system migration that converts a reference field's stored strings.
 *
 * The `@1` is the body's version: the shared body below fingerprints identically for
 * every field, so an edit to it would raise `MigrationConflict` against every ledger on
 * the next boot. Any semantic change to {@link convertReferenceField} must bump this
 * suffix instead — the old name stays applied, the new one runs (idempotently) once.
 */
export const refMigrationName = (field: string): string => `$ref:${field}@1`

/** Ledger registered body of the system reference migration. */
export const makeRefMigration = (field: string) => async (tx: MongoTx): Promise<void> => {
  await convertReferenceField(tx.collection, field)
}

const convertScalar = (path: string): Document => ({
  $cond: [
    {
      $and: [
        { $eq: [{ $type: path }, 'string'] },
        { $regexMatch: { input: path, regex: HEX24 } }
      ]
    },
    { $toObjectId: path },
    path
  ]
})

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
export const convertReferenceField = async (collection: Collection, field: string): Promise<number> => {
  const result = await collection.updateMany(
    /** An array valued field matches `$type: 'string'` when any element is a string. */
    { [field]: { $type: 'string' } },
    [{
      $set: {
        [field]: {
          $cond: [
            { $eq: [{ $type: `$${field}` }, 'array'] },
            { $map: { input: `$${field}`, as: 'ref', in: convertScalar('$$ref') } },
            convertScalar(`$${field}`)
          ]
        }
      }
    }],
    { bypassDocumentValidation: true }
  )

  return result.modifiedCount
}

/**
 * The second half of the double check the reference migration promises: the ledger says
 * whether the migration ran; this probes whether the collection actually holds no
 * convertible strings — and repairs it when the two disagree (a restored backup, a
 * write from a legacy process, a ledger created by hand).
 */
export const reconcileReferences = async (
  collection: Collection, refs: MongoReference[], alias: string
): Promise<void> => {
  for (const ref of refs) {
    const remnant = await collection.findOne(
      { [ref.field]: { $type: 'string', $regex: HEX24 } },
      { projection: { _id: 1 } }
    )
    if (remnant != null) {
      const converted = await convertReferenceField(collection, ref.field)
      console.warn(
        `@owlmeans/mongo-resource: ${alias}.${ref.field} held string ids outside the migration`
        + ` ledger — converted ${converted} document(s)`
      )
    }
  }
}
