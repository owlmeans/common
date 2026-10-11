import type { ConnectAccessToken, ConnectPrivacyChoice } from '@owlmeans/viable-common'
import { INFERENCE_MODE_WORDS, INFERENCE_REACH, INTENT_REF_PARAM } from './consts.local.js'
import type { AccountHelper } from './account/types.js'

export const createAccountHelper = (): AccountHelper => {
  const day = (iso: string | undefined): string => iso != null ? iso.slice(0, 10) : 'never'

  const modeWords = (mode: string): string => INFERENCE_MODE_WORDS[mode] ?? mode

  const renderInference: AccountHelper['renderInference'] = (account, project) => [
    `your default: ${modeWords(account.llmMode)}`,
    ...(project != null
      ? [
        `project ${project.id}: ${project.settings.llmMode == null
          ? 'inherits your default' : `set to ${project.settings.llmMode}`}`
        + ` · effective: ${modeWords(project.settings.effective)}`,
      ]
      : []),
    account.canUseLocal || project?.settings.canUseLocal === true
      ? 'the plan allows the local mode'
      : 'the local mode needs a plan that includes it — cloud is the only choice here',
    INFERENCE_REACH,
    'next: set_inference_mode to change your default (level: account) or one project\'s (level: project,'
    + ' mode: inherit clears its override)',
  ].join('\n')

  const tokenLine = (token: ConnectAccessToken): string => [
    `- ${token.name} (${token.display}…) · id ${token.id}`,
    `created ${day(token.createdAt)}`,
    `last used ${day(token.lastUsedAt)}`,
    ...(token.expiresAt != null ? [`expires ${day(token.expiresAt)}`] : []),
    ...(token.oauth ? ['from a browser sign-in'] : []),
    ...(token.revokedAt != null ? [`REVOKED ${day(token.revokedAt)}`] : []),
  ].join(' · ')

  const renderTokens: AccountHelper['renderTokens'] = list => {
    const live = list.items.filter(token => token.revokedAt == null).length

    return list.items.length < 1
      ? 'You have no access tokens. One is created in the web application\'s Settings, or by signing a'
        + ' connector in through the browser.'
      : [
        `${list.items.length} access token(s), ${live} still valid:`,
        ...list.items.map(tokenLine),
        'next: revoke_access_token { tokenId, confirm: true } once the user agreed; a new token is created'
        + ' only in the web application\'s Settings.',
      ].join('\n')
  }

  const choiceLine = (choice: ConnectPrivacyChoice): string => {
    const answer = choice.status === 'new'
      ? 'never answered (not given)'
      : choice.status === 'revised'
        ? 'the wording changed since it was answered (not given until answered again)'
        : `${choice.granted ? 'given' : 'not given'} on ${day(choice.decidedAt)}`

    return `- ${choice.key} (${choice.group}, ${choice.mode}): ${answer}`
  }

  const renderPrivacy: AccountHelper['renderPrivacy'] = choices => choices.items.length < 1
    ? 'This account asks for no marketing consents.'
    : [
      'your marketing consents:',
      ...choices.items.map(choiceLine),
      'next: withdraw_marketing_consent { keys } (or all: true) to withdraw any; giving one is the'
      + ' user\'s own choice in the web application\'s Settings → Privacy choices.',
    ].join('\n')

  const intentRefOf: AccountHelper['intentRefOf'] = code => {
    if (typeof code !== 'string') return null
    const trimmed = code.trim()
    if (trimmed === '') return null
    // A hand-off address pasted whole (with or without its origin): its `ref` parameter is the code.
    const param = new RegExp(`[?&]${INTENT_REF_PARAM}=([^&#\\s]+)`).exec(trimmed)
    if (param != null) return param[1]!

    return trimmed.includes('/') ? null : trimmed
  }

  return { renderInference, renderTokens, renderPrivacy, intentRefOf }
}

export const accountHelper = createAccountHelper()
