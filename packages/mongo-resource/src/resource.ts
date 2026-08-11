import { appendContextual, assertContext } from '@owlmeans/context'
import type { BasicContext, Contextual } from '@owlmeans/context'
import { DEFAULT_DB_ALIAS, DEFAULT_PAGE_SIZE } from './consts.js'
import { MigrationStage } from '@owlmeans/resource'
import type { ListCriteria, ResourceMaker, ResourceRecord } from '@owlmeans/resource'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { MongoDbService, MongoReference, MongoRefOptions, MongoResource, MongoTx } from './types.js'
import { initializeCollection } from './utils/life-cycle.js'
import { getDeclaration } from './declarations.js'
import { ObjectId } from 'mongodb'
import { MisshapedRecord, RecordExists, UnknownRecordError, UnsupportedArgumentError, RecordUpdateFailed, prepareListOptions } from '@owlmeans/resource'
import type { JSONSchemaType } from 'ajv'
import { getSchemaSecureFeilds } from './helper.js'
import {
  demarshalRefs, identityCriteria, makeRefMigration, marshalCriteria, marshalReference,
  refMigrationName
} from './utils/refs.js'

type Config = ServerConfig
type Context<C extends Config = Config> = ServerContext<C>

export const makeMongoResource = <
  R extends ResourceRecord, T extends MongoResource<R> = MongoResource<R>
