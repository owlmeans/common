
import { connectRef, type ConnectActivityQuery, type ConnectFeedQuery, type ConnectLlm, type ConnectProjectSettings, type ConnectAgentLock, type ConnectConfigSaveBody, type ConnectConfigScope, type ConnectOrganizationBrandingSave, type ConnectFileContent, type ConnectFileMetaQuery, type ConnectFileWritten, type ConnectSlotView, type ConnectConvertCreateBody, type ConnectConvertProceedBody, type ConnectConvertStartBody, type ConnectKitApplyBody, type ConnectKitApplyResult, type ConnectKitDescribe, type ConnectOp, type ConnectOpResult, type ConnectOpSubmission, type ConnectPipelineState, type ConnectProjectBranding, type ConnectProjectBrandingSave, type ConnectProjectStatus, type ConnectProjectSummary, type ConnectSessionView, type ConnectStoryStatus, type ConnectTarget, type ConversionStatusView, type ConvertCheck, type InquiryAnswerPayload } from '@owlmeans/viable-common'
import { TOOL_DEADLINE_MS } from '../consts.js'
import type { ConnectorApi, OpenSessionArgs, ProjectEdits } from '../types.js'
import type { Ctx } from './types.local.js'
import type { RemoteConnectorOptions } from './types.js'
import { planningContextOf } from '@owlmeans/client-planning'

/**
 * The connector API over HTTP.
 *
 * Every call is bounded by the tool deadline rather than left to the transport's own default: a
 * tool that outlives its host's ceiling is reported to the user as a broken server, and the true
 * answer — the platform was slow — never reaches them. Long work returns its current domain status.
 * In the delegated mode a write may wait on a model call the connector's own parent performs; the
 * context's transport names it and collects an early `{ pending }` answer, so the deadline bounds
 * each request and collect hop, never the call (and its tool answers before the call ends: the
 * handover).
 *
 * `planning` is the facade `makeSdkContext` registered with `appendPlanningClient`: its reads and
 * its execute POST carry the same tool deadline, and a commit is awaited by long polls whose HTTP
 * deadline outlasts their own hold by ten seconds. Its scope is empty on purpose — the platform
 * reads the organization and the profile from the token.
 */
