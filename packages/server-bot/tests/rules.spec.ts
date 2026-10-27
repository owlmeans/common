import { describe, expect, test } from 'bun:test'
import { BotConnectionNotFound, BotMatchMode, BotPlatform, BotRuleAction, BotTransport } from '@owlmeans/bot'
import { BotRuleInvalid, BotRuleNotFound } from '../src/errors.js'
import { makeTestBot, scopeOf } from './context.js'

describe('@owlmeans/server-bot — rules', () => {
  test('save, list by order, update in place and remove', async () => {
    const { service } = makeTestBot()
    const scope = scopeOf()

    const spam = await service.rules.save(scope, { name: 'Spam', keywords: ['casino', ' Casino', 'free  money'], action: BotRuleAction.Delete })
    const hours = await service.rules.save(scope, {
      name: 'Hours', keywords: ['open'], mode: BotMatchMode.Contains, action: BotRuleAction.Reply, reply: 'Nine to five', order: -1,
    })
    expect(spam).toMatchObject({ keywords: ['casino', 'free money'], mode: BotMatchMode.Word, enabled: true, order: 0, connection: null })
    expect((await service.rules.list(scope)).map(rule => rule.name)).toEqual(['Hours', 'Spam'])

    const edited = await service.rules.save(scope, { id: hours.id, name: 'Opening hours', keywords: ['open'], action: BotRuleAction.Reply })
    expect([edited.id, edited.name, edited.reply, edited.order, edited.createdAt]).toEqual(
      [hours.id, 'Opening hours', 'Nine to five', -1, hours.createdAt]
    )
    expect(await service.rules.remove(scope, spam.id)).toEqual({ id: spam.id })
    expect((await service.rules.list(scope)).map(rule => rule.id)).toEqual([hours.id])
  })

  test('a connection\'s list holds its own rules and the scope-wide ones', async () => {
    const { service } = makeTestBot()
    const scope = scopeOf()
    const first = await service.connections.save(scope, { platform: BotPlatform.Telegram, label: 'A', transport: BotTransport.Mock })
    const second = await service.connections.save(scope, { platform: BotPlatform.Telegram, label: 'B', transport: BotTransport.Mock })
    await service.rules.save(scope, { name: 'Own', connection: first.id, keywords: ['x'], action: BotRuleAction.Warn })
    await service.rules.save(scope, { name: 'Wide', keywords: ['y'], action: BotRuleAction.Warn })

    expect((await service.rules.list(scope, first.id)).map(rule => rule.name)).toEqual(['Own', 'Wide'])
    expect((await service.rules.list(scope, second.id)).map(rule => rule.name)).toEqual(['Wide'])
  })

  test('refusals: another scope\'s rule or connection, no keyword left', async () => {
    const { service } = makeTestBot()
    const [mine, theirs] = [scopeOf(), scopeOf()]
    const rule = await service.rules.save(mine, { name: 'Mine', keywords: ['k'], action: BotRuleAction.Ban })
    const connection = await service.connections.save(theirs, { platform: BotPlatform.Telegram, label: 'T', transport: BotTransport.Mock })

    await expect(service.rules.save(theirs, { id: rule.id, name: 'Taken', keywords: ['k'], action: BotRuleAction.Ban }))
      .rejects.toBeInstanceOf(BotRuleNotFound)
    await expect(service.rules.remove(theirs, rule.id)).rejects.toBeInstanceOf(BotRuleNotFound)
    expect(await service.rules.list(theirs)).toEqual([])
    await expect(service.rules.save(mine, { name: 'Bad', connection: connection.id, keywords: ['k'], action: BotRuleAction.Ban }))
      .rejects.toBeInstanceOf(BotConnectionNotFound)
    await expect(service.rules.save(mine, { name: 'Empty', keywords: ['  '], action: BotRuleAction.Ban }))
      .rejects.toBeInstanceOf(BotRuleInvalid)
  })
})
