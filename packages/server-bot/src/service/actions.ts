import {
  BOT_PLATFORMS, BotActionKind, BotChatKind, BotConnectionNotFound, botPlatformHelper, BotTransport,
  BotUnsupportedAction, type BotChatRef, type BotMessageRef, type BotUpdate,
} from '@owlmeans/bot'
import { BotConnectionDisabled } from '../errors.js'
import type { BotPlatformAction, BotPlatformActionResult, BotPlatformSession } from '../platforms/types.js'
import type {
  BotActionOptions, BotActionResult, BotActions, BotActionsTarget, BotConnectionRecord, BotMemberTarget, BotMuteOptions,
} from '../types.js'
import type { BotActionPlan, BotActionsPart, BotActivityPart, BotServiceParts, BotSessions } from './types.local.js'
import { refusalUtils } from '../utils/refusal.js'

/** An update, told apart from a message reference or a member target by what only an update carries. */
const isUpdate = (value: unknown): value is BotUpdate =>
  value != null && typeof value === 'object' && 'kind' in value && 'chat' in value && 'connection' in value
  && 'addressed' in value

export const makeBotActionsFactory = (
  parts: BotServiceParts, sessions: BotSessions, activity: BotActivityPart
): BotActionsPart => {
  const { store, registry, log } = parts

  const actionsOf = (
    record: BotConnectionRecord | null, scope: string, connection: string, bound?: BotUpdate
  ): BotActions => {
    const credentialsSet = record != null ? sessions.view(record).credentialsSet : []
    const plugin = record != null ? registry.get(record.platform) : null

    const supports = (kind: BotActionKind): boolean =>
      record != null && (kind === BotActionKind.Note || (plugin != null
        && botPlatformHelper.supports(record.platform, kind, credentialsSet)))

    const refusalOf = (plan: BotActionPlan): string | undefined => {
      if (record == null) {
        return new BotConnectionNotFound(connection).message
      }
      if (!record.enabled) {
        return new BotConnectionDisabled(connection).message
      }
      if (!supports(plan.kind)) {
        return new BotUnsupportedAction(plan.kind).message
      }

      return plan.invalid
    }

    const perform = async (plan: BotActionPlan): Promise<BotActionResult> => {
      let result: BotActionResult
      const platform = record?.platform ?? bound?.platform
      const refusal = refusalOf(plan)
      if (refusal != null) {
        result = { ok: false, ...refusalUtils.of(refusal, plan.kind, platform) }
      } else if (plan.action == null) {
        result = { ok: true }
      } else {
        try {
          const session: BotPlatformSession = sessions.session(record!)
          const done: BotPlatformActionResult = await plugin!.act(session, plan.action)
          result = { ok: true, ...(done.message != null ? { message: done.message } : {}) }
        } catch (error) {
          result = { ok: false, ...refusalUtils.of(error, plan.kind, platform) }
        }
      }
      if (platform != null) {
        await activity.record({
          scope: record?.scope ?? scope,
          connection,
          platform,
          update: plan.update ?? bound?.id ?? null,
          action: plan.kind,
          target: plan.target ?? null,
          text: plan.text ?? null,
          rule: plan.rule ?? null,
          ok: result.ok,
          error: result.error ?? null,
          code: result.code ?? null,
          transport: record?.transport ?? BotTransport.Live,
        })
      }
      const data = { connection, action: plan.kind, update: plan.update ?? bound?.id, ok: result.ok }
      if (result.ok) {
        log.debug('Bot action', data)
      } else {
        log.warn('Bot action failed', { ...data, code: result.code })
      }

      return result
    }

    const invalidText = (text: unknown): string | undefined =>
      typeof text !== 'string' || text.trim() === '' ? 'bot:invalid-action:empty-text' : undefined

    const refOf = (target: BotUpdate | BotMessageRef): BotMessageRef | null => {
      if (isUpdate(target)) {
        return target.message?.ref ?? null
      }

      return target != null && typeof target === 'object' && target.chat != null && target.id != null ? target : null
    }

    const updateIdOf = (target: unknown): string | undefined => isUpdate(target) ? target.id : undefined

    const memberOf = (target: BotMemberTarget): { chat: string, user: string, space?: string } | null => {
      if (isUpdate(target)) {
        return target.sender != null
          ? { chat: target.chat.id, user: target.sender.id, ...(target.chat.space != null ? { space: target.chat.space } : {}) }
          : null
      }
      if (target == null || typeof target !== 'object' || target.user == null || target.chat == null) {
        return null
      }
      const chat = typeof target.chat === 'string' ? target.chat : target.chat.id
      const space = target.space ?? (typeof target.chat === 'string' ? undefined : target.chat.space)

      return { chat, user: target.user, ...(space != null ? { space } : {}) }
    }

    const chatOf = (chat: BotChatRef | string): BotChatRef =>
      typeof chat === 'string' ? { id: chat, kind: BotChatKind.Group } : chat

    const messagePlan = (
      kind: BotActionKind, target: BotUpdate | BotMessageRef, opts: BotActionOptions | undefined,
      action: (ref: BotMessageRef) => BotPlatformAction, text?: string
    ): BotActionPlan => {
      const ref = refOf(target)
      const update = updateIdOf(target)
      const invalidBody = text !== undefined ? invalidText(text) : undefined

      return {
        kind,
        ...(ref != null ? { target: { chat: ref.chat, message: ref.id } } : {}),
        ...(text !== undefined ? { text } : {}),
        ...(update != null ? { update } : {}),
        ...(opts?.rule != null ? { rule: opts.rule } : {}),
        ...(ref == null ? { invalid: 'bot:invalid-action:no-message' } : invalidBody != null ? { invalid: invalidBody } : {}),
        ...(ref != null ? { action: action(ref) } : {}),
      }
    }

    const memberPlan = (
      kind: BotActionKind, target: BotMemberTarget, opts: BotActionOptions | undefined,
      action: (member: { chat: string, user: string, space?: string }) => BotPlatformAction, invalid?: string
    ): BotActionPlan => {
      const member = memberOf(target)
      const update = updateIdOf(target)

      return {
        kind,
        ...(member != null ? { target: { chat: member.chat, user: member.user } } : {}),
        ...(update != null ? { update } : {}),
        ...(opts?.rule != null ? { rule: opts.rule } : {}),
        ...(member == null ? { invalid: 'bot:invalid-action:no-member' } : invalid != null ? { invalid } : {}),
        ...(member != null ? { action: action(member) } : {}),
      }
    }

    const reply: BotActions['reply'] = async (to, text, opts) => await perform(messagePlan(
      BotActionKind.Reply, to, opts, ref => ({ kind: BotActionKind.Reply, to: ref, text }), text
    ))

    const send: BotActions['send'] = async (chat, text, opts) => {
      const target = chatOf(chat)
      const invalid = target?.id == null || target.id === '' ? 'bot:invalid-action:no-chat' : invalidText(text)

      return await perform({
        kind: BotActionKind.Send,
        target: { chat: `${target?.id ?? ''}` },
        text,
        ...(opts?.rule != null ? { rule: opts.rule } : {}),
        ...(invalid != null ? { invalid } : {}),
        action: { kind: BotActionKind.Send, chat: target, text },
      })
    }

    const remove: BotActions['delete'] = async (target, opts) => await perform(messagePlan(
      BotActionKind.Delete, target, opts, ref => ({ kind: BotActionKind.Delete, message: ref })
    ))

    const mute: BotActions['mute'] = async (target, opts: BotMuteOptions) => {
      const minutes = Number(opts?.minutes)
      const valid = Number.isFinite(minutes) && minutes >= 1
      const until = new Date(parts.now().getTime() + (valid ? minutes : 1) * 60_000)

      return await perform(memberPlan(BotActionKind.Mute, target, opts, member => ({
        kind: BotActionKind.Mute, ...member, until,
      }), valid ? undefined : 'bot:invalid-action:minutes'))
    }

    const ban: BotActions['ban'] = async (target, opts) => await perform(memberPlan(
      BotActionKind.Ban, target, opts, member => ({ kind: BotActionKind.Ban, ...member })
    ))

    const react: BotActions['react'] = async (target, emoji, opts) => {
      const plan = messagePlan(BotActionKind.React, target, opts, ref => ({ kind: BotActionKind.React, message: ref, emoji }))
      const invalid = plan.invalid ?? (typeof emoji !== 'string' || emoji.trim() === '' ? 'bot:invalid-action:no-emoji' : undefined)

      return await perform({ ...plan, text: emoji, ...(invalid != null ? { invalid } : {}) })
    }

    const note: BotActions['note'] = async (update, text, opts) => await perform({
      kind: BotActionKind.Note,
      ...(isUpdate(update) ? { target: { chat: update.chat.id, ...(update.message != null ? { message: update.message.ref.id } : {}) }, update: update.id } : {}),
      text,
      ...(opts?.rule != null ? { rule: opts.rule } : {}),
      ...(invalidText(text) != null ? { invalid: invalidText(text) } : {}),
    })

    return { supports, reply, send, delete: remove, mute, ban, react, note }
  }

  const actions = async (target: BotActionsTarget): Promise<BotActions> => {
    const bound = isUpdate(target) ? target : undefined
    let record: BotConnectionRecord | null = null
    try {
      const found = await store.connections().load(target.connection)
      record = found != null && found.scope === target.scope ? found : null
    } catch (error) {
      log.error('Bot connection not read for actions', { connection: target.connection, error })
    }
    if (record != null && BOT_PLATFORMS[record.platform] == null) {
      record = null
    }

    return actionsOf(record, target.scope, target.connection, bound)
  }

  return { actions, actionsOf }
}
