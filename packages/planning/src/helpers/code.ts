import { createIdOfLength, generateWordSlug, IdStyle, nextSlugCandidate } from '@owlmeans/basic-ids'
import { CODE_MAX, CODE_MINT_ATTEMPTS, CodeScope, CodeStyle, DEFAULT_CODE_LENGTH } from '../consts.js'
import { CodeTaken } from '../errors.js'
import type { CodePolicy, WorkcardDraft } from '../types.js'
import type { CodeHelper, MintCodeOptions } from './code/types.js'

export const createCodeHelper = (): CodeHelper => {
  const slugOf = (text: string, max: number = CODE_MAX): string => text
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, max).replace(/-+$/g, '')

  const candidateOf = (policy: CodePolicy, attempt: number, base: string, opts?: MintCodeOptions): string => {
    const prefix = policy.prefix ?? ''
    switch (policy.style) {
      case CodeStyle.Slug:
        return `${prefix}${nextSlugCandidate(base, attempt + 1)}`
      case CodeStyle.Sequential: {
        const number = `${(opts?.count ?? 0) + attempt + 1}`
        return `${prefix}${policy.length != null ? number.padStart(policy.length, '0') : number}`
      }
      case CodeStyle.Random:
      default: {
        const random = createIdOfLength(policy.length ?? DEFAULT_CODE_LENGTH, IdStyle.Base58)
        return `${prefix}${policy.uppercase === true ? random.toUpperCase() : random}`
      }
    }
  }

  const mintCode = async (
    policy: CodePolicy,
    taken: (code: string) => boolean | Promise<boolean>,
    attempts: number = CODE_MINT_ATTEMPTS,
    opts?: MintCodeOptions
  ): Promise<string> => {
    const seeded = opts?.seed != null ? slugOf(opts.seed, CODE_MAX - (policy.prefix?.length ?? 0) - 4) : ''
    const base = policy.style === CodeStyle.Slug ? (seeded !== '' ? seeded : generateWordSlug()) : ''

    for (let attempt = 0; attempt < attempts; ++attempt) {
      const candidate = candidateOf(policy, attempt, base, opts)
      if (!await taken(candidate)) {
        return candidate
      }
    }

    throw new CodeTaken(`${policy.style}:${policy.prefix ?? ''}:${attempts}`)
  }

  const codeScopeOf = (policy: CodePolicy, draft: Pick<WorkcardDraft, 'parent'>): { parent?: string } =>
    policy.uniqueWithin === CodeScope.Parent ? { parent: draft.parent } : {}

  return { slugOf, mintCode, codeScopeOf }
}

export const codeHelper = createCodeHelper()

/** @deprecated compat:factory-refactor — use `codeHelper.slugOf(…)` */
export const slugOf = (text: string, max: number = CODE_MAX): string => codeHelper.slugOf(text, max)

/** @deprecated compat:factory-refactor — use `codeHelper.mintCode(…)` */
export const mintCode = async (
  policy: CodePolicy,
  taken: (code: string) => boolean | Promise<boolean>,
  attempts: number = CODE_MINT_ATTEMPTS,
  opts?: MintCodeOptions
): Promise<string> => await codeHelper.mintCode(policy, taken, attempts, opts)

/** @deprecated compat:factory-refactor — use `codeHelper.codeScopeOf(…)` */
export const codeScopeOf = (policy: CodePolicy, draft: Pick<WorkcardDraft, 'parent'>): { parent?: string } =>
  codeHelper.codeScopeOf(policy, draft)
