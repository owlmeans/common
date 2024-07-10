import { appendContextual, assertContext } from '@owlmeans/context'
import type { BasicContext, Contextual } from '@owlmeans/context'
import { DEFAULT_DB_ALIAS, DEFAULT_PAGE_SIZE } from './consts.js'
import type { ListCriteria, ListPager, ResourceRecord } from '@owlmeans/resource'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { MongoDbService, MongoResource, ResourceMaker } from './types.js'
import { initializeCollection } from './utils/life-cycle.js'
import { ObjectId } from 'mongodb'
import { MisshapedRecord, RecordExists, UnknownRecordError, UnsupportedArgumentError, RecordUpdateFailed } from '@owlmeans/resource'
import { JSONSchemaType } from 'ajv'

type Config = ServerConfig
type Context<C extends Config = Config> = ServerContext<C>

export const makeMongoResource = <
  R extends ResourceRecord, T extends MongoResource<R> = MongoResource<R>
>(
  alias: string, dbAlias: string = DEFAULT_DB_ALIAS, serviceAlias: string = DEFAULT_DB_ALIAS,
  makeCustomResource?: ResourceMaker<R, T>
): T => {
  const location = `mongo-resource:${alias}`

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
      const criteria = '_id' === field ? new ObjectId(id) : id
      if (opts?.ttl != null) {
        throw new UnsupportedArgumentError('ttl')
      }

      const record = await resource.collection.findOne({ [field]: criteria })
      if (record != null) {
        record.id = record._id instanceof ObjectId ? record._id.toString() : record._id
        delete (record as any)._id
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

      await resource.get(id, opts)

      const criteria = '_id' === field ? new ObjectId(id) : id

      const _record = { ...record }
      if (_record.id != null) {
        delete _record.id
      }

      const result = await resource.collection.updateOne({ [field]: criteria }, { $set: _record })
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
      if (record.id != null) {
        throw new RecordExists('id-present')
      }
      if (opts != null && opts.ttl != null) {
        throw new UnsupportedArgumentError('ttl')
      }
      const result = await resource.collection.insertOne({ ...resource.getDefaults(), ...record })

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

      const criteria = '_id' === field ? new ObjectId(_id) : _id

      const result = await resource.collection.deleteOne({ [field]: criteria })
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
      if (opts == null) {
        if (criteria == null) {
          criteria = {}
          opts = {}
        } else if ('criteria' in criteria) {
          criteria = criteria.criteria as ListCriteria
          opts = { pager: criteria.pager as ListPager | undefined }
        } else if ('pager' in criteria) {
          opts = { pager: criteria.pager as ListPager | undefined }
          criteria = {}
        }
      }

      const size = (opts?.pager?.size ?? DEFAULT_PAGE_SIZE)
      const total = await resource.collection.countDocuments(criteria as ListCriteria)
      const pager: ListPager = {
        sort: opts?.pager?.sort,
        page: opts?.pager?.page ?? 0,
        size, total
      }

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

      return { items, pager }
    },

    index: (name, index, options) => {
      resource.indexes = resource.indexes ?? []
      resource.indexes.push({ name, index, options })
      return resource
    }
  } as Partial<T>)

  resource.init = async () => {
    const context = assertContext<Config, Context>(resource.ctx as Context, location)
    const mongo = context.service<MongoDbService>(serviceAlias ?? dbAlias)
    const db = await mongo.db(dbAlias)
    const config = mongo.config(dbAlias)
    resource.collection = await initializeCollection(db, config, resource as unknown as MongoResource<ResourceRecord>)
  }

  resource.reinitializeContext = <Type extends Contextual>(context: BasicContext<Config>) => {
    const resource = (makeCustomResource?.(dbAlias, serviceAlias)
      ?? makeMongoResource<R, T>(alias, dbAlias, serviceAlias)) as unknown as Type

    resource.ctx = context

    return resource as Type
  }

  return resource
}
