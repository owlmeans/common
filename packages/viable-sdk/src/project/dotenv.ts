import { CONNECT_ENV_BEGIN, CONNECT_ENV_END } from '@owlmeans/viable-common'

import type { DotenvHelper } from './dotenv/types.js'

export const createDotenvHelper = (): DotenvHelper => {
  const parseEnv = (content: string): Record<string, string> => {
    const values: Record<string, string> = {}
    for (const raw of content.split('\n')) {
      const line = raw.trim()
      if (line === '' || line.startsWith('#')) continue

      const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
      if (match == null) continue

      let value = match[2].trim()
      if ((value.startsWith('"') && value.endsWith('"') && value.length > 1)
        || (value.startsWith("'") && value.endsWith("'") && value.length > 1)) {
        value = value.slice(1, -1)
      }
      values[match[1]] = value
    }

    return values
  }

  const outsideManagedBlock = (existing: string): string => {
    const begin = existing.indexOf(CONNECT_ENV_BEGIN)
    if (begin < 0) return existing

    const end = existing.indexOf(CONNECT_ENV_END, begin)

    return end < 0
      ? existing.slice(0, begin)
      : `${existing.slice(0, begin)}${existing.slice(end + CONNECT_ENV_END.length)}`
  }

  const yieldToUser = (existing: string, content: string): string => {
    const theirs = parseEnv(outsideManagedBlock(existing))
    if (Object.keys(theirs).length < 1) return content

    return content.split('\n').map(raw => {
      const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(raw.trim())
      if (match == null || !(match[1] in theirs)) return raw

      return `# ${match[1]} is set in your own lines, so this block leaves it to you.`
    }).join('\n')
  }

  const replaceManagedBlock = (existing: string, content: string): string => {
    const body = content.replace(/^\n+|\n+$/g, '')
    const block = `${CONNECT_ENV_BEGIN}\n${body === '' ? '' : `${body}\n`}${CONNECT_ENV_END}\n`

    const begin = existing.indexOf(CONNECT_ENV_BEGIN)
    if (begin < 0) {
      const prefix = existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`

      return `${prefix}${block}`
    }

    const end = existing.indexOf(CONNECT_ENV_END, begin)
    const after = end < 0 ? existing.length : end + CONNECT_ENV_END.length

    return `${existing.slice(0, begin)}${block}${existing.slice(after).replace(/^\n/, '')}`
  }

  return { parseEnv, outsideManagedBlock, yieldToUser, replaceManagedBlock }
}

export const dotenvHelper = createDotenvHelper()
