import type { JSONSchemaType } from 'ajv'
import type { StoredFileInstance, StoredFileMeta } from './types.js'
import { StoredFileFormat, StoredFileStatus } from './consts.js'
import { EntityValueSchema, IdValueSchema, ScopeValueSchema } from '@owlmeans/auth'

export const StoredFileMetaSchema: JSONSchemaType<StoredFileMeta> = {
  type: 'object',
  properties: {
    entityId: { ...EntityValueSchema, nullable: true },
    sourceName: { type: 'string', minLength: 1, maxLength: 255, nullable: true },
    name: { type: 'string', minLength: 1, maxLength: 128, nullable: true },
    title: { type: 'string', minLength: 1, maxLength: 255, nullable: true },
    scopes: { type: 'array', items: { ...ScopeValueSchema } },
    mimeType: { type: 'string', minLength: 1, maxLength: 32 },
    alias: { ...IdValueSchema },
    status: { type: 'string', enum: Object.values(StoredFileStatus) }
  },
  required: ['scopes', 'mimeType', 'alias', 'status'],
  additionalProperties: false,
}

export const StoredFileInstanceSchema: JSONSchemaType<StoredFileInstance> = {
  type: 'object',
  properties: {
    size: { type: 'number', default: 0 },
    alias: { ...IdValueSchema },
    url: { type: 'string', format: 'uri' }
  },
  required: ['size', 'alias', 'url'],
  additionalProperties: false,
}

export const StoredFilePayloadSchema: JSONSchemaType<StoredFileInstance> = {
  type: 'object',
  properties: {
    ...StoredFileInstanceSchema.properties,
    format: { type: 'string', enum: Object.values(StoredFileFormat), nullable: true },
    bytes: { type: 'array', items: { type: 'uint8' }, nullable: true },
    base64: { type: 'string', format: 'byte', nullable: true },
  },
  required: [...StoredFileInstanceSchema.required],
  additionalProperties: false,
} as JSONSchemaType<StoredFileInstance>

export const StoredFileSchema: JSONSchemaType<StoredFileMeta> = {
  type: 'object',
  properties: {
    ...StoredFileMetaSchema.properties,
    instances: { type: 'object', additionalProperties: { ...StoredFileInstanceSchema } },
  },
  required: [...StoredFileMetaSchema.required, 'instances'],
  additionalProperties: false,
} as JSONSchemaType<StoredFileMeta>

export const StoredFileWithDataSchema: JSONSchemaType<StoredFileMeta> = {
  type: 'object',
  properties: {
    ...StoredFileMetaSchema.properties,
    format: { type: 'string', enum: Object.values(StoredFileFormat), nullable: true },
    instances: { type: 'object', additionalProperties: { ...StoredFilePayloadSchema } },
  },
  required: [...StoredFileMetaSchema.required, 'instances'],
  additionalProperties: false,
} as JSONSchemaType<StoredFileMeta>