>(
  alias: string, dbAlias: string = DEFAULT_DB_ALIAS, serviceAlias: string = DEFAULT_DB_ALIAS,
  makeCustomResource?: ResourceMaker<R, T>, collectionName?: string
): T => {
  const location = `mongo-resource:${alias}`

  /**
   * Live view — references may be declared after the resource is built, and the
   * declarations are module scoped so they survive `reinitializeContext`.
   */
  const refs = (): Map<string, MongoReference> => getDeclaration(alias).references

  const demarshal = <Type extends ResourceRecord>(record: Type & { _id?: unknown }): Type => {
    record.id = record._id instanceof ObjectId ? record._id.toString() : record._id as string
    delete record._id
    return demarshalRefs(record, refs())
  }

  const resource: T = appendContextual<T>(alias, {
    get: async (id, field, opts) => {
      const record = await resource.load(id, field, opts)
      if (record == null) {
        throw new UnknownRecordError(id)
      }

      return record
    },

    load: async (id, field, opts) => {
      if (typeof field === 'object') {
        opts = field
        field = field.field
      }
      field = field ?? '_id'
      if (opts?.ttl != null) {
        throw new UnsupportedArgumentError('ttl')
      }

      const record = await resource.collection.findOne(identityCriteria(field, id, refs()))
      if (record != null) {
        demarshal(record)
      }

      return record
    },

    update: async (record, opts) => {
      let field = '_id'
      if (typeof opts === 'string') {
        field = opts
      } else if (typeof opts === 'object') {
        field = opts.field ?? field
      }

      if (field !== '_id' && record[field as keyof typeof record] == null) {
        throw new MisshapedRecord('no-field-value')
      }

      const id = field == '_id' ? record.id : record[field as keyof typeof record] as string
      if (id == null) {
        throw new MisshapedRecord('id')
      }

      const original = await resource.get(id, field)

      const replace = { ...record, _id: new ObjectId(original.id) }
      if (replace.id != null) {
        delete replace.id
      }

      const result = await resource.collection.replaceOne(
        identityCriteria(field, id, refs()),
        _prepareValues(replace, resource.schema as JSONSchemaType<any>, refs())
      )
      if (!result.acknowledged) {
        throw new RecordUpdateFailed(`${field}:${id}`)
      }

      return resource.get(id, opts)
    },

    save: async (record, opts) => {
      const id = record.id
      if (id != null || (
        typeof opts === 'string' && record[opts as keyof typeof record] != null
      ) || (
          typeof opts === 'object' && ("field" in opts)
          && record[opts.field as keyof typeof record] != null
        )) {
        return resource.update(record, opts)
      }

      return resource.create(record, typeof opts !== 'string' ? opts : undefined)
    },

    getDefaults: () => {
      const schema: JSONSchemaType<unknown> | undefined = resource.schema as JSONSchemaType<unknown>
      if (schema == null) {
        return {}
      }

      return Object.entries(schema.properties ?? {}).reduce((defaults, [key, value]) => {
        if ((value as JSONSchemaType<unknown>).default == null) {
          return defaults
        }
        return { ...defaults, [key]: (value as JSONSchemaType<unknown>).default }
      }, {})
    },

    create: async (record, opts) => {
      if ("id" in record && record.id == null) {
        delete record.id
      }
      if (record.id != null) {
        throw new RecordExists('id-present')
      }
      if (opts != null && opts.ttl != null) {
        throw new UnsupportedArgumentError('ttl')
      }
      const result = await resource.collection.insertOne({
        ...resource.getDefaults(),
        ..._prepareValues(record, resource.schema as JSONSchemaType<any>, refs())
      })

      if (!result.acknowledged) {
        throw new RecordUpdateFailed(`creation`)
      }

      const id = result.insertedId

      return resource.get(id.toString())
    },

    delete: async (id, opts) => {
      let record: R | null = null
      if (typeof id === 'object') {
        if (id.id == null) {
          throw new MisshapedRecord('id')
        }
        record = await resource.load(id.id)
      } else {
        record = await resource.load(id, opts)
      }

      if (record == null) {
        return null
      }

      let field = '_id'
      if (typeof opts === 'string') {
        field = opts
        opts = undefined
      } else if (typeof opts === 'object') {
        field = opts.field ?? field
      }

      const _id = field == '_id' ? record.id : record[field as keyof typeof record] as string
      if (id == null) {
        throw new MisshapedRecord('id')
      }

      const result = await resource.collection.deleteOne(identityCriteria(field, _id as string, refs()))
      if (!result.acknowledged || result.deletedCount === 0) {
        return null
      }

      return record
    },

    pick: async (id, opts) => {
      const record = await resource.delete(id, opts)
      if (record == null) {
        throw new UnknownRecordError(typeof id == 'string' ? id : (id.id ?? 'unknown'))
      }

      return record
    },

    list: async (criteria, opts) => {
      const options = prepareListOptions(DEFAULT_PAGE_SIZE, criteria, opts)

      criteria = marshalCriteria(options.criteria, refs()) ?? {}
      const pager = options.pager ?? {}

      const size = pager?.size ?? DEFAULT_PAGE_SIZE
      const total = await resource.collection.countDocuments(criteria as ListCriteria)
      pager.total = total

      const skip = (pager.page ?? 0) * size
      if (total === 0 && skip >= total) {
        return { items: [], pager }
      }

      let cursor = resource.collection.find(criteria as ListCriteria)
        .skip(skip).limit(size)

      if (pager.sort != null) {
        cursor = cursor.sort(
          typeof pager.sort === 'string'
            ? pager.sort
            : pager.sort.reduce((sort, [field, order]) =>
              ({ ...sort, [field as keyof typeof sort]: order ? -1 : 1 }), {}
            )
        )
      }

      const items = await cursor.toArray()

      return {
        pager, items: items.map(item => demarshal({ ...item } as unknown as R))
      }
    },

    lock: async (record, fields) => {
      fields ??= getSchemaSecureFeilds(resource.schema ?? {})
      if (fields == null || fields.length < 1) {
        throw new SyntaxError(`No fields to lock: ${JSON.stringify(record)}`)
      }

      const context = assertContext<Config, Context>(resource.ctx as Context, location)
      const mongo = context.service<MongoDbService>(serviceAlias ?? dbAlias)

      return mongo.lock(dbAlias, record, fields)
    },

    unlock: async (record, fields) => {
      fields ??= getSchemaSecureFeilds(resource.schema ?? {})
      if (fields == null || fields.length < 1) {
        throw new SyntaxError(`No fields to unlock: ${JSON.stringify(record)}`)
      }

      const context = assertContext<Config, Context>(resource.ctx as Context, location)
      const mongo = context.service<MongoDbService>(serviceAlias ?? dbAlias)

      return mongo.unlock(dbAlias, record, fields)
    },

    db: async () => {
      const context = assertContext<Config, Context>(resource.ctx as Context, location)
      const mongo = context.service<MongoDbService>(serviceAlias ?? dbAlias)
      await mongo.ready()
      return await mongo.db(dbAlias)
    },

    client: async () => {
      const context = assertContext<Config, Context>(resource.ctx as Context, location)
      const mongo = context.service<MongoDbService>(serviceAlias ?? dbAlias)
      await mongo.ready()
      return await mongo.client(dbAlias)
    },

    index: (name, index, options) => {
      resource.indexes = resource.indexes ?? []
      resource.indexes.push({ name, index, options })
      return resource
    },

    /**
     * `migration` and `reference` are `this`-returning in the interface, which an object
     * literal can't express — hence the member level casts: the implementations return
     * the closed over `resource`, which is that very object.
     */
    migration: ((name: string, apply: (tx: MongoTx) => Promise<void>, stage?: MigrationStage) => {
      getDeclaration(alias).migrations.register(name, apply, stage)
      return resource
    }) as T['migration'],

    migrations: () => getDeclaration(alias).migrations,

    reference: ((field: string, opts?: string | MongoRefOptions) => {
      const declaration = getDeclaration(alias)
      const options = typeof opts === 'string' ? { resource: opts } : opts ?? {}
      declaration.references.set(field, { field, resource: options.resource, noIndex: options.noIndex })
      /**
       * The system migration that converts the field's pre-existing string ids. Registered
       * here rather than at init so it precedes migrations the app declares after its
       * `reference()` calls — the field's type contract is the foundation those build on.
       */
      declaration.migrations.register(refMigrationName(field), makeRefMigration(field), MigrationStage.Pre)

      return resource
    }) as T['reference'],

    references: () => [...getDeclaration(alias).references.values()]
  } as Partial<T>)

  // Explicit collection name override (decoupled from the registration alias, which may
  // contain characters that aren't valid in a collection name). Survives reinitializeContext
  // because it's threaded back into the recursive makeMongoResource call below.
  if (collectionName != null) {
    resource.name = collectionName
  }

  resource.init = async () => {
    const context = assertContext<Config, Context>(resource.ctx as Context, location)
    const mongo = context.service<MongoDbService>(serviceAlias ?? dbAlias)
    await mongo.ready()
    const db = await mongo.db(dbAlias)
    const config = mongo.config(dbAlias)
    resource.collection = await initializeCollection(
      db, config, resource as unknown as MongoResource<ResourceRecord>, context
    )
  }

  resource.reinitializeContext = <Type extends Contextual>(context: BasicContext<Config>) => {
    const resource = (makeCustomResource?.(dbAlias, serviceAlias)
      ?? makeMongoResource<R, T>(alias, dbAlias, serviceAlias, makeCustomResource, collectionName)) as unknown as Type

    resource.ctx = context

    return resource as Type
  }

  return resource
}

