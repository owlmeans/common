import { describe, expect, test } from 'bun:test'
import { handleRegister } from '../src/handlers/register.js'
import { tokenNameOf } from '../src/handlers/token.js'
import { makeTestContext } from './context.js'

describe('the name an issued token has in the person\'s token list', () => {
  test('names the client and where it runs', () => {
    expect(tokenNameOf({ clientName: 'Viable MCP', label: 'my-laptop' })).toBe('Viable MCP · my-laptop')
    expect(tokenNameOf({ clientName: 'Claude Code', label: '127.0.0.1' })).toBe('Claude Code · 127.0.0.1')
  })

  test('leaves out what is missing and never exceeds the token-name limit', () => {
    expect(tokenNameOf({ clientName: 'Viable MCP' })).toBe('Viable MCP')
    expect(tokenNameOf({ label: '  ' })).toBe('OAuth connector')
    expect(tokenNameOf({ clientName: 'x'.repeat(200), label: 'host' }).length).toBe(64)
  })
})

describe('a registration response', () => {
  test('omits the optional fields the client did not send instead of answering null', async () => {
    const context = makeTestContext()
    const { status, body } = await handleRegister(context, {
      client_name: 'e2e', redirect_uris: ['http://127.0.0.1:4711/callback'],
    })

    expect(status).toBe(201)
    expect(Object.values(body).some(value => value === null)).toBe(false)
    expect('client_uri' in body).toBe(false)
    expect('logo_uri' in body).toBe(false)
  })
})
