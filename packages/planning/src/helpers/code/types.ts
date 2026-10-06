import type { CodePolicy, WorkcardDraft } from '../../types.js'

export interface MintCodeOptions {
  /** Slug style: the text the slug is derived from (a title). A word slug when omitted. */
  seed?: string
  /** Sequential style: how many codes the scope already holds. */
  count?: number
}

/** A card's human code: minted under the type's policy, unique within its scope. */
export interface CodeHelper {
  /** `Some Title!` → `some-title`. */
  slugOf: (text: string, max?: number) => string
  /**
   * Mint a code under a policy, asking `taken` for each candidate.
   *
   * `random` draws `prefix + Base58(length)` (upper-cased when asked) afresh per attempt; `slug`
   * walks `base`, `base-2`, `base-3` from the seed (a word slug without one); `sequential` counts on
   * from `opts.count`, zero-padded to `length`. After `attempts` taken candidates it refuses.
   *
   * @throws {CodeTaken}
   */
  mintCode: (
    policy: CodePolicy,
    taken: (code: string) => boolean | Promise<boolean>,
    attempts?: number,
    opts?: MintCodeOptions
  ) => Promise<string>
  /** Where a draft's code must be unique: its parent, or the whole entity. */
  codeScopeOf: (policy: CodePolicy, draft: Pick<WorkcardDraft, 'parent'>) => { parent?: string }
}
