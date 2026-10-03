import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { OIDCAuthInitParamsSchema, OidcOrganizationSwitchSchema } from '../src/models.js'

const strict = new Ajv()
// The server's own options: a closed schema STRIPS what it does not declare instead of failing,
// so an undeclared field would vanish without an error ever reaching the caller.
const server = new Ajv({ removeAdditional: true, useDefaults: true, coerceTypes: true, allErrors: true, strict: false })

describe('OIDCAuthInitParamsSchema', () => {
  const validate = strict.compile(OIDCAuthInitParamsSchema)

  test('accepts the requested organization next to the provider entity', () => {
    expect(validate({ entity: 'acme-client', entitySlug: 'acme-team' })).toBe(true)
    expect(validate({ entitySlug: 'acme-team' })).toBe(true)
    expect(validate({})).toBe(true)
  })

  test('refuses a slug too short to name an organization', () => {
    expect(validate({ entitySlug: 'ab' })).toBe(false)
  })

  test('stays closed to anything it does not declare', () => {
    expect(validate({ entitySlug: 'acme-team', entityId: '0123456789abcdef01234567' })).toBe(false)
  })

  test('the server keeps the requested slug rather than stripping it', () => {
    const body: Record<string, unknown> = { entity: 'acme-client', entitySlug: 'acme-team', stray: 'x' }
    expect(server.compile(OIDCAuthInitParamsSchema)(body)).toBe(true)
    expect(body).toEqual({ entity: 'acme-client', entitySlug: 'acme-team' })
  })
})

describe('OidcOrganizationSwitchSchema', () => {
  const validate = strict.compile(OidcOrganizationSwitchSchema)

  test('names the organization by slug and nothing else', () => {
    expect(validate({ entitySlug: 'acme-team' })).toBe(true)
    expect(validate({})).toBe(false)
    expect(validate({ entitySlug: 'acme-team', entityKey: 'frozen-key' })).toBe(false)
  })
})
