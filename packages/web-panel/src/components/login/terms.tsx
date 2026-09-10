import type { FC, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { LoginTermsModel } from '@owlmeans/client-panel/auth'

export interface LoginTermsProps {
  model: LoginTermsModel
  translate: (key: string, defaultValue: string) => string
  className?: string
}

/**
 * Split a translated sentence around its two link placeholders.
 *
 * The sentence is translated as ONE string with `{{terms}}` and `{{privacy}}` in it, rather than
 * assembled from fragments, because word order differs between languages and an assembled sentence
 * forces every translator into English's. Splitting the already-translated string keeps that
 * freedom while keeping the i18n contract at `(key, defaultValue) => string` — no ReactNode ever
 * comes out of a translation, so an app with no i18n provider still renders a correct sentence.
 */
const interpolate = (
  sentence: string, slots: Record<string, ReactNode>
): ReactNode[] => sentence
  .split(/(\{\{[a-z]+\}\})/i)
  .map((part, index) => {
    const match = /^\{\{([a-z]+)\}\}$/i.exec(part)

    return match != null
      ? <span key={index}>{slots[match[1]] ?? part}</span>
      : <span key={index}>{part}</span>
  })

export const LoginTerms: FC<LoginTermsProps> = ({ model, translate, className }) => {
  const link = (href: string, label: string): ReactNode =>
    <a href={href} target="_blank" rel="noreferrer noopener"
      className="underline underline-offset-2 hover:text-foreground">{label}</a>

  // Centred, like every other row in the card. The checkbox stays at the start of the sentence
  // rather than above it, so `justify-center` centres the pair and `text-center` centres the
  // wrapped lines within it.
  return <div className={cn('flex flex-col items-center gap-1.5 text-center', className)}>
    <label className="flex items-start justify-center gap-2 text-sm text-muted-foreground cursor-pointer">
      {/*
        A NATIVE checkbox, deliberately. `web-panel` ships no `checkbox` primitive, and requiring
        every consumer to vendor one plus its Radix peer to render a sign-in screen would be a
        breaking change for every application already on this package. A native control is also the
        most accessible thing available here.
      */}
      <input
        type="checkbox" data-login-terms
        className="mt-0.5 size-4 shrink-0 accent-primary"
        checked={model.accepted}
        aria-invalid={model.attempted && !model.accepted}
        onChange={event => model.accept(event.target.checked)}
      />
      <span>
        {interpolate(
          translate('login.terms.agreement',
            'I have read and agree to the {{terms}} and the {{privacy}}.'),
          {
            terms: link(model.urls.terms, translate('login.terms.terms', 'Terms & Conditions')),
            privacy: link(model.urls.privacy, translate('login.terms.privacy', 'Privacy Policy')),
            cookies: model.urls.cookies != null
              ? link(model.urls.cookies, translate('login.terms.cookies', 'Cookie Policy'))
              : null,
          }
        )}
      </span>
    </label>
    {model.attempted && !model.accepted && <p role="alert" className="text-sm text-destructive">
      {translate('login.terms.required',
        'Please confirm the Terms & Conditions and the Privacy Policy to continue.')}
    </p>}
  </div>
}
