import { UnsupportedArgumentError } from '@owlmeans/resource'
import type { AnySchema } from 'ajv'

import {
  DEF_ID_DEFAULT, DEF_JSON_TYPE, DEF_SQL_TYPE, ID_FIELD, PG_KEYWORD, PgIndexMethod
} from '../consts.js'
import type {
  ColumnJsonType, ColumnSpec, PgCheckSpec, PgIndexSpec, PgPropertyOverride, PgRootOverride,
  PgReferenceSpec, PgUniqueSpec, TableSpec
} from '../types.js'
import { pgIdentifier, qualify, quoteIdent } from './name.js'

interface RawProperty {
  type?: string | string[]
  format?: string
  enum?: unknown[]
  items?: RawProperty
  maxLength?: number
  maximum?: number
  minimum?: number
  default?: unknown
  nullable?: boolean
  secure?: boolean
  [PG_KEYWORD]?: PgPropertyOverride
}

interface RawSchema {
  properties?: Record<string, RawProperty>
  required?: string[]
  allOf?: RawSchema[]
  [PG_KEYWORD]?: PgRootOverride
}

const INT32_MAX = 2147483647

/**
 * Normalize a Postgres type name to the spelling `format_type()` reports, so the drift
 * comparison against a live table is an exact string match instead of a fuzzy one.
 */
export const toFormatType = (type: string): string => {
  const trimmed = type.trim().toLowerCase()
  const match = /^([a-z0-9_ ]+?)\s*(\(([^)]*)\))?\s*(\[\])?$/.exec(trimmed)
  if (match == null) {
    return trimmed
  }
  const [, base, , args, array] = match
  const aliases: Record<string, string> = {
    int: 'integer', int4: 'integer', int2: 'smallint', int8: 'bigint', serial: 'integer',
    bool: 'boolean', float4: 'real', float8: 'double precision', decimal: 'numeric',
    varchar: 'character varying', char: 'character', bpchar: 'character',
    timestamptz: 'timestamp with time zone', timetz: 'time with time zone',
    timestamp: 'timestamp without time zone', time: 'time without time zone'
  }
  const resolved = aliases[base.trim()] ?? base.trim()
  /** Postgres prints multi-argument typmods without spaces: `numeric(12,2)`. */
  const suffix = args != null ? `(${args.split(',').map(part => part.trim()).join(',')})` : ''

  return `${resolved}${suffix}${array ?? ''}`
}

const readOverride = (property: RawProperty): PgPropertyOverride => property[PG_KEYWORD] ?? {}

/**
 * Nullability is decided in exactly one place and threaded down from there. Mongo's mapper
 * recomputes it per branch and lost it twice — on `date-time` and on optional objects.
 */
const isNullable = (property: RawProperty, isRequired: boolean): boolean => {
  const override = readOverride(property)
  if (override.nullable != null) {
    return override.nullable
  }
  if (property.nullable === true) {
    return true
  }
  if (Array.isArray(property.type) && property.type.includes('null')) {
    return true
  }

  return !isRequired
}

const baseType = (property: RawProperty): string | undefined =>
  Array.isArray(property.type) ? property.type.find(type => type !== 'null') : property.type

