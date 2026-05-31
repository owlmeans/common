import { AuthenticationStage } from '@owlmeans/auth'
import type { RelyToken } from '@owlmeans/auth'
import type { TunnelAuthenticationRenderer } from '@owlmeans/client-auth/manager/plugins'
import { PinSchema } from '@owlmeans/client-auth/manager/plugins'
import { Form } from '../../components/form/component.js'
import { TextInput } from '../../components/form/text/component.js'
import { useEffect, useMemo, useState } from 'react'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { Block } from '../../components/block.js'
import { BlockScaling } from '@owlmeans/client-panel'
import { Status } from '../../components/status.js'
import { Button } from '../../components/form/button/component.js'
import { QRCodeCanvas } from 'qrcode.react'
import { Progress } from '@/components/ui/progress'

/**
 * Read a CSS variable from `:root` (consumer-owned theme). Falls back to
 * a sane default if the variable is undefined.
 */
const readCssVar = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value !== '' ? value : fallback
}

const useThemeColors = () => {
  const [colors, setColors] = useState({ fg: '#000000', bg: '#ffffff' })
  useEffect(() => {
    setColors({
      fg: readCssVar('--color-primary', '#000000'),
      bg: readCssVar('--color-card', '#ffffff'),
    })
  }, [])
  return colors
}

export const TunnelConsumerUIPlugin: TunnelAuthenticationRenderer = ({ type, stage, control, params, submit }) => {
  const rely = useMemo(() => {
    if (control.allowance == null) {
      return null
    }
    return makeEnvelopeModel<RelyToken>(
      makeEnvelopeModel<string>(control.allowance.challenge, EnvelopeKind.Wrap).message(true)
      , EnvelopeKind.Wrap
    ).message()
  }, [stage])

  const { fg, bg } = useThemeColors()
  const prefix = 'prefix' in params ? params.prefix as string : ''
  const i18n = { ns: 'lib', resource: 'client-panel-auth' }

  switch (stage) {
    case AuthenticationStage.Authenticate:
      return <Form decorate name={type} validation={PinSchema} onSubmit={submit} i18n={i18n}>
        <div className="w-fit mx-auto">
          {rely?.token != null && <QRCodeCanvas size={256}
            value={`${prefix}${rely?.token ?? ''}`}
            fgColor={fg}
            bgColor={bg}
          />}
        </div>
        <TextInput name="pin" label hint />
      </Form>
    case AuthenticationStage.Error:
      return <Block horizontal={BlockScaling.Half} i18n={i18n} Actions={() =>
        <Button label="reset" onClick={async () => { document.location.reload() }} />
      }>
        <Status error={control.error} ok={false} />
      </Block>
  }

  return <Progress className="w-full md:w-1/2" />
}
