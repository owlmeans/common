import type { BasicContext } from '@owlmeans/context'
import { SEP } from './consts.local.js'
import type { RouterBaseHelper } from './base/types.js'

export const createRouterBaseHelper = (): RouterBaseHelper => {
  const normalize: RouterBaseHelper['normalize'] = base => {
    const trimmed = (base ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, '')

    return trimmed === '' ? '' : SEP + trimmed
  }

  const strip: RouterBaseHelper['strip'] = (pathname, base) => {
    const prefix = normalize(base)
    if (prefix === '') {
      return pathname
    }
    if (pathname === prefix) {
      return SEP
    }

    return pathname.startsWith(prefix + SEP) ? pathname.slice(prefix.length) : pathname
  }

  const join: RouterBaseHelper['join'] = (base, path) => {
    const prefix = normalize(base)
    // Only a root-relative path is the router's own: a scheme, `#`, `?`, a relative path and `''`
    // never start with a separator, and `//host` is another host.
    if (prefix === '' || !path.startsWith(SEP) || path.startsWith(SEP + SEP)) {
      return path
    }

    return prefix + path
  }

  const baseOf: RouterBaseHelper['baseOf'] = ctx => {
    const cfg = (ctx as BasicContext<any> | null | undefined)?.cfg
    const service = cfg?.service != null ? cfg.services?.[cfg.service] as { base?: unknown } | undefined : undefined

    return normalize(typeof service?.base === 'string' ? service.base : '')
  }

  return { normalize, strip, join, baseOf }
}

export const routerBaseHelper = createRouterBaseHelper()
