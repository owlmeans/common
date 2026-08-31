import { afterAll, describe, expect, test } from 'bun:test'
import { makePostgresResource, resetDeclarations } from '@owlmeans/postgres-resource'
import type { PostgresResource, PostgresTx } from '@owlmeans/postgres-resource'
import { MigrationConflict, MigrationError, MigrationStage } from '@owlmeans/resource'
import type { ResourceRecord } from '@owlmeans/resource'

import { gate, ledgerOf, makeSuite, raw, shapeOf } from './context.js'
import type { LedgerRow, PostgresService } from './context.js'

interface Note extends ResourceRecord {
  id?: string
  title?: string
  slug?: string
  note?: string
}

const noteSchema = (extra: Record<string, unknown> = {}, required: string[] = []): unknown => ({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    title: { type: 'string', nullable: true },
    ...extra
  },
  required: ['id', ...required]
})

/**
 * Migration bodies live at module scope because the checksum hashes their source text: two
 * inline arrow functions that happen to read the same are the same migration, and two that
 * differ by a space are a conflict. Naming them makes both facts deliberate.
 */
const ran: Record<string, number> = {}
const tick = (name: string): void => { ran[name] = (ran[name] ?? 0) + 1 }

/** Would fail with `42P01` if it ever ran — the table does not exist yet at pre stage. */
const ghostBody = async (tx: PostgresTx): Promise<void> => {
  tick('ghost')
  await tx.execute('ALTER TABLE {{}} ADD COLUMN "ghost" text')
}

const seedBody = async (tx: PostgresTx): Promise<void> => {
  tick('seed')
  await tx.execute('INSERT INTO {{}} ("title") VALUES ($1)', ['seeded'])
}

/** Adds and backfills the column reconciliation is about to demand `NOT NULL` on. */
const slugBody = async (tx: PostgresTx): Promise<void> => {
  tick('slug')
  await tx.execute('ALTER TABLE {{}} ADD COLUMN "slug" text')
  await tx.execute(`UPDATE {{}} SET "slug" = 'backfilled' WHERE "slug" IS NULL`)
}

/** Writes into a column reconciliation has only just created. */
const noteBody = async (tx: PostgresTx): Promise<void> => {
  tick('note')
  await tx.execute(`UPDATE {{}} SET "note" = 'seen'`)
}

const failingBody = async (): Promise<void> => {
  tick('failing')
  throw new Error('deliberate')
}

const driftBody = async (tx: PostgresTx): Promise<void> => { await tx.execute('SELECT 1') }
const driftEdited = async (tx: PostgresTx): Promise<void> => { await tx.execute('SELECT 2') }

const copyBody = async (tx: PostgresTx): Promise<void> => {
  tick('copy')
  await tx.execute('INSERT INTO {{}} ("title") SELECT "title" FROM {{mig-src}}')
}

const suite = makeSuite('migration')
const it = gate.skip ? test.skip : test

interface Built {
  alias: string
  declare?: (resource: PostgresResource<Note>) => void
  schema?: unknown
}

const build = (spec: Built): PostgresResource<Note> => {
  const resource = makePostgresResource<Note, PostgresResource<Note>>(spec.alias)
  resource.schema = (spec.schema ?? noteSchema()) as never
  spec.declare?.(resource)

  return resource
}

const boot = async (...specs: Built[]): Promise<PostgresService> =>
  (await suite.boot({ resources: specs.map(build) })).pg

const ledger = async (pg: PostgresService, alias: string): Promise<LedgerRow[]> =>
  (await ledgerOf(pg, suite.schema)).filter(row => row.alias === alias)

