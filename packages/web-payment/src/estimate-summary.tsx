import { Fragment, useMemo } from 'react'
import { useI18nLib, useLanguage } from '@owlmeans/client-i18n'
import { COUNTRY_CODES, TaxEstimateStatus, estimateOf } from '@owlmeans/payment'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PriceEstimateControl } from './types.js'

const money = (minor: number, currency: string, locale: string): string => new Intl.NumberFormat(locale, {
  style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2,
}).format(minor / 100)

const localMoney = (amount: number, currency: string, locale: string): string => {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase() }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`
  }
}

/** The country names a `<Select>` offers, in the viewer's own language and alphabetical order. */
const useCountryOptions = (locale: string): Array<{ code: string, name: string }> => useMemo(() => {
  let names: Intl.DisplayNames | null = null
  try { names = new Intl.DisplayNames([locale], { type: 'region' }) } catch { names = null }
  const collator = new Intl.Collator(locale)
  return COUNTRY_CODES
    .map(code => ({ code, name: names?.of(code) ?? code }))
    .sort((a, b) => collator.compare(a.name, b.name))
}, [locale])

export interface CountrySelectProps {
  /** ISO 3166-1 alpha-2, or `''` for the placeholder. */
  value: string
  onChange: (country: string) => void
  /** Defaults to the `estimate.country` string (also the field's own label). */
  label?: string
  id?: string
  className?: string
}

/**
 * The billing-country picker alone — the piece `PriceEstimateSummary` composes for a single,
 * self-contained estimate, and what a shared picker (several estimates, one country — a plan
 * comparison table) renders once and drives every `usePriceEstimate({ country, onCountryChange })`
 * with. Country names are the viewer's own language, alphabetically ordered.
 */
export const CountrySelect = ({ value, onChange, label, id = 'price-estimate-country', className }: CountrySelectProps) => {
  const t = useI18nLib('web-payment', 'estimate')
  const [locale] = useLanguage()
  const countries = useCountryOptions(locale)
  const text = label ?? t('country')

  return <div className={cn('grid gap-2', className)}>
    <Label htmlFor={id}>{text}</Label>
    {/* Always controlled, `''` included (no `SelectItem` ever has that value) — switching to
        `undefined` once a country is chosen is what trips React's controlled/uncontrolled warning. */}
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={text}>
        <SelectValue placeholder={t('country-placeholder')} />
      </SelectTrigger>
      <SelectContent>
        {countries.map(({ code, name }) => <SelectItem key={code} value={code}>{name}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
}

export interface PriceEstimateAmountProps {
  control: Pick<PriceEstimateControl, 'estimate' | 'loading' | 'failed'>
  /** The amount to show tax and a total for — may differ from the estimate's own reference amount. */
  subtotalMinor: number
  currency: string
  /** Appended after the total row, e.g. `"/ month"`. */
  suffix?: string
  className?: string
}

/**
 * What Stripe Tax says at the estimate's country, with NO country picker of its own: the rate(s),
 * an estimated total, and one sentence for whichever status leaves no number to trust (reverse
 * charge, no tax, "at checkout", "choose a country"). Several of these may share one
 * `CountrySelect` (a plan comparison table).
 *
 * A country whose currency differs from `currency` (Adaptive Pricing found a rate) shows the tax
 * and the total in THAT currency instead, marked `≈` throughout — never both currencies at once,
 * which would read as two different prices for the same line. The rate percentage itself is
 * currency-agnostic and always shows as Stripe stated it.
 *
 * `data-price-estimate` / `data-status` are stable test hooks.
 */
export const PriceEstimateAmount = ({ control, subtotalMinor, currency, suffix, className }: PriceEstimateAmountProps) => {
  const t = useI18nLib('web-payment', 'estimate')
  const [locale] = useLanguage()
  const { estimate, loading, failed } = control

  const derived = estimate != null ? estimateOf(subtotalMinor, estimate) : null
  const status = estimate?.tax.status
  const numeric = status === TaxEstimateStatus.Taxed || status === TaxEstimateStatus.ReverseCharge
    || status === TaxEstimateStatus.None
  const rateLabel = estimate != null && estimate.tax.rates.length > 0
    ? estimate.tax.rates
      .map(rate => t('rate', { type: t(`tax-type.${rate.type}`), percentage: rate.percentage }))
      .join(' + ')
    : null

  const local = derived?.local
  const taxText = local != null
    ? (derived?.taxMinor != null ? localMoney(local.taxAmount, local.currency, locale) : null)
    : (derived?.taxMinor != null ? money(derived.taxMinor, currency, locale) : null)
  const totalText = local != null
    ? (derived?.totalMinor != null ? localMoney(local.totalAmount, local.currency, locale) : null)
    : (derived?.totalMinor != null ? money(derived.totalMinor, currency, locale) : null)
  const approx = local != null ? '≈ ' : ''

  return <div data-price-estimate="" data-status={status ?? 'pending'} className={cn('grid gap-1.5', className)}>
    {estimate == null && loading && <p className="text-muted-foreground text-xs">{t('loading')}</p>}
    {estimate == null && !loading && failed && <p className="text-destructive text-xs">{t('failed')}</p>}

    {estimate != null && <>
      {numeric && taxText != null && totalText != null && <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm" data-estimate-rows="">
        {status === TaxEstimateStatus.Taxed && rateLabel != null && <Fragment>
          <dt className="text-muted-foreground" data-estimate-rate="">{rateLabel}</dt>
          <dd data-estimate-tax="">{approx}{taxText}</dd>
        </Fragment>}
        <dt className="font-medium">{t('total')}</dt>
        <dd className="font-medium" data-estimate-total="">
          {approx}{totalText}{suffix != null ? ` ${suffix}` : ''}
        </dd>
      </dl>}
      {numeric && local != null && <p className="text-muted-foreground text-xs" data-estimate-converted="">
        {t('converted-note')}
      </p>}
      <p className="text-muted-foreground text-xs" data-estimate-status="">
        {t(`status.${status}`)}
      </p>
    </>}
  </div>
}

export interface PriceEstimateSummaryProps {
  control: PriceEstimateControl
  /** The amount the summary shows tax and a total for — may differ from the estimate's own reference amount. */
  subtotalMinor: number
  currency: string
  /** Appended after the total row, e.g. `"/ month"`. */
  suffix?: string
  className?: string
}

/**
 * A self-contained estimate: `CountrySelect` bound to the control's own `country`/`onCountryChange`,
 * plus `PriceEstimateAmount` beneath it. What a single estimate (the credit dialog) wants; several
 * estimates sharing one picker (a plan comparison table) compose the two pieces separately instead.
 */
export const PriceEstimateSummary = ({ control, subtotalMinor, currency, suffix, className }: PriceEstimateSummaryProps) => {
  const { country, onCountryChange } = control

  return <div className={cn('grid gap-3', className)}>
    <CountrySelect value={country} onChange={onCountryChange} />
    <PriceEstimateAmount control={control} subtotalMinor={subtotalMinor} currency={currency} suffix={suffix} />
  </div>
}
