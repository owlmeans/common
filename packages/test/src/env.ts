import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export interface EnvOk {
  ok: true
}

export interface EnvSkip {
  skip: true
  reason: string
}

export type EnvGate = EnvOk | EnvSkip

let loaded = false

const findRoot = (start: string): string | null => {
  let dir = start
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, 'bun.lock')) || existsSync(resolve(dir, 'package.json')) && existsSync(resolve(dir, 'packages'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

const parseEnv = (text: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

export const loadEnv = (opts?: { force?: boolean, file?: string }): void => {
  if (loaded && opts?.force !== true) return
  loaded = true
  const root = findRoot(process.cwd())
  const envPath = opts?.file ?? (root != null ? resolve(root, '.env') : null)
  if (envPath == null || !existsSync(envPath)) return
  const text = readFileSync(envPath, 'utf8')
  const parsed = parseEnv(text)
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] == null || process.env[k] === '') {
      process.env[k] = v
    }
  }
}

export const hasEnv = (key: string): boolean => {
  loadEnv()
  const v = process.env[key]
  return v != null && v !== ''
}

export const requireEnv = (keys: string[]): EnvGate => {
  loadEnv()
  const missing = keys.filter(k => !hasEnv(k))
  if (missing.length === 0) return { ok: true }
  return { skip: true, reason: `Missing env: ${missing.join(', ')}` }
}
