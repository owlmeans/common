import type { FC } from 'react'
import { useMemo } from 'react'
import type { StatusProps } from './types.js'
import { usePanelI18n } from '@owlmeans/client-panel'
import { ResilientError } from '@owlmeans/error'
import Alert from '@mui/material/Alert'

const prepareMessage = (msg: string) => msg.replace(/\:/g, '.')

export const Status: FC<StatusProps> = ({ ok, name, i18n, children, variant, message, error }) => {
  variant = useMemo(() => variant ?? (ok ? 'success' : 'error'), [ok, variant])
  const t = usePanelI18n(name ?? variant, i18n)
  message = useMemo(() => {
    const resilient = error != null ? ResilientError.ensure(error) : null
    console.log(
      '! try to display error', name,
      resilient?.type, resilient?.message
    )
    return message != null ? t(message) : resilient != null ? t(
        [
          `${resilient.type}.${prepareMessage(resilient.message)}`,
          prepareMessage(resilient.message)
        ],
        // { defaultValue: t(resilient!.type) }
      ) : t(variant)
  }, [message, error?.name, ok, variant])
  return <Alert severity={variant as any}>{children ?? message}</Alert>
}
