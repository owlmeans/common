import type { AmountInputHelper } from './amount/types.js'

export const createAmountInputHelper = (): AmountInputHelper => {
  const decimalSeparator = (locale: string): string => new Intl.NumberFormat(locale)
    .formatToParts(1.1).find(part => part.type === 'decimal')?.value ?? '.'

  const parseAmountMinor = (input: string, locale: string): number | null => {
    const separator = decimalSeparator(locale)
    let normalized = input.trim().replace(/[\s ]/g, '')
    if (separator === ',') normalized = normalized.replace(',', '.')
    else if (!normalized.includes('.') && normalized.includes(',')) normalized = normalized.replace(',', '.')
    if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null
    const [whole, decimal = ''] = normalized.split('.')
    const value = Number(whole) * 100 + Number(decimal.padEnd(2, '0'))
    return Number.isSafeInteger(value) ? value : null
  }

  const inputAmount = (amountMinor: number, locale: string): string => {
    const separator = decimalSeparator(locale)
    const whole = Math.floor(amountMinor / 100)
    const cents = String(amountMinor % 100).padStart(2, '0')
    return `${whole}${separator}${cents}`
  }

  return { decimalSeparator, parseAmountMinor, inputAmount }
}

export const amountInputHelper = createAmountInputHelper()
