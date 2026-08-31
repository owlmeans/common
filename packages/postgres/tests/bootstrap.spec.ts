import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { PostgresBootstrapError } from '@owlmeans/postgres-resource'
import { randomNamespace } from '@owlmeans/test-integration'
import { Pool } from 'pg'

import { DEF_ADMIN_ALIAS } from '@owlmeans/postgres'
import { capabilities, gate, makeSuite, raw } from './context.js'
import type { PostgresService } from './context.js'

const suite = makeSuite('bootstrap')
const closed = gate.skip || !capabilities.bootstrap
const it = closed ? test.skip : test

const role = randomNamespace('omt_role')
const database = randomNamespace('omt_db')
/** Never printed, never persisted — generated per run and dropped with the role. */
const password = randomNamespace('pw', 24)
const schema = 'app'

/** The gate's URL is the only statement of where Postgres is; nothing here assumes 5432. */
const target = (): { host: string, port: number } => {
  const parsed = new URL(gate.env.POSTGRES_URL ?? 'postgres://127.0.0.1:5432/postgres')

  return {
    host: decodeURIComponent(parsed.hostname).replace(/^\[|\]$/g, ''),
    port: parsed.port !== '' ? parseInt(parsed.port, 10) : 5432
  }
}

describe('@owlmeans/postgres — admin bootstrap path', () => {
  if (closed) {
    test.skip(
      gate.skip
        ? gate.reason ?? 'postgres gate closed'
        : 'connection role has neither CREATEROLE+CREATEDB nor superuser',
      () => {}
    )

    return
  }

  let pg: PostgresService

  beforeAll(async () => {
    pg = (await suite.boot({ admin: true })).pg
  })

  afterAll(async () => {
    /** The admin alias connects lazily, so its pool only exists once bootstrap has run. */
    suite.collect(pg)
    await suite.teardown()

    /**
     * A database and a role outlive the schema the suite owns, so they are dropped here
     * rather than by the shared teardown — and the role only after everything it owns is
     * gone, which is what `DROP OWNED BY` guarantees.
     */
    await raw(async pool => {
      await pool.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
      await pool.query(`DROP OWNED BY "${role}"`).catch(() => undefined)
      await pool.query(`DROP ROLE IF EXISTS "${role}"`)
    }).catch(error => console.error(`postgres bootstrap teardown (${role}@${database}):`, error))
  })

  it('creates the role, its database and its schema', async () => {
    const report = await pg.bootstrap(DEF_ADMIN_ALIAS, { role, password, database, schema })

    expect(report).toEqual({
      roleCreated: true,
      passwordRotated: false,
      databaseCreated: true,
      schemaCreated: true,
      grantsApplied: true
    })
  })

  it('lets the new role connect and own its schema', async () => {
    const pool = new Pool({ ...target(), user: role, password, database, max: 1 })
    try {
      /** `ALTER ROLE ... SET search_path` is what puts the role in its own schema on login. */
      const { rows } = await pool.query<{ schema: string, owner: string, pub: boolean }>(
        `SELECT current_schema() AS schema, pg_get_userbyid(nspowner) AS owner,
                has_schema_privilege('public', 'public', 'CREATE') AS pub
           FROM pg_namespace WHERE nspname = $1`, [schema]
      )
      expect(rows[0].schema).toBe(schema)
      expect(rows[0].owner).toBe(role)
      /** `REVOKE CREATE ON SCHEMA public FROM PUBLIC` — nothing lands in `public` by accident. */
      expect(rows[0].pub).toBe(false)

      /** An unqualified table goes to the role's own schema, which it owns outright. */
      await pool.query('CREATE TABLE probe (id text)')
      const [{ nspname }] = (await pool.query<{ nspname: string }>(
        `SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'probe'`
      )).rows
      expect(nspname).toBe(schema)
      await pool.query('DROP TABLE probe')
    } finally {
      await pool.end().catch(() => undefined)
    }
  })

  it('revokes PUBLIC and grants the role instead', async () => {
    const [row] = await raw(async pool => (await pool.query<{ pub: boolean, own: boolean }>(
      `SELECT has_database_privilege('public', $1, 'CONNECT') AS pub,
              has_database_privilege($2, $1, 'CONNECT') AS own`, [database, role]
    )).rows)

    expect(row.pub).toBe(false)
    expect(row.own).toBe(true)
  })

  it('is idempotent — a second run rotates the password and creates nothing', async () => {
    const report = await pg.bootstrap(DEF_ADMIN_ALIAS, { role, password, database, schema })

    expect(report.roleCreated).toBe(false)
    expect(report.databaseCreated).toBe(false)
    expect(report.passwordRotated).toBe(true)
    /** `CREATE SCHEMA IF NOT EXISTS` is a no-op, but the grants are re-asserted every time. */
    expect(report.schemaCreated).toBe(true)
    expect(report.grantsApplied).toBe(true)
  })

  it('leaves an existing password alone when asked to', async () => {
    const report = await pg.bootstrap(
      DEF_ADMIN_ALIAS, { role, password, database, schema, rotatePassword: false }
    )

    expect(report.passwordRotated).toBe(false)
    expect(report.roleCreated).toBe(false)
  })

  it('refuses an identifier it cannot prove safe, before it connects to anything', async () => {
    await expect(pg.bootstrap(DEF_ADMIN_ALIAS, { role: 'role"; DROP DATABASE x; --', password }))
      .rejects.toThrow(SyntaxError)
    await expect(pg.bootstrap(DEF_ADMIN_ALIAS, { role, password, database: 'has space' }))
      .rejects.toThrow(SyntaxError)
    await expect(pg.bootstrap(DEF_ADMIN_ALIAS, { role, password: '' }))
      .rejects.toThrow(PostgresBootstrapError)
  })
})
