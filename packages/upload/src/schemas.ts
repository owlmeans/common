import type { JSONSchemaType } from 'ajv'
import { FileKind } from '@owlmeans/file-inspector/kinds'
import { UPLOAD_FILE_PARAM, UPLOAD_PATH_LIMITS, UploadedFileStatus, UploadReason, UploadSessionStatus } from './consts.js'
import type {
  UploadedFile, UploadFileQuery, UploadFileResult, UploadOpenRequest, UploadPolicy, UploadSession, UploadSessionParams,
  UploadTotals,
} from './types.js'

const kinds = Object.values(FileKind)

export const UploadTotalsSchema: JSONSchemaType<UploadTotals> = {
  type: 'object',
  properties: {
    files: { type: 'integer', minimum: 0 },
    bytes: { type: 'integer', minimum: 0 },
  },
  required: ['files', 'bytes'],
  additionalProperties: false,
}

export const UploadPolicySchema: JSONSchemaType<UploadPolicy> = {
  type: 'object',
  properties: {
    maxFiles: { type: 'integer', minimum: 1 },
    maxFileBytes: { type: 'integer', minimum: 1 },
    maxTotalBytes: { type: 'integer', minimum: 1 },
    unpackArchives: { type: 'boolean' },
    refuse: { type: 'array', items: { type: 'string', enum: kinds } },
    allow: { type: 'array', items: { type: 'string', enum: kinds }, nullable: true },
  },
  required: ['maxFiles', 'maxFileBytes', 'maxTotalBytes', 'unpackArchives', 'refuse'],
  additionalProperties: false,
}

export const UploadedFileSchema: JSONSchemaType<UploadedFile> = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 128 },
    path: { type: 'string', minLength: 1, maxLength: UPLOAD_PATH_LIMITS.maxPathBytes },
    name: { type: 'string', minLength: 1, maxLength: UPLOAD_PATH_LIMITS.maxSegmentBytes },
    size: { type: 'integer', minimum: 0 },
    mime: { type: 'string', maxLength: 255, nullable: true },
    kind: { type: 'string', enum: kinds, nullable: true },
    digest: { type: 'string', pattern: '^[a-f0-9]{64}$', nullable: true },
    status: { type: 'string', enum: Object.values(UploadedFileStatus) },
    reason: { type: 'string', enum: Object.values(UploadReason), nullable: true },
    from: { type: 'string', maxLength: UPLOAD_PATH_LIMITS.maxPathBytes, nullable: true },
  },
  required: ['id', 'path', 'name', 'size', 'status'],
  additionalProperties: false,
}

export const UploadSessionSchema: JSONSchemaType<UploadSession> = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 128 },
    status: { type: 'string', enum: Object.values(UploadSessionStatus) },
    policy: UploadPolicySchema,
    files: { type: 'array', items: UploadedFileSchema },
    totals: UploadTotalsSchema,
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    sealedAt: { type: 'string', format: 'date-time', nullable: true },
    abortedAt: { type: 'string', format: 'date-time', nullable: true },
  },
  required: ['id', 'status', 'policy', 'files', 'totals', 'createdAt', 'updatedAt'],
  additionalProperties: false,
}

export const UploadOpenRequestSchema: JSONSchemaType<UploadOpenRequest> = {
  type: 'object',
  properties: {
    expect: { ...UploadTotalsSchema, nullable: true },
  },
  required: [],
  additionalProperties: false,
}

export const UploadFileQuerySchema: JSONSchemaType<UploadFileQuery> = {
  type: 'object',
  properties: {
    // Long enough for a path the package then refuses as too long — the refusal is a recorded file.
    path: { type: 'string', minLength: 1, maxLength: UPLOAD_PATH_LIMITS.maxPathBytes * 4 },
    size: { type: 'integer', minimum: 0, nullable: true },
    type: { type: 'string', maxLength: 255, nullable: true },
  },
  required: ['path'],
  additionalProperties: false,
}

export const UploadFileResultSchema: JSONSchemaType<UploadFileResult> = {
  type: 'object',
  properties: {
    files: { type: 'array', items: UploadedFileSchema },
  },
  required: ['files'],
  additionalProperties: false,
}

/** The params schema of a session route: the session parameter, plus `file` for `remove`. */
export const uploadParamsSchema = (param: string, withFile: boolean = false): JSONSchemaType<UploadSessionParams> => {
  const id = { type: 'string', minLength: 1, maxLength: 128 }
  return {
    type: 'object',
    properties: { [param]: id, ...(withFile ? { [UPLOAD_FILE_PARAM]: id } : {}) },
    required: withFile ? [param, UPLOAD_FILE_PARAM] : [param],
  } as unknown as JSONSchemaType<UploadSessionParams>
}
