import { usePanelI18n } from '@owlmeans/client-panel'
import type { FC } from 'react'
import type { LinkProps } from './types.js'
import MUILink from '@mui/material/Link'
import type { Variant } from '@mui/material/styles/createTypography.js'
import { useValue } from '@owlmeans/client'
import { useContext } from '@owlmeans/web-client'
import type { ClientModule } from '@owlmeans/client-module'

export const Link: FC<LinkProps> = ({ src, module, name, variant, children, center, open, styles }) => {
  const t = usePanelI18n()
  const context = useContext()

  const href = useValue(async () => {
    if (src != null) {
      return src
    }
    if (module != null) {
      module = typeof module === 'string' ? context.module<ClientModule<string>>(module) : module
      const [url] = await module.call<string>()

      return url
    }
    return null
  }, [src, module])

  const label = name != null
    ? t(name)
    : children != null || module == null
      ? undefined : t(`modules.${typeof module == 'string' ? module : module.alias}`)
  const target = open ? '_blank' : undefined
  return <MUILink href={href ?? undefined} target={target} variant={variant as Variant}
    sx={{ textAlign: center ? 'center' : 'inherit', ...styles }}>{label ?? children}</MUILink>
}
