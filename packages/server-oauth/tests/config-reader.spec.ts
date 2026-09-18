import { describe, expect, test } from 'bun:test'
import { protectedResourceMetadata } from '../src/metadata.js'
import { makeTestContext, TEST_MCP_RESOURCE } from './context.js'

/**
 * A server's config reader (`fileConfigReader` in `@owlmeans/server-context`) runs after
 * `makeContext` and swaps every string leaf that starts with `/` or `file://` for the contents of
 * that file. A resource path kept as `/mcp` therefore killed the process at boot with
 * `ENOENT: open '/mcp'` — a failure no other test here could see, since none of them runs the
 * reader. This walks the same leaves and refuses any the reader would open.
 */
const fileLeaves = (tree: unknown, at = 'cfg'): string[] => {
  if (typeof tree === 'string') {
    return tree.startsWith('/') || tree.startsWith('file://') ? [`${at}=${tree}`] : []
  }
  if (Array.isArray(tree)) return tree.flatMap((item, index) => fileLeaves(item, `${at}[${index}]`))
  if (tree != null && typeof tree === 'object') {
    return Object.entries(tree).flatMap(([key, value]) => fileLeaves(value, `${at}.${key}`))
  }

  return []
}

describe('the configuration this package writes survives the server config reader', () => {
  test('no string leaf of cfg.oauth would be read as a file', () => {
    const context = makeTestContext()

    expect(fileLeaves(context.cfg.oauth)).toEqual([])
    expect(context.cfg.oauth?.resources.map(resource => resource.path)).toEqual([undefined, 'mcp'])
  })

  test('the resource declared with a leading slash is still found by it', () => {
    const context = makeTestContext()

    expect(protectedResourceMetadata(context, '/mcp')?.resource).toBe(TEST_MCP_RESOURCE)
    expect(protectedResourceMetadata(context, 'mcp')?.resource).toBe(TEST_MCP_RESOURCE)
  })
})
