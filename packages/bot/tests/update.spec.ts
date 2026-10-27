import { describe, expect, test } from 'bun:test'
import {
  BotChatKind, BotMatchMode, BotPlatform, BotRuleAction, BotUpdateKind, botCommandHelper, botRuleHelper,
  type BotMessageRef, type BotRule, type BotUpdate,
} from '../src/index.js'

const at = '2026-10-26T10:00:00.000Z'

const rules: BotRule[] = [
  { id: 'r-other', scope: 'org-1', connection: 'conn_2', name: 'Other', keywords: ['raid'], mode: BotMatchMode.Word, action: BotRuleAction.Ban, enabled: true, order: 0, createdAt: at, updatedAt: at },
  { id: 'r-all', scope: 'org-1', connection: null, name: 'Raid', keywords: ['raid'], mode: BotMatchMode.Word, action: BotRuleAction.Mute, enabled: true, order: 1, createdAt: at, updatedAt: at },
]

describe('a normalized update, assembled the way a runtime does', () => {
  test('its matches come from the rules that apply to its connection, and its message ref alone addresses the message', () => {
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
      matches: botRuleHelper.match(text, rules.filter(rule => botRuleHelper.appliesTo(rule, 'conn_1'))),
      receivedAt: at,
    }

    expect(update.command).toEqual({ name: 'report', args: 'RAID incoming' })
    expect(update.matches.map(found => [found.rule.id, found.keywords])).toEqual([['r-all', ['raid']]])
    // A Discord timeout needs the guild: the reference carries it, so nothing else is consulted.
    expect(update.message?.ref).toEqual({ chat: 'ch-1', id: 'm-1', thread: 't-1', space: 'guild-9' })
  })
})
