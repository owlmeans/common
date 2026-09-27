import { describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import p from 'node:path'
import { fileURLToPath } from 'node:url'
import { VERSION } from '../src/index.js'

const manifest = JSON.parse(
  fs.readFileSync(p.resolve(p.dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'),
) as { version: string }

describe('@owlmeans/viable-mcp — the reported version', () => {
  test('is the manifest version, never a literal', () => {
    expect(VERSION).toBe(manifest.version)
  })
})
