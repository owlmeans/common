import { describe, expect, test } from 'bun:test'
import {
  BotChatKind, BotPlatform, BotUpdateKind, botCommandHelper, botTextHelper, type BotMessageRef, type BotUpdate,
} from '../src/index.js'

const at = '2026-10-26T10:00:00.000Z'

describe('a normalized update, assembled the way a runtime does', () => {
  test('carries its command and a message ref that alone addresses the message; a handler matches the text itself', () => {
    const ref: BotMessageRef = { chat: 'ch-1', id: 'm-1', thread: 't-1', space: 'guild-9' }
    const text = '/report@ModBot RAID incoming'
    const update: BotUpdate = {
      id: 'u-1',
      connection: 'conn_1',
      scope: 'org-1',
      platform: BotPlatform.Discord,
      kind: BotUpdateKind.Command,
      chat: { id: 'ch-1', kind: BotChatKind.Group, space: 'guild-9' },
      sender: { id: 'user-5', username: 'member' },
      message: { ref, text, date: at },
      command: botCommandHelper.parse(text, 'ModBot') ?? undefined,
      addressed: true,
      receivedAt: at,
    }

    expect(update.command).toEqual({ name: 'report', args: 'RAID incoming' })
    expect(Object.keys(update)).not.toContain('matches')
    expect(botTextHelper.matched(update.message?.text ?? '', ['raid', 'spam'])).toEqual(['raid'])
    // A Discord timeout needs the guild: the reference carries it, so nothing else is consulted.
    expect(update.message?.ref).toEqual({ chat: 'ch-1', id: 'm-1', thread: 't-1', space: 'guild-9' })
  })
})
