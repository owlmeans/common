import { isValidElement } from 'react'
import type { FC } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useI18nLib } from '@owlmeans/client-i18n'
import { useLoginMethods } from '@owlmeans/client-panel/auth'
import { loginAttemptError } from '@owlmeans/client-auth/login'
import type { LoginMethod, LoginScreenProps } from '@owlmeans/client-auth/login'
import { LoginMethodIcon } from './icons.js'
import { LoginTerms } from './terms.js'
import { LoginCredit } from './credit.js'

const VARIANT: Record<string, 'default' | 'outline' | 'link'> = {
  primary: 'default',
  secondary: 'outline',
  link: 'link',
}

/**
 * The sign-in screen: which identity provider, confirmed against which documents.
 *
 * It never starts anything by itself. Every flow leaves from a click — which is the requirement,
 * and also what makes framed sign-in work at all, because the window a framed application has to
 * open can only be opened inside a user gesture.
 *
 * Pure with respect to i18n: `translate` is a prop. {@link LocalizedLoginScreen} is the wrapper
 * that binds it to the app's own resources, so an application mounted without an i18n provider can
 * still render this one with a resolver of its own.
 */
export const LoginScreen: FC<LoginScreenProps> = props => {
  const t = props.translate ?? ((_key: string, defaultValue: string) => defaultValue)
  const model = useLoginMethods({
    ...(props.config != null ? { config: props.config } : {}),
    ...(props.terms !== undefined ? { terms: props.terms } : {}),
    ...(props.methods != null ? { methods: props.methods } : {}),
  })

  const Logo = props.Logo
  const attemptError = model.busy == null ? loginAttemptError(model.outcome) : null

  // The viewport height is set INLINE, and deliberately.
  //
  // A percentage minimum (`min-h-full`) resolves against a parent that has a height, and this
  // screen is rendered straight out of the dispatcher into whatever the app has around it — which
  // almost never carries one, so the box collapsed to its content and the card sat at the top of
  // an empty page. The fix is a viewport unit; the reason it is not a utility class is that this
  // package's classes reach a consuming app's stylesheet only through a `@source` scan of its
  // `src`, and a class NEW to that stylesheet is the one thing the scan can be stale about. Every
  // other utility here already exists in any app that renders anything; a missing `min-h-dvh`
  // rule, by contrast, is invisible — the screen looks nearly right and is silently uncentred.
  //
  // `props.style` still wins, because a class-based override no longer can.
  return <div
    data-login-screen
    style={{ minHeight: '100dvh', ...props.style }}
    className={cn('flex w-full items-center justify-center p-4', props.className)}
  >
    <Card className={cn('w-full max-w-sm', props.containerClassName)}>
      <CardHeader className="items-center gap-2 text-center">
        {Logo != null && <div className="flex justify-center pb-2">
          {isValidElement(Logo) ? Logo : typeof Logo === 'function'
            ? <Logo className="h-10 w-auto" /> : Logo}
        </div>}
        <CardTitle className="text-xl">{props.title ?? t('login.title', 'Sign in')}</CardTitle>
        <CardDescription>
          {props.subtitle ?? t('login.subtitle', 'Choose how you would like to continue.')}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {model.methods.length < 1
          ? <p role="status" className="text-sm text-muted-foreground text-center">
            {t('login.empty', 'No sign-in method is configured for this application.')}
          </p>
          : <div className="flex flex-col gap-2">
            {model.methods.map((method: LoginMethod) => <Button
              key={method.id}
              type="button"
              data-login-method={method.id}
              variant={VARIANT[method.emphasis ?? 'secondary'] ?? 'outline'}
              // `aria-disabled`, never `disabled`. A disabled button swallows the click, so a user
              // who has not confirmed the terms would press it and be told nothing at all — the
              // screen would simply seem broken. Blocking happens in the handler, which then says
              // why.
              aria-disabled={model.blocked}
              data-blocked={model.blocked ? 'true' : undefined}
              // `cursor-pointer` explicitly: this screen renders through the CONSUMER's vendored
              // `@/components/ui/button`, and an app whose shadcn copy predates the cursor rule
              // shows an arrow over the one control on the page. Stating it here makes the screen
              // behave the same whichever copy it lands on.
              className={cn(
                'w-full justify-center gap-2 cursor-pointer',
                model.blocked && 'opacity-60'
              )}
              autoFocus={method.id === model.primary?.id}
              onClick={() => model.select(method)}
            >
              {model.busy === method.id
                ? <Loader2 className="size-4 animate-spin" />
                : <LoginMethodIcon name={method.icon} className="size-4" />}
              {method.label ?? t(`login.method.${method.i18nKey ?? method.id}`, method.id)}
            </Button>)}
          </div>}

        {model.terms.required && <LoginTerms model={model.terms} translate={t} />}

        {/*
          A thrown message first, because it names the actual fault; otherwise whatever the
          finished outcome means for someone still looking at this screen. An attempt that ends
          without moving the document MUST say so — silence here reads as a dead button.
        */}
        {(model.error ?? attemptError) != null
          && <p role="alert" data-login-error className="text-sm text-destructive text-center">
            {model.error ?? t(attemptError as string, 'Sign-in did not complete. Please try again.')}
          </p>}
      </CardContent>

      <div className="px-6">
        {props.footer ?? <LoginCredit model={model.credit} translate={t} />}
      </div>
    </Card>
  </div>
}

/**
 * {@link LoginScreen} bound to the application's own translations.
 *
 * The split exists because the house rule is that a reusable component takes `translate` as a prop
 * and never reaches for a context — but the ordinary case is an app that has one, and making every
 * app write the resolver would guarantee some of them ship English.
 */
export const LocalizedLoginScreen: FC<LoginScreenProps> = props => {
  const t = useI18nLib('auth')

  return <LoginScreen
    {...props}
    translate={props.translate ?? ((key, defaultValue) => t(key, { defaultValue }))}
  />
}
