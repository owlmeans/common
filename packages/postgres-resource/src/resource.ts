import { appendContextual, assertContext } from '@owlmeans/context'
import type { BasicContext, Contextual } from '@owlmeans/context'
import {
  MisshapedRecord, RecordExists, RecordUpdateFailed, UnknownRecordError,
  UnsupportedArgumentError, prepareListOptions
} from '@owlmeans/resource'
import type {
  ListPager, MigrationStage, ResourceMaker, ResourceRecord
} from '@owlmeans/resource'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { AnySchema, JSONSchemaType } from 'ajv'
import { eq, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { PoolClient, QueryResultRow } from 'pg'

import { DEFAULT_DB_ALIAS, DEFAULT_PAGE_SIZE, ID_FIELD } from './consts.js'
import { getDeclaration } from './declarations.js'
import { pgErrorToResourceError } from './errors.js'
import { getSchemaSecureFeilds } from './helper.js'
import type {
  ColumnSpec, PgIndexSpec, PgRuntimeTable, PostgresDb, PostgresDbService, PostgresResource,
  PostgresTx, TableSpec
} from './types.js'
import { criteriaToSql, sortToSql } from './utils/criteria.js'
import { initializeTable } from './utils/life-cycle.js'
import { recordToFullValues, recordToValues, resultToRecord, rowToRecord } from './utils/marshal.js'
import { makeTx } from './utils/migrations.js'
import { refOf, resolvePlaceholders } from './utils/sql.js'

type Config = ServerConfig
type Context<C extends Config = Config> = ServerContext<C>

type Getter = string | { field?: string, ttl?: number | Date | string }

const fieldOf = (opts?: Getter): string | undefined =>
  typeof opts === 'string' ? opts : opts?.field

const ttlOf = (opts?: Getter): unknown =>
  typeof opts === 'object' ? opts.ttl : undefined

/**
 * Hand a runtime built table to Drizzle's query builder.
 *
 * {@link PgRuntimeTable} is deliberately untyped — the table is compiled from a JSON schema
 * at runtime, so there is no static shape to infer. Naming the erased `PgTable` here is what
 * keeps the builder's *result* types usable; casting the argument to `never` instead would
 * silently collapse every returned row to `never`.
 */
const pgTable = (table: PgRuntimeTable): PgTable => table as unknown as PgTable

export const makePostgresResource = <
  R extends ResourceRecord, T extends PostgresResource<R> = PostgresResource<R>
>(
  alias: string, dbAlias: string = DEFAULT_DB_ALIAS, serviceAlias: string = DEFAULT_DB_ALIAS,
  makeCustomResource?: ResourceMaker<R, T>, tableName?: string
): T => {
  const location = `postgres-resource:${alias}`
  const declaration = getDeclaration(alias)

  /** Set by `init()`; every data method goes through `ensure()`, which guarantees them. */
  let spec: TableSpec | undefined
  let entity: PgRuntimeTable | undefined
  let initializing: Promise<void> | undefined

  const service = (): PostgresDbService => {
    const context = assertContext<Config, Context>(resource.ctx as Context, location)

    return context.service<PostgresDbService>(serviceAlias ?? dbAlias)
  }

  const handle = async (): Promise<PostgresDb> => {
    const postgres = service()
    await postgres.ready()

    return postgres.db(dbAlias)
  }

  /**
   * Resources are normally initialized by the context, but a resource registered after
   * `init()` — or reached from a spec that never ran one — would otherwise fail with an
   * opaque "undefined table". Initializing on demand, once, keeps both paths working.
   */
  const ensure = async (): Promise<{ db: PostgresDb, spec: TableSpec, entity: PgRuntimeTable }> => {
    const db = await handle()
    if (spec == null || entity == null) {
      initializing = initializing ?? resource.init!()
      await initializing
    }
    if (spec == null || entity == null) {
      throw new SyntaxError(`Postgres resource not initialized: ${alias}`)
    }

    return { db, spec, entity }
  }

  const columnOf = (table: TableSpec, property: string): ColumnSpec => {
    const column = table.byProperty[property]
    if (column == null) {
      throw new UnsupportedArgumentError(`field:${property}`)
    }

    return column
  }

  const identify = (table: TableSpec, property: string, value: unknown): SQL => {
    const column = columnOf(table, property)

    return eq(entity![column.property], value)
  }

  const raw = async <Row extends QueryResultRow = QueryResultRow>(
    text: string, params?: unknown[]
  ): Promise<{ rows: Row[], count: number }> => {
    const { db, spec: table } = await ensure()
    const context = assertContext<Config, Context>(resource.ctx as Context, location)
    try {
      const result = await db.pool.query<Row>(
        resolvePlaceholders(text, context, table), params as never[]
      )

      return { rows: result.rows, count: result.rowCount ?? 0 }
    } catch (error) {
      throw pgErrorToResourceError(error)
    }
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
      if (ttlOf(opts) != null) {
        /** Postgres has no row expiry — silently ignoring a TTL would lose data. */
        throw new UnsupportedArgumentError('ttl')
      }
      const { db, spec: table, entity: from } = await ensure()

      const rows = await db.drizzle.select().from(pgTable(from))
        .where(identify(table, field ?? ID_FIELD, id)).limit(1)

      return rows.length < 1 ? null : resultToRecord(rows[0] as Record<string, unknown>, table)
    },

    list: async (criteria, opts) => {
      const { db, spec: table, entity: from } = await ensure()
      const options = prepareListOptions(DEFAULT_PAGE_SIZE, criteria, opts)
      const pager: ListPager = options.pager ?? {}
      const size = pager.size ?? DEFAULT_PAGE_SIZE
      const where = criteriaToSql(options.criteria, table, from)

      const totals = await db.drizzle
        .select({ total: sql<number>`count(*)::int` }).from(pgTable(from)).where(where)
      const total = Number((totals[0] as { total: number } | undefined)?.total ?? 0)
      pager.total = total

      const skip = (pager.page ?? 0) * size
      if (total === 0 || skip >= total) {
        return { items: [], pager }
      }

      const rows = await db.drizzle.select().from(pgTable(from)).where(where)
        .orderBy(...sortToSql(pager.sort, table, from)).limit(size).offset(skip)

      return { pager, items: rows.map(row => resultToRecord(row as Record<string, unknown>, table)) }
    },

    save: async (record, opts) => {
      const field = fieldOf(opts)
      const present = field != null
        ? record[field as keyof typeof record] != null
        : record.id != null

      return present
        ? resource.update(record, opts)
        : resource.create(record, typeof opts !== 'string' ? opts : undefined)
    },

    create: async (record, opts) => {
      if (ID_FIELD in record && record.id == null) {
        delete record.id
      }
      if (record.id != null) {
        throw new RecordExists('id-present')
      }
      if (opts?.ttl != null) {
        throw new UnsupportedArgumentError('ttl')
      }

      return resource.insert(record)
    },

    insert: async record => {
      const { db, spec: table, entity: into } = await ensure()
      const values = recordToValues(
        { ...resource.getDefaults(), ...record } as Record<string, unknown>, table
      )
      try {
        const rows = await db.drizzle.insert(pgTable(into)).values(values as never).returning()
        if (rows.length < 1) {
          throw new RecordUpdateFailed('creation')
        }

        return resultToRecord(rows[0] as Record<string, unknown>, table)
      } catch (error) {
        throw pgErrorToResourceError(error)
      }
    },

    upsert: async (record, conflict) => {
      const { db, spec: table, entity: into } = await ensure()
      const values = recordToValues(
        { ...resource.getDefaults(), ...record } as Record<string, unknown>, table
      )
      /** `conflict` names properties; the primary key is the default arbiter. */
      const properties = conflict ?? table.primaryKey
        .map(column => table.byColumn[column]?.property)
        .filter((property): property is string => property != null)
      const target = properties.map(property => into[columnOf(table, property).property])
      if (target.length < 1) {
        throw new UnsupportedArgumentError('upsert:no-conflict-target')
      }
      /** The arbiter columns identify the row — updating them to themselves is noise. */
      const set = { ...values }
      for (const property of properties) {
        delete set[property]
      }
      if (Object.keys(set).length < 1) {
        throw new UnsupportedArgumentError('upsert:nothing-to-update')
      }

      try {
        const rows = await db.drizzle.insert(pgTable(into)).values(values as never)
          .onConflictDoUpdate({ target: target as never, set: set as never }).returning()
        if (rows.length < 1) {
          throw new RecordUpdateFailed('upsert')
        }

        return resultToRecord(rows[0] as Record<string, unknown>, table)
      } catch (error) {
        throw pgErrorToResourceError(error)
      }
    },

    update: async (record, opts) => {
      const { db, spec: table, entity: target } = await ensure()
      const field = fieldOf(opts) ?? ID_FIELD
      const key = record[field as keyof typeof record]
      if (key == null) {
        throw new MisshapedRecord(field === ID_FIELD ? ID_FIELD : 'no-field-value')
      }

      /** Replace, not merge — the semantics mongo's `replaceOne` gives. `patch()` merges. */
      const values = recordToFullValues(record as Record<string, unknown>, table)
      try {
        const rows = await db.drizzle.update(pgTable(target)).set(values as never)
          .where(identify(table, field, key)).returning()
        if (rows.length < 1) {
          throw new UnknownRecordError(`${field}:${key}`)
        }

        return resultToRecord(rows[0] as Record<string, unknown>, table)
      } catch (error) {
        throw pgErrorToResourceError(error)
      }
    },

    patch: async (record, opts) => {
      const { db, spec: table, entity: target } = await ensure()
      const field = (typeof opts === 'string' ? opts : opts?.field) ?? ID_FIELD
      const key = record[field as keyof typeof record]
      if (key == null) {
        throw new MisshapedRecord(field === ID_FIELD ? ID_FIELD : 'no-field-value')
      }

      const values = recordToValues(record as Record<string, unknown>, table)
      for (const column of table.primaryKey) {
        delete values[table.byColumn[column]?.property ?? column]
      }
      if (Object.keys(values).length < 1) {
        return resource.get(`${key}`, field)
      }

      try {
        const rows = await db.drizzle.update(pgTable(target)).set(values as never)
          .where(identify(table, field, key)).returning()
        if (rows.length < 1) {
          throw new UnknownRecordError(`${field}:${key}`)
        }

        return resultToRecord(rows[0] as Record<string, unknown>, table)
      } catch (error) {
        throw pgErrorToResourceError(error)
      }
    },

    delete: async (id, opts) => {
      const { db, spec: table, entity: from } = await ensure()
      const field = fieldOf(opts) ?? ID_FIELD
      const key = typeof id === 'object' ? id[field as keyof typeof id] : id
      if (key == null) {
        throw new MisshapedRecord(field === ID_FIELD ? ID_FIELD : 'no-field-value')
      }

      /** One statement — mongo's read-then-delete can lose the record between the two. */
      const rows = await db.drizzle.delete(pgTable(from))
        .where(identify(table, field, key)).returning()

      return rows.length < 1 ? null : resultToRecord(rows[0] as Record<string, unknown>, table)
    },

    pick: async (id, opts) => {
      const record = await resource.delete(id, opts)
      if (record == null) {
        throw new UnknownRecordError(typeof id === 'string' ? id : (id.id ?? 'unknown'))
      }

      return record
    },

    purge: async criteria => {
      const { db, spec: table, entity: from } = await ensure()
      const where = criteriaToSql(criteria, table, from)
      if (where == null) {
        /** An empty criteria object here would silently truncate the table. */
        throw new UnsupportedArgumentError('purge:no-criteria')
      }
      const rows = await db.drizzle.delete(pgTable(from)).where(where).returning()

      return rows.length
    },

    count: async criteria => {
      const { db, spec: table, entity: from } = await ensure()
      const options = prepareListOptions(DEFAULT_PAGE_SIZE, criteria)
      const rows = await db.drizzle.select({ total: sql<number>`count(*)::int` })
        .from(pgTable(from)).where(criteriaToSql(options.criteria, table, from))

      return Number((rows[0] as { total: number } | undefined)?.total ?? 0)
    },

    getDefaults: () => {
      const schema = resource.schema as JSONSchemaType<unknown> | undefined
      if (schema == null) {
        return {}
      }

      return Object.entries(schema.properties ?? {}).reduce<Record<string, unknown>>(
        (defaults, [key, value]) => {
          const property = value as { default?: unknown }
          if (property.default === undefined) {
            return defaults
          }

          return { ...defaults, [key]: property.default }
        }, {}) as Partial<R>
    },

    query: async (text, params) => (await raw(text, params)).rows,

    queryOne: async (text, params) => (await raw(text, params)).rows[0] ?? null,

    execute: async (text, params) => (await raw(text, params)).count,

    select: async (text, params) => {
      const { spec: table } = await ensure()
      const result = await raw(text, params)

      return result.rows.map(row => rowToRecord(row, table))
    },

    selectOne: async (text, params) => {
      const { spec: table } = await ensure()
      const result = await raw(text, params)

      return result.rows.length < 1 ? null : rowToRecord(result.rows[0], table)
    },

    ref: resourceAlias => {
      const context = assertContext<Config, Context>(resource.ctx as Context, location)
      if (spec == null) {
        throw new SyntaxError(`Postgres resource not initialized: ${alias}`)
      }

      return refOf(context, spec, resourceAlias)
    },

    transaction: async fn => {
      const { db, spec: table } = await ensure()
      const context = assertContext<Config, Context>(resource.ctx as Context, location)
      const client: PoolClient = await db.pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn(makeTx(
          client,
          text => resolvePlaceholders(text, context, table),
          resourceAlias => refOf(context, table, resourceAlias)
        ))
        await client.query('COMMIT')

        return result
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw pgErrorToResourceError(error)
      } finally {
        client.release()
      }
    },

    lock: async (record, fields) => {
      fields ??= getSchemaSecureFeilds(resource.schema ?? {})
      if (fields.length < 1) {
        throw new SyntaxError(`No fields to lock: ${JSON.stringify(record)}`)
      }

      return service().lock(dbAlias, record, fields) as Promise<R>
    },

    unlock: async (record, fields) => {
      fields ??= getSchemaSecureFeilds(resource.schema ?? {})
      if (fields.length < 1) {
        throw new SyntaxError(`No fields to unlock: ${JSON.stringify(record)}`)
      }

      return service().unlock(dbAlias, record, fields) as Promise<R>
    },

    db: async () => handle(),

    client: async () => {
      const postgres = service()
      await postgres.ready()

      return postgres.client(dbAlias)
    },

    index: <Type extends PostgresResource<R>>(name: string, index: PgIndexSpec) => {
      declaration.indexes.push({ ...index, name })

      return resource as unknown as Type
    },

    /** `this`-returning in the interface — the implementation returns that very object. */
    migration: ((name: string, apply: (tx: PostgresTx) => Promise<void>, stage?: MigrationStage) => {
      declaration.migrations.register(name, apply, stage)

      return resource
    }) as T['migration'],

    migrations: () => declaration.migrations
  } as Partial<T>)

  /**
   * The AJV schema is stored per alias rather than on the object, so it survives
   * `reinitializeContext` — which rebuilds the resource and would otherwise drop a schema
   * the app assigned after construction, silently taking the table's structure with it.
   */
  Object.defineProperty(resource, 'schema', {
    enumerable: true,
    get: (): AnySchema | undefined => declaration.schema,
    set: (schema: AnySchema | undefined) => { declaration.schema = schema }
  })

  Object.defineProperty(resource, 'table', {
    enumerable: true,
    get: (): TableSpec | undefined => spec
  })

  Object.defineProperty(resource, 'entity', {
    enumerable: true,
    get: (): PgRuntimeTable | undefined => entity
  })

  /**
   * Explicit table name override, decoupled from the registration alias — an alias may
   * carry characters no identifier allows. Threaded back through the recursive maker call
   * below so it survives a context switch.
   */
  if (tableName != null) {
    resource.name = tableName
  }

  resource.init = async () => {
    const context = assertContext<Config, Context>(resource.ctx as Context, location)
    const postgres = service()
    await postgres.ready()
    const db = await postgres.db(dbAlias)
    const config = postgres.config(dbAlias)

    const initialized = await initializeTable(
      db, config, resource as unknown as PostgresResource<ResourceRecord>, context,
      task => postgres.defer(dbAlias, task)
    )
    spec = initialized.spec
    entity = initialized.entity
  }

  resource.reinitializeContext = <Type extends Contextual>(context: BasicContext<Config>) => {
    const replacement = (makeCustomResource?.(dbAlias, serviceAlias)
      ?? makePostgresResource<R, T>(
        alias, dbAlias, serviceAlias, makeCustomResource, tableName
      )) as unknown as Type

    replacement.ctx = context

    return replacement
  }

  return resource
}
