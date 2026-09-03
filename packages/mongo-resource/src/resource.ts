import { appendContextual, assertContext } from '@owlmeans/context'
import { DEFAULT_DB_ALIAS, DEFAULT_PAGE_SIZE } from './consts.js'
import { MigrationStage } from '@owlmeans/resource'
import type {
  Criteria, FirstOptions, ListOptions, ListResult, ResourceRecord, WriteOptions
} from '@owlmeans/resource'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { MongoDbService, MongoReference, MongoRefOptions, MongoResource, MongoTx } from './types.js'
import { initializeCollection } from './utils/life-cycle.js'
import { getDeclaration } from './declarations.js'
import { ObjectId } from 'mongodb'
import type { CreateIndexesOptions, Document, IndexSpecification } from 'mongodb'
import {
  MisshapedRecord, RecordExists, UnknownRecordError, UnsupportedArgumentError, RecordUpdateFailed
} from '@owlmeans/resource'
import type { JSONSchemaType } from 'ajv'
import { getSchemaSecureFeilds } from './helper.js'
import { criteriaToFilter, sortToMongo } from './utils/criteria.js'
import {
  demarshalRefs, identityCriteria, makeRefMigration, marshalReference, refMigrationName
} from './utils/refs.js'

type Config = ServerConfig
type Context<C extends Config = Config> = ServerContext<C>

export const makeMongoResource = <
  R extends ResourceRecord, T extends MongoResource<R> = MongoResource<R>
