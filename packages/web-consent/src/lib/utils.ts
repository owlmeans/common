import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { ConsentLinkerOptions } from '@owlmeans/consent'
import type { WebConsentUtils } from './utils/types.js'

export const createWebConsentUtils = (): WebConsentUtils => {
  const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))

  const disclosedDomains = (linker: ConsentLinkerOptions | undefined): string[] => {
    const host = typeof location !== 'undefined' ? location.hostname : ''

    return [...new Set([host, ...(linker?.domains ?? [])].filter(domain => domain !== ''))]
  }

  return { cn, disclosedDomains }
}

export const webConsentUtils = createWebConsentUtils()
