import type { AnySchema } from 'ajv'

import type { PgIndexSpec, TableSpec } from '../../types.js'

/** The JSON Schema → table specification compiler. */
export interface PgSchemaHelper {
  /**
   * Normalize a Postgres type name to the spelling `format_type()` reports, so the drift
   * comparison against a live table is an exact string match instead of a fuzzy one.
   */
  toFormatType: (type: string) => string
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
  schemaToTableSpec: (
    alias: string, schema: AnySchema | undefined, pgSchema: string, table: string,
    autoSync: boolean, extraIndexes?: PgIndexSpec[]
  ) => TableSpec
}