export const makeRemoteConnectorApi = (context: Ctx, opts: RemoteConnectorOptions = {}): ConnectorApi => {
  const timeout = opts.timeout ?? TOOL_DEADLINE_MS
  // A scope crosses only when one is named: absent is the preview's set, and the query is a closed shape.
  const scopeOf = (scope?: ConnectConfigScope): { scope?: ConnectConfigScope } => scope != null ? { scope } : {}
  // A feed read crosses only what it names (the query is a closed shape), and a held read gets ten
  // seconds beyond its own wait — or every quiet poll would read as a dropped line.
  const feedQueryOf = (query: ConnectActivityQuery = {}): ConnectActivityQuery => ({
    ...(query.after != null ? { after: query.after } : {}),
    ...(query.limit != null ? { limit: query.limit } : {}),
    ...(query.wait != null ? { wait: query.wait } : {}),
    ...(query.detail != null ? { detail: query.detail } : {}),
  })
  const feedTimeout = (query: ConnectFeedQuery = {}): number => Math.max(timeout, ((query.wait ?? 0) + 10) * 1000)

  return {
    openSession: async (args: OpenSessionArgs): Promise<ConnectSessionView> => {
      const { llm, ...body } = args
      // Which route is called fixes the mode: the delegated one carries the entitlement gate.
      return await context.entrypoint(llm === 'local'
        ? connectRef.session.openDelegated : connectRef.session.open
      ).call({ body, timeout: TOOL_DEADLINE_MS })
    },

    closeSession: async sessionId => {
      await context.entrypoint(connectRef.session.close).call({
        params: { sessionId }, timeout: TOOL_DEADLINE_MS,
      })
    },

    pullOps: async (sessionId, waitSec): Promise<ConnectOp[]> => await context.entrypoint(connectRef.op.pull).call({
      params: { sessionId },
      query: { wait: waitSec },
      // The long poll holds the response open on purpose; it must outlast its own wait.
      timeout: (waitSec + 10) * 1000,
    }),

    submitOp: async (sessionId, result: ConnectOpResult): Promise<ConnectOpSubmission> => await context
      .entrypoint(connectRef.op.submit).call({
      params: { sessionId, opId: result.opId }, body: result,
      timeout: TOOL_DEADLINE_MS,
    }),

    project: {
      create: async (prompt: string, target?: ConnectTarget, sessionId?: string) =>
        await context.entrypoint(connectRef.project.create).call({
          body: { prompt, ...(target != null ? { target } : {}), ...(sessionId != null ? { sessionId } : {}) },
          timeout,
        }),
      confirm: async (id: string, edits: ProjectEdits) =>
        await context.entrypoint(connectRef.project.confirm).call({
          params: { id }, body: edits, timeout,
        }),
      list: async () => await context.entrypoint(connectRef.project.list).call({ timeout }),
      status: async (id: string): Promise<ConnectProjectStatus> => await context
        .entrypoint(connectRef.project.status).call({ params: { id }, timeout }),
      attach: async args => await context.entrypoint(connectRef.project.attach).call({
        body: args, timeout,
      }),
      reinit: async (id: string): Promise<ConnectProjectStatus> => await context
        .entrypoint(connectRef.project.reinit).call({ params: { id }, timeout }),
      modify: async (id: string, prompt: string) =>
        await context.entrypoint(connectRef.project.modify).call({
          params: { id }, body: { prompt }, timeout,
        }),
      rename: async (id: string, name: string, description?: string) =>
        await context.entrypoint(connectRef.project.rename).call({
          params: { id }, body: { name, ...(description != null ? { description } : {}) }, timeout,
        }),
      kitDescribe: async (id: string): Promise<ConnectKitDescribe> => await context
        .entrypoint(connectRef.project.kit.describe).call({ params: { id }, timeout }),
      kitApply: async (id: string, body: ConnectKitApplyBody): Promise<ConnectKitApplyResult> =>
        await context.entrypoint(connectRef.project.kit.apply).call({
          params: { id }, body, timeout,
        }),
      destroy: async (id: string): Promise<ConnectProjectSummary> => await context
        .entrypoint(connectRef.project.destroy).call({ params: { id }, timeout }),
      unlock: async (id: string): Promise<ConnectAgentLock> => await context
        .entrypoint(connectRef.project.unlock).call({ params: { id }, timeout }),
      activity: async (id: string, query?: ConnectActivityQuery) => await context
        .entrypoint(connectRef.project.activity).call({ params: { id }, query: feedQueryOf(query), timeout: feedTimeout(query) }),
      llm: async (id: string): Promise<ConnectProjectSettings> => await context
        .entrypoint(connectRef.project.llm.get).call({ params: { id }, timeout }),
      // `null` crosses as `null`: it is the value that unsets the override, not an omission.
      setLlm: async (id: string, llmMode: ConnectLlm | null): Promise<ConnectProjectSettings> => await context
        .entrypoint(connectRef.project.llm.set).call({ params: { id }, body: { llmMode }, timeout }),
    },

    projectBranding: async (id: string, scope?: ConnectConfigScope): Promise<ConnectProjectBranding> => await context
      .entrypoint(connectRef.project.branding.get).call({ params: { id }, query: scopeOf(scope), timeout }),
    // Only the fields the caller named cross the wire: the platform merges the patch over what it
    // stores, so a key sent empty would be a change rather than an omission.
    saveProjectBranding: async (id: string, patch: ConnectProjectBrandingSave, scope?: ConnectConfigScope): Promise<ConnectProjectBranding> =>
      await context.entrypoint(connectRef.project.branding.save).call({
        params: { id }, query: scopeOf(scope), body: patch, timeout,
      }),
    setPlatformCredit: async (id: string, hidden: boolean, scope?: ConnectConfigScope): Promise<ConnectProjectBranding> =>
      await context.entrypoint(connectRef.project.branding.credit).call({
        params: { id }, query: scopeOf(scope), body: { hideCredit: hidden }, timeout,
      }),
    copyOrganizationBranding: async (id: string, scope?: ConnectConfigScope): Promise<ConnectProjectBranding> => await context
      .entrypoint(connectRef.project.branding.copyDefaults).call({ params: { id }, query: scopeOf(scope), timeout }),

    config: {
      get: async (id: string, scope?: ConnectConfigScope) => await context
        .entrypoint(connectRef.config.get).call({ params: { id }, query: scopeOf(scope), timeout }),
      save: async (id: string, body: ConnectConfigSaveBody, scope?: ConnectConfigScope) => await context
        .entrypoint(connectRef.config.save).call({ params: { id }, query: scopeOf(scope), body, timeout }),
      recollect: async (id: string) => await context
        .entrypoint(connectRef.config.recollect).call({ params: { id }, timeout }),
    },

    account: {
      branding: {
        get: async () => await context.entrypoint(connectRef.account.branding.get).call({ timeout }),
        save: async (patch: ConnectOrganizationBrandingSave) => await context
          .entrypoint(connectRef.account.branding.save).call({ body: patch, timeout }),
        backfill: async () => await context.entrypoint(connectRef.account.branding.backfill).call({ timeout }),
      },
      llm: {
        get: async () => await context.entrypoint(connectRef.account.llm.get).call({ timeout }),
        set: async (llmMode: ConnectLlm) => await context
          .entrypoint(connectRef.account.llm.set).call({ body: { llmMode }, timeout }),
      },
      tokens: {
        list: async () => await context.entrypoint(connectRef.account.tokens.list).call({ timeout }),
        revoke: async (id: string) => await context
          .entrypoint(connectRef.account.tokens.revoke).call({ params: { id }, timeout }),
      },
      privacy: {
        status: async () => await context.entrypoint(connectRef.account.privacy.status).call({ timeout }),
        withdraw: async (keys: string[]) => await context
          .entrypoint(connectRef.account.privacy.withdraw).call({ body: { keys }, timeout }),
      },
      intent: {
        pickup: async (ref: string) => await context
          .entrypoint(connectRef.account.intent.pickup).call({ body: { ref }, timeout }),
      },
      notifications: async (query?: ConnectFeedQuery) => await context
        .entrypoint(connectRef.account.notifications).call({ query: feedQueryOf(query), timeout: feedTimeout(query) }),
    },

    story: {
      status: async (id: string, storyId: string): Promise<ConnectStoryStatus> => await context
        .entrypoint(connectRef.story.status).call({ params: { id, storyId }, timeout }),
    },

    planning: planningContextOf(context).facade({}),

    files: {
      list: async (id: string) => await context.entrypoint(connectRef.files.list).call({
        params: { id }, timeout,
      }),
      get: async (id: string, path: string): Promise<ConnectFileContent> => await context
        .entrypoint(connectRef.files.get).call({ params: { id }, query: { path }, timeout }),
      save: async (id: string, path: string, content: string): Promise<ConnectFileWritten> => await context
        .entrypoint(connectRef.files.save).call({ params: { id }, body: { path, content }, timeout }),
      remove: async (id: string, path: string): Promise<ConnectFileWritten> => await context
        .entrypoint(connectRef.files.remove).call({ params: { id }, query: { path }, timeout }),
      // Only the category the caller named crosses the wire: the query is a closed shape.
      meta: async (id: string, query: ConnectFileMetaQuery): Promise<string[]> => await context
        .entrypoint(connectRef.files.meta).call({
          params: { id },
          query: { kind: query.kind, ...(query.category != null ? { category: query.category } : {}) },
          timeout,
        }),
      changes: async (id: string, query?: ConnectFeedQuery) => await context
        .entrypoint(connectRef.files.changes).call({ params: { id }, query: feedQueryOf(query), timeout: feedTimeout(query) }),
    },

    sandbox: {
      run: async (id: string): Promise<ConnectSlotView> => await context
        .entrypoint(connectRef.sandbox.run).call({ params: { id }, timeout }),
      restart: async (id: string): Promise<ConnectSlotView> => await context
        .entrypoint(connectRef.sandbox.restart).call({ params: { id }, timeout }),
      stop: async (id: string): Promise<ConnectSlotView> => await context
        .entrypoint(connectRef.sandbox.stop).call({ params: { id }, timeout }),
      rebuild: async (id: string): Promise<ConnectSlotView> => await context
        .entrypoint(connectRef.sandbox.rebuild).call({ params: { id }, timeout }),
    },

    slot: {
      list: async (): Promise<ConnectSlotView[]> => await context.entrypoint(connectRef.slot.list).call({ timeout }),
    },

    git: {
      status: async (id: string) => await context.entrypoint(connectRef.git.status).call({ params: { id }, timeout }),
      log: async (id: string) => await context.entrypoint(connectRef.git.log).call({ params: { id }, timeout }),
      commit: async (id: string, message: string) => await context
        .entrypoint(connectRef.git.commit).call({ params: { id }, body: { message }, timeout }),
      discard: async (id: string) => await context.entrypoint(connectRef.git.discard).call({ params: { id }, timeout }),
      revert: async (id: string, hash: string) => await context
        .entrypoint(connectRef.git.revert).call({ params: { id }, body: { hash }, timeout }),
    },

    github: {
      authorize: async (id: string) => await context
        .entrypoint(connectRef.github.authorize).call({ params: { id }, timeout }),
      publish: async (id: string, body) => await context
        .entrypoint(connectRef.github.publish).call({ params: { id }, body, timeout }),
      push: async (id: string) => await context.entrypoint(connectRef.github.push).call({ params: { id }, timeout }),
      pull: async (id: string) => await context.entrypoint(connectRef.github.pull).call({ params: { id }, timeout }),
      disconnect: async (id: string) => await context
        .entrypoint(connectRef.github.disconnect).call({ params: { id }, timeout }),
      // Only the fields named cross the wire: the queries are closed shapes.
      repos: async (id: string, query) => await context.entrypoint(connectRef.github.repos).call({
        params: { id },
        query: {
          ...(query?.page != null ? { page: query.page } : {}),
          ...(query?.search != null ? { search: query.search } : {}),
        },
        timeout,
      }),
      branches: async (id: string, query) => await context.entrypoint(connectRef.github.branches).call({
        params: { id },
        query: { owner: query.owner, repo: query.repo, ...(query.page != null ? { page: query.page } : {}) },
        timeout,
      }),
      link: async (id: string, body) => await context
        .entrypoint(connectRef.github.link).call({ params: { id }, body, timeout }),
    },

    production: {
      status: async (id: string) => await context.entrypoint(connectRef.production.status).call({ params: { id }, timeout }),
      publish: async (id: string) => await context.entrypoint(connectRef.production.publish).call({ params: { id }, timeout }),
      restart: async (id: string) => await context.entrypoint(connectRef.production.restart).call({ params: { id }, timeout }),
      stop: async (id: string) => await context.entrypoint(connectRef.production.stop).call({ params: { id }, timeout }),
      domain: {
        attach: async (id: string, domain: string) => await context
          .entrypoint(connectRef.production.domain.attach).call({ params: { id }, body: { domain }, timeout }),
        verify: async (id: string) => await context
          .entrypoint(connectRef.production.domain.verify).call({ params: { id }, timeout }),
        detach: async (id: string) => await context
          .entrypoint(connectRef.production.domain.detach).call({ params: { id }, timeout }),
      },
      auth: async (id: string) => await context.entrypoint(connectRef.production.auth.get).call({ params: { id }, timeout }),
      setRedirects: async (id: string, redirects: string[]) => await context
        .entrypoint(connectRef.production.auth.redirects).call({ params: { id }, body: { redirects }, timeout }),
    },

    // The generated app's sign-in. A read's scope rides in the query, a write's in its body.
    iam: {
      organizationUsers: async () => await context.entrypoint(connectRef.account.iam.users).call({ timeout }),
      permissions: async (id: string, scope) => await context
        .entrypoint(connectRef.iam.permissions).call({ params: { id }, query: scopeOf(scope), timeout }),
      setDefault: async (id: string, body) => await context
        .entrypoint(connectRef.iam.defaultUpdate).call({ params: { id }, body, timeout }),
      grants: {
        list: async (id: string, query) => await context
          .entrypoint(connectRef.iam.grants.list).call({ params: { id }, query: query ?? {}, timeout }),
        assign: async (id: string, body) => await context
          .entrypoint(connectRef.iam.grants.assign).call({ params: { id }, body, timeout }),
        revoke: async (id: string, body) => {
          await context.entrypoint(connectRef.iam.grants.revoke).call({ params: { id }, body, timeout })
        },
      },
      users: {
        list: async (id: string, scope) => await context
          .entrypoint(connectRef.iam.users.list).call({ params: { id }, query: scopeOf(scope), timeout }),
        invite: async (id: string, body) => await context
          .entrypoint(connectRef.iam.users.invite).call({ params: { id }, body, timeout }),
        update: async (id: string, profileId: string, body) => await context
          .entrypoint(connectRef.iam.users.update).call({ params: { id, profileId }, body, timeout }),
        remove: async (id: string, profileId: string, scope) => {
          await context.entrypoint(connectRef.iam.users.remove).call({ params: { id, profileId }, body: scopeOf(scope), timeout })
        },
      },
      organizations: {
        list: async (id: string, scope) => await context
          .entrypoint(connectRef.iam.organizations.list).call({ params: { id }, query: scopeOf(scope), timeout }),
        update: async (id: string, entitySlug: string, body) => await context
          .entrypoint(connectRef.iam.organizations.update).call({ params: { id, entitySlug }, body, timeout }),
        members: async (id: string, entitySlug: string, scope) => await context
          .entrypoint(connectRef.iam.organizations.members).call({ params: { id, entitySlug }, query: scopeOf(scope), timeout }),
        addMember: async (id: string, entitySlug: string, body) => await context
          .entrypoint(connectRef.iam.organizations.addMember).call({ params: { id, entitySlug }, body, timeout }),
        updateMember: async (id: string, entitySlug: string, profileId: string, body) => await context
          .entrypoint(connectRef.iam.organizations.updateMember).call({ params: { id, entitySlug, profileId }, body, timeout }),
        removeMember: async (id: string, entitySlug: string, profileId: string, scope) => {
          await context.entrypoint(connectRef.iam.organizations.removeMember)
            .call({ params: { id, entitySlug, profileId }, body: scopeOf(scope), timeout })
        },
      },
      groups: {
        list: async (id: string, entitySlug: string, scope) => await context
          .entrypoint(connectRef.iam.groups.list).call({ params: { id, entitySlug }, query: scopeOf(scope), timeout }),
        ensure: async (id: string, entitySlug: string, body) => await context
          .entrypoint(connectRef.iam.groups.ensure).call({ params: { id, entitySlug }, body, timeout }),
        update: async (id: string, entitySlug: string, group: string, body) => await context
          .entrypoint(connectRef.iam.groups.update).call({ params: { id, entitySlug, group }, body, timeout }),
        remove: async (id: string, entitySlug: string, group: string, scope) => {
          await context.entrypoint(connectRef.iam.groups.remove)
            .call({ params: { id, entitySlug, group }, body: scopeOf(scope), timeout })
        },
        members: async (id: string, entitySlug: string, group: string, scope) => await context
          .entrypoint(connectRef.iam.groups.members).call({ params: { id, entitySlug, group }, query: scopeOf(scope), timeout }),
        addMembers: async (id: string, entitySlug: string, group: string, profileIds: string[], scope) => {
          await context.entrypoint(connectRef.iam.groups.addMembers)
            .call({ params: { id, entitySlug, group }, body: { profileIds, ...scopeOf(scope) }, timeout })
        },
        removeMembers: async (id: string, entitySlug: string, group: string, profileIds: string[], scope) => {
          await context.entrypoint(connectRef.iam.groups.removeMembers)
            .call({ params: { id, entitySlug, group }, body: { profileIds, ...scopeOf(scope) }, timeout })
        },
      },
    },

    pipeline: {
      state: async (id: string, runId: string): Promise<ConnectPipelineState> => await context
        .entrypoint(connectRef.pipeline.state).call({ params: { id, runId }, timeout }),
      resume: async (id: string, runId: string, args) =>
        await context.entrypoint(connectRef.pipeline.resume).call({
          params: { id, runId }, body: args ?? {}, timeout,
        }),
    },

    convert: {
      create: async (args: ConnectConvertCreateBody) =>
        await context.entrypoint(connectRef.convert.create).call({
          body: args, timeout,
        }),
      check: async (id: string): Promise<ConvertCheck> => await context
        .entrypoint(connectRef.convert.check).call({ params: { id }, timeout }),
      start: async (id: string, body?: ConnectConvertStartBody): Promise<ConversionStatusView> => await context
        .entrypoint(connectRef.convert.start).call({ params: { id }, body: body ?? {}, timeout }),
      proceed: async (id: string, body: ConnectConvertProceedBody) =>
        await context.entrypoint(connectRef.convert.proceed).call({
          params: { id }, body, timeout,
        }),
      status: async (id: string): Promise<ConversionStatusView> => await context
        .entrypoint(connectRef.convert.status).call({ params: { id }, timeout }),
      purge: async (id: string): Promise<ConversionStatusView> => await context
        .entrypoint(connectRef.convert.purge).call({ params: { id }, timeout }),
    },

    inquiry: {
      answer: async (id: string, inquiryId: string, answer: InquiryAnswerPayload) =>
        // The id travels twice on purpose: in the path, which is what the route addresses, and in
        // the body, which is what the platform validates the answer against.
        await context.entrypoint(connectRef.inquiry.answer).call({
          params: { id, inquiryId }, body: { ...answer, inquiryId }, timeout,
        }),
    },
  }
}
