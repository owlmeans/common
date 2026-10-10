import {
  AssigneeKind, AssigneeSchema, CommentSchema, CommentMentionSchema, FieldsInvalid, mentionHelper,
  PlanningForbidden, PlanningResourceKind, PlanningSchemaKind, PlanningUnsupported, PLANNING_PROJECT_TEAM,
  PLANNING_TEAM_MEMBER, TeamSchema, WorkcardConflict, WorkcardKind, WorkcardNotFound, validateHelper,
} from '@owlmeans/planning'
import type {
  Assignee, Comment, CommentMention, PlanningFacade, PlanningRecord, PlanningRecordStore,
  PlanningResourceFacade, RelationshipStore, Team,
} from '@owlmeans/planning'
import { recordQueryHelper, type Criteria } from '@owlmeans/resource'
import type { PlanningRuntime } from './types.js'
import { makePlanningHierarchy } from './hierarchy.js'

/** Versioned auxiliary resources, using the same scoped schema and relationship ports as cards. */
export const makeResourceFacade = (runtime: PlanningRuntime, facade: () => PlanningFacade): PlanningResourceFacade => {
  const scope = () => facade().scope
  const entityId = () => scope().entityId
  const now = runtime.options.now ?? (() => new Date().toISOString())
  const store = () => runtime.service().store()
  const unit = async <R>(run: () => Promise<R>): Promise<R> => store().unit == null ? await run() : await store().unit!(entityId(), run)
  const port = <R extends PlanningRecord>(name: 'assignees' | 'teams' | 'comments' | 'mentions'): PlanningRecordStore<R> => {
    const value = store()[name]
    if (value == null) throw new PlanningUnsupported(name)
    return value as unknown as PlanningRecordStore<R>
  }
  const links = (): RelationshipStore => {
    if (store().links == null) throw new PlanningUnsupported('links')
    return store().links!
  }
  const base = (): PlanningRecord => ({ entityId: entityId(), id: store().newId?.() ?? runtime.options.ids?.(), version: 1, createdAt: now() })
  const get = async <R extends PlanningRecord>(name: 'assignees' | 'teams' | 'comments' | 'mentions', id: string): Promise<R> => {
    const found = await port<R>(name).get(id, entityId())
    if (found == null || found.entityId !== entityId()) throw new WorkcardNotFound(`${name}:${id}`)
    return found
  }
  const check = (record: object, schema: object): void => {
    // The same record validator is used for both built-in durable providers.
    validateHelper.assertSchema(schema, record)
    if ('fields' in record) {
      const invalid = validateHelper.invalidFieldKeys(record.fields)
      if (invalid.length > 0) throw new FieldsInvalid(`keys:${invalid.join(',')}`)
    }
  }
  const assertVersion = (record: PlanningRecord, version: number): void => {
    if (record.version !== version) throw new WorkcardConflict(`${record.id}:version:${version}:stored:${record.version}`)
  }
  const list = async <R extends PlanningRecord>(name: 'assignees' | 'teams' | 'comments' | 'mentions', query?: object) => {
    const { page, size, sort, ids, authentication, nickname, ...where } = (query ?? {}) as Record<string, any>
    return await port<R>(name).list({ ...where, entityId: entityId(),
      ...(ids != null ? { id: { $in: ids } } : {}),
      ...(nickname != null ? { nicknameKey: mentionHelper.nicknameKey(nickname) } : {}),
      ...(authentication != null ? { 'authentication.provider': authentication.provider, 'authentication.externalId': authentication.externalId } : {}),
    } as Criteria<R>, { page, size, sort })
  }
  const validateAssignee = async (record: Assignee, creating: boolean): Promise<void> => {
    check(record, AssigneeSchema)
    const schemas = await runtime.schemasFor(entityId())
    const schema = schemas.assigneeType(record.type)
    if (creating && 'isRetired' in schemas && (schemas as any).isRetired(PlanningSchemaKind.AssigneeType, record.type)) {
      throw new FieldsInvalid(`assignee:retired-type:${record.type}`)
    }
    if (schema.kind !== record.kind) throw new FieldsInvalid(`assignee:kind:${record.kind}`)
    if ((schema.authentication === 'required' || (schema.authentication == null && record.kind === AssigneeKind.Human)) && record.authentication == null) {
      throw new FieldsInvalid('assignee:authentication-required')
    }
    const validate = schemas.assigneeValidator(record.type)
    if (!validate(record.fields)) throw new FieldsInvalid(validateHelper.ajvErrorText(validate.errors))
    const duplicate = await list<Assignee>('assignees', { nickname: record.nickname, size: 0 })
    if (duplicate.items.some(row => row.id !== record.id)) throw new WorkcardConflict(`assignee:nickname:${record.nickname}`)
    if (record.authentication != null) {
      const identity = await list<Assignee>('assignees', { authentication: record.authentication, size: 0 })
      if (identity.items.some(row => row.id !== record.id)) throw new WorkcardConflict('assignee:authentication-taken')
    }
  }
  const assertComment = async (record: Comment): Promise<void> => {
    await facade().cards.get(record.card)
    await get<Assignee>('assignees', record.author)
    check(record, CommentSchema)
    for (const id of mentionHelper.parse(record.body)) await get<Assignee>('assignees', id)
  }
  const assertCommentAuthor = (record: Comment): void => {
    if (scope().assigneeId == null || scope().assigneeId !== record.author) throw new PlanningForbidden('comment:author')
  }
  const teamLink = async (team: string, target: string, member: boolean, add: boolean): Promise<void> => {
    await get<Team>('teams', team)
    if (member) {
      const assignee = await get<Assignee>('assignees', target)
      if (add && assignee.retired) throw new FieldsInvalid(`assignee:retired:${target}`)
    } else {
      const project = await facade().cards.get(target)
      if (project.kind !== WorkcardKind.Project) throw new FieldsInvalid(`team:project:${target}`)
    }
    const edge = member
      ? { from: team, to: target, fromKind: PlanningResourceKind.Team, toKind: PlanningResourceKind.Assignee, type: PLANNING_TEAM_MEMBER }
      : { from: target, to: team, fromKind: PlanningResourceKind.Workcard, toKind: PlanningResourceKind.Team, type: PLANNING_PROJECT_TEAM, project: target }
    if (add) await links().put({ ...edge, entityId: entityId(), createdAt: now() })
    else await links().drop({ ...edge, entityId: entityId() })
  }
  const rebuild = async (id: string): Promise<CommentMention[]> => {
    const comment = await get<Comment>('comments', id)
    await facade().cards.get(comment.card)
    const existing = await list<CommentMention>('mentions', { comment: id, size: 0 })
    const wanted = mentionHelper.parse(comment.body)
    const rows: CommentMention[] = []
    for (const assignee of wanted) {
      await get<Assignee>('assignees', assignee)
      const previous = existing.items.find(row => row.assignee === assignee)
      if (previous?.revision === comment.version) { rows.push(previous); continue }
      const row: CommentMention = { ...(previous ?? base()), comment: id, card: comment.card, assignee,
        version: (previous?.version ?? 0) + 1, revision: comment.version }
      check(row, CommentMentionSchema)
      rows.push(await port<CommentMention>('mentions').put(row))
    }
    for (const row of existing.items) if (!wanted.includes(row.assignee)) await port<CommentMention>('mentions').drop(row.id!, entityId(), row.version)
    return rows
  }
  const resources: PlanningResourceFacade = {
    assignees: {
      get: async id => await get<Assignee>('assignees', id),
      load: async id => await port<Assignee>('assignees').get(id, entityId()),
      list: async query => await list<Assignee>('assignees', query),
      create: async draft => await unit(async () => {
        const record: Assignee = { ...base(), ...draft, nickname: draft.nickname.trim(), nicknameKey: mentionHelper.nicknameKey(draft.nickname), fields: draft.fields ?? {} }
        await validateAssignee(record, true)
        return await port<Assignee>('assignees').put(record)
      }),
      update: async (id, changes, opts) => await unit(async () => {
        const previous = await get<Assignee>('assignees', id)
        assertVersion(previous, opts.version)
        const record = { ...previous, ...changes, nicknameKey: mentionHelper.nicknameKey(changes.nickname ?? previous.nickname), version: previous.version + 1, updatedAt: now() }
        await validateAssignee(record, record.type !== previous.type)
        if (record.type !== previous.type) {
          const incoming = await links().list({ entityId: entityId(), to: id, toKind: PlanningResourceKind.Assignee }, { size: 0 })
          for (const edge of incoming.items) {
            if ((edge.fromKind ?? PlanningResourceKind.Workcard) !== PlanningResourceKind.Workcard) continue
            const card = await runtime.reader().cards.get(edge.from, entityId())
            if (card == null) continue
            const schemas = await runtime.schemasFor(entityId(), await makePlanningHierarchy(runtime).project(card))
            const rule = schemas.type(card.type).relationships?.find(rule => rule.name === edge.type)
            if (rule?.to != null && !rule.to.includes(record.type)) throw new FieldsInvalid(`assignee:type-in-use:${record.type}`)
          }
        }
        return await port<Assignee>('assignees').put(record)
      }),
      retire: async (id, opts) => await unit(async () => {
        const previous = await get<Assignee>('assignees', id)
        assertVersion(previous, opts.version)
        return await port<Assignee>('assignees').put({ ...previous, retired: true, version: previous.version + 1, updatedAt: now() })
      }),
    },
    teams: {
      get: async id => await get<Team>('teams', id),
      load: async id => await port<Team>('teams').get(id, entityId()),
      list: async query => await list<Team>('teams', query),
      create: async draft => await unit(async () => {
        const record: Team = { ...base(), ...draft, fields: draft.fields ?? {} }
        check(record, TeamSchema)
        return await port<Team>('teams').put(record)
      }),
      update: async (id, changes, opts) => await unit(async () => {
        const previous = await get<Team>('teams', id)
        assertVersion(previous, opts.version)
        const record = { ...previous, ...changes, version: previous.version + 1, updatedAt: now() }
        check(record, TeamSchema)
        return await port<Team>('teams').put(record)
      }),
      remove: async (id, opts) => await unit(async () => {
        const previous = await get<Team>('teams', id)
        assertVersion(previous, opts.version)
        if ((await links().list({ entityId: entityId(), to: id, toKind: PlanningResourceKind.Team }, { size: 1 })).total > 0) throw new WorkcardConflict(`team:in-use:${id}`)
        await links().drop({ entityId: entityId(), from: id, fromKind: PlanningResourceKind.Team })
        await port<Team>('teams').drop(id, entityId(), opts.version)
      }),
      members: async team => {
        await get<Team>('teams', team)
        const edges = await links().list({ entityId: entityId(), from: team, type: PLANNING_TEAM_MEMBER, fromKind: PlanningResourceKind.Team }, { size: 0 })
        return await Promise.all(edges.items.map(edge => get<Assignee>('assignees', edge.to)))
      },
      addMember: async (team, assignee) => await unit(async () => await teamLink(team, assignee, true, true)),
      removeMember: async (team, assignee) => await unit(async () => await teamLink(team, assignee, true, false)),
      attach: async (team, project) => await unit(async () => await teamLink(team, project, false, true)),
      detach: async (team, project) => await unit(async () => await teamLink(team, project, false, false)),
      projects: async team => {
        await get<Team>('teams', team)
        const edges = await links().list({ entityId: entityId(), to: team, type: PLANNING_PROJECT_TEAM, toKind: PlanningResourceKind.Team }, { size: 0 })
        const visible = await Promise.all(edges.items.map(async edge => await facade().cards.load(edge.from) != null ? edge.from : undefined))
        return visible.filter((id): id is string => id != null)
      },
      assignees: async project => {
        await facade().cards.get(project)
        const edges = await links().list({ entityId: entityId(), from: project, type: PLANNING_PROJECT_TEAM, toKind: PlanningResourceKind.Team }, { size: 0 })
        const members = (await Promise.all(edges.items.map(edge => resources.teams.members(edge.to)))).flat()
        return [...new Map(members.map(member => [member.id, member])).values()]
      },
    },
    comments: {
      get: async id => { const row = await get<Comment>('comments', id); await facade().cards.get(row.card); return row },
      load: async id => { const row = await port<Comment>('comments').get(id, entityId()); return row != null && await facade().cards.load(row.card) != null ? row : null },
      list: async query => {
        if (query?.card != null) await facade().cards.get(query.card)
        const result = await list<Comment>('comments', { ...query, size: 0 })
        const visible: Comment[] = []
        for (const row of result.items) if (await facade().cards.load(row.card) != null) visible.push(row)
        return recordQueryHelper.applyQuery(visible, undefined, query)
      },
      create: async draft => await unit(async () => {
        if (scope().assigneeId == null) throw new PlanningForbidden('comment:author-required')
        const record: Comment = { ...base(), card: draft.card, body: draft.body, author: scope().assigneeId! }
        await assertComment(record)
        const written = await port<Comment>('comments').put(record)
        await rebuild(written.id!)
        return written
      }),
      update: async (id, changes, opts) => await unit(async () => {
        const previous = await get<Comment>('comments', id)
        assertCommentAuthor(previous)
        assertVersion(previous, opts.version)
        const record = { ...previous, body: changes.body, version: previous.version + 1, updatedAt: now() }
        await assertComment(record)
        const written = await port<Comment>('comments').put(record)
        await rebuild(id)
        return written
      }),
      remove: async (id, opts) => await unit(async () => {
        const previous = await get<Comment>('comments', id)
        await facade().cards.get(previous.card)
        assertCommentAuthor(previous)
        assertVersion(previous, opts.version)
        const mentioned = await list<CommentMention>('mentions', { comment: id, size: 0 })
        for (const row of mentioned.items) await port<CommentMention>('mentions').drop(row.id!, entityId(), row.version)
        await port<Comment>('comments').drop(id, entityId(), opts.version)
      }),
    },
    mentions: {
      get: async id => {
        const row = await get<CommentMention>('mentions', id)
        const refreshed = await unit(async () => await rebuild(row.comment))
        const found = refreshed.find(mention => mention.id === id)
        if (found == null) throw new WorkcardNotFound(`mentions:${id}`)
        return found
      },
      load: async id => {
        try { return await resources.mentions.get(id) } catch (error) { if (error instanceof WorkcardNotFound) return null; throw error }
      },
      rebuild: async id => await unit(async () => await rebuild(id)),
      list: async query => {
        const comments = await resources.comments.list({ ...(query?.card != null ? { card: query.card } : {}), size: 0 })
        const rows: CommentMention[] = []
        for (const comment of comments.items) if (query?.comment == null || comment.id === query.comment) rows.push(...await unit(async () => await rebuild(comment.id!)))
        return recordQueryHelper.applyQuery(rows, { ...(query?.assignee != null ? { assignee: query.assignee } : {}) }, query)
      },
    },
  }
  return resources
}
