import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import formatsPlugin from 'ajv-formats'
import {
  INQUIRY_MAX_FILE_BYTES, InquiryContactMethod, InquiryFileMetaListSchema, InquirySubmissionSchema,
  InquiryWidgetConfigSchema,
} from '@owlmeans/common-inquiry'

/** The options `@owlmeans/server-api` validates request bodies with. */
const makeAjv = () => {
  const ajv = new Ajv({ removeAdditional: true, useDefaults: true, coerceTypes: true, allErrors: true, strict: false })
  formatsPlugin(ajv)
  return ajv
}

/** A body as `@fastify/multipart` (`attachFieldsToBody: 'keyValues'`) hands it over: strings and Buffers. */
const body = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  widget: 'viable',
  tab: 'report-issue',
  tabTitle: 'Report an issue',
  email: 'someone@example.com',
  subject: 'The preview does not load',
  contactMethod: InquiryContactMethod.Email,
  body: 'Steps to reproduce…',
  language: 'en',
  page: 'https://example.com/',
  consent: 'true',
  files: '[]',
  ...patch,
})

describe('InquirySubmissionSchema', () => {
  test('accepts multipart text fields and leaves a file Buffer untouched', () => {
    const validate = makeAjv().compile(InquirySubmissionSchema)
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    const data = body({ file0: bytes, files: JSON.stringify([{ field: 'file0', name: 'a.png', type: 'image/png', size: 11 }]) })
    expect(validate(data)).toBe(true)
    expect(data.file0).toBe(bytes)
    expect(Buffer.compare(data.file0 as Buffer, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]))).toBe(0)
  })

  test('consent is true or "true" — never anything else', () => {
    const validate = makeAjv().compile(InquirySubmissionSchema)
    expect(validate(body({ consent: true }))).toBe(true)
    expect(validate(body({ consent: 'false' }))).toBe(false)
    expect(validate(body({ consent: false }))).toBe(false)
    const missing = body()
    delete missing.consent
    expect(validate(missing)).toBe(false)
  })

  test('strips unknown fields, refuses an unknown contact method and an over-long subject', () => {
    const validate = makeAjv().compile(InquirySubmissionSchema)
    const data = body({ admin: 'yes' })
    expect(validate(data)).toBe(true)
    expect(data.admin).toBeUndefined()
    expect(validate(body({ contactMethod: 'fax' }))).toBe(false)
    expect(validate(body({ subject: 'x'.repeat(151) }))).toBe(false)
    expect(validate(body({ email: 'not an address' }))).toBe(false)
  })
})

describe('InquiryFileMetaListSchema', () => {
  test('validates the parsed files field: known fields and types, the size cap, at most five', () => {
    const validate = makeAjv().compile(InquiryFileMetaListSchema)
    const meta = { field: 'file0', name: 'report.pdf', type: 'application/pdf', size: 1000 }
    expect(validate([meta])).toBe(true)
    expect(validate([{ ...meta, type: 'image/svg+xml' }])).toBe(false)
    expect(validate([{ ...meta, field: 'file5' }])).toBe(false)
    expect(validate([{ ...meta, size: INQUIRY_MAX_FILE_BYTES + 1 }])).toBe(false)
    expect(validate(Array.from({ length: 6 }, () => meta))).toBe(false)
  })
})

describe('InquiryWidgetConfigSchema', () => {
  test('accepts localized and plain titles and refuses a config without tabs', () => {
    const validate = makeAjv().compile(InquiryWidgetConfigSchema)
    const config = {
      id: 'owlmeans-quote',
      tabs: [{ alias: 'quote', title: { en: 'Get a quote', de: 'Angebot anfordern' }, description: 'Tell us what you need.' }],
      legal: { terms: '/legal/terms', privacy: 'https://owlmeans.com/legal/privacy' },
    }
    expect(validate(config)).toBe(true)
    expect(validate({ ...config, tabs: [] })).toBe(false)
    expect(validate({ ...config, legal: { terms: 'javascript:void(0)', privacy: '/p' } })).toBe(false)
  })
})
