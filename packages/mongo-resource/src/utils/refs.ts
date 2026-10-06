import { MisshapedRecord } from '@owlmeans/resource'
import { ObjectId, type Collection, type Document } from 'mongodb'
import { logger } from '@owlmeans/log'

import type { MongoReference, MongoTx } from '../types.js'
import { HEX24, LOGICAL_OPERATORS, OPAQUE_OPERATORS } from './consts.local.js'
import type { MongoRefHelper } from './refs/types.js'

const log = logger('mongo-resource')

/**
 * Ledger registered body of the system reference migration.
 *
 * Stays a module level factory, textually unchanged: the ledger fingerprints a migration by the
 * source text of the function it registers (`apply.toString()`), so moving the returned closure —
 * or renaming what it calls — changes the checksum and raises `MigrationConflict` against every
 * ledger that already applied it.
 */
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
 * The body {@link makeRefMigration} runs, kept at module level for the same reason it is; the
 * helper exposes the very same function as `convertReferenceField`.
 */
const convertReferenceField = async (collection: Collection, field: string): Promise<number> => {
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

export const createMongoRefHelper = (): MongoRefHelper => {
  const isObjectIdHex = (value: unknown): value is string =>
    typeof value === 'string' && HEX24.test(value)

  const marshalReference = (field: string, value: unknown): unknown => {
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

  const demarshalReference = (value: unknown): unknown => {
    if (value instanceof ObjectId) {
      return value.toString()
    }
    if (Array.isArray(value)) {
      return value.map(demarshalReference)
    }

    return value
  }

  const demarshalRefs = <T extends {}>(record: T, refs: Map<string, MongoReference>): T => {
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

  const marshalCriteria = (
    criteria: Document | undefined, refs: Map<string, MongoReference>
  ): Document | undefined => {
    if (criteria == null) {
      return criteria
    }

    return Object.fromEntries(Object.entries(criteria).map(([key, value]) => {
      if (LOGICAL_OPERATORS.includes(key) && Array.isArray(value)) {
        return [key, value.map(sub => marshalCriteria(sub as Document, refs))]
      }
      if (key === 'id' || key === '_id') {
        return ['_id', marshalCriteriaValue(value)]
      }
      if (refs.has(key)) {
        return [key, marshalCriteriaValue(value)]
      }

      return [key, value]
    })) as Document
  }

  const identityCriteria = (
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

  const refMigrationName = (field: string): string => `$ref:${field}@1`

  const reconcileReferences = async (
    collection: Collection, refs: MongoReference[], alias: string
  ): Promise<void> => {
    for (const ref of refs) {
      const remnant = await collection.findOne(
        { [ref.field]: { $type: 'string', $regex: HEX24 } },
        { projection: { _id: 1 } }
      )
      if (remnant != null) {
        const converted = await convertReferenceField(collection, ref.field)
        log.warn('Reference field held string ids outside the migration ledger; converted', {
          resource: alias, field: ref.field, converted,
        })
      }
    }
  }

  return {
    isObjectIdHex, marshalReference, demarshalReference, demarshalRefs, marshalCriteria, identityCriteria,
    refMigrationName, convertReferenceField, reconcileReferences
  }
}

export const mongoRefHelper = createMongoRefHelper()

/** @deprecated compat:factory-refactor — use `mongoRefHelper.isObjectIdHex(…)` */
export const isObjectIdHex = (value: unknown): value is string => mongoRefHelper.isObjectIdHex(value)

/** @deprecated compat:factory-refactor — use `mongoRefHelper.marshalReference(…)` */
export const marshalReference = (field: string, value: unknown): unknown => mongoRefHelper.marshalReference(field, value)

/** @deprecated compat:factory-refactor — use `mongoRefHelper.demarshalRefs(…)` */
export const demarshalRefs = <T extends {}>(record: T, refs: Map<string, MongoReference>): T =>
  mongoRefHelper.demarshalRefs(record, refs)
