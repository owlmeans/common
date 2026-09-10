import { usePanelI18n } from '@owlmeans/client-panel'
import type { FC } from 'react'
import type { LinkProps } from './types.js'
import { useValue } from '@owlmeans/client'
import { useContext } from '@owlmeans/web-client'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { aliasOf } from '@owlmeans/entrypoint'
import { cn } from '@/lib/utils'

export const Link: FC<LinkProps> = ({ src, module, name, children, center, open, className, style }) => {
  const t = usePanelI18n()
  const context = useContext()

  const href = useValue(async () => {
    if (src != null) {
      return src
    }
    if (module != null) {
      const entrypoint = typeof module === 'object' && '_entrypoint' in module
        ? module
        : context.entrypoint<ClientEntrypoint<string>>(module)
      const url = await entrypoint.url()
      return url
    }
    return null
  }, [src, module])

  const label = name != null
    ? t(name)
    : children != null || module == null
      ? undefined
      : t(`modules.${aliasOf(module)}`)
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
