import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * The class-name merger the components here are written against, exported so a replacement screen
 * built on `useEmailLogin()` need not declare its own copy. Not a re-export of the private
 * `src/@/lib/utils` — that tree is this package's own and is never exposed.
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))
