import type { FC } from 'react'
import { useLanguage } from '@owlmeans/client-i18n'
import { usePassword } from '../hooks/use-password.js'
import { useEmailAuthTranslate } from '../hooks/use-translate.js'
import { PasswordPanel } from './panel.js'
import type { ConnectedPasswordPanelProps } from './types.js'

/**
 * The password panel wired to the password routes of the current context — the whole feature in
 * one element, and the only piece of it that talks to a server.
 */
export const ConnectedPasswordPanel: FC<ConnectedPasswordPanelProps> = ({
  aliases, translate, title, description, className,
}) => {
  const own = useEmailAuthTranslate()
  const [lng] = useLanguage()
  const model = usePassword(aliases, { locale: lng })

  return <PasswordPanel
    status={model.status}
    loading={model.loading}
    busy={model.busy}
    pending={model.pending}
    refusal={model.refusal}
    done={model.done}
    onSendPin={model.sendPin}
    onConfirm={model.confirm}
    onCancel={model.cancel}
    onReload={model.reload}
    translate={translate ?? own}
    locale={lng}
    title={title}
    description={description}
    className={className}
  />
}
