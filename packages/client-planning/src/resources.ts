import type { BasicContext, BasicConfig } from '@owlmeans/context'
import { planningReplyHelper, PlanningUnsupported, WorkcardNotFound } from '@owlmeans/planning'
import type { Assignee, Team, Comment, CommentMention, PlanningResourceProtocols, PlanningProtocols, PlanningResourceCommand, PlanningResourceFacade, PlanningRecord, PlanningResourceReply } from '@owlmeans/planning'
import type { RemoteFacadeOptions } from './types.js'
import type { ListResult } from '@owlmeans/resource'
import { makePlanningClientLifecycle } from './lifecycle.js'

/** The same auxiliary facade in browsers and Node clients, with versioned stock state mirrors. */
export const makeRemoteResourceFacade = <C extends BasicConfig, T extends BasicContext<C>>(
  context: T, protocols: PlanningProtocols, opts: RemoteFacadeOptions
): PlanningResourceFacade => {
  const lifecycle = opts.lifecycle ?? makePlanningClientLifecycle({ scopeKey: opts.scopeKey })
  const tree = (name: 'assignees' | 'teams' | 'comments' | 'mentions') => {
    const value = protocols[name]
    if (value == null) throw new PlanningUnsupported(`client:${name}`)
    return value as unknown as PlanningResourceProtocols
  }
  const mirror = async (name: 'assignees' | 'teams' | 'comments' | 'mentions', row: PlanningRecord): Promise<void> => {
    const store = opts.stores?.()?.[name]
    if (store == null || row.id == null) return
    const known = await store.load(row.id)
    if (known == null || known.version <= row.version) await store.save(row as never)
  }
  const get = async (name: 'assignees' | 'teams' | 'comments' | 'mentions', id: string) => lifecycle.run(async operation => {
    const row = planningReplyHelper.hydrate<PlanningRecord>(await operation.wait(context.entrypoint(tree(name).get).call({ params: { id }, timeout: opts.timeout, signal: operation.signal })))
    await lifecycle.mutate(operation, async () => await mirror(name, row))
    return row
  })
  const load = async (name: 'assignees' | 'teams' | 'comments' | 'mentions', id: string) => {
    try { return await get(name, id) } catch (error) { if (error instanceof WorkcardNotFound) return null; throw error }
  }
  const list = async (name: 'assignees' | 'teams' | 'comments' | 'mentions', query?: object) => lifecycle.run(async operation => {
    const rows = planningReplyHelper.hydrate<ListResult<PlanningRecord>>(await operation.wait(context.entrypoint(tree(name).list).call({ query: { query: JSON.stringify(query ?? {}) }, timeout: opts.timeout, signal: operation.signal })))
    return rows
  })
  const write = async (name: 'assignees' | 'teams' | 'comments' | 'mentions', body: PlanningResourceCommand) => lifecycle.run(async operation => {
    const answer = planningReplyHelper.hydrate<PlanningResourceReply>(await operation.wait(context.entrypoint(tree(name).write).call({ body, timeout: opts.timeout, signal: operation.signal })))
    await lifecycle.mutate(operation, async () => {
      if (answer != null && !Array.isArray(answer)) await mirror(name, answer)
      if (name === 'mentions' && Array.isArray(answer)) for (const row of answer) if (typeof row !== 'string') await mirror(name, row)
      if (body.action === 'remove' && body.id != null) await opts.stores?.()?.[name].delete(body.id)
    })
    return answer
  })
  return {
    assignees: {
      get: async id => await get('assignees', id) as Assignee,
      load: async id => await load('assignees', id) as Assignee | null,
      list: async query => await list('assignees', query) as ListResult<Assignee>,
      create: async draft => await write('assignees', { action: 'create', draft }) as Assignee,
      update: async (id, draft, options) => await write('assignees', { action: 'update', id, draft, ...options }) as Assignee,
      retire: async (id, options) => await write('assignees', { action: 'retire', id, ...options }) as Assignee,
    },
    teams: {
      get: async id => await get('teams', id) as Team,
      load: async id => await load('teams', id) as Team | null,
      list: async query => await list('teams', query) as ListResult<Team>,
      create: async draft => await write('teams', { action: 'create', draft }) as Team,
      update: async (id, draft, options) => await write('teams', { action: 'update', id, draft, ...options }) as Team,
      remove: async (id, options) => { await write('teams', { action: 'remove', id, ...options }) },
      members: async id => await write('teams', { action: 'members', id }) as Assignee[],
      projects: async id => await write('teams', { action: 'projects', id }) as string[],
      assignees: async id => await write('teams', { action: 'assignees', id }) as Assignee[],
      addMember: async (id, assignee) => { await write('teams', { action: 'addMember', id, assignee }) },
      removeMember: async (id, assignee) => { await write('teams', { action: 'removeMember', id, assignee }) },
      attach: async (id, project) => { await write('teams', { action: 'attach', id, project }) },
      detach: async (id, project) => { await write('teams', { action: 'detach', id, project }) },
    },
    comments: {
      get: async id => await get('comments', id) as Comment,
      load: async id => await load('comments', id) as Comment | null,
      list: async query => await list('comments', query) as ListResult<Comment>,
      create: async draft => await write('comments', { action: 'create', draft }) as Comment,
      update: async (id, draft, options) => await write('comments', { action: 'update', id, draft, ...options }) as Comment,
      remove: async (id, options) => { await write('comments', { action: 'remove', id, ...options }) },
    },
    mentions: {
      get: async id => await get('mentions', id) as CommentMention,
      load: async id => await load('mentions', id) as CommentMention | null,
      list: async query => await list('mentions', query) as ListResult<CommentMention>,
      rebuild: async id => await write('mentions', { action: 'rebuild', id }) as CommentMention[],
    },
  }
}