const scalarSqlType = (property: RawProperty): { sqlType: string, jsonType: ColumnJsonType } => {
  const override = readOverride(property)
  const type = baseType(property)

  switch (type) {
    case 'string':
      switch (property.format) {
        case 'date-time': return { sqlType: 'timestamp with time zone', jsonType: 'date' }
        case 'date': return { sqlType: 'date', jsonType: 'date' }
        case 'time': return { sqlType: 'time without time zone', jsonType: 'string' }
        case 'uuid': return { sqlType: 'uuid', jsonType: 'string' }
        case 'binary': return { sqlType: 'bytea', jsonType: 'binary' }
        default: break
      }
      return property.maxLength != null
        ? { sqlType: `character varying(${property.maxLength})`, jsonType: 'string' }
        : { sqlType: DEF_SQL_TYPE, jsonType: 'string' }
    case 'integer':
      return property.maximum != null && property.maximum > INT32_MAX
        ? { sqlType: 'bigint', jsonType: 'bigint' }
        : { sqlType: 'integer', jsonType: 'integer' }
    case 'number':
      return override.precision != null
        ? { sqlType: `numeric(${override.precision},${override.scale ?? 0})`, jsonType: 'number' }
        : { sqlType: 'double precision', jsonType: 'number' }
    case 'boolean':
      return { sqlType: 'boolean', jsonType: 'boolean' }
    case 'object':
      /**
       * The framework's date convention — `{ type: 'object', format: 'date-time' }`. Mongo's
       * mapper broke twice on exactly this branch by dropping nullability, so nullability is
       * decided by the caller, never here.
       */
      return property.format === 'date-time'
        ? { sqlType: 'timestamp with time zone', jsonType: 'date' }
        : { sqlType: DEF_JSON_TYPE, jsonType: 'object' }
    default:
      return { sqlType: DEF_JSON_TYPE, jsonType: 'unknown' }
  }
}

const arraySqlType = (property: RawProperty): { sqlType: string, jsonType: ColumnJsonType, array: boolean } => {
  const items = property.items
  const itemType = items != null ? baseType(items) : undefined
  /** Only scalar element types become Postgres arrays; anything else stays jsonb. */
  if (items != null && itemType != null && ['string', 'integer', 'number', 'boolean'].includes(itemType)
    && items.format == null && items.enum == null) {
    const scalar = scalarSqlType(items)
    return { sqlType: `${scalar.sqlType}[]`, jsonType: 'array', array: true }
  }

  return { sqlType: DEF_JSON_TYPE, jsonType: 'array', array: false }
}

const compileColumn = (
  name: string, property: RawProperty, required: string[]
): ColumnSpec => {
  const override = readOverride(property)
  const secure = property.secure === true
  const type = baseType(property)
  const nullable = isNullable(property, required.includes(name))

  let sqlType: string
  let jsonType: ColumnJsonType
  let array = false

  if (override.type != null) {
    sqlType = override.type
    jsonType = secure ? 'string' : scalarSqlType(property).jsonType
    array = override.array === true || override.type.endsWith('[]')
  } else if (secure) {
    /**
     * A secure field is stored as ciphertext, so its declared JSON type says nothing about
     * its column. It's always unbounded text: `maxLength` would truncate the ciphertext,
     * an enum CHECK would never match it, and jsonb would fail to parse it.
     */
    sqlType = DEF_SQL_TYPE
    jsonType = 'string'
  } else if (type === 'array') {
    const resolved = arraySqlType(property)
    sqlType = resolved.sqlType
    jsonType = resolved.jsonType
    array = resolved.array
  } else {
    const resolved = scalarSqlType(property)
    sqlType = resolved.sqlType
    jsonType = resolved.jsonType
  }

  if (override.length != null) {
    sqlType = `character varying(${override.length})`
  }
  if (override.array === true && !array && !sqlType.endsWith('[]')) {
    sqlType = `${sqlType}[]`
    array = true
  }
  if (override.jsonb === true) {
    sqlType = DEF_JSON_TYPE
    jsonType = jsonType === 'array' ? 'array' : 'object'
    array = false
  }

  const formatted = toFormatType(sqlType)
  const isJsonb = formatted === 'jsonb' || formatted === 'json'

  const column: ColumnSpec = {
    property: name,
    /** No implicit snake_casing — a silent rename is a silent DROP plus ADD. */
    column: pgIdentifier(override.column ?? name),
    sqlType: formatted,
    jsonType,
    notNull: override.nullable === false ? true : !nullable,
    primaryKey: override.primaryKey === true,
    secure,
    jsonb: isJsonb,
    array,
    managed: override.managed !== false,
    ...(override.using != null ? { using: override.using } : {}),
    ...(override.comment != null ? { comment: override.comment } : {})
  }

  if (override.defaultRaw != null) {
    column.defaultRaw = override.defaultRaw
  } else if (override.default !== undefined) {
    column.defaultLiteral = override.default
  } else if (property.default !== undefined && !isJsonb && !array) {
    /** Non-scalar defaults stay in `getDefaults()` only — they'd need casting in DDL. */
    column.defaultLiteral = property.default as string | number | boolean | null
  }

  return column
}

