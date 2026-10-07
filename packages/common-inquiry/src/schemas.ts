import type { JSONSchemaType } from 'ajv'
import {
  INQUIRY_ALIAS_PATTERN, INQUIRY_ALLOWED_TYPES, INQUIRY_BODY_MAX, INQUIRY_DESCRIPTION_MAX, INQUIRY_DETAIL_MAX,
  INQUIRY_EMAIL_MAX, INQUIRY_FILE_FIELDS, INQUIRY_FILE_NAME_MAX, INQUIRY_LANGUAGE_PATTERN, INQUIRY_MAX_FILE_BYTES,
  INQUIRY_MAX_FILES, INQUIRY_MAX_TABS, INQUIRY_SUBJECT_MAX, INQUIRY_TITLE_MAX, INQUIRY_URL_MAX, InquiryContactMethod,
} from './consts.js'
import { INQUIRY_LINK_PATTERN } from './consts.local.js'
import type { InquiryFileMeta, InquiryReceipt, InquirySubmission, InquiryTab, InquiryWidgetConfig } from './types.js'

/** `LocalizedText`: a string, or a non-empty map of language tag → string. */
const localizedText = (maxLength: number) => ({
  anyOf: [
    { type: 'string', minLength: 1, maxLength },
    {
      type: 'object',
      minProperties: 1,
      maxProperties: 32,
      propertyNames: { pattern: INQUIRY_LANGUAGE_PATTERN },
      additionalProperties: { type: 'string', minLength: 1, maxLength },
      required: [],
    },
  ],
})

const InquiryTabSchema: JSONSchemaType<InquiryTab> = {
  type: 'object',
  properties: {
    alias: { type: 'string', pattern: INQUIRY_ALIAS_PATTERN },
    title: localizedText(INQUIRY_TITLE_MAX),
    description: localizedText(INQUIRY_DESCRIPTION_MAX),
  } as JSONSchemaType<InquiryTab>['properties'],
  required: ['alias', 'title'],
  additionalProperties: false,
}

/**
 * A widget config. Structure only: alias uniqueness and `defaultTab` membership are checked by
 * `inquiryConfigHelper.validate`, which a JSON schema cannot express.
 */
export const InquiryWidgetConfigSchema: JSONSchemaType<InquiryWidgetConfig> = {
  type: 'object',
  properties: {
    id: { type: 'string', pattern: INQUIRY_ALIAS_PATTERN },
    tabs: { type: 'array', minItems: 1, maxItems: INQUIRY_MAX_TABS, items: InquiryTabSchema },
    defaultTab: { type: 'string', pattern: INQUIRY_ALIAS_PATTERN, nullable: true },
    legal: {
      type: 'object',
      properties: {
        terms: { type: 'string', maxLength: INQUIRY_URL_MAX, pattern: INQUIRY_LINK_PATTERN },
        privacy: { type: 'string', maxLength: INQUIRY_URL_MAX, pattern: INQUIRY_LINK_PATTERN },
      },
      required: ['terms', 'privacy'],
      additionalProperties: false,
    },
    language: { type: 'string', pattern: INQUIRY_LANGUAGE_PATTERN, nullable: true },
  },
  required: ['id', 'tabs', 'legal'],
  additionalProperties: false,
}

export const InquiryFileMetaSchema: JSONSchemaType<InquiryFileMeta> = {
  type: 'object',
  properties: {
    field: { type: 'string', enum: [...INQUIRY_FILE_FIELDS] },
    name: { type: 'string', minLength: 1, maxLength: INQUIRY_FILE_NAME_MAX },
    type: { type: 'string', enum: [...INQUIRY_ALLOWED_TYPES] },
    size: { type: 'integer', minimum: 1, maximum: INQUIRY_MAX_FILE_BYTES },
  },
  required: ['field', 'name', 'type', 'size'],
  additionalProperties: false,
}

/** The parsed `files` field of a submission. Field uniqueness is the handler's to check. */
export const InquiryFileMetaListSchema: JSONSchemaType<InquiryFileMeta[]> = {
  type: 'array',
  minItems: 0,
  maxItems: INQUIRY_MAX_FILES,
  items: InquiryFileMetaSchema,
}

/**
 * A file field: the multipart parser (`attachFieldsToBody: 'keyValues'`) hands it over as a
 * Buffer. It is declared ONLY as an open object — `properties`, `additionalProperties: false` or
 * any size keyword would make ajv walk (or, with `removeAdditional`, strip) the bytes.
 */
const fileField = { type: 'object', additionalProperties: true }

/**
 * The multipart body of `POST <crm url>/api/inquiry`, for a route validated with
 * `removeAdditional` + `coerceTypes`. `files` stays a JSON string here; validate its parsed value
 * with `InquiryFileMetaListSchema`.
 */
export const InquirySubmissionSchema: JSONSchemaType<InquirySubmission> = {
  type: 'object',
  properties: {
    widget: { type: 'string', pattern: INQUIRY_ALIAS_PATTERN },
    tab: { type: 'string', pattern: INQUIRY_ALIAS_PATTERN },
    tabTitle: { type: 'string', maxLength: INQUIRY_TITLE_MAX, nullable: true },
    email: { type: 'string', minLength: 3, maxLength: INQUIRY_EMAIL_MAX, format: 'email' },
    subject: { type: 'string', minLength: 1, maxLength: INQUIRY_SUBJECT_MAX },
    contactMethod: { type: 'string', enum: Object.values(InquiryContactMethod) },
    contactDetail: { type: 'string', maxLength: INQUIRY_DETAIL_MAX, nullable: true },
    body: { type: 'string', minLength: 1, maxLength: INQUIRY_BODY_MAX },
    language: { type: 'string', pattern: INQUIRY_LANGUAGE_PATTERN, nullable: true },
    page: { type: 'string', maxLength: INQUIRY_URL_MAX, nullable: true },
    terms: { type: 'string', maxLength: INQUIRY_URL_MAX, nullable: true },
    privacy: { type: 'string', maxLength: INQUIRY_URL_MAX, nullable: true },
    consent: { type: ['boolean', 'string'], enum: [true, 'true'] },
    files: { type: 'string', minLength: 2, maxLength: 4096 },
    file0: fileField,
    file1: fileField,
    file2: fileField,
    file3: fileField,
    file4: fileField,
  } as JSONSchemaType<InquirySubmission>['properties'],
  required: ['widget', 'tab', 'email', 'subject', 'contactMethod', 'body', 'consent', 'files'],
  additionalProperties: false,
}

export const InquiryReceiptSchema: JSONSchemaType<InquiryReceipt> = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1 },
    queued: { type: 'boolean' },
  },
  required: ['id', 'queued'],
  additionalProperties: false,
}
