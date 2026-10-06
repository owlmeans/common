import type { SQL } from 'drizzle-orm'
import { PG_KEYWORD } from '../consts.js'
import type { PgPropertyOverride, PgRootOverride } from '../types.js'

/**
 * A value at a path, as the jsonb it is (`#>`) and as text (`#>>`). The path is ONE bound `text[]`
 * parameter, so a segment holding a comma or a brace stays one segment.
 */
export interface PathTarget {
  value: SQL
  text: SQL
  /** Absent, or a JSON `null` — what every other store reads as "no value". */
  missing: SQL
}

export interface RawProperty {
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

export interface RawSchema {
  properties?: Record<string, RawProperty>
  required?: string[]
  allOf?: RawSchema[]
  [PG_KEYWORD]?: PgRootOverride
}
