import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Load a JSON fixture relative to the consuming package's `tests/fixtures/`
 * directory. The caller passes a path relative to its own `tests/`; the
 * loader resolves it against `process.cwd()`, which `bun test` sets to the
 * package root.
 */
export const loadFixture = <T = unknown>(relPath: string): T => {
  const path = resolve(process.cwd(), 'tests', relPath)
  const text = readFileSync(path, 'utf8')
  return JSON.parse(text) as T
}
