import type { BrandSettings } from '@owlmeans/config'
import type { LoginProviderConfig, LoginProviderHelper, LoginProviderModel } from './types.js'
import { PROVIDER_PLACEHOLDER } from './provider/consts.local.js'
import './provider-config.js'

export const createLoginProviderHelper = (): LoginProviderHelper => {
  /**
   * A configured value that was actually SET — `''` is how a build-time default spells "unset"
   * (see `resolveCredit` in `@owlmeans/client-auth/login`, which follows the same rule).
   */
  const set = (value?: string | null): string | null =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : null

  /**
   * A link a person may be sent to: an absolute http(s) URL, or a path on this origin.
   *
   * `//host` is protocol-relative — another origin wearing a path's clothes — and `/\` is read as
   * the same by browsers, so both are refused along with every other scheme (`javascript:` above
   * all, since this lands in an `href`).
   */
  const link = (value?: string | null): string | null => {
    const href = set(value)
    if (href == null) {
      return null
    }
    if (href.startsWith('/')) {
      return /^\/[/\\]/.test(href) ? null : href
    }
    try {
      const url = new URL(href)

      return url.protocol === 'https:' || url.protocol === 'http:' ? href : null
    } catch {
      return null
    }
  }

  const resolve = (cfg?: LoginProviderConfig, brand?: BrandSettings): LoginProviderModel | null => {
    const name = set(cfg?.name)
    const product = set(brand?.name)
    if (name == null || product == null) {
      return null
    }

    return {
      name,
      operator: set(cfg?.operator) ?? name,
      product,
      info: link(cfg?.info),
      placement: cfg?.placement === 'top' ? 'top' : 'inline',
    }
  }

  const fill = (template: string, model: LoginProviderModel): string => {
    const values: Record<string, string> = {
      provider: model.name, operator: model.operator, product: model.product,
    }

    return template.replace(PROVIDER_PLACEHOLDER, (match, key: string) => values[key] ?? match)
  }

  return { resolve, fill }
}

export const loginProviderHelper = createLoginProviderHelper()