const collectProperties = (schema: RawSchema): { properties: Record<string, RawProperty>, required: string[] } => {
  const properties: Record<string, RawProperty> = { ...schema.properties }
  const required: string[] = [...(schema.required ?? [])]
  /** `allOf` composition is used across the framework's schemas — flatten it like mongo does. */
  for (const part of schema.allOf ?? []) {
    const nested = collectProperties(part)
    Object.assign(properties, nested.properties)
    required.push(...nested.required)
  }

  return { properties, required }
}

/**
 * Compile a resource's AJV schema into the table specification that drives both DDL
 * emission and drift detection.
 *
 * `extraIndexes` carries what `resource.index()` declared. It's compiled here rather than
 * merged afterwards so chained declarations get the same property-to-column mapping and
 * the same generated names as schema-borne ones.
 *
 * @throws {UnsupportedArgumentError} when an override asks for something unrepresentable.
 */
export const schemaToTableSpec = (
  alias: string, schema: AnySchema | undefined, pgSchema: string, table: string,
  autoSync: boolean, extraIndexes: PgIndexSpec[] = []
): TableSpec => {
  const raw = (schema ?? {}) as RawSchema
  const root = raw[PG_KEYWORD] ?? {}
  const { properties, required } = collectProperties(raw)

  const columns: ColumnSpec[] = []
  const uniques: PgUniqueSpec[] = [...(root.unique ?? [])]
  const checks: PgCheckSpec[] = [...(root.checks ?? [])]
  const indexes: PgIndexSpec[] = [...(root.indexes ?? []), ...extraIndexes]
  const references: PgReferenceSpec[] = []

  const resolvedTable = pgIdentifier(root.table ?? table)
  const resolvedSchema = pgIdentifier(root.schema ?? pgSchema)

  for (const [name, property] of Object.entries(properties)) {
    const column = compileColumn(name, property, required)
    columns.push(column)

    const override = readOverride(property)

    if (override.unique != null && override.unique !== false) {
      if (column.secure) {
        /**
         * Encryption uses a managed nonce, so two identical plaintexts encrypt to different
         * ciphertexts — a unique constraint on the column would never collide, silently.
         */
        throw new UnsupportedArgumentError(`secure-unique:${name}`)
      }
      uniques.push({
        columns: [name],
        ...(typeof override.unique === 'string' ? { name: override.unique } : {})
      })
    }

    if (override.index != null && override.index !== false) {
      if (column.secure) {
        console.warn(
          `@owlmeans/postgres-resource: index on secure column "${alias}.${name}" — encryption`
          + ' is non-deterministic, so equality lookups through it will never match.'
        )
      }
      const specs = override.index === true
        ? [{ columns: [name] }]
        : Array.isArray(override.index) ? override.index : [override.index]
      indexes.push(...specs.map(spec => ({ ...spec, columns: spec.columns ?? [name] })))
    }

    if (override.references != null) {
      references.push({
        ...override.references,
        property: name,
        column: override.references.column ?? ID_FIELD,
        name: pgIdentifier(override.references.name ?? `${resolvedTable}_${column.column}_fkey`)
      })
    }

    if (override.check != null) {
      checks.push({
        name: `${resolvedTable}_${column.column}_check`,
        expression: override.check.replace(/\{\{col\}\}/g, quoteIdent(column.column))
      })
    }

    /** A string enum becomes a CHECK — a native PG enum can't drop values and can't be altered in a transaction. */
    if (property.enum != null && !column.secure && override.type == null
      && baseType(property) === 'string' && property.enum.every(value => typeof value === 'string')) {
      const values = (property.enum as string[]).map(value => `'${value.replace(/'/g, "''")}'`).join(', ')
      const predicate = column.notNull
        ? `${quoteIdent(column.column)} IN (${values})`
        : `${quoteIdent(column.column)} IS NULL OR ${quoteIdent(column.column)} IN (${values})`
      checks.push({ name: `${resolvedTable}_${column.column}_enum`, expression: predicate })
    }
  }

  const byProperty: Record<string, ColumnSpec> = {}
  const byColumn: Record<string, ColumnSpec> = {}
  for (const column of columns) {
    byProperty[column.property] = column
    byColumn[column.column] = column
  }

  let primaryKey: string[] = []
  if (root.primaryKey != null && root.primaryKey.length > 0) {
    primaryKey = root.primaryKey.map(property => {
      const column = byProperty[property]
      if (column == null) {
        throw new UnsupportedArgumentError(`primary-key:${property}`)
      }
      column.notNull = true

      return column.column
    })
  } else {
    const explicit = columns.filter(column => column.primaryKey)
    if (explicit.length > 0) {
      primaryKey = explicit.map(column => {
        column.notNull = true
        return column.column
      })
    } else {
      /**
       * Every OwlMeans record is addressed by `id`, so the column is synthesized when the
       * schema doesn't declare it — `create()` and `load()` both assume it exists.
       */
      let id = byProperty[ID_FIELD]
      if (id == null) {
        id = {
          property: ID_FIELD, column: ID_FIELD, sqlType: DEF_SQL_TYPE, jsonType: 'string',
          notNull: true, primaryKey: true, secure: false, jsonb: false, array: false,
          managed: true, defaultRaw: DEF_ID_DEFAULT
        }
        columns.unshift(id)
        byProperty[ID_FIELD] = id
        byColumn[ID_FIELD] = id
      } else {
        id.notNull = true
        id.primaryKey = true
        if (id.defaultRaw == null && id.defaultLiteral === undefined) {
          id.defaultRaw = id.sqlType === 'uuid' ? 'gen_random_uuid()' : DEF_ID_DEFAULT
        }
      }
      primaryKey = [id.column]
    }
  }

  /** Index and unique specs address properties; map them onto physical columns once, here. */
  const mapColumns = (names: string[]): string[] => names.map(name => {
    const column = byProperty[name]
    if (column == null) {
      throw new UnsupportedArgumentError(`unknown-property:${name}`)
    }

    return column.column
  })

  const resolvedIndexes: PgIndexSpec[] = indexes.map(spec => {
    const list = spec.columns == null
      ? []
      : mapColumns(Array.isArray(spec.columns) ? spec.columns : [spec.columns])
    const suffix = spec.unique === true ? 'uq' : 'idx'

    return {
      ...spec,
      columns: list,
      method: spec.method ?? PgIndexMethod.BTree,
      name: pgIdentifier(spec.name ?? `${resolvedTable}_${list.join('_')}_${suffix}`)
    }
  })

  const resolvedUniques: PgUniqueSpec[] = uniques.map(spec => {
    const list = mapColumns(spec.columns)

    return { columns: list, name: pgIdentifier(spec.name ?? `${resolvedTable}_${list.join('_')}_key`) }
  })

  return {
    alias,
    schema: resolvedSchema,
    table: resolvedTable,
    qualified: qualify(resolvedSchema, resolvedTable),
    columns,
    byProperty,
    byColumn,
    primaryKey,
    uniques: resolvedUniques,
    checks: checks.map(check => ({ ...check, name: pgIdentifier(check.name ?? `${resolvedTable}_check`) })),
    indexes: resolvedIndexes,
    references,
    unmanaged: [
      ...(root.unmanaged ?? []).map(name => byProperty[name]?.column ?? pgIdentifier(name)),
      ...columns.filter(column => !column.managed).map(column => column.column)
    ],
    autoSync: root.autoSync ?? autoSync,
    ...(root.comment != null ? { comment: root.comment } : {})
  }
}

/**
 * AJV keyword registration for consumers running in strict mode. The mapper reads the raw
 * schema object and never validates through AJV, so this is purely to stop strict mode
 * rejecting a schema that carries `pg` overrides.
 */
export const pgKeyword = { keyword: PG_KEYWORD, valid: true }
