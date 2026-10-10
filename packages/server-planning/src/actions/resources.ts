import { handlers } from '@owlmeans/server-api'
import { bind } from '@owlmeans/server-entrypoint'
import { FieldsInvalid, PlanningForbidden } from '@owlmeans/planning'
import type { AssigneeDraft, TeamDraft, CommentDraft, PlanningProtocols, PlanningResourceCommand, PlanningResourceReply } from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { guardHelper } from '../utils/guard.js'
import { planningHandlerOf } from '../utils/handler.js'
import { makePlanningAccessModel } from '../utils/access.js'
import { executionHelper } from './execution.js'

/** Dispatch the opt-in resources; attribution is taken only from the verified handler scope. */
export const servePlanningResources = (protocols: PlanningProtocols, opts?: PlanningHandlerOptions) =>
  (['assignees', 'teams', 'comments', 'mentions'] as const).flatMap(name => {
    const tree = protocols[name]
    if (tree == null) return []
    return [
      bind(tree.get, handlers<Context>().request(tree.get as any, async (req, ctx) => guardHelper.reply(async () => {
        const facade = await planningHandlerOf(ctx).handlerFacade(req, opts)
        return await facade[name].get((req.params as { id: string }).id)
      }))),
      bind(tree.list, handlers<Context>().request(tree.list as any, async (req, ctx) => guardHelper.reply(async () => {
        const facade = await planningHandlerOf(ctx).handlerFacade(req, opts)
        let query: unknown = {}
        try { query = JSON.parse((req.query as { query?: string })?.query ?? '{}') } catch { throw new FieldsInvalid('resource:query') }
        if (query == null || typeof query !== 'object' || Array.isArray(query)) throw new FieldsInvalid('resource:query')
        // entityId is never read from the wire; the scoped facade owns it.
        return await facade[name].list(query as never)
      }))),
      bind(tree.write, handlers<Context>().request(tree.write as any, async (req, ctx) => guardHelper.reply(async (): Promise<PlanningResourceReply> => {
        const { facade, access } = await planningHandlerOf(ctx).handlerScopeOf(req, opts)
        const body = req.body as PlanningResourceCommand
        const reading = ['members', 'projects', 'assignees'].includes(body.action)
        const id = (): string => { if (!body.id) throw new FieldsInvalid('resource:id'); return body.id }
        const version = (): { version: number } => {
          if (!Number.isSafeInteger(body.version) || body.version! < 1) throw new FieldsInvalid('resource:version')
          return { version: body.version! }
        }
        if (!reading && name === 'assignees') makePlanningAccessModel(access).assertGranted('manageAssignees')
        if (!reading && name === 'teams') makePlanningAccessModel(access).assertGranted('manageTeams')
        if (name === 'comments' || name === 'mentions') {
          const card = body.action === 'create' ? body.draft?.card : (await facade.comments.get(id())).card
          if (card == null) throw new FieldsInvalid('comment:card')
          await executionHelper.assertExecutionWrites(facade, { card, action: 'update' as any }, access)
        }
        if (name === 'teams' && ['attach', 'detach'].includes(body.action)) {
          if (!body.project) throw new FieldsInvalid('team:project')
          await executionHelper.assertExecutionWrites(facade, { card: body.project, action: 'update' as any }, access)
        }
        switch (name) {
          case 'assignees':
            if (body.action === 'create') return await facade.assignees.create(body.draft as AssigneeDraft)
            if (body.action === 'update') return await facade.assignees.update(id(), body.draft ?? {}, version())
            if (body.action === 'retire') return await facade.assignees.retire(id(), version())
            break
          case 'teams':
            if (body.action === 'create') return await facade.teams.create(body.draft as TeamDraft)
            if (body.action === 'update') return await facade.teams.update(id(), body.draft ?? {}, version())
            if (body.action === 'remove') { await facade.teams.remove(id(), version()); return null }
            if (body.action === 'members') return await facade.teams.members(id())
            if (body.action === 'projects') return await facade.teams.projects(id())
            if (body.action === 'assignees') return await facade.teams.assignees(id())
            if (body.action === 'addMember' || body.action === 'removeMember') {
              if (!body.assignee) throw new FieldsInvalid('team:assignee')
              await facade.teams[body.action](id(), body.assignee); return null
            }
            if (body.action === 'attach' || body.action === 'detach') { await facade.teams[body.action](id(), body.project!); return null }
            break
          case 'comments':
            if (body.action === 'create') return await facade.comments.create(body.draft as CommentDraft)
            if (body.action === 'update') return await facade.comments.update(id(), { body: body.draft?.body! }, version())
            if (body.action === 'remove') { await facade.comments.remove(id(), version()); return null }
            break
          case 'mentions':
            if (body.action === 'rebuild') return await facade.mentions.rebuild(id())
        }
        throw new PlanningForbidden(`resource:action:${name}:${body.action}`)
      }))),
    ]
  })