describe('@owlmeans/postgres — code registered migrations', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'postgres gate closed', () => {})

    return
  }

  afterAll(async () => {
    await suite.teardown()
  })

  /**
   * A migration that reproduces a shape the current schema already produces must not be
   * replayed against a table that was just created with that shape. Here the proof is
   * blunt: `ghostBody` targets a table that does not exist at pre stage, so replaying it
   * would abort the boot outright.
   */
  it('baselines every migration on a table it just created', async () => {
    const pg = await boot({
      alias: 'mig-a',
      declare: resource => {
        resource.migration('0001-ghost', ghostBody)
        resource.migration('0002-seed', seedBody, MigrationStage.Post)
      }
    })

    const rows = await ledger(pg, 'mig-a')
    expect(rows.map(row => row.name)).toEqual(['0001-ghost', '0002-seed'])
    expect(rows.every(row => row.baseline)).toBe(true)
    /** Baselining covers both stages in one write, so the recorded stage is the declared one. */
    expect(rows.map(row => row.stage)).toEqual(['pre', 'post'])

    expect(ran.ghost).toBeUndefined()
    expect(ran.seed).toBeUndefined()
    expect(Object.keys(await shapeOf(pg, suite.schema, 'mig_a'))).not.toContain('ghost')
  })

  it('skips what the ledger already records on the next boot', async () => {
    const pg = await boot({
      alias: 'mig-a',
      declare: resource => {
        resource.migration('0001-ghost', ghostBody)
        resource.migration('0002-seed', seedBody, MigrationStage.Post)
      }
    })

    expect(ran.ghost).toBeUndefined()
    expect(ran.seed).toBeUndefined()
    expect(await ledger(pg, 'mig-a')).toHaveLength(2)
  })

  it('applies a migration added after the table exists, exactly once', async () => {
    await boot({ alias: 'mig-b' })
    expect(await ledger(await boot({ alias: 'mig-b' }), 'mig-b')).toHaveLength(0)

    const applied = await boot({
      alias: 'mig-b',
      declare: resource => { resource.migration('0001-seed', seedBody, MigrationStage.Post) }
    })

    expect(ran.seed).toBe(1)
    const rows = await ledger(applied, 'mig-b')
    expect(rows).toHaveLength(1)
    /** Applied, not baselined — the distinction is what makes a replay detectable. */
    expect(rows[0].baseline).toBe(false)

    /** Re-registering an identical body is a no-op, so this boot has the same registry. */
    const again = await boot({
      alias: 'mig-b',
      declare: resource => { resource.migration('0001-seed', seedBody, MigrationStage.Post) }
    })

    expect(ran.seed).toBe(1)
    expect(await ledger(again, 'mig-b')).toHaveLength(1)
    expect(await again.query('SELECT count(*)::int AS n FROM {{mig-b}}')).toEqual([{ n: 1 }])
  })

  /**
   * Both stages in one boot, each doing something the other stage could not: `slug` has to
   * exist and be backfilled *before* reconciliation demands `NOT NULL` on it, and `note`
   * cannot be written to until reconciliation has created it.
   */
  it('runs pre migrations before reconciliation and post migrations after it', async () => {
    const before = await boot({ alias: 'mig-c' })
    await before.query('INSERT INTO {{mig-c}} ("title") VALUES ($1)', ['existing'])

    const pg = await boot({
      alias: 'mig-c',
      schema: noteSchema({ slug: { type: 'string' }, note: { type: 'string', nullable: true } }, ['slug']),
      declare: resource => {
        resource.migration('0001-slug', slugBody)
        resource.migration('0002-note', noteBody, MigrationStage.Post)
      }
    })

    expect(ran.slug).toBe(1)
    expect(ran.note).toBe(1)

    const shape = await shapeOf(pg, suite.schema, 'mig_c')
    expect(shape.slug).toBe('text NOT NULL')
    expect(shape.note).toBe('text')

    expect(await pg.query('SELECT "title", "slug", "note" FROM {{mig-c}}'))
      .toEqual([{ title: 'existing', slug: 'backfilled', note: 'seen' }])
  })

  it('aborts initialization when a migration throws, and records nothing', async () => {
    await boot({ alias: 'mig-d' })

    await expect(boot({
      alias: 'mig-d',
      declare: resource => { resource.migration('0001-boom', failingBody, MigrationStage.Post) }
    })).rejects.toThrow(MigrationError)

    expect(ran.failing).toBe(1)
    /** The context never came up, so the ledger has to be read outside it. */
    const rows = await raw(async pool => (await pool.query<{ name: string }>(
      `SELECT "name" FROM "${suite.schema}"."_owlmeans_migrations" WHERE "alias" = $1`, ['mig-d']
    )).rows)
    expect(rows).toHaveLength(0)
  })

  it('refuses to start when an applied migration body has been edited', async () => {
    await boot({ alias: 'mig-e' })
    await boot({
      alias: 'mig-e',
      declare: resource => { resource.migration('0001-drift', driftBody, MigrationStage.Post) }
    })

    /** A restarted process with an edited source file — the registry has to be rebuilt. */
    resetDeclarations('mig-e')

    await expect(boot({
      alias: 'mig-e',
      declare: resource => { resource.migration('0001-drift', driftEdited, MigrationStage.Post) }
    })).rejects.toThrow(MigrationConflict)
  })

  it('rejects a changed body under a name already registered in this process', () => {
    resetDeclarations('mig-conflict')
    const resource = makePostgresResource<Note, PostgresResource<Note>>('mig-conflict')
    resource.migration('0001-drift', driftBody)

    expect(() => resource.migration('0001-drift', driftEdited)).toThrow(MigrationConflict)
    /** Identical re-registration is routine — every context switch re-runs the maker. */
    expect(() => resource.migration('0001-drift', driftBody)).not.toThrow()
  })

  /**
   * Registration order matters here where it doesn't for foreign keys: a key is deferred
   * until every resource has initialized, but a migration runs inside its own resource's
   * `init()`, so an alias it names has to have been initialized already.
   */
  it('resolves another resource by alias inside a migration', async () => {
    const pg = await boot({ alias: 'mig-src' }, { alias: 'mig-f' })
    await pg.query('INSERT INTO {{mig-src}} ("title") VALUES ($1)', ['copied'])

    const applied = await boot({ alias: 'mig-src' }, {
      alias: 'mig-f',
      declare: resource => { resource.migration('0001-copy', copyBody, MigrationStage.Post) }
    })

    expect(ran.copy).toBe(1)
    expect(await applied.query('SELECT "title" FROM {{mig-f}}')).toEqual([{ title: 'copied' }])
  })
})
