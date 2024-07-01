import { SEP, normalizePath } from '@owlmeans/route'
import { PARAM, WILDCARD } from '../consts.js'

export const matchToPathes = (
  template: string, path: string
): { params: Record<string, string>, match: boolean, partial: boolean } => {
  template = normalizePath(template)
  const matches = template.split(SEP)
  const params: Record<string, string> = {}
  if (matches.length === 0) {
    return { params, match: true, partial: true }
  }

  [path] = path.split('?')
  path = normalizePath(path)
  const items = path.split(SEP)
  do {
    let match = matches.shift() as string
    if (match === '') {
      continue
    }
    if (items.length === 0) {
      return { params, match: false, partial: false }
    }
    const item = items.shift() as string
    if (match === WILDCARD) {
      if (matches.length === 0) {
        return { params, match: true, partial: false }
      }
      continue
    }
    if (match.startsWith(PARAM)) {
      params[match.slice(1)] = item
      continue
    }
    if (match !== item) {
      return { params, match: false, partial: false }
    }
  } while (matches.length > 0)
  if (items.length > 0) {
    return { params, match: true, partial: true }
  }
  return { params, match: true, partial: false }
}
