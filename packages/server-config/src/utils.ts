import { readFileSync } from 'node:fs'

export const readConfigValue = <T extends string | null>(value: T | undefined, def: T = null as T): T => {
  if (value === undefined) {
    return def
  }
  if (value != null && (value.startsWith('/') || value.startsWith('file://'))) {
    return readFileSync(value, 'utf-8').trim() as T
  }

  return value
}
