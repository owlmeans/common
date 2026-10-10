import type { MentionHelper } from './types.local.js'

/** Stable-id Markdown mentions. Escaped display text cannot change the referenced identity. */
export const mentionHelper: MentionHelper = {
  encode: (id, nickname) => `[@${nickname.replace(/[\\\[\]]/g, '\\$&')}](assignee:${encodeURIComponent(id)})`,
  parse: body => [...new Set([...body.matchAll(/\[@(?:\\.|[^\]\\])*\]\(assignee:([^\s)]+)\)/g)]
    .flatMap(match => {
      try { return [decodeURIComponent(match[1])] } catch { return [] }
    }))],
  nicknameKey: nickname => nickname.normalize('NFKC').trim().toLocaleLowerCase('en-US'),
}