>(
  alias: string, dbAlias: string = DEFAULT_DB_ALIAS, serviceAlias: string = DEFAULT_DB_ALIAS,
  collectionName?: string
): T => {
  const location = `mongo-resource:${alias}`

  /**
   * Live view — references may be declared after the resource is built, and the
   * declarations live at module scope keyed by alias, so a second maker run for the
   * same alias sees everything already declared for it.
   */
  const refs = (): Map<string, MongoReference> => getDeclaration(alias).references

  const demarshal = <Type extends ResourceRecord>(record: Type & { _id?: unknown }): Type => {
    record.id = record._id instanceof ObjectId ? record._id.toString() : record._id as string
    delete record._id
    return demarshalRefs(record, refs())
  }

  /**
   * A read addressed either way. An id is matched tolerantly: a string that is not a mongo id
   * finds nothing, where handing it to `ObjectId` would raise a driver error at a call site
   * that only asked whether the record exists.
   */
  const filterOf = (idOrWhere: string | Criteria<R>): Document =>
    typeof idOrWhere === 'string'
      ? identityCriteria('id', idOrWhere, refs())
      : criteriaToFilter(idOrWhere, refs())

  /**
   * The single implementation both overloads of `load` and `get` stand on — an id and a
   * criteria object differ only in how the filter is built.
   */
  const loadOne = async (
    idOrWhere: string | Criteria<R>, opts?: FirstOptions<R>
  ): Promise<R | null> => {
    const sort = sortToMongo(opts?.sort)
    const record = await resource.collection.findOne(
      filterOf(idOrWhere), sort != null ? { sort } : {}
    )

    return record != null ? demarshal(record as unknown as R) : null
  }

  const resource: T = appendContextual<T>(alias, {
    get: (async (idOrWhere: string | Criteria<R>, opts?: FirstOptions<R>): Promise<R> => {
      const record = await loadOne(idOrWhere, opts)
      if (record == null) {
        throw new UnknownRecordError(
          typeof idOrWhere === 'string' ? idOrWhere : JSON.stringify(idOrWhere)
        )
      }

      return record
    }) as T['get'],

    load: loadOne as T['load'],

    list: async (where?: Criteria<R>, opts?: ListOptions<R>): Promise<ListResult<R>> => {
      const filter = criteriaToFilter(where, refs())
      const total = await resource.collection.countDocuments(filter)

      /** `size: 0` is the explicit ask for everything; an omitted size pages by default. */
      const size = opts?.size ?? DEFAULT_PAGE_SIZE
      const page = opts?.page ?? 0
      if (size < 1 && page !== 0) {
        /** Nothing to page through — answering page 0 instead would be a silent wrong answer. */
        throw new UnsupportedArgumentError('page-without-size')
      }

      if (total === 0) {
        return size > 0 ? { items: [], total, page, size } : { items: [], total }
      }

      let cursor = resource.collection.find(filter)
      const sort = sortToMongo(opts?.sort)
      if (sort != null) {
        cursor = cursor.sort(sort)
      }
      if (size > 0) {
        cursor = cursor.skip(page * size).limit(size)
      }

      const items = (await cursor.toArray()).map(item => demarshal({ ...item } as unknown as R))

      return size > 0 ? { items, total, page, size } : { items, total }
    },

    count: async (where?: Criteria<R>): Promise<number> =>
      await resource.collection.countDocuments(criteriaToFilter(where, refs())),

    update: async (record: Partial<R>, opts?: WriteOptions): Promise<R> => {
      if (opts?.ttl != null) {
        throw new UnsupportedArgumentError('ttl')
      }
      const id = record.id
      if (id == null) {
        throw new MisshapedRecord('id')
      }

      /** Absence is an error, not a silent no-op — `replaceOne` would just match nothing. */
      const original = await resource.get(id)

      const replace: Document = { ...record }
      /**
       * Documents never store `id`, and a replacement that omits `_id` keeps the one the
       * document already carries — so the whole record is replaced without touching its key.
       */
      delete replace.id

      const result = await resource.collection.replaceOne(
        identityCriteria('id', original.id as string, refs()),
        _prepareValues(replace, resource.schema as JSONSchemaType<any>, refs())
      )
      if (!result.acknowledged) {
        throw new RecordUpdateFailed(`id:${id}`)
      }

      return await resource.get(original.id as string)
    },

    save: async (record: Partial<R>, opts?: WriteOptions): Promise<R> =>
      record.id != null
        ? await resource.update(record, opts)
        : await resource.create(record, opts),

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

    create: async (record: Partial<R>, opts?: WriteOptions): Promise<R> => {
      if ("id" in record && record.id == null) {
        delete record.id
      }
      if (record.id != null) {
        throw new RecordExists('id-present')
      }
      if (opts?.ttl != null) {
        throw new UnsupportedArgumentError('ttl')
      }
      const result = await resource.collection.insertOne({
        ...resource.getDefaults(),
        ..._prepareValues(record, resource.schema as JSONSchemaType<any>, refs())
      })

      if (!result.acknowledged) {
        throw new RecordUpdateFailed(`creation`)
      }

      return await resource.get(result.insertedId.toString())
    },

    /** Atomic: the record is handed back by the very operation that removed it. */
    delete: async (id: string): Promise<R | null> => {
      const record = await resource.collection.findOneAndDelete(identityCriteria('id', id, refs()))

      return record != null ? demarshal(record as unknown as R) : null
    },

    take: async (id: string): Promise<R> => {
      const record = await resource.delete(id)
      if (record == null) {
        throw new UnknownRecordError(id)
      }

      return record
    },

    purge: async (where: Criteria<R>): Promise<number> => {
      const filter = criteriaToFilter(where, refs())
      if (Object.keys(filter).length < 1) {
        /** An empty filter here would empty the collection. */
        throw new UnsupportedArgumentError('purge:no-criteria')
      }

      return (await resource.collection.deleteMany(filter)).deletedCount
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

    /**
     * `index`, `migration` and `reference` hand the resource itself back so declarations
     * chain — a return an object literal can't express, hence the member level casts: each
     * implementation returns the closed over `resource`, which is that very object.
     */
    index: ((name: string, index: IndexSpecification, options?: CreateIndexesOptions) => {
      resource.indexes = resource.indexes ?? []
      resource.indexes.push({ name, index, options })
      return resource
    }) as T['index'],

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
  // contain characters that aren't valid in a collection name).
  if (collectionName != null) {
    resource.name = collectionName
  }
  resource.dbAlias = dbAlias
  resource.serviceAlias = serviceAlias

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
