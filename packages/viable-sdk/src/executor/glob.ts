import { globby } from 'globby'
import type { Options } from 'globby'
import type { GlobHelper } from './glob/types.js'

export const createGlobHelper = (): GlobHelper => {
  const list = async (patterns: string | string[], options: Options = {}): Promise<string[]> => {
    const all = Array.isArray(patterns) ? patterns : [patterns]
    const ignore = [...(Array.isArray(options.ignore) ? options.ignore : []), ...all.filter(x => x.startsWith('!')).map(x => x.slice(1))]

    return await globby(all.filter(x => !x.startsWith('!')), { ...options, ignore })
  }

  return { list }
}

export const globHelper = createGlobHelper()
