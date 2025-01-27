import type { FC } from 'react'
import { useContext, useValue } from '@owlmeans/client'
import type { Config, Context, WlWebService } from '../types.js'
import { DEFAULT_ALIAS } from '../consts.js'
import type { WLLogoProps } from './types.js'
import type { CustomMedia } from '@owlmeans/wled'

export const WlLogo: FC<WLLogoProps> = ({ entityId, defImg }) => {
  const context = useContext<Config, Context>()
  const wl = useValue<CustomMedia | null>(async () => {
    const srv = context.service<WlWebService>(DEFAULT_ALIAS)
    if (entityId != null) {
      const wl = await srv.load<CustomMedia>(entityId)

      return wl['wl-logo']
    }

    return { brand: {} }
  }, [entityId])

  return (wl?.brand.wideLogo ?? defImg)
    && <img src={wl?.brand.wideLogo ?? defImg} style={{ maxWidth: '50%' }} />
}
