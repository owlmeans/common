import { createIdOfLength, generateWordSlug, IdStyle, nextSlugCandidate } from '@owlmeans/basic-ids'
import { CODE_MAX, CODE_MINT_ATTEMPTS, CodeScope, CodeStyle, DEFAULT_CODE_LENGTH } from '../consts.js'
import { CodeTaken } from '../errors.js'
import type { CodePolicy, WorkcardDraft } from '../types.js'

export interface MintCodeOptions {
  /** Slug style: the text the slug is derived from (a title). A word slug when omitted. */
  seed?: string
  /** Sequential style: how many codes the scope already holds. */
  count?: number
}

/** `Some Title!` → `some-title`. */
export const slugOf = (text: string, max: number = CODE_MAX): string => text
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

/**
 * Mint a code under a policy, asking `taken` for each candidate.
 *
 * `random` draws `prefix + Base58(length)` (upper-cased when asked) afresh per attempt; `slug`
 * walks `base`, `base-2`, `base-3` from the seed (a word slug without one); `sequential` counts on
 * from `opts.count`, zero-padded to `length`. After `attempts` taken candidates it refuses.
 *
 * @throws {CodeTaken}
 */
export const mintCode = async (
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

/** Where a draft's code must be unique: its parent, or the whole entity. */
export const codeScopeOf = (policy: CodePolicy, draft: Pick<WorkcardDraft, 'parent'>): { parent?: string } =>
  policy.uniqueWithin === CodeScope.Parent ? { parent: draft.parent } : {}
