import LinearProgress from '@mui/material/LinearProgress'
import { AuthenticationStage } from '@owlmeans/auth'
import type { RelyToken } from '@owlmeans/auth'
import type { TunnelAuthenticationRenderer } from '@owlmeans/client-auth/manager/plugins'
import { PinSchema } from '@owlmeans/client-auth/manager/plugins'
import { Form } from '../../components/form/component.js'
import { TextInput } from '../../components/form/text/component.js'
// import { Text } from '../../components/text.js'
import { useMemo } from 'react'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { Block } from '../../components/block.js'
import { BlockScaling } from '@owlmeans/client-panel'
import { Status } from '../../components/status.js'
import type { SxProps } from '@mui/material/styles'
import { useTheme } from '@mui/material/styles'
import { Button } from '../../components/form/button/component.js'
import { QRCodeCanvas } from 'qrcode.react'
import Box from '@mui/material/Box'

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

  const theme = useTheme()
  const prefix = "prefix" in params ? params.prefix as string : ""
  const i18n = { ns: "lib", resource: 'client-panel-auth' }

  const loadingStyle: SxProps = {
    width: { xs: '100%', sm: '100%', md: '50%' }
  }

  switch (stage) {
    case AuthenticationStage.Authenticate:
      return <Form decorate name={type} validation={PinSchema} onSubmit={submit} i18n={i18n}>
        <Box width="fit-content" margin="auto">
          {rely?.token != null && <QRCodeCanvas size={256}
            value={`${prefix}${rely?.token ?? ""}`}
            fgColor={theme.palette.primary.dark}
            bgColor={theme.palette.background.paper}
          />}
        </Box>
        {/* <Text>{rely?.token}</Text> */}
        <TextInput name="pin" label hint />
      </Form>
    case AuthenticationStage.Error:
      return <Block horizontal={BlockScaling.Half} i18n={i18n} Actions={() =>
        // @TODO document reload looks a bit dirty - cause we can loose the flow
        <Button label="reset" onClick={async () => { document.location.reload() }} />
        // <Button label="reset" onClick={async () => { 
        //   await control.updateStage(AuthenticationStage.Authenticate)
        //  }} />
      }>
        <Status error={control.error} ok={false} />
      </Block>
  }

  return <LinearProgress sx={loadingStyle} />
}
