import type { FC } from "react"
import { useMemo } from "react"
import { useFormContext } from "react-hook-form"
import { useClientFormContext, useFormI18n } from "./context.js"
import type { FormActionProps } from "./types.js"
import { useContext } from "@owlmeans/client"
// import { usePanelHelper } from "../context.js"
// import { useCommonI18n, useI18nApp, useI18nLib } from "@owlmeans/client-i18n"
import { useI18nApp, useI18nLib } from "@owlmeans/client-i18n"

export const ActionCtrl: FC<FormActionProps> = ({ render, label, i18n, size, onClick, submit }) => {
  const form = useFormContext()
  const client = useClientFormContext()

  const context = useContext()
  // const panel = usePanelHelper()
  /*const t = useCommonI18n(
    i18n?.resource ?? panel.resource ?? context.cfg.service,
    i18n?.ns ?? panel.ns,
    i18n?.prefix ?? panel.prefix
  )*/
  const t = useFormI18n()
  const appT = useI18nApp(context.cfg.service, 'buttons')
  const libT = useI18nLib('client-panel', 'buttons')

  label = useMemo(() => i18n?.suppress ? label : t(label ?? 'submit', {
    defaultValue: appT(label ?? 'submit', { defaultValue: libT(label ?? 'submit') })
  }), [i18n?.suppress, label])!

  size = size ?? 'medium'
  const progressSize = size === 'large'
    ? 20
    : size === 'medium' ? 16 : 14

  submit = onClick != null ? undefined : (submit ?? client.onSubmit)

  const action = onClick ?? submit != null
    ? form.handleSubmit(async data => submit?.(data, client.formRef?.current?.update))
    : undefined

  const update = client.formRef?.current?.update!

  const loading = client.loader.opened === true

  return render({ form, client, label, size, progressSize, action, update, loading, t })
}
