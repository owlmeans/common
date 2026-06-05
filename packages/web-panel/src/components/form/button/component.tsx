import { useMemo } from 'react'
import type { FC } from 'react'
import { memo } from 'react'
import type { ButtonProps, SubmitProps } from './types.js'
import { useFormContext } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import { I18nProps, useI18nApp, useI18nLib } from '@owlmeans/client-i18n'
import { useContext } from '@owlmeans/client'
import { useFormI18n, usePanelI18n } from '@owlmeans/client-panel'
import { Button as UIButton } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * MUI → shadcn variant mapping:
 *   contained → default
 *   outlined  → outline
 *   text      → ghost
 * Any other value is forwarded as-is (shadcn variants: default, destructive,
 * outline, secondary, ghost, link).
 */
const mapVariant = (v: string | undefined): 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' => {
  switch (v) {
    case undefined:
    case 'contained': return 'default'
    case 'outlined':  return 'outline'
    case 'text':      return 'ghost'
    case 'destructive':
    case 'outline':
    case 'secondary':
    case 'ghost':
    case 'link':
    case 'default':
      return v
    default:          return 'default'
  }
}

const mapSize = (s: ButtonProps['size']): 'sm' | 'default' | 'lg' => {
  switch (s) {
    case 'small':  return 'sm'
    case 'large':  return 'lg'
    case 'medium':
    default:       return 'default'
  }
}

export const Button: FC<ButtonProps> = memo(({ label, onClick, i18n, loader, size, fullWidth, variant = 'contained' }) => {
  const context = useContext()
  const t = usePanelI18n(undefined, i18n)
  const appT = useI18nApp(context.cfg.service, 'buttons')
  const libT = useI18nLib('client-panel', 'buttons')
  label = useMemo(() => i18n?.suppress ? label : t(label, {
    defaultValue: appT(label, { defaultValue: libT(label) })
  }), [i18n?.suppress, label])

  const disabled = loader != null && loader.opened === true
  const showLoader = disabled

  return (
    <UIButton
      type="button"
      variant={mapVariant(variant)}
      size={mapSize(size)}
      disabled={disabled}
      onClick={onClick}
      className={cn(fullWidth && 'w-full')}
    >
      {showLoader && <Loader2 className="animate-spin" aria-hidden />}
      {label}
    </UIButton>
  )
})

export const SubmitButton: FC<SubmitProps> = memo((props) => {
  let { i18n, label } = props
  const { handleSubmit } = useFormContext()
  const t = useFormI18n()

  label = label ?? 'submit'
  const _i18n: I18nProps['i18n'] = { ...i18n }
  _i18n.suppress = true

  return <Button {...props} label={t(label)} i18n={_i18n}
    onClick={handleSubmit(
      props.onSubmit ?? props.onClick ?? (() => { console.info('Empty submit') }),
      problem => console.error('Failed to submit form with error: ', problem)
    )} />
})
