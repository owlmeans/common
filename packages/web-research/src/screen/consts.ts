/** What made the deterministic signal pass flag a text as a possible instruction to the agents reading it. */
export enum InjectionSignalKind {
  /** Zero-width or tag characters — text nobody sees. */
  Invisible = 'invisible',
  /** Bidirectional overrides and isolates — text that reads differently than it is stored. */
  Bidi = 'bidi',
  /** Prose inside an html / markdown comment. */
  HiddenComment = 'hidden-comment',
  /** Prose inside an element hidden by its attributes or style. */
  HiddenElement = 'hidden-element',
  /** Text a document format hides from its reader (a Word run marked hidden, white on white). */
  HiddenRun = 'hidden-run',
  /** Text addressed to an AI, an assistant, an LLM or an agent. */
  AddressedToAi = 'addressed-to-ai',
  /** An "ignore previous instructions"-style order. */
  Override = 'override',
}

/** Characters nobody sees: zero-width space / non-joiner, word joiner and invisible operators, a stray BOM. */
export const INVISIBLE_CHARS = /[\u200B\u200C\u2060-\u2064\uFEFF\u180E]/g

/** Unicode tag characters (U+E0000–U+E007F) — "ASCII smuggling": a whole sentence no font draws. */
export const TAG_CHARS = /[\u{E0000}-\u{E007F}]/gu

/** One tag character, for a test (no `g`: a global pattern keeps state between tests). */
export const TAG_CHAR = /[\u{E0000}-\u{E007F}]/u

/** Bidirectional embeddings, overrides and isolates. */
export const BIDI_CHARS = /[\u202A-\u202E\u2066-\u2069]/g

/** How many plain invisible characters are noise (an emoji sequence, a pasted BOM) rather than a signal. */
export const INVISIBLE_NOISE = 2

/** Html comments and the markdown comment idioms (`[//]: # (…)`, `[comment]: <> (…)`). */
export const HIDDEN_COMMENTS: readonly RegExp[] = [
  /<!--([\s\S]*?)-->/g,
  /^\s*\[(?:\/\/|comment|_)\]:\s*(?:#|<>)\s*[("'](.*)[)"']\s*$/gim,
]

/** An element hidden from the page: the `hidden` attribute, `aria-hidden`, or a style that draws nothing. */
export const HIDDEN_ELEMENT = /<([a-z][\w-]*)\b[^>]*(?:\bhidden\b(?!\s*=\s*["']?false)|aria-hidden\s*=\s*["']?true|style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:px|pt|em|rem)?\s*[;"']|opacity\s*:\s*0(?:\.0+)?\s*[;"']|color\s*:\s*(?:#fff(?:fff)?|white|transparent)\b)[^"']*["'])[^>]*>([\s\S]*?)<\/\1>/gi

/** How many words of prose make a hidden comment or element a signal; a section marker has one or two. */
export const HIDDEN_PROSE_WORDS = 6

/** Text addressed to a model — not a mention of AI as a product feature. */
export const ADDRESSED_TO_AI: readonly RegExp[] = [
  /\b(?:to|for|attention|dear|hey|hi|note to)\s*,?\s+(?:any|all|every|the)?\s*(?:ai|a\.i\.|llm|llms|language models?|chat\s?bots?|assistants?|ai assistants?|ai agents?|coding agents?|agents?|models?|chatgpt|gpt|claude|gemini|copilot)\b[^.\n]{0,40}(?:reading|processing|parsing|that reads|who reads|:|,)/gi,
  /\bif you are (?:an?|the)\s+(?:ai|a\.i\.|llm|large language model|language model|assistant|ai assistant|agent|ai agent|model|chatbot)\b/gi,
  /\b(?:ai|llm|assistant|agent|model)s?\s*[:,]\s*(?:you must|you should|please|ignore|disregard|rename|answer|respond|reply|output|say|do not|don't|never|always)\b/gi,
  /\bas an? (?:ai|llm|language model|assistant),?\s+you\b/gi,
]

/** Orders that try to replace the instructions a model runs under. */
export const OVERRIDES: readonly RegExp[] = [
  /\b(?:ignore|disregard|forget|override|bypass|skip)\s+(?:all\s+|any\s+|the\s+|your\s+|every\s+)*(?:previous|prior|above|earlier|preceding|original|existing|system|other)\s+(?:instructions?|prompts?|directions?|rules?|guidelines?|messages?|context)\b/gi,
  /\b(?:new|updated|real|actual|hidden)\s+(?:system\s+)?instructions?\s*:/gi,
  /\byou are now\s+(?:an?|the|in)\b/gi,
  /\b(?:system prompt|developer message|jailbreak)\b/gi,
  /\b(?:answer|respond|reply)\s+only\s+with\b/gi,
  /\b(?:do not|don't|never)\s+(?:tell|inform|reveal to|mention (?:this|it) to)\s+(?:the\s+)?(?:user|person|human|customer|developer)s?\b/gi,
]

/** What an html text loses before the pass with `kind: html` — no reader of the page sees these. */
export const HTML_INERT_BLOCKS: readonly RegExp[] = [
  /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
  /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,
  /<template\b[^>]*>[\s\S]*?<\/template\s*>/gi,
]

/** The most characters of an excerpt kept per signal, and the most signals shown to a judge. */
export const SIGNAL_EXCERPT_CHARS = 240
export const SIGNALS_SHOWN = 12

/**
 * The signals that drop a source when no judge is wired: an order to replace the instructions, or text
 * addressed to the AI reading it. Every other signal is weak on the web (hidden menus, comments,
 * zero-width spaces) — such a source is kept and noted.
 */
export const STRONG_SIGNAL_KINDS: readonly InjectionSignalKind[] = Object.freeze([
  InjectionSignalKind.Override, InjectionSignalKind.AddressedToAi,
])
