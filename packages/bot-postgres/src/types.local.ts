import type { PgIndexSpec } from '@owlmeans/postgres-resource'

/** The indexes a maker owns, by name suffix — the full name is `<table>_<suffix>`. */
export type IndexList = ReadonlyArray<readonly [suffix: string, spec: PgIndexSpec]>
