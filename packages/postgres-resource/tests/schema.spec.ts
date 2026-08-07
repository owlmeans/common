import { describe, expect, test } from 'bun:test'
import { UnsupportedArgumentError } from '@owlmeans/resource'
import type { AnySchema } from 'ajv'

import { schemaToTableSpec, toFormatType } from '@owlmeans/postgres-resource'
import type { TableSpec } from '@owlmeans/postgres-resource'

/**
 * Compiling an AJV schema into a table specification is the one step every other part of
 * the package trusts: DDL emission, drift detection, marshalling and placeholder
 * resolution all read the result rather than the schema. It needs no database, so it is
 * covered here rather than behind the integration gate.
 */
const compile = (schema: AnySchema, table: string = 'things'): TableSpec =>
  schemaToTableSpec('things', schema, 'app', table, true)

describe('@owlmeans/postgres-resource — schemaToTableSpec', () => {
  test('normalizes type spellings to what format_type() reports', () => {
    expect(toFormatType('varchar(320)')).toBe('character varying(320)')
    expect(toFormatType('int4')).toBe('integer')
    expect(toFormatType('int8')).toBe('bigint')
    expect(toFormatType('timestamptz')).toBe('timestamp with time zone')
    expect(toFormatType('float8')).toBe('double precision')
    expect(toFormatType('NUMERIC( 12 , 2 )')).toBe('numeric(12,2)')
    expect(toFormatType('text[]')).toBe('text[]')
  })

  test('synthesizes the id primary key when the schema does not declare one', () => {
    const spec = compile({ type: 'object', properties: { name: { type: 'string' } } } as AnySchema)

    expect(spec.primaryKey).toEqual(['id'])
    const id = spec.byProperty.id
    expect(id.sqlType).toBe('text')
    expect(id.notNull).toBe(true)
    expect(id.defaultRaw).toBe('gen_random_uuid()::text')
    /** First, so `SELECT *` and every diff read it where a hand written table would put it. */
    expect(spec.columns[0].property).toBe('id')
  })

  test('promotes a declared uuid id to the primary key with a server side default', () => {
    const spec = compile({
      type: 'object',
      properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } },
      required: ['id', 'name']
    } as AnySchema)

    expect(spec.primaryKey).toEqual(['id'])
    expect(spec.byProperty.id.sqlType).toBe('uuid')
    expect(spec.byProperty.id.defaultRaw).toBe('gen_random_uuid()')
    expect(spec.qualified).toBe('"app"."things"')
  })

  test('maps JSON types onto Postgres types', () => {
    const spec = compile({
      type: 'object',
      properties: {
        plain: { type: 'string' },
        bounded: { type: 'string', maxLength: 64 },
        uuid: { type: 'string', format: 'uuid' },
        stamp: { type: 'string', format: 'date-time' },
        day: { type: 'string', format: 'date' },
        blob: { type: 'string', format: 'binary' },
        small: { type: 'integer' },
        big: { type: 'integer', maximum: 9007199254740991 },
        real: { type: 'number' },
        money: { type: 'number', pg: { precision: 12, scale: 2 } },
        flag: { type: 'boolean' },
        payload: { type: 'object' },
        /** The framework's date convention — an `object` carrying `format: 'date-time'`. */
        createdAt: { type: 'object', format: 'date-time' },
        labels: { type: 'array', items: { type: 'string' } },
        rows: { type: 'array', items: { type: 'object' } }
      }
    } as AnySchema)

    const types = Object.fromEntries(spec.columns.map(column => [column.property, column.sqlType]))
    expect(types).toMatchObject({
      plain: 'text',
      bounded: 'character varying(64)',
      uuid: 'uuid',
      stamp: 'timestamp with time zone',
      day: 'date',
      blob: 'bytea',
      small: 'integer',
      big: 'bigint',
      real: 'double precision',
      money: 'numeric(12,2)',
      flag: 'boolean',
      payload: 'jsonb',
      createdAt: 'timestamp with time zone',
      labels: 'text[]',
      rows: 'jsonb'
    })
    expect(spec.byProperty.labels.array).toBe(true)
    expect(spec.byProperty.rows.array).toBe(false)
    expect(spec.byProperty.payload.jsonb).toBe(true)
    expect(spec.byProperty.createdAt.jsonType).toBe('date')
  })

  /**
   * Mongo's mapper lost nullability twice, both times on a branch that recomputed it
   * instead of receiving it — `date-time` and optional objects. Those two shapes are
   * asserted explicitly, not just the general rule.
   */
  test('threads nullability through every branch', () => {
    const spec = compile({
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        needed: { type: 'string' },
        optional: { type: 'string' },
        nullableStamp: { type: 'object', format: 'date-time', nullable: true },
        requiredStamp: { type: 'object', format: 'date-time' },
        optionalObject: { type: 'object' },
        unionNull: { type: ['string', 'null'] },
        forcedNull: { type: 'string', pg: { nullable: true } },
        forcedNotNull: { type: 'string', pg: { nullable: false } }
      },
      required: ['id', 'needed', 'requiredStamp', 'unionNull', 'forcedNull', 'forcedNotNull']
    } as AnySchema)

    const notNull = Object.fromEntries(spec.columns.map(column => [column.property, column.notNull]))
    expect(notNull).toMatchObject({
      id: true,
      needed: true,
      optional: false,
      nullableStamp: false,
      requiredStamp: true,
      optionalObject: false,
      unionNull: false,
      forcedNull: false,
      forcedNotNull: true
    })
  })

  test('applies the pg override vocabulary', () => {
    const spec = compile({
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string', pg: { type: 'varchar', length: 320, unique: true } },
        ownerId: {
          type: 'string',
          format: 'uuid',
          pg: { references: { resource: 'users', onDelete: 'cascade' }, index: true }
        },
        renamed: { type: 'string', pg: { column: 'renamed_to' } },
        touched: { type: 'object', format: 'date-time', pg: { defaultRaw: 'now()' } },
        legacy: { type: 'string', pg: { managed: false } },
        score: { type: 'integer', pg: { check: '{{col}} >= 0' } }
      },
      required: ['id', 'email'],
      pg: { indexes: [{ name: 'idx_things_email_owner', columns: ['email', 'ownerId'] }] }
    } as AnySchema)

    expect(spec.byProperty.email.sqlType).toBe('character varying(320)')
    expect(spec.uniques).toEqual([{ columns: ['email'], name: 'things_email_key' }])

    expect(spec.references).toHaveLength(1)
    expect(spec.references[0]).toMatchObject({
      property: 'ownerId', resource: 'users', column: 'id', onDelete: 'cascade',
      name: 'things_ownerId_fkey'
    })

    /** No implicit snake_casing anywhere — only an explicit `column` renames. */
    expect(spec.byProperty.renamed.column).toBe('renamed_to')
    expect(spec.byColumn.renamed_to.property).toBe('renamed')
    expect(spec.byProperty.touched.defaultRaw).toBe('now()')

    expect(spec.unmanaged).toContain('legacy')
    expect(spec.checks.map(check => check.expression)).toContain('"score" >= 0')

    const names = spec.indexes.map(index => index.name)
    expect(names).toContain('idx_things_email_owner')
    expect(names).toContain('things_ownerId_idx')
    /** Index specs address properties; the compiled spec addresses physical columns. */
    expect(spec.indexes.find(index => index.name === 'idx_things_email_owner')?.columns)
      .toEqual(['email', 'ownerId'])
  })

  test('turns a string enum into a CHECK that tolerates NULL when the column does', () => {
    const spec = compile({
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        status: { type: 'string', enum: ['active', 'banned'] },
        mood: { type: 'string', enum: ['ok'], nullable: true }
      },
      required: ['id', 'status']
    } as AnySchema)

    const expressions = spec.checks.map(check => check.expression)
    expect(expressions).toContain(`"status" IN ('active', 'banned')`)
    expect(expressions).toContain(`"mood" IS NULL OR "mood" IN ('ok')`)
  })

  test('flattens allOf composition the way the framework schemas are written', () => {
    const spec = compile({
      type: 'object',
      allOf: [
        { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
        { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }
      ],
      properties: { extra: { type: 'boolean' } }
    } as AnySchema)

    expect(Object.keys(spec.byProperty).sort()).toEqual(['extra', 'id', 'name'])
    expect(spec.byProperty.name.notNull).toBe(true)
    expect(spec.byProperty.extra.notNull).toBe(false)
  })

  test('honors a composite primary key declared at the root', () => {
    const spec = compile({
      type: 'object',
      properties: {
        tenant: { type: 'string' },
        key: { type: 'string' },
        value: { type: 'string' }
      },
      pg: { primaryKey: ['tenant', 'key'] }
    } as AnySchema)

    expect(spec.primaryKey).toEqual(['tenant', 'key'])
    expect(spec.byProperty.tenant.notNull).toBe(true)
    expect(spec.byProperty.key.notNull).toBe(true)
    /** No id is synthesized once the schema says what identity means. */
    expect(spec.byProperty.id).toBeUndefined()
  })

  test('stores a secure field as unbounded text and refuses to make it unique', () => {
    const spec = compile({
      type: 'object',
      properties: { token: { type: 'string', maxLength: 32, secure: true } }
    } as AnySchema)

    expect(spec.byProperty.token.sqlType).toBe('text')
    expect(spec.byProperty.token.secure).toBe(true)

    expect(() => compile({
      type: 'object',
      properties: { token: { type: 'string', secure: true, pg: { unique: true } } }
    } as AnySchema)).toThrow(UnsupportedArgumentError)
  })

  test('rejects an index or key naming a property that does not exist', () => {
    expect(() => compile({
      type: 'object',
      properties: { name: { type: 'string' } },
      pg: { indexes: [{ columns: ['nope'] }] }
    } as AnySchema)).toThrow(UnsupportedArgumentError)

    expect(() => compile({
      type: 'object',
      properties: { name: { type: 'string' } },
      pg: { primaryKey: ['nope'] }
    } as AnySchema)).toThrow(UnsupportedArgumentError)
  })
})
