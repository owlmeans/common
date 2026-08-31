import type { BasicContext } from '@owlmeans/context'
import type { ResourceRecord } from '@owlmeans/resource'

import { PgIndexMethod } from '../consts.js'
import { PostgresPlaceholderError } from '../errors.js'
import type {
  ColumnSpec, DdlPlan, DdlStatement, LiveTable, PgIndexSpec, PostgresResource, TableSpec
} from '../types.js'
import { qualify, quoteIdent } from './name.js'

const literal = (value: string | number | boolean | null): string => {
  if (value === null) return 'NULL'
  if (typeof value === 'number') return `${value}`
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'

  return `'${value.replace(/'/g, "''")}'`
}

const defaultExpression = (column: ColumnSpec): string | undefined => {
  if (column.defaultRaw != null) return column.defaultRaw
  if (column.defaultLiteral !== undefined) return literal(column.defaultLiteral)

  return undefined
}

/**
 * Postgres echoes defaults back with an explicit cast — a declared `'active'` comes back
 * as `'active'::text`. Strip a trailing cast when the literal underneath still matches, so
 * an unchanged default doesn't look like drift on every boot.
 */
const normalizeDefault = (expression: string | null | undefined): string | null => {
  if (expression == null) return null

  return expression.trim().replace(/::[a-z0-9_ ."\[\]]+$/i, '').trim().toLowerCase()
}

const normalizeDefinition = (definition: string): string =>
  definition.replace(/\s+/g, ' ').replace(/ ?, ?/g, ',').trim().toLowerCase()

const columnList = (columns: string[]): string => columns.map(quoteIdent).join(', ')

const indexStatement = (spec: TableSpec, entry: PgIndexSpec): string => {
  const target = entry.expression != null
    ? `(${entry.expression})`
    : `(${columnList(entry.columns as string[])})`
  const where = entry.where != null ? ` WHERE ${entry.where}` : ''

  return `CREATE ${entry.unique === true ? 'UNIQUE ' : ''}INDEX ${quoteIdent(entry.name!)}`
    + ` ON ${spec.qualified} USING ${entry.method ?? PgIndexMethod.BTree} ${target}${where}`
}

const columnDefinition = (column: ColumnSpec): string => {
  const parts = [quoteIdent(column.column), column.sqlType]
  if (column.notNull) parts.push('NOT NULL')
  const expression = defaultExpression(column)
  if (expression != null) parts.push(`DEFAULT ${expression}`)

  return parts.join(' ')
}

/**
 * Foreign keys are planned separately from the rest of the table, and applied only once
 * every resource has initialized: a key points at a table another resource owns, and that
 * resource's own `init()` may not have run yet.
 *
 * @throws {PostgresPlaceholderError} when a target can't be resolved.
 */
export const planForeignKeys = (
  spec: TableSpec, context?: BasicContext<any>
): DdlStatement[] => spec.references.map(reference => {
  const column = reference.property != null ? spec.byProperty[reference.property] : undefined
  if (column == null) {
    throw new PostgresPlaceholderError(`fk-unknown-property:${reference.property}`)
  }

  let targetSchema = reference.schema ?? spec.schema
  let targetTable = reference.table
  if (reference.resource != null) {
    if (context == null) {
      throw new PostgresPlaceholderError(`fk-no-context:${reference.resource}`)
    }
    let target: PostgresResource<ResourceRecord>
    try {
      target = context.resource<PostgresResource<ResourceRecord>>(reference.resource)
    } catch {
      throw new PostgresPlaceholderError(`fk-unknown-resource:${reference.resource}`)
    }
    if (target.table == null) {
      throw new PostgresPlaceholderError(`fk-uninitialized:${reference.resource}`)
    }
    targetSchema = target.table.schema
    targetTable = target.table.table
  }
  if (targetTable == null) {
    throw new PostgresPlaceholderError(`fk-no-target:${reference.property}`)
  }

  const actions = [
    reference.onDelete != null ? ` ON DELETE ${reference.onDelete}` : '',
    reference.onUpdate != null ? ` ON UPDATE ${reference.onUpdate}` : ''
  ].join('')

  return {
    kind: 'add-foreign-key' as const,
    target: reference.name!,
    sql: `ALTER TABLE ${spec.qualified} ADD CONSTRAINT ${quoteIdent(reference.name!)}`
      + ` FOREIGN KEY (${quoteIdent(column.column)})`
      + ` REFERENCES ${qualify(targetSchema, targetTable)} (${quoteIdent(reference.column!)})${actions}`
  }
})

/**
 * Compare the compiled specification against the live table and produce the ordered DDL
 * that converges one onto the other.
 *
 * Statement order is load bearing:
 *  - `DROP COLUMN` is last, because a `USING` cast or a backfill may legitimately read a
 *    column that is about to disappear.
 *  - A primary key constraint is never dropped: it cascades into every referencing key and
 *    can't be undone inside the same transaction once dependents exist.
 *
 * Foreign keys are not part of the plan at all — see {@link planForeignKeys}.
 */
export const planSync = (
  spec: TableSpec, live: LiveTable, additive: boolean = false
): DdlPlan => {
  if (!live.exists) {
    const constraints: string[] = []
    if (spec.primaryKey.length > 0) {
      constraints.push(`CONSTRAINT ${quoteIdent(`${spec.table}_pkey`)} PRIMARY KEY (${columnList(spec.primaryKey)})`)
    }
    for (const unique of spec.uniques) {
      constraints.push(`CONSTRAINT ${quoteIdent(unique.name!)} UNIQUE (${columnList(unique.columns)})`)
    }
    for (const check of spec.checks) {
      constraints.push(`CONSTRAINT ${quoteIdent(check.name!)} CHECK (${check.expression})`)
    }

    const statements: DdlStatement[] = [{
      kind: 'create-table',
      target: spec.table,
      sql: `CREATE TABLE ${spec.qualified} (\n  `
        + [...spec.columns.map(columnDefinition), ...constraints].join(',\n  ')
        + '\n)'
    }]
    for (const entry of spec.indexes) {
      statements.push({ kind: 'create-index', target: entry.name!, sql: indexStatement(spec, entry) })
    }

    return { fresh: true, statements }
  }

  const statements: DdlStatement[] = []
  const byName: Record<string, typeof live.columns[number]> = {}
  for (const column of live.columns) {
    byName[column.name] = column
  }

  const managed = spec.columns.filter(column => column.managed)

  /** 1. Columns the table doesn't have yet — always added nullable so existing rows survive. */
  for (const column of managed) {
    if (byName[column.column] != null) {
      continue
    }
    const expression = defaultExpression(column)
    statements.push({
      kind: 'add-column',
      target: column.column,
      sql: `ALTER TABLE ${spec.qualified} ADD COLUMN ${quoteIdent(column.column)} ${column.sqlType}`
        + (expression != null ? ` DEFAULT ${expression}` : '')
    })
    if (column.notNull) {
      if (expression == null) {
        statements.push({
          kind: 'backfill',
          target: column.column,
          sql: `UPDATE ${spec.qualified} SET ${quoteIdent(column.column)} = ${fallback(column)}`
            + ` WHERE ${quoteIdent(column.column)} IS NULL`
        })
      }
      statements.push({
        kind: 'set-not-null',
        target: column.column,
        sql: `ALTER TABLE ${spec.qualified} ALTER COLUMN ${quoteIdent(column.column)} SET NOT NULL`
      })
    }
  }

  /** 2-4. Type, nullability and default drift on columns that already exist. */
  for (const column of managed) {
    const existing = byName[column.column]
    if (existing == null) {
      continue
    }

    /**
     * A retype drops the column's default first.
     *
     * Postgres refuses `ALTER COLUMN … TYPE` outright when the column carries a DEFAULT it cannot
     * cast to the new type — `42804 default for column "x" cannot be cast automatically` — and it
     * refuses it before looking at a single row, so the `USING` clause never gets a chance to
     * help. The whole plan runs in one transaction, so that refusal aborts the entire
     * reconciliation: the table keeps its old shape and the resource fails every boot with an
     * error about a column it is trying to fix. The standard remedy is to take the default out of
     * the way, retype, and put it back — which is what the default-drift block below does, from
     * the spec rather than from whatever the column happened to be carrying.
     *
     * The `id` column is the one that meets this in practice: it is created with a
     * `gen_random_uuid()::text` default, so any change to its declared type hits this path.
     */
    let defaultDropped = false
    if (!additive && existing.type !== column.sqlType) {
      if (existing.defaultExpr != null) {
        statements.push({
          kind: 'set-default',
          target: column.column,
          sql: `ALTER TABLE ${spec.qualified} ALTER COLUMN ${quoteIdent(column.column)} DROP DEFAULT`
        })
        defaultDropped = true
      }
      const using = column.using ?? `${quoteIdent(column.column)}::${column.sqlType}`
      statements.push({
        kind: 'alter-type',
        target: column.column,
        sql: `ALTER TABLE ${spec.qualified} ALTER COLUMN ${quoteIdent(column.column)}`
          + ` TYPE ${column.sqlType} USING ${using}`
      })
    }

    const expression = defaultExpression(column)
    // Once the retype has dropped it, the default has to be re-stated even when it matches what
    // the column used to carry: the comparison is against the pre-plan introspection, which stops
    // describing the column the moment the plan drops its default.
    const defaultDrifted = defaultDropped
      ? expression != null
      : normalizeDefault(expression) !== normalizeDefault(existing.defaultExpr)
    if (defaultDrifted) {
      statements.push(expression != null
        ? {
          kind: 'set-default',
          target: column.column,
          sql: `ALTER TABLE ${spec.qualified} ALTER COLUMN ${quoteIdent(column.column)}`
            + ` SET DEFAULT ${expression}`
        }
        : {
          kind: 'set-default',
          target: column.column,
          sql: `ALTER TABLE ${spec.qualified} ALTER COLUMN ${quoteIdent(column.column)} DROP DEFAULT`
        })
    }

    if (column.notNull !== existing.notNull) {
      if (column.notNull) {
        statements.push({
          kind: 'backfill',
          target: column.column,
          sql: `UPDATE ${spec.qualified} SET ${quoteIdent(column.column)}`
            + ` = ${expression ?? fallback(column)} WHERE ${quoteIdent(column.column)} IS NULL`
        })
      }
      statements.push({
        kind: column.notNull ? 'set-not-null' : 'drop-not-null',
        target: column.column,
        sql: `ALTER TABLE ${spec.qualified} ALTER COLUMN ${quoteIdent(column.column)}`
          + ` ${column.notNull ? 'SET' : 'DROP'} NOT NULL`
      })
    }
  }

  /** 5. Unique and check constraints. Primary keys are deliberately excluded. */
  const desiredConstraints: Record<string, string> = {}
  for (const unique of spec.uniques) {
    desiredConstraints[unique.name!] = `UNIQUE (${columnList(unique.columns)})`
  }
  for (const check of spec.checks) {
    desiredConstraints[check.name!] = `CHECK ((${check.expression}))`
  }
  const liveConstraints: Record<string, string> = {}
  for (const constraint of live.constraints) {
    if (constraint.type === 'p' || constraint.type === 'f') {
      continue
    }
    liveConstraints[constraint.name] = constraint.definition
  }

  for (const [name, definition] of Object.entries(liveConstraints)) {
    const desired = desiredConstraints[name]
    if (desired != null && normalizeDefinition(desired) === normalizeDefinition(definition)) {
      continue
    }
    if (desired == null && additive) {
      continue
    }
    if (desired == null && !isGenerated(name, spec)) {
      /** A constraint nobody declared was added by hand — leave it alone. */
      continue
    }
    statements.push({
      kind: 'drop-constraint',
      target: name,
      sql: `ALTER TABLE ${spec.qualified} DROP CONSTRAINT ${quoteIdent(name)}`
    })
  }
  for (const [name, definition] of Object.entries(desiredConstraints)) {
    const existing = liveConstraints[name]
    if (existing != null && normalizeDefinition(existing) === normalizeDefinition(definition)) {
      continue
    }
    if (existing != null && additive) {
      continue
    }
    statements.push({
      kind: 'add-constraint',
      target: name,
      sql: `ALTER TABLE ${spec.qualified} ADD CONSTRAINT ${quoteIdent(name)} ${definition}`
    })
  }

  /** 6. Indexes. Constraint backed indexes are owned by their constraint, not by us. */
  const constraintBacked = live.constraints.map(constraint => constraint.name)
  const desiredIndexes: Record<string, string> = {}
  for (const entry of spec.indexes) {
    desiredIndexes[entry.name!] = indexStatement(spec, entry)
  }
  for (const existing of live.indexes) {
    if (constraintBacked.includes(existing.name)) {
      continue
    }
    const desired = desiredIndexes[existing.name]
    if (desired != null && normalizeDefinition(desired) === normalizeDefinition(existing.definition)) {
      continue
    }
    if (desired == null && (additive || !isGenerated(existing.name, spec))) {
      continue
    }
    statements.push({
      kind: 'drop-index',
      target: existing.name,
      sql: `DROP INDEX ${qualify(spec.schema, existing.name)}`
    })
  }
  for (const [name, statement] of Object.entries(desiredIndexes)) {
    const existing = live.indexes.find(entry => entry.name === name)
    if (existing != null && normalizeDefinition(existing.definition) === normalizeDefinition(statement)) {
      continue
    }
    if (constraintBacked.includes(name)) {
      continue
    }
    statements.push({ kind: 'create-index', target: name, sql: statement })
  }

  /** 7. Drops, last and only in full mode. */
  if (!additive) {
    const keep = [...managed.map(column => column.column), ...spec.unmanaged]
    for (const existing of live.columns) {
      if (keep.includes(existing.name) || existing.generated !== '') {
        continue
      }
      statements.push({
        kind: 'drop-column',
        target: existing.name,
        destructive: true,
        sql: `ALTER TABLE ${spec.qualified} DROP COLUMN ${quoteIdent(existing.name)}`
      })
    }
  }

  return { fresh: false, statements }
}

/** A name this package would have generated is a name this package may drop. */
const isGenerated = (name: string, spec: TableSpec): boolean =>
  name.startsWith(`${spec.table}_`)

/** Value used to fill an existing row before a column becomes `NOT NULL`. */
const fallback = (column: ColumnSpec): string => {
  if (column.array) return `'{}'::${column.sqlType}`
  if (column.jsonb) return `'{}'::jsonb`
  switch (column.jsonType) {
    case 'number':
    case 'integer':
    case 'bigint':
      return '0'
    case 'boolean':
      return 'FALSE'
    case 'date':
      return 'now()'
    default:
      return `''::${column.sqlType}`
  }
}
