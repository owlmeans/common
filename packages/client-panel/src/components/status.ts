import { useMemo } from "react"
import type { StatusOptions } from "./types.js"
import { usePanelI18n } from "./context"
import { ResilientError } from "@owlmeans/error"

const prepareMessage = (msg: string) => msg.replace(/\:/g, '.')

export const useStatusMessage = ({ variant, name, ok, i18n, message, error }: StatusOptions) => {
  ok = ok !== false
  variant = useMemo(() => variant ?? (ok ? 'success' : 'error'), [ok, variant])
  const t = usePanelI18n(name ?? variant, i18n)
  message = useMemo(() => {
    const resilient = error != null ? ResilientError.ensure(error) : null
    return message != null ? t(message) : resilient != null ? t(
      [
        `${resilient.type}.${prepareMessage(resilient.message)}`,
        prepareMessage(resilient.message)
      ],
    ) : t(variant)
  }, [message, error?.name, ok, variant])

  return { message, variant, ok }
}
