import { makeKeyPairModel } from '@owlmeans/basic-keys'
import { assertContext, Layer } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import {
  makeTx, pgErrorToResourceError, pgIdentifier, refOf, resolvePlaceholders
} from '@owlmeans/postgres-resource'
import type { PostgresDb, PostgresMeta } from '@owlmeans/postgres-resource'
import { createDbService } from '@owlmeans/resource'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import type { QueryResultRow } from 'pg'

import { DEFAULT_ALIAS } from './consts.js'
import { bootstrapDb } from './bootstrap.js'
import { drainMiddleware } from './middleware.js'
import type { PostgresService } from './types.js'
import { poolDatabase, prepareConfig } from './utils/config.js'
import { ensureSchema, probe } from './utils/connection.js'

type Config = ServerConfig
interface Context<C extends Config = Config> extends ServerContext<C> { }

export const makePostgresDbService = (alias: string = DEFAULT_ALIAS): PostgresService => {
  const location = `postgres:${alias}`

  /**
   * Handles are cached per config alias rather than rebuilt per call: `db()` runs on every
   * single resource operation, and both the Drizzle binding and the schema name are fixed
   * for the lifetime of a service instance — a layer switch produces a *new* instance.
   */
  const handles: Map<string, PostgresDb> = new Map()
  const deferred: Map<string, Array<() => Promise<void>>> = new Map()

  const service: PostgresService = createDbService<PostgresDb, Pool, PostgresService>(alias, {
    db: async configAlias => {
      const pool = await service.client(configAlias)
      configAlias = service.ensureConfigAlias(configAlias)

      let handle = handles.get(configAlias)
      if (handle == null) {
        handle = {
          drizzle: drizzle(pool) as NodePgDatabase<Record<string, never>>,
          pool,
          /**
           * `name()` is the layer aware namespace — the Postgres SCHEMA here, where Mongo
           * reads the same value as a database name. It can outgrow 63 bytes once a layer
           * suffix is appended, which Postgres would truncate silently.
           */
          schema: pgIdentifier(service.name(configAlias)),
          database: poolDatabase(pool)
        }
        handles.set(configAlias, handle)
      }

      return handle
    },

    initialize: async configAlias => {
      configAlias = service.ensureConfigAlias(configAlias)
      const config = service.config(configAlias)

      if (service.clients[configAlias] != null) {
        return
      }

      if (service.layers == null) {
        service.layers = [Layer.Global]
      }
      /**
       * Sensitivity *adds* a layer the service is willing to serve. The Mongo copy of this
       * block tests `includes` where it means `!includes`, so it only ever appends a layer
       * that is already there — a latent no-op, corrected here.
       */
      if (config.serviceSensitive === true && !service.layers.includes(Layer.Service)) {
        service.layers.push(Layer.Service)
      }
      if (config.entitySensitive === true && !service.layers.includes(Layer.Entity)) {
        service.layers.push(Layer.Entity)
      }

      const meta = (config.meta ?? {}) as PostgresMeta
      const pool = new Pool(prepareConfig(config))

      /**
       * Not optional: node-postgres emits `error` on *idle* clients when the server closes
       * a connection — a routine event behind a load balancer — and an unhandled `error`
       * on an EventEmitter terminates the process.
       */
      pool.on('error', error => {
        console.error(`${location}: idle client error — ${(error as Error).message}`)
      })

      try {
        await probe(pool, meta, location)
      } catch (error) {
        await pool.end().catch(() => undefined)
        throw error
      }

      process.on('SIGTERM', () => { void pool.end().catch(() => undefined) })

      if (service.clients[configAlias] != null) {
        await pool.end().catch(() => undefined)
        throw new SyntaxError(`Cannot replace existing postgres client: ${configAlias} - ${service.alias}`)
      }
      service.clients[configAlias] = pool

      /**
       * Only when the config names one. Resources create their own schema anyway, and the
       * admin connection points at the maintenance database — where inventing a namespace
       * from the service alias would leave an empty `postgres` schema behind on every boot.
       */
      if (config.schema != null) {
        await ensureSchema(pool, pgIdentifier(service.name(configAlias)))
      }
    },

    /**
     * `configAlias` is part of the contract for symmetry only — a resource's qualified
     * name comes from the table spec it compiled at init, which already resolved against
     * whichever config that resource was bound to.
     */
    qualify: resourceAlias => {
      const context = assertContext<Config, Context>(service.ctx as Context, location)

      return refOf(context as unknown as BasicContext<any>, null, resourceAlias)
    },

    query: async <Row extends QueryResultRow = QueryResultRow>(
      text: string, params?: unknown[], configAlias?: string
    ) => {
      const db = await service.db(configAlias)
      const context = assertContext<Config, Context>(service.ctx as Context, location)
      try {
        const result = await db.pool.query<Row>(
          resolvePlaceholders(text, context as unknown as BasicContext<any>, null), params as never[]
        )

        return result.rows
      } catch (error) {
        throw pgErrorToResourceError(error)
      }
    },

    transaction: async (fn, configAlias) => {
      const db = await service.db(configAlias)
      const context = assertContext<Config, Context>(service.ctx as Context, location)
      const client = await db.pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn(makeTx(
          client,
          text => resolvePlaceholders(text, context as unknown as BasicContext<any>, null),
          resourceAlias => refOf(context as unknown as BasicContext<any>, null, resourceAlias)
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

    defer: (configAlias, task) => {
      configAlias = service.ensureConfigAlias(configAlias)
      const tasks = deferred.get(configAlias)
      if (tasks == null) {
        deferred.set(configAlias, [task])

        return
      }
      tasks.push(task)
    },

    drain: async configAlias => {
      const aliases = configAlias != null
        ? [service.ensureConfigAlias(configAlias)]
        : [...deferred.keys()]

      for (const key of aliases) {
        const tasks = deferred.get(key)
        if (tasks == null) {
          continue
        }
        /**
         * Cleared before running, not after: a task that throws has still had its side
         * effects, and a later drain replaying it would apply them twice.
         */
        deferred.delete(key)
        for (const task of tasks) {
          await task()
        }
      }
    },

    bootstrap: async (configAlias, opts) => bootstrapDb(service, configAlias, opts),

    lock: async (configAlias, record, fields) => {
      configAlias = service.ensureConfigAlias(configAlias)
      const config = service.config(configAlias)
      if (config.encryptionKey == null) {
        throw new SyntaxError(`No encryption key for locking: ${configAlias}`)
      }
      if ((fields.length ?? 0) < 1) {
        throw new SyntaxError(`No fields to lock: ${JSON.stringify(record)}`)
      }

      const key = makeKeyPairModel(config.encryptionKey)

      return Object.fromEntries(
        await Promise.all(Object.entries(record).map(
          async ([field, value]) => [
            field,
            fields.includes(field) ? await key.encrypt(value) : value
          ]
        ))
      )
    },

    unlock: async (configAlias, record, fields) => {
      configAlias = service.ensureConfigAlias(configAlias)
      const config = service.config(configAlias)
      if (config.encryptionKey == null) {
        throw new SyntaxError(`No encryption key for unlocking: ${configAlias}`)
      }
      if ((fields.length ?? 0) < 1) {
        throw new SyntaxError(`No fields to unlock: ${JSON.stringify(record)}`)
      }

      const key = makeKeyPairModel(config.encryptionKey)

      return Object.fromEntries(
        await Promise.all(Object.entries(record).map(
          async ([field, value]) => [
            field,
            /** A value that was never locked decrypts to itself rather than failing. */
            fields.includes(field) ? await key.decrypt(value).catch(() => value) : value
          ]
        ))
      )
    },

    reinitializeContext: <T>(context: BasicContext<ServerConfig>) => {
      const _service = makePostgresDbService(alias)

      _service.ctx = context
      _service.layers = service.layers

      /**
       * Pools carry over instead of being reopened. A layer switch changes the Postgres
       * *schema*, not the server, and `max_connections` is a cluster wide budget — a pool
       * per tenant exhausts it long before the tenants run out. The handle cache is
       * deliberately *not* carried: its schema name is what the switch just changed.
       */
      Object.assign(_service.clients, service.clients)

      return _service as T
    }
  }, service => async () => {
    const context = assertContext<Config, Context>(service.ctx as Context, location)

    await context.cfg.dbs?.filter(dbConfig => dbConfig.service === alias).reduce(async (prev, dbConfig) => {
      await prev
      service.config(dbConfig.alias)
    }, Promise.resolve())

    service.initialized = true
  })

  return service
}

export const appendPostgres = <C extends Config, T extends Context<C> = Context<C>>(
  context: T, alias: string = DEFAULT_ALIAS
): T => {
  const service = makePostgresDbService(alias)

  context.registerService(service)
  context.registerMiddleware(drainMiddleware(alias))

  return context
}
