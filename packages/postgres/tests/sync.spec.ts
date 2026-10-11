import { afterAll, describe, expect, test } from 'bun:test'
import {
  makePgIntrospectHelper, makePostgresResource, PgAutoSync, pgDiffHelper, PostgresCastRequired,
} from '@owlmeans/postgres-resource'
import type { PostgresResource } from '@owlmeans/postgres-resource'
import type { ResourceRecord } from '@owlmeans/resource'

import { gate, makeSuite, shapeOf } from './context.js'
import type { PostgresService } from '@owlmeans/postgres'

interface Thing extends ResourceRecord {
  id?: string
  name?: string
}

const v1 = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    hits: { type: 'integer', nullable: true },
    legacy: { type: 'string', nullable: true }
  },
  required: ['id', 'name']
}

/** `hits` widens to bigint, `name` gains a length, `note` appears, `legacy` disappears. */
const v2 = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', pg: { type: 'varchar', length: 100 } },
    hits: { type: 'integer', nullable: true, pg: { type: 'bigint' } },
    note: { type: 'string', nullable: true }
  },
  required: ['id', 'name']
}

/** `name` text → integer, with `'a'` already stored: the cast is legal, the data is not. */
const v3 = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'integer' }
  },
  required: ['id', 'name']
}

const suite = makeSuite('sync')
const it = gate.skip ? test.skip : test

const boot = async (autoSync: PgAutoSync, schema: unknown): Promise<PostgresService> => {
  const thing = makePostgresResource<Thing, PostgresResource<Thing>>('sync-things')
  thing.schema = schema as never

  return (await suite.boot({ autoSync, resources: [thing] })).pg
}

const shape = async (pg: PostgresService): Promise<Record<string, string>> =>
  await shapeOf(pg, suite.schema, 'sync_things')

describe('@owlmeans/postgres — structure reconciliation', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'postgres gate closed', () => {})

    return
  }

  afterAll(async () => {
    await suite.teardown()
  })

  it('creates the table on the first boot', async () => {
    const pg = await boot(PgAutoSync.Full, v1)

    expect(await shape(pg)).toEqual({
      id: 'uuid NOT NULL',
      name: 'text NOT NULL',
      hits: 'integer',
      legacy: 'text'
    })

    await pg.query(
      `INSERT INTO {{sync-things}} ("name", "hits", "legacy") VALUES ($1, $2, $3)`, ['a', 1, 'keep']
    )
  })

  /**
   * The adoption path for a table this package did not create: converge what is missing
   * without touching what is there, verify the plan comes out empty, then flip to `full`.
   */
  it('additive adds columns but never retypes and never drops', async () => {
    const additive = await shape(await boot(PgAutoSync.Additive, v2))

    expect(additive.note).toBe('text')
    expect(additive.legacy).toBe('text')
    expect(additive.hits).toBe('integer')
    expect(additive.name).toBe('text NOT NULL')
  })

  it('full drops, retypes and tightens — and the rows survive', async () => {
    const pg = await boot(PgAutoSync.Full, v2)
    const full = await shape(pg)

    expect(full.legacy).toBeUndefined()
    expect(full.hits).toBe('bigint')
    expect(full.name).toBe('character varying(100) NOT NULL')

    const rows = await pg.query<{ name: string, hits: string | number }>(
      `SELECT "name", "hits" FROM {{sync-things}}`
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('a')
  })

  it('off reconciles nothing at all', async () => {
    /** v1 declares `legacy` and no `note`; with sync off the table keeps its v2 shape. */
    const off = await shape(await boot(PgAutoSync.Off, v1))

    expect(off.note).toBe('text')
    expect(off.legacy).toBeUndefined()
  })

  it('refuses an unsafe cast instead of truncating, and rolls the whole plan back', async () => {
    const before = await shape(await boot(PgAutoSync.Off, v2))

    await expect(boot(PgAutoSync.Full, v3)).rejects.toThrow(PostgresCastRequired)

    /** DDL runs in one transaction, so a refused step leaves nothing half applied. */
    expect(await shape(await boot(PgAutoSync.Off, v2))).toEqual(before)
  })

  it('names the escape hatch in the message it raises', async () => {
    const failure = await boot(PgAutoSync.Full, v3).catch((error: Error) => error)

    expect(failure).toBeInstanceOf(PostgresCastRequired)
    expect((failure as Error).message).toContain('using')
    expect((failure as Error).message).toContain('ALTER TABLE')
  })

  it('refuses a cast Postgres has no entry for at all', async () => {
    const flag = {
      type: 'object',
      properties: { id: { type: 'string', format: 'uuid' }, flag: { type: 'boolean', nullable: true } },
      required: ['id']
    }
    await boot(PgAutoSync.Full, flag)

    /** boolean → timestamptz: no registered cast, so it fails on an empty column too. */
    await expect(boot(PgAutoSync.Full, {
      ...flag,
      properties: {
        ...flag.properties,
        flag: { type: 'object', format: 'date-time', nullable: true }
      }
    })).rejects.toThrow(PostgresCastRequired)
  })
})

