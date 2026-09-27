import { appendContextual, assertContext } from '@owlmeans/context'
import {
  MisshapedRecord, RecordExists, RecordUpdateFailed, UnknownRecordError, UnsupportedArgumentError
} from '@owlmeans/resource'
import type {
  Criteria, FirstOptions, ListOptions, ListResult, MigrationStage, ResourceRecord, WriteOptions
} from '@owlmeans/resource'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { AnySchema, JSONSchemaType } from 'ajv'
import { eq, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
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

/** Postgres has no row expiry — silently ignoring a TTL would lose data. */
const refuseTtl = (opts?: WriteOptions): void => {
  if (opts?.ttl != null) {
    throw new UnsupportedArgumentError('ttl')
  }
}

export const makePostgresResource = <
  R extends ResourceRecord, T extends PostgresResource<R> = PostgresResource<R>
>(
  alias: string, dbAlias: string = DEFAULT_DB_ALIAS, serviceAlias: string = DEFAULT_DB_ALIAS,
  tableName?: string
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

  /** `WHERE <column> = <value>` for one property, by its schema name. */
  const identify = (
    table: TableSpec, from: PgRuntimeTable, property: string, value: unknown
  ): SQL => eq(from[columnOf(table, property).property], value)

  /**
   * The condition a read or a write is keyed on. A string is the record's id; a criteria
   * object is translated in full, so one call can ask by several fields at once.
   */
  const where = (
    table: TableSpec, from: PgRuntimeTable, query: string | Criteria<R>
  ): SQL | undefined => typeof query === 'string'
    ? identify(table, from, ID_FIELD, query)
    : criteriaToSql(query, table, from)

  /** What an unknown record is called in the error — the id, or the query that missed. */
  const describe = (query: string | Criteria<R>): string =>
    typeof query === 'string' ? query : JSON.stringify(query)

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

  /**
   * The single-record read both `get` and `load` answer with. Standalone so neither closes over
   * `resource` — a member that referenced it could not be inferred against the generic.
   */
  const loadOne = async (query: string | Criteria<R>, opts?: FirstOptions<R>): Promise<R | null> => {
    const { db, spec: table, entity: from } = await ensure()

    const rows = await db.drizzle.select().from(from).where(where(table, from, query))
      .orderBy(...sortToSql(opts?.sort, table, from)).limit(1)

    return rows.length < 1 ? null : resultToRecord<R>(rows[0] as Record<string, unknown>, table)
  }

  const members: Partial<PostgresResource<R>> = {
    get: (async (query: string | Criteria<R>, opts?: FirstOptions<R>): Promise<R> => {
      const record = await loadOne(query, opts)
      if (record == null) {
        throw new UnknownRecordError(describe(query))
      }

      return record
    }) as T['get'],

    load: loadOne as T['load'],

    list: async (criteria?: Criteria<R>, opts?: ListOptions<R>): Promise<ListResult<R>> => {
      const { db, spec: table, entity: from } = await ensure()
      const condition = criteriaToSql(criteria, table, from)
      const order = sortToSql(opts?.sort, table, from)

      /** Counted separately, so `total` describes the whole match rather than the page. */
      const totals = await db.drizzle
        .select({ total: sql<number>`count(*)::int` }).from(from).where(condition)
      const total = Number((totals[0] as { total: number } | undefined)?.total ?? 0)

      const marshal = (rows: unknown[]): R[] =>
        rows.map(row => resultToRecord<R>(row as Record<string, unknown>, table))

      /** `size: 0` lifts the limit — the explicit, greppable way to read a whole table. */
      const size = opts?.size ?? DEFAULT_PAGE_SIZE
      if (size === 0) {
        const all = total === 0
          ? []
          : await db.drizzle.select().from(from).where(condition).orderBy(...order)

        return { items: marshal(all), total }
      }

      const page = opts?.page ?? 0
      const skip = page * size
      const rows = total === 0 || skip >= total
        ? []
        : await db.drizzle.select().from(from).where(condition).orderBy(...order)
          .limit(size).offset(skip)

      return { items: marshal(rows), total, page, size }
    },

    save: async (record, opts) => record.id != null
      ? resource.update(record, opts)
      : resource.create(record, opts),

    create: async (record, opts) => {
      if (ID_FIELD in record && record.id == null) {
        delete record.id
      }
      if (record.id != null) {
        throw new RecordExists('id-present')
      }
      refuseTtl(opts)

      return resource.insert(record)
    },

    insert: async record => {
      const { db, spec: table, entity: into } = await ensure()
      const values = recordToValues(
        { ...resource.getDefaults(), ...record } as Record<string, unknown>, table
      )
      try {
        const rows = await db.drizzle.insert(into).values(values as never).returning()
        if (rows.length < 1) {
          throw new RecordUpdateFailed('creation')
        }

        return resultToRecord<R>(rows[0] as Record<string, unknown>, table)
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
        const rows = await db.drizzle.insert(into).values(values as never)
          .onConflictDoUpdate({ target, set: set as never }).returning()
        if (rows.length < 1) {
          throw new RecordUpdateFailed('upsert')
        }

        return resultToRecord<R>(rows[0] as Record<string, unknown>, table)
      } catch (error) {
        throw pgErrorToResourceError(error)
      }
    },

    update: async (record, opts) => {
      refuseTtl(opts)
      const { db, spec: table, entity: target } = await ensure()
      const key = record.id
      if (key == null) {
        throw new MisshapedRecord(ID_FIELD)
      }

      /** Replace, not merge — the semantics mongo's `replaceOne` gives. `patch()` merges. */
      const values = recordToFullValues(record as Record<string, unknown>, table)
      try {
        const rows = await db.drizzle.update(target).set(values as never)
          .where(identify(table, target, ID_FIELD, key)).returning()
        if (rows.length < 1) {
          throw new UnknownRecordError(`${key}`)
        }

        return resultToRecord<R>(rows[0] as Record<string, unknown>, table)
      } catch (error) {
        throw pgErrorToResourceError(error)
      }
    },

    patch: async (record, opts) => {
      refuseTtl(opts)
      const { db, spec: table, entity: target } = await ensure()
      const key = record.id
      if (key == null) {
        throw new MisshapedRecord(ID_FIELD)
      }

      const values = recordToValues(record as Record<string, unknown>, table)
      for (const column of table.primaryKey) {
        delete values[table.byColumn[column]?.property ?? column]
      }
      if (Object.keys(values).length < 1) {
        return resource.get(`${key}`)
      }

      try {
        const rows = await db.drizzle.update(target).set(values as never)
          .where(identify(table, target, ID_FIELD, key)).returning()
        if (rows.length < 1) {
          throw new UnknownRecordError(`${key}`)
        }

        return resultToRecord<R>(rows[0] as Record<string, unknown>, table)
      } catch (error) {
        throw pgErrorToResourceError(error)
      }
    },

    delete: async id => {
      const { db, spec: table, entity: from } = await ensure()

      /** One statement — mongo's read-then-delete can lose the record between the two. */
      const rows = await db.drizzle.delete(from)
        .where(identify(table, from, ID_FIELD, id)).returning()

      return rows.length < 1 ? null : resultToRecord<R>(rows[0] as Record<string, unknown>, table)
    },

    take: async id => {
      const record = await resource.delete(id)
      if (record == null) {
        throw new UnknownRecordError(id)
      }

      return record
    },

    purge: async criteria => {
      const { db, spec: table, entity: from } = await ensure()
      const condition = criteriaToSql(criteria, table, from)
      if (condition == null) {
        /** An empty criteria object here would silently truncate the table. */
        throw new UnsupportedArgumentError('purge:no-criteria')
      }
      const rows = await db.drizzle.delete(from).where(condition).returning()

      return rows.length
    },

    count: async criteria => {
      const { db, spec: table, entity: from } = await ensure()
      const rows = await db.drizzle.select({ total: sql<number>`count(*)::int` })
        .from(from).where(criteriaToSql(criteria, table, from))

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

    query: (async (text: string, params?: unknown[]) => (await raw(text, params)).rows) as T['query'],

    queryOne: (async (text: string, params?: unknown[]) => (await raw(text, params)).rows[0] ?? null) as T['queryOne'],

    execute: async (text, params) => (await raw(text, params)).count,

    select: async (text, params) => {
      const { spec: table } = await ensure()
      const result = await raw(text, params)

      return result.rows.map(row => rowToRecord<R>(row, table))
    },

    selectOne: async (text, params) => {
      const { spec: table } = await ensure()
      const result = await raw(text, params)

      return result.rows.length < 1 ? null : rowToRecord<R>(result.rows[0], table)
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

    /** Chainable — the declaration store is keyed by alias, so this object is the whole state. */
    index: (name: string, index: PgIndexSpec) => {
      declaration.indexes.push({ ...index, name })

      return resource
    },

    /** Self-returning in the interface — the implementation returns that very object. */
    migration: ((name: string, apply: (tx: PostgresTx) => Promise<void>, stage?: MigrationStage) => {
      declaration.migrations.register(name, apply, stage)

      return resource
    }) as T['migration'],

    migrations: () => declaration.migrations
  }

  const resource: T = appendContextual<T>(alias, members as Partial<T>)

  /**
   * The AJV schema is stored per alias rather than on the object, so a second maker run for
   * the same alias (a custom maker, a repeated maker, a spec) picks up the schema the app
   * assigned after construction instead of silently taking the table's structure with it.
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
   * carry characters no identifier allows.
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

  return resource
}
