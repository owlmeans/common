import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { AccessBlockSchema, AccessLevel, AccessListSchema, PermissionDefault } from '../src/index.js'
import type { AccessBlock } from '../src/index.js'

const sha256 = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

// The model-facing schemas, byte for byte. They are rendered into the access prompts verbatim and
// handed to the model as its answer contract, so a change here changes what every model is asked —
// update these only together with the prompts that read them.
const ACCESS_BLOCK_SHA256 = '577c8406a73604128ff016a35fe918960d1316a1a24fe4737be31e41478c6ca8'
const ACCESS_LIST_SHA256 = '80b3ab836718ce69c97e9854f647f2b5ed794ec4b871e86ae94b0fad4bf68a50'

describe('viable-common - the access schema a model is asked for', () => {
  test('names only the model-written keys, never the code-written defaults or binding', () => {
    expect(Object.keys(AccessBlockSchema.properties ?? {})).toEqual(
      ['permissions', 'level', 'defaultEnabledPermissions']
    )
    expect(JSON.stringify(AccessListSchema)).not.toContain('entityScoped')
    expect(JSON.stringify(AccessListSchema)).not.toContain('"defaults"')
  })

  test('is byte-identical to the schema the access prompts were written against', () => {
    expect(sha256(AccessBlockSchema)).toBe(ACCESS_BLOCK_SHA256)
    expect(sha256(AccessListSchema)).toBe(ACCESS_LIST_SHA256)
  })

  test('an access block still carries the code-written keys as data', () => {
    const block: AccessBlock = {
      permissions: ['enquiry--view@enquiryId'], level: AccessLevel.Permissioned,
      defaults: { 'enquiry--view': PermissionDefault.Member }, entityScoped: true,
    }
    expect(block.defaults).toEqual({ 'enquiry--view': 'member' })
    expect(Object.values(PermissionDefault)).toEqual(['none', 'user', 'member', 'owner'])
  })
})
