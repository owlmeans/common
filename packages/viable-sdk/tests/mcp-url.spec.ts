import { describe, expect, test } from 'bun:test'
import { DEFAULT_MCP_URL, ENV_MCP_URL, resolveMcpUrl } from '../src/consts.js'

describe('@owlmeans/viable-sdk — the /mcp URL', () => {
  test('defaults to the production platform', () => {
    expect(DEFAULT_MCP_URL).toBe('https://api.owlmeans.com/mcp')
    expect(resolveMcpUrl({})).toBe('https://api.owlmeans.com/mcp')
  })

  test('is overridden by the named key — whether it came from the environment or the file', () => {
    expect(resolveMcpUrl({ [ENV_MCP_URL]: 'http://localhost:8080/mcp' })).toBe('http://localhost:8080/mcp')
  })

  test('an empty value is unset, so a harness that expands an unset variable to nothing falls through', () => {
    expect(resolveMcpUrl({ [ENV_MCP_URL]: '' })).toBe('https://api.owlmeans.com/mcp')
  })

  test('has one spelling: a trailing slash is dropped', () => {
    expect(resolveMcpUrl({ [ENV_MCP_URL]: 'https://x.example/mcp/' })).toBe('https://x.example/mcp')
  })
})