interface Plot extends ResourceRecord {
  id?: string
  garden: string
  bed?: string
  crop?: string
  season: string
  soil?: Record<string, unknown>
}

/**
 * A community garden's plots: a plain compound index, an expression index and two partial ones —
 * the shapes `pg_indexes.indexdef` renders differently from the statement that created them
 * (identifiers unquoted, literals cast, a partial predicate parenthesized), plus an enum CHECK.
 */
const plots = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    garden: { type: 'string' },
    bed: { type: 'string', nullable: true },
    crop: { type: 'string', nullable: true },
    season: { type: 'string', enum: ['spring', 'summer', 'autumn'] },
    soil: { type: 'object', nullable: true }
  },
  required: ['id', 'garden', 'season'],
  pg: {
    indexes: [
      { name: 'sync_plots_garden_season', columns: ['garden', 'season'] },
      { name: 'sync_plots_scope', unique: true, expression: `"garden", COALESCE("bed", ''), "season"` },
      { name: 'sync_plots_crop', columns: ['garden', 'crop'], where: '"crop" IS NOT NULL' },
      { name: 'sync_plots_wet', columns: ['garden'], where: `("soil"->>'state') = 'wet'` }
    ]
  }
}

const plotSuite = makeSuite('sync_idx')

describe('@owlmeans/postgres — reconciling a table already at its shape', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'postgres gate closed', () => {})

    return
  }

  afterAll(async () => {
    await plotSuite.teardown()
  })

  const bootPlots = async (): Promise<{ pg: PostgresService, resource: PostgresResource<Plot> }> => {
    const resource = makePostgresResource<Plot, PostgresResource<Plot>>('sync-plots')
    resource.schema = plots as never
    const booted = await plotSuite.boot({ resources: [resource] })

    return { pg: booted.pg, resource: booted.context.resource<PostgresResource<Plot>>('sync-plots') }
  }

  const objectOids = async (pg: PostgresService): Promise<Record<string, number>> => Object.fromEntries(
    (await pg.query<{ name: string, oid: number }>(
      `SELECT c.relname AS name, c.oid::int AS oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relkind = 'i' AND c.relname LIKE 'sync_plots_%'
       UNION ALL
       SELECT k.conname AS name, k.oid::int AS oid FROM pg_constraint k JOIN pg_namespace n ON n.oid = k.connamespace
        WHERE n.nspname = $1 AND k.contype = 'c' AND k.conname LIKE 'sync_plots_%'`, [plotSuite.schema]
    )).map(row => [row.name, row.oid])
  )

  it('plans nothing on a second boot — no index or check is dropped and recreated', async () => {
    const first = await bootPlots()
    const before = await objectOids(first.pg)
    expect(Object.keys(before).sort()).toEqual([
      'sync_plots_crop', 'sync_plots_garden_season', 'sync_plots_pkey', 'sync_plots_scope', 'sync_plots_season_enum',
      'sync_plots_wet'
    ])

    const second = await bootPlots()
    const { pool } = await second.resource.db()
    const client = await pool.connect()
    try {
      const table = second.resource.table
      const live = await makePgIntrospectHelper(client).introspectTable(table.schema, table.table, table.qualified)
      expect(pgDiffHelper.planSync(table, live).statements.map(statement => statement.sql)).toEqual([])
    } finally {
      client.release()
    }
    expect(await objectOids(second.pg)).toEqual(before)
  })
})
