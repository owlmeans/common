import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * The class-name merger every component in this package is written against, exported so a
 * consuming application doesn't declare its own copy.
 *
 * This is deliberately NOT a re-export of `@/lib/utils`. That specifier is left verbatim in the
 * build and resolves to the CONSUMER's vendored file, so re-exporting it would hand an app back
 * its own function and fail outright wherever the `@` alias isn't configured. The vendored copy
 * under `src/@/lib/` stays exactly as shadcn emits it, because the package's own components must
 * keep resolving through the `@` contract.
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))
