/**
 * The two values a confirmed and a refused question answer with.
 *
 * Mirrors `CONFIRM_YES` / `CONFIRM_NO` in `@owlmeans/llm-common` — the package that reads the
 * answer — value for value, and is deliberately a copy rather than an import: this package is
 * installed by developers to drive their own machine and must not carry the model runtime, which
 * is the same reason {@link ConnectInquiryKind} mirrors `InquiryKind`. The two must stay equal, or
 * a person's "yes" reaches the asker as a value it has never heard of.
 */
export const CONFIRM_YES = 'yes'

export const CONFIRM_NO = 'no'
