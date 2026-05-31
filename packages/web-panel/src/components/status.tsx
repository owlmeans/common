import type { FC } from 'react'
import { useMemo } from 'react'
import type { StatusProps } from './types.js'
import { usePanelI18n } from '@owlmeans/client-panel'
import { ResilientError } from '@owlmeans/error'
import { Alert, AlertDescription } from '@/components/ui/alert'

const prepareMessage = (msg: string) => msg.replace(/:/g, '.')

const variantToAlert = (variant: string): 'default' | 'destructive' | 'success' => {
  if (variant === 'error' || variant === 'destructive') return 'destructive'
  if (variant === 'success') return 'success'
  return 'default'
}

export const Status: FC<StatusProps> = ({ ok, name, i18n, children, variant, message, error }) => {
  variant = useMemo(() => variant ?? (ok ? 'success' : 'error'), [ok, variant])
  const t = usePanelI18n(name ?? variant, i18n)
  message = useMemo(() => {
    const resilient = error != null ? ResilientError.ensure(error) : null
    return message != null
      ? t(message)
      : resilient != null
        ? t([
            `${resilient.type}.${prepareMessage(resilient.message)}`,
            prepareMessage(resilient.message)
          ])
        : t(variant as string)
  }, [message, error?.name, ok, variant])

  return <Alert variant={variantToAlert(variant as string)}>
    <AlertDescription>{children ?? message}</AlertDescription>
  </Alert>
}
