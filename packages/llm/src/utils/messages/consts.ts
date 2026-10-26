/** Langchain's message types, as the roles a provider names them by. */
export const ROLE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  human: 'user',
  ai: 'assistant',
  generic: 'user',
})
