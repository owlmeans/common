import type { FC } from 'react'
import { useEffect, useMemo } from 'react'
import type { StatusProps } from './types.js'
import { usePanelI18n } from '@owlmeans/client-panel'
import { ResilientError } from '@owlmeans/error'
import { Snackbar } from 'react-native-paper'
import { useToggle } from '@owlmeans/client'

const prepareMessage = (msg: string) => msg.replace(/\:/g, '.')

export const Status: FC<StatusProps> = ({ ok, name, i18n, children, variant, message, error }) => {
  const opened = useToggle(false)
  variant = useMemo(() => variant ?? (ok ? 'success' : 'error'), [ok, variant])
  const t = usePanelI18n(name ?? variant, i18n)
  message = useMemo(() => {
    const resilient = error != null ? ResilientError.ensure(error) : null
    return message != null ? t(message) : resilient != null ? t(
        [
          `${resilient.type}.${prepareMessage(resilient.message)}`,
          prepareMessage(resilient.message)
        ],
      ) : undefined
  }, [message, error?.name, ok, variant])
  useEffect(() => {
    if (message) {
      opened.open()
    }
  }, [message])
  return <Snackbar visible={opened.opened} onDismiss={opened.close} duration={3000}>{children ?? message}</Snackbar>
}