const _prepareValues = <T extends ResourceRecord>(
  obj: T, schema?: JSONSchemaType<T>, refs?: Map<string, MongoReference>
): T => {
  /**
   * Declared references convert independently of the schema — the schema is optional,
   * and where it exists it declares these fields as strings, whose coercion below would
   * undo the conversion.
   */
  if (refs != null && refs.size > 0) {
    obj = Object.fromEntries(Object.entries(obj).map(([key, value]) =>
      refs.has(key) ? [key, marshalReference(key, value)] : [key, value]
    )) as T
  }
  // @TODO Validate keys from additional properties in the root
  return schema != null ? Object.fromEntries(Object.entries(obj).map(([key, value]) => {
    if (key === '_id' && !(value instanceof ObjectId)) {
      return [key, new ObjectId(value as string)]
    }
    if (key === '_id' || refs?.has(key)) {
      return [key, value]
    }
    // A null/undefined value has nothing to coerce — pass it through for any declared
    // type. Without this guard the object-map and array branches below call
    // `Object.entries`/`.map` on `undefined` and throw (and `new Date(null)` would
    // silently produce an epoch/Invalid Date). Keeps nullable fields honest.
    if (value == null) {
      return [key, value]
    }
    const type = schema.properties?.[key]

    if (type?.type === 'object') {
      if (type.format === 'date-time') {
        return [key, new Date(value as string)]
      }

      if (type.additionalProperties != null && type.additionalProperties.type === 'object') {
        value = Object.fromEntries(Object.entries(value).map(([key, value]) => {
          return [key, _prepareSingleValue(value, type.additionalProperties as JSONSchemaType<any>)]
        }))

        return [key, value]
      }

      return [key, _prepareValues(value, type as JSONSchemaType<typeof value>)]
    } else if (type?.type === 'array') {
      return [key, (value as any[]).map(item => _prepareSingleValue(item, type.items as JSONSchemaType<any>))]
    }

    return [key, _prepareSingleValue(value, type)]
  })) as T : obj
}

const _prepareSingleValue = <T>(value: T, schema?: JSONSchemaType<T>) => {
  if (['object', 'array'].includes(schema?.type)) {
    return _prepareValues(value as any, schema as JSONSchemaType<any>)
  }
  if (schema?.type === 'string' && value != null) {
    return `${value}`
  }
  if (schema?.type === 'number' && value != null) {
    return +value
  }
  if (schema?.type === 'boolean' && value != null) {
    return !!value
  }
  if (value == null) {
    return value
  }

  // We sclarize value forcefully if we don't expect any tricks here
  return `${value}`
}
