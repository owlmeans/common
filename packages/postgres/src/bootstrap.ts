import {
  assertSqlIdentifier, PostgresBootstrapError, quoteIdent, quoteLiteral
} from '@owlmeans/postgres-resource'
import { Pool } from 'pg'
import type { PoolClient } from 'pg'

import type { BootstrapOptions, BootstrapReport, PostgresService } from './types.js'
import { prepareConfig } from './utils/config.js'

const exists = async (client: PoolClient, text: string, value: string): Promise<boolean> => {
  const result = await client.query(text, [value])

  return result.rowCount != null && result.rowCount > 0
}

/**
 * Provision a least privileged role, its database and its schema.
 *
 * This is the one copy of a script every OwlMeans deployment used to carry inline. It runs
 * on every start and every rebuild, so each step probes before it acts — "already exists"
 * is the expected outcome, not an error.
 *
 * Two connections are unavoidable. `CREATE DATABASE` cannot run from inside the database
 * it creates, so roles and databases are made over the maintenance connection the admin
 * config points at, and the grants are applied over a short lived connection to the target.
 *
 * @throws {PostgresBootstrapError}
 */
export const bootstrapDb = async (
  service: PostgresService, configAlias: string, opts: BootstrapOptions
): Promise<BootstrapReport> => {
  const role = assertSqlIdentifier(opts.role, 'role')
  const database = assertSqlIdentifier(opts.database ?? opts.role, 'database')
  const schema = opts.schema != null ? assertSqlIdentifier(opts.schema, 'schema') : null
  const leastPrivilege = opts.leastPrivilege ?? true
  const rotate = opts.rotatePassword ?? true

  if (opts.password === '') {
    throw new PostgresBootstrapError(`empty-password:${role}`)
  }

  const report: BootstrapReport = {
    roleCreated: false,
    passwordRotated: false,
    databaseCreated: false,
    schemaCreated: false,
    grantsApplied: false
  }

  const config = service.config(configAlias)
  const admin = await service.client(configAlias)

  /**
   * The password is the only value here that can't be bound: `CREATE ROLE` takes no
   * parameters, so it reaches the server inside the statement text. Identifiers have
   * already been asserted safe; the literal is escaped.
   */
  const secret = quoteLiteral(opts.password)

  const client = await admin.connect()
  try {
    if (await exists(client, 'SELECT 1 FROM pg_roles WHERE rolname = $1', role)) {
      if (rotate) {
        await client.query(`ALTER ROLE ${quoteIdent(role)} WITH LOGIN PASSWORD ${secret}`)
        report.passwordRotated = true
      }
    } else {
      await client.query(`CREATE ROLE ${quoteIdent(role)} WITH LOGIN PASSWORD ${secret}`)
      report.roleCreated = true
    }

    if (!await exists(client, 'SELECT 1 FROM pg_database WHERE datname = $1', database)) {
      /** Never inside a transaction — Postgres refuses `CREATE DATABASE` in one. */
      await client.query(`CREATE DATABASE ${quoteIdent(database)} OWNER ${quoteIdent(role)}`)
      report.databaseCreated = true
    }
  } catch (error) {
    throw wrap(error, `${role}@${database}`)
  } finally {
    client.release()
  }

  const target = new Pool(prepareConfig(config, { database, max: 1 }))
  try {
    if (schema != null) {
      /**
       * The resource layer creates its own schema too, but only once an application with
       * resources boots. Creating it here — owned by the role — is what lets that
       * application connect as a role with no `CREATE` right on the database at all.
       */
      await target.query(
        `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)} AUTHORIZATION ${quoteIdent(role)}`
      )
      await target.query(`GRANT ALL ON SCHEMA ${quoteIdent(schema)} TO ${quoteIdent(role)}`)
      await target.query(`ALTER ROLE ${quoteIdent(role)} SET search_path = ${quoteIdent(schema)}`)
      report.schemaCreated = true
    }

    if (leastPrivilege) {
      await target.query(`REVOKE CONNECT ON DATABASE ${quoteIdent(database)} FROM PUBLIC`)
      await target.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
      await target.query(`GRANT CONNECT ON DATABASE ${quoteIdent(database)} TO ${quoteIdent(role)}`)
      report.grantsApplied = true
    }
  } catch (error) {
    throw wrap(error, `${role}@${database}`)
  } finally {
    await target.end().catch(() => undefined)
  }

  console.log(
    `@owlmeans/postgres: bootstrap ${role}@${database} —`
    + ` role ${report.roleCreated ? 'created' : report.passwordRotated ? 'rotated' : 'present'},`
    + ` database ${report.databaseCreated ? 'created' : 'present'}`
    + (schema != null ? `, schema ${schema} ready` : '')
  )

  return report
}

const wrap = (error: unknown, subject: string): Error => {
  const failure = new PostgresBootstrapError(`${subject}:${(error as Error)?.message ?? error}`)
  failure.cause = error

  return failure
}
