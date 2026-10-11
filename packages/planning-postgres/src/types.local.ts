import type { PgIndexSpec } from '@owlmeans/postgres-resource'

export type IndexList = Array<[suffix: string, spec: PgIndexSpec]>

export type Properties = Record<string, Record<string, unknown>>
