import type { FC } from 'react'
import { memo } from 'react'
import type { SubmitProps } from './types.js'
import { useFormContext } from 'react-hook-form'
import { useFormI18n } from '@owlmeans/client-panel'
import type { I18nProps } from '@owlmeans/client-i18n'
import { SlowButton } from '../button/slow.js'

export const SubmitButton: FC<SubmitProps> = memo((props) => {
  let { i18n, name } = props
  const { handleSubmit } = useFormContext()
  const t = useFormI18n()

  name = name ?? 'submit'
  const _i18n: I18nProps["i18n"] = { ...i18n }
  _i18n.suppress = true

  return <SlowButton {...props} name={t(name)} i18n={_i18n}
    onPress={handleSubmit(props.onSubmit ?? props.onSubmit ?? (() => { }))} />
})
