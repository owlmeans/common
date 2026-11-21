import { usePanelI18n } from '@owlmeans/client-panel'
import type { FC } from 'react'
import type { LinkProps } from './types.js'
import { useHref, useValue } from '@owlmeans/client'
import { useContext } from '@owlmeans/web-client'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { cn } from '../@/lib/utils.js'

export const Link: FC<LinkProps> = ({ src, module, name, children, center, open, className, style }) => {
  const t = usePanelI18n()
  const context = useContext()
  const withBase = useHref()

  const href = useValue(async () => {
    if (src != null) {
      return src
    }
    if (module != null) {
      module = typeof module === 'string' ? context.entrypoint<ClientEntrypoint<string>>(module) : module
      // An in-app address is base-less, the rendered one carries the application's base; an
      // absolute one (another service's screen) is rendered as it is.
      const url = withBase(await module.url())
      return url
    }
    return null
  }, [src, module])

  const label = name != null
    ? t(name)
    : children != null || module == null
      ? undefined
      : t(`modules.${typeof module === 'string' ? module : module.alias}`)
  const target = open ? '_blank' : undefined
  const rel = open ? 'noopener noreferrer' : undefined

  return <a
    href={href ?? undefined}
    target={target}
    rel={rel}
    className={cn(
      'text-primary underline-offset-4 hover:underline',
      center && 'text-center',
      className
    )}
    style={style}
  >{label ?? children}</a>
}
